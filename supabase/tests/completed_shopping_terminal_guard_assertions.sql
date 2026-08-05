create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'assertion failed: %', p_message;
  end if;
end;
$$;

select pg_temp.assert_true(
  (select count(*) = 3
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'items') item
   where item ->> 'statusClosedTripId' = 'trip-1'),
  'legacy completed items are backfilled'
);
select pg_temp.assert_true(
  (select count(*) = 3
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'shoppingStoreAssignments') assignment
   where assignment ->> 'closedTripId' = 'trip-1'),
  'legacy completed assignments are backfilled'
);
select pg_temp.assert_true(
  (select not (item ? 'statusClosedTripId')
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'items') item
   where item ->> 'id' = 'future'),
  'current needed item is not backfilled'
);
select pg_temp.assert_true(
  (select not (item ? 'statusClosedTripId')
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'items') item
   where item ->> 'id' = 'ambiguous'),
  'historical item outside the completion window needs manual review'
);
select pg_temp.assert_true(
  (select not (assignment ? 'closedTripId')
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'shoppingStoreAssignments') assignment
   where assignment ->> 'id' = 'a-ambiguous'),
  'historical assignment outside the trip window needs manual review'
);
select pg_temp.assert_true(
  (select state -> 'receipts' = '[{"id":"receipt-1","tripId":"trip-1","amount":74.21}]'::jsonb
   from public.household_snapshots),
  'backfill does not alter receipts'
);
select pg_temp.assert_true(
  (select (state ->> 'updatedAt')::bigint = updated_at and updated_at > 300
   from public.household_snapshots),
  'backfill advances both client and row versions together'
);

set role app_owner;
update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    state,
    '{items}',
    '[
      {"id":"chicken","name":"Chicken","status":"low","storeId":"store_washington","updatedAt":900,"statusUpdatedAt":900},
      {"id":"cod","name":"Cod","status":"low","storeId":"store_washington","updatedAt":900,"statusUpdatedAt":900},
      {"id":"tuna","name":"Tuna","status":"low","storeId":"store_washington","updatedAt":900,"statusUpdatedAt":900},
      {"id":"future","name":"Future","status":"low","storeId":"store_washington","updatedAt":900,"statusUpdatedAt":900}
    ]'::jsonb
  ),
  '{shoppingStoreAssignments}',
  '[
    {"id":"a-chicken","pantryItemId":"chicken","storeId":"store_washington","active":true,"updatedAt":900},
    {"id":"a-cod","pantryItemId":"cod","storeId":"store_washington","active":true,"updatedAt":900},
    {"id":"a-tuna","pantryItemId":"tuna","storeId":"store_washington","active":true,"updatedAt":900},
    {"id":"a-future","pantryItemId":"future","storeId":"store_washington","active":true,"updatedAt":900}
  ]'::jsonb
), updated_at = 900;
reset role;

select pg_temp.assert_true(
  (select bool_and(item ->> 'status' = 'stocked'
                   and item ->> 'statusClosedTripId' = 'trip-1'
                   and item ->> 'storeId' is null)
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'items') item
   where item ->> 'id' in ('chicken', 'cod', 'tuna')),
  'owner OTA 458 payload cannot reopen completed items'
);
select pg_temp.assert_true(
  (select bool_and(not (assignment ->> 'active')::boolean
                   and assignment ->> 'closedTripId' = 'trip-1')
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'shoppingStoreAssignments') assignment
   where assignment ->> 'pantryItemId' in ('chicken', 'cod', 'tuna')),
  'owner OTA 458 payload cannot reactivate completed assignments'
);

set role app_member;
update public.household_snapshots
set state = (state - 'items' - 'shoppingStoreAssignments' - 'closedTripIds')
  || '{"writer":"second-old-device"}'::jsonb,
    updated_at = 901;
reset role;

select pg_temp.assert_true(
  (select jsonb_array_length(state -> 'items') = 3
          and jsonb_array_length(state -> 'shoppingStoreAssignments') = 3
          and state ->> 'writer' = 'second-old-device'
   from public.household_snapshots),
  'member omission restores terminal records while preserving unrelated fields'
);
select pg_temp.assert_true(
  (select state -> 'closedTripIds' @> '[{"id":"trip-1","deletedAt":200}]'::jsonb
   from public.household_snapshots),
  'member omission cannot strip closed trip history'
);

