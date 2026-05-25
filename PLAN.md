# PantryPal — Implementation Plan

**Design doc:** `~/.gstack/projects/GarryTansCompany/hewadadil-main-design-20260524-210624.md`
**Approach:** Shared Quick-Log (Approach A — minimal viable)
**Stack:** Expo + TypeScript + Supabase (auth, realtime DB, push notifications)
**Goal:** Replace the grocery phone call. Wife marks items low in 2 taps. Husband sees live list at the store.

---

## What We're Building

A household pantry awareness app. Two people share one household. Either person marks items as low. The shopper sees a live grocery list on their phone at the store. The phone call stops happening.

**NOT in v1:** barcode scanning, expiry tracking, recipes, meal planning, AI, quantity tracking, categories, history.

---

## Architecture

### Tech Stack
- **Frontend:** Expo SDK 51, React Native, TypeScript
- **Backend:** Supabase (Postgres + Realtime + Auth + Push via Expo Notifications)
- **State:** Zustand (lightweight, no Redux overhead)
- **Navigation:** Expo Router (file-based, simplest for this app size)

### Data Model

```sql
-- households: one per family unit
households (
  id uuid PRIMARY KEY,
  name text,
  invite_code text UNIQUE,  -- short code for inviting spouse
  created_at timestamptz
)

-- household_members: users belong to one household
household_members (
  household_id uuid REFERENCES households(id),
  user_id uuid REFERENCES auth.users(id),
  role text CHECK (role IN ('owner', 'member')),
  push_token text,          -- Expo push token for notifications
  PRIMARY KEY (household_id, user_id)
)

-- items: the master item library (pre-seeded + user additions)
items (
  id uuid PRIMARY KEY,
  household_id uuid REFERENCES households(id),
  name text NOT NULL,
  category text,            -- 'fridge', 'pantry', 'freezer'
  is_low boolean DEFAULT false,
  added_by uuid REFERENCES auth.users(id),
  updated_at timestamptz
)
```

### Real-time Sync
Supabase Realtime on the `items` table. Both phones subscribe to `household_id` channel. When wife marks item low, husband's phone updates in < 1 second.

### Screen Map
```
App
├── Auth
│   ├── WelcomeScreen      — logo, "Get Started"
│   ├── SignUpScreen       — email + password
│   └── SignInScreen       — email + password
├── Household Setup
│   ├── CreateHouseholdScreen   — name household, generates invite code
│   └── JoinHouseholdScreen     — enter invite code from spouse
└── Main (tab navigator)
    ├── PantryTab               — full item list, tap to mark low
    │   ├── ItemListScreen      — grouped by category, search bar
    │   └── AddItemScreen       — add custom item
    └── GroceryTab              — items marked low, tap to mark "got it"
        └── GroceryListScreen   — live synced list, swipe to complete
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1)
**Goal:** Auth works, households work, two phones can join same household.

Files to create/modify:
- `app/_layout.tsx` — root layout with auth gate
- `app/(auth)/welcome.tsx` — welcome screen
- `app/(auth)/sign-up.tsx` — signup form
- `app/(auth)/sign-in.tsx` — signin form
- `app/(setup)/create-household.tsx` — create household + show invite code
- `app/(setup)/join-household.tsx` — enter invite code
- `lib/supabase.ts` — Supabase client setup
- `lib/auth.ts` — auth helpers (signUp, signIn, signOut, getSession)
- `store/auth.ts` — Zustand auth store
- `supabase/migrations/001_initial.sql` — tables above

### Phase 2: Pantry Screen (Day 2 morning)
**Goal:** Pre-seeded item library. Wife can see items and mark them low.

Files to create/modify:
- `app/(main)/pantry/index.tsx` — item list screen
- `app/(main)/pantry/add-item.tsx` — add custom item
- `components/ItemRow.tsx` — single item row with tap-to-mark-low
- `components/CategorySection.tsx` — grouped section header
- `lib/items.ts` — CRUD helpers for items table
- `store/items.ts` — Zustand items store with Realtime subscription
- `supabase/seed.sql` — 50 pre-seeded common items
- `constants/defaultItems.ts` — item library: milk, eggs, bread, butter, cheese,
  yogurt, chicken, beef, salmon, spinach, broccoli, carrots, onions, garlic,
  tomatoes, potatoes, rice, pasta, beans, chickpeas, lentils, olive oil, salt,
  pepper, flour, sugar, coffee, tea, oats, cereal, juice, water bottles

### Phase 3: Grocery List + Real-time (Day 2 afternoon)
**Goal:** Grocery list syncs live. Shopper can mark items as "got it."

Files to create/modify:
- `app/(main)/grocery/index.tsx` — grocery list screen
- `components/GroceryItem.tsx` — item with swipe-to-complete
- `components/EmptyGroceryState.tsx` — "All stocked up!" empty state
- `lib/realtime.ts` — Supabase Realtime subscription setup
- Verify real-time works between two devices (test with Expo Go)

### Phase 4: Push Notifications (Day 3)
**Goal:** Husband gets push notification when wife marks something low.

Files to create/modify:
- `lib/notifications.ts` — Expo push token registration, send helpers
- `supabase/functions/notify-household.ts` — Edge Function: on item.is_low=true,
  send push to all household members except the updater
- Update `household_members` to store `push_token` on login

### Phase 5: Polish + Sharing (Day 4)
**Goal:** App feels good enough to send to wife.

- Add item search/filter to pantry screen
- Add "shopping mode" toggle on grocery screen (keeps screen on, larger text)
- Add onboarding flow for new users (2-screen walkthrough)
- Create shareable invite link: `pantrypal://join?code=XXXXX`
- Test end-to-end: wife installs via TestFlight, joins household, marks milk low,
  husband sees it instantly

