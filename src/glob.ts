import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SPECIAL = /[*?[{]/;
const escapeRe = (s: string) => s.replace(/[.+^$()|\\/\]}]/g, '\\$&');

function body(glob: string): string {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:[^/]*/)*';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{' && glob.indexOf('}', i) > i) {
      const end = glob.indexOf('}', i);
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map(body)
        .join('|')})`;
      i = end;
    } else if (c === '[' && glob.indexOf(']', i) > i + 1) {
      const end = glob.indexOf(']', i);
      const cls = glob.slice(i + 1, end).replace(/\\/g, '\\\\');
      re += `[${cls[0] === '!' ? `^${cls.slice(1)}` : cls}]`;
      i = end;
    } else re += escapeRe(c);
  }
  return re;
}

/**
 * Converts a glob to a regular expression for forward-slash paths.
 * Supports `*`, `**`, `?`, `[abc]`, `[!abc]` and `{a,b}`.
 */
export function globToRegExp(glob: string): RegExp {
  return new RegExp(`^${body(normalize(glob))}$`);
}

const normalize = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/** The directory part of a glob before its first wildcard, e.g. `dist/assets` for `dist/assets/*.js`. */
export function globBase(glob: string): string {
  const parts = normalize(glob).split('/');
  const out: string[] = [];
  for (const part of parts.slice(0, -1)) {
    if (SPECIAL.test(part)) break;
    out.push(part);
  }
  return out.join('/');
}

function walk(root: string, dir: string, skip: (name: string) => boolean, out: string[]): void {
  let entries: import('node:fs').Dirent[];
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!skip(e.name)) walk(root, rel, skip, out);
    } else if (e.isFile()) out.push(rel);
  }
}

/**
 * Finds files under `cwd` matching the patterns. Patterns starting with `!`, and
 * `ignore`, exclude. `node_modules` and `.git` are skipped unless a pattern names them.
 * Returns sorted, forward-slash paths relative to `cwd`.
 */
export function expandGlobs(cwd: string, patterns: string[], ignore: string[] = []): string[] {
  const include = patterns.filter((p) => !p.startsWith('!')).map(normalize);
  const exclude = [...patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1)), ...ignore].map((p) =>
    globToRegExp(p),
  );
  const found = new Set<string>();
  for (const pattern of include) {
    const re = globToRegExp(pattern);
    const keep = new Set(pattern.split('/').filter((s) => s === 'node_modules' || s === '.git'));
    const files: string[] = [];
    walk(
      cwd,
      globBase(pattern),
      (name) => (name === 'node_modules' || name === '.git') && !keep.has(name),
      files,
    );
    for (const f of files) if (re.test(f) && !exclude.some((x) => x.test(f))) found.add(f);
  }
  return [...found].sort();
}