update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    state,
    '{items}',
    (select jsonb_agg(
      case when item ->> 'id' = 'tuna' then
        (item - 'statusClosedTripId') || '{
          "status":"low",
          "storeId":"store_washington",
          "statusRevision":2,
          "statusBasedOnClosedTripId":"trip-1",
          "statusUpdatedAt":1000,
          "updatedAt":1000
        }'::jsonb
      else item end
    ) from jsonb_array_elements(state -> 'items') item)
  ),
  '{shoppingStoreAssignments}',
  (select jsonb_agg(
    case when assignment ->> 'pantryItemId' = 'tuna' then
      (assignment - 'closedTripId') || '{
        "active":true,
        "revision":2,
        "basedOnClosedTripId":"trip-1",
        "updatedAt":1000
      }'::jsonb
    else assignment end
  ) from jsonb_array_elements(state -> 'shoppingStoreAssignments') assignment)
), updated_at = 1000;

select pg_temp.assert_true(
  (select item ->> 'status' = 'low'
          and item ->> 'statusBasedOnClosedTripId' = 'trip-1'
          and not (item ? 'statusClosedTripId')
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'items') item
   where item ->> 'id' = 'tuna'),
  'causal future need is allowed'
);

update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    jsonb_set(
      state,
      '{items}',
      (select jsonb_agg(
        case when item ->> 'id' = 'tuna' then
          (item - 'statusClosedTripId') || '{
            "status":"stocked",
            "storeId":null,
            "statusRevision":3,
            "statusBasedOnClosedTripId":"trip-1",
            "statusClosedTripId":"trip-2",
            "statusUpdatedAt":1100,
            "updatedAt":1100
          }'::jsonb
        else item end
      ) from jsonb_array_elements(state -> 'items') item)
    ),
    '{shoppingStoreAssignments}',
    (select jsonb_agg(
      case when assignment ->> 'pantryItemId' = 'tuna' then
        (assignment - 'closedTripId') || '{
          "active":false,
          "revision":3,
          "basedOnClosedTripId":"trip-1",
          "closedTripId":"trip-2",
          "updatedAt":1100
        }'::jsonb
      else assignment end
    ) from jsonb_array_elements(state -> 'shoppingStoreAssignments') assignment)
  ),
  '{trips}',
  (state -> 'trips') || '[{"id":"trip-2","completedAt":1100,"purchasedItems":[{"itemId":"tuna","storeId":"store_washington"}]}]'::jsonb
), updated_at = 1100;

select pg_temp.assert_true(
  (select item ->> 'statusClosedTripId' = 'trip-2'
          and item ->> 'statusBasedOnClosedTripId' = 'trip-1'
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'items') item
   where item ->> 'id' = 'tuna'),
  'causal future completion is allowed'
);
select pg_temp.assert_true(
  (select assignment ->> 'closedTripId' = 'trip-2'
          and assignment ->> 'basedOnClosedTripId' = 'trip-1'
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'shoppingStoreAssignments') assignment
   where assignment ->> 'pantryItemId' = 'tuna'),
  'future assignment completion is allowed'
);

set role service_role;
update public.household_snapshots
set state = jsonb_set(state, '{items,0,status}', '"low"'::jsonb), updated_at = 1200;
reset role;

select pg_temp.assert_true(
  (select state #>> '{items,0,status}' = 'stocked' from public.household_snapshots),
  'service-role update is sanitized'
);
select pg_temp.assert_true(
  not has_table_privilege('outsider', 'public.household_snapshots', 'UPDATE'),
  'migration does not grant unauthorized update access'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'private.preserve_completed_shopping_state(jsonb,jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.preserve_completed_shopping_state(jsonb,jsonb)', 'EXECUTE'),
  'helper functions are not client-callable'
);
select pg_temp.assert_true(
  (select state -> 'receipts' = '[{"id":"receipt-1","tripId":"trip-1","amount":74.21}]'::jsonb
          and jsonb_array_length(state -> 'trips') = 2
   from public.household_snapshots),
  'receipt and trip history remain intact'
);

insert into public.household_snapshots (household_id, state, updated_at)
values (
  '22222222-2222-2222-2222-222222222222',
  '{
    "items":[{"id":"lamb","name":"Lamb","status":"low","storeId":"store_washington","updatedAt":10,"statusUpdatedAt":10,"statusRevision":1}],
    "shoppingStoreAssignments":[{"id":"a-lamb","pantryItemId":"lamb","storeId":"store_washington","active":true,"updatedAt":10,"revision":1}],
    "trips":[],"receipts":[],"closedTripIds":[]
  }'::jsonb,
  10
);

