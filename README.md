<!-- LANGUAGE: English -->

# sereview

**English** · [한국어](./README.ko.md)

[![CI](https://github.com/SimYunSup/sereview/actions/workflows/ci.yml/badge.svg)](https://github.com/SimYunSup/sereview/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sereview.svg)](https://www.npmjs.com/package/sereview)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

> **Deterministic code-review scaffolding for [Claude Code](https://docs.claude.com/en/docs/claude-code).**
> Give it a pull-request URL; `sereview` parses the diff, bundles the changed
> files, matches a security-focused rulebook, and emits a **review packet**. Your
> existing Claude Code session reads that packet and does the actual line-by-line
> review.

## 🔒 The no-key invariant

`sereview` **never calls an LLM** and has **no model SDK** as a dependency. The
only thing that ever talks to a model is the Claude Code session you already run —
so there is **no separate API key** and **no double-billing**. A CI guard
([`no-llm-sdk`](./scripts/check-no-llm-sdk.mjs)) fails the build if an LLM SDK ever
sneaks into the dependencies or the source.

## Why

A code-review tool that ships its own model client makes you pay for a *second*
model on top of the Claude Code session you're already authenticated for. And the
stock `/code-review` lacks the deterministic token discipline (bundling +
rule pre-filtering) that keeps a large diff affordable. `sereview` splits the job
in two tiers:

| Tier | Who | What | Calls a model? |
|------|-----|------|----------------|
| **Tier 2** | `sereview` (this package) | Parse diff → bundle files → match rulebook → packet | **No** |
| **Tier 1** | your Claude Code session | Read the packet, open files with `Read`/`Grep`, write findings | Yes (the one you already pay for) |

```
PR URL ── gh pr diff ──▶ sereview  (parse · bundle · rule-match)  ──▶ review packet
                          deterministic, no LLM                          │
                                                  host Claude Code  ◀─────┘
                                                  (Read/Grep → findings)
```

## Install

```bash
# one-off, no install
npx sereview packet <pr-url>

# or add it to a project / install globally
pnpm add -D sereview
npm  i  -g  sereview
```

Requires **Node ≥ 20** and the [GitHub CLI](https://cli.github.com/) (`gh`),
authenticated (`gh auth status`) for fetching PR diffs.

## Usage

```bash
# Build a packet from a GitHub PR (URL or owner/repo#number)
sereview packet https://github.com/owner/repo/pull/123
sereview packet owner/repo#123

# Build from a local unified diff (great for testing / pre-push review)
git diff origin/main... | sereview packet --diff -
sereview packet --diff changes.patch

# Options
sereview packet <pr> --max-bundle-tokens 6000   # tune bundle size (default 8000)
sereview --help
sereview --version
```

The command prints a JSON `ReviewPacket` to **stdout**. On its own that's just
data — the review happens when a Claude Code session consumes it via the
[skill](#the-review-skill).

## What a packet looks like

```jsonc
{
  "schemaVersion": 1,
  "source": { "kind": "github-pr", "ref": "owner/repo#123", "title": "Add user lookup",
              "baseSha": "…", "headSha": "…" },
  "bundles": [
    {
      "id": "bundle-1",
      "files": [
        { "file": { "path": "src/db.ts", "status": "modified", "language": "typescript",
                    "additions": 2, "deletions": 1, "binary": false },
          "hunks": [ { "header": "@@ -1,2 +1,3 @@", "oldStart": 1, "oldLines": 2,
                       "newStart": 1, "newLines": 3, "lines": [ /* add/del/context lines */ ] } ] }
      ],
      "matchedRules": [
        { "id": "sql-injection", "category": "security", "severityHint": "high",
          "title": "SQL injection via string-built query", "guidance": "…",
          "appliesTo": ["…"], "matchedPaths": ["src/db.ts"] }
      ],
      "tokenEstimate": 73
    }
  ],
  "skipped": [ { "path": "logo.png", "reason": "binary" } ],
  "stats": { "files": 2, "additions": 2, "deletions": 1, "bundles": 1 },
  "rulebookVersion": "sereview-rulebook-4 (2026-07-15)"
}
```

- **`bundles`** group changed files under a token budget; each carries the
  `matchedRules` the deterministic matcher flagged for it.
- **`matchedRules`** are *hints* — "look here for this class of bug" — never
  verdicts. An empty list does not mean a bundle is clean.
- **`skipped`** records files left out of review (binary, lockfiles, …) with a
  reason, so nothing silently disappears.

## The review skill

The reviewing logic lives in [`skill/SKILL.md`](./skill/SKILL.md), a Claude Code
skill. Point a session at it (or install it as a plugin skill) and ask it to
review a PR; it runs `sereview packet`, reads the matched rules, gathers context
with `Read`/`Grep`, and returns a `ReviewResult` — findings anchored to the exact
changed lines, grouped by severity.

Posting comments back to the PR is **not** part of the MVP and, when added,
requires explicit per-review permission — sereview never comments on its own.

### Other host agents (Codex, …)

sereview's CLI is **agent-agnostic** — it never calls a model, it only builds the
packet. Any agent that can run a shell command and read files can be the Tier 1
reviewer. For **OpenAI Codex**, see [docs/codex.md](./docs/codex.md) (the same
`ReviewResult` contract, via an `AGENTS.md` block or a one-shot prompt).

## Library API

`sereview` is also a pure library (the `.` export). Everything is deterministic:
same diff in, same packet out.

```ts
import { buildPacket, serializePacket } from "sereview";

const packet = buildPacket({
  diff,                                   // unified diff text
  source: { kind: "local-diff", ref: "HEAD" },
  maxBundleTokens: 8000,                  // optional (default 8000)
  // skip: (f) => f.path.endsWith(".lock") ? "lockfile" : null,  // optional
  // rulebook: [ /* custom RuleDefinition[] */ ],                 // optional: swap the matched rule set
});
console.log(serializePacket(packet));     // pretty JSON
```

Other exports: `parseDiff`, `detectLanguage`, `estimateTokens`,
`DEFAULT_MAX_BUNDLE_TOKENS`, `RULEBOOK_VERSION`, `RULEBOOK`, `matchRules`, and
every type (`ReviewPacket`, `ReviewBundle`, `MatchedRule`, `RuleDefinition`,
`Finding`, `ReviewResult`, …). See [`src/core/types.ts`](./src/core/types.ts).

## Rulebook

A security-leaning starter set, used as **hints** for the reviewer:

| id | category | severity hint |
|----|----------|---------------|
| `sql-injection` | security | high |
| `xss` | security | high |
| `ssrf` | security | high |
| `path-traversal` | security | high |
| `secret-exposure` | security | critical |
| `authz` | security | high |
| `npe` | correctness | medium |
| `race` | concurrency | medium |
| `n-plus-1` | performance | medium |
| `github-actions-security` | security | high |

Severity scale: `critical · high · medium · low · info`.

Each rule is **language-gated**: it only fires on a file whose detected language
is one it covers (`appliesTo`). Rules scoped only by tag (e.g. `secret-exposure`,
tagged `any`) are language-agnostic and can fire on any file; a file whose
language can't be detected triggers only those. A matched rule also carries
`matchedPaths` — the changed files in the bundle it fired on.

## Architecture (from Open Code Review)

| Open Code Review (Go binary) | sereview |
|---|---|
| model client (API key) | host Claude Code session (no key) |
| `file_read` / `code_search` | Claude `Read` / `Grep` |
| `code_comment` convention | `skill/SKILL.md` output format |
| diff parse · bundle · rule-match (Go) | `src/core` (TypeScript) |
| plan + review loop (LLM) | the Claude Code session directly |

## Development

```bash
pnpm install
pnpm typecheck        # tsc --noEmit
pnpm test             # node --test (native TS, no build step)
pnpm build            # tsdown → dist/
pnpm check:no-llm-sdk  # enforce the no-key invariant
```

The test suite runs on Node's built-in runner against TypeScript directly (no
transpile). The library and CLI are bundled by [tsdown](https://tsdown.dev).

## Releasing

Publishing is automated via GitHub Actions (modeled on
[DaleStudy/daleui](https://github.com/DaleStudy/daleui)): a manual **Release PR**
bumps the version, merging it **tags** + drafts a GitHub Release, and publishing
that release **publishes to npm with provenance** via OIDC Trusted Publishing
(no npm token). See **[docs/RELEASING.md](./docs/RELEASING.md)**.

## License & attribution

[Apache-2.0](./LICENSE). The deterministic pipeline design (diff parse · bundle ·
rule-match) is adapted from [Open Code Review](https://github.com/alibaba/open-code-review)
(Apache-2.0). sereview's rulebook is a small, security-leaning regex set
re-authored from OCR's review concern areas — not a port of OCR's per-language
rule documents — and sereview removes the model-calling agent entirely. See
[`NOTICE`](./NOTICE).
