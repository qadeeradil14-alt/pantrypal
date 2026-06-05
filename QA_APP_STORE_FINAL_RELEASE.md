# Stokit — App Store Final Release QA Checklist

Branch: `codex/luxury-redesign`
Build: 30 (TestFlight internal)
Date prepared: 2026-06-04

**Sign-off rule:** every item below must PASS on a real device before submitting to App Store Review.

---

## 1. Account / Auth

- [ ] New user can sign up with email + password
- [ ] Existing user can sign in
- [ ] Close app fully, reopen — user stays logged in (session persists)
- [ ] App does NOT flicker to setup/auth on reopen for an authenticated household user
- [ ] App correctly sends unauthenticated user to Welcome screen on first launch

---

## 2. Household — Create / Invite / Join / Leave

- [ ] Owner can create a new household
- [ ] Invite code is displayed in Settings (6 uppercase alphanumeric characters)
- [ ] "Share invite link" button opens iOS share sheet with Stokit-branded message
- [ ] Share message does NOT show TestFlight logo as preview (URL not passed separately)
- [ ] Share message text is readable and includes the 6-character code explicitly
- [ ] QR code modal opens and displays a scannable code
- [ ] Second device (or second account) can join using the 6-char invite code
- [ ] Entering wrong invite code shows a clear error; does not crash
- [ ] Duplicate join attempt does not corrupt membership
- [ ] "Leave household" is visible in Settings → Danger zone
- [ ] Leaving household clears pantry/shopping/store state but does NOT sign user out
- [ ] After leaving, user lands on setup screen (create or join)
- [ ] User can rejoin a household with a valid invite code after leaving

---

## 3. Stores / Location

- [ ] Location permission prompt appears on first store-add or search
- [ ] Entering a zip code / city anchors the search to that area (not device GPS location)
- [ ] Adding "Walmart" with a nearby zip returns relevant nearby results
- [ ] Adding "Sam's Club" returns correct results (not wrong-state locations)
- [ ] Adding "Food Lion" or a local grocery returns correct results
- [ ] Selected store address and coordinates match the pin tapped on the map
- [ ] Saved store persists correct address after app reopen
- [ ] Store with no address shows "No address · geofencing off" label
- [ ] Search loading state resolves (no infinite spinner)
- [ ] Clear error/empty state when no stores found and manual address fallback appears
- [ ] "Save without address" works and adds store without geofencing
- [ ] Removing a store removes it from the list and stops geofencing for that store

---

## 4. Geofence / Notifications

- [ ] No geofence notification fires while sitting at home (not near any saved store)
- [ ] Arrival notification fires only when physically at a saved store with GPS coordinates
- [ ] Notification is NOT spammed — same store within 3 minutes does not double-fire
- [ ] Removing a store from the list stops arrival notifications for that store
- [ ] Stores without lat/lon coordinates do NOT generate geofence regions
- [ ] Settings → System status shows correct Location / Notifications / Geofence state
- [ ] Settings → Geofence info shows count of stores with GPS and permission status

---

## 5. Pantry / Items

- [ ] Pantry screen loads without flickering
- [ ] Item list loads consistently on first open and on return to tab
- [ ] Add item works (name, category, expiry)
- [ ] Edit item works
- [ ] Delete item works (swipe or long-press)
- [ ] Mark item as low stock works
- [ ] Mark item back to in-stock works
- [ ] Low-stock items appear in the Grocery / shopping list
- [ ] Search bar filters items correctly
- [ ] Barcode scanner opens (camera permission prompt on first use)
- [ ] Store assignment persists per item

---

## 6. Shopping Mode / Grocery Screen

- [ ] Shopping mode does NOT auto-start when app reopens from background
- [ ] Shopping mode does NOT auto-start from stale persisted state
- [ ] Tapping "Start shopping" manually activates shopping mode
- [ ] Spend sheet (store stop completion) does NOT reopen unexpectedly on app reopen
- [ ] Store stop completion sheet can be dismissed
- [ ] User can mark items as picked up during a shopping trip
- [ ] User can complete a store stop and advance to next store
- [ ] User can finish the full trip (all stores completed)
- [ ] Receipt upload is optional — skip works
- [ ] Spend amount can be entered and saved
- [ ] Weekly spend total updates after recording a receipt
- [ ] "Store missing" or store chip shows 0 only when truly applicable

