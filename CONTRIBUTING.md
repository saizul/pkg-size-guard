# Contributing

Thanks for helping improve pkg-size-guard. Bug reports with real configs,
new options, docs and examples are all welcome. If you are new to open
source, start with one of the [beginner issues](#good-first-issues) below.

## Reporting a bug

Open an issue with:

- your `size-guard.json` and the command (or action inputs) you ran
- the output, and what you expected
- your pkg-size-guard, Node, npm and git versions and the OS

## Development setup

You need Node 20 or newer, npm and git.

```console
$ git clone https://github.com/saizul/pkg-size-guard.git
$ cd pkg-size-guard
$ npm ci
$ npm test              # builds ESM + CJS, compiles the tests and runs node:test
$ npm run lint          # biome lint + tsc --noEmit
$ npm run format        # biome format --write
$ npm run format:check  # what CI runs
```

Try the CLI from the build, on the test fixture or on this repository:

```console
$ node dist/esm/cli.js --cwd test/fixtures/basic
$ node dist/esm/cli.js --base-ref HEAD~1 --base-build "npm ci --ignore-scripts && npm run build"
```

## Guidelines

- **Zero runtime dependencies.** Only Node's standard library. Development
  tools go in `devDependencies`.
- **No shell for user data.** Only `--base-build` and `npm pack` (a fixed
  command) go through a shell. Run git with an argument list.
- **No network in tests.** Tests use the fixture in `test/fixtures/basic`,
  temporary directories and temporary git repositories. `npm pack
  --dry-run` works offline.
- **Do not assert exact compressed sizes** in tests: zlib can differ by a
  few bytes between Node versions. Compute the expected value with
  `node:zlib` in the test, or use hand-written reports.
- **Config keys and exit codes are public API.** Add, do not rename.
- Every change comes with a test and a line in the `Unreleased` section of
  `CHANGELOG.md`.

## Project layout

```text
src/
  config.ts    reading and validating size-guard.json
  glob.ts      the glob matcher and directory walker
  size.ts      parse/format sizes, measure raw/gzip/brotli
  measure.ts   measure a project directory
  pack.ts      npm pack --dry-run --json
  base.ts      snapshots and git worktrees for --base-ref
  compare.ts   rows, limits, maxIncrease, statuses
  markdown.ts  Markdown and terminal tables
  cli.ts, cli/ command-line interface
action.yml     the composite GitHub Action
test/          node:test suites and the fixture project
examples/      configs, workflows and an API example
```

## Good first issues

These are deliberately small. Each one lists where to start.

1. **`--format github` annotations**: print `::error title=Size budget::...`
   for every failed row. Add the flag in `src/cli/run.ts` and a renderer in
   `src/markdown.ts`.
2. **`init` command**: `pkg-size-guard init` writes a starter
   `size-guard.json` with one check per file type found in `dist/`, with
   limits 10% above the current sizes. Start in `src/cli/run.ts`.
3. **`--only <name>`**: run only the checks with that name. Filter
   `config.checks` in `src/cli/run.ts`; test in `test/cli.test.ts`.
4. **JSON Schema**: add `size-guard.schema.json` describing the config and
   mention `"$schema"` in the README (the key is already allowed).
5. **`show` option**: `"show": ["raw", "gzip"]` on a check to choose the
   rows without setting limits. See `metricsOf()` in `src/compare.ts`.
6. **Sort the details table**: list files largest first in the
   `<details>` breakdown in `src/markdown.ts`.
7. **A Turborepo / npm workspaces example**: an `examples/monorepo.md` with
   one config per package and the action in a matrix.
8. **Better error for a shallow clone**: when `--base-ref` fails because the
   commit is missing, suggest `fetch-depth: 0`. See `measureAtRef()` in
   `src/base.ts`.

## Pull requests

Keep them focused: one fix or feature per pull request. Describe what
changed and how you tested it; the template has a short checklist. CI runs
lint, format check and the tests on Node 20 and 22 on Linux, and Node 22 on
Windows and macOS, and runs the action on this repository.
