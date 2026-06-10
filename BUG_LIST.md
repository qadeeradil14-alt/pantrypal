# Stokit Bug List

> Last updated: 2026-05-29

---

## Pending (needs app build + push)

| # | Bug | Priority | Status |
|---|-----|----------|--------|
| - | No pending bugs right now | - | - |

---

## Fixed — Ready to Push (say "push it" when ready)

| # | Fix | Notes |
|---|-----|-------|
| 1 | Barcode scanner doesn't recognize products | Cleaned up dead API endpoints, padded US UPCs for OpenFoodFacts |
| 2 | Kmart MapView crash (longitudeDelta overflow) | Fixed in build #7 — already live |
| 3 | Receipts: delete button | Confirmation alert → removes instantly |
| 4 | Budget bar doesn't refresh after receipt | Now refreshes on tab focus |
| 5 | Receipt parsing: all showing Unknown store + Failed | Edge Function base64 overflow fixed — **deployed already, no build needed** |
| 6 | Weekly budget not obvious in Settings | Subtitle hint + primary color + bigger pencil |
| 7 | Fire emoji confusing | Tap it → Alert explains "N-day pantry streak" |

---

## Completed (already in TestFlight)

| Build | Fix |
|-------|-----|
| #7 | Kmart MapView crash |

---

*Say "push it" to build + submit fixes 3–7 to TestFlight in one shot.*
*Bug #1 (barcode scanner) still needs investigation — report more details when ready.*
