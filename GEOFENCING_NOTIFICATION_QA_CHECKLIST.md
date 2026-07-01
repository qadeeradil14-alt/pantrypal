# Geofencing / Store Arrival / Notifications — QA Checklist

> Prepared 2026-06-20. Report only — no app code, app logic, or OTA was changed
> to produce this document. Cross-referenced as P1 in [RELEASE_BOARD.md](RELEASE_BOARD.md) §3.
> Grounded directly in source: `apps/stokit-v2/core/services/geofencing.ts`,
> `core/services/geofencingLogic.ts`, `core/services/notifications.ts`,
> `app/(tabs)/settings.tsx`, `app/_layout.tsx`, `app.json`,
> `supabase/migrations/009_store_arrivals.sql`,
> `011_store_arrival_webhook.sql`, `012_store_arrival_notify_trigger.sql`,
> `020_store_arrival_actor_name.sql`, `supabase/functions/notify-store-arrival/index.ts`,
> `tests/geofencing.test.ts`.

**Feature is opt-in and off by default** — a Settings toggle under "Privacy"
(`geofenceOn`, intentionally placed subtly per an inline code comment) calls
`startGeofencing` / `stopGeofencing`. Nothing in this feature runs unless the
user explicitly turns it on.

---

## 1. Permission prompts

- [ ] **[Simulator]** Toggle on with location permission never previously granted → iOS foreground prompt appears first (`requestForegroundPermissionsAsync`), **then** the background "Always" prompt (`requestBackgroundPermissionsAsync`) — confirm the two-step order, not a single combined prompt.
- [ ] **[Simulator]** Toggle on with notification permission never previously granted → notification permission is requested (`requestNotificationPermission`) as part of the same flow.
- [ ] **[Simulator]** Deny foreground location → Alert "Location permission needed" / *"Allow 'Always' location access in Settings to enable store arrival reminders."* appears, toggle snaps back off.
- [ ] **[Simulator]** Grant foreground, deny background ("Always") → same alert as above; confirm the foreground-only grant doesn't get silently treated as success.
- [ ] **[Simulator]** Deny notifications → Alert "Notification permission needed" / *"Allow notifications in Settings so Stokit can remind you when you arrive at a store."*
- [ ] **[Real device]** From iOS Settings, downgrade a previously-granted "Always" location grant to "While Using" → re-toggling (or the next app launch) should surface a clear re-prompt path, not a silent failure. iOS permission-change propagation timing can differ from the Simulator.
- [ ] **[Real device]** From iOS Settings, fully revoke notifications after granting → confirm the app detects this on next toggle attempt (`getPermissionsAsync` re-check in `requestNotificationPermission`), not just at first-grant time.

## 2. Toggle behavior in Settings

- [ ] **[Simulator]** Toggle on with zero GPS-coordinate stores → Alert "No store coordinates" / *"Add stores using 'Find stores near me' first…"* — **no permission prompts fire** (this check happens before `startGeofencing` is called).
- [ ] **[Simulator]** Toggle reflects actual running state on screen mount (`isGeofencingRunning()` check in a `useEffect`) — force-quit and relaunch with geofencing previously on, confirm the switch shows **on**, not reset to off.
- [ ] **[Simulator]** Toggle off → `stopGeofencing()` resolves and switch shows off immediately; no leftover loading spinner state (`geofenceLoading`).
- [ ] **Gap to confirm, not just observe:** `startGeofencing()` has 5 possible outcomes (`'ok' | 'no_permission' | 'no_notification_permission' | 'no_stores' | 'expo_go'`). Only the first two failure cases show an alert. If `'no_stores'` or `'expo_go'` is ever reached through this UI path, the switch silently turns itself back off with **zero explanation** to the user. `'no_stores'` should be unreachable here (the pre-check above already filters on the same lat/lng condition), but confirm this holds — and confirm whether the toggle is *fully* inert in Expo Go (`disabled={geofenceLoading || inExpoGo}`) or whether a fast double-tap can race past the `disabled` prop.
- [ ] **[Simulator]** "Wipe shared pantry" / "Wipe all local data" / "Log out" flows each call `stopGeofencing()` as a cleanup step — confirm geofencing is actually stopped (not just attempted) after each of these three destructive actions, since all three swallow errors via `.catch(() => {})`.

