alter table public.events add column deletion_requested_at timestamptz;
grant update (status, deletion_requested_at), delete on public.events to service_role;
alter table public.upload_intents add column object_deleted_at timestamptz;
grant update (object_deleted_at), delete on public.upload_intents to service_role;

drop policy owner_event_edit on public.events;
create policy owner_event_edit on public.events for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin' and deletion_requested_at is null)
with check ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin' and deletion_requested_at is null);

create function public.prepare_event_deletion(target_event uuid)
returns table (ready_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.events
  set status = 'archived', deletion_requested_at = coalesce(deletion_requested_at, now())
  where id = target_event;
  if not found then return; end if;

  return query select max(expires_at + interval '10 minutes')
    from public.upload_intents where event_id = target_event;
end;
$$;

create function public.finish_event_deletion(target_event uuid)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  perform 1 from public.events
    where id = target_event and status = 'archived' and deletion_requested_at is not null
    for update;
  if not found then return; end if;

  if exists (select 1 from public.upload_intents where event_id = target_event and object_deleted_at is null) then
    raise exception 'R2 cleanup is incomplete';
  end if;

  delete from public.upload_intents where event_id = target_event;
  delete from public.events where id = target_event;
end;
$$;

revoke execute on function public.prepare_event_deletion(uuid), public.finish_event_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_event_deletion(uuid), public.finish_event_deletion(uuid) to service_role;

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

  perform 1 from public.events where id = target_event and status <> 'archived' for share;
  if not found then
    raise insufficient_privilege using message = 'Upload access is unavailable for this event';
  end if;

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