set role app_owner;
update public.household_snapshots
set state = '{
  "items":[{"id":"lamb","name":"Lamb","status":"stocked","storeId":null,"updatedAt":20,"statusUpdatedAt":20,"statusRevision":2,"statusClosedTripId":"trip-lamb"}],
  "shoppingStoreAssignments":[{"id":"a-lamb","pantryItemId":"lamb","storeId":"store_washington","active":false,"updatedAt":20,"revision":2,"closedTripId":"trip-lamb"}],
  "trips":[{"id":"trip-lamb","completedAt":20,"purchasedItems":[{"itemId":"lamb","storeId":"store_washington"}]}],
  "receipts":[{"id":"receipt-lamb","tripId":"trip-lamb","amount":12.34}],
  "closedTripIds":[{"id":"trip-lamb","deletedAt":20}]
}'::jsonb, updated_at = 20
where household_id = '22222222-2222-2222-2222-222222222222';
reset role;

select pg_temp.assert_true(
  (select state #>> '{items,0,statusClosedTripId}' = 'trip-lamb'
          and state #>> '{shoppingStoreAssignments,0,closedTripId}' = 'trip-lamb'
   from public.household_snapshots
   where household_id = '22222222-2222-2222-2222-222222222222'),
  'new client can complete Washington Lamb'
);

set role app_member;
update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    state,
    '{items}',
    '[{"id":"lamb","name":"Lamb","status":"low","storeId":"store_washington","updatedAt":9999,"statusUpdatedAt":9999}]'::jsonb
  ),
  '{shoppingStoreAssignments}',
  '[{"id":"a-lamb","pantryItemId":"lamb","storeId":"store_washington","active":true,"updatedAt":9999}]'::jsonb
), updated_at = 9999
where household_id = '22222222-2222-2222-2222-222222222222';
reset role;

select pg_temp.assert_true(
  (select state #>> '{items,0,status}' = 'stocked'
          and state #>> '{items,0,statusClosedTripId}' = 'trip-lamb'
          and not (state #> '{shoppingStoreAssignments,0}' ->> 'active')::boolean
          and state #>> '{shoppingStoreAssignments,0,closedTripId}' = 'trip-lamb'
          and state -> 'receipts' = '[{"id":"receipt-lamb","tripId":"trip-lamb","amount":12.34}]'::jsonb
   from public.household_snapshots
   where household_id = '22222222-2222-2222-2222-222222222222'),
  'member stale active payload with newer timestamps is sanitized'
);

set role app_owner;
insert into public.household_snapshots (household_id, state, updated_at)
values (
  '33333333-3333-3333-3333-333333333333',
  '{
    "items":[{"id":"legacy-lamb","name":"Legacy Lamb","status":"stocked","storeId":null,"updatedAt":30,"statusUpdatedAt":30}],
    "shoppingStoreAssignments":[{"id":"a-legacy-lamb","pantryItemId":"legacy-lamb","storeId":"store_washington","active":false,"updatedAt":30}],
    "trips":[{"id":"trip-legacy-lamb","startedAt":20,"completedAt":30,"purchasedItems":[{"itemId":"legacy-lamb","storeId":"store_washington"}]}],
    "receipts":[],"closedTripIds":[{"id":"trip-legacy-lamb","deletedAt":30}]
  }'::jsonb,
  30
);
reset role;

select pg_temp.assert_true(
  (select state #>> '{items,0,statusClosedTripId}' = 'trip-legacy-lamb'
          and state #>> '{shoppingStoreAssignments,0,closedTripId}' = 'trip-legacy-lamb'
   from public.household_snapshots
   where household_id = '33333333-3333-3333-3333-333333333333'),
  'legacy completed insert is backfilled before persistence'
);

