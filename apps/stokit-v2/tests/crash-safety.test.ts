import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const appRoot = join(process.cwd(), 'app');
const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) return sourceFiles(path);
  return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
});

const layout = readFileSync(join(appRoot, '_layout.tsx'), 'utf8');
const syncEngine = readFileSync(join(process.cwd(), 'core/services/syncEngine.ts'), 'utf8');

test('Fabric-unsafe LayoutAnimation transactions are absent from app routes', () => {
  for (const path of sourceFiles(appRoot)) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /LayoutAnimation\.configureNext/, path);
  }
});

test('fatal diagnostics retain context and delegate to the native fatal handler', () => {
  const reporter = readFileSync(join(process.cwd(), 'core/services/crashReporter.ts'), 'utf8');
  assert.match(reporter, /error\.stack/);
  assert.match(reporter, /screen/);
  assert.match(reporter, /operation/);
  assert.match(reporter, /householdId/);
  assert.match(reporter, /syncState/);
  assert.match(reporter, /OTA_SEQ/);
  assert.match(reporter, /previousHandler\(error, isFatal\)/);
  assert.match(reporter, /else throw error/);
  assert.match(reporter, /new File\(Paths\.document, PENDING_CRASH_FILE\)/);
});

test('startup, foreground, and realtime async work is observed instead of becoming unhandled', () => {
  assert.match(layout, /runObservedOperation\('app\.hydrate'/);
  assert.match(layout, /runObservedOperation\('app\.foreground'/);
  assert.match(syncEngine, /runObservedOperation\('sync\.realtime'/);
  assert.match(syncEngine, /'sync\.subscribed'/);
});
