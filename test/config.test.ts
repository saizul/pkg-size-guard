import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GuardError, loadConfig, parseConfig } from '../src/index.js';
import { FIXTURE, tempDir } from './helpers.js';

const fails = (input: unknown, message: RegExp) =>
  assert.throws(
    () => parseConfig(input),
    (e: unknown) => e instanceof GuardError && message.test(e.message),
  );

describe('config', () => {
  it('reads the fixture config with defaults', () => {
    const config = loadConfig(join(FIXTURE, 'size-guard.json'));
    assert.equal(config.checks.length, 4);
    assert.deepEqual(config.checks[0], {
      name: 'app',
      path: ['build/app.js'],
      ignore: [],
      limits: { gzip: 2000, brotli: 2000 },
      perFile: false,
      maxIncrease: null,
      warnAt: null,
    });
    assert.equal(config.checks[1]!.perFile, true);
    assert.deepEqual(config.package, {
      path: '.',
      size: 10_000,
      unpackedSize: 50_000,
      entryCount: 10,
      ignoreScripts: true,
      maxIncrease: null,
      warnAt: null,
    });
  });

  it('reads warnAt as a percentage with a top-level default', () => {
    const config = parseConfig({
      warnAt: '90%',
      checks: [
        { name: 'a', path: 'a.js', gzip: '1 kB' },
        { name: 'b', path: 'b.js', gzip: '1 kB', warnAt: 75 },
        { name: 'c', path: 'c.js', gzip: '1 kB', warnAt: null },
      ],
      package: { size: '2 kB', warnAt: '95.5%' },
    });
    assert.deepEqual(
      config.checks.map((c) => c.warnAt),
      [90, 75, null],
    );
    assert.equal(config.package?.warnAt, 95.5);
    fails({ warnAt: '0%', checks: [{ path: 'x' }] }, /warnAt: cannot read "0%"/);
    fails({ checks: [{ path: 'x', warnAt: '120%' }] }, /checks\[0\]\.warnAt/);
    fails({ checks: [{ path: 'x', warnAt: '1 kB' }] }, /percentage of the limit/);
    fails({ package: { warnAt: true } }, /package\.warnAt/);
  });

  it('names a check after its patterns when no name is given', () => {
    assert.equal(parseConfig({ checks: [{ path: ['a/*.js', 'b/*.js'] }] }).checks[0]!.name, 'a/*.js, b/*.js');
  });

  it('accepts package: true and a top-level maxIncrease default', () => {
    const c = parseConfig({
      package: true,
      maxIncrease: '5%',
      checks: [{ path: 'x', maxIncrease: '1 kB' }, { path: 'y' }],
    });
    assert.deepEqual(c.package?.maxIncrease, { percent: 5 });
    assert.deepEqual(c.checks[0]!.maxIncrease, { bytes: 1000 });
    assert.deepEqual(c.checks[1]!.maxIncrease, { percent: 5 });
  });

  it('explains what is wrong', () => {
    fails([], /JSON object/);
    fails({}, /nothing to check/);
    fails({ checks: {} }, /must be a list/);
    fails({ checks: [{}] }, /checks\[0\]\.path/);
    fails({ checks: [{ path: '' }] }, /checks\[0\]\.path/);
    fails({ checks: [{ path: 'a', gzip: 'big' }] }, /checks\[0\]\.gzip: cannot read size "big"/);
    fails({ checks: [{ path: 'a', limit: '1 kB' }] }, /unknown option "limit"/);
    fails({ checks: [{ path: 'a' }, { path: 'a' }] }, /duplicate check name "a"/);
    fails({ checks: [{ path: 'a', perFile: 'yes' }] }, /perFile/);
    fails({ checks: [{ path: 'a', maxIncrease: 'some' }] }, /maxIncrease/);
    fails({ package: 'yes' }, /"package" must be/);
    fails({ package: { entryCount: 1.5 } }, /entryCount/);
    fails({ package: { tarball: 1 } }, /unknown option "tarball"/);
    fails({ checks: [], extra: 1 }, /unknown option "extra"/);
  });

  it('reports unreadable and invalid files', () => {
    const dir = tempDir();
    assert.throws(() => loadConfig(join(dir, 'missing.json')), /cannot read config file/);
    writeFileSync(join(dir, 'bad.json'), '{ nope');
    assert.throws(() => loadConfig(join(dir, 'bad.json')), /not valid JSON/);
  });
});
