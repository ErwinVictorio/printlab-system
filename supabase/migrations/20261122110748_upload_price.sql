alter table public.upload_intents
  add column price_centavos integer check (price_centavos between 1 and 99999999);

grant select (price_centavos) on public.upload_intents to authenticated;

drop function public.reserve_r2_upload(uuid, uuid, uuid, text, text, text, integer);
create function public.reserve_r2_upload(
  upload_id uuid, uploader uuid, target_event uuid, storage_key text,
  original_name text, content_type text, content_size integer, price integer default null
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

  insert into public.upload_intents (id, user_id, event_id, object_key, file_name, mime_type, size_bytes, expires_at, price_centavos)
  values (upload_id, uploader, target_event, storage_key, original_name, content_type, content_size, now() + interval '5 minutes', price);
end;
$$;

revoke execute on function public.reserve_r2_upload(uuid, uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_r2_upload(uuid, uuid, uuid, text, text, text, integer, integer) to service_role;

