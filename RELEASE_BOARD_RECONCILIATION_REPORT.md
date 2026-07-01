# Release Board Reconciliation Report

> Report only. No app code, OTA, or existing file was modified to produce this.
> Inspected: `RELEASE_BOARD.md`, `BUG_LIST.md`, `TESTING_PLAYBOOK.md`,
> `QA_APP_STORE_FINAL_RELEASE.md`, `APP_STORE_WORKFLOW_QA_CHECKLIST.md`.

---

## Authoritative document

**`RELEASE_BOARD.md` becomes authoritative for current release-readiness status** (severity
ladder + "Recently Fixed" log) — it's the newest document, the only one that cites OTA
numbers and commit hashes for every claim, and it was explicitly commissioned to be the
rollup. The other three surviving docs keep narrower, still-useful roles:

| Document | Role going forward |
|---|---|
| **RELEASE_BOARD.md** | Authoritative — current P0–P3 status, Recently Fixed log, App Store checklist summary |
| **APP_STORE_WORKFLOW_QA_CHECKLIST.md** | Authoritative for the App Store Connect / Apple Review operational checklist (a level of detail RELEASE_BOARD.md only summarizes) |
| **QA_APP_STORE_FINAL_RELEASE.md** | Authoritative as a **test-case bank** only — its individual checklist rows are still the most granular regression coverage in the repo. Its header (branch/build) and "Release Decision" sign-off are stale and must not be read as current state (see §4). |
| **BUG_LIST.md** | Superseded — retire (see §4) |
| **TESTING_PLAYBOOK.md** | Superseded — retire (see §4) |

---

## 1. Items that can be closed immediately

These are claimed "fixed" by `BUG_LIST.md` with no live dispute from any current document
— they only still *look* open because `TESTING_PLAYBOOK.md` (stale, same era) was never
updated after the fix shipped.

| Item | Classification | Evidence |
|---|---|---|
| Kmart MapView crash (`longitudeDelta` overflow) | **Confirmed Fixed** | `BUG_LIST.md` lists it under both "Fixed — Ready to Push" *and* "Completed (already in TestFlight) — Build #7." No current doc (`RELEASE_BOARD.md`, `APP_STORE_WORKFLOW_QA_CHECKLIST.md`, `QA_APP_STORE_FINAL_RELEASE.md`) references it at all — consistent with a long-resolved, pre-Build-30 issue. |
| Receipt parsing: "Unknown store" + "Failed" on all receipts | **Confirmed Fixed** | `BUG_LIST.md` #5, explicitly annotated "deployed already, no build needed" — the strongest fixed-claim in the corpus. No other doc disputes it. |
| Weekly budget not obvious in Settings | **Confirmed Fixed** | `BUG_LIST.md` #6 (subtitle hint, primary color, bigger pencil). No other doc disputes it. Note: this is a *different* defect from the Build 33 "Weekly Budget Layout" line-wrapping checks in `QA_APP_STORE_FINAL_RELEASE.md` — related UI element, not a duplicate (see §3). |
| Fire-emoji streak explainer | **Confirmed Fixed** | `BUG_LIST.md` #7. `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2 only asks to re-confirm it's "still present," not that it's broken — a cosmetic double-check, not an open dispute. |

**Action:** drop these four from any active bug tracking. None currently block release.

---

## 2. Items requiring verification

### Code/behavior — needs a real-device QA pass

