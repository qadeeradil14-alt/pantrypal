# STOKIT STABLE BASELINE — OTA 279
**Date:** 2026-07-02  
**Tag:** `stokit-stable-2026-ota279`  
**Commit:** `c2e4d5f` (`feature/shopping-unified-workflow`)  
**Unit tests:** 250 / 250 passing  

---

## Baseline Summary

This document marks the **first formal stable restoration point** for Stokit since the OTA delivery series began. All core product systems are feature-complete, tested, and security-hardened. This tag represents the recommended starting point for all future feature work, hotfix branches, and recovery scenarios.

---

## Included OTAs

| OTA | Description | Branch | Status |
|-----|-------------|--------|--------|
| OTA 273 | UI/UX Design Audit Phase 1 — Empty states, hitSlop, LayoutAnimations, typography, sticky headers | `codex/ota-267-app-side-fixes` | ✅ Deployed |
| OTA 274 | UI/UX Design Audit Phase 2 — Stores, Receipts, Settings refinements | `codex/ota-267-app-side-fixes` | ✅ Deployed |
| OTA 275 | UI/UX Design Audit Phase 3 — Haptics system, Pantry motion, Pro keyboard flows | `codex/ota-267-app-side-fixes` | ✅ Deployed |
| OTA 276 | Store duplicate prevention — deduplication guard in AddStoreSheet and durable-store | `codex/ota-276-store-selection-duplicates` | ✅ Deployed |
| OTA 277 | First-tap store selection fix — Keyboard.dismiss + onPressIn for instant suggestion selection | `codex/ota-277-addstore-first-tap` | ✅ Deployed |
| OTA 278 | Google API security hardening — removed hardcoded key fallback from config.ts | `codex/ota-278-google-key-cleanup` | ✅ Deployed |
| OTA 279 | WO-002 Offline Sync Safety hardening — restart-safe stale snapshot protection | `wo-002-offline-sync-safety` | ✅ Deployed |

---

## Security

### Google API Key
- **OTA 278** removed the hardcoded key that was previously used as a fallback in `apps/stokit-v2/lib/config.ts`.
- The API key is now sourced exclusively from `EXPO_PUBLIC_GOOGLE_API_KEY` (EAS environment variable).
- If the environment variable is absent, the key defaults to `''`, which intentionally disables the Google Places API rather than leaking credentials.

---

## Sync Hardening (WO-002)

### Root cause fixed
The in-memory sync watermark resets to `0` on every app launch. Before WO-002, `pullFromSupabase` compared incoming remote snapshots only against the in-memory watermark. After an offline session (local edits saved to AsyncStorage, push to Supabase failed), the next online pull saw any cloud snapshot as "newer than watermark 0", applied it wholesale, and silently destroyed the offline edits.

### Fix applied
`shouldApplyRemoteSnapshot(remoteUpdatedAt, localUpdatedAt)` — a composite gate in `syncWatermark.ts` — additionally requires `remote.updatedAt > local.updatedAt`. Because `local.updatedAt` is persisted inside the durable snapshot (AsyncStorage), this protection survives app restarts without any new storage dependencies.

| Protection | Mechanism |
|---|---|
| Self-echo detection | `markPushed` / `isSelfEcho` — device skips its own Supabase reflection |
| Stale-in-session skip | In-memory watermark (`lastAppliedRemoteAt`) |
| Restart-safe offline protection | `local.updatedAt` comparison (persisted in AsyncStorage) |
| Stale cloud reconciliation | Engine pushes newer local state up when it detects a stale remote |

---

## UI/UX Polish (Phases 1–3)

### Phase 1
- Empty states with CTAs added to Pantry and Shopping tabs
- `hitSlop` applied to Settings gear and quantity steppers (Apple 44pt standard)
- `LayoutAnimation` on shopping item check-off and pantry row mutations
- Typography contrast refinement using `colors.muted` token

### Phase 2
- `LayoutAnimation` on store deletion
- Receipts dashboard `totalCard` styled as a premium raised widget
- Store action buttons separated with increased gap; "Navigate" pill background added

### Phase 3
- **Haptics system**: Light impact on swipe-delete/restock; Success notification on item/store add, household join, and rename save
- **Pantry motion**: `LayoutAnimation` integrated into animated delete, status change, and catalog add
- **Pro keyboard flows**: `TextField` refactored with `forwardRef`, `returnKeyType`, `onSubmitEditing`; Next/Done chain in Join Household and Add Store sheets

---

## Test Status

```
# tests 250
# pass  250
# fail  0
# duration_ms ~400ms
```

---

## Recovery Instructions

To restore Stokit to this exact state:

```bash
git clone https://github.com/qadeeradil14-alt/pantrypal.git
cd pantrypal
git checkout stokit-stable-2026-ota279
```

---

## Known Remaining Engineering Work

| Item | Priority |
|------|----------|
| Merge OTA branches (276–279) into `main` before next App Store submission | Medium |
| Auth zombie recovery investigation (stale session edge case) | Medium |
| Backend schema drift review (`durable-store.ts` vs Supabase columns) | Low |
| EAS worktree `node_modules` symlink — consider automating via Makefile | Low |

---

*Generated as part of the OTA 279 stable baseline packaging process — 2026-07-02.*
