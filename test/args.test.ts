import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, parsePrRef } from '../src/cli/args.ts';

test('parsePrRef: full https URL', () => {
  assert.deepEqual(parsePrRef('https://github.com/owner/repo/pull/123'), {
    owner: 'owner',
    repo: 'repo',
    number: 123,
  });
});

test('parsePrRef: URL with trailing /files and query', () => {
  assert.deepEqual(parsePrRef('https://github.com/o/r/pull/42/files?w=1'), { owner: 'o', repo: 'r', number: 42 });
});

test('parsePrRef: scheme-less host', () => {
  assert.deepEqual(parsePrRef('github.com/o/r/pull/7'), { owner: 'o', repo: 'r', number: 7 });
});

test('parsePrRef: owner/repo#n shorthand', () => {
  assert.deepEqual(parsePrRef('owner/repo#15'), { owner: 'owner', repo: 'repo', number: 15 });
});

test('parsePrRef: invalid input throws', () => {
  assert.throws(() => parsePrRef('not-a-pr'));
  assert.throws(() => parsePrRef('https://github.com/o/r/issues/3'));
});

test('parseCliArgs: no args / --help / -h → help', () => {
  assert.equal(parseCliArgs([]).command, 'help');
  assert.equal(parseCliArgs(['--help']).command, 'help');
  assert.equal(parseCliArgs(['-h']).command, 'help');
});

test('parseCliArgs: --version → version', () => {
  assert.equal(parseCliArgs(['--version']).command, 'version');
});

test('parseCliArgs: packet with a PR ref', () => {
  const a = parseCliArgs(['packet', 'owner/repo#1']);
  assert.equal(a.command, 'packet');
  assert.equal(a.pr, 'owner/repo#1');
  assert.equal(a.diffPath, undefined);
});

test('parseCliArgs: packet --diff path / stdin', () => {
  assert.equal(parseCliArgs(['packet', '--diff', 'f.patch']).diffPath, 'f.patch');
  assert.equal(parseCliArgs(['packet', '--diff', '-']).diffPath, '-');
});

test('parseCliArgs: --max-bundle-tokens parsed as a number', () => {
  assert.equal(parseCliArgs(['packet', 'o/r#1', '--max-bundle-tokens', '6000']).maxBundleTokens, 6000);
});

test('parseCliArgs: packet with no input throws', () => {
  assert.throws(() => parseCliArgs(['packet']));
});

test('parseCliArgs: PR ref AND --diff together throws', () => {
  assert.throws(() => parseCliArgs(['packet', 'o/r#1', '--diff', 'f.patch']));
});

test('parseCliArgs: unknown command throws', () => {
  assert.throws(() => parseCliArgs(['frobnicate']));
});

test('parseCliArgs: non-numeric --max-bundle-tokens throws', () => {
  assert.throws(() => parseCliArgs(['packet', 'o/r#1', '--max-bundle-tokens', 'abc']));
});

test('parsePrRef: a "-"/"="-leading owner is rejected (no flag smuggling into gh)', () => {
  assert.throws(() => parsePrRef('-X/repo#1'));
  assert.throws(() => parsePrRef('https://github.com/--upload-pack=x/r/pull/1'));
});

test('parsePrRef: an overflowing PR number is rejected', () => {
  assert.throws(() => parsePrRef('o/r#999999999999999999999'));
});

test('parseCliArgs: --max-bundle-tokens rejects hex, fractions, and zero', () => {
  for (const v of ['0x10', '0.5', '0', '-5', '1e3', ' ']) {
    assert.throws(() => parseCliArgs(['packet', 'o/r#1', '--max-bundle-tokens', v]), new RegExp('positive integer'));
  }
  assert.equal(parseCliArgs(['packet', 'o/r#1', '--max-bundle-tokens', ' 4096 ']).maxBundleTokens, 4096);
});
