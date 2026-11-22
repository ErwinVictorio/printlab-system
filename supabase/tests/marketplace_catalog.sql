-- Run after all migrations against a development database.
begin;

insert into auth.users (id, raw_app_meta_data) values
  ('574bec4d-21ce-44f4-91eb-26fac5229ab9', '{}'),
  ('e90450ea-61aa-4253-b8d8-06fbc086a7d5', '{"role":"super_admin"}');

insert into public.photographer_profiles (user_id, display_name, approval_status) values
  ('574bec4d-21ce-44f4-91eb-26fac5229ab9', 'Former photographer', 'approved'),
  ('e90450ea-61aa-4253-b8d8-06fbc086a7d5', 'Owner', 'approved');

insert into public.events (owner_id, category_id, slug, title, event_date)
select '574bec4d-21ce-44f4-91eb-26fac5229ab9', id, 'rls-test-legacy', 'Legacy draft', current_date
from public.event_categories where slug = 'fun-run';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"574bec4d-21ce-44f4-91eb-26fac5229ab9"}', true);

do $$
begin
  if exists (select 1 from public.events where slug = 'rls-test-legacy') then
    raise exception 'A non-owner can read their legacy draft';
  end if;
  begin
    insert into public.events (owner_id, category_id, slug, title, event_date)
    select auth.uid(), id, 'rls-test-denied', 'Denied', current_date
    from public.event_categories where slug = 'fun-run';
    raise exception 'A non-owner created an event';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"e90450ea-61aa-4253-b8d8-06fbc086a7d5","app_metadata":{"role":"super_admin"}}', true);
insert into public.events (owner_id, category_id, slug, title, event_date)
select auth.uid(), id, 'rls-test-owner', 'Owner draft', current_date
from public.event_categories where slug = 'fun-run';

do $$
begin
  update public.events set title = 'Edited legacy draft' where slug = 'rls-test-legacy';
  if not found then raise exception 'Owner cannot edit a legacy draft'; end if;
end;
$$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  if exists (select 1 from public.events where slug in ('rls-test-legacy', 'rls-test-owner')) then
    raise exception 'An anonymous user can read a draft';
  end if;
  if (select count(*) from public.event_categories where slug in ('fun-run', 'photobooth', 'photoman')) <> 3 then
    raise exception 'An anonymous user cannot read the public categories';
  end if;
end;
$$;

rollback;
