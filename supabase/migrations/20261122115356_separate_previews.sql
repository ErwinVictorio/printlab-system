alter table public.upload_intents
  add column preview_of uuid references public.upload_intents(id),
  add constraint preview_metadata check (
    preview_of is null or (price_centavos is null and object_key like 'events/%/previews/%')
  );

create index upload_intents_preview_ref_idx on public.upload_intents (preview_of) where preview_of is not null;
create unique index upload_intents_one_verified_preview
  on public.upload_intents (preview_of) where preview_of is not null and confirmed_at is not null;
grant select (preview_of) on public.upload_intents to authenticated;
grant update (preview_of) on public.upload_intents to service_role;

create function public.reserve_r2_preview(
  upload_id uuid, uploader uuid, target_event uuid, storage_key text,
  original_name text, content_type text, content_size integer, original_id uuid
)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.upload_intents
    where id = original_id and event_id = target_event and preview_of is null
      and confirmed_at is not null and split_part(mime_type, '/', 1) = split_part(content_type, '/', 1)
  ) then
    raise insufficient_privilege using message = 'A verified original of the same media type is required';
  end if;

  perform public.reserve_r2_upload(upload_id, uploader, target_event, storage_key,
    original_name, content_type, content_size, null);
  update public.upload_intents set preview_of = original_id where id = upload_id;
end;
$$;

revoke execute on function public.reserve_r2_preview(uuid, uuid, uuid, text, text, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.reserve_r2_preview(uuid, uuid, uuid, text, text, text, integer, uuid) to service_role;
