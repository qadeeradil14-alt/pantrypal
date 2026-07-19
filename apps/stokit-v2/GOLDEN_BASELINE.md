# Stokit Golden Baseline

## Current Golden

- OTA: 359
- App: Stokit (`com.hewadadil.pantrypal`)
- Branch: production
- Runtime: 1.0.0
- Update group: 480a72c9-f497-453a-8967-7769613960fe
- iOS update ID: 019f7c5a-34af-70ac-ac8b-242f666aa5ec
- Android update ID: 019f7c5a-34af-7718-9000-c7557cd7b32a
- Message: OTA 359: mirror approved onboarding artwork in dark mode
- Source commit: ab3be78265a00e570f770711f81e1db99cf937c7
- Golden tag: stokit-golden-ota359
- Golden branch: golden/stokit-main-ota359

## Why This Is Golden

- Includes all production fixes through OTA 359.
- Uses the approved onboarding composition in both light and dark mode.
- Dark artwork backgrounds blend cleanly into the onboarding screen.
- Preserves the production Stokit app, shopping, receipt, sync, geofencing, and family notification behavior.

## Verification

- Typecheck passed from a clean OTA 359 release worktree.
- Unit tests passed: 378/378.
- iOS export passed.
- All three dark onboarding screens passed simulator visual QA.
- Production update confirmed on the EAS production branch.

## Recovery

- Restore from Git tag `stokit-golden-ota359` or branch `golden/stokit-main-ota359`.
- Publish the restored code as a new production OTA; EAS OTA numbers are append-only.
- Do not delete older EAS update history.
