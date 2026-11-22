-- Event visibility uses the existing published-only public RLS policy.
grant update (status) on public.events to authenticated;
