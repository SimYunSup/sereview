# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Astro support in the rulebook (rulebook v3):** the `xss` rule recognizes
  Astro's `set:html` sink and `.astro` maps to the `astro` language. Derived from
  upstream open-code-review's Astro rules (v1.6.5…v1.7.7 review).
- **Rule-engine surface exports:** `RULEBOOK`, `matchRules`, `RuleDefinition`,
  and `RuleContext`, plus a `rulebook` option on `buildPacket` to swap the
  matched rule set (the existing `rules` static override still wins).
- **`MatchedRule.matchedPaths`:** the changed files a rule fired on, in diff
  order. Optional, so the packet stays `schemaVersion` 1.
- **Golden-packet regression test:** freezes the serialized packet for a
  representative diff; regenerate with `UPDATE_GOLDEN=1 pnpm test`.
- **`template-injection` rule (rulebook v5):** FreeMarker SSTI signals
  (`?new()`, `?eval`, `?api`, `Execute`/`ObjectConstructor`, dynamic
  `<#include>`, `?no_esc`), with `.ftl`/`.ftlh`/`.ftlx` mapping to a new
  `freemarker` language. Derived from the FreeMarker rules added in upstream
  open-code-review v1.7.8…v1.7.13. (Upstream's new `.po` gettext rules were
  reviewed and intentionally not adopted — i18n-correctness rules are outside
  sereview's security-leaning starter rulebook.)
- **`rust-macro-correctness` rule (rulebook v6):** fires only when a diff
  *defines* a macro (`macro_rules!` or a `#[proc_macro*]` attribute), never on
  an invocation, and points the reviewer at the classic expansion footguns —
  `$x:expr` interpolated twice, missing `$crate::`, unparenthesized `$t:tt`
  re-emission, proc macros that `panic!` instead of emitting `syn::Error`, and
  broken hygiene. Derived from the `Macros and Metaprogramming` section added to
  upstream open-code-review's `rust.md` (v1.7.14…v1.7.17).
- **Julia support (rulebook v6):** `.jl` maps to a new `julia` language, Julia's
  `test/` layout (e.g. `test/runtests.jl`) joins the default skip filter, and a
  `julia-security` rule covers the language's security-sensitive constructs —
  `eval`/`@eval`/`Meta.parse`/`include_string` on external input, a deliberate
  `sh -c`/`bash -c` invocation (a plain backtick `Cmd` needs no shell and is not
  flagged), `ccall`/`unsafe_*`/`pointer`, and SQL built by interpolation.
  Derived from upstream's Julia allowlist + `julia.md` (v1.7.14…v1.7.17).
  (Upstream's Julia type-stability, dispatch, and performance guidance was
  reviewed and intentionally not adopted — like the `.po` rules before it, that
  is language-idiom advice rather than a security/correctness defect class.
  Upstream's new OpenCode plugin is out of scope too: sereview has no
  model-calling agent, and its host integration is `skill/SKILL.md`.)
- **`iac-security` rule (rulebook v7):** `.tf`/`.tfvars`/`.hcl` map to a new
  `terraform` language and `.bicep` to a new `bicep` language, and an
  `iac-security` rule flags an unrestricted source (`0.0.0.0/0`, `::/0`) on a
  security group / NSG rule, a wildcard `Action`/`Resource` in an inline IAM
  policy, `publicNetworkAccess: 'Enabled'` (Bicep) or an equivalent
  `Internet`-facing NSG source, and a committed `terraform.tfstate` (or
  `.tfstate.backup`) file. Derived from the new `terraform.md`/`bicep.md`
  security sections in upstream open-code-review (v1.7.17…v1.8.6). (Upstream's
  companion `go.md`/`php.md` were reviewed and intentionally not adopted: they
  are agent review instructions that presuppose `file_read`/`code_search`
  verification, which is `skill/SKILL.md`'s job here, not a deterministic
  `matches` heuristic. `protobuf.md`'s wire-compatibility checks need an
  old-side diff to compare field numbers/types against, so an `addedText`-only
  heuristic could only fire on every `.proto` change with no evidence — not
  adopted. `prisma.md` and `composer_json.md` need database state / lockfile
  context sereview doesn't have access to — not adopted. The new language
  mappings for these upstream doc sets *are* adopted where they're
  self-contained: `.proto` → `protobuf`, `.prisma` → `prisma`, and `.phtml` →
  `php`, so the existing language-gated rules — `sql-injection`,
  `path-traversal` — already cover `.phtml` files.)
- **Default skip filter (upstream #683 exclude-list expansion mirror):**
  `**/testdata/**` and `**/fixtures/**` directories now skip with reason
  `'test data'`, and `**/*.generated.*`, `**/*.gen.go`, and `**/*.pb.{go,cc,h}`
  now skip as `'generated'`. From the open-code-review v1.7.17…v1.8.6 sync.
  (Upstream's `index <old>..<new>` header-parsing fix does not apply here:
  sereview's diff parser already treats any unrecognized extended-header line —
  including `index `/`similarity index ` — as opaque and skips it, so no
  parser change was needed.)
- **Haskell, Nim & Nix support (rulebook v8):** `.hs`/`.lhs` map to a new
  `haskell` language, `.nim`/`.nims`/`.nimble` to a new `nim` language, and
  `.nix` to a new `nix` language; Haskell's `test/**/*.{hs,lhs}` and
  `**/*Spec.{hs,lhs}` and Nim's `tests/**/*.nim` (plural, unlike Julia's
  singular `test/`) join the default skip filter; and three rules cover the
  new languages' security-sensitive constructs — `haskell-security` flags
  `unsafePerformIO`/`unsafeCoerce`/`unsafeInterleaveIO`/`unsafeIOToSTM`, a
  `callCommand`/`spawnCommand`/`runCommand`/`shell` process invocation (a
  `proc` call with an explicit argument list is not flagged), and a `foreign
  import`; `nim-security` flags `execShellCmd`/`staticExec`/`gorge`,
  `cast[]`/`unsafeAddr` (a bare `addr` is not flagged), and an
  `importc`/`exportc`/`dynlib` FFI pragma; `nix-reproducibility` flags a
  `fetchTarball`/`fetchGit`/`fetchurl`/`fetchFromGitHub`/`builtins.fetch*`
  call (fires only when the added lines carry no `rev`/hash pin — an
  unpinned source, or a source change without the matching hash update)
  and a mutable `<nixpkgs>` channel import. Derived from upstream
  open-code-review v1.8.6…v1.9.0's new `haskell.md`/`nim.md`/`nix.md` rule
  docs plus its allowlist/exclude-pattern expansion. (Upstream's Haskell
  totality/laziness guidance, Nim style conventions, and Nix module/overlay
  guidance were reviewed and intentionally not adopted — like `go.md`/
  `php.md` before them, they are agent review instructions that presuppose
  `file_read` verification, not a deterministic `matches` heuristic. The
  upstream scan-side changes — resume checkpoints, a preview-session fix, and
  `retry_codes`/provider-preset additions — are out of scope: sereview has no
  model-calling agent, so that surface doesn't exist here. A per-file token
  limit knob is already covered by sereview's existing `--max-bundle-tokens`.
  The `internal/diff/` changes in this range are an SPDX license-header
  addition only, with no parser behavior change, so no diff-parser change was
  needed.)
- **Swift support in the rulebook (rulebook v9):** Swift's default exclude set
  (`**/*Test.swift`, `**/*Tests.swift`, `**/Tests/**/*.swift` — the directory
  form matched case-insensitively, as upstream does) joins the default skip
  filter, and three rules cover the language's deterministic defect signals:
  `swift-security` flags an `Unsafe*Pointer`/`withUnsafe*` region,
  `unsafeBitCast`/`unsafeDowncast`, a `WKWebView` JavaScript bridge
  (`WKUserContentController`/`WKScriptMessageHandler`/`evaluateJavaScript`),
  `NSAllowsArbitraryLoads`, and a `URLCredential(trust:)`/`serverTrust`
  certificate-validation bypass; `swift-concurrency` flags the isolation
  escape hatches — `@unchecked Sendable`, `nonisolated(unsafe)`,
  `Task.detached`, `withUnsafe(Throwing)Continuation` (the `Checked` variants
  are not flagged), and a `DispatchSemaphore` that can be waited on across an
  `await`; `swift-runtime-safety` flags `try!`, an `[unowned]` capture, and a
  force cast (`as!`) of a deserialized value on the same line as its
  `JSONSerialization`/`JSONDecoder`/`NSKeyedUnarchiver`/`UserDefaults` source
  (an ordinary `as!` downcast, e.g. a dequeued cell, is not flagged). `.swift`
  already mapped to the `swift` language, so no diff-parser change was needed.
  Derived from upstream open-code-review v1.9.0…v1.9.5's new `swift.md` rule
  doc plus its exclude-pattern expansion. (Upstream's SwiftUI state/lifecycle,
  SwiftData/Core Data, HealthKit, StoreKit-entitlement, Combine-scheduler and
  testing guidance was reviewed and intentionally not adopted: each needs
  ownership, lifecycle or call-site verification via `file_read`, which is
  `skill/SKILL.md`'s job, not a deterministic `matches` heuristic. Force
  unwrap `!` on its own is likewise not flagged — upstream scopes it to
  runtime-derived values, and an unscoped `!` would fire on almost every Swift
  diff. Upstream's `IsUserExcluded`/`IsUserIncluded` case-insensitivity fix and
  its gitignore directory-pattern fix have no counterpart here: sereview's skip
  filter is a predicate with no user glob patterns, and it consumes a diff
  rather than walking a work tree. The rest of the range — SARIF output, LLM
  retry identity/reporting, session resume, the `budget_exceeded` scan summary
  flag, and the `kimi-global` provider — is model-calling agent surface that
  does not exist in sereview; `internal/diff/`'s cross-file comment relocation
  is comment placement for that agent's output, which the host Claude Code
  session does here.)

### Changed

- **Language gating (rulebook v4):** a rule now fires on a file only when the
  file's detected language is one it covers (`appliesTo`). Tag-only rules (e.g.
  `secret-exposure`) stay language-agnostic; unknown-language files trigger only
  those. So `eval()` in a `.py` file no longer flags `xss`, and SQL in a `.md`
  file no longer flags `sql-injection`.
