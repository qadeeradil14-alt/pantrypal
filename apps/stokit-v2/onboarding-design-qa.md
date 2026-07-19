# Stokit onboarding visual QA

## Source

- Reference: `/var/folders/xb/xnwqkg_x0vbdgbtgvnvgmzzh0000gn/T/codex-clipboard-8dee65b4-ccf1-4f7a-9381-7e245135e52a.png`
- Target: main Stokit app onboarding, three pages

## Implementation evidence

- Viewport: iPhone 17 Pro simulator, portrait, 1206 x 2622
- Page 1: `/tmp/stokit-onboarding-final-slide1.png`
- Page 2: `/tmp/stokit-onboarding-final-slide2.png`
- Page 3: `/tmp/stokit-onboarding-final-slide3.png`
- Combined source/implementation comparison: `/tmp/stokit-onboarding-comparison.png`
- Theme verified: dark; the same layout uses the paired light artwork and light palette

## Comparison

- Brand, page count, and Skip placement match the reference hierarchy.
- Artwork is centered, dominant, uncropped, and scaled independently per page.
- Headline wording, line breaks, serif italic treatment, and centered alignment match.
- Supporting copy now uses the exact two-line breaks from the reference.
- Page dots and round forward/complete controls remain anchored at the bottom.
- The final page omits Skip and uses the completion checkmark.
- The floating gear visible in simulator captures is Expo development tooling and is absent from production builds.

## Verification

- TypeScript: passed
- Unit tests: 378 passed
- Expo iOS export: passed
- Result: passed
