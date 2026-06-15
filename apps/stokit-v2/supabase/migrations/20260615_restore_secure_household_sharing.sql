create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  is_personal boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Me',
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.households add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.households add column if not exists is_personal boolean not null default false;
alter table public.household_members add column if not exists display_name text not null default 'Me';

update public.households h set owner_id = coalesce(
  (select m.user_id from public.household_members m where m.household_id = h.id and m.role = 'owner' order by m.joined_at limit 1),
  (select m.user_id from public.household_members m where m.household_id = h.id order by m.joined_at limit 1)
) where owner_id is null;

alter table public.household_snapshots drop constraint if exists household_snapshots_household_id_fkey;

insert into public.households (id, name, invite_code, owner_id, is_personal)
select u.id, 'My Pantry', upper(substr(md5(random()::text || u.id::text), 1, 6)), u.id, true
from auth.users u
where exists (select 1 from public.household_snapshots s where s.household_id = u.id)
on conflict (id) do nothing;

insert into public.household_members (household_id, user_id, display_name, role)
select h.id, h.owner_id, 'Me', 'owner'
from public.households h
where h.owner_id is not null
on conflict (household_id, user_id) do nothing;

alter table public.household_snapshots
  add constraint household_snapshots_household_id_fkey
  foreign key (household_id) references public.households(id) on delete cascade;

create or replace function public.is_household_member(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(p_household_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.household_members
    where household_id = p_household_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.can_access_receipt_object(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.household_snapshots s
    cross join lateral jsonb_array_elements(coalesce(s.state->'receipts', '[]'::jsonb)) receipt
    where public.is_household_member(s.household_id)
      and receipt->>'imagePath' = p_name
  );
$$;

create or replace function public.generate_household_invite()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where invite_code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.merge_jsonb_array_by_id(p_target jsonb, p_source jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(value order by ord), '[]'::jsonb)
  from (
    select distinct on (value->>'id') value, ord
    from (
      select value, ordinality::bigint as ord, 1 as priority
      from jsonb_array_elements(coalesce(p_target, '[]'::jsonb)) with ordinality
      union all
      select value, 1000000 + ordinality::bigint as ord, 2 as priority
      from jsonb_array_elements(coalesce(p_source, '[]'::jsonb)) with ordinality
    ) all_values
    order by value->>'id', priority, ord
  ) unique_values;
$$;

create or replace function public.merge_household_states(p_target jsonb, p_source jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'items', public.merge_jsonb_array_by_id(p_target->'items', p_source->'items'),
    'stores', public.merge_jsonb_array_by_id(p_target->'stores', p_source->'stores'),
    'priceHistory', public.merge_jsonb_array_by_id(p_target->'priceHistory', p_source->'priceHistory'),
    'receipts', public.merge_jsonb_array_by_id(p_target->'receipts', p_source->'receipts'),
    'trips', public.merge_jsonb_array_by_id(p_target->'trips', p_source->'trips'),
    'activity', public.merge_jsonb_array_by_id(p_target->'activity', p_source->'activity'),
    'prefs', coalesce(p_target->'prefs', p_source->'prefs', '{}'::jsonb),
    'updatedAt', greatest(
      coalesce((p_target->>'updatedAt')::bigint, 0),
      coalesce((p_source->>'updatedAt')::bigint, 0)
    )
  );
$$;

create or replace function public.my_household()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'inviteCode', case when h.is_personal then null else h.invite_code end,
    'isPersonal', h.is_personal,
    'role', me.role,
    'createdAt', extract(epoch from h.created_at) * 1000,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.user_id,
        'displayName', m.display_name,
        'role', m.role,
        'joinedAt', extract(epoch from m.joined_at) * 1000
      ) order by m.joined_at)
      from public.household_members m where m.household_id = h.id
    ), '[]'::jsonb)
  )
  from public.household_members me
  join public.households h on h.id = me.household_id
  where me.user_id = auth.uid()
  order by h.is_personal, me.joined_at desc
  limit 1;
$$;

