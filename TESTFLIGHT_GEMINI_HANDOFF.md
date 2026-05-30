# TestFlight / App Store Connect Handoff

This file is a step-by-step handoff for another agent to help finish the Stokit TestFlight setup.

## Current App Details

- App name: `Stokit`
- Expo slug: `PantryPal`
- iOS bundle identifier: `com.hewadadil.pantrypal`
- App Store Connect app ID: `6774653348`
- EAS project ID: `3d19b1e1-1003-4e33-8929-2d27e7fd7f3c`
- Apple/App Store Connect page: `Stokit > TestFlight`
- Support URL: `https://support-site-xi.vercel.app`
- Privacy Policy URL: `https://support-site-xi.vercel.app`
- Support email / feedback email: `qadeeradil14@gmail.com`
- TestFlight contact phone: `2028138351`

## Important Safety Rules

1. Do not ask for or store the Apple ID password, 2FA code, app-specific password, API keys, certificates, or private keys.
2. When Apple, Expo, or EAS prompts for credentials, stop and ask the user to type them directly.
3. Do not delete or revoke existing Apple certificates, provisioning profiles, App IDs, or EAS credentials unless the user explicitly approves.
4. Do not submit for external TestFlight review, App Review, or production release without a final user confirmation.
5. Internal TestFlight testing is okay to prepare, but still confirm before adding real users or sending invites.

## Repository Setup

Work from:

```bash
/Users/hewadadil/Documents/PantryPal
```

Useful config files:

- `app.json`
- `eas.json`
- `package.json`
- `support-site/index.html`

Before starting, confirm these commands pass or have already passed:

```bash
npx expo install --check
npx tsc --noEmit
```

Known previous status:

- `expo install --check` passed.
- `tsc --noEmit` passed.
- `graphify update .` passed.
- The support site was deployed and aliased to `https://support-site-xi.vercel.app`.
- TestFlight currently had no builds available.
- A previous non-interactive EAS iOS build failed because iOS credentials require interactive setup.
- EAS remote iOS build number was incremented from `2` to `3` during that failed attempt.

## Step 1: Start the iOS Production Build

Run:

```bash
npx eas-cli build --platform ios --profile production
```

If prompted to log in to Expo or Apple, have the user complete the prompt directly.

If EAS asks to set up or validate iOS credentials, use the normal managed EAS flow unless there is a clear reason not to:

- Let EAS manage credentials.
- Let EAS create or repair provisioning profiles if needed.
- Do not revoke/delete anything without asking the user first.

If EAS asks whether to reuse existing credentials, prefer reusing valid existing credentials.

Wait until the build is queued and completed. If it gives a build URL, keep it for reference.

## Step 2: Submit or Upload the Build

If EAS build completes and offers submission, use:

```bash
npx eas-cli submit --platform ios --profile production
```

The `eas.json` production submit profile already contains:

```json
{
  "ios": {
    "ascAppId": "6774653348"
  }
}
```

If Apple credentials are requested, stop and have the user enter them.

If submission succeeds, wait for Apple processing. Processing may take several minutes.

## Step 3: Open App Store Connect

Go to:

```text
https://appstoreconnect.apple.com
```

Open:

```text
Apps > Stokit > TestFlight
```

Confirm the new build appears. If it says processing, wait and refresh later.

## Step 4: Fill TestFlight Test Information

Use these values:

- Beta App Description:

```text
Stokit helps households track pantry items, shared grocery lists, receipts, store reminders, and grocery spending.
```

- Feedback Email:

```text
qadeeradil14@gmail.com
```

- Marketing URL:

```text

```

Leave Marketing URL blank unless App Store Connect requires it.

- Privacy Policy URL:

```text
https://support-site-xi.vercel.app
```

## Step 5: Fill Beta App Review Contact Information

Use:

- First Name:

```text
Hewad
```

- Last Name:

```text
Adil
```

- Phone:

```text
2028138351
```

- Email:

```text
qadeeradil14@gmail.com
```

If the name should be different, ask the user before changing it.

## Step 6: Fill App Review Notes

Use:

```text
Create a free account from the Sign Up screen to test the app. No additional setup or credentials are required.
```

If Apple asks for a demo account and the app supports free sign-up, state that reviewers can create a free account from the Sign Up screen.

## Step 7: Export Compliance

The app config has:

```json
"ITSAppUsesNonExemptEncryption": false
```

If Apple asks whether the app uses encryption, answer consistently with that setting:

- The app does not use non-exempt encryption.
- It uses standard platform/network encryption only, if applicable.

Do not claim custom encryption unless the codebase clearly implements it.

## Step 8: App Privacy Questions

If App Store Connect asks for privacy details, use conservative answers based on the app features:

Likely collected/used data categories:

- Contact info: email address, if users create accounts.
- User content: pantry items, grocery list items, receipts, and uploaded receipt images.
- Location: used for store arrival reminders.
- Identifiers: user ID/account identifier through the backend auth provider.

Likely not collected:

- Health and fitness.
- Financial info beyond grocery spending/receipt amounts entered by the user.
- Contacts.
- Browsing history.
- Search history.
- Sensitive info.

Data use:

- App functionality.
- Account management.
- User support.

Tracking:

- Do not mark data as used for tracking unless the app integrates third-party advertising, cross-app tracking, or data brokers. From the current repo context, assume no tracking.

If unsure, stop and ask the user rather than guessing.

## Step 9: Internal Testing

After the build is processed:

1. Create an internal tester group if none exists.
2. Add the user’s Apple ID or selected internal testers only after confirmation.
3. Attach the processed build to the internal testing group.
4. Save changes.

Internal testing does not require Beta App Review, but Apple may still require Test Information fields.

## Step 10: External Testing

Before submitting for external Beta App Review:

1. Confirm all Test Information fields are complete.
2. Confirm export compliance is complete.
3. Confirm App Privacy is complete if required.
4. Confirm the build launches and basic sign-up works if possible.
5. Ask the user for explicit approval before clicking any button like:
   - `Submit for Review`
   - `Submit Beta App Review`
   - `Submit to App Review`

## Final Expected Outcome

The desired outcome is:

- An iOS production build is uploaded to App Store Connect.
- The build appears under `Stokit > TestFlight`.
- Test Information is filled.
- Export compliance is answered.
- Internal testing is ready or enabled.
- External TestFlight review is submitted only after explicit user approval.
