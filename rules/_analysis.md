# FACET — 프로젝트 분석 기록 (Phase 1 산출물)

> 이 파일은 Rules 체계를 설계하기 위한 **사실 수집 기록**이다. 규칙이 아니라 근거. Phase 3 이후에는 삭제해도 무방하지만, AUDIT 시 역추적을 위해 유지를 권장.

조사일: 2026-04-21

---

## 1. 프로젝트 구조 분석

### 1-1. 기본 정보

| 항목 | 내용 |
|------|------|
| 언어 | TypeScript 5.6 (ESM `type: module`) |
| 주요 프레임워크 | React (playground), Vite 5, Vitest 2, happy-dom, Tiptap (NodeView 어댑터) |
| 모노레포 | pnpm workspace — `packages/*`, `facets/*/*`, `apps/*` |
| 패키지 매니저 | pnpm 10.27 |
| 빌드 시스템 | Vite (playground), `tsc --noEmit` (타입체크 전용, 라이브러리 패키지는 소스를 그대로 main/exports 로 제공) |
| 테스트 프레임워크 | Vitest (happy-dom env) |
| 사용 중인 정적 분석 | `tsc --noEmit` (pnpm -r run typecheck), Vitest. **ESLint / Prettier 없음** |

### 1-2. 모듈 / 패키지 목록

- `packages/core` — 4-layer 러너 (runtime/) + View Catalog (views/) + 공용 타입 (types/)
- `packages/host-tiptap` — Tiptap NodeView 어댑터 (호스트 어댑터 1호)
- `packages/ir-interpreter` — IR 을 해석해 실행하는 인터프리터 (+ phase/roundtrip 테스트)
- `packages/transpiler-{cpp, csharp, java, javascript, python, typescript}` — IR → 언어별 소스 코드
- `packages/view-code` — 코드 패널 View (별도 패키지로 분리된 View)
- `facets/cs-fundamentals/*` — 18개 알고리즘 facet
  - `arraymax`, `binarysearch`, `bubblesort`, `coinchange`, `countingsort`, `factorial`, `fibonaccimemo`, `heapsort`, `insertionsort`, `interpolationsearch`, `knapsack`, `linearsearch`, `mergesort`, `quicksort`, `radixsort`, `selectionsort`, `shellsort`, `subsetsum`
- `apps/playground` — Vite + React 데모 앱

### 1-3. 규모

| 항목 | 수치 |
|------|------|
| TS/TSX 파일 수 (node_modules 제외) | 187 |
| `*.test.ts` 테스트 파일 수 | 25 |
| Facet (cs-fundamentals) 수 | 18 |
| 표준 View 종류 (`packages/core/src/views`) | 15 (bar-chart / control-bar / goal-preview / graph-layout / iso-bar / linked-list-chain / ordered-list / pass-tracker / queue-display / snapshot-strip / text-display / title-block / tree-layout / design-tokens / types) + `@facet/view-code` |
| 지원 언어 트랜스파일러 | 6 (cpp, csharp, java, javascript, python, typescript) |

### 1-4. 핵심 도메인

1. **4-layer 아키텍처** — Algorithm → Projector → JSON → Runner. 각 layer 의 책임 경계가 프로젝트 정체성.
2. **이벤트 어휘 + 식별자 문법** — 알고리즘과 View 를 분리하는 유일한 접점. `type` 문자열 + `target: 'prefix:id'`.
3. **View Catalog** — 범용 시각화 위젯 모음. 알고리즘 패키지들이 공유.
4. **IR + Transpiler** — 학습용 코드 패널. 알고리즘 한 개가 여러 언어·패러다임으로 동시 투영.
5. **호스트 독립성** — 코어는 호스트를 모른다. Tiptap / Markdown / React 등이 어댑터로 붙는다.
6. **locale / theme** — 다국어 `LocaleStr` 와 테마 (`light`/`dark`) 를 표준 축으로 지원.

---

## 2. 발견된 공통 패턴 (관찰)

### 2-1. Facet 패키지의 표준 파일 구성

`facets/cs-fundamentals/<name>/src/` 는 다음 6개 파일로 일관되게 구성:

| 파일 | 역할 |
|------|------|
| `algorithm.ts` | `async (ctx: FacetContext<T>) => Promise<void>` — 데이터 변형 + `await ctx.emit(...)` |
| `projector.ts` | `ProjectorFactory` — 이벤트를 View 메서드 호출로 번역 |
| `irs.ts` | `IR[]` — 코드 패널용 중간 표현 |
| `facet.ts` | `FacetJson` — layout/blocks 선언 (로직 없음) |
| `description.ts` | 마크다운 학습 설명 문자열 |
| `index.ts` | export + `register<Name>()` 헬퍼 (algorithm / projector / IR / facet / description 를 레지스트리에 등록) |

