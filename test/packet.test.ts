import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPacket, serializePacket } from '../src/core/index.ts';
import type { MatchedRule, ReviewPacket } from '../src/core/index.ts';

const DIFF = `diff --git a/src/db.ts b/src/db.ts
index 111..222 100644
--- a/src/db.ts
+++ b/src/db.ts
@@ -1,2 +1,3 @@
 export function q(userId) {
-  return null;
+  const sql = "SELECT * FROM users WHERE id = " + userId;
+  return db.query(sql);
 }
diff --git a/logo.png b/logo.png
new file mode 100644
index 000..333
Binary files /dev/null and b/logo.png differ
`;

const src = (): ReviewPacket['source'] => ({ kind: 'local-diff', ref: 'HEAD' });

test('buildPacket: schema, source, rulebook version, bundle count', () => {
  const p = buildPacket({ diff: DIFF, source: src() });
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.source.ref, 'HEAD');
  assert.ok(p.rulebookVersion.length > 0);
  assert.equal(p.stats.bundles, p.bundles.length);
});

test('buildPacket: binary file is skipped, text file is reviewed', () => {
  const p = buildPacket({ diff: DIFF, source: src() });
  assert.deepEqual(
    p.bundles.flatMap((b) => b.files.map((f) => f.file.path)),
    ['src/db.ts'],
  );
  assert.ok(p.skipped.some((s) => s.path === 'logo.png' && s.reason === 'binary'));
});

test('buildPacket: stats count all changed files and line totals', () => {
  const p = buildPacket({ diff: DIFF, source: src() });
  assert.equal(p.stats.files, 2);
  assert.equal(p.stats.additions, 2);
  assert.equal(p.stats.deletions, 1);
});

test('buildPacket: built-in matcher flags sql-injection on the changed bundle', () => {
  const p = buildPacket({ diff: DIFF, source: src() });
  const rules = p.bundles.flatMap((b) => b.matchedRules.map((r) => r.id));
  assert.ok(rules.includes('sql-injection'));
});

test('buildPacket: custom skip predicate records reason and excludes file', () => {
  const p = buildPacket({
    diff: DIFF,
    source: src(),
    skip: (f) => (f.path.endsWith('.ts') ? 'ts excluded for test' : null),
  });
  assert.equal(p.bundles.length, 0);
  assert.ok(p.skipped.some((s) => s.path === 'src/db.ts' && s.reason === 'ts excluded for test'));
});

test('buildPacket: rules override attaches the given rules to every bundle', () => {
  const custom: MatchedRule[] = [
    { id: 'custom', category: 'style', severityHint: 'info', title: 'T', guidance: 'G', appliesTo: ['x'] },
  ];
  const p = buildPacket({ diff: DIFF, source: src(), rules: custom });
  assert.ok(p.bundles.length > 0);
  for (const b of p.bundles) {
    assert.deepEqual(
      b.matchedRules.map((r) => r.id),
      ['custom'],
    );
  }
});

test('serializePacket: pretty JSON that round-trips to the same object', () => {
  const p = buildPacket({ diff: DIFF, source: src() });
  const s = serializePacket(p);
  assert.equal(typeof s, 'string');
  assert.ok(s.includes('\n')); // pretty-printed
  assert.deepEqual(JSON.parse(s), p);
});

test('buildPacket: empty diff → empty packet', () => {
  const p = buildPacket({ diff: '', source: { kind: 'local-diff', ref: 'x' } });
  assert.deepEqual(p.bundles, []);
  assert.deepEqual(p.skipped, []);
  assert.equal(p.stats.files, 0);
  assert.equal(p.stats.additions, 0);
  assert.equal(p.stats.deletions, 0);
});
