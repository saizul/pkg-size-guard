import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { expandGlobs, globBase, globToRegExp } from '../src/index.js';
import { FIXTURE, tempDir } from './helpers.js';

const matches = (glob: string, path: string) => globToRegExp(glob).test(path);

describe('globToRegExp', () => {
  it('* stays within a directory, ** crosses them', () => {
    assert.ok(matches('dist/*.js', 'dist/a.js'));
    assert.ok(!matches('dist/*.js', 'dist/sub/a.js'));
    assert.ok(matches('dist/**/*.js', 'dist/a.js'));
    assert.ok(matches('dist/**/*.js', 'dist/sub/deep/a.js'));
    assert.ok(matches('dist/**', 'dist/sub/a.css'));
    assert.ok(matches('**/*.css', 'a.css'));
  });

  it('supports ?, character classes and braces', () => {
    assert.ok(matches('chunk-?.js', 'chunk-1.js'));
    assert.ok(!matches('chunk-?.js', 'chunk-12.js'));
    assert.ok(matches('chunk-[0-9].js', 'chunk-7.js'));
    assert.ok(!matches('chunk-[!0-9].js', 'chunk-7.js'));
    assert.ok(matches('dist/*.{js,mjs}', 'dist/a.mjs'));
    assert.ok(matches('{dist,lib}/**/*.js', 'lib/x/y.js'));
    assert.ok(!matches('dist/*.{js,mjs}', 'dist/a.cjs'));
  });

  it('treats regex characters literally and accepts ./ and backslashes', () => {
    assert.ok(matches('dist/app.min.js', 'dist/app.min.js'));
    assert.ok(!matches('dist/app.min.js', 'dist/appXminXjs'));
    assert.ok(matches('a+b(1).js', 'a+b(1).js'));
    assert.ok(matches('./dist/*.js', 'dist/a.js'));
    assert.ok(matches('dist\\*.js', 'dist/a.js'));
  });

  it('globBase finds the static prefix', () => {
    assert.equal(globBase('dist/assets/*.js'), 'dist/assets');
    assert.equal(globBase('dist/**/*.js'), 'dist');
    assert.equal(globBase('**/*.js'), '');
    assert.equal(globBase('dist/app.js'), 'dist');
    assert.equal(globBase('app.js'), '');
    assert.equal(globBase('{a,b}/x.js'), '');
  });
});

describe('expandGlobs', () => {
  it('finds sorted files, with ! patterns and ignore', () => {
    assert.deepEqual(expandGlobs(FIXTURE, ['build/**/*.js']), [
      'build/app.js',
      'build/chunks/home.js',
      'build/chunks/legacy.min.js',
      'build/chunks/settings.js',
    ]);
    assert.deepEqual(expandGlobs(FIXTURE, ['build/**/*.js', '!**/*.min.js'], ['build/chunks/home.js']), [
      'build/app.js',
      'build/chunks/settings.js',
    ]);
    assert.deepEqual(expandGlobs(FIXTURE, ['build/app.js', 'build/*.js']), ['build/app.js']);
  });

  it('returns nothing for missing directories', () => {
    assert.deepEqual(expandGlobs(FIXTURE, ['nope/**/*.js']), []);
  });

  it('skips node_modules and .git unless the pattern names them', () => {
    const dir = tempDir();
    for (const sub of ['src', 'node_modules/lib', '.git']) {
      mkdirSync(join(dir, sub), { recursive: true });
      writeFileSync(join(dir, sub, 'x.js'), '1');
    }
    assert.deepEqual(expandGlobs(dir, ['**/*.js']), ['src/x.js']);
    assert.deepEqual(expandGlobs(dir, ['node_modules/**/*.js']), ['node_modules/lib/x.js']);
  });
});
