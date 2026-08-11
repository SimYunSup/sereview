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

test('defaultSkip: test-fixture directories (testdata/fixtures)', () => {
  for (const p of ['internal/parser/testdata/input.json', 'test/fixtures/sample.json', 'spec/fixtures/users.yml']) {
    assert.equal(defaultSkip(file(p)), 'test data', p);
  }
});

test('defaultSkip: generated-code files (.generated.*, .gen.go, .pb.{go,cc,h})', () => {
  for (const p of [
    'api/types.generated.go',
    'src/graphql/schema.generated.ts',
    'src/api/client.generated.d.ts',
    'proto/message.gen.go',
    'api/v1/service.pb.go',
    'proto/message.pb.cc',
    'proto/message.pb.h',
  ]) {
    assert.equal(defaultSkip(file(p)), 'generated', p);
  }
});

test('defaultSkip: test files', () => {
  for (const p of [
    'src/__tests__/a.ts',
    'src/a.test.ts',
    'src/a.spec.tsx',
    'pkg/foo_test.go',
    'src/FooTest.java',
    'app/BarTest.kt',
    'test/runtests.jl',
    'pkg/test/unit/solver.jl',
    'test/Unit/Parser.hs',
    'src/ParserSpec.hs',
    'test/Doc.lhs',
    'tests/t_parser.nim',
  ]) {
    assert.equal(defaultSkip(file(p)), 'test', p);
  }
});

test('defaultSkip: normal source / docs files are kept', () => {
  for (const p of [
    'src/index.ts',
    'app/main.go',
    'lib/util.py',
    'README.md',
    'src/components/Button.tsx',
    'src/solver.jl',
    'src/latest/model.jl',
    'src/Parser.hs',
    'src/parser.nim',
    'flake.nix',
    // Nim's default exclude only mirrors the plural `tests/` directory — a
    // singular `test/` (as Julia uses) is intentionally NOT matched for Nim.
    'test/helper.nim',
    // Basenames that merely contain 'testdata'/'fixtures'/'generated'/'gen'/'pb'
    // as a word, not a directory segment or the exact suffix pattern.
    'src/testdata.go',
    'src/fixtures.ts',
    'src/generated/code.go',
    'src/gen/util.go',
    'src/pb/client.go',
  ]) {
    assert.equal(defaultSkip(file(p)), null, p);
  }
});
