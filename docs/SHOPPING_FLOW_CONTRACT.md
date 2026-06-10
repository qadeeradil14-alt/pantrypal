# Shopping Flow Contract (v2)

> **Status:** Authoritative spec for the Shopping Flow Engine rewrite (`shopping-engine-v2`).
> The engine in `app/(main)/grocery/index.tsx` MUST conform to this document. Any
> behavior not described here is out of scope and must not be added during the rewrite.
>
> Product name is **Stokit 🛒**. Scope of this contract: the **personal, store-locked
> shopping session** only. Auth, household, pantry CRUD, store search, geofencing,
> invites, and visual design are explicitly **out of scope** and must not change.

---

## 1. Purpose

Replace the current fragile, effect-cascade-driven shopping/session logic with a
single deterministic **Shopping Flow Engine**: one reducer-style state machine that
owns the entire lifecycle:

```
Pantry item → Shopping list → Store stop → Receipt → Trip summary → Next store → End session
```

There must be exactly **one source of truth** for session state and **one set of
explicit transitions**. No screen, effect, or component may mutate session state
except by dispatching a defined action to the engine.

---

## 2. States

The session is always in exactly one of these states:

| State | Meaning |
|-------|---------|
| `idle` | No active session. Home/plan view. Start button visible. |
| `shopping_active` | A store is locked and the user is grabbing items at that store. |
| `receipt_pending` | All items at the current store are grabbed; the spend/receipt sheet is the only valid next interaction. Cannot leave until resolved. |
| `trip_summary_open` | The session is finished; the trip summary sheet is showing. No store is active. |
| `next_store_ready` | One store's receipt is done, more stores have remaining items; "next stop" prompt is showing. |
| `complete` | **Transient resolution phase, not a resting status.** Terminal transitions resolve it immediately — to `trip_summary_open` if ≥1 item was grabbed this session, or straight to `idle` if nothing was grabbed. The engine never *rests* in `complete`. |

### State data (the single source of truth)

The engine owns one object. No other module may hold a second copy of any of these.

```ts
type ShoppingSessionState = {
  status: 'idle' | 'shopping_active' | 'receipt_pending'
        | 'trip_summary_open' | 'next_store_ready' | 'complete';
  activeStoreId: string | null;     // the store currently locked
  routeStoreIds: string[];          // ordered stores planned this session
  completedStoreIds: string[];      // stores whose receipt step is done
  grabbedByStore: Record<string, number>;   // items grabbed per store this session
  spendByStore: Record<string, number>;     // money entered per store this session
  receiptByStore: Record<string, boolean>;  // receipt added per store this session
  startCountByStore: Record<string, number>;// items present when each store stop began
  pendingReceiptStoreId: string | null;     // store awaiting receipt resolution
};
```

Derived values (remaining items, next store, stop numbers, progress counters) are
**computed from this state + the shopping list**, never stored as separate session
flags.

---

## 3. Allowed Transitions

| From | Action | To | Notes |
|------|--------|-----|-------|
| `idle` | `START_SESSION(storeId\|null)` | `shopping_active` | Resets all per-session maps. `null` = "shop all", locks first route store. |
| `shopping_active` | `GRAB_ITEM(entryId)` | `shopping_active` | Increments grabbedByStore[active]. |
| `shopping_active` | `GRAB_ITEM` (last item at store) | `receipt_pending` | Auto-transition only when remaining-at-store hits 0 AND ≥1 item grabbed there. |
| `shopping_active` | `REQUEST_FINISH_STOP` | `receipt_pending` | Manual "done at this store". No-op if 0 grabbed. |
| `receipt_pending` | `RESOLVE_RECEIPT(amount, receiptAdded)` | `next_store_ready` \| `complete` | Marks store completed. Picks next store with remaining items; if none → `complete`. |
| `next_store_ready` | `START_NEXT_STORE(storeId)` | `shopping_active` | Locks next store, begins its stop. |
| `next_store_ready` | `END_SESSION` | `complete` | User ends early; builds trip summary. |
| `shopping_active` | `END_SESSION` | `receipt_pending` (if current store owes receipt) \| `complete` | "Done" button. Blocks on unresolved receipt first. |
| `complete` | (auto) | `trip_summary_open` | Builds + shows trip summary if ≥1 item was grabbed; else straight to `idle`. |
| `trip_summary_open` | `DISMISS_SUMMARY` | `idle` | Full reset. |
| any | `ABORT` | `idle` | Hard reset (used on logout / household switch). No summary. |

---

## 4. Forbidden Transitions

These must be **structurally impossible** (rejected by the reducer, not just avoided):

