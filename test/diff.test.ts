import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../src/core/diff.ts';

const MODIFIED = `diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@ function main()
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;

const ADDED = `diff --git a/lib/new.js b/lib/new.js
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/lib/new.js
@@ -0,0 +1,2 @@
+export const x = 1;
+export const y = 2;
`;

const DELETED = `diff --git a/old.py b/old.py
deleted file mode 100644
index 4444444..0000000
--- a/old.py
+++ /dev/null
@@ -1,2 +0,0 @@
-print("a")
-print("b")
`;

const RENAMED = `diff --git a/src/old-name.ts b/src/new-name.ts
similarity index 100%
rename from src/old-name.ts
rename to src/new-name.ts
`;

const BINARY = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..5555555
Binary files /dev/null and b/logo.png differ
`;

const TWO_HUNKS = `diff --git a/m.go b/m.go
index aaa..bbb 100644
--- a/m.go
+++ b/m.go
@@ -1,2 +1,2 @@ package main
-var x = 1
+var x = 2
 var y = 3
@@ -10,2 +10,3 @@ func main() {
 a()
+b()
 c()
`;

test('parseDiff: modified file — status, language, counts', () => {
  const files = parseDiff(MODIFIED);
  assert.equal(files.length, 1);
  const f = files[0]!.file;
  assert.equal(f.path, 'src/app.ts');
  assert.equal(f.status, 'modified');
  assert.equal(f.language, 'typescript');
  assert.equal(f.binary, false);
  assert.equal(f.additions, 2);
  assert.equal(f.deletions, 1);
  assert.equal(f.previousPath, undefined);
});

test('parseDiff: hunk header + line numbering (no undefined keys)', () => {
  const [bundled] = parseDiff(MODIFIED);
  const hunks = bundled!.hunks;
  assert.equal(hunks.length, 1);
  const h = hunks[0]!;
  assert.equal(h.oldStart, 1);
  assert.equal(h.oldLines, 3);
  assert.equal(h.newStart, 1);
  assert.equal(h.newLines, 4);
  assert.match(h.header, /^@@ -1,3 \+1,4 @@/);
  assert.deepEqual(h.lines[0], { type: 'context', newLine: 1, oldLine: 1, content: 'const a = 1;' });
  assert.deepEqual(h.lines[1], { type: 'del', oldLine: 2, content: 'const b = 2;' });
  assert.deepEqual(h.lines[2], { type: 'add', newLine: 2, content: 'const b = 3;' });
  assert.deepEqual(h.lines[3], { type: 'add', newLine: 3, content: 'const c = 4;' });
  assert.deepEqual(h.lines[4], { type: 'context', newLine: 4, oldLine: 3, content: 'const d = 5;' });
});

test('parseDiff: added file (/dev/null source)', () => {
  const [b] = parseDiff(ADDED);
  assert.equal(b!.file.status, 'added');
  assert.equal(b!.file.path, 'lib/new.js');
  assert.equal(b!.file.language, 'javascript');
  assert.equal(b!.file.additions, 2);
  assert.equal(b!.file.deletions, 0);
});

test('parseDiff: deleted file (/dev/null target)', () => {
  const [b] = parseDiff(DELETED);
  assert.equal(b!.file.status, 'deleted');
  assert.equal(b!.file.path, 'old.py');
  assert.equal(b!.file.language, 'python');
  assert.equal(b!.file.deletions, 2);
  assert.equal(b!.file.additions, 0);
});

test('parseDiff: pure rename — previousPath set, no hunks', () => {
  const [b] = parseDiff(RENAMED);
  assert.equal(b!.file.status, 'renamed');
  assert.equal(b!.file.path, 'src/new-name.ts');
  assert.equal(b!.file.previousPath, 'src/old-name.ts');
  assert.equal(b!.hunks.length, 0);
});

test('parseDiff: binary file flagged, no hunks', () => {
  const [b] = parseDiff(BINARY);
  assert.equal(b!.file.binary, true);
  assert.equal(b!.file.path, 'logo.png');
  assert.equal(b!.hunks.length, 0);
});

test('parseDiff: multiple files preserve order', () => {
  const files = parseDiff(MODIFIED + ADDED + DELETED);
  assert.deepEqual(
    files.map((f) => f.file.path),
    ['src/app.ts', 'lib/new.js', 'old.py'],
  );
});

test('parseDiff: empty input → no files', () => {
  assert.deepEqual(parseDiff(''), []);
  assert.deepEqual(parseDiff('\n\n'), []);
});

test('parseDiff: multiple hunks, second hunk numbering offset', () => {
  const [b] = parseDiff(TWO_HUNKS);
  assert.equal(b!.hunks.length, 2);
  const h2 = b!.hunks[1]!;
  assert.equal(h2.newStart, 10);
  const add = h2.lines.find((l) => l.type === 'add')!;
  assert.equal(add.newLine, 11);
  assert.equal(add.content, 'b()');
  assert.equal(b!.file.language, 'go');
});

test('parseDiff: tolerates CRLF line endings', () => {
  const [b] = parseDiff(MODIFIED.replace(/\n/g, '\r\n'));
  assert.equal(b!.file.path, 'src/app.ts');
  assert.equal(b!.file.additions, 2);
  assert.equal(b!.hunks[0]!.lines[0]!.content, 'const a = 1;');
});
