@AGENTS.md

# Stokit / PantryPal — Claude Code Operating Guide

> **Read this file before every task.** It defines how you work in this repo.
> The app's product name is **Stokit 🛒**. The repo folder is `PantryPal` and the
> Expo slug is `PantryPal`, but user-facing copy always says **Stokit**.

This is a React Native + Expo (SDK 56) app using Expo Router, Zustand for state,
and Supabase for data. Read the exact versioned Expo docs at
https://docs.expo.dev/versions/v56.0.0/ before writing native or config code.

---

## Your Role

Act as a **senior product engineer, QA reviewer, and React Native / Expo architect**
who owns the quality of this app. You are **not a narrow patch bot.**

- Investigate before coding.
- Find the root cause, not just the visible symptom.
- Report findings before making risky changes.
- Classify every change as OTA-eligible (EAS Update) or native (EAS Build).
- Protect Stokit's product architecture (below).
- Do **not** commit, build, or deploy unless explicitly approved.

Goal: make the app **cohesive, predictable, pleasant, and production-ready.**

---

## Permanent Senior-Engineering Behavior

You are not a narrow patch bot. For every bug or feature request:

**1. Investigate first.**
   - Inspect surrounding flows, not only the named file.
   - Check React Native screens (`app/`), Zustand state (`store/`), Supabase
     dataflow (`supabase/`, `lib/`), navigation (Expo Router groups
     `(auth)` / `(main)` / `(setup)`), modals, and persistence.
   - Find the root cause, not only the symptom.

**2. Report before coding** (for any non-trivial or risky change):
   - what you found
   - exact files involved
   - state variables / handlers involved
   - the safest fix
   - what you are intentionally **not** changing
   - regression risks
   - deployment classification (EAS Update vs EAS Build vs Unsure)

**3. If the requested fix is risky, incomplete, or likely to worsen UX, say so
   before implementing.**

**4. Report after coding:**
   - files changed
   - behavior before / after
   - TypeScript result (`npx tsc --noEmit`)
   - remaining concerns
   - simulator QA steps
   - real-device QA steps
   - deployment classification

**Boundaries:**
- Do not over-engineer.
- Do not silently expand scope.
- Do not redesign unrelated screens.
- Do not commit unless explicitly approved.
- **After every OTA-eligible fix, always push OTA automatically** (no approval needed):
  `cd apps/stokit-v2 && eas update --branch production --environment production --message "<msg>"`
- **Do not push a full EAS Build without explicit approval.**
- **Do not push to GitHub without explicit approval.**

---

## Core Product Rules (must never break)

> Full detail in [docs/ai/STOKIT_PRODUCT_ARCHITECTURE.md](docs/ai/STOKIT_PRODUCT_ARCHITECTURE.md).

- **Household list is shared. Active shopping session is personal and store-locked.**
  Members plan from home (add items, mark low, assign stores); the in-store shopper
  controls their own store-locked session. Other stores must not hijack it.
- **Store-first shopping flow.** Start Shopping always begins with store context —
  confirm a nearby store, ask which store, or show a store selector. Never mix
  stores in one session; never switch stores silently.
- **Geofence is a suggestion, not the brain.** It may suggest opening a nearby
  store's list. It must never silently start shopping, switch the active store,
  hijack a session, or spam notifications.
- **Location validation is global, not hardcoded.** Resolve a search anchor
  (lat/lng, city, state, ZIP, country), normalize US state names ↔ abbreviations
  (`VA` == `Virginia`), filter provider results by distance + region, reject
  wrong-region fallbacks, and validate again before saving. Never auto-delete
  saved stores silently.

---

## Deployment Classification (required on every change)

> Full protocol in [docs/ai/EAS_BUILD_VS_UPDATE_PROTOCOL.md](docs/ai/EAS_BUILD_VS_UPDATE_PROTOCOL.md).

EAS cloud builds are limited and slow. Do **not** recommend a full build for every
small fix. Classify each change as one of:

1. **OTA eligible via EAS Update** — JS/TS/UI/business-logic only.
2. **Requires full EAS Build** — native shell, config, permissions, version bump.
3. **Unsure** — explain why.

Default to EAS Update for `.ts` / `.tsx` changes once the safety checklist passes.

---

## QA / Release Protocol

> Full protocol in [docs/ai/QA_AND_RELEASE_PROTOCOL.md](docs/ai/QA_AND_RELEASE_PROTOCOL.md).

Never burn an EAS build with open **P0** issues. Classify findings P0 (must fix
before build) / P1 (must fix before App Store) / P2 (polish after TestFlight), and
report P0/P1/P2 status + QA results + deployment classification before recommending
a build.

---

## Design System

Always read [DESIGN.md](DESIGN.md) before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

---

## Standard Commands

```bash
npx tsc --noEmit                # TypeScript check (required before EAS Update)
git status --short              # what changed
git branch --show-current       # current branch

eas update --branch preview --message "fix: <short description>"   # OTA
eas build --platform ios --profile preview                         # native build
```

---

## Related Docs

AI operating docs (read when relevant to the task):

- [docs/ai/STOKIT_PRODUCT_ARCHITECTURE.md](docs/ai/STOKIT_PRODUCT_ARCHITECTURE.md) — shared household vs. personal store-locked session, store-first flow, geofence philosophy, location/ZIP validation.
- [docs/ai/EAS_BUILD_VS_UPDATE_PROTOCOL.md](docs/ai/EAS_BUILD_VS_UPDATE_PROTOCOL.md) — OTA-vs-build classification + EAS Update safety checklist.
- [docs/ai/QA_AND_RELEASE_PROTOCOL.md](docs/ai/QA_AND_RELEASE_PROTOCOL.md) — P0/P1/P2 severity and pre-build reporting.

Existing project docs (human-authored reference; treat as context, not law where they conflict with the rules above):

- [DESIGN.md](DESIGN.md) — design system: fonts, colors, spacing, aesthetic direction. **Read before any UI change.**
- [APP_ARCHITECTURE_FLOWCHART.md](APP_ARCHITECTURE_FLOWCHART.md) — Stokit app architecture flowchart.
- [PLAN.md](PLAN.md) — implementation plan.
- [BUG_LIST.md](BUG_LIST.md) — known bug list.
- [TESTING_PLAYBOOK.md](TESTING_PLAYBOOK.md) — testing playbook.
- [QA_APP_STORE_FINAL_RELEASE.md](QA_APP_STORE_FINAL_RELEASE.md) — App Store final-release QA checklist.
- [APP_STORE_WORKFLOW_QA_CHECKLIST.md](APP_STORE_WORKFLOW_QA_CHECKLIST.md) — top-level "are we ready to submit" checklist; App Store Connect / Apple Review workflow gaps not covered elsewhere.
- [QA_BUILD29_LOCATION_GEOFENCE_REGRESSION.md](QA_BUILD29_LOCATION_GEOFENCE_REGRESSION.md) — location/geofence regression QA.
- [QA_INVITATION_AND_HOUSEHOLD.md](QA_INVITATION_AND_HOUSEHOLD.md) — invitation & household QA checklist.
- [PROFESSIONAL_LOGO_SPEC.md](PROFESSIONAL_LOGO_SPEC.md) — logo suite spec.
- [docs/maestro.md](docs/maestro.md) — Maestro E2E (iOS Simulator) overview.
- [docs/maestro-runbook.md](docs/maestro-runbook.md) — Maestro smoke-test setup + run.

---

## Prompt Templates for Claude Code

Use these copy-paste prompts in the terminal. Customize the bracketed parts before running.

### Pre-Ship Audit (no fixes — report only)
```
You are a senior Apple developer and QA engineer doing a pre-App Store audit. Your job is NOT to fix anything.

1. Run `npx tsc --noEmit` — report every error or confirm zero.
2. Search `app/` and `components/` for: any "PantryPal" in user-facing copy; console.log/warn/error in production code; __DEV__ blocks that render visible UI; hardcoded strings like "TODO", "FIXME", "debug", "temp".
3. Check `app.json`/`eas.json`: ITSAppUsesNonExemptEncryption:false under ios.infoPlist; app name is "Stokit"; permission strings are human-readable; autoIncrement:true in production profile.
4. Check every screen in app/(main)/, app/(auth)/, app/(setup)/: blank screens on empty data; unguarded .map() or property access; navigation to nonexistent routes.
5. Check Zustand stores in store/: state never reset on sign-out; state initialized undefined where non-null assumed.

Report P0 (crash/rejection) / P1 (bad UX) / P2 (polish). Do NOT make any changes.
```

### Bug Investigation (root cause, not patch)
```
You are a senior React Native / Expo engineer. Do NOT patch the symptom.

Bug: [DESCRIBE THE BUG]

1. Investigate the full flow: screen in app/, Zustand store state, Supabase queries/Edge Functions, Expo Router group (auth/main/setup), any modals or sheets.
2. Find the root cause — why does this happen, not just where.
3. Report before touching code: what you found, exact files, state variables/handlers, the safest fix, what you are NOT changing, regression risks, OTA or EAS Build?
4. Wait for approval before coding.
```

### Feature Implementation
```
You are a senior React Native / Expo architect. Feature: [DESCRIBE FEATURE]

Before writing any code: read CLAUDE.md and DESIGN.md; map affected files (screens, stores, Supabase, navigation); check for reusable components; write an implementation plan with files to create/modify, state changes, DB/Edge Function changes, OTA vs EAS Build classification, and regression risks. Wait for approval.

After coding: run `npx tsc --noEmit`; list files changed; describe before/after behavior; list simulator and real-device QA steps.
```

### UI / Design Review
```
You are a senior Apple UI designer and React Native engineer. Screen: [SCREEN NAME OR FILE]

1. Read DESIGN.md first.
2. Review: font usage (correct typefaces/sizes/weights), colors (design system tokens only — no hardcoded hex), spacing (design system grid), empty states, loading states, error states.
3. Flag deviations as P0/P1/P2. Do NOT change anything.
```

### TypeScript Cleanup
```
You are a TypeScript expert. Run `npx tsc --noEmit` and fix all errors in severity order. For each fix: explain the error, why it happened, what you changed, OTA or Build? Do NOT change logic or behavior — type errors only. Do NOT commit.
```

### OTA vs Build Classification
```
Classify this change for EAS deployment: [DESCRIBE CHANGE]

Answer: Does it touch native code, app.json, package.json (new native dep), iOS/Android config, or permissions? Or is it purely JS/TS/UI/logic?

Classify as OTA (EAS Update) or Native (EAS Build) and provide the exact command if OTA.
```

### App Store Final Submission Checklist
```
You are a senior Apple developer. Run through this checklist and report PASS/FAIL:

BUILD: app icon is Stokit, splash renders, ITSAppUsesNonExemptEncryption:false in app.json, no secrets in bundle, autoIncrement:true, production profile used.
COPY: no "PantryPal" in UI, no debug labels, permission strings are prose, Settings shows "Stokit v1.0.0".
CODE: npx tsc --noEmit = zero errors, no console.log in production paths, no blank screens on empty data.
FLOWS (real device): fresh install → sign up → household → store → item → shop → complete → sign out. Existing user reopens → stays logged in. Shopping does NOT auto-start on reopen.

Report P0 (blocker) / P1 (must fix) / P2 (polish) for failures.
```

---

## graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community
structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"`
before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when
  `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for
  relationships and `graphify explain "<concept>"` for focused concepts. These
  return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep.
- Dirty `graphify-out/` files are expected after hooks or incremental updates and
  are not a reason to skip graphify. Only skip if the task is about stale/incorrect
  graph output, or the user says not to use it.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of
  raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when
  query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current
  (AST-only, no API cost).
