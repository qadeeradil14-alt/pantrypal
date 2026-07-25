/**
 * Developer Diagnostics — plain-text report.
 *
 * Built on demand from already-collected sections and handed to the OS share
 * sheet. Never written to disk, never uploaded, never persisted.
 */

import type { DiagnosticSection } from './types';

export function formatDiagnosticsReport(
  sections: DiagnosticSection[],
  generatedAt: number = Date.now(),
): string {
  const lines: string[] = [
    'STOKIT DEVELOPER DIAGNOSTICS',
    `generated: ${new Date(generatedAt).toISOString()}`,
    'read-only observer — no credentials collected',
  ];

  for (const section of sections) {
    lines.push('');
    lines.push(`## ${section.title}${section.subtitle ? ` (${section.subtitle})` : ''}`);
    if (!section.rows.length) {
      lines.push('  (empty)');
      continue;
    }
    for (const row of section.rows) {
      const flags = row.flags?.length ? `  [${row.flags.join(', ')}]` : '';
      lines.push(`  ${row.label}${row.value ? `: ${row.value}` : ''}${flags}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
