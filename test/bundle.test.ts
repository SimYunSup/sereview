import test from 'node:test';
import assert from 'node:assert/strict';
import type { BundledFile, DiffLine } from '../src/core/types.ts';
import { bundleFiles, estimateTokens } from '../src/core/bundle.ts';

/** A BundledFile with `lineCount` added lines of `lineLen` chars each. */
function mk(path: string, lineCount: number, lineLen = 40): BundledFile {
  const lines: DiffLine[] = [];
  for (let i = 0; i < lineCount; i++) lines.push({ type: 'add', newLine: i + 1, content: 'x'.repeat(lineLen) });
  return {
    file: { path, status: 'added', additions: lineCount, deletions: 0, binary: false },
    hunks: [{ header: `@@ -0,0 +1,${lineCount} @@`, oldStart: 0, oldLines: 0, newStart: 1, newLines: lineCount, lines }],
  };
}

test('estimateTokens: positive and grows with content', () => {
  const small = estimateTokens([mk('a.ts', 1)]);
  const big = estimateTokens([mk('a.ts', 100)]);
  assert.ok(small > 0);
  assert.ok(big > small);
});

test('estimateTokens: deterministic and additive across files', () => {
  assert.equal(estimateTokens([mk('a.ts', 10)]), estimateTokens([mk('a.ts', 10)]));
  assert.equal(
    estimateTokens([mk('a.ts', 5), mk('b.ts', 7)]),
    estimateTokens([mk('a.ts', 5)]) + estimateTokens([mk('b.ts', 7)]),
  );
});

test('bundleFiles: small files collapse into one bundle', () => {
  const bundles = bundleFiles([mk('a.ts', 2), mk('b.ts', 2), mk('c.ts', 2)], 100000);
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0]!.files.length, 3);
  assert.equal(bundles[0]!.id, 'bundle-1');
});

test('bundleFiles: budget split keeps order and includes every file once', () => {
  const files = [mk('a.ts', 50), mk('b.ts', 50), mk('c.ts', 50), mk('d.ts', 50)];
  const perFile = estimateTokens([mk('a.ts', 50)]);
  const bundles = bundleFiles(files, perFile * 2);
  assert.ok(bundles.length >= 2);
  assert.deepEqual(
    bundles.flatMap((b) => b.files.map((f) => f.file.path)),
    ['a.ts', 'b.ts', 'c.ts', 'd.ts'],
  );
  for (const b of bundles) assert.ok(b.files.length <= 2);
  assert.deepEqual(
    bundles.map((b) => b.id),
    bundles.map((_, i) => `bundle-${i + 1}`),
  );
});

test('bundleFiles: a single oversize file gets its own bundle', () => {
  const big = mk('huge.ts', 1000);
  const small = mk('tiny.ts', 1);
  const bundles = bundleFiles([big, small], estimateTokens([small]) * 2);
  assert.equal(bundles[0]!.files.length, 1);
  assert.equal(bundles[0]!.files[0]!.file.path, 'huge.ts');
});

test('bundleFiles: bundle tokenEstimate equals sum of member estimates', () => {
  const files = [mk('a.ts', 5), mk('b.ts', 7)];
  const [b] = bundleFiles(files, 100000);
  assert.equal(b!.tokenEstimate, estimateTokens([files[0]!]) + estimateTokens([files[1]!]));
});

test('bundleFiles: empty input → no bundles', () => {
  assert.deepEqual(bundleFiles([], 8000), []);
});
