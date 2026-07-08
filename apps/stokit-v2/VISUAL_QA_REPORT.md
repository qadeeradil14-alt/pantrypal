# Visual QA — Unified Item Resolver

Read-only audit of `constants/pantryCatalog.ts` (203 curated items, 22 categories) plus the
resolver layer (`constants/itemAssetResolver.ts`'s `ITEM_ICON`/`CATEGORY_ICON` tables and
`components/shared/ItemIcon.tsx`'s render logic). No code was changed to produce this report.
Only rows with an actual issue are listed — accurate icons are omitted.

## Issues

| Category | Item | Current icon/asset | Expected representation | Severity | Recommendation |
|---|---|---|---|---|---|
| Produce | Lettuce / Spinach | 🥬 (shared) | Distinct leafy-green icon per item | Low | Better MDI icon |
| Dairy | Cream cheese / Goat cheese | `mdi:cheese` (shared; differs in style from Cheese's 🧀) | Distinct per-cheese icon, consistent style | Medium | New custom asset |
| Dairy | Sour cream | 🫙 (jar) | Tub-style container | Low | Better MDI icon |
| Meat | Ground beef | 🥩 (steak cut, shared with Steak) | Loose/ground meat, not a whole cut | Medium | New custom asset |
| Meat | Lamb | `mdi:sheep` (live animal) | Meat-cut icon, consistent with Chicken/Turkey/Beef | Medium | Better MDI icon |
| Seafood | Cod | 🐠 (tropical/ornamental fish) | Whitefish fillet, consistent with Salmon's `mdi:fish` | High | Better MDI icon |
| Dry Goods | Oats | 🌾 (wheat) | Oat flakes/canister | Medium | New custom asset *(already in backlog)* |
| Dry Goods | Lentils / Quinoa | `mdi:grain` (shared) | Distinct grain/legume icon per item | Low | Better MDI icon |
| Canned | Jam | 🍓 (strawberry) | Fruit-neutral jam jar | Medium | Better MDI icon |
| Canned | Tomato sauce | 🫙 (jar, shared w/ Sour cream, Soy sauce, Mayonnaise) | Sauce-specific bottle/jar | Low | Better MDI icon |
| Spices | Black pepper / Cinnamon / Cumin / Turmeric | 🧂 (salt shaker, shared with Salt) | Distinct per-spice icon | Medium | New custom asset *(already in backlog)* |
| Spices | Vegetable oil | 🛢️ (industrial oil drum, shared with Automotive's Motor oil) | Cooking-oil bottle | High | New custom asset |
| Spices | Vinegar | 🍾 (champagne bottle) | Plain glass bottle, not alcohol-coded | Medium | Better MDI icon |
| Spices | Soy sauce / Mayonnaise | 🫙 (jar, shared) | Condiment-specific bottle/jar | Low | Better MDI icon |
| Drinks | Soda | 🥤 (generic cup + straw) | Can or bottle | Low | Better MDI icon *(already in backlog)* |
| Snacks | Chips | 🍟 (french fries) | Bag of chips | **Critical** | New custom asset |
| Snacks | Dates | 🌴 (palm tree) | Date fruit cluster | **Critical** | New custom asset (route to placeholder meanwhile) |
| Snacks | Granola bars | 🌾 (wheat) | Granola bar/wrapper | Medium | New custom asset |
| Snacks | Gum | 🦷 (tooth) | Gum pack/stick | Medium | Better MDI icon |
| Snacks | Mint | 🍃 (leaf) | Mint tin/candy | Low | Better MDI icon |
| Kitchen | Zip bags | 🛍️ (shopping bag) | Resealable/ziplock bag | Medium | Better MDI icon *(already in backlog)* |
| Paper Goods | Tissues / Napkins / Paper plates / Paper cups | Abstract `mdi:box`/`square-rounded-outline`/`circle-outline`/`cup-outline` | Item-specific icon per product | Medium | New custom asset *(already in backlog)* |
| Personal Care | Shaving cream | 🧴 (generic lotion bottle) | Aerosol can | Medium | New custom asset *(already in backlog)* |
| Personal Care | Feminine care | 🌸 (flower) | Product-specific packaging | Medium | New custom asset *(already in backlog)* |
| Baby | Baby food | 🥣 (bowl, shared with Yogurt) | Jar/pouch specific to baby food | Low | Better MDI icon |
| Baby | Baby lotion | 🧴 (generic bottle) | App already ships `custom:lotion` for Personal Care's Lotion — unused here | Medium | **Existing local asset** (reuse `custom:lotion`) |
| Pet | Litter | 🐾 (paw print) | Litter box/bag | Medium | New custom asset *(already in backlog)* |
| Automotive | Motor oil | 🛢️ (shared with Spices' Vegetable oil) | Motor oil bottle/jug | High | New custom asset |
| Automotive | Air freshener | 🌺 (hibiscus — differs from resolver's own `'air freshener'` alias, which uses 🌸) | One consistent icon regardless of which lookup path resolves it | Medium | Better MDI icon |
| Automotive | Car wax | ✨ (sparkles) | Wax tin/bottle | Medium | New custom asset |
| Hardware | Paint | 🖌️ (paintbrush — a tool, not the product) | Paint can | Low | Better MDI icon |
| Office | Tape | 🖇️ (paperclip) | Tape roll/dispenser | **Critical** | New custom asset |
| Office | Staples | 📎 (paperclip) | Stapler/staple strip | High | Better MDI icon |

### Already-tracked placeholders (confirmed consistent, no new action)
`Duct tape`, `Zip ties`, `Sandpaper`, `Caulk`, `Superglue` (Hardware) and `Funnels`
(Automotive) all correctly share the neutral `mdi:package-variant-closed` placeholder —
this was the deliberate P0 fix from the prior audit pass, already logged in
`ITEM_ASSET_BACKLOG.md`. Flagged here only to confirm the "duplicate representation" check
covered them; not a new finding.

### Resolver / rendering-layer notes
1. **Inconsistent icon scale** — `components/shared/ItemIcon.tsx` renders `image` assets at
   `size * 0.7` but `mdi` and `emoji` kinds at `size * 0.55` and the `placeholder` at
   `size * 0.5`. Any item using a `custom:` PNG (18 items) renders visibly larger than an
   emoji/MDI item at the same avatar size. Severity: Medium. Recommendation: normalize to a
   single scale factor (e.g. `0.6`) across all four kinds.
2. **Duplicate air-freshener glyph** — see Automotive row above; the free-text alias table
   (`ITEM_ICON['air freshener']`) and the curated catalog entry disagree on which flower
   emoji to use for the same concept.

## Summary

- **Total pantry items reviewed:** 203 (across 22 categories)
- **Exact local assets (`custom:*`):** 18 item entries / 17 unique PNG files (`custom:wipes`
  is intentionally reused for both Disinfecting wipes and Baby wipes)
- **Acceptable MDI icons:** 37 (43 total `mdi:` usages minus the 6 neutral placeholders)
- **Placeholder icons:** 6, all `mdi:package-variant-closed` (already logged as P0 in
  `ITEM_ASSET_BACKLOG.md`)
- **Items requiring new artwork:** 24 total — 6 already tracked (the existing placeholder
  group above) + 18 newly identified in this pass (Cream cheese, Goat cheese, Ground beef,
  Oats, Black pepper, Cinnamon, Cumin, Turmeric, Vegetable oil, Chips, Dates, Granola bars,
  Shaving cream, Feminine care, Litter, Motor oil, Car wax, Tape/Office)
- **Most severe findings (Critical):** Chips (🍟 fries), Dates (🌴 tree), Tape/Office (🖇️
  paperclip) — all three depict a literally wrong object, the same bug class already fixed
  elsewhere in `itemClassifier.ts` (OTA 301) but missed in the curated catalog.

No code was modified. No OTA was published.
