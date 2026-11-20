import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GuardError } from './errors.js';
import { type MeasureOptions, measureProject } from './measure.js';
import type { Config, Report } from './types.js';

/** Reads a snapshot written by `--save` (or `--json`). */
export function loadSnapshot(file: string): Report {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new GuardError(`cannot read snapshot ${file}: ${(e as Error).message}`);
  }
  const r = data as Report;
  if (r?.tool !== 'pkg-size-guard' || r.version !== 1 || !Array.isArray(r.checks)) {
    throw new GuardError(`${file} is not a pkg-size-guard snapshot`);
  }
  return r;
}

function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.error) throw new GuardError(`could not run git: ${r.error.message}`);
  if (r.status !== 0) throw new GuardError(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

export interface RefOptions extends MeasureOptions {
  /** Shell command to run in the checked-out ref before measuring, e.g. `npm ci && npm run build`. */
  build?: string;
  /** Where the build command's output goes. Default: this process's stderr. */
  log?: (text: string) => void;
}

/**
 * Measures the project as it is at a git ref: checks the ref out in a
 * temporary worktree, optionally runs a build command there, measures with
 * the current config, and removes the worktree.
 */
export function measureAtRef(config: Config, cwd: string, ref: string, options: RefOptions = {}): Report {
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  // Where cwd sits inside the repository ("" at the top). Safer than path.relative(),
  // which breaks when the temp or home directory is reached through a symlink.
  const prefix = git(cwd, ['rev-parse', '--show-prefix']);
  const commit = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  const dir = mkdtempSync(join(tmpdir(), 'pkg-size-guard-'));
  const tree = join(dir, 'base');
  git(top, ['worktree', 'add', '--detach', '--quiet', tree, commit]);
  try {
    const project = resolve(tree, prefix || '.');
    if (options.build) {
      const r = spawnSync(options.build, {
        cwd: project,
        shell: true,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      });
      (options.log ?? ((t) => process.stderr.write(t)))(`${r.stdout ?? ''}${r.stderr ?? ''}`);
      if (r.status !== 0)
        throw new GuardError(`the base build command failed at ${ref} (exit code ${r.status})`);
    }
    return measureProject(config, project, options);
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: top });
    rmSync(dir, { recursive: true, force: true });
    spawnSync('git', ['worktree', 'prune'], { cwd: top });
  }
}
