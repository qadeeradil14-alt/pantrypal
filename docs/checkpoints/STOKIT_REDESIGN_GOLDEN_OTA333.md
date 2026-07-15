# Stokit Redesign Golden Checkpoint — OTA 333

Created: 2026-07-14T20:36:23-04:00

| Field | Value |
| --- | --- |
| Commit | `d1934a43a86f96eb3663ec44311bdb336a5e0139` |
| Golden branch | `golden/stokit-redesign-ota333` |
| Annotated tag | `stokit-redesign-golden-ota333` |
| OTA | 333 |
| OTA group | `b82154de-06a1-4488-9a8e-4e0d0313cdd4` |
| iOS update ID | `019f6318-fd27-7150-a8d9-9e4bd9524d9d` |
| Channel | `shopping-redesign-test` |
| Runtime | `1.0.0` |
| App | Stokit Redesign (`com.hewadadil.stokit.redesign`) |
| Production baseline | OTA 309 — untouched |

## Certified flows

- Fresh iPad reinstall preserves the existing household data.
- Household create/join, member removal, and rejoin work.
- Pantry, stores, and shared household data converge across iPhone and iPad.
- Shopping start, finish, and reset work.
- Notify Family works in both directions without a premature retest notification.
- Store search, coordinates, force-close/reopen, and final crash checks pass.

## Known non-blocking test issue

The full unit suite has one pre-existing static auth-route assertion failure: `restored verified user routes to Tabs, never Welcome`. It expects a legacy `Stack.Protected` pattern and is unrelated to this certified redesign checkpoint. Typecheck and the relevant recovery, store, shopping, sync, and notification tests passed during certification.

## Data recovery references

No database export or secrets are stored in this repository or source archive. The external Supabase recovery export/audit from the OTA 326–327 recovery remains the data-recovery reference; verify its retained location and row counts before any database restoration. Do not treat this source checkpoint as a database backup.

## Source archive

- Local archive: `/tmp/pantrypal-emergency-restore-ota321/artifacts/stokit-redesign-golden-ota333-source.tar.gz`
- SHA-256: `40458c9c9d28d0fbf509dc573a6353d2acbccc734ad403eadb0095f2e3707aa5`
- Local checksum file: `/tmp/pantrypal-emergency-restore-ota321/artifacts/stokit-redesign-golden-ota333-source.sha256`

The archive is intentionally local and untracked. It contains only tracked files from the golden commit and excludes `.env*`, dependencies, build output, credentials, local backups, and untracked artifacts.

## Restore procedure

1. Fetch the immutable checkpoint: `git fetch origin golden/stokit-redesign-ota333 --tags`.
2. Create a recovery branch: `git switch -c recovery/stokit-redesign-ota333 stokit-redesign-golden-ota333`.
3. Enter the app: `cd apps/stokit-v2`.
4. Verify the redesign identity: `APP_VARIANT=redesign npx expo config --type public --json`.
5. Confirm name `Stokit Redesign`, bundle ID `com.hewadadil.stokit.redesign`, channel `shopping-redesign-test`, and runtime `1.0.0`.
6. Run `npm run typecheck` and the relevant certification tests.
7. Publish a new append-only test OTA only: `npm run ota:redesign -- "OTA <new-number>: recovery from golden OTA 333"`.
8. Never reuse OTA number 333. Never alter production OTA 309.
9. Validate fresh reinstall protection, household sync, shopping lifecycle, notifications, and store search on both iPhone and iPad before resuming feature work.
