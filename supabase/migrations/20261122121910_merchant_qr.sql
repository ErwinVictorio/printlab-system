insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-qr', 'merchant-qr', false, 2097152, array['image/png','image/jpeg']);

create table public.merchant_qr (
  id boolean primary key default true check (id),
  payment_type text not null check (payment_type in ('QR Ph','GCash','Maya','Bank QR')),
  recipient text not null check (char_length(btrim(recipient)) between 1 and 100),
  image_path text not null check (image_path ~ '^qr/[0-9a-f-]{36}\.(png|jpg)$')
);

alter table public.merchant_qr enable row level security;
revoke all on public.merchant_qr from public, anon, authenticated;
grant select on public.merchant_qr to anon, authenticated;
grant insert, update on public.merchant_qr to authenticated;
create policy merchant_qr_read on public.merchant_qr for select to anon, authenticated using (true);
create policy merchant_qr_owner_insert on public.merchant_qr for insert to authenticated
with check ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');
create policy merchant_qr_owner_update on public.merchant_qr for update to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin')
with check ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');

create policy merchant_qr_object_read on storage.objects for select to anon, authenticated
using (
  bucket_id = 'merchant-qr' and (
    (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
    or name in (select image_path from public.merchant_qr)
  )
);
create policy merchant_qr_object_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'merchant-qr' and name ~ '^qr/[0-9a-f-]{36}\.(png|jpg)$'
  and (select auth.jwt()->'app_metadata'->>'role') = 'super_admin'
);
