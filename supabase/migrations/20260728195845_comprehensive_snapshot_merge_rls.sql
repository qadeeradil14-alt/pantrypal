create or replace function private.can_update_household_snapshot_as_member(
  p_household_id uuid,
  p_new_state jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_state jsonb;
  v_old_session jsonb;
  v_new_session jsonb;
  v_old_queue jsonb;
  v_new_queue jsonb;
  v_old_queue_length integer;
begin
  if auth.uid() is null or not public.is_household_member(p_household_id) then
    return false;
  end if;

  if public.is_household_owner(p_household_id) then
    return true;
  end if;

  select state
    into v_old_state
    from public.household_snapshots
   where household_id = p_household_id;

  if not found then
    return false;
  end if;

  v_old_session := case
    when jsonb_typeof(v_old_state -> 'activeSession') = 'object'
      then v_old_state -> 'activeSession'
    else null
  end;
  v_new_session := case
    when jsonb_typeof(p_new_state -> 'activeSession') = 'object'
      then p_new_state -> 'activeSession'
    else null
  end;

  if v_old_session is not null
    and (
      coalesce(v_old_session ->> 'shopperId', '') = ''
      or v_old_session ->> 'shopperId' = auth.uid()::text
    ) then
    return true;
  end if;

  if (coalesce(v_old_session, '{}'::jsonb) - array['entries', 'removedItemIds', 'removedAt', 'storeQueue'])
    <> (coalesce(v_new_session, '{}'::jsonb) - array['entries', 'removedItemIds', 'removedAt', 'storeQueue']) then
    return false;
  end if;

  if v_old_session is null and v_new_session is null then
    return true;
  end if;

  if v_old_session is null or v_new_session is null
    or jsonb_typeof(v_old_session -> 'entries') <> 'array'
    or jsonb_typeof(v_new_session -> 'entries') <> 'array'
    or jsonb_typeof(v_old_session -> 'removedItemIds') <> 'array'
    or jsonb_typeof(v_new_session -> 'removedItemIds') <> 'array'
    or jsonb_typeof(v_old_session -> 'storeQueue') <> 'array'
    or jsonb_typeof(v_new_session -> 'storeQueue') <> 'array'
    or jsonb_typeof(coalesce(v_old_session -> 'removedAt', '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(v_new_session -> 'removedAt', '{}'::jsonb)) <> 'object' then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_old_session -> 'entries') old_entry
      join jsonb_array_elements(v_new_session -> 'entries') new_entry
        on new_entry ->> 'itemId' = old_entry ->> 'itemId'
     where (old_entry - array['name', 'quantity', 'unit', 'storeId', 'addedAt'])
        <> (new_entry - array['name', 'quantity', 'unit', 'storeId', 'addedAt'])
        or (
          new_entry ? 'addedAt'
          and jsonb_typeof(new_entry -> 'addedAt') <> 'number'
        )
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_new_session -> 'entries') new_entry
     where not exists (
       select 1
         from jsonb_array_elements(v_old_session -> 'entries') old_entry
        where old_entry ->> 'itemId' = new_entry ->> 'itemId'
     )
       and (
         coalesce((new_entry ->> 'picked')::boolean, false)
         or coalesce((new_entry ->> 'outOfStock')::boolean, false)
         or new_entry ? 'pickedAt'
         or new_entry ? 'outOfStockAt'
         or (
           new_entry ? 'addedAt'
           and jsonb_typeof(new_entry -> 'addedAt') <> 'number'
         )
       )
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_old_session -> 'entries') old_entry
     where not exists (
       select 1
         from jsonb_array_elements(v_new_session -> 'entries') new_entry
        where new_entry ->> 'itemId' = old_entry ->> 'itemId'
     )
       and not exists (
         select 1
           from jsonb_array_elements(coalesce(p_new_state -> 'deletedItems', '[]'::jsonb)) tombstone
          where tombstone ->> 'id' = old_entry ->> 'itemId'
       )
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_old_session -> 'removedItemIds') old_removed
     where not (v_new_session -> 'removedItemIds') @> jsonb_build_array(old_removed)
       and not exists (
         select 1
           from jsonb_array_elements(v_new_session -> 'entries') new_entry
          where new_entry ->> 'itemId' = old_removed #>> '{}'
            and jsonb_typeof(new_entry -> 'addedAt') = 'number'
            and (
              not (coalesce(v_old_session -> 'removedAt', '{}'::jsonb) ? (old_removed #>> '{}'))
              or (new_entry ->> 'addedAt')::numeric >
                 (v_old_session -> 'removedAt' ->> (old_removed #>> '{}'))::numeric
            )
       )
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_new_session -> 'removedItemIds') new_removed
     where not (v_old_session -> 'removedItemIds') @> jsonb_build_array(new_removed)
       and not exists (
         select 1
           from jsonb_array_elements(coalesce(p_new_state -> 'deletedItems', '[]'::jsonb)) tombstone
          where tombstone ->> 'id' = new_removed #>> '{}'
       )
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_each(coalesce(v_new_session -> 'removedAt', '{}'::jsonb)) stamp
     where jsonb_typeof(stamp.value) <> 'number'
       or not (v_new_session -> 'removedItemIds') @> jsonb_build_array(stamp.key)
       or (
         coalesce(v_old_session -> 'removedAt', '{}'::jsonb) ? stamp.key
         and (stamp.value #>> '{}')::numeric <
             (v_old_session -> 'removedAt' ->> stamp.key)::numeric
       )
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_each(coalesce(v_old_session -> 'removedAt', '{}'::jsonb)) stamp
     where not (coalesce(v_new_session -> 'removedAt', '{}'::jsonb) ? stamp.key)
       and not exists (
         select 1
           from jsonb_array_elements(v_new_session -> 'entries') new_entry
          where new_entry ->> 'itemId' = stamp.key
            and jsonb_typeof(new_entry -> 'addedAt') = 'number'
            and (new_entry ->> 'addedAt')::numeric > (stamp.value #>> '{}')::numeric
       )
  ) then
    return false;
  end if;

  v_old_queue := v_old_session -> 'storeQueue';
  v_new_queue := v_new_session -> 'storeQueue';
  v_old_queue_length := jsonb_array_length(v_old_queue);

  if jsonb_array_length(v_new_queue) < v_old_queue_length then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_old_queue) with ordinality old_store(value, position)
     where v_new_queue -> (old_store.position::integer - 1) <> old_store.value
  ) then
    return false;
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_new_queue) with ordinality new_store(value, position)
     where new_store.position > v_old_queue_length
       and not exists (
         select 1
           from jsonb_array_elements(v_new_session -> 'entries') new_entry
          where new_entry ->> 'storeId' = new_store.value #>> '{}'
       )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all
on function private.can_update_household_snapshot_as_member(uuid, jsonb)
from public, anon;

grant execute
on function private.can_update_household_snapshot_as_member(uuid, jsonb)
to authenticated;
