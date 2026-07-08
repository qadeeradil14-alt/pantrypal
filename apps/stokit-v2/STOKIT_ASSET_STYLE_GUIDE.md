# Stokit Asset Style Guide v1

Defines the illustration language for every `custom:<key>` item asset in
`assets/custom-emojis/` and `assets/item-icons/`. Grounded in the 17 assets
already shipped (`lotion`, `mustard`, `toothpaste`, `trash_bags`, `ketchup`,
etc.) — this document makes their real, observed conventions explicit and
prescriptive so every future asset reads as if the same designer made it.

This is a rules document, not a mood board. If a new asset doesn't fit a
rule below, fix the asset — don't add an exception.

---

## 1. Visual style

**Photorealistic 3D product render** (commercial e-commerce "hero shot" style) —
not flat illustration, not line art, not emoji-style icons.

- Subject is a fictional-but-realistic product package: bottle, tube, box, bag,
  jar, roll, etc., matching the item's real-world packaging.
- Materials render with real specular behavior: glossy plastic shows bright
  highlights, matte cardboard shows soft diffuse falloff, metal shows sharp
  reflections. Match material to the real object, not a house material.
- Label/branding is present but generic: a bold sans-serif wordmark (never a
  real brand name or logo) and, optionally, a small flat-color or line-art
  icon/graphic and a secondary descriptor line (weight, variant, "original,"
  etc.). Text must be fake or illegible-at-scale — never real trademarked
  copy.
- No scene, no props, no background environment. The product is the entire
  image.

## 2. Perspective

**Locked rule for all new Phase 1+ art: dead-front-on hero shot.**
Camera at the object's vertical midpoint, no tilt, no turn — the same framing
as the existing `lotion.png` and `mustard.png`.

Rationale: the existing 17 assets are inconsistent (`lotion`/`mustard` are
dead-front, `trash_bags` is turned 3/4, `toothpaste` is tilted ~35°). That
inconsistency is legacy debt — it's left as-is on those 17 files, but every
new asset must use the single front-on angle. A fixed camera angle is far
easier to reproduce consistently across ~45 structurally different objects
(bottles, bags, rolls, tools, produce) than trying to force a matching
diagonal tilt onto every object type.

Exception: an item whose identity is only legible from a 3/4 angle (e.g. an
open box showing contents) may deviate, but this must be a deliberate,
documented per-item call — not a default.

## 3. Lighting

Soft, diffuse studio lighting from slightly above and in front of the
object (a large softbox, not a point light). Highlights are soft-edged, not
hard specular points. No colored gels, no dramatic rim lighting, no harsh
top-down light that creates deep facial-style shadows on label text.

Lighting must be consistent enough that label text and logo graphics stay
legible — no highlight blowing out the brand wordmark.

## 4. Shadows

Every asset has exactly one **soft, photographic drop/contact shadow**
directly beneath the object, grounding it as if sitting on an invisible
surface — matching all 17 existing assets. Rules:

- Single shadow only. No secondary cast shadows, no ambient occlusion halos.
- Shadow is soft-edged (heavily blurred), never a hard-edged silhouette.
- Shadow sits under the object's base only — it must not extend to the
  canvas edges or read as a background element.
- Shadow opacity is subtle: it should ground the object, not darken the
  overall composition.

## 5. Outline / stroke thickness

**None.** No outline, no stroke, no cartoon-style edge line around the
object at any thickness. Edges are defined purely by the render's own
lighting/material contrast and by alpha-channel antialiasing. An asset with
a visible outline is a flat-illustration/emoji-style asset and does not
belong in this system — reject and re-render.

## 6. Color palette

**Item-true color, not a fixed app palette.** Packaging colors must match
what the real product's packaging looks like in the real world (e.g.
mustard = yellow bottle / red cap, toothpaste = white tube / blue accent
band, trash bags = blue/yellow box). Do not invent a Stokit brand color and
force every asset through it — the existing 17 assets each use their own
item-appropriate palette, and new assets must follow the same logic.

Guardrails:
- Prefer packaging colors that are common/generic for the real product
  category (e.g. a yellow mustard bottle, not a purple one) so the item is
  recognizable at a glance without reading the label.
- Avoid two visually similar items (e.g. Cinnamon vs. Turmeric spice jars)
  sharing near-identical silhouette + color — vary jar shape, cap color, or
  label color so they stay distinguishable at small render size.

## 7. Transparency

RGBA PNG with a genuinely transparent background (not a flat white or
checkerboard fill) — confirmed on every sampled existing asset (alpha
channel spans the full 0–255 range, i.e. real per-pixel transparency, not a
uniform opaque canvas). Only the product + its drop shadow are opaque;
everything else is alpha 0.

## 8. Canvas size

**1024×1024 px**, square, matching all 17 existing assets exactly. Do not
ship any other resolution — the resolver and render pipeline assume a
single fixed source size and downscale at render time (see Accessibility,
§11).

## 9. Padding

