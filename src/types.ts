/** A size measured three ways. */
export type Metric = 'raw' | 'gzip' | 'brotli';

export const METRICS: readonly Metric[] = ['raw', 'gzip', 'brotli'];

/** Sizes in bytes. */
export type Sizes = Record<Metric, number>;

/** One entry of `checks` in size-guard.json, after validation. */
export interface CheckConfig {
  /** Shown in reports and used to match the base. Defaults to the first pattern. */
  name: string;
  /** Glob patterns, relative to the project directory. A leading `!` excludes. */
  path: string[];
  /** Extra patterns to exclude. */
  ignore: string[];
  /** Limits in bytes. */
  limits: Partial<Sizes>;
  /** Report and limit every matched file on its own instead of the total. */
  perFile: boolean;
  /** Maximum growth compared with the base (`'5%'` or a size). */
  maxIncrease: Increase | null;
}

/** The `package` section of size-guard.json, after validation. */
export interface PackageConfig {
  /** Directory with the package.json, relative to the project directory. */
  path: string;
  /** Limit for the packed tarball, in bytes. */
  size: number | null;
  /** Limit for the unpacked size, in bytes. */
  unpackedSize: number | null;
  /** Limit for the number of files in the package. */
  entryCount: number | null;
  /** Run `npm pack` with `--ignore-scripts` (default `true`). */
  ignoreScripts: boolean;
  maxIncrease: Increase | null;
}

export type Increase = { percent: number } | { bytes: number };

export interface Config {
  checks: CheckConfig[];
  package: PackageConfig | null;
}

/** Measured sizes of one file. */
export interface FileResult extends Sizes {
  path: string;
}

/** Measured sizes of one check (the sum of its files). */
export interface CheckResult extends Sizes {
  name: string;
  files: FileResult[];
}

/** Measured sizes of the npm package. */
export interface PackageResult {
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  entryCount: number;
}

/** Everything measured in one run. Saved as a snapshot with `--save`. */
export interface Report {
  tool: 'pkg-size-guard';
  version: 1;
  checks: CheckResult[];
  package: PackageResult | null;
}

export type Status = 'pass' | 'fail' | 'info';

/** One line of the comparison table. */
export interface Row {
  /** Check name, or `npm package`. */
  name: string;
  /** What is measured: a compression, or a package figure. */
  metric: Metric | 'tarball' | 'unpacked' | 'files';
  size: number | null;
  base: number | null;
  limit: number | null;
  status: Status;
  /** Why the row failed. */
  problems: string[];
  /** Per-file breakdown for checks with several files. */
  files?: FileResult[];
}

export interface Comparison {
  rows: Row[];
  /** `true` when there was a base to compare with. */
  hasBase: boolean;
  /** Number of failed rows. */
  failures: number;
}
