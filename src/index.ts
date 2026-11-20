export { loadSnapshot, measureAtRef, type RefOptions } from './base.js';
export { HELP, run } from './cli/run.js';
export { compare } from './compare.js';
export { loadConfig, parseConfig } from './config.js';
export { GuardError } from './errors.js';
export { expandGlobs, globBase, globToRegExp } from './glob.js';
export { MARKER, renderMarkdown, renderText } from './markdown.js';
export { type MeasureOptions, measureProject } from './measure.js';
export { packSize, parsePackOutput } from './pack.js';
export { formatDiff, formatSize, measure, parseIncrease, parseSize } from './size.js';
export type {
  CheckConfig,
  CheckResult,
  Comparison,
  Config,
  FileResult,
  Increase,
  Metric,
  PackageConfig,
  PackageResult,
  Report,
  Row,
  Sizes,
  Status,
} from './types.js';
export { METRICS } from './types.js';
export { VERSION } from './version.js';
