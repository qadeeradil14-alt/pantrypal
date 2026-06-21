# Stokit — Release Board

> Single source of truth for release readiness before App Store submission.
> Generated 2026-06-19 from: `BUG_LIST.md`, `TESTING_PLAYBOOK.md`,
> `QA_APP_STORE_FINAL_RELEASE.md`, `APP_STORE_WORKFLOW_QA_CHECKLIST.md`,
> `docs/ai/QA_AND_RELEASE_PROTOCOL.md`, `docs/ai/EAS_BUILD_VS_UPDATE_PROTOCOL.md`,
> and `git log` / OTA history. No app code was changed to produce this document.
>
> **Updated 2026-06-21** — OTA bumped to 153 (store-logo fallback fix); branch
> pushed to `origin/shopping-engine-v2`. No app code was changed to produce this update.

---

## 1. Current Release Status

| Field | Value |
|---|---|
| Current OTA | **153** (`apps/stokit-v2/constants/version.ts`, `OTA_SEQ`) |
| Current branch | `shopping-engine-v2` |
| Branch sync | Pushed to `origin/shopping-engine-v2` — 0 ahead / 0 behind |
| Latest commit | `0e8fe7d` — "chore: bump OTA_SEQ to 153 (store-logo fallback fix)" |
| Latest app-code commit | `be4be5c` — stop guessing a domain for unknown-store logos (OTA 153) |
| App Store readiness | **Not ready.** One P0 (submission-risk) item open, several P1 items unverified, App Store Connect operational checklist (§7) largely unconfirmed. Last documented TestFlight build (33) and the QA sign-off doc both predate the current branch and OTA 143–153 work — a fresh native build + full regression pass is required before submission. |

---

## 2. P0 — Release Blockers

*Definition: app crashes, data loss, login failure, household corruption, shopping-session corruption, payment/submission blockers.*

| Issue | Why P0 | Source |
|---|---|---|
| `reset-password.tsx` flow has **no QA coverage anywhere** (deep-link token handling, expired/invalid token, success routing) | Apple App Review routinely tests "I forgot my password" during submission review — a broken or missing flow is a common, well-documented rejection reason. This is a submission blocker, not a UX nit. | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §1 (explicitly flagged "P0 risk") |

No crash, data-loss, login-failure, or household/shopping-session corruption bugs are currently open per the inspected docs — the last logged crash-class fixes (geofence/widget guards) already shipped in earlier OTAs (124, 125).

---

## 3. P1 — Core Workflow Issues

*Definition: major shopping, pantry, receipt, household, or sync flows that affect real-world use.*

