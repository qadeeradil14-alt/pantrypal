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
  marked_low_by uuid REFERENCES auth.users(id),  -- who flagged it
  got_it_by uuid REFERENCES auth.users(id),       -- who bought it
  added_by uuid REFERENCES auth.users(id),
  updated_at timestamptz DEFAULT now()
)

-- Required indexes
CREATE INDEX idx_items_household_low ON items(household_id, is_low);
CREATE INDEX idx_items_household_id ON items(household_id);

-- Row Level Security (CRITICAL — without this any user can read any household)
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see households they belong to
CREATE POLICY "household_members_own" ON household_members
  USING (user_id = auth.uid());

CREATE POLICY "households_member_only" ON households
  USING (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

CREATE POLICY "items_household_only" ON items
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

CREATE POLICY "items_household_insert" ON items FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

CREATE POLICY "items_household_update" ON items FOR UPDATE
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- updated_at auto-trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER items_updated_at BEFORE UPDATE ON items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
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
│   ├── CreateHouseholdScreen   — name household, shows invite code + Share sheet
│   └── JoinHouseholdScreen     — enter invite code OR tap deep link
└── Main (tab navigator — default: PantryTab)
    ├── PantryTab               — full item list, recently-low items float to top
    │   ├── ItemListScreen      — grouped by category, search bar
    │   │   States: loading (shimmer rows), empty (add items CTA), error (retry banner)
    │   │   ItemRow visual states: stocked (normal) / low (highlighted + badge)
    │   │   Offline: items marked low show "Queued" badge until synced
    │   └── AddItemScreen       — add custom item
    └── GroceryTab              — items marked low, tap row (not swipe) to mark "got it"
        └── GroceryListScreen   — live synced list, shopping mode ON by default
            States: empty ("All stocked up! 🛒"), loading (shimmer), error (retry)
            Shopping mode: screen stays on, large text, full-row tap to complete
            Completion: "All done — 6 items grabbed" toast on last item checked
```

### ItemRow Visual Spec
- **Stocked:** white background, item name, category icon, right chevron
- **Low:** amber background tint, item name bold, "LOW" badge top-right, tap anywhere marks it "got it" from grocery view
- **"Got it" tap:** optimistic local update immediately (don't wait for server), revert if server write fails with error toast
- **Offline write:** show "Syncing..." spinner on the row, resolve when back online

---

## Implementation Phases

### Phase 1: Foundation (Day 1)
**Goal:** Auth works, households work, two phones can join same household.

Files to create/modify:
- `app/_layout.tsx` — root layout with auth gate + `supabase.auth.onAuthStateChange` wired for token refresh
- `app/(auth)/welcome.tsx` — welcome screen
- `app/(auth)/sign-up.tsx` — signup form
- `app/(auth)/sign-in.tsx` — signin form
- `app/(setup)/create-household.tsx` — name household, show invite code with native Share sheet
- `app/(setup)/join-household.tsx` — enter invite code; handle invalid/expired codes with clear error message
- `lib/supabase.ts` — Supabase client setup
- `lib/auth.ts` — auth helpers (signUp, signIn, signOut, getSession, onAuthStateChange listener)
- `store/auth.ts` — Zustand auth store; re-hydrates on token refresh event
- `supabase/migrations/001_initial.sql` — tables + RLS policies + indexes (see Data Model above)
- **Seed items per-household:** insert 50 default items into `items` on household creation (DB trigger or called from `createHousehold()`). NOT a global seed — each household gets its own copy.

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
- `app/(main)/grocery/index.tsx` — grocery list screen with shopping mode ON by default
- `components/GroceryItem.tsx` — full-row tap to complete (not swipe — too hard at store with one hand)
- `components/EmptyGroceryState.tsx` — "All stocked up! 🛒" empty state
- `components/LoadingShimmer.tsx` — shimmer skeleton for both Pantry and Grocery screens
- `lib/realtime.ts` — Supabase Realtime subscription; separate from store (store accepts events via callback)
- `lib/appState.ts` — AppState listener: re-subscribe Realtime channel when app foregrounds after being backgrounded
- Verify real-time works between two devices (test with Expo Go)
- **Shopping mode ships in Phase 3** (not Phase 5): `keepAwake` via `expo-keep-awake`, larger text, toggle in header

### Phase 4: Push Notifications (Day 3)
**Goal:** Husband gets push notification when wife marks something low.

Files to create/modify:
- `lib/notifications.ts` — Expo push token registration, request permissions, send helpers
- `supabase/functions/notify-household.ts` — Edge Function triggered by Supabase webhook on `items` UPDATE where `is_low` changes to `true`. Must verify webhook signature (Supabase service role secret) — NOT a raw public HTTP endpoint.
- Update `household_members` to store `push_token` on every app launch (token changes on reinstall)
- Handle push permission denied gracefully: show "Enable notifications in Settings to get alerts" banner, app works without it

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
3. **No internet at the store** — grocery list is cached locally in Zustand. Read works offline. Writes queue and show "Queued" badge until synced.
4. **Invite code expires or is reused** — single-use: once household has 2+ members, code is invalidated (DB-level check, not app-level). Generate new one from settings.
5. **Wife gets a new phone** — push token changes on reinstall. Upsert `push_token` in `household_members` on every app launch.
6. **User deletes app and reinstalls** — auth session expires; sign in again, household membership persists in DB.
7. **Household has more than 2 members** — data model supports N members. v1 UI only shows "your household."
8. **Realtime subscription drops** — `AppState` listener re-subscribes on foreground. Show "Reconnecting..." banner if > 5s without connection.
9. **Concurrent invite join race** — two users submit same invite code simultaneously. DB unique constraint on `household_members(household_id, user_id)` prevents duplicate; atomic check handles race.
10. **Push notifications denied** — app works fully without notifications. Show one-time "Enable notifications for alerts" banner, dismissable permanently.

---

## Test Plan

### Unit tests (Jest)
- `lib/auth.ts` — signUp/signIn/signOut happy paths, invalid email, wrong password
- `lib/items.ts` — markLow, markGotIt, addItem, deleteItem
- `store/items.ts` — Zustand store transitions: optimistic update, revert on error
- `lib/realtime.ts` — subscription setup, teardown, reconnect on foreground

### Security tests (Supabase CLI / pgTAP — CRITICAL)
- **RLS enforcement:** User from Household A cannot SELECT items from Household B
- **RLS enforcement:** User from Household A cannot UPDATE items from Household B
- **Invite code uniqueness:** simultaneous joins with same code — only one succeeds
- **Edge Function auth:** unauthenticated request to notify-household returns 401

### Integration tests (Detox or manual)
- Two-device sync: mark item low on Device A, verify appears on Device B within 2 seconds
- Push notification delivery: mark item low, verify push arrives on other device
- **Offline-then-sync:** disable network, mark 3 items low, re-enable, verify all 3 sync
- **Reconnect recovery:** background app 60s (Realtime drops), foreground, verify subscription re-established
- **Concurrent update:** both phones tap same item at same moment, verify converges to consistent state

### Manual smoke tests before sending to wife
- [ ] Sign up on two phones, join same household via Share sheet invite
- [ ] 50 default items appear in pantry, grouped by category
- [ ] Tap Milk → amber highlight + LOW badge, appears on Grocery tab on both phones
- [ ] Open Grocery tab → Milk is there, shopping mode on (screen stays on)
- [ ] Tap Milk row → disappears from Grocery tab on both phones immediately
- [ ] Kill app, reopen → list persists (Zustand hydration)
- [ ] Push notification arrives when wife marks something (requires TestFlight build)
- [ ] Disable WiFi at store — Grocery list still readable, "Queued" badge shows on new marks
- [ ] Re-enable WiFi — queued marks sync within 5 seconds

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
