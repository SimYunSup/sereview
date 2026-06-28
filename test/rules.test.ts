import test from 'node:test';
import assert from 'node:assert/strict';
import type { BundledFile, DiffLine } from '../src/core/types.ts';
import { detectLanguage } from '../src/core/diff.ts';
import { matchRules, RULEBOOK, RULEBOOK_VERSION } from '../src/core/rules.ts';

/** Build a BundledFile consisting solely of the given added lines. */
function added(path: string, ...addedLines: string[]): BundledFile {
  const lang = detectLanguage(path);
  return {
    file: {
      path,
      status: 'modified',
      additions: addedLines.length,
      deletions: 0,
      binary: false,
      ...(lang ? { language: lang } : {}),
    },
    hunks: [
      {
        header: `@@ -0,0 +1,${addedLines.length} @@`,
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: addedLines.length,
        lines: addedLines.map((content, i): DiffLine => ({ type: 'add', newLine: i + 1, content })),
      },
    ],
  };
}

const ids = (fs: BundledFile[]): string[] => matchRules(fs).map((r) => r.id);

test('matchRules: SQL built by string concatenation → sql-injection', () => {
  const fs = [added('src/db.ts', 'const q = "SELECT * FROM users WHERE id = " + userId;', 'db.query(q);')];
  assert.ok(ids(fs).includes('sql-injection'));
});

test('matchRules: hardcoded API key → secret-exposure (critical/security)', () => {
  const fs = [added('src/config.ts', 'const apiKey = "sk-abc123def456ghijkl";')];
  const secret = matchRules(fs).find((r) => r.id === 'secret-exposure');
  assert.ok(secret, 'secret-exposure should match');
  assert.equal(secret!.severityHint, 'critical');
  assert.equal(secret!.category, 'security');
});

test('matchRules: innerHTML assignment → xss', () => {
  assert.ok(ids([added('web/view.ts', 'element.innerHTML = userInput;')]).includes('xss'));
});

test('matchRules: query inside a loop → n-plus-1', () => {
  const fs = [
    added(
      'src/svc.ts',
      'for (const u of users) {',
      '  const p = await prisma.profile.findUnique({ where: { id: u.id } });',
      '}',
    ),
  ];
  assert.ok(ids(fs).includes('n-plus-1'));
});

test('matchRules: benign arithmetic matches no security/perf rule', () => {
  const matched = ids([added('src/math.ts', 'const sum = a + b;', 'return sum;')]);
  for (const id of ['sql-injection', 'xss', 'ssrf', 'path-traversal', 'secret-exposure', 'n-plus-1']) {
    assert.ok(!matched.includes(id), `should not match ${id}`);
  }
});

test('matchRules: matched entries carry catalog fields, not the matcher fn', () => {
  const r = matchRules([added('src/config.ts', 'const apiKey = "sk-abc123def456ghijkl";')])[0]!;
  assert.equal(typeof r.id, 'string');
  assert.equal(typeof r.title, 'string');
  assert.equal(typeof r.guidance, 'string');
  assert.ok(Array.isArray(r.appliesTo));
  assert.equal((r as unknown as Record<string, unknown>).matches, undefined);
});

test('matchRules: results follow rulebook order and are unique', () => {
  const fs = [
    added('a.ts', 'const apiKey = "sk-abc123def456ghijkl";'), // secret-exposure (idx 4)
    added('b.ts', 'el.innerHTML = x;'), // xss (idx 1)
  ];
  const order = matchRules(fs).map((r) => r.id);
  const rbOrder = RULEBOOK.map((r) => r.id);
  const idx = order.map((id) => rbOrder.indexOf(id));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  assert.equal(new Set(order).size, order.length);
});

test('RULEBOOK exposes all ten rules and a version string', () => {
  assert.equal(RULEBOOK.length, 10);
  assert.equal(typeof RULEBOOK_VERSION, 'string');
  assert.ok(RULEBOOK_VERSION.length > 0);
  const expected = ['sql-injection', 'xss', 'ssrf', 'path-traversal', 'secret-exposure', 'authz', 'npe', 'race', 'n-plus-1', 'github-actions-security'];
  assert.deepEqual([...RULEBOOK.map((r) => r.id)].sort(), [...expected].sort());
});
