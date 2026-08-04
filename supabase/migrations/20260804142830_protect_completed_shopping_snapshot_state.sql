create schema if not exists private;

create or replace function private.backfill_completed_shopping_markers(p_state jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_result jsonb := p_state;
  v_items jsonb;
  v_assignments jsonb;
  v_trips jsonb;
  v_item jsonb;
  v_assignment jsonb;
  v_trip_id text;
  v_trip_started_at numeric;
  v_trip_completed_at numeric;
  v_record_updated_at numeric;
  v_index bigint;
begin
  if jsonb_typeof(p_state) <> 'object' then
    raise exception 'household snapshot state must be a JSON object' using errcode = '22023';
  end if;

  if p_state ? 'items' and jsonb_typeof(p_state -> 'items') <> 'array' then
    raise exception 'household snapshot items must be a JSON array' using errcode = '22023';
  end if;
  if p_state ? 'shoppingStoreAssignments'
    and jsonb_typeof(p_state -> 'shoppingStoreAssignments') <> 'array' then
    raise exception 'household snapshot shoppingStoreAssignments must be a JSON array' using errcode = '22023';
  end if;
  if p_state ? 'trips' and jsonb_typeof(p_state -> 'trips') <> 'array' then
    raise exception 'household snapshot trips must be a JSON array' using errcode = '22023';
  end if;

  v_items := coalesce(p_state -> 'items', '[]'::jsonb);
  v_assignments := coalesce(p_state -> 'shoppingStoreAssignments', '[]'::jsonb);
  v_trips := coalesce(p_state -> 'trips', '[]'::jsonb);

  for v_item, v_index in
    select value, ordinality - 1
    from jsonb_array_elements(v_items) with ordinality
  loop
    if nullif(v_item ->> 'id', '') is null
      or v_item ? 'statusClosedTripId'
      or v_item ->> 'status' <> 'stocked'
      or v_item ->> 'storeId' is not null
      or exists (
        select 1
        from jsonb_array_elements(v_assignments) assignment
        where assignment ->> 'pantryItemId' = v_item ->> 'id'
          and coalesce((assignment ->> 'active')::boolean, false)
      ) then
      continue;
    end if;

    select
      trip ->> 'id',
      (trip ->> 'completedAt')::numeric
    into v_trip_id, v_trip_completed_at
    from jsonb_array_elements(v_trips) trip
    where nullif(trip ->> 'id', '') is not null
      and coalesce(trip ->> 'completedAt', '') ~ '^[0-9]+$'
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(trip -> 'purchasedItems') = 'array'
            then trip -> 'purchasedItems' else '[]'::jsonb end
        ) purchased
        where purchased ->> 'itemId' = v_item ->> 'id'
      )
    order by (trip ->> 'completedAt')::numeric desc
    limit 1;

    v_record_updated_at := case
      when coalesce(v_item ->> 'statusUpdatedAt', v_item ->> 'updatedAt', '') ~ '^[0-9]+$'
        then coalesce(v_item ->> 'statusUpdatedAt', v_item ->> 'updatedAt')::numeric
      else null
    end;

    if v_trip_id is not null
      and v_record_updated_at between v_trip_completed_at and v_trip_completed_at + 5000 then
      v_item := (v_item - 'statusBasedOnClosedTripId')
        || jsonb_build_object(
          'statusRevision', case
            when coalesce(v_item ->> 'statusRevision', '') ~ '^[0-9]+$'
              then greatest((v_item ->> 'statusRevision')::numeric, 1)
            else 1
          end,
          'statusClosedTripId', v_trip_id
        );
      v_items := jsonb_set(v_items, array[v_index::text], v_item, false);
    end if;
    v_trip_id := null;
    v_trip_completed_at := null;
    v_record_updated_at := null;
  end loop;

  for v_assignment, v_index in
    select value, ordinality - 1
    from jsonb_array_elements(v_assignments) with ordinality
  loop
    if nullif(v_assignment ->> 'id', '') is null
      or v_assignment ? 'closedTripId'
      or coalesce((v_assignment ->> 'active')::boolean, false) then
      continue;
    end if;

    select
      trip ->> 'id',
      (trip ->> 'startedAt')::numeric,
      (trip ->> 'completedAt')::numeric
    into v_trip_id, v_trip_started_at, v_trip_completed_at
    from jsonb_array_elements(v_trips) trip
    where nullif(trip ->> 'id', '') is not null
      and coalesce(trip ->> 'startedAt', '') ~ '^[0-9]+$'
      and coalesce(trip ->> 'completedAt', '') ~ '^[0-9]+$'
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(trip -> 'purchasedItems') = 'array'
            then trip -> 'purchasedItems' else '[]'::jsonb end
        ) purchased
        where purchased ->> 'itemId' = v_assignment ->> 'pantryItemId'
          and purchased ->> 'storeId' = v_assignment ->> 'storeId'
      )
    order by (trip ->> 'completedAt')::numeric desc
    limit 1;

    v_record_updated_at := case
      when coalesce(v_assignment ->> 'updatedAt', '') ~ '^[0-9]+$'
        then (v_assignment ->> 'updatedAt')::numeric
      else null
    end;

    if v_trip_id is not null
      and v_record_updated_at between v_trip_started_at and v_trip_completed_at + 5000 then
      v_assignment := (v_assignment - 'basedOnClosedTripId')
        || jsonb_build_object(
          'revision', case
            when coalesce(v_assignment ->> 'revision', '') ~ '^[0-9]+$'
              then greatest((v_assignment ->> 'revision')::numeric, 1)
            else 1
          end,
          'closedTripId', v_trip_id
        );
      v_assignments := jsonb_set(v_assignments, array[v_index::text], v_assignment, false);
    end if;
    v_trip_id := null;
    v_trip_started_at := null;
    v_trip_completed_at := null;
    v_record_updated_at := null;
  end loop;

  v_result := jsonb_set(v_result, '{items}', v_items, true);
  v_result := jsonb_set(v_result, '{shoppingStoreAssignments}', v_assignments, true);
  return v_result;
