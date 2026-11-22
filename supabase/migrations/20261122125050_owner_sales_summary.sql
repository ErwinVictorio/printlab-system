create function public.owner_sales_summary()
returns table (total_orders bigint, approved_orders bigint, pending_orders bigint, sales_centavos numeric)
language sql stable security invoker set search_path = ''
as $$
  select count(*),
    count(*) filter (where status = 'approved'),
    count(*) filter (where status = 'pending_verification'),
    coalesce(sum(total_centavos) filter (where status = 'approved'), 0)
  from public.purchase_orders
  where status <> 'awaiting_payment'
  having (select auth.jwt()->'app_metadata'->>'role') = 'super_admin';
$$;

revoke execute on function public.owner_sales_summary() from public, anon, authenticated;
grant execute on function public.owner_sales_summary() to authenticated;
