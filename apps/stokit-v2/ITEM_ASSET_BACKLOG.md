# Item Asset Backlog — Stokit Asset Pack v1

Restructured from three prior audit passes (resolver rollout, `itemClassifier.ts`
audit, Visual QA pass) into one canonical checklist for Asset Pack v1. See
`VISUAL_QA_REPORT.md` for the original audit narrative and
`constants/itemAssetResolver.ts` / `scripts/generate-asset-map.ts` for the
pipeline that consumes this list.

Adding an asset: (1) drop a 1024×1024 transparent PNG in `assets/item-icons/`
named `<key>.png` (see naming convention below), (2) run `npm run
assets:generate`, (3) update that item's hardcoded icon field in
`constants/pantryCatalog.ts` (or the `ITEM_ICON` table in
`constants/itemAssetResolver.ts` for free-text-only items) from its current
value to `custom:<key>` — this is the same one-line data edit every one of
the 17 already-shipped custom assets required, not a resolver code change.
Do step 3 only after steps 1-2 are done: flipping the icon field before the
PNG exists swaps today's neutral `mdi:package-variant-closed` box for a
broken-image placeholder glyph, which is a worse interim state. Then flip
the row's Status to Done. No `itemAssetResolver.ts`/`generatedAssetMap.ts`
hand-edits are ever required — the codegen switch handles that.

**Naming convention:** icon string `custom:<key>`, `<key>` = lowercase snake_case
of the item name (e.g. `duct_tape`, `vegetable_oil`). Keys must be globally
unique across `assets/custom-emojis/` and `assets/item-icons/` — the generator
throws if two files would produce the same key.

---

## Active backlog — Asset Pack v1 (phases = rollout order)

| Item | Category | Current icon | Priority | Phase | Status / needed asset |
|---|---|---|---|---|---|
| Vegetable oil | Spices | `mdi:package-variant-closed` | P0 | 1 | Cooking-oil bottle |
| Chips | Snacks | `mdi:package-variant-closed` | P0 | 1 | Bag of chips |
| Tape | Office | `mdi:package-variant-closed` | P0 | 1 | Tape roll/dispenser |
| Staples | Office | `mdi:package-variant-closed` | P0 | 1 | Stapler/staple strip |
| Duct tape | Hardware | `mdi:package-variant-closed` | P0 | 1 | Duct tape roll (visually distinct from Office Tape) |
| Zip ties | Hardware | `mdi:package-variant-closed` | P0 | 1 | Bundle of cable ties |
| Dates | Snacks | `mdi:package-variant-closed` | P0 | 1 | Date fruit cluster |
| Sandpaper | Hardware | `mdi:package-variant-closed` | P0 | 1 | Sandpaper sheet/pad |
| Caulk | Hardware | `mdi:package-variant-closed` | P0 | 1 | Caulk gun tube |
| Superglue | Hardware | `mdi:package-variant-closed` | P0 | 1 | Small glue tube/bottle |
| Funnels | Automotive | `mdi:package-variant-closed` | P0 | 1 | Funnel silhouette |
| Beetroot (beet, beets, beetroot) | — free-text only | `mdi:package-variant-closed` | P0 | 2 | Beet/beetroot silhouette |
| Cotton balls (cotton rounds, q tips, cotton swabs) | — free-text only | `mdi:package-variant-closed` | P0 | 2 | Cotton ball/swab pack |
| Coffee filters / disposable cups / solo cups | — free-text only | `mdi:package-variant-closed` | P0 | 2 | 1-2 illustrations (filters vs. cups differ); the "paper plates"/"paper cups" keywords in this old classifier group are already resolved via the catalog match |
| Scotch tape / masking tape / painter's tape | — free-text only | `mdi:package-variant-closed` | P0 | 2 | Decide at authoring time: reuse Office `custom:tape` key or add distinct art (the "duct tape" keyword in this old group is already resolved via the catalog match) |
| Black pepper | Spices | 🧂 | P1 | 3 | Pepper grinder/shaker |
| Cinnamon | Spices | 🧂 | P1 | 3 | Cinnamon sticks |
| Cumin | Spices | 🧂 | P1 | 3 | Spice jar, cumin-colored |
| Turmeric | Spices | 🧂 | P1 | 3 | Turmeric powder/root |
| Ground beef | Meat | 🥩 | P1 | 3 | Ground meat pile/tray (current icon is a steak cut) |
| Oats | Dry Goods | 🌾 | P1 | 3 | Oat flakes/canister (current icon is wheat) |
| Shaving cream | Personal Care | 🧴 | P1 | 3 | Aerosol shaving cream can |
| Feminine care (+ free-text: feminine hygiene, tampons, pads, liners) | Personal Care | 🌸 | P1 | 3 | Product-specific packaging — same real product across catalog + free-text paths, one asset covers both |
| Litter | Pet | 🐾 | P1 | 3 | Litter box/bag |
| Cream cheese | Dairy | `mdi:cheese` | P1 | 4 | Shared glyph with Goat cheese/Cheese, no distinct one exists |
| Goat cheese | Dairy | `mdi:cheese` | P1 | 4 | Shared glyph with Cream cheese/Cheese, no distinct one exists |
| Granola bars | Snacks | 🌾 | P1 | 4 | Wheat emoji, wrong grain — same issue class as Oats |
| Gum | Snacks | 🦷 | P1 | 4 | Associative (tooth), not gum-specific |
| Mint | Snacks | 🍃 | P1 | 4 | Ambiguous leaf emoji |
| Sour cream | Dairy | 🫙 | P1 | 4 | Usually sold in a tub, not a jar |
| Baby food | Baby | 🥣 | P1 | 4 | Bowl emoji, shared with Yogurt |
| Lentils | Dry Goods | `mdi:grain` | P1 | 4 | Shared generic grain glyph |
| Quinoa | Dry Goods | `mdi:grain` | P1 | 4 | Shared generic grain glyph |
| Car wax | Automotive | ✨ | P1 | 4 | Abstract sparkles, no wax-tin glyph exists |
| Tissues | Paper Goods | `mdi:box` | P1 | 4 | Generic box glyph |
| Napkins | Paper Goods | `mdi:square-rounded-outline` | P2 | 4 | Cosmetic upgrade only |
| Paper plates | Paper Goods | `mdi:circle-outline` | P2 | 4 | Cosmetic upgrade only |
| Lettuce | Produce | 🥬 | P2 | 4 | Shared with Spinach, not lettuce-specific |
| Spinach | Produce | 🥬 | P2 | 4 | Shared with Lettuce, not spinach-specific |
| Turnip | — free-text only | 🥕 | P2 | 4 | Carrot emoji, wrong root vegetable |
| Parsnip | — free-text only | 🥕 | P2 | 4 | Carrot emoji, wrong root vegetable |
| Fig | — free-text only | 🍇 | P2 | 4 | Grape emoji, no fig emoji exists |
| Passion fruit | — free-text only | 🍇 | P2 | 4 | Grape emoji, no passionfruit emoji exists |
| Pomegranate | — free-text only | 🍎 | P2 | 4 | Apple emoji, no pomegranate emoji exists |
| Protein powder / protein bar | — free-text only | 💪 | P2 | 4 | Symbolic (flexed bicep), not a depicted product |