end;
$$;

create or replace function private.preserve_completed_shopping_state(
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
  v_old_items jsonb;
  v_new_items jsonb;
  v_old_assignments jsonb;
  v_new_assignments jsonb;
  v_old_closed_trips jsonb;
  v_new_closed_trips jsonb;
  v_new_deleted_items jsonb;
  v_new_trips jsonb;
  v_old_record jsonb;
  v_new_record jsonb;
  v_old_revision numeric;
  v_new_revision numeric;
  v_index bigint;
  v_valid_successor boolean;
  v_valid_deletion boolean;
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
  if p_new_state ? 'closedTripIds' and jsonb_typeof(p_new_state -> 'closedTripIds') <> 'array' then
    raise exception 'household snapshot closedTripIds must be a JSON array' using errcode = '22023';
  end if;
  if p_new_state ? 'deletedItems' and jsonb_typeof(p_new_state -> 'deletedItems') <> 'array' then
    raise exception 'household snapshot deletedItems must be a JSON array' using errcode = '22023';
  end if;
  if p_new_state ? 'trips' and jsonb_typeof(p_new_state -> 'trips') <> 'array' then
    raise exception 'household snapshot trips must be a JSON array' using errcode = '22023';
  end if;

  v_old_items := case when jsonb_typeof(p_old_state -> 'items') = 'array'
    then p_old_state -> 'items' else '[]'::jsonb end;
  v_new_items := coalesce(p_new_state -> 'items', '[]'::jsonb);
  v_old_assignments := case when jsonb_typeof(p_old_state -> 'shoppingStoreAssignments') = 'array'
    then p_old_state -> 'shoppingStoreAssignments' else '[]'::jsonb end;
  v_new_assignments := coalesce(p_new_state -> 'shoppingStoreAssignments', '[]'::jsonb);
  v_old_closed_trips := case when jsonb_typeof(p_old_state -> 'closedTripIds') = 'array'
    then p_old_state -> 'closedTripIds' else '[]'::jsonb end;
  v_new_closed_trips := coalesce(p_new_state -> 'closedTripIds', '[]'::jsonb);
  v_new_deleted_items := coalesce(p_new_state -> 'deletedItems', '[]'::jsonb);
  v_new_trips := coalesce(p_new_state -> 'trips', '[]'::jsonb);

  for v_old_record in
    select value
    from jsonb_array_elements(v_old_items)
    where nullif(value ->> 'statusClosedTripId', '') is not null
  loop
    select value, ordinality - 1
    into v_new_record, v_index
    from jsonb_array_elements(v_new_items) with ordinality
    where value ->> 'id' = v_old_record ->> 'id'
    limit 1;

    if not found then
      select exists (
        select 1
        from jsonb_array_elements(v_new_deleted_items) tombstone
        where tombstone ->> 'id' = v_old_record ->> 'id'
          and coalesce(tombstone ->> 'deletedAt', '') ~ '^[0-9]+$'
          and (tombstone ->> 'deletedAt')::numeric > greatest(
            case when coalesce(v_old_record ->> 'updatedAt', '') ~ '^[0-9]+$'
              then (v_old_record ->> 'updatedAt')::numeric else 0 end,
            case when coalesce(v_old_record ->> 'statusUpdatedAt', '') ~ '^[0-9]+$'
              then (v_old_record ->> 'statusUpdatedAt')::numeric else 0 end
          )
      ) into v_valid_deletion;
      if not v_valid_deletion then
        v_new_items := v_new_items || jsonb_build_array(v_old_record);
      end if;
      continue;
    end if;

    v_old_revision := case
      when coalesce(v_old_record ->> 'statusRevision', '') ~ '^[0-9]+$'
        then (v_old_record ->> 'statusRevision')::numeric
      else null
    end;
    v_new_revision := case
      when coalesce(v_new_record ->> 'statusRevision', '') ~ '^[0-9]+$'
        then (v_new_record ->> 'statusRevision')::numeric
      else null
    end;
    v_valid_successor :=
      v_old_revision is not null
      and v_new_revision is not null
      and v_new_revision > v_old_revision
      and v_new_record ->> 'statusBasedOnClosedTripId' = v_old_record ->> 'statusClosedTripId';

    if v_valid_successor and nullif(v_new_record ->> 'statusClosedTripId', '') is not null then
      select exists (
        select 1
        from jsonb_array_elements(v_new_trips) trip
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(trip -> 'purchasedItems') = 'array'
            then trip -> 'purchasedItems' else '[]'::jsonb end
        ) purchased
        where trip ->> 'id' = v_new_record ->> 'statusClosedTripId'
          and purchased ->> 'itemId' = v_new_record ->> 'id'
      ) into v_valid_successor;
    end if;

    if not v_valid_successor then
      v_new_record := (v_new_record - 'statusBasedOnClosedTripId')
        || jsonb_build_object(
          'status', v_old_record -> 'status',
          'storeId', coalesce(v_old_record -> 'storeId', 'null'::jsonb),
          'statusUpdatedAt', v_old_record -> 'statusUpdatedAt',
          'statusRevision', v_old_record -> 'statusRevision',
          'statusClosedTripId', v_old_record -> 'statusClosedTripId'
        );
      v_new_items := jsonb_set(v_new_items, array[v_index::text], v_new_record, false);
    end if;
  end loop;

  for v_old_record in
    select value
    from jsonb_array_elements(v_old_assignments)
    where nullif(value ->> 'closedTripId', '') is not null
  loop
    select value, ordinality - 1
    into v_new_record, v_index
    from jsonb_array_elements(v_new_assignments) with ordinality
    where value ->> 'id' = v_old_record ->> 'id'
    limit 1;

    if not found then
      v_new_assignments := v_new_assignments || jsonb_build_array(v_old_record);
      continue;
    end if;

    v_old_revision := case
      when coalesce(v_old_record ->> 'revision', '') ~ '^[0-9]+$'
        then (v_old_record ->> 'revision')::numeric
      else null
    end;
    v_new_revision := case
      when coalesce(v_new_record ->> 'revision', '') ~ '^[0-9]+$'
        then (v_new_record ->> 'revision')::numeric
      else null
    end;
    v_valid_successor :=
      v_old_revision is not null
      and v_new_revision is not null
      and v_new_revision > v_old_revision
      and v_new_record ->> 'basedOnClosedTripId' = v_old_record ->> 'closedTripId';

    if v_valid_successor and nullif(v_new_record ->> 'closedTripId', '') is not null then
      select exists (
        select 1
        from jsonb_array_elements(v_new_trips) trip
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(trip -> 'purchasedItems') = 'array'
            then trip -> 'purchasedItems' else '[]'::jsonb end
        ) purchased
        where trip ->> 'id' = v_new_record ->> 'closedTripId'
          and purchased ->> 'itemId' = v_new_record ->> 'pantryItemId'
          and purchased ->> 'storeId' = v_new_record ->> 'storeId'
      ) into v_valid_successor;
    end if;

    if not v_valid_successor then
      v_new_assignments := jsonb_set(
        v_new_assignments,
        array[v_index::text],
        v_old_record,
        false
      );
    end if;
  end loop;

  for v_old_record in
    select value
    from jsonb_array_elements(v_old_closed_trips)
    where nullif(value ->> 'id', '') is not null
  loop
    select value, ordinality - 1
    into v_new_record, v_index
    from jsonb_array_elements(v_new_closed_trips) with ordinality
    where value ->> 'id' = v_old_record ->> 'id'
    limit 1;

    if not found then
      v_new_closed_trips := v_new_closed_trips || jsonb_build_array(v_old_record);
    elsif not (
      coalesce(v_new_record ->> 'deletedAt', '') ~ '^[0-9]+$'
      and coalesce(v_old_record ->> 'deletedAt', '') ~ '^[0-9]+$'
      and (v_new_record ->> 'deletedAt')::numeric >= (v_old_record ->> 'deletedAt')::numeric
    ) then
      v_new_closed_trips := jsonb_set(
        v_new_closed_trips,
        array[v_index::text],
        v_old_record,
        false
      );
    end if;
  end loop;

  v_result := jsonb_set(v_result, '{items}', v_new_items, true);
  v_result := jsonb_set(v_result, '{shoppingStoreAssignments}', v_new_assignments, true);
  v_result := jsonb_set(v_result, '{closedTripIds}', v_new_closed_trips, true);
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
    new.state := private.backfill_completed_shopping_markers(new.state);
  else
    new.state := private.preserve_completed_shopping_state(old.state, new.state);
  end if;
  return new;
end;
$$;

revoke all on function private.backfill_completed_shopping_markers(jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.preserve_completed_shopping_state(jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.enforce_completed_shopping_snapshot()
from public, anon, authenticated, service_role;

with backfilled as (
  select
    household_id,
    state as old_state,
    private.backfill_completed_shopping_markers(state) as backfilled_state,
    greatest(
      updated_at + 1,
      (extract(epoch from statement_timestamp()) * 1000)::bigint
    ) as migrated_at
  from public.household_snapshots
), changed as (
  select household_id, backfilled_state, migrated_at
  from backfilled
  where backfilled_state is distinct from old_state
)
update public.household_snapshots snapshot
set
  state = jsonb_set(changed.backfilled_state, '{updatedAt}', to_jsonb(changed.migrated_at), true),
  updated_at = changed.migrated_at
from changed
where snapshot.household_id = changed.household_id;

drop trigger if exists protect_completed_shopping_snapshot
on public.household_snapshots;

create trigger protect_completed_shopping_snapshot
before insert or update of state on public.household_snapshots
for each row
execute function private.enforce_completed_shopping_snapshot();
