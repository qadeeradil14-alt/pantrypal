# Stokit — Invitation & Household QA Checklist

Manual test plan for real-device validation before App Store submission.

---

## Tester Setup

| | Device A | Device B |
|---|---|---|
| Who | Husband (main user) | Wife (invited user) |
| Build | Same TestFlight build | Same TestFlight build |
| Network | Connected to internet | Connected to internet |
| Account | Signed in | Ready to create or sign in |

---

## Test 1 — Create Household

**Device A**

- [ ] Open Stokit fresh (no household)
- [ ] Tap **Create a household**
- [ ] Enter household name → tap Create
- [ ] Confirm app routes into main pantry screen (not back to setup)
- [ ] Confirm household name appears in Settings → Household
- [ ] Close app completely (swipe away)
- [ ] Reopen app
- [ ] Confirm app goes directly to pantry — **not** to setup screen

---

## Test 2 — Share Invite

**Device A**

- [ ] Open **Settings** → **Household**
- [ ] Confirm 6-character invite code is visible (e.g. `AB3K7Z`)
- [ ] Confirm invite code contains only letters and digits (no ambiguous chars like 0, O, I, L, 1)
- [ ] Tap **Share invite link**
- [ ] Send via SMS to Device B
- [ ] Confirm SMS text says **Stokit** — not PantryPal
- [ ] Confirm invite code is clearly visible in the SMS
- [ ] Confirm instructions explain how to install and then enter the code (not just a raw link)

---

## Test 3 — Join Household

**Device B**

- [ ] Open SMS from Device A
- [ ] Tap TestFlight link → install Stokit
- [ ] Open Stokit → create an account or sign in
- [ ] Tap **Join with an invite code**
- [ ] Enter the full 6-character code from the SMS
- [ ] Confirm the input accepts all 6 characters (including any digits in the code)
- [ ] Confirm the input does not truncate after 2 characters
- [ ] Tap **Join household**
- [ ] Confirm success: app routes into shared pantry
- [ ] Confirm household name matches Device A's household name (Settings)

**Device A** (verify)

- [ ] Open app — confirm pantry still shows same household

---

## Test 4 — Invalid Code

**Device B**

- [ ] Go to Join household screen
- [ ] Enter a wrong 6-character code (e.g. `ZZZZZZ`)
- [ ] Tap **Join household**
- [ ] Confirm a clear error message appears ("Invalid code" or similar)
- [ ] Confirm no crash
- [ ] Confirm able to correct the code and try again

---

## Test 5 — Reopen App (Session Restore)

**Device A**

- [ ] Close app completely (swipe away)
- [ ] Reopen app
- [ ] Confirm still signed in, still in household (no login screen, no setup screen)
- [ ] Confirm pantry data intact

**Device B**

- [ ] Close app completely
- [ ] Reopen app
- [ ] Confirm still signed in, still in same shared household
- [ ] Confirm pantry data visible

---

## Test 6 — Leave Household

**Device B**

- [ ] Open **Settings**
- [ ] Scroll to **Danger zone** → tap **Leave household**
- [ ] Confirm a warning alert appears explaining consequences (pantry, shopping lists, stores, receipts access lost)
- [ ] Tap **Cancel** → confirm nothing happens, still in household
- [ ] Tap **Leave household** again → tap **Leave household** in the alert
- [ ] Confirm app navigates to the household setup screen (Create or Join)
- [ ] Confirm no crash
- [ ] Confirm sign-out did NOT happen (Stokit session still active — just no household)

**Device A** (verify)

- [ ] Confirm Device A is still in the household
- [ ] Confirm pantry data still intact on Device A

---

## Test 7 — Rejoin After Leaving

**Device A**

- [ ] Open Settings → Household → tap **Share invite link**
- [ ] Send new SMS invite to Device B

**Device B**

- [ ] Tap **Join with an invite code** on the setup screen
- [ ] Enter full 6-character code
- [ ] Confirm join succeeds — routes into shared household
- [ ] Confirm no duplicate or corrupted household state

---

## Test 8 — Owner Edge Case

**Device A** (owner)

- [ ] Open **Settings** → **Danger zone** → tap **Leave household**
- [ ] Confirm alert specifically warns about being the household owner
- [ ] Confirm the warning mentions other members will still have access but there will be no owner
- [ ] Tap **Cancel** — confirm nothing changes
- [ ] Do NOT leave as owner for now (household would be ownerless)

---

## Pass Criteria

All tests pass when:

- [ ] Invite code is visible, correct format, full 6 characters
- [ ] Share message is Stokit-branded with clear install + code instructions
- [ ] Join screen accepts all 6 characters including digits
- [ ] Joining routes into shared household with no errors
- [ ] Both devices remain in household after app reopen
- [ ] Leave household clears state and routes to setup — does not sign out
- [ ] Owner sees appropriate warning before leaving
- [ ] No crashes in any of the above flows
- [ ] No "PantryPal" text visible in any of these flows
