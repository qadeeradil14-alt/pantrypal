create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role app_owner nologin;
create role app_member nologin;
create role outsider nologin;

create schema private;

create table public.household_snapshots (
  household_id uuid primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0
);

grant select, insert, update on public.household_snapshots to app_owner, app_member, service_role;

insert into public.household_snapshots (household_id, state, updated_at)
values (
  '11111111-1111-1111-1111-111111111111',
  $json$
  {
    "items": [
      {"id":"chicken","name":"Chicken","status":"stocked","storeId":null,"updatedAt":200,"statusUpdatedAt":200},
      {"id":"cod","name":"Cod","status":"stocked","storeId":null,"updatedAt":200,"statusUpdatedAt":200},
      {"id":"tuna","name":"Tuna","status":"stocked","storeId":null,"updatedAt":200,"statusUpdatedAt":200},
      {"id":"ambiguous","name":"Ambiguous","status":"stocked","storeId":null,"updatedAt":9000,"statusUpdatedAt":9000},
      {"id":"future","name":"Future","status":"low","storeId":"store_washington","updatedAt":300,"statusUpdatedAt":300}
    ],
    "shoppingStoreAssignments": [
      {"id":"a-chicken","pantryItemId":"chicken","storeId":"store_washington","active":false,"updatedAt":200},
      {"id":"a-cod","pantryItemId":"cod","storeId":"store_washington","active":false,"updatedAt":200},
      {"id":"a-tuna","pantryItemId":"tuna","storeId":"store_washington","active":false,"updatedAt":200},
      {"id":"a-ambiguous","pantryItemId":"ambiguous","storeId":"store_washington","active":false,"updatedAt":9000},
      {"id":"a-future","pantryItemId":"future","storeId":"store_washington","active":true,"updatedAt":300}
    ],
    "trips": [{"id":"trip-1","startedAt":100,"completedAt":200,"purchasedItems":[
      {"itemId":"chicken","storeId":"store_washington"},
      {"itemId":"cod","storeId":"store_washington"},
      {"itemId":"tuna","storeId":"store_washington"},
      {"itemId":"ambiguous","storeId":"store_washington"}
    ]}],
    "receipts": [{"id":"receipt-1","tripId":"trip-1","amount":74.21}],
    "closedTripIds": [{"id":"trip-1","deletedAt":200}],
    "updatedAt":300
  }
  $json$::jsonb,
  300
);
