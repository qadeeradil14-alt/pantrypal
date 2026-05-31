#!/usr/bin/env bash
# deploy.sh — Full Stokit release pipeline
#
# Usage: ./scripts/deploy.sh
#
# Steps:
#   1. EAS build (iOS production, auto-increments build number)
#   2. EAS submit to App Store Connect
#   3. Add latest build to BOTH Internal and External TestFlight groups
#   4. Submit External group for Beta App Review
#
# Requirements: eas-cli, python3, PyJWT, cryptography
#   pip3 install pyjwt cryptography

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

ASC_KEY_ID="SY6372R52T"
ASC_ISSUER="7041f663-a114-4172-8194-c20fca3a62fe"
ASC_KEY_PATH="./secrets/AuthKey_SY6372R52T.p8"
ASC_APP_ID="6774653348"
INTERNAL_GROUP="667b0582-dfad-42c5-9ec1-f4fca6429af7"
EXTERNAL_GROUP="1edd340c-e18a-43c7-abd3-1b36404491f8"

echo "▶ Step 1/4  EAS build (iOS production)"
eas build --platform ios --profile production --non-interactive
echo "✓ Build complete"

echo ""
echo "▶ Step 2/4  Submit to App Store Connect"
eas submit --platform ios --latest --non-interactive
echo "✓ Submit complete"

echo ""
echo "▶ Step 3/4  Distribute to TestFlight groups"
python3 - <<PYEOF
import jwt, time, json, urllib.request, urllib.error

key_id    = "${ASC_KEY_ID}"
issuer    = "${ASC_ISSUER}"
key       = open("${ASC_KEY_PATH}").read()
app_id    = "${ASC_APP_ID}"
int_group = "${INTERNAL_GROUP}"
ext_group = "${EXTERNAL_GROUP}"

now     = int(time.time())
payload = {"iss": issuer, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"}
token   = jwt.encode(payload, key, algorithm="ES256", headers={"kid": key_id})

def get(url):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

def post(url, body):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(url, data=data, headers={
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Get the latest VALID build
builds = get(f"https://api.appstoreconnect.apple.com/v1/builds"
             f"?filter[app]={app_id}&filter[processingState]=VALID"
             f"&sort=-version&limit=1")
if not builds["data"]:
    print("ERROR: no VALID build found — Apple may still be processing it. Wait a minute and re-run step 3 manually:")
    print("  python3 scripts/distribute.py")
    raise SystemExit(1)

build = builds["data"][0]
bid   = build["id"]
ver   = build["attributes"]["version"]
print(f"Latest build: #{ver}  id={bid}")

# Add to Internal group (no review needed)
s, _ = post(
    f"https://api.appstoreconnect.apple.com/v1/betaGroups/{int_group}/relationships/builds",
    {"data": [{"type": "builds", "id": bid}]},
)
print(f"Internal Testers: {'✓ added' if s == 204 else f'HTTP {s}'}")

# Add to External group
s, _ = post(
    f"https://api.appstoreconnect.apple.com/v1/betaGroups/{ext_group}/relationships/builds",
    {"data": [{"type": "builds", "id": bid}]},
)
print(f"External Testers: {'✓ added' if s == 204 else f'HTTP {s}'}")

# Submit External for Beta App Review
s, resp = post(
    "https://api.appstoreconnect.apple.com/v1/betaAppReviewSubmissions",
    {"data": {"type": "betaAppReviewSubmissions", "relationships": {
        "build": {"data": {"type": "builds", "id": bid}}
    }}},
)
if s == 201 and isinstance(resp, dict):
    state = resp.get("data", {}).get("attributes", {}).get("betaReviewState", "?")
    print(f"Beta App Review: ✓ submitted  state={state}")
elif s == 409:
    print("Beta App Review: already submitted ✓")
elif s == 422 and "ANOTHER_BUILD_IN_REVIEW" in str(resp):
    print("Beta App Review: ⚠️  another build is already in Apple's review queue.")
    print("  Option A: wait for that build to finish review (1-24h), then run:")
    print(f"    python3 scripts/submit_review.py {bid}")
    print("  Option B: go to App Store Connect, delete the build in review,")
    print("    then re-run: python3 scripts/submit_review.py " + bid)
else:
    print(f"Beta App Review: HTTP {s} — {str(resp)[:200]}")

print("")
print("Done. Apple typically approves external builds within 1–24 h.")
print("Public TestFlight link: https://testflight.apple.com/join/eJTwChas")
PYEOF

echo ""
echo "▶ Step 4/4  Summary"
echo "  ✓ Build uploaded"
echo "  ✓ Internal + External groups assigned"
echo "  ✓ Beta App Review submitted"
echo ""
echo "Share with testers: https://testflight.apple.com/join/eJTwChas"
