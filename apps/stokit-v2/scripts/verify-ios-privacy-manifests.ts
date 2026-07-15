import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function findReachabilityPrivacyManifests(root: string): string[] {
  if (!statSync(root).isDirectory()) {
    return root.endsWith('PrivacyInfo.xcprivacy') && root.includes('ReachabilitySwift') ? [root] : [];
  }

  const manifests: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      manifests.push(...findReachabilityPrivacyManifests(entryPath));
    } else if (
      entry.isFile()
      && entry.name === 'PrivacyInfo.xcprivacy'
      && entryPath.includes('ReachabilitySwift')
    ) {
      manifests.push(entryPath);
    }
  }
  return manifests;
}

function readCollectedDataTypes(manifest: string): unknown {
  try {
    const output = execFileSync(
      '/usr/bin/plutil',
      ['-extract', 'NSPrivacyCollectedDataTypes', 'json', '-o', '-', manifest],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

export function verifyReachabilityPrivacyManifests(root: string): number {
  const manifests = findReachabilityPrivacyManifests(path.resolve(root));
  if (manifests.length === 0) {
    throw new Error(`ReachabilitySwift PrivacyInfo.xcprivacy not found under ${root}`);
  }

  for (const manifest of manifests) {
    const collectedDataTypes = readCollectedDataTypes(manifest);
    if (!Array.isArray(collectedDataTypes) || collectedDataTypes.length !== 0) {
      throw new Error(
        `${manifest}: NSPrivacyCollectedDataTypes must be an empty array for ReachabilitySwift`,
      );
    }
  }

  return manifests.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) {
    throw new Error('Usage: tsx scripts/verify-ios-privacy-manifests.ts <archive-or-generated-ios-path>');
  }
  const count = verifyReachabilityPrivacyManifests(root);
  console.log(`Verified ${count} ReachabilitySwift privacy manifest${count === 1 ? '' : 's'}.`);
}
