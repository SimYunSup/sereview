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

### Changed

- **Language gating (rulebook v4):** a rule now fires on a file only when the
  file's detected language is one it covers (`appliesTo`). Tag-only rules (e.g.
  `secret-exposure`) stay language-agnostic; unknown-language files trigger only
  those. So `eval()` in a `.py` file no longer flags `xss`, and SQL in a `.md`
  file no longer flags `sql-injection`.
- **Workflow hardening:** third-party actions (`pnpm/action-setup`,
  `fregante/setup-git-user`) are pinned to commit SHAs; the publish job pins npm
  to the `11` major; `tagging` runs only for `release/*` PRs from this repo.
- **Upstream watch** updates an already-open tracking issue instead of opening a
  duplicate, preserving the oldest un-reviewed range.

### Fixed

- **Diff parser:** a whitespace-stripped empty context line no longer truncates
  the rest of a hunk.

### Docs

- README / README.ko rule table includes `github-actions-security`, the sample
  packet shows the current rulebook version, and `skill/SKILL.md` verifies
  `schemaVersion` and pins the CLI to `sereview@^0.1`.

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
