# Design System — PantryPal

## Product Context
- **What this is:** A household pantry and grocery management app — track what you have, what's running low, and what to buy.
- **Who it's for:** Home cooks and households (couples, families) who share a kitchen and want to stay coordinated without friction.
- **Space/industry:** Grocery / household management. Every competitor (Cozi, AnyList, OurGroceries, Instacart) uses blue/green utility aesthetics — functional, forgettable.
- **Project type:** Mobile app (React Native / Expo, iOS + Android)
- **Memorable thing:** "The pantry app you're proud to show at dinner."

## Aesthetic Direction
- **Direction:** Market Fresh — Bold & Vivid
- **Decoration level:** Minimal (typography and color do all the work — no decorative blobs, gradients, or pattern fills)
- **Mood:** Crisp, confident, high-energy. Tomato-red primary cuts through utility-app grey. White canvas keeps items scannable. Serif headings retain the editorial feel competitors lack.
- **Light-first:** The light palette is the primary experience. Users can toggle to dark in Settings. New installs default to light.

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

### Light Mode (primary experience)
| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#FFFFFF` | App background — pure white |
| `surface` | `#F7F8FC` | Cards, sheets, tab bar |
| `faint` | `#F3F4F6` | Subtle elevated backgrounds |
| `primary` | `#E8432D` | CTA buttons, FAB, active tab, links — tomato red |
| `onPrimary` | `#FFFFFF` | Text/icons on red buttons — white |
| `primarySoft` | `#FDECEA` | Low badge background, tinted areas |
| `ink` | `#111827` | All primary text — near-black |
| `muted` | `#9CA3AF` | Secondary text, placeholders, inactive tabs |
| `border` | `#E5E7EB` | All borders and dividers |
| `success` | `#16A34A` | In-stock status dot — vivid green |
| `warning` | `#D97706` | Running-low status — amber |
| `danger` | `#DC2626` | Out-of-stock, destructive actions |

### Dark Mode (toggle in Settings)
| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#0F1117` | App background — near-black |
| `surface` | `#1A1D27` | Cards, sheets, tab bar |
| `faint` | `#1F2235` | Subtle elevated backgrounds |
| `primary` | `#FF6B52` | CTA buttons, FAB, active tab — brighter tomato for dark bg |
| `onPrimary` | `#FFFFFF` | Text/icons on red buttons |
| `primarySoft` | `#2D1410` | Low badge background, tinted areas |
| `ink` | `#F9FAFB` | All primary text — near-white |
| `muted` | `#6B7280` | Secondary text, placeholders, inactive tabs |
| `border` | `#2D3148` | All borders and dividers |
| `success` | `#34D399` | In-stock status dot — vivid emerald |
| `warning` | `#FBBF24` | Running-low status — amber |
| `danger` | `#F87171` | Out-of-stock, destructive actions |

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
| 2026-05-26 | Adopted Slow Kitchen direction | Dark-first espresso + copper. Every competitor uses blue/green utility. |
| 2026-05-26 | Playfair Display for section headers | "Fridge" as a large italic serif header transforms the screen feel. No grocery app does this. Risk taken deliberately. |
| 2026-06-07 | Pivoted to Market Fresh direction | Light-first tomato red. Bolder, more colorful than copper; retains editorial typography. Dark mode available via Settings toggle. |
| 2026-06-07 | Light-first default | Market Fresh is designed for daylight use. Users who prefer dark can toggle in Settings. |
| 2026-05-26 | Security: webhook secret rotated, parse-receipt ownership check added | See `.gstack/security-reports/2026-05-26-140000.json` |
