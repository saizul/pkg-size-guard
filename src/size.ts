import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import type { Increase, Sizes } from './types.js';

const UNITS: Record<string, number> = {
  b: 1,
  kb: 1000,
  k: 1000,
  kib: 1024,
  mb: 1000 ** 2,
  m: 1000 ** 2,
  mib: 1024 ** 2,
  gb: 1000 ** 3,
  gib: 1024 ** 3,
};

/**
 * Parses a size such as `10 kB`, `1.5MB`, `512 B`, `8 KiB` or a plain number of bytes.
 * `kB`/`KB` mean 1000 bytes, `KiB` means 1024. Returns `null` when it cannot be parsed.
 */
export function parseSize(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? Math.round(input) : null;
  if (typeof input !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)\s*$/i.exec(input);
  if (!m) return null;
  const unit = UNITS[(m[2] || 'b').toLowerCase()];
  return unit === undefined ? null : Math.round(Number(m[1]) * unit);
}

/** Parses `maxIncrease`: a percentage (`'5%'`) or a size (`'1 kB'`). */
export function parseIncrease(input: unknown): Increase | null {
  if (typeof input === 'string' && /%\s*$/.test(input)) {
    const n = Number(input.replace('%', '').trim());
    return Number.isFinite(n) && n >= 0 ? { percent: n } : null;
  }
  const bytes = parseSize(input);
  return bytes === null ? null : { bytes };
}

/** Formats bytes for people: `512 B`, `4.21 kB`, `1.5 MB` (decimal units). */
export function formatSize(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs < 1000) return `${bytes} B`;
  const [div, unit] =
    abs < 1000 ** 2 ? [1000, 'kB'] : abs < 1000 ** 3 ? [1000 ** 2, 'MB'] : [1000 ** 3, 'GB'];
  const value = bytes / div;
  const digits = Math.abs(value) >= 100 ? 1 : 2;
  return `${Number(value.toFixed(digits))} ${unit}`;
}

/** Formats a change: `+110 B (+2.7%)`, `-1.2 kB (-10%)`, `0 B`, or `new`. */
export function formatDiff(size: number, base: number | null): string {
  if (base === null) return 'new';
  const diff = size - base;
  if (diff === 0) return '0 B';
  const sign = diff > 0 ? '+' : '-';
  const text = `${sign}${formatSize(Math.abs(diff))}`;
  if (base === 0) return text;
  const pct = (diff / base) * 100;
  const rounded = Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  return `${text} (${sign}${rounded.replace('-', '')}%)`;
}

/** Raw, gzip (level 9) and brotli (quality 11) sizes of some content. */
export function measure(content: Uint8Array): Sizes {
  return {
    raw: content.length,
    gzip: gzipSync(content, { level: 9 }).length,
    brotli: brotliCompressSync(content, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: content.length,
      },
    }).length,
  };
}
