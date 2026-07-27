create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.can_update_household_snapshot_as_member(uuid, jsonb)
set schema private;

revoke all
on function private.can_update_household_snapshot_as_member(uuid, jsonb)
from public, anon;

grant execute
on function private.can_update_household_snapshot_as_member(uuid, jsonb)
to authenticated;

drop policy if exists "household snapshot member update" on public.household_snapshots;
create policy "household snapshot member update"
on public.household_snapshots
for update
to authenticated
using (public.is_household_member(household_id))
with check (
  public.is_household_owner(household_id)
  or private.can_update_household_snapshot_as_member(household_id, state)
);
