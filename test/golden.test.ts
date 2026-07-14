import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildPacket, serializePacket } from '../src/core/index.ts';
import type { ReviewSource } from '../src/core/index.ts';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const diff = readFileSync(`${fixtures}golden.patch`, 'utf8');
const goldenPath = `${fixtures}golden-packet.json`;

// A fixed source so the packet is fully deterministic run-to-run.
const source: ReviewSource = {
  kind: 'github-pr',
  ref: 'owner/repo#42',
  title: 'Golden fixture PR',
  baseSha: 'base0000',
  headSha: 'head1111',
};

/**
 * Freezes the exact serialized packet for a representative diff (multiple
 * languages, a rename, a binary) so any change to determinism, ordering, or
 * packet shape fails CI. When a change is intentional, regenerate the golden
 * file with:  UPDATE_GOLDEN=1 pnpm test
 */
test('golden packet: serialized buildPacket output matches the checked-in golden', () => {
  const actual = `${serializePacket(buildPacket({ diff, source }))}\n`;
  if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath, actual);
  const expected = readFileSync(goldenPath, 'utf8');
  assert.equal(actual, expected);
});