이 6파일 구조는 18개 facet 에서 **예외 없이 유지되고 있다**. 프로젝트의 가장 강한 구조적 패턴.

### 2-2. 등록 패턴 (레지스트리)

`@facet/core/runtime` 의 `register*` 계열 함수를 통해서만 모듈이 등록된다. 러너는 `FacetJson.algorithm` / `FacetJson.projector` 의 `module:` prefix 참조 문자열을 `stripPrefix` 로 해석해 `getAlgorithm` / `getProjector` 로 조회한다.

- `registerAlgorithm(name, fn, { computeResult? })`
- `registerProjector(name, factory)`
- `registerIR(id, ir)`
- `registerTranspiler(id, transpiler)`
- `registerFacets(jsons[])` / `registerFacetLoader(id, loader)` (lazy load)
- `registerView(name, view)` / `registerBuiltinViews()`
- `registerDescription(id, markdown)`

`clearRegistry()` 도 있음 (테스트 편의).

### 2-3. 모듈 참조 타입

`packages/core/src/types/facet-json.ts` 에 템플릿 리터럴 타입으로 선언:

```ts
export type ModuleRef = `module:${string}`;
export type IRRef = `ir:${string}`;
export type TranspilerRef = `transpiler:${string}`;
```

FacetJson.algorithm / projector 는 반드시 `module:xxx` 형태. 이 타입이 `tsc` 로 강제된다. → 좋은 패턴.

### 2-4. 이벤트 어휘

`packages/core/src/types/event.ts` 에 `StandardEventType` 이 정의됨:
`'highlight' | 'unhighlight' | 'mark' | 'state-changed' | 'enqueue' | 'dequeue' | 'append' | 'done'`.

그러나 `FacetRuntimeEvent<T extends string = string>` 가 제네릭이라 facet 별로 **확장 이벤트를 자유 발신** 한다:
- bubblesort: `pass-begin`, `rising-move`, `settle`, `pass-end`, `phase`
- quicksort / mergesort 등: 도메인 이벤트

**설계 의도상 확장은 허용**. 단, 확장 이벤트의 어휘가 `algorithm.ts` 상단 주석에 나열되어 있음이 관찰되는 관습 (bubblesort 6–18 라인 참조). 이 관습을 규칙화 가치 있음.

`silent?: boolean` 필드가 있어 step boundary 아님을 표시. `phase` 이벤트는 거의 항상 `silent: true` 로 발신.

### 2-5. 식별자 문법

`'index:N'`, `'node:A'`, `'edge:A-B'`, `'queue'`, `'list'`, `'tree'` 등.
`parseTarget(t)` 헬퍼가 `event.ts` 에 있다.

### 2-6. 메트릭 네이밍

kebab-case 로 일관: `compare-count`, `swap-count`, `pass-count`, `shift-count`, `access-count`, ...
`FacetJson.blocks.controls.metrics[].name` 에 선언되며, 알고리즘은 `ctx.metric(name, 'inc' | number)` 로 갱신.

### 2-7. 다국어 텍스트

`LocaleStr = string | { [lang: string]: string }`. `resolveLocale(loc, opt?)` 로 해석.
facet 의 `title`, `description`, block 라벨 (`title-block`, `code-view.label`, `control-bar.metrics[].label`) 에 사용.
`bubblesortDescription` 같은 마크다운 본문은 현재 **i18n 미적용** (한국어 문자열로 작성됨).

### 2-8. Import 경로

패키지 간 참조는 모두 `@facet/<name>` 형태. `@facet/core` / `@facet/core/runtime` subpath 분리:
- `@facet/core` — `types/ir.js` + `runtime/index.js` 재공개
- `@facet/core/runtime` — 4-layer 러너 전용 진입점

facet 패키지는 `@facet/core/runtime` 에서 `register*` / `FacetContext` / `ProjectorFactory` / `FacetJson` 등을 import.

### 2-9. 에러 처리

- 러너가 알고리즘/projector 미등록 시 `throw new Error(...)` (한국어 메시지). runner.ts:86-87.
- `console.error('[facet] ...', err)` 2회 (runner.ts:165, 289). 그 외 console 사용 없음.
- try/catch 는 최소. `await ctx.emit` 이 cancelled 시 즉시 return 으로 조기 종료.

### 2-10. 테스트 위치

각 패키지의 `test/` 디렉터리 하위 `*.test.ts`. vitest 루트 설정에서 수집.

---

## 3. 발견된 안티패턴 (위반 후보)

> Phase 4 (AUDIT-v1) 의 주요 타겟이 될 것들. 지금은 분류만 하고 severity 는 감사 단계에서 확정.

### A1. `parseTarget` 미사용 — 식별자 파싱이 18개 projector에서 중복

