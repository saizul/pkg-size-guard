import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import * as esm from '../src/index.js';

const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('package', () => {
  it('the CommonJS build exposes the same API', () => {
    const cjs = require('../cjs/index.js') as typeof esm;
    assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
    assert.equal(cjs.formatSize(4213), '4.21 kB');
  });

  it('the CommonJS folder is marked as commonjs', () => {
    assert.equal(JSON.parse(read('../cjs/package.json')).type, 'commonjs');
  });

  it('has no runtime dependencies and versions agree', () => {
    const pkg = JSON.parse(read('../../package.json'));
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.version, esm.VERSION);
    assert.equal(pkg.name, '@saizul/pkg-size-guard');
    assert.equal(pkg.bin['pkg-size-guard'], './dist/esm/cli.js');
  });

  it('the CLI entry starts with a shebang', () => {
    assert.ok(read('../esm/cli.js').startsWith('#!/usr/bin/env node'));
  });

  it('the action runs the built CLI and declares its inputs', () => {
    const action = read('../../action.yml');
    assert.match(action, /using: composite/);
    assert.ok(action.includes('dist/esm/cli.js'));
    for (const input of ['config', 'working-directory', 'base-ref', 'base-build', 'base-snapshot', 'fail']) {
      assert.match(action, new RegExp(`^ {2}${input}:$`, 'm'), input);
    }
  });

  it('the README documents every CLI option, and its help text matches --help', () => {
    const readme = read('../../README.md');
    const help = esm.HELP.split('\n')
      .filter((l) => l.startsWith('  '))
      .join('\n');
    assert.ok(readme.includes(help), 'README help block is out of date');
    const options = [...read('../../src/cli/run.ts').matchAll(/\['(--[a-z-]+)'/g)].map((m) => m[1]!);
    assert.ok(options.length >= 12);
    for (const option of [...options, '--no-fail']) {
      assert.ok(readme.includes(`${option} `), option);
    }
  });
});
