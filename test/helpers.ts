import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after } from 'node:test';
import { type RunIO, run } from '../src/cli/run.js';

/** test/fixtures/basic in the source tree (tests run from dist/test). */
export const FIXTURE = fileURLToPath(new URL('../../test/fixtures/basic', import.meta.url));

const temps: string[] = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A fresh temporary directory, removed after the test file. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'size-guard-test-'));
  temps.push(dir);
  return dir;
}

/** A temporary copy of the fixture project. */
export function fixtureCopy(): string {
  const dir = tempDir();
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Runs git with a throwaway identity and no signing. */
export function git(cwd: string, ...args: string[]): string {
  const r = spawnSync(
    'git',
    [
      '-c',
      'user.name=Size Guard Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Makes `dir` a git repository with everything committed. */
export function gitRepo(dir: string): void {
  git(dir, 'init', '-q');
  // Keep byte-identical files on Windows runners (no CRLF conversion).
  git(dir, 'config', 'core.autocrlf', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
}

/** Runs the CLI in-process and captures its output. */
export function cli(args: string[], extra: Partial<RunIO> = {}) {
  let stdout = '';
  let stderr = '';
  const code = run(args, {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    env: {},
    ...extra,
  });
  return { code, stdout, stderr };
}
