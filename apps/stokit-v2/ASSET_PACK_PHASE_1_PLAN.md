# Stokit Asset Pack v1 — Phase 1 Plan

Scope: the 11 Priority-0 items currently sharing the neutral
`mdi:package-variant-closed` placeholder. Every rule below is defined by
`STOKIT_ASSET_STYLE_GUIDE.md`; this doc applies it item-by-item.

## Naming-convention note (flagging a conflict, resolved below)

The shipped pipeline (`scripts/generate-asset-map.ts`, `ITEM_ASSET_BACKLOG.md`,
`STOKIT_ASSET_STYLE_GUIDE.md §11`) already establishes and implements:
**lowercase snake_case key, `.png` file, `custom:<key>` icon string.** The
generator only globs `*.png` — a `.webp` file would be silently skipped, not
errored. This plan uses the established snake_case/`.png` convention rather
than a kebab-case/`.webp` convention, since that's what the pipeline actually
reads. Flagged explicitly rather than silently switched.

## Asset table

| # | Item name | Filename | Slug | Category | Aliases | Priority | Dimensions | Transparency | Format | Icon string |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Vegetable oil | `vegetable_oil.png` | `vegetable_oil` | Spices | cooking oil, veg oil | P0 | 1024×1024 | RGBA alpha | PNG | `custom:vegetable_oil` |
| 2 | Chips | `chips.png` | `chips` | Snacks | potato chips, crisps | P0 | 1024×1024 | RGBA alpha | PNG | `custom:chips` |
| 3 | Office tape | `office_tape.png` | `office_tape` | Office | tape, sticky tape, scotch tape | P0 | 1024×1024 | RGBA alpha | PNG | `custom:office_tape` |
| 4 | Staples | `staples.png` | `staples` | Office | staple strip, staple box | P0 | 1024×1024 | RGBA alpha | PNG | `custom:staples` |
| 5 | Duct tape | `duct_tape.png` | `duct_tape` | Hardware | gaffer tape | P0 | 1024×1024 | RGBA alpha | PNG | `custom:duct_tape` |
| 6 | Zip ties | `zip_ties.png` | `zip_ties` | Hardware | cable ties, zip tie | P0 | 1024×1024 | RGBA alpha | PNG | `custom:zip_ties` |
| 7 | Dates (fruit) | `dates.png` | `dates` | Snacks | medjool dates, date fruit | P0 | 1024×1024 | RGBA alpha | PNG | `custom:dates` |
| 8 | Sandpaper | `sandpaper.png` | `sandpaper` | Hardware | sanding sheets, emery paper | P0 | 1024×1024 | RGBA alpha | PNG | `custom:sandpaper` |
| 9 | Caulk | `caulk.png` | `caulk` | Hardware | caulking, sealant tube | P0 | 1024×1024 | RGBA alpha | PNG | `custom:caulk` |
| 10 | Superglue | `superglue.png` | `superglue` | Hardware | super glue, instant adhesive | P0 | 1024×1024 | RGBA alpha | PNG | `custom:superglue` |
| 11 | Funnels | `funnels.png` | `funnels` | Automotive | funnel | P0 | 1024×1024 | RGBA alpha | PNG | `custom:funnels` |

**Naming convention recap:** `custom:<slug>` icon string, `<slug>.png` file in
`assets/item-icons/`, slug = lowercase snake_case, globally unique across
`assets/custom-emojis/` and `assets/item-icons/`.

**Collision note:** `office_tape` and `duct_tape` are deliberately distinct
slugs (not both `tape`) because both must render as visually distinct
objects — an office tape dispenser/roll vs. a bare fabric-backed duct-tape
roll. A future Phase 2 "Scotch tape / masking tape / painter's tape"
free-text group may reuse `custom:office_tape` rather than get its own asset
— decide at that item's authoring time, not here.

Status: all 11 rows are `Not started` — no artwork sourced or generated in
this phase per mission constraints.

---

## Generation prompts

Each prompt follows `STOKIT_ASSET_STYLE_GUIDE.md` exactly: photorealistic 3D
product render, dead-front-on camera, soft studio lighting, single soft
grounding shadow, no outline, transparent 1024×1024 RGBA canvas, ≥15% margin
on every side, generic/fake label text only (never a real brand).

**Shared render-quality clause** (append to every prompt): *"High-quality,
clean anti-aliased edges, no outline or stroke, sharp focus on the object,
1024x1024 square canvas, fully transparent PNG background (real alpha
channel, not a white or checkerboard fill)."*

**Shared negative prompt** (append to every prompt):

