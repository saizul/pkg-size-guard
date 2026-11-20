import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GuardError, packSize, parsePackOutput } from '../src/index.js';
import { FIXTURE, tempDir } from './helpers.js';

const JSON_OUT = JSON.stringify(
  [{ name: 'demo', version: '1.2.3', size: 1234, unpackedSize: 5678, entryCount: 4, files: [] }],
  null,
  2,
);

describe('parsePackOutput', () => {
  it('reads npm pack --json output', () => {
    assert.deepEqual(parsePackOutput(JSON_OUT), {
      name: 'demo',
      version: '1.2.3',
      size: 1234,
      unpackedSize: 5678,
      entryCount: 4,
    });
  });

  it('skips lifecycle script output printed before the JSON', () => {
    const noisy = `> demo@1.2.3 prepack\n> tsc\n[build] done\n${JSON_OUT}\n`;
    assert.equal(parsePackOutput(noisy).size, 1234);
  });

  it('counts files when entryCount is missing', () => {
    const out = JSON.stringify([{ size: 1, unpackedSize: 2, files: [{}, {}, {}] }]);
    assert.equal(parsePackOutput(out).entryCount, 3);
  });

  it('throws a GuardError on anything else', () => {
    assert.throws(() => parsePackOutput('npm ERR! nope'), GuardError);
    assert.throws(() => parsePackOutput('[]'), GuardError);
  });
});

describe('packSize (runs npm pack --dry-run)', () => {
  it('measures the fixture package', () => {
    const r = packSize(FIXTURE);
    assert.equal(r.name, 'size-guard-fixture');
    assert.equal(r.version, '1.0.0');
    // package.json + 6 files under build/
    assert.equal(r.entryCount, 7);
    assert.ok(r.size > 500 && r.size < r.unpackedSize, `${r.size} / ${r.unpackedSize}`);
  });

  it('measures a temporary package and sees new files', () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'tmp-size-guard-pkg', version: '0.0.1', scripts: { prepack: 'exit 1' } }),
    );
    writeFileSync(join(dir, 'index.js'), 'module.exports = 1;\n');
    const before = packSize(dir);
    assert.equal(before.entryCount, 2);
    mkdirSync(join(dir, 'lib'));
    writeFileSync(join(dir, 'lib', 'big.js'), `module.exports = ${JSON.stringify('x'.repeat(20_000))};\n`);
    const after = packSize(dir);
    assert.equal(after.entryCount, 3);
    assert.ok(after.unpackedSize - before.unpackedSize > 20_000);
  });

  it('runs lifecycle scripts only with ignoreScripts: false', () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'tmp-size-guard-fail', version: '0.0.1', scripts: { prepack: 'exit 3' } }),
    );
    assert.equal(packSize(dir, true).entryCount, 1);
    assert.throws(() => packSize(dir, false), /npm pack failed/);
  });
});
