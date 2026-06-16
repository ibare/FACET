# FACET — Claude Code 협업 가이드

## 프로젝트 개요

FACET 는 알고리즘 학습을 위한 인터랙티브 시각화 프레임워크다. TypeScript / pnpm workspace 모노레포, Vitest + happy-dom 로 테스트, **ESLint 미도입**. 코드 품질은 `strict: true` tsc + `rules/` + `rule-guard` 서브에이전트 + Baden 로 커버한다.

### 4-layer 아키텍처

```
Algorithm  →  Projector  →  JSON (FacetJson)  →  Runner
```

- **Algorithm** (`facets/*/src/algorithm.ts`) — 순수 TS 함수. `FacetContext` 를 받아 `ctx.emit` + `ctx.metric` 으로 이벤트 발신.
- **Projector** (`facets/*/src/projector.ts`) — `ProjectorFactory`. algorithm 이벤트를 View 메서드 호출로 번역.
- **JSON** (`facets/*/src/facet.ts`) — `FacetJson`. 어떤 algorithm / projector / IR / View / 레이아웃 / 컨트롤을 쓸지 선언.
- **Runner** (`packages/core/src/runtime/runner.ts`) — JSON 을 받아 View 를 mount 하고 algorithm 을 재생.

## 규칙 체계

`rules/` 디렉터리에 프로젝트 고유 규칙이 선언되어 있다.

```
rules/
  INDEX.yaml                 ← 트리거 레지스트리
  principles.md              ← 6 원칙 (Tier 1, 항상 로드)
  concerns/C1~C9.md          ← 9 관심사 (Tier 2)
  specifics/S-*.md           ← 5 도메인 (Tier 3)
  _analysis.md / _audit-v*.md ← 감사 기록
```

### 로딩 규약

- **principles.md** 는 모든 작업에서 항상 로드한다.
- 파일을 읽거나 편집할 때, `rules/INDEX.yaml` 의 trigger 에 해당 경로/패턴/import 가 매치되면 해당 `concerns/*` 또는 `specifics/*` 를 추가로 로드한다.
- 규칙 본문의 MUST / MUST NOT 을 침범하면 수정 제안 전에 **규칙 ID 를 명시해 경고**한다.
- PREFER / Exception 은 강제가 아니나 설계 판단의 맥락으로 참고한다.

### Compaction 후 복원

대화 compaction 이후에도 `rules/principles.md` 와 `rules/INDEX.yaml` 을 우선 다시 읽어 맥락을 복구한다. 자세한 본문은 INDEX 의 trigger 로 재판단한다.

## rule-guard 서브에이전트

코드 변경 후 의미/맥락 규칙 위반을 감사한다. `.claude/agents/rule-guard.md` 에 정의.

호출 방법:
- 사용자가 "규칙 체크" / "rule-guard" / "audit" 등으로 명시 호출.
- PR 리뷰 전 또는 여러 파일 편집 후 자발적 호출 권장.
- Phase 7 이후 Baden `task complete` 에서 자동화 예정.

감사 대상은 기본 `git diff --name-only HEAD~1`. 특정 경로나 규칙 ID 를 지정할 수 있다.

## Baden 작업 통제

Baden MCP 도구 (`mcp__baden__*`) 가 활성화되면 다음 순서를 지킨다.

### 필수 호출

1. **세션 시작** — 사용자 지시를 받으면 `mcp__baden__baden_start_task` 로 `projectName: "FACET"` 을 넘겨 `taskId` 를 발급받는다. 이후 모든 `baden_*` 호출에 동일 `taskId` 를 사용한다.
2. **계획 수립** — 비자명한 작업이면 `baden_plan` 으로 설계 결정을 기록한다.
3. **일반 행동** — 파일 읽기 / 수정 / 생성 전에 `baden_action` 을 호출한다. `action` 은 snake_case 동사로 시작 (`read_*`, `modify_*`, `create_*`, `search_*` 등).
4. **검증** — `pnpm typecheck` / `pnpm test` / `rule-guard` 실행 결과는 `baden_verify` 로 보고한다.
5. **규칙 사건** — rule-guard 가 위반을 발견하거나 수정을 적용하면 `baden_rule` 을 호출한다 (`ruleId` = `C1` 등, `severity`, `target`).
6. **작업 종료** — 최종 결과를 `baden_complete_task` 에 요약해 보고한다. 규칙 위반 미해소 시 complete 가 차단될 수 있다.

### 프로젝트 식별자

- `projectName`: `FACET` (Baden 에 등록된 이름).
- 규칙 ID 매핑은 `rules/INDEX.yaml` 의 `id:` 필드를 그대로 사용한다 (`C1~C9`, `S-facet`, `S-view`, `S-runtime`, `S-transpiler`, `S-host`).

### rule-guard 와의 관계

`.claude/agents/rule-guard.md` 는 위반 발견 시 보고서에 규칙 ID 를 포함한다. 메인 에이전트는 rule-guard 결과를 받아 각 위반마다 `baden_rule` 호출을 보조해 Baden 에 기록한다 (서브에이전트 자체도 Bash 로 `baden_*` 를 호출할 수 있다).

## 작업 규범

