import type { BundledFile } from './types.ts';

/** Default soft cap on a bundle's estimated tokens. */
export const DEFAULT_MAX_BUNDLE_TOKENS = 8000;

/** A group of changed files, before rule matching is attached. */
export interface BundleGroup {
  id: string;
  files: BundledFile[];
  tokenEstimate: number;
}

/**
 * Rough token estimate for a set of files: ~4 chars/token over hunk headers and
 * line contents, plus a small per-file overhead. Deterministic and additive
 * (estimate of [a, b] === estimate of [a] + estimate of [b]).
 */
export function estimateTokens(files: BundledFile[]): number {
  let tokens = 0;
  for (const bf of files) {
    let chars = bf.file.path.length + 16; // path + small per-file framing overhead
    for (const hunk of bf.hunks) {
      chars += hunk.header.length + 1;
      for (const line of hunk.lines) chars += line.content.length + 2; // marker + newline
    }
    tokens += Math.ceil(chars / 4); // round per file so the estimate stays additive
  }
  return tokens;
}

/**
 * Greedily pack changed files into bundles under `maxBundleTokens`, preserving
 * input order. A file larger than the budget becomes its own bundle (never
 * dropped). Bundle ids are `bundle-1`, `bundle-2`, … in order.
 */
export function bundleFiles(
  files: BundledFile[],
  maxBundleTokens: number = DEFAULT_MAX_BUNDLE_TOKENS,
): BundleGroup[] {
  const bundles: BundleGroup[] = [];
  let current: BundledFile[] = [];
  let currentTokens = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    bundles.push({ id: `bundle-${bundles.length + 1}`, files: current, tokenEstimate: currentTokens });
    current = [];
    currentTokens = 0;
  };

  for (const file of files) {
    const est = estimateTokens([file]);
    if (current.length > 0 && currentTokens + est > maxBundleTokens) flush();
    current.push(file);
    currentTokens += est;
  }
  flush();

  return bundles;
}
