import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const fieldSource = readFileSync(join(process.cwd(), 'components/shared/Field.tsx'), 'utf8');

test('shared text fields reset character spacing while labels retain tracking', () => {
  const inputStyle = fieldSource.match(/input:\s*\{([\s\S]*?)\n\s*\},/)?.[1];
  const labelStyle = fieldSource.match(/label:\s*\{([\s\S]*?)\n\s*\},/)?.[1];

  assert.ok(inputStyle);
  assert.match(inputStyle, /letterSpacing:\s*0,/);
  assert.ok(labelStyle);
  assert.match(labelStyle, /letterSpacing:\s*0\.3,/);
});
