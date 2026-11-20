import assert from 'node:assert/strict';
import { appendFileSync, cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { MARKER, type Report, VERSION } from '../src/index.js';
import { cli, FIXTURE, fixtureCopy, git, gitRepo, tempDir } from './helpers.js';

const fakePack = { pack: () => ({ name: 'f', version: '1', size: 1000, unpackedSize: 4000, entryCount: 7 }) };

describe('cli', () => {
  it('prints help and version', () => {
    assert.match(cli(['--help']).stdout, /Usage: pkg-size-guard/);
    assert.equal(cli(['-v']).stdout, `${VERSION}\n`);
  });

  it('passes on the fixture and prints a table', () => {
    const r = cli(['--cwd', FIXTURE], { measure: fakePack });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^ok {2}app \(gzip\)/m);
    assert.match(r.stdout, /All 9 size budgets passed\./);
  });

  it('exits 1 when a budget is exceeded, and 0 with --no-fail', () => {
    const dir = fixtureCopy();
    writeFileSync(
      join(dir, 'tight.json'),
      JSON.stringify({ checks: [{ name: 'app', path: 'build/app.js', gzip: '100 B' }] }),
    );
    const r = cli(['--cwd', dir, '-c', 'tight.json']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /^FAIL app \(gzip\): .* over the limit$/m);
    assert.equal(cli(['--cwd', dir, '--config=tight.json', '--no-fail']).code, 0);
  });

  it('exits 1 when a check matches no files', () => {
    const dir = fixtureCopy();
    writeFileSync(join(dir, 'missing.json'), JSON.stringify({ checks: [{ path: 'nothing/*.js' }] }));
    const r = cli(['--cwd', dir, '-c', 'missing.json']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /no files matched/);
  });

  it('exits 2 on usage and config errors', () => {
    assert.equal(cli(['--wat']).code, 2);
    assert.match(cli(['--wat']).stderr, /unknown option --wat/);
    assert.match(cli(['--config']).stderr, /--config needs a value/);
    assert.match(cli(['--base', 'a', '--base-ref', 'b']).stderr, /either --base or --base-ref/);
    assert.match(cli(['--base-build', 'x']).stderr, /--base-build needs --base-ref/);
    const r = cli(['--cwd', tempDir()]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /cannot read config file .*size-guard\.json/);
  });

  it('--save writes a snapshot that --base reads back', () => {
    const dir = fixtureCopy();
    assert.equal(cli(['--cwd', dir, '--save', 'base.json'], { measure: fakePack }).code, 0);
    const snap = JSON.parse(readFileSync(join(dir, 'base.json'), 'utf8')) as Report;
    assert.equal(snap.tool, 'pkg-size-guard');
    assert.equal(snap.version, 1);
    assert.equal(snap.checks.length, 4);
    appendFileSync(join(dir, 'build/app.js'), `\nexport const extra = ${JSON.stringify('z'.repeat(400))};\n`);
    const r = cli(['--cwd', dir, '--base', 'base.json', '--markdown', 'report.md'], { measure: fakePack });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Base +Change/);
    const md = readFileSync(join(dir, 'report.md'), 'utf8');
    assert.ok(md.startsWith(MARKER));
    assert.match(
      md,
      /\| ✅ \| app <sub>gzip<\/sub> \| [\d.]+ k?B \| [\d.]+ k?B \| \+\d+ B \(\+[\d.]+%\) \| 2 kB \|/,
    );
  });

  it('rejects a file that is not a snapshot', () => {
    const r = cli(['--cwd', FIXTURE, '--base', 'package.json'], { measure: fakePack });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /not a pkg-size-guard snapshot/);
  });

  it('--summary appends to GITHUB_STEP_SUMMARY', () => {
    const summary = join(tempDir(), 'summary.md');
    writeFileSync(summary, 'before\n');
    const r = cli(['--cwd', FIXTURE, '--summary', '--title', 'Sizes'], {
      measure: fakePack,
      env: { GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(r.code, 0, r.stderr);
    const text = readFileSync(summary, 'utf8');
    assert.ok(text.startsWith(`before\n${MARKER}\n### Sizes\n`));
    assert.equal(cli(['--cwd', FIXTURE, '--summary'], { measure: fakePack }).code, 2);
  });

  it('--json prints the report and rows', () => {
    const r = cli(['--cwd', FIXTURE, '--json'], { measure: fakePack });
    const out = JSON.parse(r.stdout);
    assert.equal(out.report.tool, 'pkg-size-guard');
    assert.equal(out.base, null);
    assert.equal(out.failures, 0);
    assert.equal(out.rows[0].name, 'app');
  });
});

describe('cli --base-ref', () => {
  it('compares with a git ref in a temporary worktree and cleans up', () => {
    const dir = fixtureCopy();
    gitRepo(dir);
    appendFileSync(join(dir, 'build/style.css'), '.extra { color: red; }\n');
    const r = cli(['--cwd', dir, '--base-ref', 'HEAD', '--json'], { measure: fakePack });
    assert.equal(r.code, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    const css = out.rows.find((row: { name: string }) => row.name === 'css');
    assert.equal(css.size - css.base, '.extra { color: red; }\n'.length);
    assert.equal(git(dir, 'worktree', 'list').split('\n').length, 1, 'worktree removed');
  });

  it('works from a subdirectory of the repository and runs --base-build there', () => {
    const root = tempDir();
    const dir = join(root, 'packages', 'web');
    cpSync(FIXTURE, dir, { recursive: true });
    gitRepo(root);
    // The build command runs in packages/web of the worktree and makes the base app.js tiny.
    const build = `node -e "require('fs').writeFileSync('build/app.js', 'x')"`;
    const r = cli(['--cwd', dir, '--base-ref', 'HEAD', '--base-build', build, '--json'], {
      measure: fakePack,
    });
    assert.equal(r.code, 0, r.stderr);
    const app = JSON.parse(r.stdout).rows.find((row: { name: string; metric: string }) => row.name === 'app');
    assert.ok(app.base < 30, String(app.base));
    assert.ok(app.size > 500);
    assert.ok(
      existsSync(join(dir, 'build/app.js')) && readFileSync(join(dir, 'build/app.js'), 'utf8').length > 1000,
    );
  });

  it('fails clearly for an unknown ref, a failing build, or outside a repository', () => {
    const dir = fixtureCopy();
    assert.match(cli(['--cwd', dir, '--base-ref', 'HEAD'], { measure: fakePack }).stderr, /git rev-parse/);
    gitRepo(dir);
    assert.match(
      cli(['--cwd', dir, '--base-ref', 'no-such-branch'], { measure: fakePack }).stderr,
      /git rev-parse/,
    );
    const r = cli(['--cwd', dir, '--base-ref', 'HEAD', '--base-build', 'node -e "process.exit(4)"'], {
      measure: fakePack,
    });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /base build command failed at HEAD \(exit code 4\)/);
    assert.equal(git(dir, 'worktree', 'list').split('\n').length, 1);
  });
});
