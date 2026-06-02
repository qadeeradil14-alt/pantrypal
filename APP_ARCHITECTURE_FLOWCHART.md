# Stokit App Architecture Flowchart

```mermaid
flowchart TD
    Code["App Code<br/>React Native + Expo"] --> GitHub["GitHub<br/>Stores source code"]
    GitHub --> EAS["EAS Build<br/>Expo cloud build service"]

    AppleDev["Apple Developer Account<br/>Certificates + app signing"] --> EAS
    EAS --> IPA["iPhone App File<br/>.ipa build"]
    IPA --> ASC["App Store Connect<br/>Apple app dashboard"]

    ASC --> Internal["Internal Testers<br/>Fast TestFlight access"]
    ASC --> Review["Beta App Review<br/>Apple approval for external testing"]
    Review --> External["External Testers<br/>Public TestFlight link"]

    Internal --> TestFlight["TestFlight<br/>Install Stokit"]
    External --> TestFlight
    TestFlight --> App["Stokit on iPhone"]

    App --> Supabase["Supabase<br/>Database + auth + storage"]
    Supabase --> Data["Households<br/>Pantry items<br/>Stores<br/>Receipts<br/>Invite codes<br/>Notifications"]

    App --> iOS["iOS System Services"]
    iOS --> Location["Location + Geofencing<br/>Store arrival"]
    iOS --> Push["Push Notifications<br/>Arrival + reminders"]
    iOS --> Camera["Camera + Photos<br/>Barcode + receipt upload"]
```

## Simple Flow

1. Code is pushed to GitHub.
2. EAS builds the app using Apple signing.
3. EAS sends the `.ipa` file to App Store Connect.
4. App Store Connect sends it to TestFlight.
5. Testers install Stokit from TestFlight.
6. The installed app talks to Supabase and iOS services.
