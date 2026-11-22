create schema if not exists printlab_private;
revoke all on schema printlab_private from public, anon, authenticated;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  entity_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from public, anon, authenticated;
grant select on public.audit_logs to authenticated;
create policy audit_admin_read on public.audit_logs for select to authenticated
using ((select auth.jwt()->'app_metadata'->>'role') = 'super_admin');

create function printlab_private.audit_photographer_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.jwt()->'app_metadata'->>'role' = 'super_admin' then
    insert into public.audit_logs (actor_id, action, entity_id, metadata)
    values (auth.uid(), 'Photographer status updated', new.user_id,
      jsonb_build_object('previous', old.approval_status, 'current', new.approval_status));
  end if;
  return new;
end;
$$;
revoke execute on function printlab_private.audit_photographer_review() from public, anon, authenticated;

create trigger audit_photographer_review
after update of approval_status on public.photographer_profiles
for each row when (old.approval_status is distinct from new.approval_status)
execute function printlab_private.audit_photographer_review();
