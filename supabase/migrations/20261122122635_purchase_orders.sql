create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id),
  checkout_key uuid not null,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','pending_verification','approved','rejected')),
  total_centavos bigint not null check (total_centavos > 0),
  payment_type text not null,
  recipient text not null,
  qr_path text not null,
  reference_number text unique,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  unique (buyer_id, checkout_key)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.purchase_orders(id),
  original_id uuid not null references public.upload_intents(id),
  file_name text not null,
  event_title text not null,
  price_centavos integer not null check (price_centavos > 0),
  unique (order_id, original_id)
);

create index purchase_orders_buyer_created_idx on public.purchase_orders (buyer_id, created_at desc);
create index purchase_orders_status_submitted_idx on public.purchase_orders (status, submitted_at desc);
create index purchase_items_original_idx on public.purchase_items (original_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_items enable row level security;
revoke all on public.purchase_orders, public.purchase_items from public, anon, authenticated, service_role;
grant select on public.purchase_orders, public.purchase_items to authenticated;
grant select, insert on public.purchase_orders, public.purchase_items to service_role;
grant update (status, reference_number, submitted_at, reviewed_at, reviewed_by) on public.purchase_orders to service_role;
grant select on public.merchant_qr to service_role;

create policy buyer_or_owner_order_read on public.purchase_orders for select to authenticated
using (buyer_id = (select auth.uid()) or (select auth.jwt()->'app_metadata'->>'role') = 'super_admin');
create policy buyer_or_owner_items_read on public.purchase_items for select to authenticated
using (exists (select 1 from public.purchase_orders where id = order_id));
create policy buyer_order_qr_read on storage.objects for select to authenticated
using (
  bucket_id = 'merchant-qr' and exists (
    select 1 from public.purchase_orders q where q.qr_path = name
      and q.buyer_id = (select auth.uid()) and q.status = 'awaiting_payment'
  )
);

create function public.open_purchase(buyer uuid, request_key uuid, originals uuid[], expected_total bigint)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  purchase_id uuid;
  selected_items jsonb;
  selected_total bigint;
  qr public.merchant_qr%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(buyer::text, 1));
  select id into purchase_id from public.purchase_orders where buyer_id = buyer and checkout_key = request_key;
  if found then return purchase_id; end if;

  if coalesce(cardinality(originals), 0) not between 1 and 30 then
    raise exception using errcode = '22023', message = 'Select 1 to 30 live items.';
  end if;

  select jsonb_agg(to_jsonb(item)), sum(item.price_centavos)
  into selected_items, selected_total
  from (
    select o.id as original_id, o.file_name, o.price_centavos, e.title as event_title
    from public.events e
    join public.upload_intents o on o.event_id = e.id
    join public.upload_intents p on p.preview_of = o.id and p.event_id = e.id
    where o.id = any(originals) and o.preview_of is null and o.confirmed_at is not null
      and o.price_centavos > 0 and p.confirmed_at is not null
      and e.status = 'published' and e.deletion_requested_at is null
    order by e.id, o.id
    for share of e, o, p
  ) item;
  if coalesce(jsonb_array_length(selected_items),0) <> cardinality(originals) then
    raise exception using errcode = '22023', message = 'Some items are unavailable. Open the event gallery and add them again.';
  end if;
  if selected_total is distinct from expected_total then
    raise exception using errcode = '22023', message = 'A price changed. Open the event gallery and add the items again.';
  end if;

  select * into qr from public.merchant_qr where id = true;
  if not found then raise exception using errcode = '22023', message = 'The store has not set up a payment QR yet.'; end if;

  insert into public.purchase_orders (buyer_id, checkout_key, total_centavos, payment_type, recipient, qr_path)
    values (buyer, request_key, selected_total, qr.payment_type, qr.recipient, qr.image_path) returning id into purchase_id;
  insert into public.purchase_items (order_id, original_id, file_name, event_title, price_centavos)
    select purchase_id, i.original_id, i.file_name, i.event_title, i.price_centavos
    from jsonb_to_recordset(selected_items) i(original_id uuid, file_name text, event_title text, price_centavos integer);
  return purchase_id;
end;
$$;

revoke execute on function public.open_purchase(uuid,uuid,uuid[],bigint) from public, anon, authenticated;
grant execute on function public.open_purchase(uuid,uuid,uuid[],bigint) to service_role;

-- Keep existing purchase originals intact. The lock also serializes this check
-- with creating a new order for the same event.
create or replace function public.prepare_event_deletion(target_event uuid)
returns table (ready_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
begin
  perform 1 from public.events where id = target_event for update;
  if not found then return; end if;
  if exists (
    select 1 from public.purchase_items i join public.upload_intents u on u.id = i.original_id
    where u.event_id = target_event
  ) then
    raise exception using errcode = '22023', message = 'This event has purchase records. Unpublish it to keep buyer downloads available.';
  end if;

  update public.events set status = 'archived', deletion_requested_at = coalesce(deletion_requested_at, now())
  where id = target_event;
  return query select max(expires_at + interval '10 minutes') from public.upload_intents where event_id = target_event;
end;
$$;