create or replace function public.ensure_personal_household(p_display_name text default 'Me')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  existing jsonb;
  new_id uuid;
begin
  select public.my_household() into existing;
  if existing is not null then return existing; end if;
  new_id := gen_random_uuid();
  insert into public.households (id, name, invite_code, owner_id, is_personal)
  values (new_id, 'My Pantry', public.generate_household_invite(), auth.uid(), true);
  insert into public.household_members (household_id, user_id, display_name, role)
  values (new_id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Me'), 'owner');
  return public.my_household();
end;
$$;

create or replace function public.create_shared_household(p_name text, p_display_name text default 'Me')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_id uuid;
begin
  perform public.ensure_personal_household(p_display_name);
  select household_id into current_id from public.household_members where user_id = auth.uid() order by joined_at desc limit 1;
  if not public.is_household_owner(current_id) then raise exception 'Only the household owner can change sharing'; end if;
  update public.households set
    name = coalesce(nullif(trim(p_name), ''), name),
    invite_code = coalesce(invite_code, public.generate_household_invite()),
    is_personal = false
  where id = current_id;
  update public.household_members set display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
  where user_id = auth.uid();
  return public.my_household();
end;
$$;

create or replace function public.join_household_by_code(p_invite_code text, p_display_name text default 'Me')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_id uuid;
  target_id uuid;
  source_state jsonb := '{}'::jsonb;
  target_state jsonb := '{}'::jsonb;
  merged_state jsonb;
begin
  select id into target_id from public.households
  where upper(regexp_replace(invite_code, '[^A-Za-z0-9]', '', 'g')) =
    upper(regexp_replace(p_invite_code, '[^A-Za-z0-9]', '', 'g'))
    and not is_personal;
  if target_id is null then raise exception 'Invalid invite code'; end if;

  perform public.ensure_personal_household(p_display_name);
  select household_id into current_id from public.household_members where user_id = auth.uid() order by joined_at desc limit 1;
  if current_id = target_id then return public.my_household(); end if;
  if exists (
    select 1 from public.household_members m join public.households h on h.id = m.household_id
    where m.user_id = auth.uid() and not h.is_personal
  ) then
    raise exception 'Leave your current shared household before joining another';
  end if;

  select state into source_state from public.household_snapshots where household_id = current_id;
  select state into target_state from public.household_snapshots where household_id = target_id for update;
  merged_state := public.merge_household_states(coalesce(target_state, '{}'::jsonb), coalesce(source_state, '{}'::jsonb));

  delete from public.household_members where user_id = auth.uid();
  insert into public.household_members (household_id, user_id, display_name, role)
  values (target_id, auth.uid(), coalesce(nullif(trim(p_display_name), ''), 'Me'), 'member');
  insert into public.household_snapshots (household_id, state, updated_at)
  values (target_id, merged_state, coalesce((merged_state->>'updatedAt')::bigint, 0))
  on conflict (household_id) do update set state = excluded.state, updated_at = excluded.updated_at;
  delete from public.households where id = current_id;
  return public.my_household();
end;
$$;

create or replace function public.leave_shared_household()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_id uuid;
  current_state jsonb;
  new_id uuid := gen_random_uuid();
  my_name text;
begin
  select m.household_id, m.display_name into current_id, my_name
  from public.household_members m join public.households h on h.id = m.household_id
  where m.user_id = auth.uid() and not h.is_personal
  order by m.joined_at desc limit 1;
  if current_id is null then return public.ensure_personal_household(my_name); end if;
  if public.is_household_owner(current_id) and
     (select count(*) from public.household_members where household_id = current_id) > 1 then
    raise exception 'The owner cannot leave while other members are present';
  end if;
  select state into current_state from public.household_snapshots where household_id = current_id;
  delete from public.household_members where user_id = auth.uid();
  insert into public.households (id, name, invite_code, owner_id, is_personal)
  values (new_id, 'My Pantry', public.generate_household_invite(), auth.uid(), true);
  insert into public.household_members (household_id, user_id, display_name, role)
  values (new_id, auth.uid(), coalesce(my_name, 'Me'), 'owner');
  if current_state is not null then
    insert into public.household_snapshots (household_id, state, updated_at)
    values (new_id, current_state, coalesce((current_state->>'updatedAt')::bigint, 0));
  end if;
  return public.my_household();
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_snapshots enable row level security;

drop policy if exists "household member read" on public.households;
drop policy if exists "households_delete" on public.households;
drop policy if exists "households_insert_authenticated" on public.households;
drop policy if exists "households_read_own_membership" on public.households;
drop policy if exists "households_select" on public.households;
drop policy if exists "households_update" on public.households;
drop policy if exists "households_update_owner_only" on public.households;
create policy "household member read" on public.households for select to authenticated
using (public.is_household_member(id));
drop policy if exists "household members read" on public.household_members;
drop policy if exists "members_own_rows" on public.household_members;
create policy "household members read" on public.household_members for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "household snapshot owner access" on public.household_snapshots;
drop policy if exists "household snapshot member access" on public.household_snapshots;
drop policy if exists "household snapshot member read" on public.household_snapshots;
drop policy if exists "household snapshot member insert" on public.household_snapshots;
drop policy if exists "household snapshot member update" on public.household_snapshots;
drop policy if exists "household snapshot owner delete" on public.household_snapshots;
create policy "household snapshot member read" on public.household_snapshots for select to authenticated
using (public.is_household_member(household_id));
create policy "household snapshot member insert" on public.household_snapshots for insert to authenticated
with check (public.is_household_member(household_id));
create policy "household snapshot member update" on public.household_snapshots for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));
create policy "household snapshot owner delete" on public.household_snapshots for delete to authenticated
using (public.is_household_owner(household_id));

