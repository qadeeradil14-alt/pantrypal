-- Removes the leftover canonicalization guard from the abandoned canonical/replica
-- sync architecture. The app was reverted to the watermark-model sync engine, which
-- never writes state.syncMeta.schema = '1'. Existing rows already tagged schema='1'
-- from the abandoned migration therefore permanently rejected every subsequent
-- UPDATE via the trigger's "legacy household snapshot writes are disabled after
-- canonicalization" branch, blocking all cross-device shopping sync.
drop trigger if exists protect_canonical_household_snapshot on public.household_snapshots;
drop function if exists public.protect_canonical_household_snapshot();
