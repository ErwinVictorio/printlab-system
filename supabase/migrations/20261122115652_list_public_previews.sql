create function public.list_r2_previews(event_slug text, page_offset integer)
returns table (event_id uuid, original_id uuid, file_name text, price_centavos integer, preview_key text, mime_type text)
language sql stable security invoker set search_path = ''
as $$
  select e.id, o.id, o.file_name, o.price_centavos, p.object_key, p.mime_type
  from public.events e
  join public.upload_intents p on p.event_id = e.id
  join public.upload_intents o on o.id = p.preview_of and o.event_id = e.id
  where e.slug = event_slug and e.status = 'published'
    and p.confirmed_at is not null and o.confirmed_at is not null
    and o.preview_of is null and o.price_centavos > 0
    and starts_with(p.object_key, 'events/' || e.id || '/previews/')
  order by p.id
  limit 24 offset greatest(page_offset, 0);
$$;
revoke execute on function public.list_r2_previews(text, integer) from public, anon, authenticated;
grant execute on function public.list_r2_previews(text, integer) to service_role;