**~45 illustrations total across 4 phases** (revised up from the ~36-37 rough
estimate in the Asset Pack v1 plan — reconciling the classifier-only "reviewed,
left as-is" rows into this single list surfaced 8 additional free-text-only
items: Turnip, Parsnip, Fig, Passion fruit, Pomegranate, Protein powder/bar,
plus the Feminine care merge). None of the 17 existing `assets/custom-emojis/`
illustrations are reusable for any row above — all were cross-checked and are
already assigned to unrelated personal-care/cleaning items.

---

## Resolved — accurate icon already shipped, no art needed

| Item | Current icon |
|---|---|
| Mustard | 🫙 |
| Aluminum foil | `mdi:paper-roll-outline` |
| Fabric softener | `custom:fabric_softener` |
| Wipes | `custom:wipes` |
| Insect repellent | 🦟 |
| Cod | `mdi:fish` |
| Motor oil | `mdi:oil` |
| Vinegar | `mdi:bottle-tonic-outline` |
| Soda | `mdi:bottle-soda-classic-outline` |
| Jam | 🫙 |
| Paint | `mdi:format-paint` |
| Zip bags | `mdi:zip-box-outline` |
| Lamb | `mdi:food-steak` |
| Baby lotion | `custom:lotion` |
| `'air freshener'` alias | 🌺 |

## Out of scope — intentional, test-locked

`raisins` / `dried cranberries` and `towel` / `towels` / `bath towels` keep their
existing emoji on purpose — both are locked by explicit regression tests in
`tests/item-classifier.test.ts`, a prior author's deliberate choice, not a bug.

## Priority legend
- **P0**: was actively misleading (wrong object depicted), now on the neutral
  placeholder pending real art
- **P1**: generic same-domain fallback, no dedicated icon
- **P2**: acceptable, cosmetic upgrade only