insert into public.household_snapshots (household_id, state, updated_at)
values (
  '44444444-4444-4444-4444-444444444444',
  '{
    "items":[
      {"id":"cod","name":"Cod","status":"low","storeId":"store_washington","updatedAt":100,"statusUpdatedAt":100,"statusRevision":1},
      {"id":"coffee","name":"Coffee","status":"stocked","storeId":null,"quantity":1,"updatedAt":100,"statusUpdatedAt":100,"statusRevision":1}
    ],
    "shoppingStoreAssignments":[
      {"id":"shopping-store:cod:store_washington","pantryItemId":"cod","storeId":"store_washington","active":true,"updatedAt":100,"revision":1}
    ],
    "activeSession":{"status":"shopping_store","tripId":"trip-active","startedAt":100,"storeQueue":["store_washington"],"currentIndex":0,"skippedStoreIds":[],"entries":[{"entryId":"cod","pantryItemId":"cod","name":"Cod","quantity":1,"unit":"unit","storeId":"store_washington","picked":false}],"receipts":[],"completedTrip":null},
    "trips":[],"receipts":[],"closedTripIds":[]
  }'::jsonb,
  100
);

select pg_temp.assert_true(
  (select state ->> 'shoppingEpoch' = '1'
          and state ->> 'activeTripId' = 'trip-active'
          and state #>> '{shoppingStoreAssignments,0,assignmentBasedOnShoppingEpoch}' = '1'
          and state #>> '{shoppingStoreAssignments,0,assignmentBasedOnActiveTripId}' = 'trip-active'
   from public.household_snapshots
   where household_id = '44444444-4444-4444-4444-444444444444'),
  'trip start establishes and stamps the household shopping epoch'
);

set role app_member;
update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    state,
    '{items}',
    '[
      {"id":"cod","name":"Cod","status":"low","storeId":"store_walmart","updatedAt":200,"statusUpdatedAt":200,"statusRevision":2},
      {"id":"coffee","name":"Coffee","status":"stocked","storeId":null,"quantity":2,"updatedAt":200,"statusUpdatedAt":100,"statusRevision":1}
    ]'::jsonb
  ),
  '{shoppingStoreAssignments}',
  (state -> 'shoppingStoreAssignments') || '[{"id":"shopping-store:cod:store_walmart","pantryItemId":"cod","storeId":"store_walmart","active":true,"updatedAt":200,"revision":1}]'::jsonb
), updated_at = 200
where household_id = '44444444-4444-4444-4444-444444444444';
reset role;

select pg_temp.assert_true(
  (select not coalesce((assignment ->> 'active')::boolean, false)
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'shoppingStoreAssignments') assignment
   where s.household_id = '44444444-4444-4444-4444-444444444444'
     and assignment ->> 'storeId' = 'store_walmart'),
  'member stale assignment is sanitized while the trip is active'
);
select pg_temp.assert_true(
  (select state #>> '{items,1,quantity}' = '2'
   from public.household_snapshots
   where household_id = '44444444-4444-4444-4444-444444444444'),
  'unrelated member pantry edit remains valid'
);

set role app_owner;
update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        state,
        '{activeSession}',
        'null'::jsonb
      ),
      '{trips}',
      '[{"id":"trip-active","startedAt":100,"completedAt":300,"purchasedItems":[{"itemId":"cod","storeId":"store_washington"}]}]'::jsonb
    ),
    '{receipts}',
    '[{"id":"receipt-active","tripId":"trip-active","amount":10}]'::jsonb
  ),
  '{closedTripIds}',
  '[{"id":"trip-active","deletedAt":300}]'::jsonb
), updated_at = 300
where household_id = '44444444-4444-4444-4444-444444444444';
reset role;

select pg_temp.assert_true(
  (select state ->> 'shoppingEpoch' = '1'
          and state ->> 'activeTripId' is null
          and state #>> '{items,0,status}' = 'stocked'
          and state #>> '{items,0,storeId}' is null
          and state #>> '{items,0,statusClosedTripId}' = 'trip-active'
          and state -> 'receipts' = '[{"id":"receipt-active","tripId":"trip-active","amount":10}]'::jsonb
   from public.household_snapshots
   where household_id = '44444444-4444-4444-4444-444444444444'),
  'owner completion invalidates stale conflicts without changing receipt history'
);

set role service_role;
update public.household_snapshots
set state = jsonb_set(
  jsonb_set(state, '{items,0,status}', '"low"'::jsonb),
  '{shoppingStoreAssignments}',
  (select jsonb_agg(
    case when assignment ->> 'storeId' = 'store_walmart'
      then (assignment - 'assignmentBasedOnShoppingEpoch' - 'assignmentBasedOnActiveTripId') || '{"active":true,"revision":999,"updatedAt":999}'::jsonb
      else assignment end
  ) from jsonb_array_elements(state -> 'shoppingStoreAssignments') assignment)
), updated_at = 999
where household_id = '44444444-4444-4444-4444-444444444444';
reset role;

