# Stokit V2 Release Readiness

## Certified baseline

- Golden tag: `stokit-redesign-golden-ota333`
- Golden branch: `golden/stokit-redesign-ota333`
- Commit: `d1934a43a86f96eb3663ec44311bdb336a5e0139`
- Redesign OTA: 333 on `shopping-redesign-test`, runtime `1.0.0`
- Production baseline: OTA 309; isolated and unchanged.

## Completed QA

Certified on physical iPhone and iPad at the golden baseline:

- Fresh reinstall preserves an existing household's data.
- Household create, join, member removal, and rejoin work.
- Shared pantry, store, and household data remain intact.
- Two-device convergence works.
- Shopping start, finish, and reset work.
- Notify Family works in both directions without premature delivery on retest.
- Store search and saved coordinates work.
- Google Places preview configuration resolves.
- Force-close and reopen remain stable without a crash during final certification.

Local candidate checks must remain green: typecheck and the relevant store-coordinate, store-duplicate, and shopping UX tests.

## Remaining blockers

- Complete and record every row in `STOKIT_V2_FINAL_CERTIFICATION.md` against the release candidate.
- Decide the production identity and V1 upgrade strategy. The redesign bundle identifier differs from production, so it is not an automatic in-place upgrade.
- Complete Apple Developer and App Store Connect identity, APNs credential, entitlement, App Group, widget, privacy, and asset audits.
- Run a production-like native build and physical-device certification after those decisions are approved.
- The full test suite contains a known pre-existing auth-route static assertion failure for legacy `Stack.Protected` routing. It must be resolved or explicitly accepted with evidence before a production go decision; it is not suppressed by this candidate.

## App Store assets

- Final iPhone and iPad screenshots for all required App Store display sizes.
- App icon, promotional text, description, keywords, support URL, marketing URL, and release notes.
- Accurate privacy nutrition labels and age rating responses.
- Store listing review notes, demo account if needed, and contact details.

## Privacy requirements

- Publish a current privacy policy and account-deletion/support path.
- Disclose and justify location, notification, camera/photo, receipt, and household-data processing.
- Verify permission prompts are contextual and accurately describe use.
- Confirm retention, deletion, and support processes match the published policy.

## Production migration risks

- Different bundle IDs and URL schemes make redesign a separate installed app unless an Apple-level migration strategy is chosen.
- Existing V1 users must not be stranded, duplicated, or silently moved between identities or households.
- Production Supabase and push-token behavior must be verified with the intended production configuration before any migration.
- An OTA cannot change native identity, entitlements, App Groups, widgets, or APNs credentials.

## Rollback plan

1. Stop promotion and keep users on the existing production release.
2. Restore test behavior from `stokit-redesign-golden-ota333` on a new, append-only test-channel OTA if native compatibility permits.
3. Never reuse OTA 333 and never modify production OTA 309.
4. Preserve production data; do not use rollback as authority for database cleanup or schema changes.
5. Re-certify on physical iPhone and iPad before resuming promotion.

## Go / no-go criteria

Go only when every final-certification row passes, no P0/P1 data-integrity or crash issue remains, the production-promotion audit is resolved, App Store assets and privacy disclosures are complete, a production-like native build passes, and rollback has been rehearsed. Otherwise: no-go.
