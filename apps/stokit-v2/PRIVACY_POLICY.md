# Privacy Policy — Stokit

**Effective date:** July 15, 2026
**App name:** Stokit  
**Developer:** Abdul Adil
**Contact:** qadeeradil14@gmail.com

---

## Overview

Stokit is a household pantry manager and shopping assistant. This policy describes exactly what data Stokit collects, how it is used, where it is stored, and how you can delete it. We collect only the minimum data required for the app to function.

---

## 1. Data We Collect

### 1.1 Account Information

When you create an account you provide:

- **Email address** — used for authentication, email verification, and password reset.
- **Password** — never stored by Stokit. Managed entirely by Supabase Auth (bcrypt-hashed server-side).
- **Display name** — the name shown to other members of your household (e.g. "Alex"). You choose this inside the app. It is not collected at sign-up.

Your Supabase user ID (a random UUID) is generated automatically when you sign up.

**Guest mode:** Stokit supports a guest mode. In guest mode, no account or household data is uploaded to Stokit cloud storage. If recipe suggestions are displayed, pantry ingredient names may be sent to TheMealDB to retrieve matching recipes. No account identifier is included with those requests.

### 1.2 Pantry and Shopping Data

Everything you add to your pantry, shopping list, stores list, and shopping trips is stored:

- **On your device** (AsyncStorage / local file system) as the primary, always-available copy.
- **In Supabase** (your household's cloud snapshot table) so data syncs across your devices and shared household members in real time.

This includes:

- Pantry items: name, quantity, unit, status (stocked / low), storage location (fridge / pantry / etc.), expiry date (optional), store assignment.
- Stores you have added: name, optional coordinates (latitude / longitude), Google Places ID (if you searched via Google Places), address, opening hours.
- Shopping trips: items bought, stores visited, amounts spent (if you choose to log them), trip timestamps.
- Price history: item name, store, price paid, timestamp. Recorded when you complete a shopping trip that includes receipt data.
- Activity feed: brief event log (e.g. "Alex bought milk") for household awareness. Stored locally and synced to your household snapshot.
- Household preferences: household name, default unit, weekly budget (optional), expiry alert window.

### 1.3 Receipt Photos and Scanned Data

If you take or attach a photo of a receipt:

- The **photo** is saved locally on your device in the app's private document directory (`receipts/`). Camera and photo-library access may also be used when you explicitly choose to create or replace a profile photo.
- The photo is also **uploaded to Supabase Storage** (a private bucket named `receipts`) keyed to your household ID. Only members of your household can access it via a time-limited signed URL.
- If the **AI receipt scan** feature is enabled, the image is sent as a base64-encoded string to a Supabase Edge Function (`scan-receipt`). That function calls an OpenAI-compatible vision service and returns structured line-item data (store name, date, items, prices). **The scan endpoint processes the image only to return receipt data. Stokit does not intentionally store a separate copy of the image in that endpoint beyond the request.**
- If the **OCR total extraction** feature is enabled (via ocr.space or Google Cloud Vision), the image is sent to the respective provider's API to extract a dollar total. Neither provider receives identifying account information along with the image.

Receipt scan is strictly opt-in. If no scan keys are configured, tapping "Scan receipt" is a no-op and no image is transmitted.

### 1.4 Location Data

Location is used only if you opt in to the store-arrival notification feature or when you search for nearby stores.

| Use case | When collected | What is shared |
|---|---|---|
| Find nearby stores | When you tap "Find nearby stores" in Add Store | Coordinates sent to Google Places API, Geoapify, or OpenStreetMap (Overpass / Nominatim) — see §4. |
| Store-arrival alerts | Only if you grant "Always Allow" location permission and geofencing is started | iOS/Android geofence events processed entirely on-device. Your coordinates are never sent to Stokit servers. |

**Geofencing:** The app registers circular regions (100 m radius) around stores you have added with coordinates. When your device enters a region, a local notification is fired. The detection happens entirely in an on-device background task (`STOKIT_V2_GEOFENCE`). Your location coordinates are not transmitted to Stokit or any third party during geofence events.

Location access is never required to use Stokit. If you decline location permission, all features except nearby-store search and arrival notifications remain fully functional.

### 1.5 Push Notifications

If you allow notifications:

- Your **Expo push token** is stored in the `household_members` table in Supabase, associated with your user ID and household ID.
- The token is used only to deliver one type of notification: a **"Shopping alert"** sent by a household member to tell you they are at a store. The token is never used for marketing.
- Notifications are delivered through **Expo's push notification infrastructure**, which relays to Apple APNs or Google FCM. Expo and Apple or Google process the push token and notification payload according to their own privacy policies. Stokit does not use push tokens for advertising or tracking.

### 1.6 Recipe Suggestions

The Pantry home screen suggests recipes based on items currently in your pantry. Recipe data is fetched from **TheMealDB** (`www.themealdb.com`), a free public API. The request sends only ingredient keywords — no account information, no device identifiers.

### 1.7 Data We Do NOT Collect

- We do not collect device advertising identifiers (IDFA / GAID).
- We do not collect behavioral analytics or usage telemetry.
- We do not use any crash-reporting service (no Sentry, Crashlytics, or equivalent).
- We do not collect contact lists, microphone audio, or biometric data.
- We do not share data with advertisers.

---

## 2. Household Sharing

Stokit supports shared households. When you join a shared household via an invite code:

- Your **display name** and optional profile photo are visible to other members of that household. Your Expo push token is associated with your membership for notification delivery but is not displayed in the app.
- Your **pantry data, shopping history, and receipts** are shared with all members of the household in real time.
- The **household owner** can see member display names and remove members. Members cannot see each other's email addresses.

If you leave a household, your data is no longer synced to or from that household's cloud snapshot.

---

## 3. Local Storage

Stokit stores the following on your device:

| Key / location | Contents |
|---|---|
| `AsyncStorage` (`stokit:v2:durable`) | Your full pantry state: items, stores, trips, receipts metadata, price history, prefs |
| `AsyncStorage` (`stokit:v2:session-backup`) | Supabase auth tokens (session backup — prevents sign-out on offline token refresh failures) |
| `AsyncStorage` (`stokit:v2:household`) | Household identity and member list |
| `AsyncStorage` (`stokit:v2:notification:log`) | Last 50 notification delivery events (local diagnostics only) |
| `AsyncStorage` (`stokit:v2:onboarding:*`) | Flags for one-time onboarding prompts |
| App document directory (`receipts/`) | Receipt photos you have attached |

None of this local data is shared with third parties except as described in this policy.

---

## 4. Third-Party Services

| Service | Purpose | Data sent | Privacy policy |
|---|---|---|---|
| **Supabase** | Authentication, cloud sync, storage, Edge Functions | Email (auth), pantry snapshot, receipt images, push tokens | https://supabase.com/privacy |
| **Expo (EAS / Push)** | Over-the-air app updates, push notification relay | App bundle checksums; push tokens (relayed to APNs/FCM) | https://expo.dev/privacy |
| **Google Places API** | Store search and autocomplete (when Google key is configured) | Coordinates or store name query | https://policies.google.com/privacy |
| **Google Cloud Vision** | Receipt OCR (when Google key is configured) | Receipt image (base64) | https://policies.google.com/privacy |
| **Geoapify** | Store search fallback (when Geoapify key is configured) | Coordinates | https://www.geoapify.com/privacy-policy |
| **OpenStreetMap (Overpass / Nominatim)** | Store search fallback (no key required) | Coordinates or store name query | https://osmfoundation.org/wiki/Privacy_Policy |
| **ocr.space** | Receipt total OCR (when ocr.space key is configured) | Receipt image | https://ocr.space/privacypolicy |
| **OpenAI (via Supabase Edge Function)** | AI receipt line-item scan (when scan endpoint is configured) | Receipt image (base64, proxied through your Supabase project) | https://openai.com/policies/privacy-policy |
| **TheMealDB** | Recipe suggestions | Ingredient keyword strings | https://www.themealdb.com |
| **Apple APNs / Google FCM** | Push notification delivery | Push token + notification payload | Apple / Google standard policies |

> **Note on Google API key:** As of OTA 278, no Google API key is hard-coded in the app binary. All API keys are injected at build time via EAS environment variables and are absent when not configured.

---

## 5. Data Retention

- **Account and cloud database records:** retained until you delete your account (see §6). Supabase may retain backup copies for up to 30 days after deletion in accordance with its own retention policy.
- **Receipt images:** retained in Supabase Storage until you delete your account or manually delete individual receipts.
- **Local device data:** retained until you delete the app or delete your account. Deleting the app removes all AsyncStorage and document-directory data on iOS.
- **Notification log:** kept only in AsyncStorage, maximum 50 entries, never transmitted.

---

## 6. Account Deletion

You can delete your account at any time from **Settings → Account → Delete Account**.

When you delete your account:

1. A Supabase Edge Function (`delete-account`) permanently deletes your auth user record server-side.
2. All local app data (pantry state, household identity, session) is wiped from the device.
3. All receipt photos stored on the device are deleted.
4. Your personal household database records and membership are removed. If you are a non-owner member of a shared household, the shared household data remains available to its other members.
5. Your push token is removed with your household membership.

Profile images and receipt images belonging to a personal or sole-member household are deleted from Supabase Storage before the account is removed. Receipt images that remain shared with another household are retained for that household. You may request deletion confirmation at **qadeeradil14@gmail.com**.

**Household owners:** You cannot delete your account while other members remain in your shared household. You must transfer ownership or remove all members first.

---

## 7. Your Rights

Depending on where you live, you may have rights to:

- **Access** — request a copy of the data we hold about you.
- **Correction** — update inaccurate information (your display name can be changed at any time in Settings).
- **Deletion** — delete your account and all associated data (see §6).
- **Portability** — request your pantry data in a machine-readable format.

To exercise any of these rights, contact us at **qadeeradil14@gmail.com**.

California residents: we do not sell personal data as defined under the CCPA.

EU/EEA residents: our legal basis for processing is contract performance (providing the app service) and legitimate interest (security, debugging). Supabase processes data in accordance with GDPR. See Supabase's Data Processing Agreement at https://supabase.com/legal/dpa.

---

## 8. Children

Stokit is not directed at children under 13 (US) or under 16 (EU/EEA). We do not knowingly collect personal information from children. If you believe a child has created an account, contact us and we will delete it promptly.

---

## 9. Security

- All data in transit uses TLS/HTTPS.
- Authentication tokens are stored in AsyncStorage with a local-scope session backup. Passwords are never stored on-device.
- Supabase row-level security (RLS) policies ensure household data is accessible only to authenticated members of the correct household.
- Receipt images in Supabase Storage are served only via time-limited signed URLs (7-day TTL).

---

## 10. Changes to This Policy

If we make material changes, we will update the effective date and, where feasible, notify you via the app. Continued use of the app after changes constitutes acceptance.

---

## 11. Contact

For privacy questions or data requests:

**Email:** qadeeradil14@gmail.com
**GitHub:** https://github.com/qadeeradil14-alt/pantrypal