select pg_temp.assert_true(
  (select state #>> '{items,0,status}' = 'stocked'
          and not coalesce((assignment ->> 'active')::boolean, false)
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'shoppingStoreAssignments') assignment
   where s.household_id = '44444444-4444-4444-4444-444444444444'
     and assignment ->> 'storeId' = 'store_walmart'),
  'service-role legacy write cannot bypass completion or epoch protection'
);

update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    state,
    '{items,0}',
    ((state #> '{items,0}') - 'statusClosedTripId') || '{"status":"low","storeId":"store_walmart","statusRevision":4,"statusBasedOnClosedTripId":"trip-active","statusUpdatedAt":1000,"updatedAt":1000}'::jsonb
  ),
  '{shoppingStoreAssignments}',
  (select jsonb_agg(
    case when assignment ->> 'storeId' = 'store_walmart'
      then assignment || '{"active":true,"revision":1000,"updatedAt":1000,"assignmentBasedOnShoppingEpoch":1}'::jsonb
      else assignment end
  ) from jsonb_array_elements(state -> 'shoppingStoreAssignments') assignment)
), updated_at = 1000
where household_id = '44444444-4444-4444-4444-444444444444';

select pg_temp.assert_true(
  (select state #>> '{items,0,status}' = 'low'
          and coalesce((assignment ->> 'active')::boolean, false)
          and assignment ->> 'assignmentBasedOnShoppingEpoch' = '1'
   from public.household_snapshots s,
        jsonb_array_elements(s.state -> 'shoppingStoreAssignments') assignment
   where s.household_id = '44444444-4444-4444-4444-444444444444'
     and assignment ->> 'storeId' = 'store_walmart'),
  'causal future re-add after observing completion is allowed'
);

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'private.enforce_shopping_epoch_state(jsonb,jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'private.enforce_shopping_epoch_state(jsonb,jsonb)', 'EXECUTE'),
  'shopping epoch helper is not client-callable'
);
select pg_temp.assert_true(
  (select state #>> '{items,0,statusClosedTripId}' = 'trip-lamb'
   from public.household_snapshots
   where household_id = '22222222-2222-2222-2222-222222222222'),
  'shopping epoch writes remain isolated to the target household'
);

-- ── Stale closed-trip replay: household with a fully-closed trip, where
-- OLD.state has no active session/activeTripId (the resurrection window).
-- A stale device that never received the completion replays its own
-- pre-completion local state: the same tripId in activeSession, the same
-- assignment reactivated, an unrelated item edited in the same payload.

insert into public.household_snapshots (household_id, state, updated_at)
values (
  '55555555-5555-5555-5555-555555555555',
  '{
    "items":[
      {"id":"salmon","name":"Salmon","status":"stocked","storeId":null,"updatedAt":300,"statusUpdatedAt":300,"statusRevision":2,"statusClosedTripId":"trip-salmon"},
      {"id":"other","name":"Other","status":"stocked","storeId":null,"quantity":1,"updatedAt":300,"statusUpdatedAt":300}
    ],
    "shoppingStoreAssignments":[
      {"id":"a-salmon","pantryItemId":"salmon","storeId":"store_washington","active":false,"closedTripId":"trip-salmon","updatedAt":300,"revision":2}
    ],
    "trips":[{"id":"trip-salmon","startedAt":100,"completedAt":300,"purchasedItems":[{"itemId":"salmon","storeId":"store_washington"}]}],
    "receipts":[{"id":"receipt-salmon","tripId":"trip-salmon","amount":18.5}],
    "closedTripIds":[{"id":"trip-salmon","deletedAt":300}],
    "shoppingEpoch":"1","activeTripId":null
  }'::jsonb,
  300
);