## 3. Foreground arrival test

- [ ] **[Simulator]** Using Simulator's Debug → Location → Custom Location (or a GPX route) set to a saved store's exact coordinates while the app is open and foregrounded → confirm the local notification (`notifyArrival`) fires, but only if that store has at least one `low` or `expiring` item (`arrivalItemCount`); zero-item stores must produce **no** notification.
- [ ] **[Simulator]** Title reads `🛒 You're near {storeName}`, body is grammatically correct for both singular (1 item) and plural (2+ items) item counts.
- [ ] **[Real device]** True foreground arrival by physically walking/driving to a real store — Simulator location spoofing does not exercise the real `Location.startGeofencingAsync` region-monitoring engine, only `getCurrentPositionAsync`-style reads. This is the first point where Simulator testing becomes a poor proxy for the real geofencing API.
- [ ] **[Real device]** Two saved stores within ~150–300m of each other (or one store, two nearby chains) → confirm the nearest-store haversine check in `defineGeofenceTask` correctly attributes the arrival and does not fire for the farther store.

## 4. Background arrival test

- [ ] **Requires a native build — not testable in Expo Go.** `geofencing.ts`'s own header comment states the background task "will not fire when the app is closed" under Expo Go; this applies to backgrounded-but-not-killed as well as fully closed.
- [ ] **[Real device, native build]** Background the app (don't kill it), physically arrive at a geofenced store → confirm `notifyArrival` still fires from the background `TaskManager` task, and that the Supabase `store_arrivals` insert still succeeds from the background context.
- [ ] **[Real device, native build]** Confirm Xcode's Background Modes capability ("Location updates") is actually enabled in the native build — `geofencing.ts`'s production-checklist note explicitly flags this as a manual step that's easy to forget and won't show up as a JS-level error if missing.
- [ ] **[Real device, native build]** Verify the item-count read at fire-time. `app/_layout.tsx` wires `defineGeofenceTask` to read `useDurableStore.getState()` live (not a stale snapshot) — confirm that if the background relaunch happens *before* the durable store finishes rehydrating from `AsyncStorage`, the notification doesn't silently under-count or suppress (e.g., compute against an empty/default store). This is a real race-condition risk that can't be observed by toggling the feature in the foreground.

## 5. App-killed arrival test, if supported

- [ ] **Requires a native build — not testable in Expo Go or the Simulator's normal flow.**
- [ ] **[Real device, native build]** Force-quit (swipe away, not just background) the app, then physically arrive at a geofenced store. iOS *can* relaunch an app in the background for a region-monitoring event even after termination — confirm this actually happens for this app (it has never been tested on this branch) and that `defineGeofenceTask` (registered at module load in `_layout.tsx`) re-attaches correctly on that relaunch.
- [ ] **[Real device, native build]** If the killed-app relaunch does fire, confirm the Supabase insert and any cross-device push still complete — a cold relaunch may have a narrower OS-imposed execution window than a normal background wake.
- [ ] If this scenario does **not** fire reliably on iOS for this app, that is a legitimate "not supported" finding to record here — don't treat a no-op as a bug without first confirming Apple's documented constraints on killed-app region-event relaunches.

## 6. Wrong-store false-positive test

- [ ] **[Real device]** Arrive at Store A's geofence while Store B (a different chain) is also within range → confirm the nearest-store haversine check in `defineGeofenceTask` attributes the arrival to whichever store is *physically* closer at that moment, not whichever region the OS happened to report first.
- [ ] **Source-code finding, verify before relying on device behavior alone:** `QA_APP_STORE_FINAL_RELEASE.md` describes a named guard **G3** — a ~25-second "stabilization"/dwell-time window meant to suppress notifications from simply driving past a store. **This guard was not found anywhere in the current `geofencing.ts`.** The only guards present in code are the nearest-store check and a 3-minute **per-store** debounce. Before testing "drive past without stopping," confirm in code review whether G3 exists under a different name/file, or was never ported from V1 to V2 — a device test that happens to "pass" (no notification while driving past) could simply be luck/timing, not an actual guard.
- [ ] **[Real device]** Drive past a store without stopping (under ~10–15 seconds in the geofence radius) → record whether a notification fires. Given the prior finding, expect this may **not** be suppressed — treat an unexpected notification here as confirming the G3 gap, not as a surprise bug.

## 7. Nearby-store ambiguity test

- [ ] **[Real device]** Two saved stores both within geofence radius of each other (e.g., two big-box stores sharing a shopping-center parking lot) → confirm only the nearer store's arrival notification fires, per the haversine check.
- [ ] **[Real device or careful Simulator setup]** With more than 20 GPS-coordinate stores saved on iOS (`MAX_GEOFENCES_IOS`), confirm `geofenceableStores` truncates to the first 20 by list order, and that a store excluded by the cap simply never geofences (silently, no error) — verify this silent-exclusion behavior is acceptable, since a user with 21+ stores would otherwise have no indication some stores are excluded.
- [ ] **Source-code finding, same caveat as §6:** `QA_APP_STORE_FINAL_RELEASE.md`'s **G4** guard ("active shopping at a different store") and **global 5-minute cross-store cooldown** were not found in `geofencing.ts`. No interaction was found between the geofencing feature and the active-shopping-session state machine. If a user is mid-trip at Store A and walks near Store B, current code has no guard preventing a Store B arrival notification from also firing — confirm whether this is intended product behavior or a gap, before treating a device test result as a real verification one way or the other.

## 8. Household member notification test

- [ ] **[Real device, 2 physical devices/accounts in the same household, at least one push token registered]** Member A arrives at a geofenced store → Member B (different device, app backgrounded or closed) receives an Expo push notification.
- [ ] **[Real device]** Confirm push title/body match the edge function's copy (actor name + store name) and that the arriving member (`arrived_by`) is correctly excluded from their own push (`.neq('user_id', record.arrived_by ?? '')` in `notify-store-arrival/index.ts`).
- [ ] **[Real device]** Member with no registered push token (`push_token IS NULL`) → confirm they're silently skipped, not sent a broken/empty push.
- [ ] **Architecture finding — verify in the live Supabase project, not just by reading code:** Two parallel mechanisms exist for triggering the push: a Supabase **Dashboard webhook** (`011_store_arrival_webhook.sql` — described as "configured in the dashboard, not via SQL," i.e. a manual setup step) and a SQL **`AFTER INSERT` trigger** calling the same edge function directly via `pg_net` (`012_store_arrival_notify_trigger.sql`, fully self-contained in code). **If both are active in the actual project, every arrival fires two pushes to every household member.** This must be checked directly in the Supabase Dashboard's Database → Webhooks panel — it cannot be determined from the migration files alone, since 011 is explicitly a reference-only comment, not enforced SQL.
- [ ] **[Real device]** Webhook signature check: `notify-store-arrival/index.ts` fails closed (`500`) if `WEBHOOK_SECRET` isn't set, and returns `401` on a signature mismatch — confirm the secret is actually configured in the deployed edge function's environment, since a misconfiguration here fails *silently* from the app's perspective (the INSERT still succeeds; only the push silently never arrives).

## 9. Notification tap behavior

- [ ] **Confirmed gap — no code exists for this today.** A repo-wide search for `addNotificationResponseReceivedListener` (or any notification-response/tap handler) returned no matches anywhere in `app/`, `core/`, `components/`, `store/`, or `lib/`. Both notification paths attach a `data` payload meant to be consumed on tap — the local arrival notification carries `{ storeName }`, and the push payload carries `{ type: 'partner_arrival', storeId, householdId, arrivalId, actorName, arrivedAt }` — but nothing in the client reads either payload. Tapping either notification today just opens the app to its default route (whatever the OS/last-state would normally show), **not** a deep link to the relevant store or shopping list.
- [ ] **[Simulator]** Confirm this default (no-op) behavior explicitly: tap the local arrival notification, record exactly which screen the app lands on.
- [ ] **[Real device]** Confirm the same for the cross-device push notification (`partner_arrival`).
- [ ] If deep-linking to the relevant store/list on tap is intended product behavior (the payload shape strongly suggests it was planned), this should be logged as a P1/P2 follow-up — it is a missing feature, not a flaky one, so no amount of additional device testing will "find" the fix.

## 10. Privacy copy / App Store review risk

- [ ] **[Simulator]** `NSLocationWhenInUseUsageDescription` (`app.json`): *"Stokit uses your location to find nearby grocery stores."* — confirm this exact string is what the iOS foreground prompt shows.
- [ ] **[Simulator]** `NSLocationAlwaysAndWhenInUseUsageDescription`: *"Stokit uses your location to remind you when you arrive at a store where you have items."* — confirm shown verbatim at the background prompt.
- [ ] **[Simulator]** `expo-location` plugin's `locationAlwaysAndWhenInUsePermission` string (*"Stokit uses background location to remind you when you arrive at a store where you have items."*) is a close paraphrase of the Info.plist string above — confirm Apple doesn't surface both as separate redundant prompts; if it does, the slight wording mismatch could read as inconsistent to a reviewer.
- [ ] **Administrative, not a device test (cross-ref `RELEASE_BOARD.md` §7):** App Store Connect's "Background location justification" review note and the Privacy "nutrition label" entry for precise location are both still **not drafted/not confirmed** per `RELEASE_BOARD.md` §7 — this checklist's findings (background task behavior, household push, precise-vs-approximate handling) are exactly the material that review note needs to cite. Apple reviews `NSLocationAlwaysUsageDescription` apps closely; a missing or vague justification note is a documented, common rejection reason for this permission class specifically.
- [ ] **[Real device]** Precise Location toggled off for this app in iOS Settings → confirm the in-app copy/behavior doesn't claim a precision the OS isn't actually providing (no app-level handling for reduced accuracy was found in `geofencing.ts`; region-monitoring precision is entirely OS-governed in this case).
- [ ] **[Real device]** Notification copy itself (`🛒 You're near {storeName}`, partner-arrival push body) should be reviewed as user-facing privacy-adjacent copy too — it reveals one household member's real-time location to another. Confirm this sharing behavior is disclosed somewhere the user actually sees before opting in (the Settings toggle copy, not just this checklist).

---

## Simulator vs. real-device summary

**Testable now, in the iOS Simulator:**
- All permission-prompt copy and sequencing (§1)
- Toggle on/off happy path, including the zero-GPS-store and Expo-Go-disabled states (§2)
- Foreground arrival using a spoofed/custom location while the app is open (§3) — with the caveat that Simulator location spoofing exercises `getCurrentPositionAsync`-style reads well, but does **not** exercise the real `Location.startGeofencingAsync` OS region-monitoring engine the same way a physical GPS radius crossing does
- Notification tap default (no-op) behavior, since this is a client-only routing gap, not a hardware-dependent one (§9)
- All `app.json` permission-string copy review (§10)

**Requires a real device:**
- Anything behind a native build at all — Expo Go cannot run the background `TaskManager` task while closed, full stop (§4, §5)
- True background arrival (app backgrounded, not killed) (§4)
- True app-killed arrival, if iOS supports relaunch-on-region-event for this app (§5) — unconfirmed either way on this branch
- Real GPS movement through overlapping/adjacent geofences for the false-positive and ambiguity tests (§6, §7) — Simulator can teleport a coordinate but can't reproduce real-world GPS jitter, dwell time, or drive-by speed, which is exactly what the (possibly-missing) G3 stabilization guard is meant to handle
- Cross-device household push delivery, which inherently needs a second physical device/account (§8)
- Reduced-accuracy / Precise-Location-off behavior, since the Simulator's location spoofing doesn't model OS-level accuracy degradation (§10)

**Needs a source/config audit, not a device test at all** (a passing device test cannot confirm these):
- Whether the G3 stabilization window and global cross-store cooldown described in `QA_APP_STORE_FINAL_RELEASE.md` exist anywhere in the V2 codebase (§6, §7)
- Whether the Supabase Dashboard webhook (migration 011) is actually configured and live alongside the SQL trigger (migration 012) — a double-notification risk that only shows up as an intermittent-looking device symptom unless checked directly in the dashboard (§8)
