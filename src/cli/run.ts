import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSnapshot, measureAtRef } from '../base.js';
import { compare } from '../compare.js';
import { loadConfig } from '../config.js';
import { GuardError } from '../errors.js';
import { renderMarkdown, renderText } from '../markdown.js';
import { type MeasureOptions, measureProject } from '../measure.js';
import type { Report } from '../types.js';
import { VERSION } from '../version.js';

export const HELP = `Usage: pkg-size-guard [options]

Checks JS/CSS bundles and the npm package against the size budgets in
size-guard.json, and compares them with a base.

Options:
  -c, --config <file>    config file (default: size-guard.json)
      --cwd <dir>        project directory (default: current directory)
      --base <file>      compare with a snapshot saved by --save
      --base-ref <ref>   compare with a git ref (branch, tag or commit),
                         measured in a temporary git worktree
      --base-build <cmd> shell command to run in that worktree first,
                         e.g. "npm ci && npm run build"
      --save <file>      save the current sizes as a snapshot (JSON)
      --markdown <file>  write the Markdown report to a file
      --summary          append the Markdown report to $GITHUB_STEP_SUMMARY
      --title <text>     heading of the Markdown report (default: Size report)
      --json             print the measured sizes and rows as JSON
      --no-fail          exit 0 even when a budget is exceeded
  -h, --help             show this help
  -v, --version          show the version

Exit codes: 0 all budgets pass, 1 a budget is exceeded, 2 usage or config error.
`;

export interface RunIO {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  env?: Record<string, string | undefined>;
  cwd?: string;
  measure?: MeasureOptions;
}

interface Args {
  config: string;
  cwd: string;
  base?: string;
  baseRef?: string;
  baseBuild?: string;
  save?: string;
  markdown?: string;
  title?: string;
  summary: boolean;
  json: boolean;
  fail: boolean;
  help: boolean;
  version: boolean;
}

const VALUE = new Map([
  ['-c', 'config'],
  ['--config', 'config'],
  ['--cwd', 'cwd'],
  ['--base', 'base'],
  ['--base-ref', 'baseRef'],
  ['--base-build', 'baseBuild'],
  ['--save', 'save'],
  ['--markdown', 'markdown'],
  ['--title', 'title'],
]);
const FLAG = new Map([
  ['--summary', 'summary'],
  ['--json', 'json'],
  ['-h', 'help'],
  ['--help', 'help'],
  ['-v', 'version'],
  ['--version', 'version'],
]);

export function parseArgs(argv: string[], cwd: string): Args {
  const args: Args = {
    config: 'size-guard.json',
    cwd,
    summary: false,
    json: false,
    fail: true,
    help: false,
    version: false,
  };
  const out = args as unknown as Record<string, unknown>;
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i]!;
    let value: string | undefined;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq > 0) {
      value = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (VALUE.has(arg)) {
      value ??= argv[++i];
      if (value === undefined || value === '') throw new GuardError(`${arg} needs a value`);
      out[VALUE.get(arg)!] = value;
    } else if (FLAG.has(arg)) out[FLAG.get(arg)!] = true;
    else if (arg === '--no-fail') args.fail = false;
    else throw new GuardError(`unknown option ${arg} (see --help)`);
  }
  if (args.base && args.baseRef) throw new GuardError('use either --base or --base-ref, not both');
  if (args.baseBuild && !args.baseRef) throw new GuardError('--base-build needs --base-ref');
  return args;
}

/** Runs the CLI. Returns the exit code. */
export function run(argv: string[], io: RunIO): number {
  const env = io.env ?? process.env;
  try {
    const args = parseArgs(argv, io.cwd ?? process.cwd());
    if (args.help) {
      io.stdout(HELP);
      return 0;
    }
    if (args.version) {
      io.stdout(`${VERSION}\n`);
      return 0;
    }
    const cwd = resolve(args.cwd);
    const config = loadConfig(resolve(cwd, args.config));
    const current = measureProject(config, cwd, io.measure);
    let base: Report | null = null;
    if (args.base) base = loadSnapshot(resolve(cwd, args.base));
    else if (args.baseRef) {
      base = measureAtRef(config, cwd, args.baseRef, {
        ...io.measure,
        build: args.baseBuild,
        log: io.stderr,
      });
    }
    const result = compare(config, current, base);
    const markdown = renderMarkdown(result, args.title);

    if (args.save) writeFileSync(resolve(cwd, args.save), `${JSON.stringify(current, null, 2)}\n`);
    if (args.markdown) writeFileSync(resolve(cwd, args.markdown), markdown);
    if (args.summary) {
      if (!env.GITHUB_STEP_SUMMARY)
        throw new GuardError('--summary needs GITHUB_STEP_SUMMARY (set by GitHub Actions)');
      appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
    }
    if (args.json) io.stdout(`${JSON.stringify({ report: current, base, ...result }, null, 2)}\n`);
    else io.stdout(renderText(result));
    return result.failures && args.fail ? 1 : 0;
  } catch (e) {
    if (e instanceof GuardError) {
      io.stderr(`pkg-size-guard: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}