`parseTarget` 헬퍼가 `packages/core/src/types/event.ts:50` 에 정의되어 있지만, **아무도 쓰지 않는다** (grep: 1 hit, 정의 라인 그 자체).

대신 18개 projector 가 모두 다음과 같은 정규식 인라인을 가진다:
```
/^index:(\d+)$/.exec(typeof t === 'string' ? t : '')
```

→ **C1 (식별자 문법 일원화) 의 전수 위반 — Critical 후보**.

### A2. `as unknown as` 캐스팅 빈발 — 22개 파일, 63회

View 인터페이스가 `[methodName: string]: unknown` 으로 열려 있기 때문에 Projector 가 View 를 다룰 때 `views.stage as unknown as BarChart` 식으로 구조적 타입을 재부여하는 관행. 설계상 불가피한 면도 있으나:
- `as Record<string, unknown>` / `as { values?: number[] }` 같은 러너 내부 캐스팅은 축소 가능
- Projector 의 View 타입은 공용 View 계약 쪽에서 타입을 끌어오는 방향으로 정리할 여지 있음

→ C9 / S-view 에서 경계 관리.

### A3. 이벤트 `type` 문자열 리터럴 사용

`ctx.emit({ type: 'highlight', ... })` 식으로 **176회** 리터럴 발신. 타입 시스템이 제네릭 `T extends string` 이라 상수화 강제가 없음. 오타/불일치 위험.

→ **논점**: 표준 이벤트 (`StandardEventType`) 에 대해서는 상수화 / `as const` 튜플 사용을 권고. 확장 이벤트는 facet 내부 상수로 두는 정도.
→ C2 후보. 단, 전면 리팩토링은 비용 크다 — 감사 후 범위 판단.

### A4. `phase` 어휘 동기화가 관습으로만 유지

`algorithm.ts` 가 `await ctx.emit({ type: 'phase', payload: { phase: 'compare' }, silent: true })` 로 발신하는 `phase` 값과, `irs.ts` 에 작성된 `{ kind: 'if', phase: 'compare', ... }` 의 `phase` 값이 **일치해야 코드 패널 하이라이트가 동작**한다. 현재는 주석으로만 명시 (bubblesort/algorithm.ts:18 — "phase 어휘는 algorithm.ts 의 emit('phase', ...) 와 동일해야 한다").

tsc 가 잡을 수 없음 (둘 다 `string` 리터럴 분리). 테스트 (`ir-interpreter/test/phase-meta.test.ts`) 가 일부 검증.

→ **C3 (Phase 어휘 동기화) — High 후보**. 규칙으로 명문화하고 감사.

### A5. `description.ts` 내부의 `{facet:id}` 토큰이 facet id 와 일치해야 함

`bubblesortDescription` 본문에 `{facet:bubbleSort}` 라는 DSL 토큰이 있다. 이 id 는 `bubblesortFacet.id === 'facet:bubbleSort'` 와 일치해야 호스트 NodeView 가 치환한다. tsc 는 못 잡는다.

→ C4 (모듈 참조 일치) 의 확장 케이스.

### A6. Test 파일이 placeholder 경로 참조

`packages/host-tiptap/test/extension.test.ts:11` — `from '@facet/algorithm-quicksort'`. 현재 `packages/algorithm-quicksort` 디렉터리는 없고 (리팩토링으로 `facets/cs-fundamentals/quicksort` 로 이동), 해당 facet 패키지의 `package.json.name` 이 `@facet/algorithm-quicksort` 이기 때문에 pnpm workspace 가 resolve.

→ 규칙 위반은 아니지만, **패키지 이름과 경로가 불일치** 하는 상태. Rules 로 잡기 애매하고 별도 이슈.

### A7. 공개 API 가 패키지 루트 외 경로로 열려 있음

`@facet/core/runtime` subpath 는 의도된 것이나, facet 패키지들의 `package.json.exports` 가 `./src/index.ts` 만 노출한다. 내부 파일 직접 import 는 관찰되지 않음. 비교적 건전.

→ C7 (공개 API 최소화) 는 규칙으로 명문화할 가치 있음.

### A8. View 인터페이스 optional 메서드 남발

`BarChart` 형 타입 선언 (projector 내부) 이 `setRisingMarker?: (...) => void` 등 optional 메서드를 많이 가진다. Projector 가 `stage.setRisingMarker?.(i)` 로 optional-call. 일부 View 가 기능을 안 가질 수도 있다는 전제.

→ 설계적 허용 범위. 규칙이 아니라 문서 몫.

---

## 4. 정적 분석 현황 (1-3)

### 4-1. 현재 구성

- **TypeScript**: 각 패키지에 `tsconfig.json`, `pnpm -r run typecheck` 로 전체 `tsc --noEmit`.
- **Vitest**: 루트 `vitest.config.ts`, happy-dom env. 25개 `*.test.ts`.
- **ESLint / Prettier**: **없음**. 도입 계획 없음 (전제).

