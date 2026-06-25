<!-- LANGUAGE: 한국어 -->

# sereview

[English](./README.md) · **한국어**

[![CI](https://github.com/SimYunSup/sereview/actions/workflows/ci.yml/badge.svg)](https://github.com/SimYunSup/sereview/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/sereview.svg)](https://www.npmjs.com/package/sereview)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

> **[Claude Code](https://docs.claude.com/en/docs/claude-code)를 위한 결정적 코드리뷰
> 스캐폴딩.** PR URL만 주면 `sereview`가 diff를 파싱하고, 바뀐 파일을 번들로 묶고,
> 보안 중심 룰셋을 매칭해서 **리뷰 패킷**을 만들어준다. 실제 라인 단위 리뷰는 이미
> 띄워둔 Claude Code 세션이 그 패킷을 읽고 직접 한다.

## 🔒 키가 필요 없는 구조 (no-key invariant)

`sereview`는 **어떤 LLM도 직접 호출하지 않고**, 모델 SDK를 **의존성으로도 두지 않는다**.
모델과 실제로 대화하는 건 이미 띄워둔 Claude Code 세션 하나뿐이라, **별도 API 키가
필요 없고** **비용을 두 번 낼 일도 없다**. 혹시라도 의존성이나 소스에 LLM SDK가 섞여
들어오면 CI 가드([`no-llm-sdk`](./scripts/check-no-llm-sdk.mjs))가 빌드를 깨뜨려 막아준다.

## 왜 만들었나

자체 모델 클라이언트를 끼고 다니는 코드리뷰 도구는 이미 인증해서 쓰고 있는 Claude
Code 위에 *두 번째* 모델 비용을 또 얹게 만든다. 게다가 기본 `/code-review`는 큰 diff를
부담 없이 다루게 해주는 결정적 토큰 관리(번들링 + 룰 사전 필터링)가 부족하다. 그래서
`sereview`는 일을 두 계층으로 나눈다:

| 계층 | 주체 | 하는 일 | 모델 호출? |
|------|------|---------|------------|
| **Tier 2** | `sereview`(이 패키지) | diff 파싱 → 파일 번들링 → 룰 매칭 → 패킷 | **안 함** |
| **Tier 1** | 내 Claude Code 세션 | 패킷을 읽고 `Read`/`Grep`으로 코드를 확인해 발견 사항 작성 | 함(어차피 내던 그 비용) |

```
PR URL ── gh pr diff ──▶ sereview  (파싱 · 번들링 · 룰 매칭)  ──▶ 리뷰 패킷
                          결정적, LLM 없음                          │
                                              호스트 Claude Code ◀──┘
                                              (Read/Grep → 발견 사항)
```

## 설치

```bash
# 설치 없이 한 번만
npx sereview packet <pr-url>

# 또는 프로젝트/전역 설치
pnpm add -D sereview
npm  i  -g  sereview
```

**Node ≥ 20** 과 [GitHub CLI](https://cli.github.com/)(`gh`)가 필요하다. PR diff를
받아오려면 `gh`가 인증(`gh auth status`)돼 있어야 한다.

## 사용법

```bash
# GitHub PR로 패킷 생성 (URL 또는 owner/repo#번호)
sereview packet https://github.com/owner/repo/pull/123
sereview packet owner/repo#123

# 로컬 unified diff로 생성 (테스트/푸시 전 리뷰에 유용)
git diff origin/main... | sereview packet --diff -
sereview packet --diff changes.patch

# 옵션
sereview packet <pr> --max-bundle-tokens 6000   # 번들 크기 조절(기본 8000)
sereview --help
sereview --version
```

이 명령은 JSON `ReviewPacket`을 **stdout**으로 출력한다. 그 자체로는 그냥 데이터일
뿐이고, [스킬](#리뷰-스킬)로 Claude Code 세션이 그 패킷을 읽어야 비로소 리뷰가
일어난다.

## 패킷 생김새

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
                       "newStart": 1, "newLines": 3, "lines": [ /* add/del/context 줄 */ ] } ] }
      ],
      "matchedRules": [
        { "id": "sql-injection", "category": "security", "severityHint": "high",
          "title": "SQL injection via string-built query", "guidance": "…", "appliesTo": ["…"] }
      ],
      "tokenEstimate": 73
    }
  ],
  "skipped": [ { "path": "logo.png", "reason": "binary" } ],
  "stats": { "files": 2, "additions": 2, "deletions": 1, "bundles": 1 },
  "rulebookVersion": "sereview-rulebook-1 (2026-06-25)"
}
```

- **`bundles`** — 바뀐 파일을 토큰 예산 안에서 묶은 그룹. 각 번들에는 매처가 거기서
  짚어낸 `matchedRules`가 함께 붙는다.
- **`matchedRules`** — *힌트*일 뿐이다("여기를 이런 유형의 버그로 의심해 보라"는 신호).
  판정이 아니라서, 목록이 비어 있다고 그 번들이 깨끗하다는 뜻은 아니다.
- **`skipped`** — 리뷰에서 제외한 파일(바이너리·락파일 등)을 이유와 함께 남긴다. 그래야
  뭐가 빠졌는지 조용히 사라지지 않는다.

## 리뷰 스킬

리뷰 로직은 Claude Code 스킬인 [`skill/SKILL.md`](./skill/SKILL.md)에 들어 있다. 세션을
이 스킬에 붙이거나(플러그인 스킬로 설치) PR 리뷰를 시키면, `sereview packet`을 실행하고
매칭된 룰을 읽은 다음 `Read`/`Grep`으로 맥락을 모아 `ReviewResult`를 돌려준다 — 바뀐
줄에 정확히 앵커된 발견 사항을 심각도별로 묶어서.

PR에 코멘트를 다는 기능은 MVP 범위가 **아니고**, 나중에 넣더라도 리뷰할 때마다 명시적인
허락을 받아야 한다 — sereview가 알아서 코멘트를 달지는 않는다.

### 다른 호스트 에이전트 (Codex 등)

sereview CLI는 특정 에이전트에 **묶이지 않는다** — 모델을 부르지 않고 패킷만 만들기
때문에, 셸 명령을 실행하고 파일을 읽을 수 있는 에이전트라면 무엇이든 Tier 1 리뷰어가
된다. **OpenAI Codex**는 [docs/codex.md](./docs/codex.md)를 참고하면 된다(같은
`ReviewResult` 계약을 `AGENTS.md` 블록이나 단발 프롬프트로 사용).

## 라이브러리 API

`sereview`는 순수 라이브러리로도 쓸 수 있다(`.` export). 전부 결정적이라, 같은 diff를
넣으면 같은 패킷이 나온다.

```ts
import { buildPacket, serializePacket } from "sereview";