> NEGATIVE PROMPT — avoid: real or legible brand names, real logos, real
> trademarked packaging designs, extra legible label copy beyond one generic
> fake wordmark, watermark, multiple objects or duplicate items in frame,
> background scene or props of any kind, additional shadows or reflections
> beyond the single grounding shadow, shadow extending to or past the canvas
> edge, cropped or cut-off object, fisheye/wide-angle/perspective
> distortion, unrealistic or neon/oversaturated colors, outline or stroke
> around the object, flat-vector or emoji-style rendering, opaque or
> non-transparent background.

### 1. Vegetable oil (`custom:vegetable_oil`)
Object: a clear plastic/glass cooking-oil bottle, narrow neck, screw cap,
filled with pale golden-yellow oil, label wraps the mid-bottle.
Camera angle: dead-front-on, no tilt. Composition: centered, bottle
vertical. Lighting: soft studio softbox from above-front; highlight along
the bottle's glossy curve. Perspective: flat front elevation. Padding: ≥15%
margin on all sides, bottle fills ~45-55% of frame width. Transparent
background: yes, real alpha. Style: photorealistic 3D product render,
glass/plastic material with correct refraction-free specular highlight.

### 2. Chips (`custom:chips`)
Object: a stand-up foil/plastic snack bag, gently bulging with product,
crimped top seal, glossy bag material with a soft diagonal highlight
streak. Camera angle: dead-front-on. Composition: centered, bag upright.
Lighting: soft studio light, highlight following the bag's crinkled
surface. Perspective: flat front elevation. Padding: ≥15% margin, bag fills
~55-65% of frame width (wider silhouette than a bottle). Transparent
background: yes. Style: photorealistic 3D product render, foil/plastic
material.

### 3. Office tape (`custom:office_tape`)
Object: a desktop tape dispenser holding a roll of clear adhesive tape,
compact plastic body distinct in silhouette from a bare tape roll. Camera
angle: dead-front-on, very slight 3/4 rotation only if required to show the
tape roll opening — prefer flat front-on. Composition: centered. Lighting:
soft studio light, highlight on the dispenser's plastic shell and the
tape's edge. Perspective: flat front elevation. Padding: ≥15% margin, object
fills ~55-65% of frame width. Transparent background: yes. Style:
photorealistic 3D product render, matte/glossy plastic.

### 4. Staples (`custom:staples`)
Object: a small rectangular cardboard box of staples with a flip-top lid,
a strip of staples visible at the opening. Camera angle: dead-front-on.
Composition: centered, box upright. Lighting: soft studio light, matte
cardboard diffuse falloff, subtle metal glint on the visible staple strip.
Perspective: flat front elevation. Padding: ≥15% margin, box fills ~40-50%
of frame width. Transparent background: yes. Style: photorealistic 3D
product render, cardboard + metal materials.

### 5. Duct tape (`custom:duct_tape`)
Object: a bare, wide roll of fabric-backed duct tape standing upright on
its cardboard core — no dispenser, must read as clearly distinct from
Office tape. Camera angle: dead-front-on. Composition: centered, roll
upright, core hole visible. Lighting: soft studio light, matte fabric-tape
sheen. Perspective: flat front elevation. Padding: ≥15% margin, roll fills
~50-60% of frame width. Transparent background: yes. Style: photorealistic
3D product render, matte fabric-tape material.

### 6. Zip ties (`custom:zip_ties`)
Object: a neat bundle of nylon cable ties, fanned slightly in a small
stack, held with a thin paper band — no blister-pack packaging. Camera
angle: dead-front-on. Composition: centered. Lighting: soft studio light,
subtle plastic sheen on each tie. Perspective: flat front elevation.
Padding: ≥15% margin, bundle fills ~45-55% of frame width. Transparent
background: yes. Style: photorealistic 3D product render, semi-glossy
nylon material.

### 7. Dates (fruit) (`custom:dates`)
Object: a small cluster of 3-4 whole Medjool dates, glossy wrinkled
dark-brown skin, stacked naturally — the fruit itself, no packaging, no
label. Camera angle: dead-front-on / slightly elevated hero-shot, matching
still-life food photography framing. Composition: centered cluster.
Lighting: soft studio light, gentle highlight on the glossy skin.
Perspective: flat front elevation. Padding: ≥15% margin, cluster fills
~45-55% of frame width. Transparent background: yes. Style: photorealistic
3D food render (no packaging elements at all).

### 8. Sandpaper (`custom:sandpaper`)
Object: a small stack of 2-3 sandpaper sheets, slightly fanned to reveal
grit texture and stack depth, warm tan/brown abrasive surface. Camera
angle: dead-front-on. Composition: centered. Lighting: soft studio light,
diffuse matte grit texture, no gloss. Perspective: flat front elevation.
Padding: ≥15% margin, stack fills ~50-60% of frame width. Transparent
background: yes. Style: photorealistic 3D product render, matte abrasive
paper material.