---

## Pre-seeded Items List (50 items)

**Fridge:** Milk, Eggs, Butter, Cheese, Yogurt, Chicken breast, Ground beef, Salmon, Lettuce, Spinach, Broccoli, Carrots, Celery, Bell peppers, Tomatoes, Cucumber, Leftover containers, Orange juice, Cream, Sour cream

**Pantry:** Rice, Pasta, Bread, Flour, Sugar, Salt, Pepper, Olive oil, Vegetable oil, Canned tomatoes, Beans (black), Chickpeas, Lentils, Oats, Cereal, Coffee, Tea, Honey, Vinegar, Soy sauce, Hot sauce, Onions, Garlic, Potatoes, Crackers, Peanut butter, Jam

**Freezer:** Frozen peas, Frozen corn, Ice cream, Frozen fish, Frozen chicken

---

## Edge Cases

1. **Both spouses mark the same item low simultaneously** — idempotent: `is_low=true` is fine either way, last write wins, no data loss
2. **Shopper marks "got it" but wife says it's still low** — item goes back to not-low; wife can re-mark it. No permanent state.
3. **No internet at the store** — grocery list is cached locally in Zustand. Read works offline. Writes queue and sync when back online (Supabase offline support).
4. **Invite code expires or is reused** — invite code is single-use: once a household has 2 members, the invite code is invalidated. Generate new one from settings.
5. **Wife gets a new phone** — push token changes on reinstall. Update `push_token` in `household_members` on every app launch.
6. **User deletes the app and reinstalls** — auth session expires; they sign in again, household membership is preserved in DB.
7. **Household has more than 2 members** — data model supports N members (grandparent living with family, roommates). v1 UI only shows "your household" without member management.

---

## Test Plan

### Unit tests (Jest)
- `lib/auth.ts` — signUp/signIn/signOut happy paths, invalid email, wrong password
- `lib/items.ts` — markLow, markGotIt, addItem, deleteItem
- `store/items.ts` — Zustand store transitions

### Integration tests (Detox or manual)
- Two-device sync: mark item low on Device A, verify appears on Device B within 2 seconds
- Push notification delivery: mark item low, verify push arrives on other device
- Offline: disable network, mark items, re-enable, verify sync

### Manual smoke tests before sending to wife
- [ ] Sign up on two phones, join same household
- [ ] Milk shows in pantry list
- [ ] Tap milk → it moves to grocery list on both phones
- [ ] Open grocery list → milk is there
- [ ] Tap "got it" → milk disappears from grocery list on both phones
- [ ] Kill app, reopen → list persists
- [ ] Push notification arrives when wife marks something (requires TestFlight build)

---

## Success Criteria (from design doc)

- Wife uses it to log at least 3 items per week for 4 consecutive weeks without being asked
- Shopper arrives with accurate list 80%+ of grocery trips
- The phone call to check what's low stops happening
- Failure signal: either person stops using it within 2 weeks

---

## Open Questions (deferred)

1. **Supabase free tier limits** — 50k MAU free, 500MB DB, 5GB bandwidth. More than enough for a household MVP.
2. **TestFlight distribution** — requires Apple Developer account ($99/year). Expo Go works for testing without it.
3. **Monetization** — free for now. Revisit after household validation.

---

## Dependencies

- `@supabase/supabase-js` — backend client
- `expo-notifications` — push notifications
- `zustand` — state management
- `expo-router` — navigation
- `@expo/vector-icons` — icons
- `react-native-gesture-handler` — swipe-to-complete gesture

---

## NOT In Scope (v1)

- Barcode scanning
- AI / image detection
- Expiry date tracking
- Recipe integration
- Meal planning
- Quantity tracking (just "low" or "not low")
- Shopping history
- Multiple households per user
- Web version
