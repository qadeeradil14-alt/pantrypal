# Stokit V2 Final Certification

Candidate branch: `release/stokit-v2-candidate`
Baseline: `stokit-redesign-golden-ota333` / `d1934a43a86f96eb3663ec44311bdb336a5e0139`
Test channel: `shopping-redesign-test`
Runtime: `1.0.0`

For each row, record device, build, tester, date, and evidence.

## Auth

- [ ] Pass [ ] Fail — Signup
- [ ] Pass [ ] Fail — Email confirmation
- [ ] Pass [ ] Fail — Login and logout
- [ ] Pass [ ] Fail — Session restore
- [ ] Pass [ ] Fail — Password reset
- [ ] Pass [ ] Fail — Reinstall and sign in

## Household

- [ ] Pass [ ] Fail — Create household
- [ ] Pass [ ] Fail — Invite member
- [ ] Pass [ ] Fail — Join household
- [ ] Pass [ ] Fail — Remove member
- [ ] Pass [ ] Fail — Leave household
- [ ] Pass [ ] Fail — Rejoin household
- [ ] Pass [ ] Fail — Ownership transfer
- [ ] Pass [ ] Fail — Owner restrictions
- [ ] Pass [ ] Fail — Shared data remains intact throughout membership changes

## Pantry

- [ ] Pass [ ] Fail — Add, edit, and delete item
- [ ] Pass [ ] Fail — Quantity and status changes
- [ ] Pass [ ] Fail — Search and add flow
- [ ] Pass [ ] Fail — Two-device convergence
- [ ] Pass [ ] Fail — Reopen and background recovery

## Shopping

- [ ] Pass [ ] Fail — Create trip
- [ ] Pass [ ] Fail — Assign stores
- [ ] Pass [ ] Fail — Start shopping
- [ ] Pass [ ] Fail — Cross-device active-trip transition
- [ ] Pass [ ] Fail — Check and uncheck items
- [ ] Pass [ ] Fail — Add and delete items mid-trip
- [ ] Pass [ ] Fail — Finish store
- [ ] Pass [ ] Fail — Finish trip
- [ ] Pass [ ] Fail — Reset shopping
- [ ] Pass [ ] Fail — No ghost trip or store after reset
- [ ] Pass [ ] Fail — No crash during complete lifecycle

## Notifications

- [ ] Pass [ ] Fail — Owner to member notification
- [ ] Pass [ ] Fail — Member to owner notification
- [ ] Pass [ ] Fail — Foreground notification
- [ ] Pass [ ] Fail — Background notification
- [ ] Pass [ ] Fail — Locked-device notification
- [ ] Pass [ ] Fail — No self-notification
- [ ] Pass [ ] Fail — No premature or duplicate notification

## Stores

- [ ] Pass [ ] Fail — Google Places search
- [ ] Pass [ ] Fail — Walmart prediction, save, and directions
- [ ] Pass [ ] Fail — Sam's Club prediction, save, and directions
- [ ] Pass [ ] Fail — Costco prediction, save, and directions
- [ ] Pass [ ] Fail — Target prediction, save, and directions
- [ ] Pass [ ] Fail — Coordinate validation and persistence after reopen
- [ ] Pass [ ] Fail — No saved store with `0,0` coordinates

## Receipts and history

- [ ] Pass [ ] Fail — Capture and upload receipt
- [ ] Pass [ ] Fail — Receipt persistence
- [ ] Pass [ ] Fail — Household visibility
- [ ] Pass [ ] Fail — Spending totals
- [ ] Pass [ ] Fail — History navigation

## Profile and settings

- [ ] Pass [ ] Fail — Upload, replace, and remove profile photo
- [ ] Pass [ ] Fail — Initials fallback
- [ ] Pass [ ] Fail — Household screen
- [ ] Pass [ ] Fail — Settings navigation
- [ ] Pass [ ] Fail — About and version
- [ ] Pass [ ] Fail — Light and dark mode
- [ ] Pass [ ] Fail — iPhone and iPad layout

## Recovery and stability

- [ ] Pass [ ] Fail — Fresh iPad reinstall while iPhone has populated household data
- [ ] Pass [ ] Fail — Authenticated server hydration completes before any UI write
- [ ] Pass [ ] Fail — Offline to online recovery
- [ ] Pass [ ] Fail — Force-close and reopen on both devices
- [ ] Pass [ ] Fail — Repeated tab switching
- [ ] Pass [ ] Fail — Crash-free complete test cycle
- [ ] Pass [ ] Fail — No household data loss
