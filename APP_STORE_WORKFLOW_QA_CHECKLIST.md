# Stokit — App Store Workflow QA Checklist (Master)

> Prepared: 2026-06-19 · Current OTA: 146 (next 147, see `apps/stokit-v2/constants/version.ts`)
> Last documented TestFlight build: 33 (per `QA_APP_STORE_FINAL_RELEASE.md`) — **unverified as current, confirm actual latest build in App Store Connect before relying on this number.**

This is the **top-level "are we actually ready to submit" checklist.** It does not
replace the detailed functional regression tables already in
[QA_APP_STORE_FINAL_RELEASE.md](QA_APP_STORE_FINAL_RELEASE.md) — it links to them,
fills the gaps they don't cover, and adds the App Store Connect / Apple Review
workflow section that doesn't exist anywhere yet.

**Severity:** P0 (must fix before build) / P1 (must fix before App Store) / P2
(polish after TestFlight) — per
[docs/ai/QA_AND_RELEASE_PROTOCOL.md](docs/ai/QA_AND_RELEASE_PROTOCOL.md).
**Deployment classification:** OTA (EAS Update) vs native (EAS Build) — per
[docs/ai/EAS_BUILD_VS_UPDATE_PROTOCOL.md](docs/ai/EAS_BUILD_VS_UPDATE_PROTOCOL.md).

No code changes were made to produce this document — checklist only, per request.

---

## 0. Housekeeping flags (docs are out of sync — fix before trusting them)

- **`BUG_LIST.md`** last updated 2026-05-29, says "no pending bugs." That predates
  roughly 50+ OTAs (89 → 143) including this session's fixes. Its "fixed, ready to
  push" list (items 1–7) is also old. Don't treat it as current P0/P1 status without
  reconciling first. — **P1, no code**
- **`TESTING_PLAYBOOK.md`** still lists bugs #1–#4 as "pending fix / do not push,"
  directly contradicting `BUG_LIST.md`, which marks the same bugs fixed. Two sources
  of truth disagree. — **P1, no code**
- Recommend: next session, do a single pass reconciling both docs against
  `constants/version.ts` OTA history, the same way the OTA memory log was just
  corrected this session.

---

## 1. Auth screens (`app/(auth)/`) — per-screen gaps

`QA_APP_STORE_FINAL_RELEASE.md` §1 only lightly covers sign-up/sign-in. These three
screens have **no existing QA coverage at all**:

### `welcome.tsx`
- [ ] Unauthenticated cold launch lands here (cross-ref existing §1)
- [ ] CTA buttons route correctly to sign-up / sign-in
- [ ] OTA/version badge shows current number, no "PantryPal" copy
- [ ] No flash of authenticated content before this screen renders

