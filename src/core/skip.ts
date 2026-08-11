import type { ChangedFile } from './types.ts';

// Exact basenames (lowercased) of dependency lockfiles — never reviewable text.
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'bun.lock',
  'deno.lock',
  'cargo.lock',
  'poetry.lock',
  'pipfile.lock',
  'composer.lock',
  'gemfile.lock',
  'go.sum',
  'packages.lock.json',
  'flake.lock',
]);

// Generated / vendored output directories (matched as any path segment).
const GENERATED_DIR =
  /(^|\/)(node_modules|dist|vendor|coverage|__generated__|__snapshots__|\.next|\.nuxt|\.svelte-kit|\.turbo|\.output)\//;

// Test-fixture / golden-data directories (matched as any path segment) — kept
// distinct from GENERATED_DIR since the reason ('test data') differs.
const TEST_DATA_DIR = /(^|\/)(testdata|fixtures)\//;

const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/**
 * Default deny-list of non-reviewable, high-noise files: lockfiles, minified
 * bundles, source maps, snapshots, generated/vendored output, generated-code
 * files (protobuf/codegen), test-fixture directories, and test files. Returns
 * a reason string (recorded in `packet.skipped`) to exclude the file, or null
 * to keep it.
 *
 * The CLI applies this by default; library callers can pass it (or compose their
 * own) via `buildPacket`'s `skip` option. Binary files are skipped separately by
 * `buildPacket`, regardless of this predicate.
 */
export function defaultSkip(f: ChangedFile): string | null {
  const path = f.path;
  const name = basename(path).toLowerCase();

  if (LOCKFILES.has(name)) return 'lockfile';
  if (/\.min\.(js|mjs|cjs|css)$/.test(path)) return 'minified';
  if (/\.map$/.test(path)) return 'source map';
  if (/\.snap$/.test(path)) return 'snapshot';
  if (TEST_DATA_DIR.test(path)) return 'test data';
  if (/(^|\/)[^/]+\.generated\.[^/]+$/.test(path)) return 'generated';
  if (/\.(gen\.go|pb\.go|pb\.cc|pb\.h)$/.test(path)) return 'generated';
  if (GENERATED_DIR.test(path)) return 'generated';

  // Test files (mirrors open-code-review's default exclude set).
  if (
    /(^|\/)__tests__\//.test(path) ||
    /\.(test|spec)\.(jsx?|tsx?|mjs|cjs)$/.test(path) ||
    /_test\.go$/.test(path) ||
    /(^|\/)\w+Test\.(java|kt)$/.test(path) ||
    /(^|\/)test\/.*\.jl$/.test(path) ||
    /(^|\/)test\/.*\.l?hs$/.test(path) ||
    /Spec\.l?hs$/.test(path) ||
    // Nim's default exclude set uses the plural `tests/` directory (unlike
    // Julia's singular `test/` above) — mirrored as-is, not normalized.
    /(^|\/)tests\/.*\.nim$/.test(path)
  ) {
    return 'test';
  }

  return null;
}
