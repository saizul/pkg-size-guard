# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use GitHub's
private vulnerability reporting ("Report a vulnerability" under the
repository's **Security** tab). You will get an answer within a week.

## Scope

pkg-size-guard runs in CI, often on pull requests from people you do not
know. Reports in these areas are especially welcome:

- **Command injection.** File names, check names, git refs and config
  values must never be run as shell commands. Only `--base-build` (and the
  action's `base-build` input) is meant to run a shell command; anything
  else that reaches a shell is a bug.
- **Markdown injection.** Check names and file paths are escaped in the
  table. A way to break out of the table or inject HTML into a pull
  request comment through them is a bug.
- **Path traversal.** Globs should only match files inside the project
  directory.
- **Worktree cleanup.** A way to make `--base-ref` leave a worktree behind
  or touch the working copy.

## Using it safely on pull requests

`base-build` runs code from the base branch, and your normal build runs code
from the pull request. On `pull_request` events from forks GitHub gives the
job a read-only token, which is what you want. Do not run untrusted builds
with `pull_request_target` and a write token; post comments from a
separate workflow instead.
