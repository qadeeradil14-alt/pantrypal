# Stokit Golden Baseline

## Current Golden

- OTA: 368
- Build: 112 (iOS, TestFlight)
- App: Stokit (`com.hewadadil.pantrypal`)
- Branch: production
- Runtime: 1.0.0
- Update group: 061831f0-5f57-462f-a5e2-8e281f7537f7
- iOS update ID: 019f802a-dccb-7620-a6b5-12d50e86a0f8
- Android update ID: 019f802a-dccb-7766-bf12-30fb5a201628
- Message: OTA 368: strip prod console logs, add privacy policy link
- Build commit (icon fix, native): 9bd7093803e3ff068d33171b5c3d87d76336d92b
- OTA commit (JS, same lineage): b2e685b4c0c826816eaadec27f2f98bce00e9fd8
- Golden tag: stokit-golden-ota368
- Golden branch: golden/stokit-main-ota368

## Why This Is Golden

- Includes all production fixes through OTA 368 plus native build 112.
- App icon (light/dark, iOS 18 adaptive) now matches the in-app "bag + S" brand mark, solid visible gray outline confirmed against approved reference art.
- Auth email confirmation verified end-to-end on real iPhone (green confirmed state).
- Confirmation email sender corrected to `stokit@myroletrack.com` with sister-service disclaimer (was `noreply@myroletrack.com`, unbranded).
- Pantry item icon fallbacks cover ethnic/cultural items and category-appropriate placeholders (no more generic-box/mismatched icons — kimchi, qurot, samosa, etc.).
- No console.log/warn left in production code paths; Privacy Policy linked and hosted live.
- Preserves all prior production behavior: shopping, receipts, sync, geofencing, family notifications.

## Verification

- Typecheck passed (`npx tsc --noEmit`, 0 errors).
- Unit tests passed: 380/380.
- iOS build 112 completed and submitted to TestFlight successfully.
- Full manual smoke test on iOS Simulator: all 5 tabs, settings, light/dark mode, sign out/sign up/email verification — all pass.
- Confirmed on real device (iPhone): app icon correct, confirmation email correct sender + disclaimer, email verification link confirms in-app.

## Recovery

- Restore from Git tag `stokit-golden-ota368` or branch `golden/stokit-main-ota368`.
- Publish the restored code as a new production OTA; EAS OTA numbers are append-only.
- Do not delete older EAS update history or older golden tags/branches (`stokit-golden-ota359` still present).
- Note: the Supabase Auth SMTP sender/email-template fix (MyRoleTrack → stokit@myroletrack.com, disclaimer copy) lives in Supabase Dashboard config, not in this repo — restoring code alone will not revert or reapply that change.
