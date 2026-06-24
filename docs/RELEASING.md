# Releasing sereview

[English](#english) · [한국어](#한국어)

The release pipeline is modeled on
[DaleStudy/daleui](https://github.com/DaleStudy/daleui): three GitHub Actions
workflows turn a version bump into a provenance-signed npm publish via OIDC
**Trusted Publishing** (no npm token stored anywhere).

```
Release PR ⬆️  (manual: pick patch/minor/major)
   └─ bumps package.json, opens a `release/vX.Y.Z` PR
        │  review + merge
        ▼
Tagging 🏷️  (on merge of release/*)
   └─ creates tag vX.Y.Z + a DRAFT GitHub Release (auto notes)
        │  edit the draft, then Publish
        ▼
Publication 📦  (on Release published)
   └─ verify tag == package.json, build, `npm publish --provenance`
      via OIDC Trusted Publishing (environment: npm) — no token
```

> **Chicken-and-egg:** npm only shows the *Trusted Publisher* setting on a package
> that **already exists**. So the **very first publish is a one-time manual
> bootstrap**; every release after that is automated and keyless.

---

## English

### First-time setup (bootstrap)

1. **Public repo.** npm provenance requires a public repository (sereview is
   Apache-2.0 OSS — the intended state).

2. **GitHub Environment `npm`.** Repo → *Settings → Environments → New
   environment* → name it `npm`. (Add required reviewers here to gate publishes.)

3. **Bootstrap-publish `0.1.0` once** (this creates the package so a Trusted
   Publisher can be configured). Pick one:

   - **Local — simplest:**
     ```bash
     npm login
     pnpm install && pnpm build
     npm publish --no-provenance   # one-time only; CI releases get provenance later
     ```
     (`--no-provenance` overrides `publishConfig.provenance` for this single
     laptop publish, which has no OIDC. `0.1.0` ships without a provenance badge;
     `0.1.1+` get it via CI.)

   - **CI with a token — keeps it off your laptop & gives provenance on `0.1.0`:**
     create an npm *automation* token, add it as the repo secret `NPM_TOKEN`,
     temporarily add to the publish step in `publication.yml`:
     ```yaml
     - run: npm publish --provenance --ignore-scripts
       env:
         NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
     ```
     create the `v0.1.0` release (see below), then **remove** the secret and that
     `env:` block once Trusted Publishing is set up.

4. **Configure the Trusted Publisher** (now that `sereview` exists on npm):
   npm package page → *Settings → Trusted Publisher → GitHub Actions* →
   **User** `SimYunSup`, **Repository** `sereview`, **Workflow** `publication.yml`,
   **Environment** `npm`. From now on `publication.yml` publishes **keyless** with
   provenance — no token anywhere.

### Cutting a release (after bootstrap)

1. **Actions → “Release PR ⬆️” → Run workflow.** Choose the bump
   (`patch` / `minor` / `major`). It bumps `package.json` and opens a
   `release/vX.Y.Z` PR whose body lists the PR numbers since the last tag.
2. **Review and merge** that PR into `main`.
3. Merging triggers **Tagging 🏷️**, which pushes tag `vX.Y.Z` and creates a
   **draft** GitHub Release with generated notes.
4. **Releases → edit the draft → Publish.** That triggers **Publication 📦**,
   which re-checks the tag matches `package.json`, runs tests + build, and
   `npm publish --provenance`.
5. Confirm <https://www.npmjs.com/package/sereview> shows the new version with a
   provenance badge.

> **The bootstrap `v0.1.0`:** you already have version `0.1.0` in `package.json`,
> so don't run “Release PR ⬆️” for it — create the release directly (in your
> terminal: `git tag v0.1.0 && git push origin v0.1.0 && gh release create v0.1.0
> --generate-notes`, or via the GitHub UI). Use “Release PR ⬆️” for `0.1.1` and up.

### Notes

- `package.json` `version` is the single source of truth; publish fails fast if
  the tag disagrees.
- The published tarball ships only `dist/`, `skill/`, `LICENSE`, `NOTICE`,
  `README.md` (verify with `npm pack --dry-run`).
- CI (`ci.yml`) runs typecheck/test/build/no-llm-sdk on every PR; keep it green.

---

## 한국어

### 최초 설정 (부트스트랩)

> npm은 **이미 존재하는 패키지**에만 *Trusted Publisher* 설정을 보여준다(그래서 "안
> 보인다"가 정상이다). 따라서 **맨 처음 한 번은 수동 배포**가 필요하고, 그 이후 릴리스는
> 전부 자동·무토큰이 된다.

1. **공개 레포.** provenance는 public 레포가 필요하다(sereview는 Apache-2.0 OSS).

2. **GitHub Environment `npm`.** 레포 → *Settings → Environments → New
   environment* → 이름 `npm`. (required reviewers를 걸면 배포마다 승인 요구 가능.)

3. **`0.1.0`을 한 번 부트스트랩 배포**(패키지를 만들어야 Trusted Publisher 설정이 생긴다).
   둘 중 하나:

   - **로컬 — 가장 간단:**
     ```bash
     npm login
     pnpm install && pnpm build
     npm publish --no-provenance   # 이 한 번만; CI 릴리스는 이후 provenance 붙음
     ```
     (`--no-provenance`가 이 1회 로컬 배포에 한해 `publishConfig.provenance`를
     덮어쓴다 — 로컬엔 OIDC가 없으므로. `0.1.0`엔 provenance 배지가 없고 `0.1.1+`부터
     CI로 붙는다.)

   - **CI + 토큰 — 노트북 밖에서, `0.1.0`에도 provenance:** npm *automation* 토큰을
     만들어 레포 시크릿 `NPM_TOKEN`으로 추가하고, `publication.yml`의 publish 스텝에
     임시로 더한다:
     ```yaml
     - run: npm publish --provenance --ignore-scripts
       env:
         NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
     ```
     `v0.1.0` 릴리스를 만든 뒤(아래 참고), Trusted Publishing을 설정하고 나면 그 시크릿과
     `env:` 블록을 **제거**한다.

4. **Trusted Publisher 설정**(이제 `sereview`가 npm에 존재하므로 보인다):
   npm 패키지 페이지 → *Settings → Trusted Publisher → GitHub Actions* →
   **User** `SimYunSup`, **Repository** `sereview`, **Workflow** `publication.yml`,
   **Environment** `npm`. 이후 `publication.yml`이 **무토큰**으로 provenance와 함께
   배포한다.

### 릴리스 발행하기 (부트스트랩 이후)

1. **Actions → “Release PR ⬆️” → Run workflow.** 올릴 단위(`patch` / `minor` /
   `major`)를 고른다. `package.json` 버전을 올리고 지난 태그 이후 PR 번호를 본문에 담은
   `release/vX.Y.Z` PR을 연다.
2. 그 PR을 **리뷰하고 `main`에 머지**한다.
3. 머지되면 **Tagging 🏷️**이 태그 `vX.Y.Z`를 푸시하고 자동 노트가 달린 **초안**
   GitHub Release를 만든다.
4. **Releases → 초안 편집 → Publish.** **Publication 📦**이 태그와 `package.json`
   일치를 확인하고, 테스트 + 빌드 후 `npm publish --provenance`를 실행한다.
5. <https://www.npmjs.com/package/sereview> 에 새 버전 + provenance 배지를 확인.

> **부트스트랩 `v0.1.0`:** `package.json`이 이미 `0.1.0`이라 그 버전엔 “Release PR ⬆️”를
> 돌리지 말고 릴리스를 직접 만든다(터미널: `git tag v0.1.0 && git push origin v0.1.0 &&
> gh release create v0.1.0 --generate-notes`, 또는 GitHub UI). “Release PR ⬆️”는
> `0.1.1`부터 사용한다.

### 메모

- `package.json`의 `version`이 단일 진실원천. 태그와 다르면 publish가 바로 실패한다.
- 배포 tarball은 `dist/`, `skill/`, `LICENSE`, `NOTICE`, `README.md`만 담는다
  (`npm pack --dry-run`).
- CI(`ci.yml`)가 PR마다 typecheck/test/build/no-llm-sdk를 돈다. 그린 유지.
