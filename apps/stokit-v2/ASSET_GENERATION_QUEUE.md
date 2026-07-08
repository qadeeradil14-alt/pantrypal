# Asset Generation Queue — Phase 1

Batching rationale: group by object complexity and collision risk, not
alphabetically — simplest single-object hardware items first to validate
the pipeline end-to-end on low-risk assets, then packaging-driven items,
then the two items requiring the most care (Office tape vs. Duct tape must
stay visually distinct; Dates uses a different render approach — no
packaging — than the other 10).

## Batch 1 — simple single-object hardware (validate pipeline first)
- Funnels (`custom:funnels`)
- Superglue (`custom:superglue`)
- Caulk (`custom:caulk`)
- Sandpaper (`custom:sandpaper`)

## Batch 2 — packaged goods
- Vegetable oil (`custom:vegetable_oil`)
- Chips (`custom:chips`)
- Staples (`custom:staples`)
- Zip ties (`custom:zip_ties`)

## Batch 3 — highest care (disambiguation + non-packaged item)
- Office tape (`custom:office_tape`) — must read as distinct from Duct tape
- Duct tape (`custom:duct_tape`) — must read as distinct from Office tape
- Dates (`custom:dates`) — food render, no packaging/label at all

## Time estimates

| Stage | Per asset | Per batch (4 assets) | Phase 1 total (11 assets) |
|---|---|---|---|
| Generation (prompt run + re-rolls to match style guide) | 10-15 min | 45-60 min | ~2-2.5 hrs |
| Review (against acceptance checklist) | 5 min | 20 min | ~1 hr |
| QA (side-by-side vs. style guide + existing 17 assets, small-size legibility check) | 5-10 min | 30-40 min | ~1-1.5 hrs |
| Implementation (place file, `npm run assets:generate`, flip catalog icon field, typecheck, retest) | ~5 min/asset, batched ~15 min/batch | 15 min | ~45 min |

**Estimated total Phase 1 duration: ~5-6 hours** of hands-on work across
generation, review, QA, and implementation (excludes any AI-generation queue
wait time, which depends on the tool used and isn't estimated here).

Implementation is intentionally batched (regenerate once per batch, not once
per asset) to avoid redundant `npm run assets:generate` + typecheck cycles.
