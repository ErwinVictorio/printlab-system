insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', false, 5242880, array['image/jpeg','image/png','image/webp']);

alter table public.events add column cover_path text
  check (cover_path is null or cover_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
grant update (cover_path) on public.events to authenticated;

create policy event_cover_read on storage.objects for select to anon, authenticated
using (
  bucket_id = 'event-covers' and (
    (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
    or exists (select 1 from public.events e where e.cover_path = name and e.status = 'published')
  )
);

create policy event_cover_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-covers'
  and (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists (
    select 1 from public.events e
    where e.id::text = split_part(name, '/', 1) and e.status <> 'archived'
  )
);

create policy event_cover_delete_unused on storage.objects for delete to authenticated
using (
  bucket_id = 'event-covers'
  and (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
  and not exists (select 1 from public.events e where e.cover_path = name)
);
