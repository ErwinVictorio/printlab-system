insert into public.photographer_profiles (user_id, display_name, approval_status)
select id, 'JR PRINTLAB Owner', 'approved' from auth.users
where raw_app_meta_data->>'role' = 'super_admin'
on conflict (user_id) do nothing;

drop policy photographer_apply on public.photographer_profiles;
drop policy photographer_event_create on public.events;
create policy owner_event_create on public.events for insert to authenticated
with check (
  owner_id = (select auth.uid()) and status = 'draft'
  and (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
);

drop policy owner_event_edit on public.events;
create policy owner_event_edit on public.events for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');

drop policy upload_history_read on public.upload_intents;
create policy upload_history_read on public.upload_intents for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');

grant usage on schema printlab_private to service_role;
create or replace function printlab_private.reserve_r2_upload(
  upload_id uuid, uploader uuid, target_event uuid, storage_key text,
  original_name text, content_type text, content_size integer, price integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uploader::text, 0));

  if not exists (
    select 1 from auth.users u
    join public.events e on e.id = target_event
    where u.id = uploader and u.raw_app_meta_data->>'role' = 'super_admin'
      and e.status <> 'archived'
  ) then
    raise insufficient_privilege using message = 'Upload access is unavailable for this event';
  end if;

  if (select count(*) from public.upload_intents
      where user_id = uploader and created_at > now() - interval '1 hour') >= 60 then
    raise exception using errcode = 'P0001', message = 'Hourly upload limit reached';
  end if;

  insert into public.upload_intents (id, user_id, event_id, object_key, file_name, mime_type, size_bytes, expires_at, price_centavos)
  values (upload_id, uploader, target_event, storage_key, original_name, content_type, content_size, now() + interval '5 minutes', price);
end;
$$;

revoke execute on function printlab_private.reserve_r2_upload(uuid, uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function printlab_private.reserve_r2_upload(uuid, uuid, uuid, text, text, text, integer, integer) to service_role;


create or replace function public.reserve_r2_upload(
  upload_id uuid, uploader uuid, target_event uuid, storage_key text,
  original_name text, content_type text, content_size integer, price integer default null
)
returns void language sql security invoker set search_path = ''
as $$
  select printlab_private.reserve_r2_upload(
    upload_id, uploader, target_event, storage_key, original_name, content_type, content_size, price
  );
$$;
