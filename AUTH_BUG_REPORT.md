# Auth Bug Report — Stokit V2

## Critical Issue: Sign-up with new email logs user into existing account

### Symptom
User navigates to the sign-up screen, enters a brand-new email address and password,
taps "Create account", and is immediately redirected into the main app (`/(tabs)`)
logged in as their **existing** account — not the new one.

---

## Codebase Context

- React Native + Expo SDK 56, Expo Router
- Supabase auth
- Zustand stores
- App lives in `apps/stokit-v2/`
- Auth store: `apps/stokit-v2/store/auth-store.ts`
- Root layout / routing guard: `apps/stokit-v2/app/_layout.tsx`
- Sign-up screen: `apps/stokit-v2/app/(auth)/sign-up.tsx`

---

## Root Cause

### Step-by-step trace

1. User signs out (or app is cold-launched after a session expires).
2. `INITIAL_SESSION` fires. Supabase's own token is expired/missing, but our
   **session backup** (`stokit:v2:session-backup` in AsyncStorage) still holds
   the old `refresh_token`.
3. The backup recovery in `auth-store.ts` calls
   `supabase.auth.refreshSession({ refresh_token: backup.refresh_token })`.
4. If the network is available and the refresh token is still valid, this
   **succeeds** and restores the old verified session.
5. `useAuthStore` is set with the old `user` + `session`.
6. `unlocked = verified || guestMode` → **`unlocked = true`**.
7. The routing guard in `_layout.tsx` sees `unlocked && inAuthGroup` (user is on
   `/welcome`) → redirects to `/(tabs)`. User is already in their account.

**But the user somehow ends up on the sign-up screen anyway** (e.g., they tap
back, deep-link, or the guard fires before the session is restored). Then:

8. User fills in a new email and taps "Create account".
9. `supabase.auth.signUp()` is called.
10. Supabase fires `onAuthStateChange` with `SIGNED_IN` — **using the previously
    restored session**, not the new account.
11. `unlocked` is already `true` (old verified user).
12. `_layout.tsx` routing guard: `unlocked && inAuthGroup` (on `/sign-up`) →
    `router.replace('/(tabs)')`.
13. User lands in the app as their old account. The new sign-up never completes.

### Key files involved

**`apps/stokit-v2/store/auth-store.ts`** — `INITIAL_SESSION` handler (lines ~220–293):
- Calls `supabase.auth.refreshSession({ refresh_token: backup.refresh_token })`
  even when the user intends to be logged out.
- On success, sets `user` and `session` for the old account.
- This session persists silently while the user is on the welcome/sign-up screen.

**`apps/stokit-v2/app/_layout.tsx`** — routing guard (lines ~115–136):
```ts
const unlocked = verified || guestMode;
// ...
if (unlocked && inAuthGroup) {
  router.replace('/(tabs)');  // ← fires even during a sign-up attempt
}
```

**`apps/stokit-v2/app/(auth)/sign-up.tsx`** — `submit()`:
- Calls `signUp(email, password)` which calls `supabase.auth.signUp()`.
- Does NOT clear existing Supabase session before attempting sign-up.
- The `onAuthStateChange` SIGNED_IN event fired by Supabase re-uses whatever
  session is currently active in Supabase's internal storage.

---

## What Has Already Been Tried (and why it didn't work)

1. **Removed "Continue without account" button** — eliminated guest-mode bypass.
   Shipped. Not related to this bug.

2. **Added `setSent(true)` in sign-up screen** — shows "Check your inbox" after
   `signUp()` returns `ok: true`. Does not help when `_layout.tsx` redirects
   before the state renders.

3. **Excluded `/sign-up` from the `verify-email` redirect** in `_layout.tsx` —
   fixed a separate redirect loop for the unverified-user case, but did NOT fix
   the session-leak case where `unlocked` is already `true`.

4. **NEVER added `clearLocalData()` / `resetAll()` to `signOut()`** — a previous
   attempt to fix auth caused total data loss (items, stores wiped from
   AsyncStorage). This must never be done again.

