import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { verifyReachabilityPrivacyManifests } from '../scripts/verify-ios-privacy-manifests';

const require = createRequire(import.meta.url);
const iosBuildPlugin = require('../plugins/with-ios-xcode27-build-settings');

function manifestFixture(contents: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'stokit-reachability-privacy-'));
  const bundle = path.join(root, 'ReachabilitySwift.bundle');
  mkdirSync(bundle);
  writeFileSync(path.join(bundle, 'PrivacyInfo.xcprivacy'), contents);
  return root;
}

const plist = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>${body}</dict></plist>`;

test('rejects the ReachabilitySwift manifest shipped by Build 108', () => {
  const root = manifestFixture(plist('<key>NSPrivacyTracking</key><false/>'));

  assert.throws(
    () => verifyReachabilityPrivacyManifests(root),
    /NSPrivacyCollectedDataTypes must be an empty array/,
  );
});

test('accepts ReachabilitySwift when collected data types are explicitly empty', () => {
  const root = manifestFixture(plist(
    '<key>NSPrivacyTracking</key><false/><key>NSPrivacyCollectedDataTypes</key><array/>',
  ));

  assert.equal(verifyReachabilityPrivacyManifests(root), 1);
});

test('rejects invented ReachabilitySwift data collection', () => {
  const root = manifestFixture(plist(
    '<key>NSPrivacyTracking</key><false/><key>NSPrivacyCollectedDataTypes</key><array><dict/></array>',
  ));

  assert.throws(
    () => verifyReachabilityPrivacyManifests(root),
    /NSPrivacyCollectedDataTypes must be an empty array/,
  );
});

test('fails when an archive contains no ReachabilitySwift privacy manifest', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'stokit-no-reachability-privacy-'));

  assert.throws(() => verifyReachabilityPrivacyManifests(root), /not found/);
});

test('the iOS config plugin installs the ReachabilitySwift patch exactly once', () => {
  const podfile = `post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
end
`;

  const patched = iosBuildPlugin.patchPodfile(podfile, '16.4');
  const patchedAgain = iosBuildPlugin.patchPodfile(patched, '16.4');

  assert.match(patched, /reachability_privacy\['NSPrivacyCollectedDataTypes'\] = \[\]/);
  assert.equal(patchedAgain, patched);
});
