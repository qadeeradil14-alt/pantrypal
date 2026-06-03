/**
 * Shared date utilities for Stokit.
 *
 * All helpers use local time to avoid the UTC midnight rollover bug where
 * new Date().toISOString().slice(0,10) returns yesterday's date for US
 * users after 8 PM EST.
 */

/** Returns today's date as YYYY-MM-DD in local time. */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parses a YYYY-MM-DD date string as local noon (12:00:00).
 *
 * JavaScript's `new Date("2026-06-03")` treats date-only strings as UTC
 * midnight, which shifts the displayed date by 1 day in US timezones.
 * Appending T12:00:00 ensures the date always lands on the correct local day.
 */
export function parseLocalDate(dateStr: string): Date {
  // Guard against already-timed strings
  if (dateStr.includes('T') || dateStr.includes('Z')) {
    return new Date(dateStr);
  }
  return new Date(`${dateStr}T12:00:00`);
}

/** Formats a YYYY-MM-DD or ISO timestamp as a human-readable local date. */
export function formatLocalDate(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', options);
}
