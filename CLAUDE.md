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

## Baden 작업 통제 (Phase 7)

Baden MCP 도구 (`mcp__baden__*`) 가 연결되면 작업 단위로 `baden_start_task` / `baden_complete_task` / `baden_verify` 를 경유한다. 규칙 위반 시 complete 가 차단될 수 있다.

> 현 시점: Baden 프로젝트 등록 이전. Phase 7 완료 시 본 섹션을 실제 설정으로 대체한다.

## 작업 규범

- **한국어 응답**. 코드 주석 / 커밋 메시지 / PR 설명 모두 한국어.
- **한자 사용 금지** — 한국어 고유 표현으로 대체.
- **일본어 / 중국어 금지** (ひらがな / カタカナ / 简体字 / 繁體字 포함).
- 코드 변경 뒤 **`pnpm typecheck` + `pnpm test`** 를 기본 통과 바 (CI 와 동등).
- 커밋 단위는 **의미 단위** — 한 커밋에 여러 주제 섞지 않기.
- `.gitignore` 에 포함된 경로 (예: `tasks/`) 는 로컬 스크래치. 커밋 금지.

## 파일 구조 레퍼런스

- `packages/core/` — runtime / views / types (4-layer 코어)
- `packages/view-code/` — 코드 패널 View
- `packages/host-tiptap/` — Tiptap NodeView 호스트 어댑터 (DSL 파싱)
- `packages/transpiler-{cpp,csharp,java,javascript,python,typescript}/` — IR → 언어 소스
- `packages/ir-interpreter/` — IR 실행기 / phase 검증
- `facets/cs-fundamentals/<name>/src/` — facet 18종 (algorithm / projector / irs / facet / description / index)
- `apps/playground/` — 데모 앱