-- stale replay from owner: reactivates the closed assignment, reopens the
-- item, resurrects activeSession for the closed trip, and edits an
-- unrelated item in the same payload.
set role app_owner;
update public.household_snapshots
set state = '{
  "activeSession":{"status":"shopping_store","tripId":"trip-salmon","entries":[{"entryId":"e-salmon","pantryItemId":"salmon","name":"Salmon","storeId":"store_washington","quantity":1,"unit":"lb","picked":false}]},
  "items":[
    {"id":"salmon","name":"Salmon","status":"low","storeId":"store_washington","updatedAt":999,"statusUpdatedAt":999},
    {"id":"other","name":"Other","status":"stocked","storeId":null,"quantity":7,"updatedAt":999,"statusUpdatedAt":999}
  ],
  "shoppingStoreAssignments":[{"id":"a-salmon","pantryItemId":"salmon","storeId":"store_washington","active":true,"updatedAt":999,"revision":999}],
  "trips":[],"receipts":[],"closedTripIds":[]
}'::jsonb, updated_at = 999
where household_id = '55555555-5555-5555-5555-555555555555';
reset role;

select pg_temp.assert_true(
  (select state->>'activeTripId' is null and jsonb_typeof(state->'activeSession') is distinct from 'object'
   from public.household_snapshots where household_id = '55555555-5555-5555-5555-555555555555'),
  'stale replay from owner: cannot resurrect activeSession/activeTripId for a closed trip'
);
select pg_temp.assert_true(
  (select state->>'shoppingEpoch' = '1'
   from public.household_snapshots where household_id = '55555555-5555-5555-5555-555555555555'),
  'stale replay from owner: does not change shoppingEpoch'
);
select pg_temp.assert_true(
  (select item->>'status' = 'stocked' and item->>'statusClosedTripId' = 'trip-salmon'
   from public.household_snapshots s, jsonb_array_elements(s.state->'items') item
   where s.household_id = '55555555-5555-5555-5555-555555555555' and item->>'id' = 'salmon'),
  'stale replay from owner: preserves the item completion marker'
);
select pg_temp.assert_true(
  (select not coalesce((assignment->>'active')::boolean, false) and assignment->>'closedTripId' = 'trip-salmon'
   from public.household_snapshots s, jsonb_array_elements(s.state->'shoppingStoreAssignments') assignment
   where s.household_id = '55555555-5555-5555-5555-555555555555' and assignment->>'id' = 'a-salmon'),
  'stale replay from owner: reactivated assignment is discarded, closed record restored'
);
select pg_temp.assert_true(
  (select item->>'quantity' = '7'
   from public.household_snapshots s, jsonb_array_elements(s.state->'items') item
   where s.household_id = '55555555-5555-5555-5555-555555555555' and item->>'id' = 'other'),
  'stale replay from owner: unrelated edit in the same payload still survives'
);
select pg_temp.assert_true(
  (select state -> 'receipts' = '[{"id":"receipt-salmon","tripId":"trip-salmon","amount":18.5}]'::jsonb
   from public.household_snapshots where household_id = '55555555-5555-5555-5555-555555555555'),
  'stale replay from owner: receipt/history preserved'
);

-- repeated replay of the exact same stale payload is idempotent
set role app_owner;
update public.household_snapshots
set state = '{
  "activeSession":{"status":"shopping_store","tripId":"trip-salmon","entries":[{"entryId":"e-salmon","pantryItemId":"salmon","name":"Salmon","storeId":"store_washington","quantity":1,"unit":"lb","picked":false}]},
  "items":[
    {"id":"salmon","name":"Salmon","status":"low","storeId":"store_washington","updatedAt":999,"statusUpdatedAt":999},
    {"id":"other","name":"Other","status":"stocked","storeId":null,"quantity":7,"updatedAt":999,"statusUpdatedAt":999}
  ],
  "shoppingStoreAssignments":[{"id":"a-salmon","pantryItemId":"salmon","storeId":"store_washington","active":true,"updatedAt":999,"revision":999}],
  "trips":[],"receipts":[],"closedTripIds":[]
}'::jsonb, updated_at = 1000
where household_id = '55555555-5555-5555-5555-555555555555';
reset role;

select pg_temp.assert_true(
  (select state->>'activeTripId' is null
     and state->>'shoppingEpoch' = '1'
     and (select not coalesce((assignment->>'active')::boolean, false)
          from jsonb_array_elements(state->'shoppingStoreAssignments') assignment
          where assignment->>'id' = 'a-salmon')
   from public.household_snapshots where household_id = '55555555-5555-5555-5555-555555555555'),
  'repeated stale replay is idempotent'
);

