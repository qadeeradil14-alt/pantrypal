# Stokit Golden Baseline

- Repository: `/Users/hewadadil/Documents/PantryPal-golden-restore/apps/stokit-v2`
- Branch: `restore/golden-baseline-385-plus-quantity-diag`
- Verified application commit: `720c81e4ab22e2aec49ec6377f0ed4dbc63ff9ab`
- Annotated tag: `stokit-golden-2026-07-26`
- Native production binary: Build 119 (unchanged)
- Production channel: `production`
- Runtime version: `stokit-v2-1.0.0`
- Latest verified production OTA: 405
  - Update group: `cb8866c9-4985-4c24-a701-2ee776371a6f`
  - iOS update: `019f9e8f-31a4-796a-9528-74d2d1d3db46`
  - Android update: `019f9e8f-31a4-71dd-92d0-b606edd2d568`
- Verification date: 2026-07-26
- Devices verified: iPhone and iPad

## Verification

- Relevant shopping/sync tests: 47/47 passed
- Full unit suite: 519/519 passed
- TypeScript typecheck: passed

## Included fixes

- Bulk store assignment
- Completed-trip resurrection protection
- Compare-and-set snapshot writes
- Durable item/session merge
- Completed-trip session suppression
- Final shopping summary remains visible until Done
- Explicit reopen of the last store survives completed-trip reconciliation

## Recovery

1. Clone this repository and check out `stokit-golden-2026-07-26`.
2. Run `npm ci` if dependencies are absent or stale.
3. Run `npm run typecheck` and `npm run test:unit` before making changes.
4. Treat OTA 405 as the matching JavaScript release for the unchanged native Build 119.

Future work must branch from this baseline. Do not overwrite the tag or use it as a scratch branch.
