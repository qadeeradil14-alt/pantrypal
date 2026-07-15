# Stokit V2 Release Candidate Guardrails

Certified baseline: `stokit-redesign-golden-ota333` at `d1934a43a86f96eb3663ec44311bdb336a5e0139`.

## Feature freeze

Allowed during release certification:

- Reproducible bug fixes
- UI polish
- Accessibility fixes
- App Store metadata and assets
- Release configuration work
- Test coverage

Forbidden without explicit approval:

- Sync-engine changes
- Persistence rewrites
- Supabase schema or RLS redesign
- Household architecture changes
- Navigation redesign
- Broad refactors
- New feature development

## Release boundaries

- Keep the golden tag and `golden/stokit-redesign-ota333` unchanged.
- Keep production OTA 309 untouched.
- Do not publish an OTA from this branch without explicit release approval.
- Every candidate fix must include a deterministic reproduction and proportionate regression coverage.
- Stop and obtain approval before a proposed fix crosses a forbidden boundary.
