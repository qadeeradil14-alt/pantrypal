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