---

## 7. Activity Screen

- [ ] Activity screen loads without error
- [ ] Store arrivals appear with store logo avatar
- [ ] Partner activity appears with correct actor name
- [ ] "Today" / "Yesterday" / weekday labels show correctly
- [ ] Empty state shown when no activity exists

---

## 8. Settings Screen

- [ ] Settings screen loads
- [ ] Household name can be edited and saved
- [ ] Display name can be edited and saved
- [ ] "Share invite link" works with Stokit branding
- [ ] "Test invite" shows the 6-char code in an alert
- [ ] Weekly budget can be edited
- [ ] Notification toggles (arrivals, partner, expiry, low stock) save and persist
- [ ] Leave household button present in Danger zone
- [ ] Sign out works; lands on Welcome screen
- [ ] Version shown at bottom: "Stokit v1.0.0"
- [ ] NO copy says "PantryPal" anywhere on the screen
- [ ] NO debug labels or development-only text visible
- [ ] "Geofence info" (not "Geofence debug") shows geofence status

---

## 9. App Store / Build Config

- [ ] App name shows as "Stokit" on home screen icon
- [ ] App icon is current production Stokit icon (not old PantryPal logo)
- [ ] Splash screen shows correctly
- [ ] Location permission prompt text is App Store-safe ("Stokit needs your location…")
- [ ] Notification permission prompt text is clear
- [ ] Camera / photo library permission text is clear
- [ ] No visible dev/debug copy anywhere in the app
- [ ] Production build (not development client) submitted to TestFlight
- [ ] Build number auto-incremented by EAS (`autoIncrement: true` in eas.json)
- [ ] `ITSAppUsesNonExemptEncryption: false` confirmed in app.json iOS config
- [ ] No secrets visible in app bundle or app.json

---

## 10. Regression Gate (must re-verify after any last-minute fix)

| Flow | Status |
|---|---|
| Existing user reopens app → stays logged in | |
| User without household → setup screen | |
| User with household → pantry screen | |
| Create household → invite code generated | |
| Join household with valid code | |
| Invalid code → clear error, no crash | |
| Leave household → setup screen, not logged out | |
| Add store with zip code → correct nearby results | |
| Store address/coordinates persist correctly | |
| Shopping mode starts only on manual tap | |
| Shopping mode does NOT auto-start on reopen | |
| No random geofence notification at home | |
| Settings screen opens, no PantryPal copy | |

---

## Release Decision

| Item | Value |
|---|---|
| TypeScript clean | ✅ (tsc --noEmit, 0 errors) |
| Untracked new files committed | ✅ (storeSearch.ts, shoppingActiveByStore.ts) |
| User-facing PantryPal copy | ✅ None found |
| "Geofence debug" label | ✅ Fixed → "Geofence info" |
| QA files present | ✅ |
| Safe to build new TestFlight | ✅ After manual QA passes |
| Safe to submit to App Store | After manual QA sign-off above |

**NEXT COMMAND when ready to build:**
```sh
eas build --platform ios --profile production
```

**Then submit:**
```sh
eas submit --platform ios --profile production
```

---

## Build 31 Regression Checks
*Added after TestFlight Build 31 real-device testing*

### Add Store Location Selection
| Test | Pass/Fail |
|---|---|
| Enter a zip code in the zip/city field | |
| Search/add Walmart | |
| Confirm map shows multiple results as unselected pins (no pin pre-selected) | |
| Confirm results are near the provided zip/current location | |
| Confirm app does NOT auto-select Washington DC or another distant store | |
| Tap the correct nearby result explicitly | |
| Confirm "Add selected location" button only enables after an explicit tap | |
| Confirm saved store card shows the correct address | |
| Confirm geofence coordinates correspond to the saved address | |

### Household Name Input
| Test | Pass/Fail |
|---|---|
| Open "Create household" screen | |
| Confirm placeholder "Household name" is NOT stretched / spaced out | |
| Type a household name | |
| Confirm typed text is NOT stretched | |
| Tap "Create household" — confirm it works | |