const packet = buildPacket({
  diff,                                   // unified diff 텍스트
  source: { kind: "local-diff", ref: "HEAD" },
  maxBundleTokens: 8000,                  // 선택(기본 8000)
  // skip: (f) => f.path.endsWith(".lock") ? "lockfile" : null,  // 선택
});
console.log(serializePacket(packet));     // 보기 좋게 정리된 JSON
```

이 밖의 export: `parseDiff`, `detectLanguage`, `estimateTokens`,
`DEFAULT_MAX_BUNDLE_TOKENS`, `RULEBOOK_VERSION`, 그리고 모든 타입
(`ReviewPacket`, `ReviewBundle`, `MatchedRule`, `Finding`, `ReviewResult`, …).
자세한 건 [`src/core/types.ts`](./src/core/types.ts) 참고.

## 룰셋

보안 위주의 스타터 세트. 리뷰어에게 건네는 **힌트**로 쓴다:

| id | 분류 | 심각도 힌트 |
|----|------|-------------|
| `sql-injection` | security | high |
| `xss` | security | high |
| `ssrf` | security | high |
| `path-traversal` | security | high |
| `secret-exposure` | security | critical |
| `authz` | security | high |
| `npe` | correctness | medium |
| `race` | concurrency | medium |
| `n-plus-1` | performance | medium |

심각도 단계: `critical · high · medium · low · info`.

## 아키텍처 (Open Code Review에서 가져옴)

| Open Code Review (Go 바이너리) | sereview |
|---|---|
| 모델 클라이언트 (API 키) | 호스트 Claude Code 세션 (키 없음) |
| `file_read` / `code_search` | Claude `Read` / `Grep` |
| `code_comment` 규약 | `skill/SKILL.md` 출력 포맷 |
| diff 파싱·번들링·룰 매칭 (Go) | `src/core` (TypeScript) |
| 플랜 + 리뷰 루프 (LLM) | Claude Code 세션이 직접 |

## 개발

```bash
pnpm install
pnpm typecheck        # tsc --noEmit
pnpm test             # node --test (네이티브 TS, 빌드 불필요)
pnpm build            # tsdown → dist/
pnpm check:no-llm-sdk  # 키 없는 구조 강제
```

테스트는 Node 내장 러너로 TypeScript를 (트랜스파일 없이) 그대로 돌린다. 라이브러리와
CLI는 [tsdown](https://tsdown.dev)으로 번들한다.

## 배포

배포는 GitHub Actions로 자동화돼 있다([DaleStudy/daleui](https://github.com/DaleStudy/daleui)
방식 참고): 수동 **Release PR**이 버전을 올리고, 그 PR을 머지하면 **태그 + GitHub
Release 초안**이 생기며, 그 릴리스를 publish하면 OIDC Trusted Publishing으로 **provenance와
함께 npm에 배포**된다(npm 토큰 없이). **[docs/RELEASING.md](./docs/RELEASING.md)** 참고.

## 라이선스 · 출처

[Apache-2.0](./LICENSE). 결정적 파이프라인 설계(diff 파싱 · 번들링 · 룰 매칭)는
[Open Code Review](https://github.com/alibaba/open-code-review)(Apache-2.0)에서 가져와
다듬은 것이다. sereview의 룰셋은 OCR의 관심 영역에서 새로 작성한 작고 보안 중심적인
정규식 세트로, OCR의 언어별 룰 문서를 그대로 옮긴 건 아니다. 그리고 모델 호출 에이전트는
통째로 들어냈다. [`NOTICE`](./NOTICE) 참고.
