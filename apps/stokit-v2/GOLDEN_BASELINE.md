# Stokit Golden Baseline

## Current Golden

- OTA: 346
- Branch: production
- Runtime: 1.0.0
- Update group: 22b36123-06d1-448c-b1ca-36d7d4409f1d
- iOS update ID: 019f7a59-014e-7fa0-be00-bfe638bd5eff
- Android update ID: 019f7a59-014e-7b39-866b-667d295e10a4
- Message: OTA 346: simplify receipt scanned total copy
- Source worktree: /Users/hewadadil/Documents/PantryPal-release-ota346-20260719
- Base commit: 19764ba8f7a67fc9f82071d6efdcad50f9e91f10

## Why This Is Golden

- Includes OTA 345 shopping sync/offline retry fixes.
- Simplifies receipt scanned flow to show the full receipt total on the action button.
- Removes the confusing "likely tax" explanation.
- Keeps the simple Add / Skip receipt path.

## Verification

- Typecheck passed from clean OTA 346 release worktree.
- Receipt UX targeted test passed from clean OTA 346 release worktree.
- Production update confirmed on EAS production branch.

## Backup Golden

- Keep OTA 345 as the previous backup baseline.
- Do not delete older OTA history.
- If OTA 346 has a hidden issue, roll forward by publishing the previous known-good code as a newer OTA.