| Item | Classification | Why |
|---|---|---|
| Barcode scanner product recognition | **Untested** (disputed) | `BUG_LIST.md` #1 claims fixed; `TESTING_PLAYBOOK.md` #1 claims pending. No commit/OTA evidence settles it either way. |
| Receipt delete button | **Untested** (disputed) | `BUG_LIST.md` #3 claims fixed; `TESTING_PLAYBOOK.md` #3 claims pending; `APP_STORE_WORKFLOW_QA_CHECKLIST.md` flags "re-verify, not re-confirmed this session." |
| Receipt budget bar refresh after save | **Untested** (recurring) | Claimed fixed in `BUG_LIST.md` #4, claimed pending in `TESTING_PLAYBOOK.md` #4, referenced again as a state-consistency release blocker "fixed in Build 32" in `QA_APP_STORE_FINAL_RELEASE.md`, and flagged a *third* time as "previously a recurring regression — re-verify" in `APP_STORE_WORKFLOW_QA_CHECKLIST.md`. This is the single most-repeated unresolved claim in the whole document set — treat as high regression risk, not a simple yes/no bug. |
| OTA 143 (shopping store picker / empty-store CTA / Trip Summary header) | **Confirmed Fixed in code, Untested on device** | Shipped, commit `75d8789`. No real-device confirmation recorded anywhere. |
| OTA 144 (location privacy copy) | **Confirmed Fixed in code, Untested on device** | Shipped, commit `0337a85`. No QA recorded. |
| OTA 145 (Add More routing / store insertion during active trip) | **Confirmed Fixed in code, Untested on device** | Shipped, commit `7a6699a`. Covered only by a unit test (`tests/shopping-machine.test.ts`), no device pass. |
| OTA 146 (Pantry top search/add redesign) | **Confirmed Fixed in code, Untested on device** | Shipped, commit `5cd016c`. `tsc --noEmit` clean only — no simulator/device QA recorded. |
| `reset-password.tsx` end-to-end | **Untested** | No QA coverage anywhere, ever. Flagged P0 risk (Apple Review commonly tests this flow). |
| `verify-email.tsx` end-to-end | **Untested** | No QA coverage anywhere, ever. |
| `welcome.tsx`, `join.tsx` (screen-level) | **Untested** | Underlying logic is covered elsewhere; the screens themselves never got a dedicated pass. |
| `stores.tsx` tab-level (edit persistence, delete confirmation, fallback icon, list-view warning badge) | **Untested** | Only the search/location *logic* has deep coverage (`QA_APP_STORE_FINAL_RELEASE.md` Build 31/33); the tab UI itself has none. |
| Pantry (`index.tsx`) pull-to-refresh, new-household empty state | **Untested** | Newly identified gap, no prior coverage in any doc. |

### Administrative — needs action, not a QA pass

| Item | Classification | Why |
|---|---|---|
| `ios.icon` config decision (string vs. adaptive object) | **Confirmed Open** | A pending decision, not a test — verifiably undecided right now. Must resolve before the next native build. |
| Demo reviewer account | **Confirmed Open** | Verifiably does not exist yet. |
| Background-location / review notes for App Review | **Confirmed Open** | Verifiably not drafted yet. |
| Privacy nutrition label match | **Confirmed Open** | Verifiably not confirmed against actual data collection yet. |
| Current screenshots | **Confirmed Open** | Verifiably not confirmed current. |
| Actual latest TestFlight build number | **Confirmed Open** | The only number on record (33) is sourced from a stale, branch-mismatched document — must be checked directly in App Store Connect. |

---

## 3. Items duplicated across documents

