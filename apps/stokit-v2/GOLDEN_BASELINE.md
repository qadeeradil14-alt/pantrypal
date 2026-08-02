# Stokit Golden Baseline

## Current Golden

- **Production OTA: 453**
- **Golden tag: `stokit-golden-ota-453`** (annotated)
- **Golden commit: `cea269e3adc0882ea1940ecf7c378152234d2bf0`**
- **Canonical workspace: `/Users/hewadadil/Documents/PantryPal/apps/stokit-v2`**
- Native production binary: Build 119 (unchanged)
- Production channel: `production`
- Runtime version: `stokit-v2-1.0.0`
- Marketing version: `1.0.0`
- Bundle identifier: `com.hewadadil.pantrypal`
- `constants/version.ts` → `OTA_SEQ = 453`
- Devices verified: iPhone and iPad

The EAS update group and per-platform update IDs for OTA 453 live in EAS, not
in this file. Read them with:

```
npx eas-cli update:list --branch production --limit 1 --json
```

Do not transcribe them here by hand. EAS is the source of truth for what
production is actually serving, and a stale copy in this file is worse than no
copy — `scripts/preflight-ota.sh` queries EAS directly for exactly this reason.

## Verification at this baseline

- Full unit suite: **798/798 passed**
- TypeScript typecheck (`npx tsc --noEmit`): **0 errors**
- `git diff --check`: clean
- Product runtime source (`.ts`/`.tsx` outside `tests/`) is byte-identical to
  the golden commit.

## Workspace note

Earlier revisions of this document pointed recovery at
`/Users/hewadadil/Documents/PantryPal-golden-restore`, branch
`restore/golden-baseline-385-plus-quantity-diag`, commit `720c81e4`, tag
`stokit-golden-2026-07-26` (OTA 405). All of that is superseded. The canonical
workspace is the path above and the current golden tag is
`stokit-golden-ota-453`. Other worktrees under `~/Documents/PantryPal-*` are
historical and must not be used for release work.

## Recovery

1. Work in the canonical workspace above. Confirm the baseline with
   `git describe --tags` — it must report `stokit-golden-ota-453`.
2. To recover a known-good state: `git checkout stokit-golden-ota-453`.
3. Run `npm ci` if dependencies are absent or stale.
4. Run `npx tsc --noEmit` and `npm run test:unit` before making changes.
5. Treat OTA 453 as the matching JavaScript release for the unchanged native
   Build 119.
6. Before any OTA publish, run `bash scripts/preflight-ota.sh`. It aborts on a
   dirty working tree, a runtime or channel mismatch, or a checkout that does
   not already contain what production is serving.

## Operational policy

These rules are load-bearing. They exist because OTA 380 was once published
from a stale checkout that had never seen OTAs 385–400, silently rolling
production backward.

- **Keep previous golden tags.** Never delete, move, or reuse a
  `stokit-golden-*` tag, and never use one as a scratch branch. Current tags:
  `stokit-golden-2026-07-26`, `stokit-golden-395-candidate`,
  `stokit-golden-ota359`, `stokit-golden-ota368`, `stokit-golden-ota373`,
  `stokit-golden-ota381`, `stokit-golden-ota385`, `stokit-golden-ota-448`,
  `stokit-golden-ota-453`.
- **Do not delete OTA history.** Older updates stay published so a device that
  has not yet updated can still resolve its current bundle.
- **Recover by rolling forward.** If a golden release turns out to have a
  hidden issue, publish the known-good code as a **newer** OTA number.
- **Never move production backward to an older OTA number.** The OTA sequence
  is monotonic: the next publish is always exactly the latest production OTA
  + 1. Check that latest against EAS, never against local git log.
- Future work must branch from the current golden baseline.

## Included fixes (carried forward)

- Bulk store assignment
- Completed-trip resurrection protection
- Compare-and-set snapshot writes
- Durable item/session merge
- Completed-trip session suppression
- Final shopping summary remains visible until Done
- Explicit reopen of the last store survives completed-trip reconciliation
- Member trip-cancel snapshot RLS
- Trip-close store-assignment release
- Skip-store confirmation copy (OTA 453)
