# pkg-size-guard

[![CI](https://github.com/saizul/pkg-size-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/saizul/pkg-size-guard/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/saizul/pkg-size-guard)](https://github.com/saizul/pkg-size-guard/releases)
[![npm (GitHub Packages)](https://img.shields.io/badge/npm-%40saizul%2Fpkg--size--guard-blue)](https://github.com/saizul/pkg-size-guard/pkgs/npm/pkg-size-guard)
![Node 20+](https://img.shields.io/badge/node-20%2B-blue)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Size budgets for your bundles and your npm package, checked in CI, with a
Markdown diff your pull requests can show.

- **Budgets per file group**: globs plus raw, gzip and brotli limits
  (`node:zlib`, gzip level 9, brotli quality 11), as a total or per file.
- **npm package size** from `npm pack --dry-run --json`: tarball size,
  unpacked size and file count, so a stray `.map` folder or test fixture
  never ships by accident.
- **Diff against a base**: a saved JSON snapshot, or any git ref (checked
  out in a temporary worktree and optionally built there).
- **Fail on growth**, not only on absolute limits: `"maxIncrease": "5%"`.
- **Markdown table** ready for a PR comment or `$GITHUB_STEP_SUMMARY`, and a
  composite **GitHub Action** that writes it to the job summary.
- Exit code 1 when a budget is exceeded. One small CLI, zero runtime
  dependencies, Node 20+.

```console
$ pkg-size-guard --base-ref origin/main --base-build "npm ci && npm run build"
    Check                         Size     Base          Change   Limit
ok  library (ESM) (gzip)       11.91 kB  11.52 kB  +390 B (+3.4%)   15 kB
ok  library (ESM) (brotli)     10.29 kB   9.97 kB  +320 B (+3.2%)   13 kB
ok  npm package (tarball)      26.77 kB  26.41 kB  +360 B (+1.4%)   40 kB
ok  npm package (unpacked)     162.2 kB  160.1 kB  +2.1 kB (+1.3%) 220 kB

All 4 size budgets passed.
```

And in the pull request:

> ### Size report
>
> **1 of 3 size checks failed.**
>
> |  | Check | Size | Base | Change | Limit |
> |---|---|---|---|---|---|
> | ✅ | entry <sub>gzip</sub> | 71.2 kB | 70.9 kB | +310 B (+0.4%) | 80 kB |
> | ❌ | styles <sub>gzip</sub> | 15.4 kB (420 B over the limit) | 12.1 kB | +3.3 kB (+27%) | 15 kB |
> | ✅ | npm package <sub>tarball</sub> | 48.1 kB | 48.1 kB | 0 B | 50 kB |

## Contents

- [Quick start](#quick-start)
- [Install](#install)
- [Configuration](#configuration)
- [CLI](#cli)
- [Comparing with a base](#comparing-with-a-base)
- [GitHub Action](#github-action)
- [Library API](#library-api)
- [Examples](#examples)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Quick start

1. Add `size-guard.json` next to your `package.json`:

   ```json
   {
     "checks": [
       { "name": "app", "path": "dist/assets/*.js", "gzip": "120 kB" },
       { "name": "styles", "path": "dist/assets/*.css", "gzip": "20 kB" }
     ],
     "package": { "size": "50 kB" }
   }
   ```

2. Build, then run it:

   ```console
   $ npm run build
   $ npx @saizul/pkg-size-guard
   ```

3. In GitHub Actions, add the action after your build step:

   ```yaml
   - uses: actions/checkout@v4
     with:
       fetch-depth: 0
   - run: npm ci && npm run build
   - uses: saizul/pkg-size-guard@v0.1.0
     with:
       base-ref: ${{ github.event.pull_request.base.sha }}
       base-build: npm ci --ignore-scripts && npm run build
   ```

   The table appears in the job summary, and the job fails if a budget is
   exceeded.

## Install

The package is published to GitHub Packages as `@saizul/pkg-size-guard`.
Tell npm where the `@saizul` scope lives (once per project or in
`~/.npmrc`):

```console
$ echo "@saizul:registry=https://npm.pkg.github.com" >> .npmrc
$ npm install --save-dev @saizul/pkg-size-guard
```

GitHub Packages needs a token with `read:packages` even for public packages;
see [Authenticating to GitHub Packages](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages).
The GitHub Action needs no install: it builds itself from this repository.

Then add a script:

```json
{ "scripts": { "size": "pkg-size-guard" } }
```

## Configuration

`size-guard.json`:

```json
{
  "checks": [
    {
      "name": "entry",
      "path": "dist/assets/index-*.js",
      "gzip": "80 kB",
      "brotli": "70 kB"
    },
    {
      "name": "lazy chunks",
      "path": ["dist/assets/*.js", "!dist/assets/index-*.js"],
      "gzip": "30 kB",
      "perFile": true
    },
    { "name": "styles", "path": "dist/**/*.css", "raw": "100 kB", "ignore": ["**/vendor/**"] }
  ],
  "package": { "path": ".", "size": "50 kB", "unpackedSize": "250 kB", "entryCount": 60 },
  "maxIncrease": "10%"
}
```

### Checks

| Key           | Description |
| ------------- | ----------- |
| `path`        | A glob or a list of globs, relative to the project directory. `!pattern` excludes. Required. |
| `name`        | Name in reports and for matching the base. Default: the patterns. Must be unique. |
| `raw`         | Limit for the uncompressed size. |
| `gzip`        | Limit for the gzip size (level 9). |
| `brotli`      | Limit for the brotli size (quality 11). |
| `ignore`      | More globs to exclude, e.g. `["**/*.map"]`. |
| `perFile`     | `true` to report and limit every matched file on its own instead of the total. |
| `maxIncrease` | Maximum growth compared with the base: `"5%"` or a size such as `"2 kB"`. Overrides the top-level value; `null` turns it off. |

The report has one row per limit you set. A check without limits shows its
gzip size for information. **A check that matches no files fails**, because
that usually means the build or the glob is broken.

Sizes are numbers of bytes or strings: `"512 B"`, `"10 kB"` (1000 bytes),
`"8 KiB"` (1024 bytes), `"1.5 MB"`. Reports use decimal units (kB, MB),
like npm.

Globs support `*`, `**`, `?`, `[abc]`, `[!abc]` and `{a,b}`. Paths always
use `/`, also on Windows. `node_modules` and `.git` are skipped unless a
pattern names them. Dotfiles are matched like other files.

### Package

`"package": true` or an object:

| Key             | Default | Description |
| --------------- | ------- | ----------- |
| `path`          | `.`     | Directory with the `package.json`, for monorepos. |
| `size`          |         | Limit for the packed `.tgz`. |
| `unpackedSize`  |         | Limit for the unpacked size. |
| `entryCount`    |         | Limit for the number of files in the package. |
| `ignoreScripts` | `true`  | Pass `--ignore-scripts`, so `prepack` and `prepare` do not run. Build first. |
| `maxIncrease`   |         | As for checks; applies to the tarball and unpacked size. |

The package rows always show the tarball and the unpacked size; the file
count shows when `entryCount` is set.

### Top level

`maxIncrease` at the top level is the default for every check and the
package.

## CLI

```text
Usage: pkg-size-guard [options]

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
```

| Exit code | Meaning |
| --------- | ------- |
| `0`       | Every budget passed (or `--no-fail`). |
| `1`       | A limit or `maxIncrease` was exceeded, or a check matched no files. |
| `2`       | Usage, config, git or npm error. The message says what went wrong. |

The terminal table goes to stdout, so `--json` output can be piped to `jq`.
Output of `--base-build` goes to stderr.

## Comparing with a base

### A snapshot file

```console
$ pkg-size-guard --save size-snapshot.json      # on main
$ pkg-size-guard --base size-snapshot.json      # on a branch
```

A snapshot holds the raw, gzip and brotli size of every matched file plus
the package figures, so you can change limits later and still compare.
Rows are matched by check name (and by file path for `perFile` checks); a
row without a match shows `new`.

### A git ref

```console
$ pkg-size-guard --base-ref main
$ pkg-size-guard --base-ref v1.4.0 --base-build "npm ci && npm run build"
```

pkg-size-guard runs `git worktree add --detach` into a temporary
directory, runs `--base-build` there (in the same subdirectory as `--cwd`,
so monorepos work), measures it with **your current config**, and removes
the worktree, even when something fails. Your working copy is never
touched.

Without `--base-build` only files that are committed at that ref are
measured, which suits projects that commit their `dist/`. In CI, make sure
the ref exists locally: `actions/checkout` with `fetch-depth: 0`, or
`git fetch origin main`.

## GitHub Action

```yaml
- uses: saizul/pkg-size-guard@v0.1.0
  with:
    working-directory: packages/web
    base-ref: ${{ github.event.pull_request.base.sha }}
    base-build: npm ci --ignore-scripts && npm run build
```

| Input               | Default           | Description |
| ------------------- | ----------------- | ----------- |
| `config`            | `size-guard.json` | Config file, relative to `working-directory`. |
| `working-directory` | `.`               | Project directory. |
| `base-ref`          |                   | Git ref to compare with. Needs the commit fetched. |
| `base-build`        |                   | Command to build the base. |
| `base-snapshot`     |                   | Snapshot file to compare with instead. |
| `save-snapshot`     |                   | Write the current sizes to this file. |
| `title`             | `Size report`     | Heading of the report. |
| `summary`           | `true`            | Write the report to the job summary. |
| `fail`              | `true`            | Fail the step when a budget is exceeded. |

| Output          | Description |
| --------------- | ----------- |
| `markdown-file` | Path of the Markdown report. |
| `exceeded`      | `"true"` when a budget was exceeded. |

The action is a composite action: it needs Node on the runner (GitHub's
hosted runners have it; `actions/setup-node` works too) and builds itself
with `npm ci` the first time. It does not post comments itself, so it
needs no write permissions. To keep one sticky comment on the pull request,
use `markdown-file`; the report starts with a hidden
`<!-- pkg-size-guard -->` marker to find it again. A complete workflow is in
[`examples/pr-comment.yml`](examples/pr-comment.yml).

## Library API

```ts
import { compare, loadConfig, measureProject, renderMarkdown } from '@saizul/pkg-size-guard';

const config = loadConfig('size-guard.json');
const current = measureProject(config, process.cwd());
const result = compare(config, current /*, base */);

console.log(renderMarkdown(result));
if (result.failures) process.exitCode = 1;
```

| Export | Description |
| ------ | ----------- |
| `loadConfig(file)`, `parseConfig(json)` | Read and validate a config; throw `GuardError` with a clear message. |
| `measureProject(config, cwd, { pack? })` | Measure everything. `pack` replaces `npm pack` (e.g. for pnpm). |
| `measureAtRef(config, cwd, ref, { build? })` | Measure a git ref in a temporary worktree. |
| `loadSnapshot(file)` | Read a snapshot saved with `--save`. |
| `compare(config, current, base?)` | Rows with sizes, base, limits, statuses and problems. |
| `renderMarkdown(result, title?)`, `renderText(result)` | Render the table. |
| `measure(bytes)` | `{ raw, gzip, brotli }` for a buffer. |
| `packSize(dir)`, `parsePackOutput(stdout)` | `npm pack --dry-run --json`. |
| `expandGlobs(cwd, patterns, ignore?)`, `globToRegExp(glob)` | The glob matcher. |
| `parseSize(text)`, `formatSize(bytes)`, `formatDiff(size, base)` | Size helpers. |
| `run(argv, io)` | The CLI, in-process. |

ESM, CommonJS and TypeScript declarations are included.

## Examples

- [`examples/size-guard.vite-app.json`](examples/size-guard.vite-app.json):
  an app with an entry chunk, lazy chunks per file, CSS and a growth limit.
- [`examples/size-guard.library.json`](examples/size-guard.library.json):
  a library with an ESM build, a browser bundle and package limits.
- [`examples/pr-comment.yml`](examples/pr-comment.yml): compare with the
  base branch and keep one updated PR comment.
- [`examples/snapshot.yml`](examples/snapshot.yml): store a snapshot from
  `main` as an artifact and compare pull requests with it.
- [`examples/api.mjs`](examples/api.mjs): the library API.
- This repository checks its own size with [`size-guard.json`](size-guard.json)
  in CI.

## FAQ

**How is this different from size-limit?**
size-limit measures what your code costs a user after bundling (it runs
esbuild or webpack and can run the code). pkg-size-guard measures files you
already built and the npm tarball, with no bundler and no dependencies. It
is a good fit when your build already produces the final files, for CSS,
and for "did my package just double in size?" checks.

**Why gzip level 9 and brotli quality 11?**
They are what CDNs and build tools use for static assets, and they are
stable, so numbers do not jump between runs. Your server may use lower
levels for dynamic compression; the limits are about relative change
anyway.

**Can the numbers differ between Node versions?**
Raw and tarball sizes are exact. Compressed sizes can differ by a few bytes
between zlib versions. Compare runs made with the same Node version (the
action does, because base and head are measured in the same job).

**Does it work with pnpm, Yarn or Bun?**
Checks work with anything. The package check runs `npm pack`, which reads
`package.json`, `files` and `.npmignore` like every package manager does;
npm only needs to be installed. Workspace protocol dependencies do not
matter for the size.

**Does it upload anything?**
No. It reads files, runs `git` and `npm pack --dry-run` locally and writes
only the files you ask for.

## Roadmap

Ideas marked **good first issue** are small and self-contained. Comment on
the issue to claim one.

- **good first issue**: a `--format github` option that prints
  `::error file=...::` annotations for failed rows.
- **good first issue**: an `init` command that writes a starter
  `size-guard.json` from the files in `dist/`.
- **good first issue**: a `"show": ["raw", "gzip"]` option to choose which
  sizes appear in the table without setting limits.
- **good first issue**: `--only <name>` to run a single check.
- **good first issue**: JSON Schema for `size-guard.json`, for editor
  autocompletion.
- **good first issue**: a `"zstd"` metric (`zlib.zstdCompressSync`) once
  Node 20 support is dropped.
- Package checks with `pnpm pack` and `yarn pack`.
- Time-to-download estimates (3G, 4G) per row.

## Contributing

Bug reports, new options, docs and examples from real projects are all
welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains the setup and lists
beginner-friendly issues.

```console
$ git clone https://github.com/saizul/pkg-size-guard.git
$ cd pkg-size-guard
$ npm ci
$ npm test
```

Please follow the [code of conduct](CODE_OF_CONDUCT.md). Security problems
go through [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Saizul Amin