### 4-2. tsc 가 커버하는 영역 (Rules 에 중복 금지)

- 타입 불일치, 누락 return, 미사용 import (엄격 모드 여부는 tsconfig.base.json 확인 필요)
- `ModuleRef = 'module:${string}'` 같은 템플릿 리터럴 타입으로 참조 prefix 강제
- `FacetJson`, `FacetContext`, `ProjectorFactory`, `ViewInstance` 등 공개 타입의 계약
- `FacetRuntimeEvent<T extends string>` 의 타입 필드

### 4-3. tsc 가 못 잡는 영역 (Rules 의 담당)

- **이벤트 `type` 문자열 vs `StandardEventType` 일관성** — 제네릭 `T extends string` 이라 리터럴 자유
- **`phase` 어휘 동기화** — algorithm.ts 의 `phase` 값 ↔ irs.ts 의 `phase` 값
- **식별자 문법 파싱 중복** — A1 의 정규식 중복
- **`module:xxx` 참조 문자열의 `xxx`** 가 실제 register 된 이름과 일치하는지
- **description.ts 본문의 `{facet:id}` 토큰** 이 `facet.ts` 의 `id` 와 일치하는지
- **View 인터페이스 계약 준수** — `as unknown as BarChart` 경계에서 누락된 메서드
- **메트릭 이름 kebab-case** 와 `FacetJson.blocks.controls.metrics[].name` 일치
- **4-layer 의존성 역방향 금지** — algorithm 이 View 를 import 하지 않는다는 원칙
- **새 facet 6파일 구성** 준수

### 4-4. 결론

tsc 가 타입 계약을 강제해 주는 덕분에 **기계적 오류는 이미 크게 억제**되어 있다. Rules 는 **의미·맥락 일관성** (A1, A3, A4, 4-3의 항목들) 을 주 타겟으로 설계한다.

---

## 5. Phase 2~3 에 전달할 설계 포인트

1. **Tier 1 Principles 6개**: 4-layer 경계 / DSL 최소성 / 레지스트리 경유 / 이벤트 어휘 / Projector 단일 번역기 / View 재사용.
2. **Tier 2 Concerns 후보** (우선순위):
   - C1. 식별자 문법 — `parseTarget` 경유 (A1 대응). **Critical 수준 규칙**
   - C2. 이벤트 타입 어휘 — 확장 이벤트는 facet 상단 주석에 나열. 표준 이벤트는 `StandardEventType` 하위만 사용 (A3 대응)
   - C3. Phase 어휘 동기화 — algorithm 의 `phase` payload ↔ IR 의 `phase` 필드 (A4 대응)
   - C4. 모듈 참조 문자열 정합 — `module:xxx` / `ir:xxx` / `facet:xxx` / `{facet:id}` (A5 대응)
   - C5. 메트릭 네이밍 — kebab-case + FacetJson 선언 일치
   - C6. 에러 처리 / 로깅 — `console.*` 는 runner + 러너 내 한정, facet 은 throw
   - C7. 공개 API 경계 — `src/index.ts` 외 직접 import 금지
   - C8. 비동기 이벤트 규율 — `await ctx.emit` 누락 금지, cancelled 조기 종료
   - C9. 타입 경계 — `as unknown as View계약` 패턴 제약 (A2 대응)
3. **Tier 3 Specifics**:
   - S-facet (S-algorithm 대신). facets/cs-fundamentals/* 내부 6파일 구성과 책임 분리
   - S-view. packages/core/src/views/* 의 View 인터페이스 계약과 design-tokens 사용
   - S-runtime. packages/core/src/runtime/* 내부 규율 (BASE_DELAY_MS, silent, mode 전이)
   - S-transpiler. packages/transpiler-* 입출력 계약 + phase 어휘 매칭
   - S-host. packages/host-tiptap — NodeView 격리, DSL 파서

4. **정적 분석으로 커버할 수 있는 것은 Rule 에 넣지 않는다.** (tsc 가 잡는 타입 계약은 Rule 화 금지.)

---

## 6. 가정 / 미확인 사항

- `tsconfig.base.json` 의 `strict` 옵션 수준 미확인 (Phase 2 진입 전 확인 필요).
- `examples/` 디렉터리 (core 내부) 의 역할: 러너 테스트용 최소 샘플. 규칙 적용 대상에서는 제외 가능.
- `apps/playground` 내부 구조는 미탐색. 규칙 적용 범위에서 2급 (demo) 로 두는 편이 현실적.
- `host-tiptap/test/extension.test.ts` 의 import 가 실제 resolve 되는지는 테스트 실행으로 검증 필요.
