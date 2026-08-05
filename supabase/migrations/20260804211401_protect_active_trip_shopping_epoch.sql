-- Additive backfill: only snapshots with a currently active legacy trip are
-- stamped. Idle history, receipts, trips, completion markers, and unrelated
-- assignments are not rewritten.
-- Rollback: restore private.enforce_completed_shopping_snapshot() from
-- 20260804142830, then drop private.enforce_shopping_epoch_state(jsonb,jsonb).
-- The additive JSON keys may remain; OTA 459 and earlier ignore unknown keys.

create or replace function private.enforce_shopping_epoch_state(
  p_old_state jsonb,
  p_new_state jsonb
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_result jsonb := p_new_state;
  v_old_session jsonb;
  v_new_session jsonb;
  v_items jsonb;
  v_assignments jsonb;
  v_old_assignments jsonb;
  v_trips jsonb;
  v_closed_trips jsonb;
  v_old_epoch bigint := 0;
  v_epoch bigint := 0;
  v_proposed_epoch bigint := 0;
  v_old_trip_id text;
  v_new_trip_id text;
  v_completed_trip_id text;
  v_started_trip boolean := false;
  v_closed_trip boolean := false;
  v_assignment jsonb;
  v_old_assignment jsonb;
  v_item jsonb;
  v_entry jsonb;
  v_purchase jsonb;
  v_index bigint;
  v_item_index bigint;
  v_assignment_index bigint;
  v_item_id text;
  v_store_id text;
  v_based_epoch bigint;
  v_revision bigint;
  v_completed_at bigint;
  v_has_remaining boolean;
  v_valid boolean;
begin
  if jsonb_typeof(p_old_state) <> 'object' or jsonb_typeof(p_new_state) <> 'object' then
    raise exception 'household snapshot state must be a JSON object' using errcode = '22023';
  end if;
  if p_new_state ? 'items' and jsonb_typeof(p_new_state -> 'items') <> 'array' then
    raise exception 'household snapshot items must be a JSON array' using errcode = '22023';
  end if;
  if p_new_state ? 'shoppingStoreAssignments'
    and jsonb_typeof(p_new_state -> 'shoppingStoreAssignments') <> 'array' then
    raise exception 'household snapshot shoppingStoreAssignments must be a JSON array' using errcode = '22023';
  end if;
  if p_new_state ? 'trips' and jsonb_typeof(p_new_state -> 'trips') <> 'array' then
    raise exception 'household snapshot trips must be a JSON array' using errcode = '22023';
  end if;
  if p_new_state ? 'closedTripIds' and jsonb_typeof(p_new_state -> 'closedTripIds') <> 'array' then
    raise exception 'household snapshot closedTripIds must be a JSON array' using errcode = '22023';
  end if;

  v_old_session := case when jsonb_typeof(p_old_state -> 'activeSession') = 'object'
    then p_old_state -> 'activeSession' else null end;
  v_new_session := case when jsonb_typeof(p_new_state -> 'activeSession') = 'object'
    then p_new_state -> 'activeSession' else null end;
  v_old_trip_id := coalesce(
    nullif(p_old_state ->> 'activeTripId', ''),
    nullif(v_old_session ->> 'tripId', '')
  );
  v_new_trip_id := nullif(v_new_session ->> 'tripId', '');
  v_old_epoch := case
    when coalesce(p_old_state ->> 'shoppingEpoch', '') ~ '^[0-9]+$'
      then (p_old_state ->> 'shoppingEpoch')::bigint
    when v_old_trip_id is not null then 1
    else 0
  end;
  v_proposed_epoch := case
    when coalesce(p_new_state ->> 'shoppingEpoch', '') ~ '^[0-9]+$'
      then (p_new_state ->> 'shoppingEpoch')::bigint
    else 0
  end;
  v_epoch := v_old_epoch;
  v_items := coalesce(p_new_state -> 'items', '[]'::jsonb);
  v_assignments := coalesce(p_new_state -> 'shoppingStoreAssignments', '[]'::jsonb);
  v_old_assignments := case
    when jsonb_typeof(p_old_state -> 'shoppingStoreAssignments') = 'array'
      then p_old_state -> 'shoppingStoreAssignments'
    else '[]'::jsonb
  end;
  v_trips := coalesce(p_new_state -> 'trips', '[]'::jsonb);
  v_closed_trips := coalesce(p_new_state -> 'closedTripIds', '[]'::jsonb);

  if v_old_trip_id is null and v_new_trip_id is not null then
    v_epoch := case when p_old_state = '{}'::jsonb
      then greatest(1, v_proposed_epoch)
      else v_old_epoch + 1
    end;
    v_started_trip := true;
  elsif p_old_state = '{}'::jsonb and v_new_trip_id is null then
    v_epoch := v_proposed_epoch;
  elsif v_old_trip_id is not null then
    select exists (
      select 1 from jsonb_array_elements(v_closed_trips) closed_trip
      where closed_trip ->> 'id' = v_old_trip_id
    ) or exists (
      select 1 from jsonb_array_elements(v_trips) trip
      where trip ->> 'id' = v_old_trip_id
    ) into v_closed_trip;

    if v_new_trip_id = v_old_trip_id then
      v_new_trip_id := v_old_trip_id;
    elsif v_closed_trip then
      select trip ->> 'id'
      into v_completed_trip_id
      from jsonb_array_elements(v_trips) trip
      where trip ->> 'id' = v_old_trip_id
      limit 1;
      v_new_session := null;
      v_new_trip_id := null;
    else
      v_new_session := v_old_session;
      v_new_trip_id := v_old_trip_id;
      v_result := jsonb_set(v_result, '{activeSession}', v_old_session, true);
    end if;
  end if;

  v_result := jsonb_set(v_result, '{shoppingEpoch}', to_jsonb(v_epoch), true);
  v_result := jsonb_set(
    v_result,
    '{activeTripId}',
    case when v_new_trip_id is null then 'null'::jsonb else to_jsonb(v_new_trip_id) end,
    true
  );

  if v_started_trip then
    for v_entry in
      select value
      from jsonb_array_elements(
        case when jsonb_typeof(v_new_session -> 'entries') = 'array'
          then v_new_session -> 'entries' else '[]'::jsonb end
      )
      where value ->> 'pantryItemId' <> '__quick_scan__'
    loop
      for v_assignment, v_index in
        select value, ordinality - 1
        from jsonb_array_elements(v_assignments) with ordinality
        where value ->> 'pantryItemId' = v_entry ->> 'pantryItemId'
          and value ->> 'storeId' = v_entry ->> 'storeId'
          and coalesce((value ->> 'active')::boolean, false)
      loop
        v_assignment := v_assignment || jsonb_build_object(
          'assignmentBasedOnShoppingEpoch', v_epoch,
          'assignmentBasedOnActiveTripId', v_new_trip_id
        );
        v_assignments := jsonb_set(v_assignments, array[v_index::text], v_assignment, false);
      end loop;
    end loop;
  end if;

  if v_completed_trip_id is not null then
    select case when coalesce(trip ->> 'completedAt', '') ~ '^[0-9]+$'
      then (trip ->> 'completedAt')::bigint else 0 end
    into v_completed_at
    from jsonb_array_elements(v_trips) trip
    where trip ->> 'id' = v_completed_trip_id
    limit 1;

    for v_purchase in
      select purchased
      from jsonb_array_elements(v_trips) trip
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(trip -> 'purchasedItems') = 'array'
          then trip -> 'purchasedItems' else '[]'::jsonb end
      ) purchased
      where trip ->> 'id' = v_completed_trip_id
    loop
      v_item_id := v_purchase ->> 'itemId';
      v_store_id := v_purchase ->> 'storeId';
      select value, ordinality - 1
      into v_assignment, v_assignment_index
      from jsonb_array_elements(v_assignments) with ordinality
      where value ->> 'pantryItemId' = v_item_id
        and value ->> 'storeId' = v_store_id
      limit 1;

      if found then
        v_revision := case when coalesce(v_assignment ->> 'revision', '') ~ '^[0-9]+$'
          then (v_assignment ->> 'revision')::bigint + 1 else 1 end;
        v_assignment := v_assignment || jsonb_build_object(
          'active', false,
          'updatedAt', greatest(
            case when coalesce(v_assignment ->> 'updatedAt', '') ~ '^[0-9]+$'
              then (v_assignment ->> 'updatedAt')::bigint + 1 else 0 end,
            v_completed_at
          ),
          'revision', v_revision,
          'closedTripId', v_completed_trip_id,
          'assignmentBasedOnShoppingEpoch', v_epoch,
          'assignmentBasedOnActiveTripId', v_completed_trip_id
        );
        v_assignments := jsonb_set(
          v_assignments,
          array[v_assignment_index::text],
          v_assignment,
          false
        );
      else
        v_assignments := v_assignments || jsonb_build_array(jsonb_build_object(
          'id', 'shopping-store:' || v_item_id || ':' || v_store_id,
          'pantryItemId', v_item_id,
          'storeId', v_store_id,
          'active', false,
          'updatedAt', v_completed_at,
          'revision', 1,
          'closedTripId', v_completed_trip_id,
          'assignmentBasedOnShoppingEpoch', v_epoch,
          'assignmentBasedOnActiveTripId', v_completed_trip_id
        ));
      end if;
    end loop;
  end if;

  for v_assignment, v_index in
    select value, ordinality - 1
    from jsonb_array_elements(v_assignments) with ordinality
  loop
    if not coalesce((v_assignment ->> 'active')::boolean, false) then
      continue;
    end if;
    v_item_id := v_assignment ->> 'pantryItemId';
    v_based_epoch := case
      when coalesce(v_assignment ->> 'assignmentBasedOnShoppingEpoch', '') ~ '^[0-9]+$'
        then (v_assignment ->> 'assignmentBasedOnShoppingEpoch')::bigint
      else -1
    end;
    v_valid := true;

    if v_new_trip_id is not null and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(v_new_session -> 'entries') = 'array'
          then v_new_session -> 'entries' else '[]'::jsonb end
      ) entry
      where entry ->> 'pantryItemId' = v_item_id
    ) then
      v_valid := v_based_epoch = v_epoch
        and v_assignment ->> 'assignmentBasedOnActiveTripId' = v_new_trip_id;

      if not v_valid then
        select value
        into v_old_assignment
        from jsonb_array_elements(v_old_assignments)
        where value ->> 'id' = v_assignment ->> 'id'
          and coalesce((value ->> 'active')::boolean, false)
          and coalesce(value ->> 'assignmentBasedOnShoppingEpoch', '') ~ '^[0-9]+$'
          and (value ->> 'assignmentBasedOnShoppingEpoch')::bigint = v_epoch
          and value ->> 'assignmentBasedOnActiveTripId' = v_new_trip_id
        limit 1;
        if found then
          v_assignment := v_assignment || jsonb_build_object(
            'assignmentBasedOnShoppingEpoch', v_epoch,
            'assignmentBasedOnActiveTripId', v_new_trip_id
          );
          v_valid := true;
        end if;
      end if;
    elsif v_completed_trip_id is not null and exists (
      select 1
      from jsonb_array_elements(v_trips) trip
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(trip -> 'purchasedItems') = 'array'
          then trip -> 'purchasedItems' else '[]'::jsonb end
      ) purchased
      where trip ->> 'id' = v_completed_trip_id
        and purchased ->> 'itemId' = v_item_id
    ) then
      v_valid := v_based_epoch = v_epoch
        and v_assignment ->> 'assignmentBasedOnActiveTripId' = v_completed_trip_id;
      if not v_valid then
        select value
        into v_old_assignment
        from jsonb_array_elements(v_old_assignments)
        where value ->> 'id' = v_assignment ->> 'id'
          and coalesce((value ->> 'active')::boolean, false)
          and coalesce(value ->> 'assignmentBasedOnShoppingEpoch', '') ~ '^[0-9]+$'
          and (value ->> 'assignmentBasedOnShoppingEpoch')::bigint = v_epoch
          and value ->> 'assignmentBasedOnActiveTripId' = v_completed_trip_id
        limit 1;
        if found then
          v_assignment := v_assignment || jsonb_build_object(
            'assignmentBasedOnShoppingEpoch', v_epoch,
            'assignmentBasedOnActiveTripId', v_completed_trip_id
          );
          v_valid := true;
        end if;
      end if;
    elsif exists (
      select 1 from jsonb_array_elements(v_items) item
      where item ->> 'id' = v_item_id
        and nullif(item ->> 'statusClosedTripId', '') is not null
    ) then
      v_valid := v_based_epoch >= v_epoch;
    end if;

    if not v_valid then
      v_assignment := jsonb_set(v_assignment, '{active}', 'false'::jsonb, true);
    end if;
    v_assignments := jsonb_set(v_assignments, array[v_index::text], v_assignment, false);
  end loop;

  if v_completed_trip_id is not null then
    for v_purchase in
      select purchased
      from jsonb_array_elements(v_trips) trip
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(trip -> 'purchasedItems') = 'array'
          then trip -> 'purchasedItems' else '[]'::jsonb end
      ) purchased
      where trip ->> 'id' = v_completed_trip_id
    loop
      v_item_id := v_purchase ->> 'itemId';
      select exists (
        select 1 from jsonb_array_elements(v_assignments) assignment
        where assignment ->> 'pantryItemId' = v_item_id
          and coalesce((assignment ->> 'active')::boolean, false)
      ) into v_has_remaining;
      if v_has_remaining then
        continue;
      end if;

      select value, ordinality - 1
      into v_item, v_item_index
      from jsonb_array_elements(v_items) with ordinality
      where value ->> 'id' = v_item_id
      limit 1;
      if not found then
        continue;
      end if;
      v_revision := case when coalesce(v_item ->> 'statusRevision', '') ~ '^[0-9]+$'
        then (v_item ->> 'statusRevision')::bigint + 1 else 1 end;
      v_item := (v_item - 'statusBasedOnClosedTripId') || jsonb_build_object(
        'status', 'stocked',
        'storeId', null,
        'updatedAt', greatest(
          case when coalesce(v_item ->> 'updatedAt', '') ~ '^[0-9]+$'
            then (v_item ->> 'updatedAt')::bigint + 1 else 0 end,
          v_completed_at
        ),
        'statusUpdatedAt', greatest(
          case when coalesce(v_item ->> 'statusUpdatedAt', '') ~ '^[0-9]+$'
            then (v_item ->> 'statusUpdatedAt')::bigint + 1 else 0 end,
          v_completed_at
        ),
        'statusRevision', v_revision,
        'statusClosedTripId', v_completed_trip_id
      );
      v_items := jsonb_set(v_items, array[v_item_index::text], v_item, false);
    end loop;
  end if;

  v_result := jsonb_set(v_result, '{items}', v_items, true);
  v_result := jsonb_set(v_result, '{shoppingStoreAssignments}', v_assignments, true);
  return v_result;
