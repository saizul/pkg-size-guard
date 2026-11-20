import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  compare,
  loadConfig,
  MARKER,
  measure,
  measureProject,
  parseConfig,
  type Report,
  renderMarkdown,
  renderText,
} from '../src/index.js';
import { FIXTURE } from './helpers.js';

const noPack = {
  pack: () => ({ name: 'x', version: '1.0.0', size: 1500, unpackedSize: 9000, entryCount: 6 }),
};

const report = (checks: Report['checks'], pkg: Report['package'] = null): Report => ({
  tool: 'pkg-size-guard',
  version: 1,
  checks,
  package: pkg,
});
const file = (path: string, raw: number, gzip: number, brotli: number) => ({ path, raw, gzip, brotli });
const check = (name: string, files: ReturnType<typeof file>[]) => ({
  name,
  files,
  raw: files.reduce((n, f) => n + f.raw, 0),
  gzip: files.reduce((n, f) => n + f.gzip, 0),
  brotli: files.reduce((n, f) => n + f.brotli, 0),
});

describe('measureProject', () => {
  it('sums the files of each check with real compression', () => {
    const config = loadConfig(join(FIXTURE, 'size-guard.json'));
    const r = measureProject(config, FIXTURE, noPack);
    const app = r.checks.find((c) => c.name === 'app')!;
    const expected = measure(readFileSync(join(FIXTURE, 'build/app.js')));
    assert.deepEqual(app, { name: 'app', ...expected, files: [{ path: 'build/app.js', ...expected }] });
    const all = r.checks.find((c) => c.name === 'all js')!;
    assert.deepEqual(
      all.files.map((f) => f.path),
      ['build/app.js', 'build/chunks/home.js', 'build/chunks/settings.js'],
    );
    assert.equal(
      all.gzip,
      all.files.reduce((n, f) => n + f.gzip, 0),
    );
    assert.equal(r.package?.size, 1500);
  });
});

describe('compare', () => {
  const config = parseConfig({
    checks: [
      { name: 'core', path: 'dist/core.js', gzip: '5 kB', brotli: '4.5 kB' },
      { name: 'css', path: 'dist/*.css' },
      { name: 'chunks', path: 'dist/chunks/*.js', gzip: '1 kB', perFile: true },
      { name: 'grows', path: 'dist/g.js', maxIncrease: '10%' },
      { name: 'gone', path: 'dist/gone.js', raw: '1 kB' },
    ],
    package: { size: '2 kB', entryCount: 5 },
  });
  const current = report(
    [
      check('core', [file('dist/core.js', 20_000, 5_200, 4_400)]),
      check('css', [file('dist/a.css', 3000, 800, 700), file('dist/b.css', 1000, 300, 250)]),
      check('chunks', [file('dist/chunks/a.js', 3000, 900, 800), file('dist/chunks/b.js', 4000, 1100, 1000)]),
      check('grows', [file('dist/g.js', 1200, 600, 500)]),
      check('gone', []),
    ],
    { name: 'p', version: '1.0.0', size: 1800, unpackedSize: 7000, entryCount: 6 },
  );
  const base = report(
    [
      check('core', [file('dist/core.js', 19_000, 5_000, 4_300)]),
      check('chunks', [file('dist/chunks/a.js', 3000, 900, 800)]),
      check('grows', [file('dist/g.js', 1000, 500, 400)]),
    ],
    { name: 'p', version: '0.9.0', size: 1700, unpackedSize: 7000, entryCount: 6 },
  );

  it('builds one row per limited metric, per file for perFile checks, and package rows', () => {
    const c = compare(config, current);
    assert.deepEqual(
      c.rows.map((r) => `${r.name}/${r.metric}/${r.status}`),
      [
        'core/gzip/fail',
        'core/brotli/pass',
        'css/gzip/info',
        'dist/chunks/a.js/gzip/pass',
        'dist/chunks/b.js/gzip/fail',
        'grows/gzip/pass',
        'gone/raw/fail',
        'npm package/tarball/pass',
        'npm package/unpacked/info',
        'npm package/files/fail',
      ],
    );
    assert.equal(c.failures, 4);
    assert.equal(c.hasBase, false);
    assert.deepEqual(c.rows[0]!.problems, ['200 B over the limit']);
    assert.deepEqual(c.rows[6]!.problems, ['no files matched']);
    assert.equal(c.rows[2]!.files?.length, 2);
  });

  it('fills in the base and applies maxIncrease', () => {
    const c = compare(config, current, base);
    const grows = c.rows.find((r) => r.name === 'grows')!;
    assert.equal(grows.base, 500);
    assert.equal(grows.status, 'fail');
    assert.deepEqual(grows.problems, ['grew by more than 10%']);
    assert.equal(
      c.rows.find((r) => r.name === 'css')!.base,
      null,
      'no base for a check missing from the base',
    );
    assert.equal(c.rows.find((r) => r.name === 'dist/chunks/b.js')!.base, null);
    assert.equal(c.rows.find((r) => r.metric === 'tarball')!.base, 1700);
  });

  it('a size increase within maxIncrease passes', () => {
    const cfg = parseConfig({ checks: [{ name: 'x', path: 'x', maxIncrease: '1 kB' }] });
    const c = compare(
      cfg,
      report([check('x', [file('x', 1, 1500, 1)])]),
      report([check('x', [file('x', 1, 600, 1)])]),
    );
    assert.equal(c.rows[0]!.status, 'pass');
  });
});

