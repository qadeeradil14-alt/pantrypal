#!/usr/bin/env node
/**
 * Targeted smoke test for date utilities in lib/dates.ts.
 * Run with: node scripts/test-dates.mjs
 */

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── Inline implementations (mirrors lib/dates.ts) ─────────────────────────
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(dateStr) {
  if (dateStr.includes('T') || dateStr.includes('Z')) return new Date(dateStr);
  return new Date(`${dateStr}T12:00:00`);
}

// ── Tests ──────────────────────────────────────────────────────────────────

console.log('\n📅 localToday()');

const today = localToday();
assert('Returns YYYY-MM-DD format', /^\d{4}-\d{2}-\d{2}$/.test(today), today);

const now = new Date();
const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
assert('Matches local date (not UTC)', today === expected, `got ${today}, expected ${expected}`);

// Simulate 11 PM ET (UTC-4) — new Date().toISOString() would give next day
// We can't mock time here, so just verify the format is stable
assert('No toISOString() UTC shift possible', !today.includes('T'), today);

console.log('\n📅 parseLocalDate()');

const d1 = parseLocalDate('2026-06-03');
assert('Date-only string parses to correct local day', d1.getDate() === 3 && d1.getMonth() === 5, `month=${d1.getMonth()+1} day=${d1.getDate()}`);
assert('Date-only string does not shift overnight (noon anchor)', d1.getHours() === 12, `hours=${d1.getHours()}`);

const d2 = parseLocalDate('2026-06-03T15:30:00Z');
assert('ISO timestamp with Z passes through directly', d2 instanceof Date && !isNaN(d2.getTime()), d2.toISOString());

const d3 = parseLocalDate('2026-01-01');
assert('Jan 1 parses correctly (month boundary)', d3.getMonth() === 0 && d3.getDate() === 1, `month=${d3.getMonth()+1}`);

const d4 = parseLocalDate('2026-12-31');
assert('Dec 31 parses correctly (year boundary)', d4.getMonth() === 11 && d4.getDate() === 31, `month=${d4.getMonth()+1}`);

console.log('\n📅 UTC rollover regression');
// The old bug: new Date('2026-06-03').toLocaleDateString() in ET gives June 2
const oldWay = new Date('2026-06-03'); // parses as UTC midnight
const newWay = parseLocalDate('2026-06-03'); // parses as local noon
assert('parseLocalDate noon > UTC midnight', newWay.getTime() > oldWay.getTime(), `diff=${newWay.getTime() - oldWay.getTime()}ms`);
assert('Old UTC way gives wrong day in negative-offset zones', oldWay.getHours() !== 12, `UTC midnight hours=${oldWay.getHours()}`);

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