| Issue | Status | Source |
|---|---|---|
| Barcode scanner product recognition | **Disputed.** `BUG_LIST.md` claims fixed (UPC padding); `TESTING_PLAYBOOK.md` lists it pending. No OTA/commit evidence settles it. Needs live verification. | `BUG_LIST.md` #1 vs `TESTING_PLAYBOOK.md` #1 |
| Receipt budget bar refresh after save | Marked fixed twice before (Build 32, then again in `BUG_LIST.md`), but flagged again in the newest checklist as "previously a recurring regression — re-verify." Pattern suggests this regresses repeatedly. | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2, `BUG_LIST.md` #4 |
| Receipt delete button | `BUG_LIST.md` claims fixed; newest checklist says "re-verify, not re-confirmed this session." | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2, `BUG_LIST.md` #3 |
| Receipt parsing (store name + total) | Marked fixed in `BUG_LIST.md` #5 ("deployed already"); newest checklist still says re-verify. Wrong parsing silently corrupts budget totals. | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2, `BUG_LIST.md` #5 |
| `verify-email.tsx` has no QA coverage anywhere (resend rate-limit, deep-link confirm, app-close-before-verify, already-verified re-entry) | Signup flow gap — a stuck/looping verification screen blocks account creation entirely. | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §1 |
| `stores.tsx` — editing a store persists correctly; deleting requires confirmation | No dedicated tab-level QA pass exists; only the underlying search/location logic is covered elsewhere. | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2 |
| `app.json` → `ios.icon` decision (string vs. adaptive light/dark object from commit `d5550e1`) undecided | Doesn't block OTA (already collapsed to a string to unblock manifest validation), but **must** be decided before the next native build — and a native build is required to submit to the App Store. | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §4, OTA-log memory |
| `BUG_LIST.md` and `TESTING_PLAYBOOK.md` are stale and contradict each other on bug status | Cannot be trusted for current bug status without reconciliation — see §contradictions below. Tagged P1 in the source checklist itself. | `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §0 |
| Location permission flow — staged foreground→background request, 5 possible `startGeofencing()` outcomes | Only 2 of 5 outcomes (`no_permission`, `no_notification_permission`) show the user an explanatory alert in Settings; `no_stores` and `expo_go` silently leave the toggle off with no message. Never tested end-to-end on a real device across the iOS permission combinations (Allow Once / While Using / Don't Allow / Always, including downgrading "Always" back to "While Using" after granting). | `core/services/geofencing.ts` (`startGeofencing`), `app/(tabs)/settings.tsx` (`toggleGeofence`); see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §1–2 |
| Store arrival detection — 150m geofence regions, nearest-store anti-bleed check, capped at 20 regions (iOS) / 100 (Android) | Implemented in code (haversine distance check against all geofenceable stores at Enter time, 3-min per-store debounce) but never confirmed by physically entering a geofence on a real device. Simulator can only fake a GPS coordinate, not a real region-monitoring Enter event. | `core/services/geofencing.ts` (`defineGeofenceTask`); see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §3–4 |
| Notification delivery — local (self) + push (household) | Self-notification (`notifyArrival`) and cross-device delivery (DB trigger → `notify-store-arrival` edge function → Expo push API) are both implemented, but neither has ever been confirmed firing/arriving on a real device. | `core/services/notifications.ts`, `supabase/functions/notify-store-arrival/index.ts`; see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §3–4, §8 |
| Household arrival sync — possible duplicate-notification risk | Two parallel arrival-webhook mechanisms exist in the migration history: a Supabase Dashboard webhook (`011_store_arrival_webhook.sql`, config-only/manual) and a SQL `AFTER INSERT` trigger calling the same edge function directly via `pg_net` (`012_store_arrival_notify_trigger.sql`). If both are live in the actual Supabase project, every arrival fires the push twice. Needs verification of which mechanism is actually active in the dashboard — not just a code read. | `supabase/migrations/011_store_arrival_webhook.sql`, `012_store_arrival_notify_trigger.sql`; see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §8 |
| False-positive prevention — guard-count mismatch between docs and code | `QA_APP_STORE_FINAL_RELEASE.md` describes 8 named guards (G1–G8), including a ~25s "stabilization" dwell-time window and a global 5-minute cross-store cooldown. Current `geofencing.ts` only implements 2: the nearest-store haversine check and a 3-min **per-store** debounce (plus an implicit zero-item no-op in `notifyArrival`). No stabilization window or global cross-store cooldown exists in the code read this session. This is a doc/code mismatch requiring a source audit, not only a device test — a device test alone cannot distinguish "guard doesn't exist" from "guard exists but didn't trigger." | `QA_APP_STORE_FINAL_RELEASE.md` (G1–G8 references) vs. `core/services/geofencing.ts`; see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §6–7 |
| Background behavior — live-state read at task fire-time | `defineGeofenceTask`'s `getItems`/`getStores` closures read `useDurableStore.getState()` live at fire-time (correct design, not a stale launch-time snapshot) — but this means a geofence Enter event firing before the durable store rehydrates from disk (e.g., a cold background relaunch) could compute item counts against an empty store and suppress/under-count a real arrival notification. Never confirmed on a real device. | `app/_layout.tsx` (`defineGeofenceTask` call site); see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §4–5 |
| Precise vs. approximate location | No app-level branch found for iOS "Reduced Accuracy" or Android's approximate-location permission. `Location.startGeofencingAsync` region-monitoring precision is OS-governed, not app-specified — geofence radius reliability degrades with Precise Location off. Entirely unverified; requires a real device with Precise Location explicitly disabled. | `core/services/geofencing.ts`; see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §3–4, §10 |
| App closed / app backgrounded behavior | Expo Go cannot fire the background task at all once the app is closed — documented as a known limitation in `geofencing.ts`'s own header comment; a native build (EAS Build / `expo run:ios`) is required for any background or killed-app test. True killed-app (not merely backgrounded) relaunch-on-region-event behavior has never been tested on this branch. | `core/services/geofencing.ts` (header comment); see `GEOFENCING_NOTIFICATION_QA_CHECKLIST.md` §4–5 |

---

## 4. P2 — UX / Polish

*Definition: confusing copy, layout issues, empty states, icon/logo inconsistencies, non-blocking receipt/camera quality issues.*

- `welcome.tsx` — OTA badge shows current number, no stale "PantryPal" copy, no flash of authenticated content before render.
- `join.tsx` — invite-code input auto-uppercase/6-char validation at the screen level; back navigation shouldn't discard a partially-typed code.
- Pantry (`index.tsx`) — pull-to-refresh; designed empty state for a brand-new household pantry.
- `stores.tsx` — fallback icon/logo for unrecognized chains; wrong-state warning badge rendering correctly in list view (not only the add flow).
- `receipts.tsx` — designed empty state (no receipts yet).

---

## 5. P3 — Nice-to-Have

*Definition: future enhancements, analytics, AI features, route optimization, price intelligence.*

No open P3 items found in the inspected QA docs — price intelligence / shared store price history already shipped (OTA ~119–127). This category isn't currently tracked by the QA docs; consider logging future ideas in `PLAN.md` rather than here.

---

## 6. Recently Fixed

| Issue | Fix | OTA | Commit | Verification |
|---|---|---|---|---|
| Shopping start picker skipped straight past store selection when only one store existed; empty store list was a dead end; Trip Summary header text could overlap at narrow widths | Always show "Where are you shopping first?" even with one store; show "Add a store" CTA when zero stores; fix Trip Summary header layout (TRIP COMPLETE eyebrow / forgot-something timer / Done) | **143** | `75d8789` | **Unverified** — `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2 explicitly flags re-verifying on the smallest supported iPhone, not just the dev test device |
| Location privacy copy in Settings was unclear | Clarified copy | **144** | `0337a85` | **Unverified** — no real-device QA logged anywhere |
| Mid-trip "Add More" could drop an item's store assignment when it was already planned for a different store; a newly inserted store during an active trip could be stranded behind the current position | `ADD_ENTRY` re-homes the item to the current store instead of dropping it; `START_MANUAL_STORE` inserts the new store immediately after `currentIndex`. **This single fix covers both "Add More" item routing and store insertion during an active trip** — there is no separate outstanding fix needed for store insertion. | **145** | `7a6699a` | **Unverified on-device** — covered by `tests/shopping-machine.test.ts` (unit-level only); no real-device confirmation logged |
| Oversized "Add something to buy" promo card cluttered the Pantry top section | Removed the promo card and its now-dead component/styles, added a compact plus button inside the existing search bar, tightened spacing above "On your list," reworded empty-state copy | **146** | `5cd016c` | **Unverified** — `npx tsc --noEmit` clean; no simulator/real-device QA logged |
| Stores lacking arrival-alert coordinates gave no warning | `fix(settings): warn when stores lack arrival-alert locations` | **147** | `fdbe990` | **Unverified** — no real-device QA logged |
| Coordinate status not surfaced after adding a store | `test(stores): show coordinate status after adding store` | **148** | `d6e5b53` | **Unverified** — no real-device QA logged |
| Coordinate alert not surfaced after adding a store | `test(stores): show coordinate alert after adding store` | **149** | `b7b0175` | **Unverified** — no real-device QA logged |
| Arrival-alert diagnostics not visible in Settings | `test(settings): show arrival-alert diagnostics` | **150** | `cf495c9` | **Unverified** — no real-device QA logged |
| Geofence prioritization didn't favor stores with actionable items | `fix(geofencing): prioritize stores with actionable items` | **151** | `da1dbdb` | **Unverified** — no real-device QA logged |
| Geofence arrival decision reliability issue | `Fix geofence arrival decision reliability` | **152** | `d0f73f4` | **Unverified** — no real-device QA logged |
| Unknown-store logos guessed a `.com` domain for the favicon, risking wrong/broken logos | Removed the domain-guessing fallback; unknown stores now return color+abbr only, matching the existing StoreChip fallback | **153** | `be4be5c` | **Unverified on-device** — `npx tsc --noEmit` clean, `tests/store-brands.test.ts` (4/4) and full suite (111/111) pass; no simulator/real-device QA logged |

