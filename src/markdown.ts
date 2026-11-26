import { formatDiff, formatSize } from './size.js';
import type { Comparison, Row } from './types.js';

/** Hidden marker at the top of the Markdown, for tools that update one sticky PR comment. */
export const MARKER = '<!-- pkg-size-guard -->';

const ICON = { pass: '✅', warn: '⚠️', fail: '❌', info: 'ℹ️' } as const;

const fmt = (row: Row, n: number | null) =>
  n === null ? '-' : row.metric === 'files' ? String(n) : formatSize(n);

const diff = (row: Row) => {
  if (row.size === null || row.base === null) return row.size === null ? '-' : 'new';
  if (row.metric !== 'files') return formatDiff(row.size, row.base);
  const d = row.size - row.base;
  return d === 0 ? '0' : `${d > 0 ? '+' : ''}${d}`;
};

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function summary(c: Comparison): string {
  const limited = c.rows.filter((r) => r.status !== 'info').length;
  if (c.failures)
    return `**${c.failures} of ${c.rows.length} size ${c.rows.length === 1 ? 'check' : 'checks'} failed.**`;
  if (!limited) return `Measured ${c.rows.length} ${c.rows.length === 1 ? 'size' : 'sizes'} (no limits set).`;
  const passed = `All ${limited} size ${limited === 1 ? 'budget' : 'budgets'} passed`;
  if (!c.warnings) return `${passed}.`;
  return `${passed}; ${c.warnings} ${c.warnings === 1 ? 'is' : 'are'} close to the limit.`;
}

/** Renders the comparison as a Markdown table for a pull request comment or job summary. */
export function renderMarkdown(c: Comparison, title = 'Size report'): string {
  const head = c.hasBase ? ['', 'Check', 'Size', 'Base', 'Change', 'Limit'] : ['', 'Check', 'Size', 'Limit'];
  const lines = [
    MARKER,
    `### ${title}`,
    '',
    summary(c),
    '',
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
  ];
  for (const row of c.rows) {
    const name = `${cell(row.name)} <sub>${row.metric}</sub>`;
    const status = ICON[row.status];
    const notes = [...row.problems, ...row.warnings];
    const size = fmt(row, row.size) + (notes.length ? ` (${cell(notes.join('; '))})` : '');
    const cols = c.hasBase
      ? [status, name, size, fmt(row, row.base), diff(row), fmt(row, row.limit)]
      : [status, name, size, fmt(row, row.limit)];
    lines.push(`| ${cols.join(' | ')} |`);
  }
  const multi = c.rows.filter((r) => r.files);
  const seen = new Set<string>();
  for (const row of multi) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    lines.push('', `<details><summary>${cell(row.name)}: ${row.files!.length} files</summary>`, '');
    lines.push('| File | Raw | Gzip | Brotli |', '|---|---|---|---|');
    for (const f of row.files!) {
      lines.push(
        `| ${cell(f.path)} | ${formatSize(f.raw)} | ${formatSize(f.gzip)} | ${formatSize(f.brotli)} |`,
      );
    }
    lines.push('', '</details>');
  }
  return `${lines.join('\n')}\n`;
}

/** Renders the comparison as an aligned plain-text table for the terminal. */
export function renderText(c: Comparison): string {
  const head = c.hasBase ? ['', 'Check', 'Size', 'Base', 'Change', 'Limit'] : ['', 'Check', 'Size', 'Limit'];
  const word = { pass: 'ok', warn: 'warn', fail: 'FAIL', info: '' } as const;
  const body = c.rows.map((row) => {
    const name = `${row.name} (${row.metric})`;
    return c.hasBase
      ? [word[row.status], name, fmt(row, row.size), fmt(row, row.base), diff(row), fmt(row, row.limit)]
      : [word[row.status], name, fmt(row, row.size), fmt(row, row.limit)];
  });
  const table = [head, ...body];
  const widths = head.map((_, i) => Math.max(...table.map((r) => r[i]!.length)));
  const lines = table.map((r) =>
    r
      .map((v, i) => (i >= 2 ? v.padStart(widths[i]!) : v.padEnd(widths[i]!)))
      .join('  ')
      .trimEnd(),
  );
  for (const row of c.rows) {
    for (const p of row.problems) lines.push(`FAIL ${row.name} (${row.metric}): ${p}`);
    for (const w of row.warnings) lines.push(`WARN ${row.name} (${row.metric}): ${w}`);
  }
  lines.push('', summary(c).replace(/\*\*/g, ''));
  return `${lines.join('\n')}\n`;
}
