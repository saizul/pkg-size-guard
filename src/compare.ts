import { formatSize } from './size.js';
import type { CheckConfig, Comparison, Config, Increase, Metric, Report, Row } from './types.js';

function evaluate(row: Omit<Row, 'status' | 'problems'>, increase: Increase | null): Row {
  const problems: string[] = [];
  if (row.size === null) problems.push('no files matched');
  else {
    if (row.limit !== null && row.size > row.limit) {
      problems.push(`${formatSize(row.size - row.limit)} over the limit`);
    }
    if (increase && row.base !== null && row.size > row.base) {
      const diff = row.size - row.base;
      const allowed = 'percent' in increase ? (row.base * increase.percent) / 100 : increase.bytes;
      if (diff > allowed) {
        const what = 'percent' in increase ? `${increase.percent}%` : formatSize(increase.bytes);
        problems.push(`grew by more than ${what}`);
      }
    }
  }
  const status = problems.length ? 'fail' : row.limit !== null || increase ? 'pass' : 'info';
  return { ...row, status, problems };
}

const metricsOf = (check: CheckConfig): Metric[] => {
  const limited = (['raw', 'gzip', 'brotli'] as const).filter((m) => check.limits[m] !== undefined);
  return limited.length ? limited : ['gzip'];
};

/** Turns a report (and an optional base) into table rows with limits, diffs and statuses. */
export function compare(config: Config, current: Report, base: Report | null = null): Comparison {
  const rows: Row[] = [];
  for (const check of config.checks) {
    const result = current.checks.find((c) => c.name === check.name);
    const before = base?.checks.find((c) => c.name === check.name);
    const empty = !result || result.files.length === 0;
    for (const metric of metricsOf(check)) {
      const limit = check.limits[metric] ?? null;
      if (check.perFile && !empty) {
        for (const file of result.files) {
          const prev = before?.files.find((f) => f.path === file.path);
          rows.push(
            evaluate(
              { name: file.path, metric, size: file[metric], base: prev ? prev[metric] : null, limit },
              check.maxIncrease,
            ),
          );
        }
      } else {
        const files = result && result.files.length > 1 ? result.files : undefined;
        rows.push(
          evaluate(
            {
              name: check.name,
              metric,
              size: empty ? null : result[metric],
              base: before?.files.length ? before[metric] : null,
              limit,
              ...(files ? { files } : {}),
            },
            check.maxIncrease,
          ),
        );
      }
    }
  }
  if (config.package && current.package) {
    const p = config.package;
    const now = current.package;
    const prev = base?.package ?? null;
    const name = 'npm package';
    rows.push(
      evaluate(
        { name, metric: 'tarball', size: now.size, base: prev?.size ?? null, limit: p.size },
        p.maxIncrease,
      ),
    );
    rows.push(
      evaluate(
        {
          name,
          metric: 'unpacked',
          size: now.unpackedSize,
          base: prev?.unpackedSize ?? null,
          limit: p.unpackedSize,
        },
        p.maxIncrease,
      ),
    );
    if (p.entryCount !== null) {
      rows.push(
        evaluate(
          {
            name,
            metric: 'files',
            size: now.entryCount,
            base: prev?.entryCount ?? null,
            limit: p.entryCount,
          },
          null,
        ),
      );
    }
  }
  return { rows, hasBase: base !== null, failures: rows.filter((r) => r.status === 'fail').length };
}
