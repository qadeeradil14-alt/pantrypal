#!/usr/bin/env python3
"""
submit_review.py — submit a specific build for Beta App Review
Usage: python3 scripts/submit_review.py [build_id]
       If no build_id given, submits the latest VALID build.
"""
import sys, json, urllib.request, urllib.error, subprocess, time

token_script = """
import jwt, time
key_id = 'SY6372R52T'; issuer = '7041f663-a114-4172-8194-c20fca3a62fe'
key = open('secrets/AuthKey_SY6372R52T.p8').read()
now = int(time.time())
payload = {'iss': issuer, 'iat': now, 'exp': now + 1200, 'aud': 'appstoreconnect-v1'}
print(jwt.encode(payload, key, algorithm='ES256', headers={'kid': key_id}))
"""
token = subprocess.check_output(['python3', '-c', token_script]).decode().strip()

APP_ID        = '6774653348'
INT_GROUP     = '667b0582-dfad-42c5-9ec1-f4fca6429af7'
EXT_GROUP     = '1edd340c-e18a-43c7-abd3-1b36404491f8'

def get(url):
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read())

def post(url, body):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(url, data=data, headers={
        'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'
    }, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read(); return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Resolve build ID
if len(sys.argv) > 1:
    bid = sys.argv[1]
    ver = '?'
    print(f"Using provided build ID: {bid}")
else:
    builds = get(f'https://api.appstoreconnect.apple.com/v1/builds'
                 f'?filter[app]={APP_ID}&filter[processingState]=VALID&sort=-version&limit=1')
    if not builds['data']:
        print("No VALID build found."); sys.exit(1)
    bid = builds['data'][0]['id']
    ver = builds['data'][0]['attributes']['version']
    print(f"Latest VALID build: #{ver}  id={bid}")

# Ensure assigned to both groups
for gid, name in [(INT_GROUP, 'Internal'), (EXT_GROUP, 'External')]:
    s, _ = post(f'https://api.appstoreconnect.apple.com/v1/betaGroups/{gid}/relationships/builds',
                {"data": [{"type": "builds", "id": bid}]})
    print(f"{name} Testers: {'✓' if s == 204 else f'HTTP {s}'}")

# Submit for review
s, resp = post('https://api.appstoreconnect.apple.com/v1/betaAppReviewSubmissions',
    {"data": {"type": "betaAppReviewSubmissions", "relationships": {
        "build": {"data": {"type": "builds", "id": bid}}}}})

if s == 201:
    state = resp.get('data',{}).get('attributes',{}).get('betaReviewState','?')
    print(f"Beta App Review: ✓ submitted  state={state}")
elif s == 409:
    print("Beta App Review: already submitted ✓")
elif s == 422 and 'ANOTHER_BUILD_IN_REVIEW' in str(resp):
    print("⚠️  Another build is still in Apple's review queue.")
    print("   Go to App Store Connect → TestFlight → select the build in review → delete it.")
    print(f"   Then re-run: python3 scripts/submit_review.py {bid}")
    sys.exit(1)
else:
    print(f"Beta App Review: HTTP {s} — {str(resp)[:300]}")
    sys.exit(1)

print(f"\n✓ Done. TestFlight: https://testflight.apple.com/join/eJTwChas")
