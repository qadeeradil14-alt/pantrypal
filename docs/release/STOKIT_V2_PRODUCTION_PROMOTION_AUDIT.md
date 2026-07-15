# Stokit V2 Production Promotion Audit

Audit scope: read-only comparison of the certified redesign baseline with current production configuration. No production, Supabase, credential, or entitlement change is authorized by this document.

## Identity and release configuration

| Area | Production configuration | Redesign configuration | Promotion decision required |
| --- | --- | --- | --- |
| App name | `Stokit` | `Stokit Redesign` | Decide final public name. |
| Bundle ID | `com.hewadadil.pantrypal` | `com.hewadadil.stokit.redesign` | Different identifiers mean a separate iOS app, not an in-place V1 upgrade. |
| URL scheme | `pantrypal` | `stokitredesign` | Verify all supported deep links and external callbacks for the chosen identity. |
| EAS project | `3d19b1e1-1003-4e33-8929-2d27e7fd7f3c` | Same project | Preserve channel isolation during promotion. |
| Channel | `production` | `shopping-redesign-test` | A new approved production release path is required; do not repoint the test channel. |
| Runtime | App-version policy; current production and redesign records are `1.0.0` | App-version policy; certified runtime `1.0.0` | Confirm the native binary selected for promotion exposes the intended runtime. |
| Current Store build | Production profile, build 48 | Redesign TestFlight profile, build 117 | Verify the target App Store Connect application before submission. |

## Native identifiers and entitlements

| Area | Production configuration | Redesign configuration | Audit status |
| --- | --- | --- | --- |
| App Group | Widget plugin declares `group.com.hewadadil.pantrypal` | `group.com.hewadadil.stokit.redesign` | Confirm generated native entitlements and Apple Developer group membership in a clean prebuild/native build. |
| Widget bundle | `com.hewadadil.pantrypal.widgets` | `com.hewadadil.stokit.redesign.widgets` | Separate widget identity requires a deliberate migration or replacement plan. |
| APNs credentials | Not stored in source | Not stored in source | Validate the APNs key/certificate, topic, environment, and team assignment for the exact production bundle in Apple Developer/EAS credentials. |
| Apple team | `4AJ8TH5QF7` in app configuration | Same team in app configuration | Confirm the intended App ID, groups, push capability, and provisioning profiles exist under this team. |
| Deep links | Production scheme and production bundle | Redesign scheme and redesign bundle | Exercise auth, invite, notification, and maps links for the chosen release identity. |
| Tablet support | `supportsTablet: false` in source | Same base setting | Confirm intended iPad distribution and layout policy before App Store submission. |

## Services and data

| Area | Production configuration | Redesign configuration | Promotion decision required |
| --- | --- | --- | --- |
| Supabase | Production environment variables include the production Supabase URL and anon key | Preview environment variables include Supabase URL and anon key | Verify the exact intended backend and data-isolation strategy without exposing or changing secrets. |
| Places providers | Production has Google and Geoapify public configuration | Preview has Google public configuration | Confirm feature parity, billing restrictions, and allowed bundle IDs for production. |
| Receipt scan | Production has a configured receipt-scan function URL | Review required before promotion | Verify endpoint, authorization, and privacy disclosures. |
| Push tokens | Production and redesign use different app topics because bundle IDs differ | Separate token registration expected | Existing tokens cannot be assumed transferable across bundle identities. |

## TestFlight, App Store, and V1 upgrade path

- The production submit profile references App Store Connect application ID `6774653348`; confirm this is the intended destination before any submission.
- The redesign Store build is associated with its own redesign TestFlight identity and must be verified in App Store Connect and Apple Developer before it can replace or become the public app.
- Because the bundle identifiers differ, users cannot receive redesign as a normal App Store update to the V1 application. Choose and document one approved path: preserve V1, create a separate V2 app with a guided migration, or build a native production binary under the V1 identifier after a dedicated entitlement/data-migration review.
- Test the selected path with a populated V1 household. Confirm authentication, household membership, stored data, push permissions, widgets, deep links, and receipts behave as documented.

## Required evidence before approval

1. Resolved Expo configuration and generated iOS entitlements for the exact release binary.
2. Apple Developer confirmation of App ID, App Groups, widget ID, push capability, and provisioning profile.
3. EAS credentials confirmation for the selected production bundle and APNs topic.
4. App Store Connect confirmation of the target app record, TestFlight group, metadata, privacy answers, screenshots, and review details.
5. A written V1 upgrade or coexistence plan, tested on populated iPhone and iPad devices.
6. Physical-device certification of the approved native build, including fresh install, force-close/reopen, notification, deep link, and recovery flows.
