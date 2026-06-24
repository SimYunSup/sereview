# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project adheres
to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

[Unreleased]: https://github.com/SimYunSup/sereview/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/SimYunSup/sereview/releases/tag/v0.1.0