Object (including its shadow) must be inset from the canvas edge — never
crop or touch the edge. Based on measured bounding boxes of existing assets:

- Horizontal: object occupies roughly **38–65%** of canvas width (tall/
  narrow items like bottles sit near the low end; wider items like tubes or
  boxes sit near the high end).
- Vertical: object occupies roughly **70–80%** of canvas height.
- Target for new assets: keep at least **15%** margin on every side at
  minimum, and center the object horizontally. Do not stretch an object to
  fill the full frame just to maximize size — consistent, generous padding
  across all assets matters more than any single asset looking "bigger."

## 10. Export format

- **PNG**, 8-bit per channel, RGBA (alpha channel required).
- No embedded color profile assumptions beyond sRGB.
- Flatten to a single layer; no residual layer/adjustment metadata.
- File size should stay reasonable for bundling (no specific KB ceiling
  enforced today, but avoid uncompressed/lossless exports with unnecessary
  bit depth — standard PNG export from any renderer is sufficient).

## 11. Naming convention

Already established by the codegen pipeline (`scripts/generate-asset-map.ts`,
`ITEM_ASSET_BACKLOG.md`) — restated here for completeness:

- Icon string: `custom:<key>`
- `<key>`: lowercase snake_case of the item name (e.g. `duct_tape`,
  `vegetable_oil`)
- File name: `<key>.png`, placed in `assets/item-icons/` for all new Asset
  Pack v1 art (the older `assets/custom-emojis/` folder holds only the 17
  already-shipped legacy assets and is not used for new work)
- Keys must be globally unique across both source folders — the generator
  throws on collision.

## 12. Accessibility considerations

- **Legibility at small size**: `components/shared/ItemIcon.tsx` renders
  every asset at `size * 0.6` of its container — often quite small (list
  rows, chips). Label text, logo graphics, and fine detail on the package
  must remain readable/recognizable at this reduced scale, not just at full
  1024×1024. When authoring, preview at the actual smallest on-screen render
  size before finalizing.
- **Don't rely on color alone**: items in the same category with similar
  silhouettes (e.g. two spice jars, two cleaning bottles) must be
  distinguishable by shape/label/cap, not only by hue — some users have
  color vision deficiencies, and small renders compress color differences
  further.
- **Silhouette clarity**: the object's outer silhouette (bottle vs. box vs.
  bag vs. tube) should be identifiable even if all label text is illegible
  at minimum render size — silhouette is the fastest recognition cue at a
  glance.
- **Consistent shadow/ground plane**: keeping the single soft drop shadow on
  every asset (§4) gives every icon the same visual "weight," so no single
  asset looks like it's floating or rendered at a different scale than its
  neighbors in a grid/list.

## 13. Examples of good vs. bad assets

**Good** (already shipped, use as reference):
- `assets/custom-emojis/lotion.png` — dead-front-on bottle, soft grounding
  shadow, glossy plastic highlight, legible generic wordmark, transparent
  background, generous padding. This is the target quality bar.
- `assets/custom-emojis/mustard.png` — same front-on convention, item-true
  yellow/red palette, correct real-world silhouette (squeeze bottle with
  flip cap).

**Acceptable but legacy-inconsistent** (do not use as a perspective
reference for new work):
- `assets/custom-emojis/toothpaste.png` — good render quality, but the
  ~35° tilt breaks the new front-on rule. Left as-is; not retroactively
  fixed.
- `assets/custom-emojis/trash_bags.png` — 3/4 turned angle showing the box
  flap open; same legacy-perspective issue.

**Bad** (reject if a new asset looks like this — described in prose since no
artwork is being generated in this pass):
- Flat vector/emoji-style icon with a visible outline stroke — wrong style
  entirely (violates §1 and §5).
- Object rendered with a hard-edged drop shadow or no shadow at all
  (violates §4) — reads as flat/pasted-on rather than grounded.
- Opaque white or checkerboard-filled background instead of real alpha
  transparency (violates §7).
- Object cropped at or touching the canvas edge, or shrunk to a tiny fraction
  of the frame with excessive empty padding (violates §9).
- Real/recognizable brand name, logo, or trademarked packaging design
  reproduced on the label (violates the generic-branding rule in §1) —
  legal/IP risk, not just a style miss.
- Off-angle/tilted perspective on a newly authored asset when the item has
  no legibility reason to deviate from the front-on standard (violates §2).
- Label text or icon detail that becomes an illegible blur at the actual
  small on-screen render size, even though it looks fine at full
  1024×1024 (violates §12).
- Two similar items (e.g. two spice jars) rendered so similarly in
  silhouette and color that they're indistinguishable in a list at a glance
  (violates §6 and §12).

---

## Status

This document defines the language only. No artwork has been sourced or
generated as part of writing this guide, and no OTA update accompanies it.
Phase 1 authoring (see `ITEM_ASSET_BACKLOG.md`) should treat every rule
above as a checklist before an asset is accepted into `assets/item-icons/`.