### Owner Leave Household (Sole Member)
| Test | Pass/Fail |
|---|---|
| As sole owner (no other members), attempt to leave household from Settings | |
| Confirm app BLOCKS the leave with alert: "You're the only person in this household" | |
| Confirm the alert offers a "Create new household" option | |
| Confirm user is NOT stranded on invite-code-only screen | |
| Confirm user is NOT logged out | |

### Owner Leave Household (With Other Members)
| Test | Pass/Fail |
|---|---|
| As owner with ≥1 other member, attempt to leave | |
| Confirm leave is allowed after confirmation | |
| Confirm household state is cleared but auth session persists | |
| Confirm user is routed to create-or-join screen (both options visible) | |
| Confirm app reopen routes correctly (not back to main app) | |

### iOS Keychain Persistence Note
> On iOS, Supabase session is stored in the Keychain and persists across app reinstall / TestFlight reinstall. This is **expected behavior**, not a bug. After reinstall, the user will be auto-logged-in and routed through `check.tsx`, which will correctly route to `create-or-join` if they have no household. To fully reset auth state during testing, use **Sign Out** from Settings before uninstalling.


---

## Grocery Store Assignment
| Test | Pass/Fail |
|---|---|
| Open Pantry → tap New Grocery | |
| STORE section shows saved stores with location hint (e.g. "Walmart · Woodbridge") | |
| Tapping "+ New" reveals a **"Quick suggestions"** label above preset chips | |
| Preset chips (Kroger, Food Lion, etc.) are clearly labelled as suggestions, NOT saved stores | |
| Selecting a saved store chip highlights it and shows "Add to store" on the button | |
| Save grocery → item appears in pantry assigned to the selected store | |
| Shopping list / store grouping uses the correct saved store | |
| No duplicate store is silently created | |
| Item with no store selected shows "Add unassigned" and saves with no preferred_store_id | |

---

## Auth / Household / Shopping State Consistency

> Release blocker fixed in Build 32: pantry emptying + shopping showing stale picked items after process restart or mid-session state disruption.

| Test | Pass/Fail |
|---|---|
| Open app as existing logged-in user — Pantry loads household name and items correctly | |
| Switch between Pantry, Shopping, Stores, Settings for 2–3 minutes — no sudden empty state | |
| App never shows Pantry empty while Shopping still has stale picked items | |
| Force-close app and reopen — user remains logged in, household loads before empty state appears | |
| Force-close app and reopen — Pantry shows spinner (not empty "Nothing here yet") while loading | |
| Force-close app and reopen — once household loads, items appear correctly | |
| Start a shopping trip (enter a store chip), pick/check items, force-close and reopen — shopping mode does NOT auto-restart | |
| Force-close mid-shopping and reopen — Pantry shows correct items, Shopping shows blank or correct resumed trip | |
| Sign out from Settings — household, items, and shopping state all clear together | |
| Sign back in — data loads correctly from server, no stale state visible | |
| Lock phone for several minutes, unlock and return — app does not show empty Pantry or phantom shopping trip | |

---

## Activity Date Grouping

| Test | Pass/Fail |
|---|---|
| Complete/pick up an item today → open Activity tab → item appears under **Today** | |
| Relative time label (e.g. "13m ago") agrees with the **Today** section header | |
| Yesterday's activity appears under **Yesterday** with a matching relative time | |
| Older activity appears under the correct local calendar date (e.g. "Tuesday, Jun 2") | |
| Expanding/collapsing an activity group does not move items into a different date section | |
| All section headers use the device's **local timezone**, not UTC | |

---

## Shopping Completion Flow (Build 32)

| Test | Pass/Fail |
|---|---|
| Grab ≥1 item at a store → "Done at [Store]?" confirmation sheet appears (NOT the spend sheet directly) | |
| Tap "Keep shopping" → confirmation dismisses, shopping mode continues | |
| Tap "Yes, finish stop" → spend/receipt sheet appears | |
| Enter amount or tap "Skip for now" — spend sheet dismisses normally | |
| Grab 0 items at a store, tap Done → spend sheet does NOT appear | |
| Spend sheet "Skip for now" always works — never blocks user | |

---

## Quantity Stepper (Build 32)

