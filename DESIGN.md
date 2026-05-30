# Design System — PantryPal

## Product Context
- **What this is:** A household pantry and grocery management app — track what you have, what's running low, and what to buy.
- **Who it's for:** Home cooks and households (couples, families) who share a kitchen and want to stay coordinated without friction.
- **Space/industry:** Grocery / household management. Every competitor (Cozi, AnyList, OurGroceries, Instacart) uses blue/green utility aesthetics — functional, forgettable.
- **Project type:** Mobile app (React Native / Expo, iOS + Android)
- **Memorable thing:** "The pantry app you're proud to show at dinner."

## Aesthetic Direction
- **Direction:** Slow Kitchen — Warm Editorial
- **Decoration level:** Minimal (typography and color do all the work — no decorative blobs, gradients, or pattern fills)
- **Mood:** Espresso-dark, copper-warm. The app feels like Sunday morning light through a kitchen window. Domestic and considered, not clinical or e-commerce. The kind of app that fits beside a copy of Smitten Kitchen on the counter.
- **Dark-first:** The dark palette is the primary experience. Users can toggle to light in Settings. New installs default to dark.

## Typography

All fonts are loaded via Google Fonts (free). No custom font files to bundle.

- **Display / Section headers:** Playfair Display (400–800, with italic)
  - Used for: screen titles ("Home", "Shopping"), category section headers ("Fridge", "Pantry", "Freezer"), receipt store names, modal headings
  - The word "Fridge" in a 22px bold italic serif changes the entire feeling of the screen — nobody in this category does this
  - Loading: `@expo-google-fonts/playfair-display`
- **Body / UI / Buttons / Item names:** DM Sans (300, 400, 500, 600)
  - Used for: all item names, body copy, button labels, form inputs, tab labels, all prose UI text
  - Loading: `@expo-google-fonts/dm-sans`
- **Data / Quantities / Prices / Dates / Metadata:** DM Mono (400, 500)
  - Used for: item quantities, receipt prices, item counts ("12 items · 3 low"), dates, all numeric metadata
  - Always use `fontVariant: ['tabular-nums']` for aligned columns
  - Loading: `@expo-google-fonts/dm-mono`

### Type Scale
| Role | Font | Size | Weight | Notes |
|------|------|------|--------|-------|
| Page title (nav) | Playfair Display | 26px | 700 italic | "Home", "Shopping" |
| Section header | Playfair Display | 22px | 700 italic | "Fridge", "Pantry" |
| Modal / receipt title | Playfair Display | 20–22px | 700 italic | Store name, modal heading |
| Item name | DM Sans | 14–16px | 500 | Primary list content |
| Body / subtitle | DM Sans | 14–15px | 400 | Descriptions, subtitles |
| Label / button | DM Sans | 13–14px | 600 | Buttons, tab labels, form labels |
| Metadata | DM Mono | 11–13px | 400 | Qty, price, date, count |
| Caption | DM Sans | 11–12px | 400 | Secondary metadata |

## Color

### Dark Mode (primary experience)
| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#1C1812` | App background — espresso |
| `surface` | `#271F19` | Cards, sheets, tab bar |
| `faint` | `#2A2018` | Subtle elevated backgrounds |
| `primary` | `#D4874E` | CTA buttons, FAB, active tab, links, receipt totals — copper |
| `onPrimary` | `#1C1812` | Text/icons on copper buttons — espresso (6.2:1, replaces white) |
| `primarySoft` | `#2A1A0A` | Low badge background, warning soft |
| `ink` | `#F0E8DC` | All primary text — cream |
| `muted` | `#9E8770` | Secondary text, placeholders, inactive tabs (lightened for 4.5:1) |
| `border` | `#3A2E24` | All borders and dividers |
| `success` | `#5A9E70` | In-stock status dot |
| `warning` | `#D4874E` | Running-low status (same as primary — copper means "pay attention") |
| `danger` | `#C05050` | Out-of-stock, destructive actions |

### Light Mode (toggle in Settings)
| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#F5EFE6` | Warm off-white |
| `surface` | `#FFFBF5` | Cards, sheets |
| `primary` | `#C07038` | CTA buttons, FAB, active tab — darker copper for contrast |
| `onPrimary` | `#221A12` | Text/icons on copper buttons — espresso (4.6:1, replaces white) |
| `ink` | `#221A12` | Primary text |
| `muted` | `#907660` | Secondary text |
| `border` | `#D8CABC` | Borders and dividers |
| `success` | `#3D6B4F` | In-stock (forest green) |
| `warning` | `#C07038` | Running low (copper) |
| `danger` | `#A03030` | Destructive / out of stock |

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable (56px item row height vs. standard 44px — items breathe)
- **Scale:** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64

## Layout
- **Approach:** Grid-disciplined — strict 16px horizontal margins, predictable alignment
- **Item row height:** 56px (paddingVertical: 14 on each side + content)
- **Card radius:** `radii.lg = 20px` for cards, `radii.md = 14px` for inner elements, `radii.sm = 10px` for small chips
- **Max content width:** Full-bleed (mobile-first, no max-width needed)

## Motion
- **Approach:** Intentional — spring-based enters, ease-in exits, haptic feedback on every meaningful interaction
- **FAB:** Scale-down on press. Pulse ring radiates from the FAB while the pantry is empty (draws the eye to "add your first item").
- **Swipe actions:** Friction: 2, no overshoot
- **Sheet / modal:** Default React Native spring

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-26 | Adopted Slow Kitchen direction | Dark-first espresso + copper. Every competitor uses blue/green utility. Copper + cream stands apart and fits domestic/warm positioning. |
| 2026-05-26 | Playfair Display for section headers | "Fridge" as a large italic serif header transforms the screen feel. No grocery app does this. Risk taken deliberately. |
| 2026-05-26 | Copper (`#D4874E`) doubles as warning color | Low items and primary actions share copper — "pay attention" is the right mood for both. Simplifies the palette. |
| 2026-05-26 | Dark-first default | Slow Kitchen is designed dark. Users who prefer light can toggle in Settings. |
| 2026-05-26 | Security: webhook secret rotated, parse-receipt ownership check added | See `.gstack/security-reports/2026-05-26-140000.json` |
