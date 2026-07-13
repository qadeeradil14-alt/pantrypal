create unique index if not exists household_members_one_owner
  on public.household_members (household_id)
  where role = 'owner';

revoke select on table public.households from anon, authenticated;
grant select (id, name, created_at, plan, owner_id, is_personal)
  on table public.households to authenticated;

revoke insert, update, delete on table public.household_members from anon, authenticated;
grant update (push_token) on table public.household_members to authenticated;

drop policy if exists "household_members_update_own_push_token" on public.household_members;
create policy "household_members_update_own_push_token"
  on public.household_members
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.my_household()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select jsonb_build_object(
    'id', h.id,
    'name', h.name,
    'inviteCode', case when h.is_personal or me.role <> 'owner' then null else h.invite_code end,
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
      from public.household_members m
      where m.household_id = h.id
    ), '[]'::jsonb)
  )
  from public.household_members me
  join public.households h on h.id = me.household_id
  where me.user_id = auth.uid()
  order by h.is_personal, me.joined_at desc
  limit 1;
$function$;

create or replace function public.leave_shared_household()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  requester_id uuid := auth.uid();
  current_id uuid;
  requester_role text;
  my_name text;
  new_id uuid := gen_random_uuid();
begin
  if requester_id is null then
    raise exception 'Not authenticated';
  end if;

  select m.household_id, m.role, m.display_name
  into current_id, requester_role, my_name
  from public.household_members m
  join public.households h on h.id = m.household_id
  where m.user_id = requester_id
    and not h.is_personal
  order by m.joined_at desc
  limit 1
  for update of m;

  if current_id is null then
    return public.ensure_personal_household(coalesce(my_name, 'Me'));
  end if;

  if requester_role = 'owner' then
    raise exception 'Owners must transfer ownership before leaving';
  end if;

  insert into public.households (id, name, invite_code, owner_id, is_personal)
  values (new_id, 'My Pantry', public.generate_household_invite(), requester_id, true);

  delete from public.household_members
  where household_id = current_id
    and user_id = requester_id
    and role = 'member';

  if not found then
    raise exception 'Could not leave household';
  end if;

  insert into public.household_members (household_id, user_id, display_name, role)
  values (new_id, requester_id, coalesce(nullif(trim(my_name), ''), 'Me'), 'owner');

  insert into public.profiles (id, household_id)
  values (requester_id, new_id)
  on conflict (id)
  do update set household_id = excluded.household_id, updated_at = now();

  return public.my_household();
end;
$function$;

create or replace function public.transfer_household_ownership(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  requester_id uuid := auth.uid();
  current_id uuid;
  target_role text;
begin
  if requester_id is null then
    raise exception 'Not authenticated';
  end if;

  if target_user_id is null or target_user_id = requester_id then
    raise exception 'Select another household member';
  end if;

  select h.id
  into current_id
  from public.households h
  join public.household_members me
    on me.household_id = h.id
   and me.user_id = requester_id
  where not h.is_personal
    and me.role = 'owner'
  order by me.joined_at desc
  limit 1
  for update of h;

  if current_id is null then
    raise exception 'Only the household owner can transfer ownership';
  end if;

  select role
  into target_role
  from public.household_members
  where household_id = current_id
    and user_id = target_user_id
  for update;

  if target_role is null then
    raise exception 'The selected person is not in this household';
  end if;

  if target_role <> 'member' then
    raise exception 'Ownership can only be transferred to a regular member';
  end if;

  update public.household_members
  set role = 'member'
  where household_id = current_id
    and user_id = requester_id
    and role = 'owner';

  update public.household_members
  set role = 'owner'
  where household_id = current_id
    and user_id = target_user_id
    and role = 'member';

  update public.households
  set owner_id = target_user_id
  where id = current_id;

  return public.my_household();
end;
$function$;

create or replace function public.delete_shared_household()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  requester_id uuid := auth.uid();
  current_id uuid;
  my_name text;
  member_count integer;
  new_id uuid := gen_random_uuid();
begin
  if requester_id is null then
    raise exception 'Not authenticated';
  end if;

  select h.id, me.display_name
  into current_id, my_name
  from public.households h
  join public.household_members me
    on me.household_id = h.id
   and me.user_id = requester_id
  where not h.is_personal
    and me.role = 'owner'
  order by me.joined_at desc
  limit 1
  for update of h;

  if current_id is null then
    raise exception 'Only the household owner can delete the household';
  end if;

  select count(*)
  into member_count
  from public.household_members
  where household_id = current_id;

  if member_count <> 1 then
    raise exception 'Only a sole owner can delete the household';
  end if;

  delete from public.pantry_items where household_id = current_id;
  delete from public.pantry_stores where household_id = current_id;
  delete from public.pantry_receipts where household_id = current_id;
  delete from public.households where id = current_id;

  insert into public.households (id, name, invite_code, owner_id, is_personal)
  values (new_id, 'My Pantry', public.generate_household_invite(), requester_id, true);

  insert into public.household_members (household_id, user_id, display_name, role)
  values (new_id, requester_id, coalesce(nullif(trim(my_name), ''), 'Me'), 'owner');

  insert into public.profiles (id, household_id)
  values (requester_id, new_id)
  on conflict (id)
  do update set household_id = excluded.household_id, updated_at = now();

  return public.my_household();
end;
$function$;

revoke all on function public.my_household() from public, anon;
revoke all on function public.leave_shared_household() from public, anon;
revoke all on function public.transfer_household_ownership(uuid) from public, anon;
revoke all on function public.delete_shared_household() from public, anon;
revoke all on function public.rename_me(text) from public, anon;

grant execute on function public.my_household() to authenticated;
grant execute on function public.leave_shared_household() to authenticated;
grant execute on function public.transfer_household_ownership(uuid) to authenticated;
grant execute on function public.delete_shared_household() to authenticated;
grant execute on function public.rename_me(text) to authenticated;

do $migration$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end;
$migration$;
