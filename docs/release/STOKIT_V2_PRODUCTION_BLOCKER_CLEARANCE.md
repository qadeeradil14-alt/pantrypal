# Stokit V2 Production Blocker Clearance

Audit date: 2026-07-14
Candidate: `release/stokit-v2-candidate`
Golden baseline: `stokit-redesign-golden-ota333` / `d1934a43a86f96eb3663ec44311bdb336a5e0139`

No EAS build, OTA publish, production data change, migration, or production merge was performed.

## 1. Production identity — PASS

Resolved from the candidate with `APP_VARIANT` unset:

- Name: `Stokit`
- Bundle ID: `com.hewadadil.pantrypal`
- Scheme: `pantrypal`
- Channel: `production`
- Version/runtime: `1.0.0` with app-version runtime policy
- EAS project: `3d19b1e1-1003-4e33-8929-2d27e7fd7f3c`
- Widget bundle: `com.hewadadil.pantrypal.widgets`

The `redesignTest` profile is the only profile that sets `APP_VARIANT=redesign`; the production profile does not.

## 2. Production App Group entitlement — FIXED, MANUAL ACTION REQUIRED

Before this correction, resolved production config had no app-target application-group entitlement while its widget had `group.com.hewadadil.pantrypal`.

`app.config.ts` now applies `group.com.hewadadil.pantrypal` only when `APP_VARIANT` is not `redesign`. The redesign app and widget continue to resolve only to `group.com.hewadadil.stokit.redesign`.

A clean temporary iOS prebuild generated:

- `ios/Stokit/Stokit.entitlements`: production App Group plus APS development entitlement
- `ios/ExpoWidgetsTarget/ExpoWidgetsTarget.entitlements`: production App Group

Manual Apple Developer action is still required before any build:

1. Open Certificates, Identifiers & Profiles → Identifiers → `com.hewadadil.pantrypal`.
2. Confirm Push Notifications is enabled and App Groups includes only `group.com.hewadadil.pantrypal` for this release.
3. Open `com.hewadadil.pantrypal.widgets` and confirm it is attached to `group.com.hewadadil.pantrypal`.
4. Regenerate/select provisioning profiles for both targets after confirming capabilities.
5. Confirm the redesign App ID remains attached only to `group.com.hewadadil.stokit.redesign`.

## 3. Supabase identity and V2 compatibility — PASS, MANUAL ACTION REQUIRED

EAS production and preview environment values resolve to the same active Supabase project:

- Project ref: `yndhbbnstqqsrqjelejg` (`pantrypal`, `us-east-1`)
- Supabase URL hashes match.
- Anon-key hashes match.

Live read-only database evidence:

- `household_snapshots` exists, is RLS-enabled, has six rows, and is in the realtime publication.
- Required household functions exist: `my_household`, `ensure_personal_household`, `join_household_by_code`, `remove_household_member`, `transfer_household_ownership`, `delete_shared_household`, and `rename_me`.
- Live migration history includes household role architecture, profile avatars, deterministic household sync, and client crash reports.
- The private `avatars` and `receipts` buckets exist; avatar household-read and owner write/delete policies exist.
- Active `notify-shopping` and receipt/notification Edge Functions are deployed.
- Golden-client source has hydration-before-write and empty-snapshot push blocking.
- Golden-client source has no replica or Lamport reference. The legacy replica table exists but has zero rows. Its freeze policy is scoped to a historical household, so it is not a global backend disablement.

Manual Supabase Dashboard action required:

1. Authentication → URL Configuration → Redirect URLs.
2. Confirm `pantrypal://auth/callback` is present.
3. Record the result in the final TestFlight evidence. The public Auth settings endpoint does not expose the redirect allow-list.

## 4. APNs and provisioning — MANUAL ACTION REQUIRED

Noninteractive EAS inspection confirms the production build profile and production channel, but cannot reveal the Apple credential inventory or APNs topic assignment. No credential action was taken.

Required interactive verification:

1. In EAS Credentials, select iOS production credentials for `com.hewadadil.pantrypal`.
2. Verify a valid push key/certificate and provisioning profile are assigned to the production app target.
3. Verify the provisioned APS environment and topic are `com.hewadadil.pantrypal`.
4. Verify the widget profile has the production App Group entitlement.
5. Verify no credential/profile for `com.hewadadil.stokit.redesign` is selected for the production targets.

## Release decision

First internal TestFlight build: **NO-GO** until the Apple App ID/profile/APNs checks and Supabase redirect allow-list check are recorded as passed. No backend migration is currently authorized or required by this audit.