### 9. Caulk (`custom:caulk`)
Object: a single caulking-gun cartridge tube — cylindrical cardboard/
plastic tube with a tapered nozzle tip — standing upright, no gun/
applicator. Camera angle: dead-front-on. Composition: centered, tube
vertical. Lighting: soft studio light, matte cardboard body with a small
plastic-nozzle highlight. Perspective: flat front elevation. Padding: ≥15%
margin, tube fills ~35-45% of frame width (tall/narrow). Transparent
background: yes. Style: photorealistic 3D product render.

### 10. Superglue (`custom:superglue`)
Object: a single small superglue tube or bottle with a fine-tip applicator
nozzle, standing upright, small blister-card-free product. Camera angle:
dead-front-on. Composition: centered. Lighting: soft studio light, glossy
plastic highlight along the tube body. Perspective: flat front elevation.
Padding: ≥15% margin, tube fills ~30-40% of frame width (small item — don't
over-enlarge to compensate). Transparent background: yes. Style:
photorealistic 3D product render, glossy plastic.

### 11. Funnels (`custom:funnels`)
Object: a single plastic funnel, cone body with a narrow spout, resting
upright on its wide rim. Camera angle: dead-front-on. Composition:
centered, spout pointing down. Lighting: soft studio light, translucent/
semi-gloss plastic highlight along the cone's rim. Perspective: flat front
elevation. Padding: ≥15% margin, funnel fills ~45-55% of frame width.
Transparent background: yes. Style: photorealistic 3D product render,
semi-translucent plastic material.

---

## Acceptance checklist (apply to every asset above before it enters `assets/item-icons/`)

- ✓ Immediately recognizable as the correct real-world object at a glance
- ✓ Centered horizontally, ≥15% margin on every side, not cropped
- ✓ Genuinely transparent background (real alpha channel, not white/checkerboard)
- ✓ Matches existing Stokit assets' render style (photorealistic 3D product render, not flat/emoji-style)
- ✓ Consistent scale/weight relative to the other 10 Phase 1 assets and the 17 shipped assets
- ✓ Dead-front-on camera angle, no unintended tilt or 3/4 rotation
- ✓ Single soft grounding drop shadow only — no secondary shadows, no shadow past canvas edge
- ✓ No outline or stroke around the object
- ✓ No real/legible brand name, logo, or trademarked packaging design
- ✓ No extraneous label text beyond one generic fake wordmark (or no label at all for produce like Dates)
- ✓ No watermark
- ✓ 1024×1024 px, PNG, RGBA
- ✓ Legible/recognizable silhouette when previewed at small size (`ItemIcon.tsx` renders at `size * 0.6`)
- ✓ Distinguishable from visually adjacent Phase 1 items by shape/color, not color alone (esp. Office tape vs. Duct tape)
- ✓ Filename and icon string match the naming convention in the table above exactly

---

## Filename / resolver-convention verification (Task 4)

Confirmed against `scripts/generate-asset-map.ts` (globs `assets/item-icons/*.png`
and `assets/custom-emojis/*.png`, derives the key from the filename minus
`.png`) and `constants/itemAssetResolver.ts` (`resolveIconString` parses any
`custom:<key>` string via the generated map):

| Required filename | Matches resolver convention? |
|---|---|
| `vegetable_oil.png` | ✓ |
| `chips.png` | ✓ |
| `office_tape.png` | ✓ |
| `staples.png` | ✓ |
| `duct_tape.png` | ✓ |
| `zip_ties.png` | ✓ |
| `dates.png` | ✓ |
| `sandpaper.png` | ✓ |
| `caulk.png` | ✓ |
| `superglue.png` | ✓ |
| `funnels.png` | ✓ |

**Conflict resolved:** the mission brief's own filename example
(`vegetable-oil.webp`, kebab-case, `.webp`) does not match either the
already-shipped convention or what the generator actually scans for
(`*.png` only — a `.webp` file would be silently ignored, not erroring,
which would look like a "missing asset" bug rather than a naming mistake). This
plan uses `snake_case.png` throughout, consistent with all 17 shipped
assets, `ITEM_ASSET_BACKLOG.md`, and `STOKIT_ASSET_STYLE_GUIDE.md §11`. Flag
for confirmation before Phase 2 if `.webp` was actually intended going
forward — that would require a generator-script change (extension glob) and
an `<Image>`/Metro compatibility check, which is out of scope for this
docs-only phase.

