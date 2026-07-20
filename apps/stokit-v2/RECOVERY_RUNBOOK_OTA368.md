# Stokit Recovery Runbook — Golden Baseline OTA 368 / Build 112

Paste this whole document to Claude Code if something breaks and you need to restore
Stokit to the last known-good state (confirmed on real device 2026-07-20).

## Reference values (do not lose these)

- Golden git tag: `stokit-golden-ota368`
- Golden git branch: `golden/stokit-main-ota368`
- Golden commit: `9bd7093803e3ff068d33171b5c3d87d76336d92b`
- OTA sequence: 368
- OTA update group: `061831f0-5f57-462f-a5e2-8e281f7537f7`
- iOS OTA update ID: `019f802a-dccb-7620-a6b5-12d50e86a0f8`
- Android OTA update ID: `019f802a-dccb-7766-bf12-30fb5a201628`
- Native build number: 112
- EAS build ID: `5cdb9508-aa6d-472d-90f2-abcc44d0505e`
- Supabase project ref: `yndhbbnstqqsrqjelejg`
- EAS project: `qadeeradil14-alt/PantryPal`
- Repo: `apps/stokit-v2` inside this monorepo

## Step 1 — Restore the code

```sh
cd /Users/hewadadil/Documents/PantryPal
git fetch --all --tags
git checkout golden/stokit-main-ota368
# or, to bring main back to this exact state:
# git checkout main && git reset --hard stokit-golden-ota368
```

Verify you're on the right commit:
```sh
git rev-parse HEAD   # must print 9bd7093803e3ff068d33171b5c3d87d76336d92b
```

## Step 2 — Republish the OTA (JS/TS layer)

OTA numbers are append-only — never reuse 368, always go +1 from whatever the
current `OTA_SEQ` is at restore time. Check `apps/stokit-v2/constants/version.ts`
first, bump it, then:

```sh
cd apps/stokit-v2
npx tsc --noEmit   # must be 0 errors before publishing
npm run test:unit  # must be 380/380
eas update --channel production --environment production \
  --message "Restore to golden OTA 368 baseline"
```

## Step 3 — Rebuild + resubmit native (only if the native binary is also broken)

Only needed if the issue is native-level (icons, permissions, native modules) —
skip this if OTA republish alone fixes it, since it avoids an App Review wait.

```sh
cd apps/stokit-v2
eas build --platform ios --profile production --non-interactive
# note the returned build ID, then:
eas submit --platform ios --profile production --id <BUILD_ID> --non-interactive
```

## Step 4 — Reapply Supabase Auth email config (NOT in git — manual only)

This is the one piece that git cannot restore. If it's been reverted/lost, redo by hand:

1. Go to `https://supabase.com/dashboard/project/yndhbbnstqqsrqjelejg/auth/smtp`
2. Confirm/set:
   - Sender email address: `stokit@myroletrack.com`
   - Sender name: `Stokit`
   - Host: `smtp-relay.brevo.com`
   - Port: `587`
   - Username: `aea787001@smtp-brevo.com`
   - Password: (your Brevo SMTP key — not stored anywhere in this repo, keep it in your password manager)
3. Go to `https://supabase.com/dashboard/project/yndhbbnstqqsrqjelejg/auth/templates/confirm-sign-up`
4. Confirm the body ends with this disclaimer line (add back if missing):
   ```html
   <p style="color:#888;font-size:12px;">This email is sent via myroletrack.com, a sister service used by Stokit to deliver account emails.</p>
   ```

## Step 5 — Verify the restore actually worked

- [ ] `About` screen in Settings shows the restored OTA number and "Standalone" build
- [ ] App icon (home screen, light + dark) shows the bag+S mark, not the old document icon
- [ ] Settings → About → Privacy Policy opens the live hosted page
- [ ] Sign out → sign up fresh → confirmation email arrives from `stokit@myroletrack.com` with the disclaimer line
- [ ] Tapping the confirmation link **on the phone** (not desktop) shows the verified/green state in-app
- [ ] Pantry: an ethnic/cultural item (e.g. "qurot") shows a category icon, not a generic box
- [ ] `npx tsc --noEmit` — 0 errors; `npm run test:unit` — 380/380

## Notes for whoever (including future-Claude) runs this

- Do not delete `stokit-golden-ota359` or any other golden tag/branch — they're kept as
  earlier fallback points, append-only.
- Do not skip or reuse an OTA number, even during a restore.
- If restoring after a native regression, native (EAS Build + App Review) is slower
  than OTA — always check whether an OTA-only fix resolves it first.