- **한국어 응답**. 코드 주석 / 커밋 메시지 / PR 설명 모두 한국어.
- **한자 사용 금지** — 한국어 고유 표현으로 대체.
- **일본어 / 중국어 금지** (ひらがな / カタカナ / 简体字 / 繁體字 포함).
- 코드 변경 뒤 **`pnpm typecheck` + `pnpm test`** 를 기본 통과 바 (CI 와 동등).
- 커밋 단위는 **의미 단위** — 한 커밋에 여러 주제 섞지 않기.
- `tasks/` 디렉터리는 facet 기획서 / 리팩토링 지침 / 데모 HTML 등 **설계·계획 자료** 를 보관하며 커밋한다. 코드 변경과는 별개의 의미 단위 커밋으로 묶는다 (`docs(tasks): ...`).
- `.gitignore` 에 포함된 경로는 로컬 스크래치. 커밋 금지.

## npm 배포

npm scope 는 **`@ffacet`** (`ibare` 소유 org). `@facet` 은 타 계정 선점이라 사용 불가 — 신규 패키지도 반드시 `@ffacet/*` 로 만든다.

### 배포 대상 (3개만 public)

외부 호스트(methii 등)가 직접 import 하는 진입점만 발행한다. 나머지 26개 패키지는 `private: true` 로 발행 차단하고 번들에 inline 한다.

| 패키지 | 진입점 | 빌드 |
| --- | --- | --- |
| `@ffacet/core` | `.` + `./runtime` (runFacet/loadFacet/registry) | rollup 2-entry, 자족 |
| `@ffacet/bootstrap` | `bootstrapFacet` / `getFacetCatalog` | rollup self-contained (core external) |
| `@ffacet/host-tiptap-bundle` | Tiptap 통합 + 카탈로그 | rollup self-contained (core external) |

새 패키지를 발행 대상에 추가하려면: 외부에서 직접 import 되는 진입점인지 먼저 확인한다. 번들에 inline 되는 내부 패키지는 추가하지 않는다.

### 배포 방식

- **`pnpm publish` 만 사용** (`npm publish` 금지). `workspace:^` / `workspace:*` 프로토콜을 npm semver 로 변환하는 건 pnpm 뿐이다. `npm publish` 는 workspace 프로토콜을 그대로 올려 깨진 의존을 발행한다.
- **`prepack`** 스크립트가 `clean + rollup build` 를 자동 수행한다. dist 는 `.gitignore` 라 발행 직전 항상 새로 빌드된다.
- **`publishConfig`** 로 src(개발)↔dist(발행)를 분리한다. `main`/`types`/`exports` 는 `./src/*.ts` 를 가리켜 워크스페이스 내부는 빌드 없이 소스 직참조하고, `publishConfig.{main,types,exports}` 가 publish 시에만 `./dist/*` 로 오버라이드된다. `publishConfig.access` 는 `public` (scope 패키지 필수).
- **단일 registry 인스턴스 제약**: `bootstrap`·`host-tiptap-bundle` 은 `@ffacet/core` 를 rollup `external` + `peerDependency` 로 둔다. core 를 inline 하면 registry 가 갈라져 bootstrapFacet 등록 facet 을 runFacet 이 못 찾는다. 호스트가 core 단일 인스턴스를 설치해 공유한다 (`rules/specifics/S-runtime.md` 단일 인스턴스).
- **발행 순서**: peer 의존 때문에 `core` → `bootstrap` → `host-tiptap-bundle` 순.
  ```sh
  cd packages/core && pnpm publish --no-git-checks
  cd packages/bootstrap && pnpm publish --no-git-checks
  cd packages/host-tiptap-bundle && pnpm publish --no-git-checks
  ```

### 버저닝 (semver lockstep)

- **3개 패키지를 동일 버전으로 묶어 동시 발행** (lockstep). core 가 나머지의 peer 라 독립 버저닝은 peer range 관리 비용만 키운다. 한 패키지만 바뀌어도 셋 다 같은 버전으로 올린다.
- peer range 는 `workspace:^` 로 선언 → 발행 시 `^<현재버전>` 으로 변환된다 (예: `0.1.0` → `^0.1.0`). 별도 손수정 불필요.
- **bump 기준**: 공개 API(export 표면)·동작 호환 깨짐 = major, 기능 추가 = minor, 버그 수정 = patch. 0.x 동안은 minor 를 breaking 허용 구간으로 본다.

### 발행 전 게이트 (순서대로 통과)

1. `pnpm -r run typecheck` PASS
2. `pnpm test` PASS (현 기준 90/90)
3. `pnpm --filter @ffacet/<pkg> pack` 으로 tarball 검증 — publishConfig dist 오버라이드, `workspace:^`→semver 변환, `src` 누출 0, 발행 비대상 의존 누출 0
4. rule-guard 감사 (특히 S-host 의존 일방향·lazy 보존, S-runtime 단일 인스턴스)

### 배포 태그

- **npm dist-tag**: 정식 릴리스는 `latest` (pnpm publish 기본). 프리릴리스는 버전에 `-next.N` 등을 붙이고 `pnpm publish --tag next` 로 분리한다.
- **git tag**: lockstep 이므로 릴리스마다 단일 태그 `v<버전>` (예: `v0.1.0`). 발행 성공 후 생성한다.
  ```sh
  git tag -a v0.1.0 -m "release: @ffacet/* v0.1.0"
  git push origin v0.1.0
  ```

## 파일 구조 레퍼런스

- `packages/core/` — runtime / views / types (4-layer 코어)
- `packages/view-code/` — 코드 패널 View
- `packages/host-tiptap/` — Tiptap NodeView 호스트 어댑터 (DSL 파싱)
- `packages/transpiler-{cpp,csharp,java,javascript,python,typescript}/` — IR → 언어 소스
- `packages/ir-interpreter/` — IR 실행기 / phase 검증
- `facets/cs-fundamentals/<name>/src/` — facet 18종 (algorithm / projector / irs / facet / description / index)
- `apps/playground/` — 데모 앱
