import { bundleFiles, DEFAULT_MAX_BUNDLE_TOKENS } from './bundle.ts';
import { parseDiff } from './diff.ts';
import { matchRules, RULEBOOK_VERSION } from './rules.ts';
import type { BuildPacketOptions, BundledFile, ReviewBundle, ReviewPacket } from './types.ts';

/**
 * Turn a unified diff into a {@link ReviewPacket}: parse → skip non-reviewable
 * files → bundle under a token budget → match the rulebook per bundle. Pure and
 * deterministic; never calls an LLM. This is the whole of Tier 2.
 */
export function buildPacket(opts: BuildPacketOptions): ReviewPacket {
  const allFiles = parseDiff(opts.diff);
  const maxBundleTokens = opts.maxBundleTokens ?? DEFAULT_MAX_BUNDLE_TOKENS;

  // Binary files are always skipped (no reviewable text); the caller's `skip`
  // predicate handles everything else (lockfiles, generated code, …).
  const skipped: { path: string; reason: string }[] = [];
  const reviewable: BundledFile[] = [];
  for (const bf of allFiles) {
    const reason = bf.file.binary ? 'binary' : opts.skip?.(bf.file);
    if (reason) skipped.push({ path: bf.file.path, reason });
    else reviewable.push(bf);
  }

  const bundles: ReviewBundle[] = bundleFiles(reviewable, maxBundleTokens).map((g) => ({
    id: g.id,
    files: g.files,
    matchedRules: opts.rules ? [...opts.rules] : matchRules(g.files),
    tokenEstimate: g.tokenEstimate,
  }));

  let additions = 0;
  let deletions = 0;
  for (const bf of allFiles) {
    additions += bf.file.additions;
    deletions += bf.file.deletions;
  }

  return {
    schemaVersion: 1,
    source: opts.source,
    bundles,
    skipped,
    stats: { files: allFiles.length, additions, deletions, bundles: bundles.length },
    rulebookVersion: RULEBOOK_VERSION,
  };
}

/** Pretty-print a packet as JSON for the host Claude Code session to consume. */
export function serializePacket(packet: ReviewPacket): string {
  return JSON.stringify(packet, null, 2);
}

export { parseDiff, detectLanguage } from './diff.ts';
export { estimateTokens, DEFAULT_MAX_BUNDLE_TOKENS } from './bundle.ts';
export { RULEBOOK_VERSION } from './rules.ts';
export { defaultSkip } from './skip.ts';
export type * from './types.ts';
