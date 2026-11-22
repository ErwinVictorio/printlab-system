create table public.upload_intents (
  id uuid primary key,
  user_id uuid not null references public.photographer_profiles(user_id),
  event_id uuid not null references public.events(id),
  object_key text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4')),
  size_bytes integer not null check (
    size_bytes > 0 and size_bytes <= case when mime_type = 'video/mp4' then 104857600 else 26214400 end
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  confirmed_at timestamptz
);

create index upload_intents_user_created_idx on public.upload_intents (user_id, created_at desc);
create index upload_intents_event_idx on public.upload_intents (event_id);
alter table public.upload_intents enable row level security;
revoke all on public.upload_intents from public, anon, authenticated, service_role;
grant select (id, user_id, event_id, file_name, mime_type, size_bytes, created_at, confirmed_at)
  on public.upload_intents to authenticated;
grant select, insert, update (confirmed_at) on public.upload_intents to service_role;

create policy upload_history_read on public.upload_intents for select to authenticated
using (
  (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  or (
    user_id = (select auth.uid()) and confirmed_at is not null
    and exists (
      select 1 from public.photographer_profiles
      where user_id = (select auth.uid()) and approval_status = 'approved'
    )
  )
);

create function public.reserve_r2_upload(
  upload_id uuid, uploader uuid, target_event uuid, storage_key text,
  original_name text, content_type text, content_size integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uploader::text, 0));

  if not exists (
    select 1 from public.photographer_profiles p
    join public.events e on e.id = target_event
    where p.user_id = uploader and p.approval_status = 'approved' and e.status <> 'archived'
      and (e.owner_id = uploader or exists (
        select 1 from public.event_photographers m
        where m.event_id = target_event and m.photographer_id = uploader
      ))
  ) then
    raise insufficient_privilege using message = 'Upload access is unavailable for this event';
  end if;

  if (select count(*) from public.upload_intents
      where user_id = uploader and created_at > now() - interval '1 hour') >= 60 then
    raise exception using errcode = 'P0001', message = 'Hourly upload limit reached';
  end if;

  insert into public.upload_intents (id, user_id, event_id, object_key, file_name, mime_type, size_bytes, expires_at)
  values (upload_id, uploader, target_event, storage_key, original_name, content_type, content_size, now() + interval '5 minutes');
end;
$$;

revoke execute on function public.reserve_r2_upload(uuid, uuid, uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_r2_upload(uuid, uuid, uuid, text, text, text, integer) to service_role;
grant select on public.photographer_profiles, public.events, public.event_photographers to service_role;