-- stale replay from member
set role app_member;
update public.household_snapshots
set state = '{
  "activeSession":{"status":"shopping_store","tripId":"trip-salmon","entries":[{"entryId":"e-salmon","pantryItemId":"salmon","name":"Salmon","storeId":"store_washington","quantity":1,"unit":"lb","picked":false}]},
  "items":[{"id":"salmon","name":"Salmon","status":"low","storeId":"store_washington","updatedAt":1100,"statusUpdatedAt":1100}],
  "shoppingStoreAssignments":[{"id":"a-salmon","pantryItemId":"salmon","storeId":"store_washington","active":true,"updatedAt":1100,"revision":1100}],
  "trips":[],"receipts":[],"closedTripIds":[]
}'::jsonb, updated_at = 1100
where household_id = '55555555-5555-5555-5555-555555555555';
reset role;

select pg_temp.assert_true(
  (select state->>'activeTripId' is null and state->>'shoppingEpoch' = '1'
   from public.household_snapshots where household_id = '55555555-5555-5555-5555-555555555555'),
  'stale replay from member is rejected the same way as owner'
);
select pg_temp.assert_true(
  (select not coalesce((assignment->>'active')::boolean, false)
   from public.household_snapshots s, jsonb_array_elements(s.state->'shoppingStoreAssignments') assignment
   where s.household_id = '55555555-5555-5555-5555-555555555555' and assignment->>'id' = 'a-salmon'),
  'stale replay from member: assignment stays discarded'
);

-- stale replay through the service-role path (legacy device / background sync)
set role service_role;
update public.household_snapshots
set state = '{
  "activeSession":{"status":"shopping_store","tripId":"trip-salmon","entries":[{"entryId":"e-salmon","pantryItemId":"salmon","name":"Salmon","storeId":"store_washington","quantity":1,"unit":"lb","picked":false}]},
  "items":[{"id":"salmon","name":"Salmon","status":"low","storeId":"store_washington","updatedAt":1200,"statusUpdatedAt":1200}],
  "shoppingStoreAssignments":[{"id":"a-salmon","pantryItemId":"salmon","storeId":"store_washington","active":true,"updatedAt":1200,"revision":1200}],
  "trips":[],"receipts":[],"closedTripIds":[]
}'::jsonb, updated_at = 1200
where household_id = '55555555-5555-5555-5555-555555555555';
reset role;

select pg_temp.assert_true(
  (select state->>'activeTripId' is null and state->>'shoppingEpoch' = '1'
   from public.household_snapshots where household_id = '55555555-5555-5555-5555-555555555555'),
  'stale replay through service-role path is rejected the same way'
);
select pg_temp.assert_true(
  (select not coalesce((assignment->>'active')::boolean, false)
   from public.household_snapshots s, jsonb_array_elements(s.state->'shoppingStoreAssignments') assignment
   where s.household_id = '55555555-5555-5555-5555-555555555555' and assignment->>'id' = 'a-salmon'),
  'stale replay through service-role path: assignment stays discarded'
);

-- genuinely new future trip id (never seen before) still starts normally
set role app_owner;
update public.household_snapshots
set state = jsonb_set(
  jsonb_set(
    state,
    '{activeSession}',
    '{"status":"shopping_store","tripId":"trip-salmon-2","entries":[{"entryId":"e-salmon2","pantryItemId":"salmon","name":"Salmon","storeId":"store_washington","quantity":1,"unit":"lb","picked":false}]}'::jsonb
  ),
  '{shoppingStoreAssignments}',
  (state -> 'shoppingStoreAssignments') || '[{"id":"a-salmon-2","pantryItemId":"salmon","storeId":"store_washington","active":true,"updatedAt":1300,"revision":1}]'::jsonb
), updated_at = 1300
where household_id = '55555555-5555-5555-5555-555555555555';
reset role;

select pg_temp.assert_true(
  (select state->>'activeTripId' = 'trip-salmon-2' and state->>'shoppingEpoch' = '2'
   from public.household_snapshots where household_id = '55555555-5555-5555-5555-555555555555'),
  'a genuinely new, never-closed trip id still starts normally and increments the epoch'
);
select pg_temp.assert_true(
  (select coalesce((assignment->>'active')::boolean, false)
     and assignment->>'assignmentBasedOnShoppingEpoch' = '2'
   from public.household_snapshots s, jsonb_array_elements(s.state->'shoppingStoreAssignments') assignment
   where s.household_id = '55555555-5555-5555-5555-555555555555' and assignment->>'id' = 'a-salmon-2'),
  'the new trip''s assignment is stamped with the new epoch, not blocked'
);
