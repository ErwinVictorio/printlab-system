drop policy staff_events_read on public.events;
create policy owner_private_events_read on public.events for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');