| Test | Pass/Fail |
|---|---|
| In shopping mode each item shows — 1 + stepper (default qty = 1) | |
| Tapping − decrements qty (floor 1), tapping + increments (cap 99) | |
| Tapping the − / + buttons does NOT grab the item | |
| Tapping the item row grabs at the displayed quantity | |
| Purchased item meta shows "Grabbed ×2 ✓" when qty > 1 | |
| Quantities reset when shopping mode ends | |

---

## Barcode Scanner — Category & Expiry (Build 32)

| Test | Pass/Fail |
|---|---|
| Scan Dial hand soap → category shows **Pantry** (not Fridge) | |
| Scan Dial hand soap → expiry field is **blank** (not pre-filled) | |
| Scan milk/yogurt → category shows **Fridge**, expiry pre-filled ~7 days | |
| Scan frozen item → category shows **Freezer**, expiry pre-filled ~90 days | |
| Add soap via scanner → it does NOT appear in "Expiring soon" on Pantry home | |
| User can still manually type an expiry date for any scanned item | |
| Manually-set expiry for food item (yogurt expiring in 3 days) appears in "Expiring soon" | |

---

## Duplicate Item Handling (Build 32)

| Test | Pass/Fail |
|---|---|
| Type an item name that already exists → yellow warning shows with actionable hint | |
| Select a different store, tap Add → "Move to store?" popup appears | |
| Tap "Move to store" → item's store assignment is updated, modal closes | |
| No store selected, tap Add → "Got it" popup with pantry guidance appears | |
| Tap "Got it" → modal stays open so user can change name or cancel | |

---

## Geofence Engine (Build 32)

| Test | Pass/Fail |
|---|---|
| Walk into a store, stay 30 s → arrival notification fires | |
| Drive past a store without stopping → no notification (25 s stability window filters it) | |
| Walk in with poor GPS (accuracy > 200 m) → notification suppressed | |
| Already shopping at Walmart, walk near Sam's Club → no store switch, no second notification | |
| Two stores within 300 m of each other → "Where are you shopping?" sheet appears | |
| Pick a store from disambiguation sheet → Shopping tab opens with that store's list | |
| Tap arrival notification → Shopping tab opens with the correct store's list (not stale state) | |
| Two arrivals within 5 minutes → second notification suppressed by global cooldown | |
| Store with 0 relevant shopping items → no arrival notification fires | |
| Same store re-entered within 3 minutes → notification suppressed (parking-lot bounce) | |
| Check geofence debug log (Settings or dev) → each suppression shows guard label G1–G8 | |

---

## Cross-Screen UX / Data Cleanup (Build 32)

| Test | Pass/Fail |
|---|---|
| Build/TestFlight does NOT show any blue floating gear button (gstack sidebar is dev-only, not in app code) | |
| Pantry search placeholder shows **Search items...** (not "Search groceries...") | |
| Pantry inventory header shows **My Items** (not "My Groceries") | |
| Add item modal title shows **New item** / subtitle "Add it to your inventory." | |
| Shopping screen eyebrow shows **Shopping** (not "Grocery list") when not in shopping mode | |
| Settings > Weekly budget subtitle shows **Tap to adjust your weekly shopping budget** | |
| Freezer category section uses ❄️ snowflake icon (not 🛒 shopping cart) | |
| Fridge category section uses 🧊 icon | |
| Pantry category section uses 📦 icon | |
| Milk expiring in 7 days does **NOT** appear in the Expiring Soon banner | |
| Milk expiring today or tomorrow **DOES** appear in Expiring Soon | |
| Soap/personal care items do **NOT** appear in Expiring Soon regardless of any saved expiry | |
| Store names display as **Sam's Club, 7-Eleven, ALDI, Amazon Fresh, Costco, Walmart** (correct casing) | |
| Receipts screen uses normalised store names (sam's club → Sam's Club) | |
| Activity screen uses normalised store names in event descriptions | |
| Store search with explicit ZIP/city never returns results from a different state | |
| If store geocoding fails for a typed location, search returns empty (no GPS fallback) | |
| Existing wrong-state store (e.g. California 7-Eleven) can be deleted from the Stores screen | |

---

## Store-First Shopping Session (Build 33)

