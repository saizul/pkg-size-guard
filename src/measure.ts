import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expandGlobs } from './glob.js';
import { packSize } from './pack.js';
import { measure } from './size.js';
import type { CheckResult, Config, FileResult, Report } from './types.js';

export interface MeasureOptions {
  /** Replaces `npm pack` (for tests or custom package managers). */
  pack?: (dir: string, ignoreScripts: boolean) => Report['package'];
}

/** Measures every check (and the package, if configured) in a project directory. */
export function measureProject(config: Config, cwd: string, options: MeasureOptions = {}): Report {
  const checks = config.checks.map((check): CheckResult => {
    const files: FileResult[] = expandGlobs(cwd, check.path, check.ignore).map((path) => ({
      path,
      ...measure(readFileSync(join(cwd, path))),
    }));
    const sum = (k: 'raw' | 'gzip' | 'brotli') => files.reduce((n, f) => n + f[k], 0);
    return { name: check.name, raw: sum('raw'), gzip: sum('gzip'), brotli: sum('brotli'), files };
  });
  const pkg = config.package
    ? (options.pack ?? packSize)(resolve(cwd, config.package.path), config.package.ignoreScripts)
    : null;
  return { tool: 'pkg-size-guard', version: 1, checks, package: pkg };
}
