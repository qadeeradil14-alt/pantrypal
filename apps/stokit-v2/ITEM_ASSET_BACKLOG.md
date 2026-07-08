# Item Asset Backlog

Generated as part of the item asset resolver system (see `constants/itemAssetResolver.ts`).
Lists every catalog/alias item without an accurate dedicated representation, so real
assets can be sourced/drawn deliberately instead of guessed. No new art was added in
this pass — only the resolver plumbing and the P0 fixes below.

## P0 — Fixed this pass (was actively misleading, now on a neutral placeholder)

These previously rendered a completely wrong-domain object (a toolbox, a car) for an
item that looks nothing like it. They now render `mdi:package-variant-closed` (a plain
box) until a real asset exists — never blank, never wrong.

| Item | Category | Old mapping | Current mapping | Needed asset |
|---|---|---|---|---|
| Duct tape | Hardware | 🧰 (toolbox) | `mdi:package-variant-closed` | Roll of duct tape, side profile |
| Zip ties | Hardware | 🧰 (toolbox) | `mdi:package-variant-closed` | Bundle of cable ties |
| Sandpaper | Hardware | 🧰 (toolbox) | `mdi:package-variant-closed` | Sandpaper sheet/pad |
| Caulk | Hardware | 🧰 (toolbox) | `mdi:package-variant-closed` | Caulk gun tube |
| Superglue | Hardware | 🧰 (toolbox) | `mdi:package-variant-closed` | Small glue tube/bottle |
| Funnels | Automotive | 🚗 (car) | `mdi:package-variant-closed` | Funnel silhouette |

## P1 — Generic-but-plausible, no wrong-domain object, worth a dedicated icon

Same-domain fallback (e.g. a spice container for a specific spice), not embarrassing
but not item-specific either.

| Item | Category | Current mapping | Needed asset |
|---|---|---|---|
| Black pepper | Spices | 🧂 (salt shaker) | Pepper grinder/shaker |
| Cinnamon | Spices | 🧂 (salt shaker) | Cinnamon sticks |
| Cumin | Spices | 🧂 (salt shaker) | Spice jar, cumin-colored |
| Turmeric | Spices | 🧂 (salt shaker) | Turmeric powder/root |
| Ground beef | Meat | 🥩 (steak cut) | Ground meat pile/tray |
| Shaving cream | Personal Care | 🧴 (generic lotion bottle) | Aerosol shaving cream can |
| Feminine care | Personal Care | 🌸 (flower) | Product-specific packaging |
| Litter | Pet | 🐾 (paw print) | Litter box/bag |
| Oats | Dry Goods | 🌾 (wheat, wrong grain) | Oat flakes/canister |

## P2 — Acceptable for now, upgrade candidates for visual polish

Abstract or loosely-related glyphs used because no closer emoji/MDI exists; not
misleading, just not distinctive.

| Item | Category | Current mapping |
|---|---|---|
| Tissues | Paper Goods | `mdi:box` |
| Napkins | Paper Goods | `mdi:square-rounded-outline` |
| Paper plates | Paper Goods | `mdi:circle-outline` |
| Zip bags | Kitchen | 🛍️ (shopping bag) |
| Lettuce / Spinach | Produce | 🥬 (shared emoji, not spinach-specific) |
| Soda | Drinks | 🥤 (generic cup, not can/bottle) |

## P0 — Fixed in `itemClassifier.ts` audit (was actively misleading or disturbing)

Same class of bug as the P0 fixes above (wrong-domain object, or an unrelated glyph
reused via copy-paste), found in the 307-rule keyword table that backs every
uncatalogued pantry row. Emoji-only edits — `category`/`color`/`storageLocation`
were left untouched.

| Keywords | Old mapping | Current mapping | Needed asset |
|---|---|---|---|
| date, dates, medjool | 🫚 (ginger root — copy/paste from the `ginger` rule) | `mdi:package-variant-closed` | Date fruit cluster |
| beet, beets, beetroot | 🩸 (drop of blood) | `mdi:package-variant-closed` | Beet/beetroot silhouette |
| coffee filters, paper plates, paper cups, disposable cups, solo cups | ☕ (hot beverage — wrong for the plate/cup items in this group) | `mdi:package-variant-closed` | Split into per-item icons; no single glyph covers this group |
| cotton balls, cotton rounds, q tips, cotton swabs | 🌸 (flower — also duplicated in `itemAssetResolver.ts`'s `ITEM_ICON`, fixed there too) | `mdi:package-variant-closed` | Cotton ball/swab pack |
| tape, scotch tape, duct tape, masking tape, painters tape | 🗂️ (file folder tabs) | `mdi:package-variant-closed` | Tape roll (same bug already fixed for the curated "Duct tape" catalog entry — this was the free-text path hitting it again) |

## Corrected with an existing accurate icon (no backlog entry needed)

| Keywords | Old mapping | Current mapping |
|---|---|---|
| mustard, dijon, yellow mustard, whole grain mustard | 🌭 (hot dog) | 🫙 (matches every other jarred condiment in the same rule table) |
| aluminum foil, tin foil, reynolds wrap | ✨ (sparkles) | `mdi:paper-roll-outline` (matches the curated catalog's own "Aluminum foil" icon) |
| fabric softener, downy, snuggle, dryer sheets | 🌸 (flower) | `custom:fabric_softener` (real asset already ships in the app, used by the curated catalog entry) |
| sunscreen wipes, wet wipes, baby wipes | 🌸 (flower) | `custom:wipes` (real asset already ships in the app) |
| insect repellent, bug spray, raid, deet, off spray | 🐛 (generic caterpillar) | 🦟 (mosquito — matches the curated catalog's own "Bug spray" icon) |

## P1 — Reviewed, left as-is (same-domain, not misleading)

| Keywords | Mapping | Why left alone |
|---|---|---|
| turnip, turnips, parsnip, parsnips | 🥕 (carrot) | Wrong root vegetable but same domain; no turnip/parsnip emoji exists |
| fig, figs / passion fruit | 🍇 (grape) | No fig/passionfruit emoji exists; grape is the closest existing glyph, same convention already locked by tests for raisins |
| pomegranate | 🍎 (apple) | No pomegranate emoji exists |
| feminine hygiene, tampons, pads, liners | 🌸 (flower) | Already logged as P1 in the resolver-path audit; no dedicated asset available yet |
| protein powder, protein bar | 💪 (flexed bicep) | Symbolic, not a depicted wrong object |

Not touched: `raisins` / `dried cranberries` and `towel` / `towels` / `bath towels` keep
their existing emoji — both are locked by explicit regression tests in
`tests/item-classifier.test.ts` and are intentional choices by a prior author, not bugs.

## Priority legend
- **P0**: actively misleading (wrong object depicted)
- **P1**: generic same-domain fallback, no dedicated icon
- **P2**: acceptable, cosmetic upgrade only
