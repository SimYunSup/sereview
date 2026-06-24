# Using sereview with OpenAI Codex (and any host agent)

[English](#english) · [한국어](#한국어)

sereview's **Tier 2** — the `sereview` CLI / library — is **agent-agnostic**. It
only builds a deterministic review packet (parse · bundle · rule-match) and never
calls a model. So the **Tier 1** reviewer can be *any* coding agent that can run a
shell command and read files: Claude Code, **OpenAI Codex**, Cursor, etc. Only the
"brain" instructions differ per agent — the packet and the `ReviewResult` shape are
identical.

- Claude Code → use [`skill/SKILL.md`](../skill/SKILL.md).
- Codex → use this guide. The review *discipline* is the same as `skill/SKILL.md`;
  only the tool names change (Codex reads files and runs `rg`/shell itself).

---

## English

### Prerequisites

```bash
npm i -g @openai/codex      # the Codex CLI
npm i -g sereview           # or rely on `npx sereview`
gh auth status              # GitHub CLI, authenticated (for PR diffs)
```

### Option A — `AGENTS.md` (recommended)

Codex reads `AGENTS.md` from the working directory. Drop this block into the
`AGENTS.md` of the repo you review (or a dedicated review workspace), then just ask
Codex: *"Review PR `<url>`."*

````markdown
## Reviewing a pull request with sereview

You are the reviewer. `sereview` is a deterministic CLI — it never calls a model;
it only builds the review packet. Do the actual review yourself.

1. Build the packet (capture stdout JSON):
   `npx sereview packet <pr-url | owner/repo#n>`   (or `--diff -` for a local diff)
2. For each bundle, read `matchedRules` (HINTS, not verdicts) and the hunks. Open
   the changed files and gather context with your file-read and `rg` (ripgrep)
   tools. Stay within the packet + the context a finding needs.
3. Comment on changed lines only. Every finding needs: why it's wrong, the impact,
   and how it triggers. No speculation (uncertain → `info`). No style nitpicks
   unless a matched rule covers it. Deduplicate. Be honest about severity
   (critical · high · medium · low · info). Anchor each finding to a NEW-file line.
4. Return a `ReviewResult` (see below). If nothing is found, return an empty
   `findings` array plus a summary of WHAT you checked.

Never post comments back to the PR on your own. Only if explicitly asked, and only
after confirming, may you post them.
````

### Option B — one-shot prompt

Without editing `AGENTS.md`, run Codex and paste:

> Review PR `<url>`. Run `npx sereview packet <url>`, read the packet's bundles and
> `matchedRules`, open the changed files for context, and return findings in
> sereview's `ReviewResult` format (file, NEW-file line, severity, category,
> ruleId?, title, body, suggestion?) grouped by severity. Changed lines only;
> justify each with impact + trigger; don't post any PR comments.

### `ReviewResult` shape

Same contract as Claude Code (and the library's exported types):

```jsonc
{
  "schemaVersion": 1,
  "source": { /* copied from the packet */ },
  "findings": [
    { "bundleId": "bundle-1", "file": "src/db.ts", "line": 12, "endLine": 14,
      "severity": "high", "category": "security", "ruleId": "sql-injection",
      "title": "…", "body": "why + impact + trigger", "suggestion": "…" }
  ],
  "summary": "what changed and the headline risks",
  "countsBySeverity": { "critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0 }
}
```

### Tool mapping (Claude Code → Codex)

| Claude Code | Codex |
|---|---|
| `Read` | Codex's file read |
| `Grep` | `rg` (ripgrep) via shell |
| `Bash(npx sereview …)` | shell `npx sereview …` |
| skill `skill/SKILL.md` | `AGENTS.md` block (above) |

---

## 한국어

### 준비물

```bash
npm i -g @openai/codex      # Codex CLI
npm i -g sereview           # 또는 `npx sereview` 사용
gh auth status              # GitHub CLI 인증(PR diff 취득용)
```

### 방법 A — `AGENTS.md` (권장)

Codex는 작업 디렉터리의 `AGENTS.md`를 읽는다. 리뷰할 레포(또는 전용 리뷰 워크스페이스)의
`AGENTS.md`에 아래 블록을 넣고, Codex에게 *"PR `<url>` 리뷰해줘"* 라고만 하면 된다.

````markdown
## sereview로 PR 리뷰하기

리뷰의 주체는 너다. `sereview`는 모델을 부르지 않는 결정형 CLI이며 리뷰 패킷만 만든다.
실제 리뷰는 네가 한다.

1. 패킷 생성(stdout JSON 캡처):
   `npx sereview packet <pr-url | owner/repo#번호>`  (로컬 diff는 `--diff -`)
2. 번들마다 `matchedRules`(판정이 아니라 힌트)와 hunk를 읽는다. 바뀐 파일을 열고
   파일 읽기·`rg`(ripgrep)로 맥락을 모은다. 패킷 + 발견에 필요한 맥락 안에서만 본다.
3. 변경된 줄에만 코멘트한다. 각 발견엔 왜 문제인지·영향·재현경로가 있어야 한다. 추측 금지
   (불확실→`info`), 룰에 없는 스타일 트집 금지, 중복 제거, 심각도 정직
   (critical·high·medium·low·info). 각 발견은 신규 파일 줄번호에 앵커한다.
4. `ReviewResult`를 반환한다(아래). 발견이 없으면 빈 `findings` 배열 + "무엇을 확인했는지"
   요약을 낸다.

PR에 코멘트는 스스로 달지 않는다. 명시적으로 요청받고 확인한 뒤에만 단다.
````

### 방법 B — 단발 프롬프트

`AGENTS.md`를 건드리지 않고, Codex를 켜서 이렇게 붙여넣는다:

> PR `<url>` 리뷰해줘. `npx sereview packet <url>`을 돌려 패킷의 번들과 `matchedRules`를
> 읽고, 바뀐 파일을 열어 맥락을 보고, sereview `ReviewResult` 포맷(file, 신규 줄번호,
> severity, category, ruleId?, title, body, suggestion?)으로 심각도별로 묶어 발견을 내줘.
> 변경된 줄만, 각 발견은 영향+재현경로로 근거를 달고, PR 코멘트는 달지 마.

### `ReviewResult` 형태

Claude Code(및 라이브러리 export 타입)와 동일한 계약 — 위 English 섹션의 JSON 참고.

### 도구 매핑 (Claude Code → Codex)

| Claude Code | Codex |
|---|---|
| `Read` | Codex 파일 읽기 |
| `Grep` | 셸의 `rg`(ripgrep) |
| `Bash(npx sereview …)` | 셸 `npx sereview …` |
| 스킬 `skill/SKILL.md` | 위 `AGENTS.md` 블록 |
