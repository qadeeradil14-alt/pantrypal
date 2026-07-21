# Stokit Golden Baseline

## Current Golden

- OTA: 373
- Build: 112 (iOS, TestFlight) — unchanged, no native config changed since OTA 368
- App: Stokit (`com.hewadadil.pantrypal`)
- Branch: production
- Runtime: 1.0.0
- Update group: 9b047060-bf50-45f3-a7a0-08f976b6d5df
- iOS update ID: 019f8522-b87b-77b5-ac27-9a5ff1009d45
- Android update ID: 019f8522-b87b-7932-9439-158d478be70d
- Message: OTA 373: sort Home shopping-needed list alphabetically for cross-device consistency
- Build commit (icon fix, native, unchanged): 9bd7093803e3ff068d33171b5c3d87d76336d92b
- OTA commit (JS, same lineage): b41e90c
- Golden tag: stokit-golden-ota373
- Golden branch: golden/stokit-main-ota373

## Why This Is Golden

- Includes all production fixes through OTA 373 (plus native build 112, unchanged).
- Push notifications no longer self-notify the sender: notify-shopping, notify-low-item,
  and notify-store-arrival Edge Functions all exclude the sender by verified user_id and
  dedupe recipient push tokens (OTA-independent, Edge Functions deployed directly).
- Push-token ownership is now enforced at the database level: a `household_members`
  trigger atomically clears a token from any other user's rows the instant it's claimed
  by the current owner, closing the "Sarah signs into James's old phone" self-notify case
  that token-dedupe alone couldn't fix. Sign-out also clears the signed-out user's own
  token. One-time cleanup applied to existing stale rows.
- Pantry status, Home's "needed" list, the pre-trip shopping plan, and the active shopping
  session's per-store items all now sort alphabetically by item name — previously each
  showed local array order, which differed device to device even when the underlying
  data matched exactly.
- Preserves all prior production behavior: shopping, receipts, sync, geofencing, family
  notifications, app icon, auth email verification.

## Verification

- Typecheck passed (`npx tsc --noEmit`, 0 errors) after every change in this lineage.
- Notification-related unit tests passed (notifications, notification-function-errors,
  shopping-notification, shopping-alert-dedupe): 34/35 — the 1 failure is a pre-existing
  `tslib`/`tsx` module-loader crash unrelated to these changes (fails before any test body
  runs; none of the failing test's imports touch the edited files).
- Shopping-machine / shopping-entry-sync / shopping-sync-convergence tests: 60/60 passed
  after the list-ordering fix.
- Manually verified on two physical devices: notification self-exclusion, and matching
  list order for Pantry status, Home's needed list, the pre-trip plan, and active shopping
  — all confirmed working across both devices.
- Supabase migration `20260721090000_push_token_single_owner.sql` applied to production
  (`pantrypal` project, ref `yndhbbnstqqsrqjelejg`) via `supabase db push`, isolated from
  unrelated pre-existing migration-history drift on that project (documented separately;
  not part of this baseline).
- Edge Functions `notify-shopping`, `notify-low-item`, `notify-store-arrival` deployed to
  production via `supabase functions deploy`.

## Recovery

- Restore from Git tag `stokit-golden-ota373` or branch `golden/stokit-main-ota373`.
- Publish the restored code as a new production OTA; EAS OTA numbers are append-only.
- Do not delete older EAS update history or older golden tags/branches
  (`stokit-golden-ota359`, `stokit-golden-ota368` still present).
- Restoring code alone does not reapply the Supabase migration or redeploy the Edge
  Functions if they were ever rolled back — those live in the `pantrypal` Supabase
  project (ref `yndhbbnstqqsrqjelejg`), not purely in this repo's working tree, though
  the migration file and function source are both tracked in this repo under
  `supabase/migrations/` and `supabase/functions/`.
