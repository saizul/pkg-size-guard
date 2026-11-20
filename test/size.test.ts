import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { formatDiff, formatSize, measure, parseIncrease, parseSize } from '../src/index.js';

describe('parseSize', () => {
  it('reads decimal and binary units, case-insensitively', () => {
    assert.equal(parseSize('512 B'), 512);
    assert.equal(parseSize('10 kB'), 10_000);
    assert.equal(parseSize('10KB'), 10_000);
    assert.equal(parseSize('10k'), 10_000);
    assert.equal(parseSize('8 KiB'), 8192);
    assert.equal(parseSize('1.5 MB'), 1_500_000);
    assert.equal(parseSize('2 MiB'), 2_097_152);
    assert.equal(parseSize('1 GB'), 1e9);
    assert.equal(parseSize('.5 kB'), 500);
    assert.equal(parseSize(' 42 '), 42);
    assert.equal(parseSize(1234), 1234);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'ten kB', '10 parsecs', '-1 kB', '1e3', null, undefined, {}, -5, Number.NaN]) {
      assert.equal(parseSize(bad), null, String(bad));
    }
  });
});

describe('parseIncrease', () => {
  it('reads percentages and sizes', () => {
    assert.deepEqual(parseIncrease('5%'), { percent: 5 });
    assert.deepEqual(parseIncrease('0.5 %'), { percent: 0.5 });
    assert.deepEqual(parseIncrease('1 kB'), { bytes: 1000 });
    assert.equal(parseIncrease('lots'), null);
    assert.equal(parseIncrease('-5%'), null);
  });
});

describe('formatSize and formatDiff', () => {
  it('formats with decimal units', () => {
    assert.equal(formatSize(0), '0 B');
    assert.equal(formatSize(999), '999 B');
    assert.equal(formatSize(1000), '1 kB');
    assert.equal(formatSize(4213), '4.21 kB');
    assert.equal(formatSize(123_456), '123.5 kB');
    assert.equal(formatSize(1_500_000), '1.5 MB');
    assert.equal(formatSize(2_000_000_000), '2 GB');
  });

  it('formats changes with sign and percentage', () => {
    assert.equal(formatDiff(4210, 4100), '+110 B (+2.7%)');
    assert.equal(formatDiff(9000, 10_000), '-1 kB (-10%)');
    assert.equal(formatDiff(500, 500), '0 B');
    assert.equal(formatDiff(500, null), 'new');
    assert.equal(formatDiff(500, 0), '+500 B');
    assert.equal(formatDiff(3000, 1000), '+2 kB (+200%)');
  });
});

describe('measure', () => {
  it('returns raw, gzip and brotli sizes that match node:zlib', () => {
    const content = Buffer.from('export const answer = 42;\n'.repeat(200));
    const sizes = measure(content);
    assert.equal(sizes.raw, content.length);
    assert.equal(sizes.gzip, gzipSync(content, { level: 9 }).length);
    assert.ok(sizes.brotli <= brotliCompressSync(content).length);
    assert.ok(sizes.gzip < sizes.raw / 10);
  });

  it('handles empty files', () => {
    assert.equal(measure(new Uint8Array()).raw, 0);
  });
});