- **Workflow hardening:** third-party actions (`pnpm/action-setup`,
  `fregante/setup-git-user`) are pinned to commit SHAs; the publish job pins npm
  to the `11` major; `tagging` runs only for `release/*` PRs from this repo.
- **Upstream watch** now updates an already-open tracking issue instead of
  opening a duplicate — it retitles to the latest version and preserves the
  oldest un-reviewed "from" version so the compare link covers the whole range,
  appending the new release notes. Also corrects the stale checklist wording
  (the tracked version is bumped when the issue opens) and does a
  `git pull --rebase` before pushing. (from the open-code-review v1.6.5…v1.7.7 sync)

### Fixed

- **Diff parser:** a whitespace-stripped empty context line no longer truncates
  the rest of a hunk.
- **Diff parser:** C-quoted paths (git's default `core.quotepath=true`) now
  decode octal/backslash escapes, so non-ASCII paths (e.g. `src/café/文件.ts`)
  parse to real UTF-8 paths with correct language detection. Mirrors upstream's
  `core.quotepath=false` fix at the parser level (sereview consumes diffs
  rather than running git). (from the open-code-review v1.7.8…v1.7.13 sync)

### Docs

- README / README.ko rule table includes `github-actions-security`, the sample
  packet shows the current rulebook version, and `skill/SKILL.md` verifies
  `schemaVersion` and pins the CLI to `sereview@^0.1`.
- **`skill/SKILL.md` result contract:** `severity` and `category` are stated as
  closed sets that must be written verbatim in lowercase, with instructions for
  the no-clean-fit case. sereview never parses model output, so upstream's
  `code_comment` enum normalization (v1.7.14…v1.7.17) applies at the only place
  sereview owns: the reviewer contract.

## [0.1.2] - 2026-06-28

### Added

- **`github-actions-security` rule (rulebook v2):** Detects `pull_request_target`
  misuse, secrets interpolated in `run:` blocks, user-controlled expressions
  enabling script injection, and third-party actions pinned to mutable tags rather
  than a commit SHA. Derived from the GitHub Actions rules added to upstream
  open-code-review on 2026-06-22.
- **Upstream watch** (`.github/workflows/upstream-watch.yml`): Weekly scheduled
  job that detects new releases of `alibaba/open-code-review`, opens a GitHub
  issue with a review checklist, and bumps `.github/upstream-versions.json`.

## [0.1.1] - 2026-06-25

First release published to npm via OIDC Trusted Publishing. No user-facing code
changes over 0.1.0.

## [0.1.0] - 2026-06-25

Initial release.

### Added

- **Deterministic core (`sereview` library, no LLM):** `buildPacket` /
  `serializePacket` turn a unified diff into a `ReviewPacket` — diff parsing,
  token-budget file bundling, and rulebook matching. Also exports `parseDiff`,
  `detectLanguage`, `estimateTokens`, and the full type contract.
- **CLI:** `sereview packet <pr-url | owner/repo#n>` (via `gh`) and
  `sereview packet --diff <path|->`, plus `--max-bundle-tokens`, `--help`,
  `--version`.
- **Review skill** (`skill/SKILL.md`): the Claude Code session is the reviewer;
  it consumes the packet and returns a `ReviewResult`.
- **Security rulebook (9):** `sql-injection`, `xss`, `ssrf`, `path-traversal`,
  `secret-exposure`, `authz`, `npe`, `race`, `n-plus-1`.
- **No-key invariant:** no LLM SDK dependency or import, enforced by
  `scripts/check-no-llm-sdk.mjs` and the `no-llm-sdk` CI job.
- **CI** (`ci.yml`): typecheck, test, build, and the no-llm-sdk guard.
- **Release automation** (`release-pr.yml`, `tagging.yml`, `publication.yml`):
  version-bump PR → tag + draft release → `npm publish --provenance` via OIDC
  Trusted Publishing.

### Attribution

- Review rule taxonomy and the deterministic pipeline design are derived from
  [Open Code Review](https://github.com/alibaba/open-code-review) (Apache-2.0);
  the model-calling agent is removed and replaced by the host Claude Code session.
  See `NOTICE`.

[Unreleased]: https://github.com/SimYunSup/sereview/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/SimYunSup/sereview/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/SimYunSup/sereview/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/SimYunSup/sereview/releases/tag/v0.1.0