drop policy if exists "pantry item owner access" on public.pantry_items;
drop policy if exists "pantry item household member access" on public.pantry_items;
create policy "pantry item household member access" on public.pantry_items for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "pantry store owner access" on public.pantry_stores;
drop policy if exists "pantry store household member access" on public.pantry_stores;
create policy "pantry store household member access" on public.pantry_stores for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "pantry receipt owner access" on public.pantry_receipts;
drop policy if exists "pantry receipt household member access" on public.pantry_receipts;
create policy "pantry receipt household member access" on public.pantry_receipts for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "receipt owner access" on public.receipts;
drop policy if exists "receipt household member access" on public.receipts;
create policy "receipt household member access" on public.receipts for all to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

drop policy if exists "receipt image owner access" on storage.objects;
drop policy if exists "receipt image household member access" on storage.objects;
create policy "receipt image household member access" on storage.objects for all to authenticated
using (
  bucket_id = 'receipts'
  and (
    public.is_household_member(((storage.foldername(name))[1])::uuid)
    or public.can_access_receipt_object(name)
  )
)
with check (
  bucket_id = 'receipts'
  and (
    public.is_household_member(((storage.foldername(name))[1])::uuid)
    or public.can_access_receipt_object(name)
  )
);

grant execute on function public.my_household() to authenticated;
grant execute on function public.ensure_personal_household(text) to authenticated;
grant execute on function public.create_shared_household(text, text) to authenticated;
grant execute on function public.join_household_by_code(text, text) to authenticated;
grant execute on function public.leave_shared_household() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.can_access_receipt_object(text) to authenticated;

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.is_household_owner(uuid) from public, anon;
revoke all on function public.can_access_receipt_object(text) from public, anon;
revoke all on function public.generate_household_invite() from public, anon;
revoke all on function public.merge_jsonb_array_by_id(jsonb, jsonb) from public, anon;
revoke all on function public.merge_household_states(jsonb, jsonb) from public, anon;
revoke all on function public.my_household() from public, anon;
revoke all on function public.ensure_personal_household(text) from public, anon;
revoke all on function public.create_shared_household(text, text) from public, anon;
revoke all on function public.join_household_by_code(text, text) from public, anon;
revoke all on function public.leave_shared_household() from public, anon;

do $$
begin
  alter publication supabase_realtime add table public.households;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.household_members;
exception when duplicate_object then null;
end $$;
