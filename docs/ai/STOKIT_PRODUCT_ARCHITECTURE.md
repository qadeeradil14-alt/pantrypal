# Stokit / PantryPal — Product Architecture Rules

> Referenced by [CLAUDE.md](../../CLAUDE.md). These rules describe the product
> contract Stokit must always honor. Protect them in every change.

## Where this lives in code

- **Screens / navigation:** `app/` (Expo Router groups `(auth)`, `(main)`, `(setup)`).
- **State (Zustand):** `store/` — notably `shopping.ts` (active session),
  `stores.ts` (saved stores / location), `household.ts` (shared household),
  `items.ts` (inventory / list), plus `auth.ts`, `settings.ts`, `theme.ts`.
- **Data:** `supabase/` and `lib/` (Supabase client, queries, edge functions such
  as `notify-store-arrival`).

When changing any flow below, trace it through **screen → store → Supabase** and
back, not just the file you were pointed at.

---

## 1. Shared Household Planning

Household members can add or mark items low from home.

Example:
- Wife is at home.
- She adds milk to Walmart.
- She adds eggs to Sam's Club.
- She marks soap low.

These changes belong to the **shared household plan**.

Shared household data includes:
- pantry / inventory items
- low-stock state
- store assignments
- shopping list entries
- receipts / history (if applicable)

---

## 2. Personal Active Shopping Session

A shopper in-store controls their own active shopping session.

Example:
- Husband is at Sam's Club.
- He taps **Start**.
- He chooses Sam's Club.
- His phone enters Shopping mode **for Sam's Club**.
- Walmart or Global Food items must **not** hijack his active session.

Personal / session state includes:
- active shopping store
- shopping mode
- current trip flow
- local quantity picker
- local modal state
- geofence suggestion interaction

### Core rule

**Household list is shared. Active shopping session is personal and store-locked.**

Do not break this.

---

## 3. Store-First Shopping Flow

Shopping should always start with store context.

When the user taps **Start Shopping**:

- If a high-confidence nearby store exists, confirm:
  `Start shopping at Sam's Club?`
- If multiple stores are nearby, ask:
  `Where are you shopping?`
- If no nearby store is reliable, show the store selector:
  - stores with item counts
  - nearby stores if available
  - **Shop all items**
  - **Not shopping right now**

Once the user selects a store:

- lock the active session to that store
- show only that store's items
- do **not** show mixed-store items
- do **not** switch stores silently

If the user taps another store during an active session, ask:
`Switch from Sam's Club to Walmart?`

---

## 4. Geofence Philosophy

Geofence is a **suggestion layer, not the brain** of the app.

Geofence **may** suggest:
`You're near Walmart. You have 4 items here. Open list?`

Geofence **must not**:
- silently start shopping mode
- silently switch the active store
- hijack an active shopping session
- spam notifications
- route to stale store state

If multiple stores are nearby, ask:
`Where are you shopping?`

---

## 5. Store Search / Location Validation

Store search must validate location **globally**, not through hardcoded ZIP fixes.

When the user enters a ZIP / city / state / address:

1. Resolve the search anchor:
   - lat / lng
   - city
   - state / state code
   - ZIP / postcode if available
   - country
2. Normalize US state names and abbreviations.
3. Filter provider results by:
   - distance from the search anchor
   - matching state / region
   - provider confidence if available
4. Reject wrong-region fallback results.
5. Validate again before saving the store.

### Examples

- `22193` → Woodbridge, VA
- `22151` → Springfield, VA
- `VA` must equal `Virginia`
- `CA` must equal `California`
- `MD` must equal `Maryland`
- `DC` must equal `District of Columbia`

### Do not

- Do not compare raw strings like `VA !== Virginia`.
- Do not save California / Maryland fallback results for a Virginia ZIP.
- Do not auto-delete existing saved stores silently.
