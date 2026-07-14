create table if not exists public.household_sync_replicas (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  replica_id text not null check (replica_id ~ '^[A-Za-z0-9._:-]{8,128}$'),
  state jsonb not null check (octet_length(state::text) <= 5242880),
  client_clock bigint not null default 0 check (client_clock >= 0),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id, replica_id)
);

create index if not exists household_sync_replicas_household_updated
  on public.household_sync_replicas (household_id, updated_at desc);

alter table public.household_sync_replicas enable row level security;

drop policy if exists "household_sync_replicas_household_select" on public.household_sync_replicas;
create policy "household_sync_replicas_household_select"
  on public.household_sync_replicas
  for select
  to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "household_sync_replicas_own_insert" on public.household_sync_replicas;
create policy "household_sync_replicas_own_insert"
  on public.household_sync_replicas
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_household_member(household_id)
  );

drop policy if exists "household_sync_replicas_own_update" on public.household_sync_replicas;
create policy "household_sync_replicas_own_update"
  on public.household_sync_replicas
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_household_member(household_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.is_household_member(household_id)
  );

drop policy if exists "household_sync_replicas_own_delete" on public.household_sync_replicas;
create policy "household_sync_replicas_own_delete"
  on public.household_sync_replicas
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and public.is_household_member(household_id)
  );

grant select, insert, update, delete on public.household_sync_replicas to authenticated;

drop trigger if exists household_sync_replicas_updated_at on public.household_sync_replicas;
create trigger household_sync_replicas_updated_at
  before update on public.household_sync_replicas
  for each row execute function public.update_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'household_sync_replicas'
  ) then
    alter publication supabase_realtime add table public.household_sync_replicas;
  end if;
end;
$$;