### `verify-email.tsx` — **gap, not tested anywhere**
- [ ] Appears after signup when Supabase requires email confirmation
- [ ] "Resend" works and is rate-limited (doesn't allow spam-tapping)
- [ ] Tapping the confirmation link in the email deep-links back into the app correctly
- [ ] Closing the app before verifying and reopening lands back here (not stuck/looping, not silently skipped)
- [ ] An already-verified user never sees this screen again

### `reset-password.tsx` — **gap, not tested anywhere — flag as P0 risk**
- [ ] "Forgot password" is reachable from sign-in
- [ ] Submitting an email shows a generic confirmation regardless of whether the account exists (no email-enumeration leak)
- [ ] The reset-password email link deep-links into this screen with a valid token
- [ ] Expired/invalid token shows a clear error, not a crash or dead screen
- [ ] Setting a new password succeeds and routes to sign-in (or auto-signs-in)
- [ ] **Apple App Review routinely tests "I forgot my password" during submission review — a broken or missing flow is a common rejection reason.** This has never been explicitly QA'd per existing docs.

### `join.tsx` — gap at the screen level (household-join logic is covered, screen isn't)
- [ ] Reachable from Welcome and from post-signup "create or join" routing
- [ ] Invite code input auto-uppercases, accepts 6-char alphanumeric
- [ ] Wrong code → inline error, no crash (cross-ref existing §2)
- [ ] Back navigation doesn't unexpectedly discard a partially-typed code

---

## 2. Tab screens (`app/(tabs)/`) — gaps and session-specific regressions

### `index.tsx` (Pantry) — mostly covered, add:
- [ ] Pull-to-refresh works
- [ ] Empty pantry (brand-new household) shows a designed empty state, not blank

### `shopping.tsx` — covered in depth (§6 + Build 33 tables); **re-verify this session's fixes specifically:**
- [ ] "Where are you shopping first?" picker appears even with exactly **one** saved store (OTA 143 fix)
- [ ] Zero saved stores → picker shows an "Add a store" CTA instead of a dead end (OTA 143 fix)
- [ ] Trip Summary header — "TRIP COMPLETE" eyebrow, "↩ Forgot something? (mm:ss)" timer pill, "Done" pill — never overlap at any screen width, **including the smallest supported iPhone**, not just the device used to verify today (OTA 143 fix)

### `stores.tsx` — dedicated tab-level gap (location/search logic is covered deeply elsewhere, the tab UI isn't)
- [ ] Empty state (new household, zero stores) is designed with a clear "Add store" CTA
- [ ] Store card renders a sane fallback icon/logo for unrecognized chains
- [ ] Editing a store (rename / re-pin address) persists correctly
- [ ] Deleting a store requires confirmation (no accidental data loss)
- [ ] Wrong-state warning badge (Build 33 feature) renders correctly in the list view, not only during the add flow

### `receipts.tsx` — dedicated tab-level gap (only ever mentioned via bug-list entries, never a full screen pass)
- [ ] Empty state designed (no receipts yet)
- [ ] Camera upload works, including first-launch permission prompt
- [ ] Photo-library upload works
- [ ] Delete button exists and works — `BUG_LIST.md` marks this fixed (#3); **re-verify, not re-confirmed this session**
- [ ] Manual total entry (no photo) saves correctly
- [ ] Receipt parsing shows correct store name + total — marked fixed (#5); **re-verify**
- [ ] Budget bar refreshes immediately after saving, both on tab-focus and while already viewing the tab — marked fixed (#4); **re-verify, this was previously a recurring regression**

### `activity.tsx` — covered (§7), no new gaps found.

### `settings.tsx` — covered (§8), add:
- [ ] Sign out clears household/items/shopping state together (cross-ref "Auth/Household/Shopping State Consistency" table)
- [ ] Fire-emoji streak explainer alert (`BUG_LIST.md` #7) still present and accurate

---

## 3. App Store Connect / Apple Review readiness — **new section, doesn't exist in any current doc**

These are submission-workflow artifacts in App Store Connect itself, distinct from
in-app QA:

- [ ] **App Privacy "nutrition label"** in App Store Connect matches actual data collection: precise location (geofencing, linked to identity), photos (receipts), account email. A mismatch here is a common cause of rejection or post-launch removal.
- [ ] Privacy Policy URL is live and accurately describes location + photo + account data use
- [ ] Support URL is set and reachable
- [ ] Age rating questionnaire completed (expect 4+, no objectionable content)
- [ ] Export compliance answer in App Store Connect matches `ITSAppUsesNonExemptEncryption: false` already declared in `app.json`
- [ ] **App Review demo account**: the app requires signup + household setup before there's anything to review — reviewers need either working demo credentials or a clear step-by-step note, or they may reject for "unable to test"
- [ ] **Background location justification note**: Apple reviews `NSLocationAlwaysUsageDescription` apps closely — the review notes must explain *why* background location is needed (geofence arrival reminders), not just rely on the in-app permission string
- [ ] No third-party social login (Google/Apple/Facebook) is offered today → Sign in with Apple is **not** required. If social login is ever added, Sign in with Apple becomes mandatory in that same release.
- [ ] Screenshots for required device sizes show **current** UI — no "PantryPal" branding, no placeholder/lorem content, no dev-only UI
- [ ] App name/subtitle/keywords in App Store Connect consistently say "Stokit" (the bundle ID / Expo slug still containing "pantrypal" internally is fine — not user-facing, not worth changing)
- [ ] Version string in App Store Connect matches `app.json` `expo.version` (currently `1.0.0`)
- [ ] Build number being submitted is confirmed against the EAS dashboard / App Store Connect directly — don't assume it matches a number from an old doc

---

## 4. Build / config readiness — delta on top of existing §9

- [ ] `app.json` → `ios.icon` is currently the plain string `./assets/icon-dark.png` (changed this session to unblock OTA manifest validation). Before the **next native build**, decide: keep it a string, or restore the adaptive light/dark object from commit `d5550e1` — OTA cannot carry an icon change either way, this only matters at build time.
- [ ] `runtimeVersion.policy: "appVersion"` — a native build that bumps `expo.version` starts a new OTA compatibility tier; OTAs 143/144 etc. won't apply to it. Confirm the timing of the next version bump won't silently orphan in-flight OTA work.
- [ ] `eas.json` channel↔branch mapping is still `production → production`, `preview → preview` (per `EAS_BUILD_VS_UPDATE_PROTOCOL.md`)
- [ ] Existing §9 items (app icon, splash, encryption flag, autoIncrement, no secrets in bundle) — re-verify, not just trust the last pass

---

## 5. Regression gate — append to existing §10 table

| Flow | Status |
|---|---|
| "Where are you shopping first?" picker shows with exactly one store (OTA 143) | |
| Empty store list shows "Add a store" CTA instead of dead end (OTA 143) | |
| Trip Summary header never overlaps at smallest supported screen width (OTA 143) | |
| Reset-password flow works end-to-end on a real device | |
| Verify-email flow works end-to-end on a real device | |

---

## 6. Sign-off

| Item | Value |
|---|---|
| Auth screens fully QA'd (incl. reset-password, verify-email) | Pending |
| Tabs fully QA'd (incl. receipts, stores dedicated passes) | Pending |
| App Store Connect submission artifacts confirmed | Pending |
| BUG_LIST.md / TESTING_PLAYBOOK.md reconciled | Pending |
| P0 open | TBD after pass |
| P1 open | TBD after pass |
| P2 deferred | TBD after pass |
| Safe to build new TestFlight | Not yet — sections 1–4 unverified |
| Safe to submit to App Store | Not yet |
