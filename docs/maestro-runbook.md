# Maestro smoke test — one-time setup + run (for Codex / humans)

**Goal:** Green run of `.maestro/flows/smoke-core.yaml` on iOS Simulator.

**App:** PantryPal (`com.pantrypal.app`), Expo dev client, repo root `/Users/hewadadil/Documents/PantryPal`.

**What passes:** Sign in → (create household if needed) → Pantry: tap Milk (mark low) → Shopping: tap Milk (got it).

---

## A. One-time machine setup (macOS)

Run once per machine:

```bash
# 1) Java 17 (Maestro requires it)
brew install openjdk@17
echo 'export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home' >> ~/.zshrc
source ~/.zshrc

# 2) Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash
maestro --version

# 3) Node deps (from repo root)
cd /Users/hewadadil/Documents/PantryPal
npm install
```

---

## B. One-time Supabase test user

1. In Supabase dashboard (same project as app `.env`): create a **dedicated** user, e.g. `maestro+pantry@yourdomain.com`.
2. **Disable email confirmation** for this user (or confirm email once manually in inbox).
3. Password: store in password manager; use only for E2E.
4. **Ideal:** User already in a household with default items and **Milk stocked** (not already “low”).  
   - If Milk is already low, the pantry step may no-op and grocery may flake.
   - Fresh household is OK: flow creates `Maestro Home` on first run.

---

## C. One-time repo credentials file

```bash
cd /Users/hewadadil/Documents/PantryPal
cp .maestro/.env.example .maestro/.env
```

Edit `.maestro/.env` (gitignored):

```env
MAESTRO_EMAIL=your-maestro-test@email.com
MAESTRO_PASSWORD=your-password
MAESTRO_HOUSEHOLD_NAME=Maestro Home
```

Verify script reads it:

```bash
bash -lc 'source .maestro/.env && test -n "$MAESTRO_EMAIL" && test -n "$MAESTRO_PASSWORD" && echo OK'
```

---

## D. Every test run — three terminals (order matters)

### Terminal 1 — Metro (leave running)

```bash
cd /Users/hewadadil/Documents/PantryPal
npm start
```

Wait until Metro shows the dev server ready (QR / “Metro waiting on…”).

### Terminal 2 — Install / refresh iOS dev build (once per native change)

```bash
cd /Users/hewadadil/Documents/PantryPal
npm run ios
```

- Boots simulator and installs `com.pantrypal.app`.
- `npm run ios` already sets `LANG`, `LC_ALL`, and `COPYFILE_DISABLE` for CocoaPods.
- If it fails on pods only: `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && cd ios && pod install && cd ..` then retry.

Leave the app **installed** on the booted simulator. You can close the app; Maestro will launch it.

### Terminal 3 — Maestro smoke

```bash
cd /Users/hewadadil/Documents/PantryPal
npm run test:e2e:smoke
```

Equivalent:

```bash
bash -lc './scripts/maestro-test.sh .maestro/flows/smoke-core.yaml'
```

**Success:** Maestro exits `0` and prints flow completed (no red failures).

---

## E. Success checklist

| Step | Check |
|------|--------|
| Java | `java -version` works with `JAVA_HOME` set |
| Maestro | `maestro --version` prints 1.x / 2.x |
| `.maestro/.env` | `MAESTRO_EMAIL` and `MAESTRO_PASSWORD` set |
| Metro | Terminal 1 running `npm start` |
| Simulator | App installed (`npm run ios` succeeded) |
| Simulator booted | One iOS simulator is open (Maestro uses booted device) |
| Run | `npm run test:e2e:smoke` exit code 0 |

---

## F. If something fails — Codex fix order

1. **Script says missing email/password** → create/fix `.maestro/.env` (section C).
2. **Java / Maestro won’t start** → section A, set `JAVA_HOME`, re-run.
3. **`pod install` / Unicode error** → `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` then `npm run ios`.
4. **App not found / won’t launch** → Terminal 2: `npm run ios` again; confirm bundle id `com.pantrypal.app`.
5. **Stuck on sign-in** → wrong Supabase creds or email not confirmed; fix user in dashboard.
6. **Can’t find Milk / grocery** → reset test household or use account where Milk is stocked; or delete app data and re-run (flow uses `clearState: true`).
7. **Hangs 4+ minutes then killed (exit 143)** → usually Metro not running, app not installed, or bad credentials; fix 3–5 first.
8. **TypeScript only** — `app/(setup)/check.tsx` has a pre-existing `data.role` union warning; unrelated to Maestro.

---

## G. Codex prompt (paste below)

```
Repo: /Users/hewadadil/Documents/PantryPal

Task: Get a green Maestro run for smoke-core E2E on iOS Simulator.

Follow docs/maestro-runbook.md exactly:
1. Ensure one-time setup A–C is done (Java 17, Maestro CLI, .maestro/.env with real Supabase test user).
2. Start Metro (npm start) in background if not running.
3. Run npm run ios if app not on booted simulator.
4. Run npm run test:e2e:smoke from repo root via bash -lc when using PowerShell.
5. If flow fails, fix selectors/timeouts in .maestro/subflows/ or testIDs in lib/testIds.ts — minimal diff only.
6. Do NOT commit unless I ask. Do NOT touch Apple/TestFlight.

Report: exit code, last 30 lines of Maestro output, and any code change made.
```

---

## File map (for debugging)

| Path | Purpose |
|------|---------|
| `.maestro/flows/smoke-core.yaml` | Main flow |
| `.maestro/subflows/*.yaml` | sign-in, create-household, pantry, grocery |
| `scripts/maestro-test.sh` | Loads `.maestro/.env`, sets Java, runs maestro |
| `lib/testIds.ts` | `pantry-item-milk`, `grocery-item-milk`, etc. |
| `docs/maestro.md` | Longer reference |