describe('renderMarkdown', () => {
  it('renders a table without a base', () => {
    const cfg = parseConfig({ checks: [{ name: 'core', path: 'x', gzip: '5 kB' }] });
    const md = renderMarkdown(compare(cfg, report([check('core', [file('x', 9000, 4210, 3900)])])));
    assert.equal(
      md,
      [
        MARKER,
        '### Size report',
        '',
        'All 1 size budget passed.',
        '',
        '|  | Check | Size | Limit |',
        '|---|---|---|---|',
        '| ✅ | core <sub>gzip</sub> | 4.21 kB | 5 kB |',
        '',
      ].join('\n'),
    );
  });

  it('renders base, change, problems and a per-file breakdown', () => {
    const cfg = parseConfig({ checks: [{ name: 'css | styles', path: 'x', gzip: '1 kB' }] });
    const now = report([
      check('css | styles', [file('a.css', 3000, 800, 700), file('b.css', 1000, 300, 250)]),
    ]);
    const before = report([check('css | styles', [file('a.css', 2000, 1000, 600)])]);
    const md = renderMarkdown(compare(cfg, now, before), 'Bundle sizes');
    assert.ok(md.startsWith(`${MARKER}\n### Bundle sizes\n\n**1 of 1 size check failed.**\n`));
    assert.ok(md.includes('|  | Check | Size | Base | Change | Limit |'));
    assert.ok(
      md.includes(
        '| ❌ | css \\| styles <sub>gzip</sub> | 1.1 kB (100 B over the limit) | 1 kB | +100 B (+10%) | 1 kB |',
      ),
    );
    assert.ok(md.includes('<details><summary>css \\| styles: 2 files</summary>'));
    assert.ok(md.includes('| a.css | 3 kB | 800 B | 700 B |'));
  });

  it('shows new rows, package file counts and missing files', () => {
    const cfg = parseConfig({ checks: [{ name: 'gone', path: 'x' }], package: { entryCount: 10 } });
    const pkg = { name: 'p', version: '1', size: 1000, unpackedSize: 5000, entryCount: 8 };
    const md = renderMarkdown(
      compare(cfg, report([check('gone', [])], pkg), report([], { ...pkg, entryCount: 6 })),
    );
    assert.ok(md.includes('| ❌ | gone <sub>gzip</sub> | - (no files matched) | - | - | - |'));
    assert.ok(md.includes('| ℹ️ | npm package <sub>tarball</sub> | 1 kB | 1 kB | 0 B | - |'));
    assert.ok(md.includes('| ✅ | npm package <sub>files</sub> | 8 | 6 | +2 | 10 |'));
  });

  it('says when no limits are set', () => {
    const cfg = parseConfig({ checks: [{ name: 'a', path: 'x' }] });
    assert.ok(
      renderMarkdown(compare(cfg, report([check('a', [file('x', 1, 1, 1)])]))).includes('(no limits set)'),
    );
  });
});

describe('renderText', () => {
  it('aligns columns and lists problems', () => {
    const cfg = parseConfig({
      checks: [
        { name: 'core', path: 'x', gzip: '5 kB' },
        { name: 'long name', path: 'y' },
      ],
    });
    const text = renderText(
      compare(
        cfg,
        report([check('core', [file('x', 1, 5100, 1)]), check('long name', [file('y', 1, 10, 1)])]),
      ),
    );
    assert.equal(
      text,
      [
        '      Check               Size  Limit',
        'FAIL  core (gzip)       5.1 kB   5 kB',
        '      long name (gzip)    10 B      -',
        'FAIL core (gzip): 100 B over the limit',
        '',
        '1 of 2 size checks failed.',
        '',
      ].join('\n'),
    );
  });
});
