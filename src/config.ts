import { readFileSync } from 'node:fs';
import { GuardError } from './errors.js';
import { parseIncrease, parseSize } from './size.js';
import type { CheckConfig, Config, Increase, Metric, PackageConfig, Sizes } from './types.js';
import { METRICS } from './types.js';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const CHECK_KEYS = new Set([
  'name',
  'path',
  'ignore',
  'raw',
  'gzip',
  'brotli',
  'perFile',
  'maxIncrease',
  'warnAt',
]);
const PACKAGE_KEYS = new Set([
  'path',
  'size',
  'unpackedSize',
  'entryCount',
  'ignoreScripts',
  'maxIncrease',
  'warnAt',
]);

function strings(value: unknown, where: string): string[] {
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list) || list.some((s) => typeof s !== 'string' || !s.trim())) {
    throw new GuardError(`${where} must be a glob or a list of globs`);
  }
  return list;
}

function size(value: unknown, where: string): number | null {
  if (value === undefined || value === null) return null;
  const n = parseSize(value);
  if (n === null)
    throw new GuardError(`${where}: cannot read size ${JSON.stringify(value)} (use e.g. "10 kB")`);
  return n;
}

function increase(value: unknown, where: string, fallback: Increase | null): Increase | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const inc = parseIncrease(value);
  if (!inc) throw new GuardError(`${where}: cannot read ${JSON.stringify(value)} (use e.g. "5%" or "1 kB")`);
  return inc;
}

function warnAt(value: unknown, where: string, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\s*\d+(\.\d+)?\s*%\s*$/.test(value)
        ? Number(value.replace('%', ''))
        : Number.NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 100) {
    throw new GuardError(
      `${where}: cannot read ${JSON.stringify(value)} (use a percentage of the limit, e.g. "90%")`,
    );
  }
  return n;
}

function unknownKeys(obj: Record<string, unknown>, allowed: Set<string>, where: string) {
  const extra = Object.keys(obj).filter((k) => !allowed.has(k) && k !== '$schema');
  if (extra.length) throw new GuardError(`${where}: unknown option ${extra.map((k) => `"${k}"`).join(', ')}`);
}

/** Validates a parsed size-guard.json and fills in defaults. */
export function parseConfig(input: unknown): Config {
  if (!isObject(input)) throw new GuardError('the config must be a JSON object');
  unknownKeys(input, new Set(['checks', 'package', 'maxIncrease', 'warnAt']), 'config');
  const defaultIncrease = increase(input.maxIncrease, 'maxIncrease', null);
  const defaultWarnAt = warnAt(input.warnAt, 'warnAt', null);
  const rawChecks = input.checks ?? [];
  if (!Array.isArray(rawChecks)) throw new GuardError('"checks" must be a list');

  const names = new Set<string>();
  const checks = rawChecks.map((c, i): CheckConfig => {
    const where = `checks[${i}]`;
    if (!isObject(c)) throw new GuardError(`${where} must be an object`);
    unknownKeys(c, CHECK_KEYS, where);
    const path = strings(c.path, `${where}.path`);
    if (c.name !== undefined && (typeof c.name !== 'string' || !c.name.trim())) {
      throw new GuardError(`${where}.name must be a non-empty string`);
    }
    const name = (c.name as string | undefined) ?? path.join(', ');
    if (names.has(name)) throw new GuardError(`${where}: duplicate check name "${name}"`);
    names.add(name);
    const limits: Partial<Sizes> = {};
    for (const m of METRICS) {
      const n = size(c[m], `${where}.${m}`);
      if (n !== null) limits[m as Metric] = n;
    }
    if (c.perFile !== undefined && typeof c.perFile !== 'boolean') {
      throw new GuardError(`${where}.perFile must be true or false`);
    }
    return {
      name,
      path,
      ignore: c.ignore === undefined ? [] : strings(c.ignore, `${where}.ignore`),
      limits,
      perFile: c.perFile === true,
      maxIncrease: increase(c.maxIncrease, `${where}.maxIncrease`, defaultIncrease),
      warnAt: warnAt(c.warnAt, `${where}.warnAt`, defaultWarnAt),
    };
  });

  let pkg: PackageConfig | null = null;
  const p = input.package;
  if (p === true || isObject(p)) {
    const o = p === true ? {} : p;
    unknownKeys(o, PACKAGE_KEYS, 'package');
    if (o.path !== undefined && typeof o.path !== 'string')
      throw new GuardError('package.path must be a string');
    if (o.ignoreScripts !== undefined && typeof o.ignoreScripts !== 'boolean') {
      throw new GuardError('package.ignoreScripts must be true or false');
    }
    const entryCount = o.entryCount ?? null;
    if (
      entryCount !== null &&
      (typeof entryCount !== 'number' || !Number.isInteger(entryCount) || entryCount < 0)
    ) {
      throw new GuardError('package.entryCount must be a whole number');
    }
    pkg = {
      path: (o.path as string | undefined) ?? '.',
      size: size(o.size, 'package.size'),
      unpackedSize: size(o.unpackedSize, 'package.unpackedSize'),
      entryCount: entryCount as number | null,
      ignoreScripts: o.ignoreScripts !== false,
      maxIncrease: increase(o.maxIncrease, 'package.maxIncrease', defaultIncrease),
      warnAt: warnAt(o.warnAt, 'package.warnAt', defaultWarnAt),
    };
  } else if (p !== undefined && p !== false && p !== null) {
    throw new GuardError('"package" must be true, false or an object');
  }

  if (!checks.length && !pkg) throw new GuardError('nothing to check: add "checks" or "package"');
  return { checks, package: pkg };
}

/** Reads and validates a config file. */
export function loadConfig(file: string): Config {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new GuardError(`cannot read config file ${file}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new GuardError(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  return parseConfig(json);
}
