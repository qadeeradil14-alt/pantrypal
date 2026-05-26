# Maestro E2E (iOS Simulator)

Automated smoke test for the core pantry → grocery loop. Matches the manual checklist in `PLAN.md` (two-device and push steps are still manual).

## Prerequisites

1. **Java 17+** (Maestro CLI requirement)
   ```bash
   brew install openjdk@17
   export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
   ```

2. **Maestro CLI**
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

3. **Dev build on a booted iOS Simulator**
   ```bash
   npm run ios
   ```
   Bundle id: `com.pantrypal.app`

   If `pod install` fails with encoding errors, run:
   ```bash
   export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
   cd ios && pod install && cd ..
   ```

   This repo sets `EXPO_USE_PRECOMPILED_MODULES=false` in `ios/Podfile.properties.json` so the ExpoModulesJSI pod builds reliably. `npm run ios` sets `COPYFILE_DISABLE=1` to avoid macOS extended-attribute code-sign failures on frameworks.

4. **Metro** (dev client loads JS from the dev server)
   ```bash
   npm start
   ```
   Leave this running in a second terminal while Maestro runs.

5. **Supabase test account** with email/password sign-in enabled (no email confirmation gate, or confirm once manually). Prefer an account that already belongs to a household with default items so Milk is **stocked** at test start.

## Configure credentials

```bash
cp .maestro/.env.example .maestro/.env
# Edit MAESTRO_EMAIL and MAESTRO_PASSWORD
```

## Run

```bash
npm run test:e2e
# or a specific flow:
./scripts/maestro-test.sh .maestro/flows/smoke-core.yaml
```

## What `smoke-core` does

1. Launches app with cleared state
2. Signs in (welcome → sign-in)
3. If needed, creates household "Maestro Home" and continues to pantry
4. Taps **Milk** on Pantry (marks low)
5. Opens Shopping, taps **Milk** (got it)

## testIDs

Defined in `lib/testIds.ts` and wired in auth, setup, pantry, grocery, and tab bar.

## Troubleshooting

| Issue | Fix |
|--------|-----|
| `Unable to locate a Java Runtime` | Set `JAVA_HOME` (see above) |
| Stuck on sign-in | Check Supabase credentials; disable email confirm for test user |
| Milk not on grocery after tap | Milk may already be low; reset pantry or use fresh household |
| `setup-create-household` runs every time | Use account with existing household |
| Flow can't find app | Install dev build: `npm run ios` |

## CI note

Maestro on CI needs macOS runner, simulator boot, `npm run ios` (or prebuilt artifact), Java, and secrets for `MAESTRO_EMAIL` / `MAESTRO_PASSWORD`. Not wired in this repo yet.
