import type { ChangedFile } from './types.ts';

// Exact basenames (lowercased) of dependency lockfiles — never reviewable text.
const LOCKFILES: Record<string, true> = {
  'package-lock.json': true,
  'npm-shrinkwrap.json': true,
  'yarn.lock': true,
  'pnpm-lock.yaml': true,
  'bun.lockb': true,
  'bun.lock': true,
  'deno.lock': true,
  'cargo.lock': true,
  'poetry.lock': true,
  'pipfile.lock': true,
  'composer.lock': true,
  'gemfile.lock': true,
  'go.sum': true,
  'packages.lock.json': true,
  'flake.lock': true,
  '.terraform.lock.hcl': true,
};

// Generated / vendored output directories (matched as any path segment).
const GENERATED_DIR =
  /(^|\/)(node_modules|dist|vendor|coverage|__generated__|__snapshots__|\.next|\.nuxt|\.svelte-kit|\.turbo|\.output)\//;
const BUILD_CACHE_DIR =
  /(^|\/)(bower_components|\.pnpm-store|\.astro|\.angular|\.parcel-cache|\.docusaurus|\.bundle|target|\.gradle|__pycache__|\.venv|venv|site-packages|[^/]+\.egg-info|\.tox|\.mypy_cache|\.pytest_cache|\.ruff_cache|pods|carthage|\.build|obj|\.dart_tool|\.terraform|\.stack-work)\//i;

// Test-fixture / golden-data directories (matched as any path segment) — kept
// distinct from GENERATED_DIR since the reason ('test data') differs.
const TEST_DATA_DIR = /(^|\/)(testdata|fixtures)\//;
// Credential-path exclusions are a default review-noise/privacy measure, not
// content redaction. Library callers select this predicate explicitly.
const SECRET_BASENAMES: Record<string, true> = {
  id_rsa: true, id_dsa: true, id_ecdsa: true, id_ed25519: true,
  '.netrc': true, _netrc: true, '.npmrc': true, '.pypirc': true, '.dockercfg': true,
};

/**
 * Default deny-list of non-reviewable, high-noise files: secret paths,
 * lockfiles, minified bundles, source maps, snapshots, generated/vendored
 * output, test-fixture directories, and test files. Returns
 * a reason string (recorded in `packet.skipped`) to exclude the file, or null
 * to keep it.
 *
 * The CLI applies this by default; library callers can pass it (or compose their
 * own) via `buildPacket`'s `skip` option. Binary files are skipped separately by
 * `buildPacket`, regardless of this predicate.
 */
export function defaultSkip(f: ChangedFile): string | null {
  const path = f.path;
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();

  if (
    ((name === '.env' || name.startsWith('.env.')) &&
      name !== '.env.example' && name !== '.env.sample' && name !== '.env.template') ||
    Object.hasOwn(SECRET_BASENAMES, name) ||
    /(^|\/)\.ssh\//i.test(path)
  ) return 'secret path';
  if (Object.hasOwn(LOCKFILES, name)) return 'lockfile';
  if (name === '.pnp.cjs' || name === '.pnp.loader.mjs') return 'generated';
  if (/\.min\.(js|mjs|cjs|css)$/.test(path)) return 'minified';
  if (/\.map$/.test(path)) return 'source map';
  if (/\.snap$/.test(path)) return 'snapshot';
  if (TEST_DATA_DIR.test(path)) return 'test data';
  if (/(^|\/)[^/]+\.generated\.[^/]+$/.test(path)) return 'generated';
  if (/\.(gen\.go|pb\.go|pb\.cc|pb\.h)$/.test(path)) return 'generated';
  if (GENERATED_DIR.test(path) || BUILD_CACHE_DIR.test(path)) return 'generated';

  // Generated artifacts introduced by the upstream language support are no more
  // reviewable than the existing protobuf/codegen forms above.
  if (
    /(^|\/)\.ipynb_checkpoints\//i.test(path) ||
    /(^|\/)kitex_gen\/.*\.go$/i.test(path) ||
    /\.capnp\.(h|go|ts)$/i.test(path) ||
    /_capnp\.(rs|py)$/i.test(path) ||
    /^lib\/.*\.sol$/i.test(path) ||
    /(^|\/)\.yarn\/(cache|unplugged|releases|sdks|patches)\//i.test(path)
  ) {
    return 'generated';
  }

  // Test files (mirrors open-code-review's default exclude set).
  if (
    /(^|\/)__tests__\//.test(path) ||
    /\.(test|spec)\.(jsx?|tsx?|mjs|cjs)$/.test(path) ||
    /_test\.go$/.test(path) ||
    /(^|\/)\w+Test\.(java|kt)$/.test(path) ||
    /(^|\/)src\/test\/.*\.kts?$/i.test(path) ||
    /(^|\/)[^/]+Test\.fs$/i.test(path) ||
    /(^|\/)test\/.*\.ml$/i.test(path) ||
    /(^|\/)(test|tests)\/.*_test\.py$/i.test(path) ||
    /(^|\/)(test_.*|.*_test)\.py$/i.test(path) ||
    /(^|\/)(tb_[^/]*|[^/]*_tb)\.(v|sv|vhd|vhdl)$/i.test(path) ||
    /(^|\/)test\/.*\.jl$/.test(path) ||
    /(^|\/)test\/.*\.l?hs$/.test(path) ||
    /Spec\.l?hs$/.test(path) ||
    // Nim's default exclude set uses the plural `tests/` directory (unlike
    // Julia's singular `test/` above) — mirrored as-is, not normalized.
    /(^|\/)tests\/.*\.nim$/.test(path) ||
    // Swift's default exclude set is `**/*Test.swift`, `**/*Tests.swift` and
    // `**/Tests/**/*.swift` — the directory form is matched case-insensitively
    // upstream, so both `Tests/` and `tests/` count.
    /(^|\/)\w*Tests?\.swift$/.test(path) ||
    /(^|\/)[Tt]ests\/.*\.swift$/.test(path) ||
    /(^|\/)tests\/.*\.r$/i.test(path) ||
    /(^|\/)tests\/.*\.elm$/i.test(path) ||
    /(^|\/)test\/.*\.zig$/i.test(path) ||
    /_test\.zig$/i.test(path) ||
    /\.t\.sol$/i.test(path) ||
    /(^|\/)(test|tests)\/.*\.(sol|vy)$/i.test(path)
  ) {
    return 'test';
  }

  return null;
}
