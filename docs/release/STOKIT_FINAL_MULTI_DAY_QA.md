# Stokit Final Multi-Day QA

Candidate: Build 108, production identity, internal TestFlight only
Testers: Hewad and Sana
Duration: 5 consecutive days

## Test devices

| Tester | Device | iOS | Build | Install state |
|---|---|---|---|---|
| Hewad | iPhone |  | 108 | V1 upgrade / clean install |
| Sana | iPhone or iPad |  | 108 | Existing household / reinstall |

## Daily required cycle

Run every item once in each direction where two-device behavior applies.

- [ ] Login or restore the existing session.
- [ ] Confirm both devices show the same household, pantry count, stores, active trip, receipts, and history.
- [ ] Add, edit, and delete pantry items on each device.
- [ ] Create a shopping plan, assign stores, start shopping, check and uncheck items, finish stores, finish the trip, and reset.
- [ ] Confirm the other device enters the active trip without a stale Start Shopping button.
- [ ] Send Notify Family Hewad → Sana and Sana → Hewad; confirm one notification and no self-notification.
- [ ] Leave Shopping open without tapping Notify Family; confirm no premature notification.
- [ ] Search for Walmart, Sam’s Club, Costco, and Target; save one result and open directions.
- [ ] Add or scan a receipt, verify history and spending totals, then reopen it on the other device.
- [ ] Upload, replace, and remove a profile photo where scheduled.
- [ ] Background and foreground each device.
- [ ] Force-close and reopen each device.
- [ ] Make one change offline, reconnect, and verify convergence without losing the other device’s data.
- [ ] Review TestFlight crash feedback and device logs.
- [ ] Record end-of-day data parity.

## Day 1 — Migration and baseline

- [ ] Install Build 108 over the existing production/V1 container on Hewad’s device.
- [ ] Confirm authentication and household data survive the upgrade.
- [ ] Confirm pantry, stores, receipts, shopping history, roles, and profile photo match the pre-upgrade record.
- [ ] Run the daily required cycle.

## Day 2 — Two-device convergence

- [ ] Alternate all pantry and active-shopping mutations between Hewad and Sana.
- [ ] Record convergence delay for every action.
- [ ] Rapidly check/uncheck, add, and delete shopping items in both directions.
- [ ] Run the daily required cycle.

## Day 3 — Reinstall protection

- [ ] Keep one populated device online.
- [ ] Delete and reinstall Stokit on the second device.
- [ ] Sign in and open the existing household.
- [ ] Confirm server hydration completes before any empty write.
- [ ] Confirm the populated device loses no pantry, store, trip, receipt, activity, profile, or household data.
- [ ] Run the daily required cycle.

## Day 4 — Offline, notification, and background stress

- [ ] Exercise offline edits and reconnect in both directions.
- [ ] Test Notify Family in foreground, background, and locked states.
- [ ] Confirm no duplicate, self, or premature notification.
- [ ] Leave each device backgrounded for at least 30 minutes, then reopen Shopping and verify focus reconciliation.
- [ ] Run the daily required cycle.

## Day 5 — Release rehearsal

- [ ] Repeat the complete household, pantry, shopping, store, receipt, notification, and profile flow without debug intervention.
- [ ] Confirm no P0/P1 issues remain open.
- [ ] Confirm Build 108 is the installed TestFlight build on both devices.
- [ ] Confirm the six planned App Store screenshots match Build 108 and contain sanitized data.
- [ ] Run the daily required cycle and record final go/no-go.

## Execution log

Add one row per action or observed issue.

| Day | Device | User | Time | Action | Result | Sync delay | Notification result | Crash/error | Screenshot/log reference |
|---|---|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  | PASS / FAIL |  |  |  |  |
| 2 |  |  |  |  | PASS / FAIL |  |  |  |  |
| 3 |  |  |  |  | PASS / FAIL |  |  |  |  |
| 4 |  |  |  |  | PASS / FAIL |  |  |  |  |
| 5 |  |  |  |  | PASS / FAIL |  |  |  |  |

## End-of-day parity

| Day | Pantry | Stores | Active trip | Trips/history | Activities | Receipts | Household members | Parity result |
|---|---:|---:|---|---:|---:|---:|---:|---|
| 1 |  |  |  |  |  |  |  | PASS / FAIL |
| 2 |  |  |  |  |  |  |  | PASS / FAIL |
| 3 |  |  |  |  |  |  |  | PASS / FAIL |
| 4 |  |  |  |  |  |  |  | PASS / FAIL |
| 5 |  |  |  |  |  |  |  | PASS / FAIL |

## Final result

- [ ] Five-day matrix complete.
- [ ] Migration and reinstall tests pass.
- [ ] No unresolved P0/P1 issue.
- [ ] Hewad explicitly approves App Review submission in a separate instruction.

Decision: **BLOCKED / GO**
Owner approval reference:
