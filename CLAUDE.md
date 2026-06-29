# Stokit — Project Rules

## Stack
- React Native + Expo SDK 56, Expo Router
- State: Zustand
- Backend: Supabase (auth, DB, Edge Functions, Realtime)
- Repo folder is named `PantryPal` — product name is **Stokit**. Never show "PantryPal" in user-facing copy.

## Docs to read before big changes
CLAUDE.md (this file), DESIGN.md, BUG_LIST.md, QA_APP_STORE_FINAL_RELEASE.md

## Working rules
- Investigate before coding. For bugs: find root cause, not just the symptom. Report files/state involved + proposed fix BEFORE editing, unless told to just fix it directly.
- No side effects without approval: no `git commit`, no `eas build`, no `eas update` unless explicitly asked.
- Every fix/feature ends with: files changed, behavior before/after, and OTA (EAS Update) vs native (EAS Build) classification.
- Run `npx tsc --noEmit` after any change touching types. Zero errors before calling a task done.
- No `console.log` / `console.warn` / `console.error` left in production code paths.
- Every list/screen needs an empty state. Every async call needs a loading + error state.
- Shopping flow stays single-path: items get assigned to stores ONCE, inline on the Pantry tab, no duplicate confirmation screens or modals.
- Tag any review finding as P0 (crash/blocker), P1 (bad UX, must fix), or P2 (polish).

## Report Format
For ANY investigation/findings report (bug reports, audit results, implementation plans), use exactly this template. Max ~150 words total. No prose padding, no restating my request, no file dumps, no code blocks unless asked.

Files: [paths only]
Root cause: [1-3 sentences]
Plan: [max 5 bullets]
Flags: [P0/P1/P2, one line each — omit if none]
OTA or Build: [one word + one-sentence why]

## OTA Numbering
Before assigning a new OTA number, check the most recent one used (changelog or last commit message). Next OTA must be exactly +1, in sequence. Never skip a number, never reuse one, even across separate fixes/sessions.

## Compacting
When compacting, always preserve: current task goal, files changed so far, failing tests/errors (exact text), decisions already made, next action.
