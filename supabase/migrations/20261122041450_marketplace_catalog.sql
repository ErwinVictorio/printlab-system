create table public.photographer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  bio text not null default '' check (char_length(bio) <= 2000),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.event_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

insert into public.event_categories (slug, name) values
  ('photobooth', 'Photobooth'), ('photoman', 'Photoman'), ('fun-run', 'Fun Run');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.photographer_profiles(user_id),
  category_id uuid not null references public.event_categories(id),
  slug text not null unique check (char_length(slug) <= 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 150),
  event_date date not null,
  location text not null default '',
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);

create table public.event_photographers (
  event_id uuid not null references public.events(id) on delete cascade,
  photographer_id uuid not null references public.photographer_profiles(user_id) on delete cascade,
  primary key (event_id, photographer_id)
);

create index events_owner_id_idx on public.events (owner_id);
create index events_category_id_idx on public.events (category_id);
create index events_published_date_idx on public.events (event_date desc) where status = 'published';
create index event_photographers_photographer_id_idx on public.event_photographers (photographer_id);

alter table public.photographer_profiles enable row level security;
alter table public.event_categories enable row level security;
alter table public.events enable row level security;
alter table public.event_photographers enable row level security;

revoke all on public.photographer_profiles, public.event_categories, public.events, public.event_photographers from public, anon, authenticated;
grant select on public.event_categories, public.events to anon, authenticated;
grant select on public.photographer_profiles, public.event_photographers to authenticated;
grant insert (user_id, display_name, bio), update (display_name, bio, approval_status) on public.photographer_profiles to authenticated;
grant insert (owner_id, category_id, slug, title, event_date, location, description),
  update (category_id, slug, title, event_date, location, description) on public.events to authenticated;
grant insert, delete on public.event_photographers to authenticated;

create policy photographer_profile_read on public.photographer_profiles for select to authenticated
using (user_id = (select auth.uid()) or (select auth.jwt()->'app_metadata'->>'role') = 'super_admin');
create policy photographer_apply on public.photographer_profiles for insert to authenticated
with check (user_id = (select auth.uid()) and approval_status = 'pending');
create policy administrator_review on public.photographer_profiles for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');

create policy categories_read on public.event_categories for select to anon, authenticated using (true);
create policy public_events_read on public.events for select to anon, authenticated using (status = 'published');
create policy membership_read on public.event_photographers for select to authenticated
using (photographer_id = (select auth.uid()) or (select auth.jwt()->'app_metadata'->>'role') = 'super_admin');
create policy membership_manage on public.event_photographers for all to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');
create policy staff_events_read on public.events for select to authenticated
using (
  (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    exists (
      select 1 from public.photographer_profiles
      where user_id = (select auth.uid()) and approval_status = 'approved'
    )
    and (
      owner_id = (select auth.uid())
      or id in (
        select event_id from public.event_photographers where photographer_id = (select auth.uid())
      )
    )
  )
);
create policy photographer_event_create on public.events for insert to authenticated
with check (
  status = 'draft' and owner_id = (select auth.uid())
  and exists (
    select 1 from public.photographer_profiles
    where user_id = (select auth.uid()) and approval_status = 'approved'
  )
);
create policy owner_event_edit on public.events for update to authenticated
using (
  (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    owner_id = (select auth.uid()) and status = 'draft'
    and exists (
      select 1 from public.photographer_profiles
      where user_id = (select auth.uid()) and approval_status = 'approved'
    )
  )
);