---

## What Needs to Be Fixed

### Fix 1 — Clear existing session before sign-up (highest priority)

In `apps/stokit-v2/store/auth-store.ts`, the `signUp` function should call
`supabase.auth.signOut({ scope: 'local' })` before calling `supabase.auth.signUp()`.
This ensures no lingering Supabase session can be re-activated during the sign-up flow.

```ts
signUp: async (email, password) => {
  // Clear any stale session before creating a new account
  await supabase.auth.signOut({ scope: 'local' });
  AsyncStorage.removeItem(SESSION_BACKUP_KEY).catch(() => {});

  const trimmedEmail = email.trim();
  // ... rest of existing signUp logic unchanged
}
```

**Important**: Do NOT call `useDurableStore.getState().resetAll()` or any function
that wipes AsyncStorage pantry data. Only clear the Supabase auth session.

### Fix 2 — Guard the routing redirect during active sign-up

In `apps/stokit-v2/app/_layout.tsx`, the `unlocked && inAuthGroup` redirect should
not fire when the user is actively on the sign-up screen AND has just initiated a
sign-up (i.e., `pendingEmail` is set in auth store).

Alternatively, add `/sign-up` to a "never auto-redirect" list so the screen
manages its own post-submit navigation.

```ts
// Current (broken):
if (unlocked && inAuthGroup) {
  router.replace('/(tabs)');
}

// Fixed:
const pendingEmail = useAuthStore((s) => s.pendingEmail);
if (unlocked && inAuthGroup && !pendingEmail) {
  router.replace('/(tabs)');
}
```

`pendingEmail` is already set in `signUp()` via `set({ pendingEmail: trimmedEmail })`
and cleared on `signIn()` success. It acts as a natural "sign-up in progress" flag.

### Fix 3 — Session backup should not auto-restore when user is in auth flow

In `apps/stokit-v2/store/auth-store.ts`, the `INITIAL_SESSION` recovery path should
check whether the user is currently in an auth flow (welcome/sign-up/sign-in screens)
before restoring a backup session. If the app launched directly into an auth screen
(no cached route), skip recovery.

---

## Constraints / Things That Must Not Change

- **Do NOT call `clearLocalData()`, `resetAll()`, or `clearLocal()`** on sign-out
  or sign-up. These wipe the user's local pantry data (items, stores, receipts)
  from AsyncStorage. Since stores are not backed up to Supabase, wiping them is
  permanent data loss.
- **Do NOT change `signOut()` scope** — `scope: 'local'` is intentional. Global
  sign-out would revoke the refresh token on all devices.
- **OTA deployments**: all fixes here are `.ts`/`.tsx` only — eligible for
  `eas update --branch production --environment production` from `apps/stokit-v2/`.
  Do NOT recommend a full EAS build.
- The `pantry_receipts` Supabase table needs `store_name` and `store_emoji` columns
  (migration not yet run by user) — unrelated to auth, don't touch sync code.

---

## Files to Touch

| File | Change |
|------|--------|
| `apps/stokit-v2/store/auth-store.ts` | Add `signOut({ scope: 'local' })` + backup clear at top of `signUp()` |
| `apps/stokit-v2/app/_layout.tsx` | Guard `unlocked && inAuthGroup` redirect with `!pendingEmail` |
| `apps/stokit-v2/app/(auth)/sign-up.tsx` | No changes needed if Fix 1+2 work |

---

## Verification Steps After Fix

1. Sign out of the app completely.
2. Go to welcome → sign-up.
3. Enter a **brand-new email** + password → tap "Create account".
   - Expected: "Check your inbox" screen.
   - Must NOT: redirect to main app or existing account.
4. Go back to sign-up, enter the **same existing email** → tap "Create account".
   - Expected: "Already registered" screen with Sign in + Forgot password.
5. Sign in normally with existing account.
   - Expected: lands in main app with all pantry data intact.
