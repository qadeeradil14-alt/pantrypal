# Stokit Testing Playbook
> Work through each section top to bottom. Check off as you go.

---

## 1. Account & Household Setup
- [ ] Sign up with a new account (or log in)
- [ ] Go to **Settings** → set your weekly grocery budget (e.g. $200)
- [ ] Copy the household invite link and send to Nargis
- [ ] Confirm Nargis can join and see the same pantry/grocery list

---

## 2. Pantry — Adding Items
- [ ] Tap **+** on the Pantry tab → type an item manually (e.g. "Milk")
- [ ] Add a quantity and expiry date
- [ ] Try scanning a barcode → does it recognize the product? ⚠️ *Bug #1 reported*
- [ ] Confirm item appears under the correct category/aisle
- [ ] Add 3–5 items total so the pantry has real content

---

## 3. Grocery List
- [ ] Tap **+** on the Grocery tab → add a few items (e.g. "Eggs", "Bread")
- [ ] Assign one item to a specific store
- [ ] Check items off one by one — confirm the progress bar moves
- [ ] Have Nargis add an item from her phone → confirm it appears on yours in real time
- [ ] Check off all items — confirm the list shows complete

---

## 4. Stores & Geofencing
- [ ] Go to **Stores tab** → tap **+** → type a store name (e.g. "Walmart")
- [ ] Confirm the map shows nearby locations and you can select one
- [ ] Try typing "Kmart" ⚠️ *Bug #2 — crash reported, fix pending*
- [ ] Save a store with a real address near you
- [ ] Leave home and physically drive/walk near that store
- [ ] Confirm Nargis gets a push notification: *"Hewad arrived at [Store]"*
- [ ] Confirm you get a notification too

---

## 5. Receipts & Budget
- [ ] Go to **Receipts tab** → tap **+**
- [ ] Take a photo of a real receipt OR enter a total manually (e.g. $67.50)
- [ ] Save it → go to **Grocery tab** → confirm the budget bar moves ⚠️ *Bug #4 — bar doesn't update without restart, fix pending*
- [ ] Add 2–3 receipts across the week
- [ ] Confirm total spend shows correctly vs your budget
- [ ] Try to delete a receipt ⚠️ *Bug #3 — no delete button yet, fix pending*

---

## 6. Notifications
- [ ] Go to **Settings** → confirm notifications are enabled
- [ ] Add an item with an expiry date set to tomorrow → check if you get an expiry alert
- [ ] Trigger a store arrival (see Section 4) → confirm notification fires

---

## 7. Household Sync (Two-Person Test)
- [ ] Hewad adds a pantry item → Nargis should see it appear within seconds
- [ ] Nargis checks off a grocery item → Hewad should see it checked off
- [ ] Hewad adds a store → Nargis should see it in her Stores tab
- [ ] Both scan receipts → confirm spend adds up correctly on both phones

---

## 8. Edge Cases to Watch
- [ ] What happens with no internet? (turn off WiFi + cellular → try adding an item)
- [ ] Does the app crash on any other store names besides Kmart?
- [ ] Does the barcode scanner work in low light?
- [ ] What happens if you add an item that's already in the pantry?

---

## Known Bugs — Pending Fix (do not push yet)

| # | Bug | Priority |
|---|-----|----------|
| 1 | Barcode scanner doesn't recognize products | 🔴 High |
| 2 | Kmart (global chain) crashes the map | 🔴 High |
| 3 | Receipts have no delete button | 🟡 Medium |
| 4 | Budget bar doesn't refresh after adding a receipt | 🔴 High |

---

*Report new bugs → they get added here → say "fix everything" → one build pushed to TestFlight.*