| Item | Appears in | Note |
|---|---|---|
| Barcode scanner recognition | `BUG_LIST.md` #1, `TESTING_PLAYBOOK.md` #1, `RELEASE_BOARD.md` P1 | True duplicate — same defect, same disputed status, 3 docs. |
| Receipt delete button | `BUG_LIST.md` #3, `TESTING_PLAYBOOK.md` #3, `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2, `RELEASE_BOARD.md` P1 | True duplicate, 4 docs. |
| Budget bar refresh | `BUG_LIST.md` #4, `TESTING_PLAYBOOK.md` #4, `QA_APP_STORE_FINAL_RELEASE.md` §6 + Build-32 note, `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2, `RELEASE_BOARD.md` P1 | Most-duplicated item in the corpus, 5 docs — see governance recommendation. |
| Kmart MapView crash | `BUG_LIST.md` (two internal placements — "ready to push" *and* "completed"), `TESTING_PLAYBOOK.md` #2 | Duplicate within and across docs; resolved (§1). |
| Fire-emoji explainer | `BUG_LIST.md` #7, `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §2 | Minor duplicate, low risk, resolved (§1). |
| Household/auth/session-persistence manual test | `TESTING_PLAYBOOK.md` §1, §7 | Duplicate of — and far less rigorous than — `QA_APP_STORE_FINAL_RELEASE.md` §1, §2, and the Build 32 "Auth/Household/Shopping State Consistency" section. |
| Stores/geofencing manual test | `TESTING_PLAYBOOK.md` §4, §6 | Duplicate of — and far less rigorous than — `QA_APP_STORE_FINAL_RELEASE.md` §3, §4 and the Build 31/32/33 geofence sections. |
| "Regression Gate" table | `QA_APP_STORE_FINAL_RELEASE.md` §10, `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §5 | Structural duplication — two independently maintained regression-gate tables with overlapping purpose and no cross-reference. Should be one canonical table. |

**Not a duplicate, despite looking related:** "Weekly budget not obvious" (`BUG_LIST.md` #6,
visibility/discoverability) vs. "Weekly Budget Layout" (`QA_APP_STORE_FINAL_RELEASE.md` Build
33, line-wrapping at $150/$1,500/$10,000) — same UI element, two distinct defects from two
different periods. Don't merge or conflate these.

---

## 4. Documents that are stale

| Document | Staleness | Recommendation |
|---|---|---|
| `BUG_LIST.md` | Last updated 2026-05-29 — predates ~50+ OTAs (89 → 146) and the current branch's worth of work. Internally inconsistent (same fix listed as both "ready to push" and "completed"). | **Retire.** Its 4 still-relevant items are already carried into `RELEASE_BOARD.md` §3 (P1); nothing else is uniquely valuable. |
| `TESTING_PLAYBOOK.md` | Undated, but contextually concurrent with `BUG_LIST.md` (shares its exact bug numbering #1–4) and directly contradicts it. Manual-test sections duplicate `QA_APP_STORE_FINAL_RELEASE.md` at far lower rigor. | **Retire.** No content here that isn't either contradicted or better covered elsewhere. |
| `QA_APP_STORE_FINAL_RELEASE.md` | Dated 2026-06-04. Header claims branch `codex/luxury-redesign`, Build 30 — neither matches current branch (`shopping-engine-v2`) or OTA scheme (143–146). The "Release Decision" sign-off table (✅ marks) is a point-in-time snapshot for that branch/build, not a current claim. | **Partially stale — keep, re-header.** The individual regression checklist rows (most still unchecked, i.e. genuinely untested rather than failing) remain the best test-case bank in the repo. Strip or clearly date-stamp the branch/build header so it's never mistaken for current state; do not treat its old ✅ marks as still valid. |
| `APP_STORE_WORKFLOW_QA_CHECKLIST.md` | Dated 2026-06-19 (today). | Current — not stale. |
| `RELEASE_BOARD.md` | Dated 2026-06-19 (today), still uncommitted. | Current — not stale. |

---

## 5. Recommendation for future governance

1. **One rolling source of truth.** `RELEASE_BOARD.md` is the only document that should be
   updated after every OTA or bug-status change going forward. Stop editing `BUG_LIST.md` and
   `TESTING_PLAYBOOK.md` — retire them (archive or delete) once this report is reviewed.
2. **Separate "shipped" from "verified."** The recurring pattern across this whole corpus —
   most visibly the budget-bar bug, which has been marked "fixed" at least three times across
   three different documents and still gets re-flagged — is that a commit landing gets treated
   as equivalent to a closed issue. It isn't. Every entry in `RELEASE_BOARD.md`'s "Recently
   Fixed" table should carry two independent states: *Shipped* (OTA + commit, already done
   well) and *Verified* (real-device confirmation, currently true for zero items in OTA
   143–146). Don't let an item drop off the board until both are true.
3. **One canonical regression-gate table.** Merge `QA_APP_STORE_FINAL_RELEASE.md` §10 and
   `APP_STORE_WORKFLOW_QA_CHECKLIST.md` §5 into a single table, referenced (not duplicated)
   from `RELEASE_BOARD.md`.
4. **Re-date, don't re-trust, the regression test bank.** Keep `QA_APP_STORE_FINAL_RELEASE.md`'s
   checklist rows as the granular test bank, but correct its header to reflect that it spans
   multiple historical builds/branches — and never read its old "Release Decision" sign-off as
   current.
5. **Administrative checklist items get owners, not just checkboxes.** The App Store Connect
   items in §2 of this report (demo account, review notes, privacy label, screenshots, build
   number) are all verifiably incomplete today, not "untested" — they need someone to actually
   do them. Track them in `RELEASE_BOARD.md` §7 with an owner/date, not just a checklist.
6. **Before the next OTA ships, close the verification gap on the last one.** Right now OTAs
   143–146 are all "shipped, unverified." Adopt a rule: no new OTA goes out until the previous
   one has at least a lightweight real-device pass — otherwise the unverified backlog only grows.
