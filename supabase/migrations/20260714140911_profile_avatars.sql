alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_own_object;

alter table public.profiles
  add constraint profiles_avatar_path_own_object
  check (avatar_path is null or avatar_path = id::text || '/avatar.jpg');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profiles_self_select" on public.profiles;
drop policy if exists "profiles_household_select" on public.profiles;
create policy "profiles_household_select"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or public.is_household_member(profiles.household_id)
  );

drop policy if exists "profiles_self_upsert" on public.profiles;
create policy "profiles_self_upsert"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "avatars_household_select" on storage.objects;
create policy "avatars_household_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and storage.filename(name) = 'avatar.jpg'
    and (
      name = (select auth.uid())::text || '/avatar.jpg'
      or exists (
        select 1
        from public.household_members me
        join public.household_members target
          on target.household_id = me.household_id
        where me.user_id = (select auth.uid())
          and target.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "avatars_own_insert" on storage.objects;
create policy "avatars_own_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  );

drop policy if exists "avatars_own_update" on storage.objects;
create policy "avatars_own_update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  );

drop policy if exists "avatars_own_delete" on storage.objects;
create policy "avatars_own_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text || '/avatar.jpg'
  );

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
        'avatarPath', p.avatar_path,
        'role', m.role,
        'joinedAt', extract(epoch from m.joined_at) * 1000
      ) order by m.joined_at)
      from public.household_members m
      left join public.profiles p on p.id = m.user_id
      where m.household_id = h.id
    ), '[]'::jsonb)
  )
  from public.household_members me
  join public.households h on h.id = me.household_id
  where me.user_id = auth.uid()
  order by h.is_personal, me.joined_at desc
  limit 1;
$function$;
