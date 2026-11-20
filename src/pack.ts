import { spawnSync } from 'node:child_process';
import { GuardError } from './errors.js';
import type { PackageResult } from './types.js';

/**
 * Reads the output of `npm pack --dry-run --json`. Lifecycle scripts can print
 * before the JSON, so this looks for the JSON array at the end of the output.
 */
export function parsePackOutput(stdout: string): PackageResult {
  const candidates = [0, ...[...stdout.matchAll(/^\[/gm)].map((m) => m.index!)];
  for (const start of candidates.reverse()) {
    try {
      const data = JSON.parse(stdout.slice(start));
      const entry = Array.isArray(data) ? data[0] : data;
      if (entry && typeof entry.size === 'number' && typeof entry.unpackedSize === 'number') {
        return {
          name: String(entry.name ?? ''),
          version: String(entry.version ?? ''),
          size: entry.size,
          unpackedSize: entry.unpackedSize,
          entryCount: typeof entry.entryCount === 'number' ? entry.entryCount : (entry.files?.length ?? 0),
        };
      }
    } catch {
      // Not the JSON part; try the next candidate.
    }
  }
  throw new GuardError('could not read the output of npm pack --dry-run --json');
}

/** Runs `npm pack --dry-run --json` in `dir` and returns the tarball figures. */
export function packSize(dir: string, ignoreScripts = true): PackageResult {
  const command = `npm pack --dry-run --json${ignoreScripts ? ' --ignore-scripts' : ''}`;
  // A shell finds npm (npm.cmd on Windows) the same way a terminal does.
  const result = spawnSync(command, {
    cwd: dir,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, npm_config_loglevel: 'error', npm_config_update_notifier: 'false' },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new GuardError(`could not run npm: ${result.error.message}`);
  if (result.status !== 0) {
    throw new GuardError(`npm pack failed in ${dir}:\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return parsePackOutput(result.stdout);
}
