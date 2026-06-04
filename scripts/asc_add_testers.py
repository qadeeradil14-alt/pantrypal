#!/usr/bin/env python3
"""
Attach all internal TestFlight beta groups to the latest build of the app.
Uses the existing App Store Connect API key from eas.json.
"""

import sys
import time
import json
import urllib.request
import urllib.error

import jwt  # PyJWT

KEY_ID = "SY6372R52T"
ISSUER_ID = "7041f663-a114-4172-8194-c20fca3a62fe"
KEY_PATH = "./secrets/AuthKey_SY6372R52T.p8"
APP_ID = "6774653348"
BUILD_NUMBER = "29"
APP_VERSION = "1.0.0"


def make_token():
    with open(KEY_PATH, "r") as f:
        private_key = f.read()
    now = int(time.time())
    payload = {
        "iss": ISSUER_ID,
        "iat": now,
        "exp": now + 1200,
        "aud": "appstoreconnect-v1",
    }
    return jwt.encode(payload, private_key, algorithm="ES256", headers={"kid": KEY_ID})


def asc_get(token, path):
    url = f"https://api.appstoreconnect.apple.com/v1{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def asc_post(token, path, body):
    url = f"https://api.appstoreconnect.apple.com/v1{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url, data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def main():
    token = make_token()
    print("✓ JWT generated")

    # Find the build in ASC by version + build number
    print(f"  Looking for build {APP_VERSION} ({BUILD_NUMBER})...")
    builds_data = asc_get(
        token,
        f"/builds?filter[app]={APP_ID}&filter[version]={BUILD_NUMBER}&filter[preReleaseVersion.version]={APP_VERSION}&limit=5",
    )
    builds = builds_data.get("data", [])

    if not builds:
        # Build may still be processing — try without version filter
        print("  Build not found with version filter, trying broader search...")
        builds_data = asc_get(
            token,
            f"/builds?filter[app]={APP_ID}&filter[version]={BUILD_NUMBER}&limit=5&sort=-uploadedDate",
        )
        builds = builds_data.get("data", [])

    if not builds:
        print("✗ Build not found in App Store Connect yet — Apple may still be processing it.")
        print("  Wait a few minutes and re-run this script.")
        sys.exit(1)

    build = builds[0]
    build_id = build["id"]
    build_version = build["attributes"].get("version")
    build_state = build["attributes"].get("processingState")
    print(f"✓ Found build: ID={build_id}, buildNumber={build_version}, state={build_state}")

    if build_state not in ("VALID", "IN_BETA_REVIEW", "IN_BETA_TESTING"):
        print(f"  Build state is '{build_state}' — may not be ready for TestFlight groups yet.")

    # List all beta groups for the app
    groups_data = asc_get(token, f"/apps/{APP_ID}/betaGroups")
    groups = groups_data.get("data", [])
    if not groups:
        print("✗ No beta groups found for this app.")
        sys.exit(1)

    internal_groups = [
        g for g in groups
        if g["attributes"].get("isInternalGroup") is True
    ]

    if not internal_groups:
        print("  No internal groups found. Available groups:")
        for g in groups:
            print(f"    - {g['attributes']['name']} (internal={g['attributes'].get('isInternalGroup')})")
        print("  Adding build to ALL groups instead...")
        internal_groups = groups

    print(f"✓ Found {len(internal_groups)} internal group(s):")
    for g in internal_groups:
        print(f"    - {g['attributes']['name']}")

    # Add build to each internal group
    for group in internal_groups:
        group_id = group["id"]
        group_name = group["attributes"]["name"]
        body = {
            "data": [{"type": "builds", "id": build_id}]
        }
        status, resp = asc_post(token, f"/betaGroups/{group_id}/relationships/builds", body)
        if status in (201, 204, 200):
            print(f"✓ Added build to '{group_name}'")
        else:
            print(f"✗ Failed to add to '{group_name}': HTTP {status} — {resp.decode()[:200]}")

    print("\nDone. Internal testers will receive a TestFlight notification shortly.")


if __name__ == "__main__":
    main()
