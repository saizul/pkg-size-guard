# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-20

### Added

- `size-guard.json` with checks (globs, `ignore`, raw, gzip and brotli
  limits, `perFile`, `maxIncrease`) and a `package` section (tarball size,
  unpacked size, file count).
- Raw, gzip (level 9) and brotli (quality 11) sizes with `node:zlib`.
- npm package size from `npm pack --dry-run --json`, with
  `--ignore-scripts` by default.
- Comparison with a snapshot (`--save` / `--base`) or a git ref
  (`--base-ref`, measured in a temporary worktree, with `--base-build`).
- Markdown report for pull request comments and `--summary` for
  `$GITHUB_STEP_SUMMARY`; aligned terminal table; `--json` output.
- Exit codes 0 (pass), 1 (budget exceeded) and 2 (error); `--no-fail`.
- A composite GitHub Action with `markdown-file` and `exceeded` outputs.
- Library API, ESM and CommonJS builds with type declarations; no runtime
  dependencies.

[Unreleased]: https://github.com/saizul/pkg-size-guard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/saizul/pkg-size-guard/releases/tag/v0.1.0
