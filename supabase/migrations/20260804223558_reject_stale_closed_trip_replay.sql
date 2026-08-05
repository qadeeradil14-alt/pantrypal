-- Follow-up to 20260804211401_protect_active_trip_shopping_epoch.sql.
--
-- Gap: when OLD.state had no active trip (activeTripId/activeSession both
-- cleared, as happens right after a trip completes) and a stale device
-- replays its own pre-completion local state — same activeSession.tripId,
-- same shoppingStoreAssignments — enforce_shopping_epoch_state() fell
-- through to the "old_trip_id is null and new_trip_id is not null" branch,
-- which unconditionally treats it as a BRAND NEW trip start. It never
-- checked whether that tripId was already present in closedTripIds/trips,
-- so the replay got re-stamped with a fresh epoch and its assignment
-- reactivated — exactly the resurrection this protection exists to stop.
--
-- Fix: before treating that branch as a new trip start, check the tripId
-- against OLD.state's own closedTripIds/trips (the authoritative source —
-- a stale device's own payload may not even know the trip closed). If it's
-- already closed: clear the session, leave activeTripId null, leave
-- shoppingEpoch untouched (no increment, no restamp), and force any
-- resurrected assignment back to its OLD closed record when the ids match
-- (assignment ids are content-addressed as shopping-store:<item>:<store>,
-- so a stale replay reproduces the same id rather than inventing a new
-- one) or deactivate it outright otherwise. Item-level restoration is
-- already handled upstream by private.preserve_completed_shopping_state
-- and is untouched by this migration.
--
-- Additive/idempotent: only changes behavior for the one previously-gapped
-- branch. No backfill needed — this is pure logic replacement, no stored
-- state was incorrectly written by the old version prior to this fix (the
-- gap was caught in a rolled-back production fixture test, never a real
-- write). Rollback: restore private.enforce_shopping_epoch_state() from
-- 20260804211401.

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
  v_stale_closed_replay boolean := false;
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
    -- Is this tripId already closed according to OLD state's own history?
    -- OLD state is authoritative here: a stale device's own payload may
    -- still be missing the closure record it never received.
    select exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_old_state -> 'closedTripIds') = 'array'
          then p_old_state -> 'closedTripIds' else '[]'::jsonb end
      ) closed_trip
      where closed_trip ->> 'id' = v_new_trip_id
    ) or exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(p_old_state -> 'trips') = 'array'
          then p_old_state -> 'trips' else '[]'::jsonb end
      ) trip
      where trip ->> 'id' = v_new_trip_id
    ) into v_stale_closed_replay;

    if v_stale_closed_replay then
      v_new_session := null;
      v_new_trip_id := null;
      v_result := jsonb_set(v_result, '{activeSession}', 'null'::jsonb, true);
    else
      v_epoch := case when p_old_state = '{}'::jsonb
        then greatest(1, v_proposed_epoch)
        else v_old_epoch + 1
      end;
      v_started_trip := true;
    end if;
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

  -- Force any resurrected assignment back to its OLD closed record (or
  -- deactivate it if it has no matching OLD record) before anything else
  -- runs. Assignment ids are content-addressed as
  -- shopping-store:<item>:<store>, so a genuine stale replay reproduces
  -- the same id as the original, closed record.
  if v_stale_closed_replay then
    for v_assignment, v_index in
      select value, ordinality - 1
      from jsonb_array_elements(v_assignments) with ordinality
    loop
      select value
      into v_old_assignment
      from jsonb_array_elements(v_old_assignments)
      where value ->> 'id' = v_assignment ->> 'id'
        and not coalesce((value ->> 'active')::boolean, false)
      limit 1;
      if found then
        v_assignments := jsonb_set(v_assignments, array[v_index::text], v_old_assignment, false);
      elsif coalesce((v_assignment ->> 'active')::boolean, false) then
        v_assignment := jsonb_set(v_assignment, '{active}', 'false'::jsonb, true);
        v_assignments := jsonb_set(v_assignments, array[v_index::text], v_assignment, false);
      end if;
    end loop;
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

revoke all on function private.enforce_shopping_epoch_state(jsonb, jsonb)
from public, anon, authenticated, service_role;
