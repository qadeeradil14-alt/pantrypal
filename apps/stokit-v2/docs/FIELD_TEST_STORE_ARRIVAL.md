# Store Arrival Alerts — Real-Device Field Test

**Status: NOT YET PROVEN.** No item in Part B has ever been validated on a real
device. Nothing in this feature should be described as working until the boxes
below are ticked from an actual drive test.

Requires a TestFlight or device build — Expo Go cannot register geofences.
The Settings screen reports `Coming soon` there.

## Preconditions

- Build: TestFlight / device build (not Expo Go, not Simulator)
- iOS Settings → Stokit → Location = **Always** (When In Use is not sufficient)
- iOS Settings → Stokit → Notifications = **Allow**
- Signed in, with a household
- Settings → Notifications → **Push notifications** shows **On**
- Open Troubleshooting and record the starting values

Record the build, OTA number, device and iOS version with every run.

---

## Part A — Setup (provable in the app, no driving)

| # | Step | Expected | ✅ |
|---|---|---|---|
| A1 | Save a store with real coordinates | Store appears in Stores with an address | ☐ |
| A2 | Assign at least one pantry item to it and mark it **low** | Item shows as assigned | ☐ |
| A3 | Settings → Notifications → enable **Store arrival reminders** | iOS prompts for Always location if not already granted | ☐ |
| A4 | Read the toggle description | **`Monitoring 1 store`** | ☐ |
| A5 | Open **Troubleshooting** | `Reminders enabled: yes`, `Eligible stores: 1`, `Regions requested: 1`, `Native geofencing started: yes`, `Registration drift: no`, `Last registration: success` | ☐ |
| A6 | Tap **Test notification** | Exactly one notification titled *Stokit test notification*. Tapping it opens Stokit normally — **it must NOT open Shopping focused on a store** | ☐ |
| A7 | Mark the assigned item **stocked** (nothing eligible) | Description becomes **`No stores currently have assigned shopping items.`**, `Regions requested: 0`, `Native geofencing started: no`, and the toggle **stays on** | ☐ |
| A8 | Mark it **low** again | Returns to `Monitoring 1 store`, `Native geofencing started: yes` | ☐ |

> A7/A8 exercise the Defect A fix: stale regions are torn down when nothing is
> eligible, the user's preference survives, and the existing refresh path
> re-registers automatically. Verified in unit tests structurally — **A7/A8 are
> the first real proof.**

---

## Part B — Drive test (NOT YET PROVEN — every row is unvalidated)

Run each row as a separate trip. Do not batch them.

| # | Scenario | Expected | Proven? |
|---|---|---|---|
| B1 | **Terminated-app delivery.** Force-quit Stokit (swipe up). Drive to the store and park. | Exactly **one** arrival reminder within ~1–2 min of parking, app still terminated | ☐ **UNPROVEN** |
| B2 | **Background delivery.** Background Stokit (home, don't quit). Drive and park. | Exactly one arrival reminder | ☐ **UNPROVEN** |
| B3 | **Dwell behaviour.** While parked, note the delay between entering the lot and the notification. | Reminder only after the ~10s dwell confirmation, not at the geofence edge | ☐ **UNPROVEN** |
| B4 | **Pass-by rejection.** Drive past the store without stopping (do not slow below ~18 km/h). | **No** reminder. Troubleshooting shows `Last suppression: rejected_speed` | ☐ **UNPROVEN** |
| B5 | **Cooldown.** After a successful B1/B2, leave and return within 3 minutes. | **No** second reminder | ☐ **UNPROVEN** |
| B6 | **Duplicate prevention.** Park, walk out of range and back within one visit. | Still only one reminder total | ☐ **UNPROVEN** |
| B7 | **Toggle-off suppression.** Turn **Store arrival reminders** off. Confirm `Native geofencing started: no`. Drive to the store and park. | **No** reminder at all | ☐ **UNPROVEN** |
| B8 | **Ambiguity.** If two saved stores share a lot (e.g. Sam's Club / Walmart), park between them. | Either one clearly-nearest reminder, or none with `Last suppression: ambiguous match` — never two | ☐ **UNPROVEN** |

After each drive, capture Troubleshooting: `Last registration`, `Last arrival`,
`Last suppression`, `Registration drift`.

---

## Part C — Push notification registration

| # | Step | Expected | ✅ |
|---|---|---|---|
| C1 | Second household member on a second device, both signed in | Both show **Push notifications: On** | ☐ |
| C2 | Member A starts a shopping trip | Member B receives a push | ☐ |
| C3 | Turn **Push notifications** off on B, repeat C2 | B receives **nothing** | ☐ |
| C4 | Turn it back on | Status returns to **On**; C2 delivers again | ☐ |
| C5 | Sign out and back in on B | Status resolves to **On** (or **Needs attention** → **Repair notifications** fixes it) | ☐ |
| C6 | Tap **Repair notifications** three times in a row | Status stays **On**; no duplicate delivery, no second notification per alert | ☐ |
| C7 | iOS Settings → Stokit → Notifications = Off, reopen the screen | **Needs attention**, and the action is **Open Settings** — never Repair | ☐ |

---

## Known limitations

- **No native region count.** `expo-location` exposes only
  `hasStartedGeofencingAsync()` (a boolean); iOS's `monitoredRegions` list is not
  available. Troubleshooting therefore shows **`Regions requested`** — what the
  app asked iOS to watch — plus the started boolean. It does **not** claim a
  native registered-region count, because that value cannot be obtained without a
  custom native module.
- **iOS geofence limit is 20 regions.** Beyond that, stores are silently dropped
  by `geofenceableStores`. Untested at scale.
- **Cold-start delivery timing is iOS's call.** The system decides when to wake a
  terminated app; delays of a minute or more are normal and not a defect.
- B1–B8 can only be closed by driving. No simulator or unit test substitutes.
