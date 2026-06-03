# Stokit — Build 29 Location / Geofence Regression QA

Manual real-device test plan for location, store search, geofencing, and shopping mode.

---

## Pre-conditions

- Physical iPhone (not simulator)
- Location permission granted for Stokit (Settings → Privacy → Location → Stokit → Always)
- Precise Location ON
- Connected to internet
- At least one household and one shopping item marked low

---

## Test 1 — Location Permission State

- [ ] Open Stokit → Stores tab → tap **Add**
- [ ] Confirm the add sheet opens immediately (no crash, no hang)
- [ ] Tap a preset like **Walmart**
- [ ] Confirm "Searching nearby…" appears briefly then results load
- [ ] Confirm the map shows pins near your **actual current location** (not Fort Belvoir / Pohick Road)
- [ ] Confirm results load within ~5 seconds
- [ ] If no results, confirm "Enter the address" fallback screen appears (not infinite spinner)

---

## Test 2 — Precise Location Disabled

- [ ] Go to Settings → Privacy → Location → Stokit → set to Precise Location OFF
- [ ] Open Stokit → Stores → Add → tap **Walmart**
- [ ] Confirm the app still searches (uses approximate location or last known)
- [ ] Confirm results still appear (less precise but no hang/crash)
- [ ] Re-enable Precise Location for subsequent tests

---

## Test 3 — Add Walmart Near Current Location

- [ ] Open Stores → Add → tap **Walmart** preset
- [ ] Confirm map shows multiple Walmart pins near you
- [ ] Confirm addresses are realistic for your area (not Fort Belvoir if you're not there)
- [ ] Tap the correct Walmart → tap **Add selected location**
- [ ] Confirm the store appears in your list with correct address
- [ ] Confirm the address shown in the list matches the one you selected

---

## Test 4 — Add Sam's Club Near Current Location

- [ ] Open Stores → Add → tap **Sam's Club**
- [ ] Confirm results are near your area
- [ ] Select the correct Sam's Club → save
- [ ] Confirm saved address is correct

---

## Test 5 — Add Custom Store With "Use Where I Am Now"

- [ ] Open Stores → Add → type a custom store name (e.g. "Kabul Halal Market")
- [ ] Tap **Use where I am now**
- [ ] Confirm the button shows a loading spinner
- [ ] Confirm it either: (a) resolves within 10 seconds and shows your address, OR (b) times out with a clear error message ("Location timed out…")
- [ ] Confirm the button re-enables after error (not permanently stuck)
- [ ] If location resolved: confirm the address reflects your actual location (not a stale/wrong address)
- [ ] Save the store — confirm it appears with correct coordinates

---

## Test 6 — Verify Saved Store Address and Coordinates

- [ ] After adding Walmart (Test 3), tap **Directions** on the store row
- [ ] Confirm Maps opens and routes to the correct Walmart location
- [ ] Confirm the address on the store card matches the real Walmart address

---

## Test 7 — Multiple Nearby Results

- [ ] Search for **Walmart** in a metro area
- [ ] Confirm MORE THAN ONE result appears on the map (multiple pins)
- [ ] Confirm you can scroll the address cards at the bottom to see different locations
- [ ] Confirm tapping a different pin updates the selected card

---

## Test 8 — No Notification When Not Near Store

- [ ] Add Walmart with correct GPS coordinates (Test 3)
- [ ] Stay at home (not near the store)
- [ ] Wait 10 minutes
- [ ] Confirm NO "You're at Walmart" notification fires
- [ ] Confirm NO arrival banner appears on any screen

---

## Test 9 — Notification Fires Once When Near Store

- [ ] Drive to or walk near the saved Walmart (within ~150m of entrance)
- [ ] Confirm a "You're at Walmart" notification appears
- [ ] Confirm it fires only ONCE (not repeatedly every few minutes)
- [ ] Tap the notification → confirm Shopping tab opens
- [ ] Walk away and come back within 3 minutes → confirm no duplicate notification

---

## Test 10 — Remove Store Clears Geofence

- [ ] In Stores tab, tap **Remove** on a saved store
- [ ] Confirm the store is removed
- [ ] Wait near where that store's geofence was
- [ ] Confirm NO arrival notification fires for the removed store

---

## Test 11 — Start Shopping Mode Manually

- [ ] Mark 2-3 items low in Pantry tab
- [ ] Go to Grocery tab
- [ ] Tap **Start** button
- [ ] Confirm shopping mode activates (header shows "Shopping mode")
- [ ] Confirm items from pantry appear in the shopping list
- [ ] Tap **Done** to exit
- [ ] Confirm shopping mode exits cleanly

---

## Test 12 — No Premature Shopping Mode on App Reopen

- [ ] Start shopping mode → tap Done to end trip cleanly
- [ ] Force-close the app (swipe away from app switcher)
- [ ] Reopen Stokit
- [ ] Confirm Grocery tab is NOT in shopping mode on launch
- [ ] Confirm NO spend sheet appears on launch
- [ ] Confirm the Start button is in its normal state (not a Done button)

---

## Test 13 — Complete a Store Stop

- [ ] Mark 2 items low assigned to Walmart
- [ ] Start shopping mode, tap Walmart chip
- [ ] Tap "Got it" on both items
- [ ] Confirm the store stop complete sheet appears with a spend input
- [ ] Enter an amount (e.g. 45.00) → tap **Save amount**
- [ ] Confirm the sheet dismisses cleanly
- [ ] Confirm the trip total updates in the header card

---

## Test 14 — Stop Complete Sheet Dismisses (Skip Path)

- [ ] Mark 2 items low assigned to Food Lion
- [ ] Start shopping mode → complete both items
- [ ] When spend sheet appears, tap **Skip for now**
- [ ] Confirm the sheet closes immediately
- [ ] Confirm you are NOT stuck on the sheet
- [ ] Confirm shopping mode continues (not ended prematurely)

---

## Test 15 — Food Lion / Sam's Club / Walmart Tabs Don't Get Stuck

- [ ] Add Food Lion, Sam's Club, and Walmart as stores
- [ ] Mark 1-2 items low for each store
- [ ] Start shopping mode
- [ ] Tap each store chip (Food Lion, Sam's Club, Walmart)
- [ ] Complete items at each store by tapping "Got it"
- [ ] At each store's completion sheet, tap Skip
- [ ] Confirm no sheet gets stuck, no infinite loop, no crash
- [ ] Confirm trip ends cleanly after all stops

---

## Test 16 — Share / Invite Branding

- [ ] Open Settings tab
- [ ] Tap **Share invite link**
- [ ] iOS share sheet appears
- [ ] Confirm the share preview does NOT show TestFlight's logo
- [ ] Confirm the message text says "Stokit" (not PantryPal)
- [ ] Confirm the invite code is visible in the message text
- [ ] If EXPO_PUBLIC_INVITE_BASE_URL is not set: confirm message has clear 2-step format (install link + code)

---

## Pass Criteria

All tests pass when:

- [ ] Store search returns nearby, accurate results within 5 seconds
- [ ] No "Pohick Road / Fort Belvoir" address appears for unrelated stores
- [ ] Multiple result pins appear for major chains
- [ ] "Use where I am now" button re-enables within 10 seconds max
- [ ] Saved store coordinates and address match the selected result
- [ ] No arrival notification fires when user is at home
- [ ] Arrival notification fires once when user enters geofence
- [ ] App reopen does NOT auto-start shopping mode
- [ ] App reopen does NOT show spend sheet
- [ ] Store completion sheet dismisses via Skip without getting stuck
- [ ] Share sheet shows Stokit branding, not TestFlight's logo
