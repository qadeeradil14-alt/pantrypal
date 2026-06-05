# QA / Release Protocol

> Referenced by [CLAUDE.md](../../CLAUDE.md). **Do not burn an EAS build with open
> P0 issues.**

Classify every QA finding by severity.

## P0 — Must fix before build

Examples:
- crash
- TypeScript error
- Start Shopping opens the wrong store
- ZIP search returns wrong-state stores
- save allows a wrong-state store
- active session can be hijacked
- critical modal dead end
- budget / layout issue that breaks visible UI

## P1 — Must fix before App Store

Examples:
- confusing copy
- inconsistent naming (e.g. anything not saying **Stokit**)
- wrong fallback logos
- minor receipt / activity polish
- unclear empty state

## P2 — Polish after TestFlight

Examples:
- animations
- spacing refinements
- optional settings
- quantity persistence to DB
- improved receipt OCR cleanup

---

## Before recommending a build, report

- **P0** — open / fixed
- **P1** — open / fixed
- **P2** — deferred
- simulator QA result
- real-device QA required
- deployment classification (see
  [EAS_BUILD_VS_UPDATE_PROTOCOL.md](EAS_BUILD_VS_UPDATE_PROTOCOL.md))

---

## Standard commands

```bash
npx tsc --noEmit                # required before any EAS Update
git status --short
git branch --show-current
```
