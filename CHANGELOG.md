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
