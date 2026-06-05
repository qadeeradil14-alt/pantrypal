# EAS Build vs EAS Update Protocol

> Referenced by [CLAUDE.md](../../CLAUDE.md). Expo/EAS cloud builds are limited and
> time-consuming. **Do not recommend a full build for every small fix.**

Before every implementation, classify the deployment as exactly one of:

1. **OTA eligible via EAS Update**
2. **Requires full EAS Build**
3. **Unsure — explain why**

State the classification in your pre-change report and again in your post-change
report.

---

## Use EAS Update for JS / TS / UI / business-logic changes

Examples:
- UI copy
- layout fixes
- modal behavior
- shopping flow logic
- Zustand logic (`store/`)
- Supabase query / mutation logic
- store search validation (if JS-only)
- barcode category logic
- Expiring Soon threshold
- store-name normalization
- receipts / activity display fixes
- most `.ts` / `.tsx` changes

Recommended command:

```bash
eas update --branch preview --message "fix: <short description>"
```

---

## Use EAS Build for native shell changes

Examples:
- native permissions
- iOS entitlements
- background location config
- notification native config
- app icon / splash
- `app.json` / `app.config` native fields
- `Info.plist` / native project settings
- adding / removing native modules
- packages requiring native linking / pod install
- Expo SDK / native dependency changes
- build number / version for TestFlight / App Store
- anything OTA cannot safely cover

Recommended command:

```bash
eas build --platform ios --profile preview
```

> Repo note: `eas.json` defines `development`, `preview`, and `production` profiles.
> `appVersionSource` is `remote` and `production` uses `autoIncrement`, so the build
> number is managed remotely — a version/build bump is a **build**, not an update.

---

## EAS Update Safety Checklist

Before recommending EAS Update, confirm **all** of the following:

1. No native packages added / removed.
2. No Expo plugin / config changed.
3. No `app.json` / `app.config` native fields changed.
4. No iOS permission / entitlement changed.
5. No background location / notification native config changed.
6. No build number / version requirement.
7. TypeScript passes:
   ```bash
   npx tsc --noEmit
   ```

If all are true, **prefer EAS Update.** If any is false, it requires an EAS Build.