**Store insertion during an active trip: already fixed.** It shipped as part of OTA 145 (same commit, `START_MANUAL_STORE` change) — not a separate open item.

---

## 7. App Store Operational Checklist

| Item | Status |
|---|---|
| Demo reviewer account | **Not set up.** App requires signup + household setup before there's anything to review — reviewers need working demo credentials or explicit step-by-step notes, or risk an "unable to test" rejection. |
| Review notes (background location justification) | **Not written.** Apple reviews `NSLocationAlwaysUsageDescription` apps closely; review notes must explain *why* background location is needed (geofence arrival reminders), separate from the in-app permission string. |
| Privacy nutrition label | **Not confirmed.** Must match actual collection: precise location (geofencing, linked to identity), photos (receipts), account email. |
| Background location justification | Same gap as review notes above — no submission-facing explanation drafted yet. |
| Screenshots | **Not confirmed current.** Must show current UI for all required device sizes — no "PantryPal" branding, no placeholder/lorem content, no dev-only UI. |
| Final TestFlight build confirmation | **Stale.** Last documented build is 33 (`QA_APP_STORE_FINAL_RELEASE.md`), itself marked "unverified as current" by the newer checklist. Confirm the actual latest build directly in App Store Connect — don't trust either doc's number. |

---

## 8. Rules

- **P0 must be zero** before TestFlight / App Store release.
- **P1 should be zero** before App Store release.
- **P2 can ship if documented.**
- **P3 never blocks release.**
- Every fixed issue must include **OTA + commit + verification status.**
