# Stokit V2 Rebuild Handoff

## Objective

Build a completely separate, simulator-ready Stokit V2 app from scratch.

This is a new implementation with the same grocery-management concept, not a patch of the existing PantryPal app.

## Isolation Boundary

- Work only inside `/Users/hewadadil/Documents/PantryPal/apps/stokit-v2`.
- Do not modify files outside that folder.
- Do not replace or clean up the existing PantryPal app.
- The parent worktree is dirty with unrelated existing changes. Do not revert them.
- Do not push, publish OTA, run EAS builds, or touch production.
- Simulator testing only.

## Current State

- Parent repo branch: `shopping-engine-v2`.
- `apps/stokit-v2` currently contains only an empty Product Design Vite starter:
  - `AGENTS.md`
  - `index.html`
  - `package.json`
  - `src/App.jsx`
  - `src/main.jsx`
  - `src/styles.css`
  - `vite.config.mjs`
- No V2 product logic or UI has been implemented yet.
- Replace this isolated starter with an Expo SDK 56 mobile app suitable for the iOS simulator.
- The selected visual reference is:
  `/Users/hewadadil/Library/Caches/com.raycast-x.macos/clipboard/file-5a847e34a4987c5601a3c2c3e20c670d.png`

## Approved Product Brief

Create a dark luxury pantry dashboard inspired by the reference image:

- Premium near-black background
- Warm orange/gold accents
- Cream text
- Elegant serif display headings
- Dark rounded cards with subtle borders
- Strong hierarchy and polished bottom navigation
- Smooth transitions between features and tabs

Core sections:

1. Pantry
2. Shopping
3. Activity
4. Receipts
5. Stores
6. Settings

Product journey:

`pantry -> low stock -> shopping route -> receipt logging -> spending summary`

## Approved Architecture

```text
apps/stokit-v2/
├── app/
│   ├── (tabs)/
│   │   ├── pantry.tsx
│   │   ├── shopping.tsx
│   │   ├── activity.tsx
│   │   ├── receipts.tsx
│   │   ├── stores.tsx
│   │   └── settings.tsx
│   └── _layout.tsx
├── components/
│   ├── pantry/
│   ├── shopping/
│   ├── receipts/
│   ├── shared/
│   └── stores/
├── core/
│   ├── shopping-machine/
│   ├── repositories/
│   └── services/
├── store/
│   ├── durable-store.ts
│   └── session-store.ts
├── types/
├── theme/
├── tests/
└── docs/
```

Use Expo Router, TypeScript, Zustand, and AsyncStorage with Expo SDK 56-compatible package versions.

## State Ownership

### Durable State

Persist only:

- Pantry items
- Stores
- Receipts
- Completed trips
- Activity events
- Household preferences

Use a repository layer so future network/Supabase failures can never wipe local stores or items.

### Transient State

The active shopping session must:

- Live in one non-persisted session store
- Be controlled by one reducer/state machine
- Never be restored after app restart
- Never be scattered across screens

Screen-only form/modal state stays local to the screen.

## Data Model

- `PantryItem`: id, name, quantity, unit, status, storeId, expiryDate, timestamps
- `Store`: id, name, optional logo/image metadata, timestamps
- `ShoppingEntry`: unique pantry item reference, assigned store, picked state
- `Receipt`: id, tripId, storeId, amount, status, optional image URI, timestamp
- `Trip`: id, stores visited, items bought, receipt IDs, total spent, store breakdown
- `ActivityEvent`: item added, marked low, picked up, receipt logged, store added

Store logos are visual only and must never control business logic.

## Shopping State Machine

```text
idle
-> shopping_store
-> receipt_prompt
-> next_store_ready
-> shopping_store
-> trip_summary
-> idle
```

Required deterministic flow:

```text
Pantry item marked low
-> appears in Shopping
-> start shopping
-> items grouped by store
-> shop current store
-> Done
-> receipt prompt
-> save or skip receipt
-> next store
-> repeat
-> final trip summary
-> Done
-> clean second session
```

Hard rules:

- No duplicate shopping items.
- No hidden persisted active session state.
- A store with zero remaining items cannot stay active.
- Receipt state cannot clear before the trip summary is created.
- Skipping a receipt must not block the next store.
- Final summary shows stores visited, items bought, receipts logged, total spent, and store-by-store breakdown.

## Screen Requirements

### Pantry

- New users start empty with no demo groceries.
- Premium guided empty state.
- Manual add item.
- Mark items stocked, low, expiring, or purchased.
- Dashboard shows stocked, low, expiring, needs attention, and route preview.

### Stores

- New users start with no stores.
- Premium guided empty state.
- Manual add store.
- Optional visual logos.

### Shopping

- Clear current stop and next store.
- Current-store picked item progress.
- Receipt save/upload-later/skip.
- Final trip summary.
- A second session must start cleanly.

### Activity

- Show item added, marked low, picked up, receipt logged, and store added events.

### Receipts

- Store receipts by trip and store.
- Save amount, upload photo later, or skip.

### Settings

- Household information
- Preferences
- Logout placeholder/local reset
- Debug/build information

## Implementation Priorities

1. Convert isolated starter to Expo SDK 56 app.
2. Implement types and durable local store.
3. Implement and unit-test shopping state machine.
4. Implement all six interactive tabs.
5. Add manual item/store forms and premium empty states.
6. Exercise complete multi-store shopping flow in simulator.
7. Capture simulator screenshots.
8. Run all required verification.

## Required Verification

Run from `/Users/hewadadil/Documents/PantryPal/apps/stokit-v2`:

```bash
npm run test:unit
npx tsc --noEmit
graphify .
graphify codex install
graphify claude install
graphify update .
```

Also verify manually in the iOS simulator:

- Empty first launch
- Add two stores
- Add pantry items assigned across both stores
- Mark items low
- Start trip
- Complete Store 1
- Save or skip receipt
- Advance to Store 2
- Complete Store 2
- Save receipt
- View accurate final summary
- Finish trip
- Start a clean second session
- Confirm tab transitions and back/navigation behavior

## Product Design QA

- Compare the Pantry dashboard simulator screenshot against the supplied reference image.
- Save `design-qa.md` in the V2 project root.
- Fix P0/P1/P2 visual issues.
- Final report must say `final result: passed` or explain the blocker.

## Release Boundary

The result is a local V2 prototype only. Report whether it is suitable for preview testing, but do not publish anything.
