import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSkip } from '../src/core/index.ts';
import type { ChangedFile } from '../src/core/index.ts';

const file = (path: string): ChangedFile => ({
  path,
  status: 'modified',
  additions: 1,
  deletions: 0,
  binary: false,
});

test('defaultSkip: lockfiles are skipped (case-insensitive, any dir)', () => {
  for (const p of ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'a/b/Cargo.lock', 'go.sum', 'flake.lock']) {
    assert.equal(defaultSkip(file(p)), 'lockfile', p);
  }
});

test('defaultSkip: minified, source maps, snapshots', () => {
  assert.equal(defaultSkip(file('public/app.min.js')), 'minified');
  assert.equal(defaultSkip(file('dist-x/bundle.min.css')), 'minified');
  assert.equal(defaultSkip(file('a/b.js.map')), 'source map');
  assert.equal(defaultSkip(file('a/x.snap')), 'snapshot');
});

test('defaultSkip: generated / vendored directories', () => {
  for (const p of ['dist/app.js', 'node_modules/x/y.js', 'a/vendor/z.go', 'coverage/lcov.info', '.next/build.js']) {
    assert.equal(defaultSkip(file(p)), 'generated', p);
  }
});

test('defaultSkip: test files', () => {
  for (const p of ['src/__tests__/a.ts', 'src/a.test.ts', 'src/a.spec.tsx', 'pkg/foo_test.go', 'src/FooTest.java', 'app/BarTest.kt']) {
    assert.equal(defaultSkip(file(p)), 'test', p);
  }
});

test('defaultSkip: normal source / docs files are kept', () => {
  for (const p of ['src/index.ts', 'app/main.go', 'lib/util.py', 'README.md', 'src/components/Button.tsx']) {
    assert.equal(defaultSkip(file(p)), null, p);
  }
});
