/**
 * Regenerates constants/generatedAssetMap.ts from every PNG under
 * assets/custom-emojis/ and assets/item-icons/.
 *
 * Run after adding, removing, or renaming a custom illustration:
 *   npm run assets:generate
 *
 * This is the only step required to wire up a new `custom:<key>` icon — no
 * hand-edits to itemAssetResolver.ts. Metro needs static `require()` calls, so
 * this script writes literal require() lines into the generated file rather
 * than resolving them dynamically at runtime.
 */
import { readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const SOURCE_DIRS = ['assets/custom-emojis', 'assets/item-icons'];
const OUTPUT_PATH = join(ROOT, 'constants/generatedAssetMap.ts');

interface Entry {
  key: string;
  requirePath: string;
  sourceDir: string;
}

function collectEntries(): Entry[] {
  const entries: Entry[] = [];
  const seen = new Map<string, string>();

  for (const dir of SOURCE_DIRS) {
    const absDir = join(ROOT, dir);
    let files: string[];
    try {
      files = readdirSync(absDir);
    } catch {
      continue;
    }

    for (const file of files.sort()) {
      if (!file.endsWith('.png')) continue;
      const key = file.slice(0, -'.png'.length);

      const priorDir = seen.get(key);
      if (priorDir) {
        throw new Error(
          `Duplicate asset key "${key}": found in both ${priorDir}/${file} and ${dir}/${file}. ` +
            `Rename one of the files so every custom: key is globally unique.`,
        );
      }
      seen.set(key, dir);

      entries.push({
        key,
        requirePath: `../${dir}/${file}`,
        sourceDir: dir,
      });
    }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

function render(entries: Entry[]): string {
  // Each require() lives inside its own switch-case body (not an eagerly
  // evaluated object literal) so this module can be imported by plain-Node
  // test runners — which have no Metro asset transform and would crash
  // trying to parse a .png as JS — without ever touching the filesystem
  // unless a given custom: icon is actually resolved. Metro still statically
  // analyzes each `require('./literal.png')` call fine regardless of where
  // it sits in the file.
  const cases = entries
    .map((e) => `    case 'custom:${e.key}': return require('${e.requirePath}');`)
    .join('\n');

  return `/**
 * GENERATED FILE — do not hand-edit.
 * Regenerate with: npm run assets:generate
 * Source: assets/custom-emojis/*.png, assets/item-icons/*.png
 */
export function getGeneratedCustomAsset(icon: string): any {
  switch (icon) {
${cases}
    default: return undefined;
  }
}
`;
}

function main() {
  const entries = collectEntries();
  writeFileSync(OUTPUT_PATH, render(entries));
  console.log(`Wrote ${entries.length} asset(s) to constants/generatedAssetMap.ts`);
}

main();
