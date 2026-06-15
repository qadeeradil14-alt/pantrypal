create table if not exists public.household_snapshots (
  household_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0
);

alter table public.household_snapshots enable row level security;
drop policy if exists "household snapshot owner access" on public.household_snapshots;
create policy "household snapshot owner access"
on public.household_snapshots
for all
to authenticated
using (household_id = auth.uid())
with check (household_id = auth.uid());

do $$
begin
  alter publication supabase_realtime add table public.household_snapshots;
exception when duplicate_object then null;
end $$;

drop policy if exists "Enable public read/write access for prototype" on public.pantry_items;
drop policy if exists "pantry_items_own" on public.pantry_items;
alter table if exists public.pantry_items enable row level security;
drop policy if exists "pantry item owner access" on public.pantry_items;
create policy "pantry item owner access"
on public.pantry_items for all to authenticated
using (household_id = auth.uid())
with check (household_id = auth.uid());

alter table if exists public.pantry_stores enable row level security;
drop policy if exists "pantry_stores_own" on public.pantry_stores;
drop policy if exists "pantry store owner access" on public.pantry_stores;
create policy "pantry store owner access"
on public.pantry_stores for all to authenticated
using (household_id = auth.uid())
with check (household_id = auth.uid());

drop policy if exists "Enable public read/write access for prototype" on public.receipts;
drop policy if exists "receipts_own_household" on public.receipts;
alter table if exists public.receipts enable row level security;
drop policy if exists "receipt owner access" on public.receipts;
create policy "receipt owner access"
on public.receipts for all to authenticated
using (household_id = auth.uid())
with check (household_id = auth.uid());

alter table if exists public.pantry_receipts enable row level security;
drop policy if exists "pantry_receipts_own" on public.pantry_receipts;
drop policy if exists "pantry receipt owner access" on public.pantry_receipts;
create policy "pantry receipt owner access"
on public.pantry_receipts for all to authenticated
using (household_id = auth.uid())
with check (household_id = auth.uid());

update storage.buckets set public = false where id = 'receipts';
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Public Insert" on storage.objects;
drop policy if exists "receipt image owner access" on storage.objects;
create policy "receipt image owner access"
on storage.objects for all to authenticated
using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