1. `idle → receipt_pending` — cannot open a receipt sheet with no session.
2. `receipt_pending → shopping_active` for a **different** store — must resolve receipt first.
3. `receipt_pending → next_store_ready` while `pendingReceiptStoreId` is unresolved (no silent skip).
4. Switching `activeStoreId` while `status === 'receipt_pending'` — store is locked until receipt resolves.
5. Any transition that leaves a **completed store with 0 remaining items** as `activeStoreId`.
6. Re-entering `shopping_active` for a store already in `completedStoreIds` within the same session.
7. Auto-starting a session (`idle → shopping_active`) from geofence/realtime/rehydration without explicit user action.
8. Clearing receipt state (`pendingReceiptStoreId`, spend sheet) **before** the receipt sheet has actually opened.

---

## 5. Single Source of Truth

- All session state lives in **one engine** (a reducer + selectors), colocated with
  the grocery screen or in `lib/shoppingEngine.ts`. There is exactly one instance.
- `store/stores.ts` keeps **only static store data + UI prefs** (`stores`,
  `pinnedStoreIds`). It must **no longer** own `activeStoreId`,
  `pendingReceiptStoreId`, or `receiptCompletedStoreIds` — those move into the engine.
- `store/shopping.ts` keeps **only the shared household shopping list** (`entries`).
  It does not hold any session/trip state.
- The grocery screen reads engine state and dispatches actions. It must not call
  `setShoppingMode`, `setActiveStore`, `setPendingReceiptStoreId`,
  `markReceiptCompleted`, or `clearReceiptTrip` directly anywhere — those scattered
  setters are deleted and replaced by `dispatch(action)`.

---

## 6. Reset Rules

- `START_SESSION` resets: `grabbedByStore`, `spendByStore`, `receiptByStore`,
  `startCountByStore`, `completedStoreIds`, `routeStoreIds`, `pendingReceiptStoreId`,
  trip spend/receipt counters → empty.
- `DISMISS_SUMMARY` / `ABORT` resets the **entire** `ShoppingSessionState` back to the
  `idle` initial value.
- A store entering `completedStoreIds` is filtered out of the active route; the engine
  picks the next store with remaining items deterministically (route order).
- No partial/stale maps may survive across sessions.

---

## 7. Persistence Rules

- **Session state is NEVER persisted.** It is in-memory only and resets to `idle` on
  every app launch / JS reload.
- Persisted (already correct in `store/stores.ts`): `stores`, `pinnedStoreIds`.
- Persisted (already correct in `store/shopping.ts`): nothing session-related;
  `entries` are refetched on focus.
- On rehydration / cold start, the engine MUST be `idle`. No effect may read a
  persisted value and auto-enter `shopping_active`.
- App backgrounded → foregrounded does **not** change session state (no auto-finish,
  no auto-reopen of sheets).

---

## 8. Hard Rules (acceptance criteria)

1. **No duplicate item rendering** — the shopping list dedupes derived vs. real entries by normalized name; one row per item.
2. **No completed empty store can stay active** — a store with 0 remaining items + receipt done is never `activeStoreId`.
3. **Done button uses one central finish handler** — exactly one `END_SESSION` path; the header button dispatches it and nothing else.
4. **Receipt state cannot clear before the receipt sheet opens** — `pendingReceiptStoreId` is set in the same transition that opens the sheet; resolution is the only clear path.
5. **Active session state must not persist across app restart** — verified by §7.
6. **After one store finishes, app selects next store with remaining items** — `RESOLVE_RECEIPT` → `next_store_ready` with a concrete `nextStoreId`.
7. **If no stores remain, session completes** — `RESOLVE_RECEIPT` with no next store → `complete` → trip summary.
8. **User can start a second session cleanly** — `DISMISS_SUMMARY` → `idle`; next `START_SESSION` starts from a fully reset state.

---

## 9. Test Scenarios (must pass before iPhone)

Pure-logic tests against the reducer (no UI), each asserting the resulting `status`,
`activeStoreId`, and completed/next-store selection:

1. **One store** — start → grab all → receipt_pending → resolve → complete → summary → idle.
2. **Two stores** — start A → grab all A → resolve → next_store_ready(B) → start B → grab all B → resolve → complete.
3. **Three stores** — A → B → C in route order; each resolves to the correct next store; C resolves to complete.
4. **Empty middle store** — route A,B,C but B has 0 items → B is skipped; never becomes active; never owes a receipt.
5. **No-logo store** — a store with no logo behaves identically (logo is presentation only; engine is logo-agnostic).
6. **Second session** — finish full session → dismiss summary → start again → state is fully reset (no carried grabbed/spend/route).
7. **Finish early** — `END_SESSION` from `shopping_active` with items remaining → blocks on receipt if owed, else completes with partial summary.
8. **Restart mid-session** — simulate rehydrate → engine is `idle` (no auto-resume).