| Test | Pass/Fail |
|---|---|
| Tap **Start** (not shopping) → "Where are you shopping?" sheet appears | |
| Sheet lists only stores that have active shopping items, ranked by item count | |
| "Shop all items" option appears when ≥ 1 store has items | |
| "Not shopping right now" dismisses the sheet without starting shopping mode | |
| Select **Sam's Club** → header shows "Shopping mode / Sam's Club", only Sam's Club items visible | |
| Select "Shop all items" → shopping mode starts with no single-store filter applied | |
| While in Sam's Club session, tap **Walmart** chip → "Switch from Sam's Club to Walmart?" confirm sheet appears | |
| Confirm switch → session changes to Walmart, only Walmart items shown | |
| Cancel switch → remain in Sam's Club session unchanged | |
| Tap **Done** while in shopping mode → session ends, active store cleared | |

---

## Wife-at-Home / Husband-at-Store Shared Planning (Build 33)

| Test | Pass/Fail |
|---|---|
| Husband starts shopping at **Sam's Club** | |
| Wife (on separate device) adds a **Walmart** item → Walmart chip count updates; Sam's Club session not interrupted | |
| Walmart item does **not** appear inside the Sam's Club session list | |
| Wife adds a **Sam's Club** item → husband sees it appear in his Sam's Club list naturally (realtime) | |
| No disruptive modal or session change fires on husband's device when wife adds any item | |
| Husband's active store remains Sam's Club throughout all wife's additions | |

---

## Geofence Suggest-Only (Build 33)

| Test | Pass/Fail |
|---|---|
| Arrive near a store with items → **notification** appears ("You're at Store X"), no auto-switch of active store | |
| Tap notification → Shopping tab opens, store is set as active, items shown | |
| Ignore notification → no change to app state; active store remains as-is | |
| Arrive near store while already shopping at a **different** store → G4 active-store lock suppresses notification; session is not hijacked | |
| Arrive near two stores within ~100m of each other → "Where are you shopping?" disambiguation sheet appears (no single notification) | |
| Drive past a store (< 25 s in region) → notification suppressed by G3 stability window | |
| Two arrivals at same store within 3 minutes → second notification suppressed by G1 per-store debounce | |
| Store with 0 active shopping items → arrival notification suppressed by G6 | |
| Global cooldown: two arrivals at different stores within 5 min → second notification suppressed by G8 | |

---

## Store Search & Location Validation (Build 33)

| Test | Pass/Fail |
|---|---|
| Enter ZIP **22193** → search resolves to Woodbridge, VA; all results are Virginia stores | |
| Enter ZIP **22151** → resolves to Springfield, VA; no Maryland/California results | |
| Search **Walmart** + ZIP 22193 → only VA-area Walmart locations returned | |
| Search **Giant** + ZIP 22193 → VA-area Giant if available; "no results" shown if not | |
| Search a store name with no ZIP, no GPS → error "Enter a zip, city, or address first" | |
| Enter invalid/nonexistent ZIP → warning "We couldn't confirm that location" | |
| Select a search result → save succeeds only if result is ≤ 25 miles from the resolved anchor | |
| Attempt to save a result > 25 miles from anchor → blocked with "appears outside your search area" | |
| Result in wrong state (e.g. CA result for VA ZIP) → blocked at save with state-mismatch message | |
| "Save without address" option always remains available for manual saves | |

---

## State Abbreviation Normalization (Build 33)

| Test | Pass/Fail |
|---|---|
| Stores tab: Papa John's with address "…Woodbridge, **VA**" → **no** warning badge when household stores are also VA | |
| Stores tab: store with "…**Virginia**" in address → compared as VA; no false warning against VA stores | |
| Stores tab: store in **CA** while majority are VA → ⚠️ warning badge correctly shown | |
| Warning message reads "CA instead of VA" (normalized codes, not raw strings) | |
| normalizeUSState("virginia") = "VA", normalizeUSState("VA") = "VA", normalizeUSState("Ca") = "CA" | |

---

## Weekly Budget Layout (Build 33)

| Test | Pass/Fail |
|---|---|
| Settings → Weekly budget row shows **$150** on a single line (not "$15 / 0") | |
| Budget **$1,500** displays on one line without wrapping | |
| Budget **$10,000** displays on one line without wrapping | |
| Pencil icon remains visible to the right of the value | |
| Label "Tap to adjust your weekly shopping budget" is fully readable below "Weekly budget" | |