end;
$$;

create or replace function private.enforce_completed_shopping_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.state := private.enforce_shopping_epoch_state(
      '{}'::jsonb,
      private.backfill_completed_shopping_markers(new.state)
    );
  else
    new.state := private.enforce_shopping_epoch_state(
      old.state,
      private.preserve_completed_shopping_state(old.state, new.state)
    );
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_shopping_epoch_state(jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.enforce_completed_shopping_snapshot()
from public, anon, authenticated, service_role;

with protected as (
  select
    household_id,
    state as old_state,
    private.enforce_shopping_epoch_state('{}'::jsonb, state) as protected_state,
    greatest(
      updated_at + 1,
      (extract(epoch from statement_timestamp()) * 1000)::bigint
    ) as migrated_at
  from public.household_snapshots
  where jsonb_typeof(state -> 'activeSession') = 'object'
    and nullif(state -> 'activeSession' ->> 'tripId', '') is not null
    and (
      not state ? 'shoppingEpoch'
      or not state ? 'activeTripId'
      or state ->> 'activeTripId' is distinct from state -> 'activeSession' ->> 'tripId'
    )
), changed as (
  select household_id, protected_state, migrated_at
  from protected
  where protected_state is distinct from old_state
)
update public.household_snapshots snapshot
set
  state = jsonb_set(changed.protected_state, '{updatedAt}', to_jsonb(changed.migrated_at), true),
  updated_at = changed.migrated_at
from changed
where snapshot.household_id = changed.household_id;
