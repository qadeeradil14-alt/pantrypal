drop policy if exists "emergency_freeze_replica_writes_3005e8c2" on public.household_sync_replicas;

create policy "emergency_freeze_replica_writes_3005e8c2"
on public.household_sync_replicas
as restrictive
for all
to authenticated
using (household_id <> '3005e8c2-3c1b-4e78-9043-89d6acf98830'::uuid)
with check (household_id <> '3005e8c2-3c1b-4e78-9043-89d6acf98830'::uuid);
