# FACET

**Framework for Abstraction and Concept Exploration through Translation.**

소프트웨어 개념을 코드가 아닌 개념 자체로부터 학습할 수 있게 하는 인터랙티브 학습 플랫폼. 코드는 개념의 부산물이며, 같은 개념이 여러 시각화·여러 패러다임·여러 언어로 동시에 투영된다.

## 핵심 가설

기존 프로그래밍 교육은 전부 코드를 1급 시민으로 두고 시각화를 보조로 둔다. FACET 은 그 관계를 뒤집는다. **개념이 1급, 코드는 그 개념의 한 표현일 뿐**이다. 학습자는 정렬이라는 개념을 막대 시각화로 먼저 체감하고, 같은 개념이 Python 의 `for` 로도 JavaScript 의 `forEach` 로도, 명령형으로도 함수형으로도 표현된다는 것을 동시에 본다.

## 4-layer 아키텍처

| Layer | 책임 | 표현 |
|-------|------|------|
| 1. Algorithm | 데이터를 변형하면서 표준 이벤트(`highlight` / `mark` / `state-changed` / `phase` / `done` ...)를 `await ctx.emit()` 로 발신 | `(ctx) => Promise<void>` |
| 2. Projector | 알고리즘 이벤트를 등록된 View 들의 메서드 호출로 번역 | `(views) => { onInit, onEvent, onReset }` |
| 3. JSON | 어떤 알고리즘·Projector·View·Layout·메트릭·코드 패널을 쓸지 선언 (로직 없음) | `FacetJson` 객체 |
| 4. Runner | JSON 해석 → Layout/Block 마운트 → 알고리즘 코루틴 실행 → 이벤트를 Projector 로 라우팅 → 재생/일시정지/스텝/리셋/속도 컨트롤 | `runFacet(json, mountEl)` |

알고리즘은 시각화의 존재를 모르고, View 는 알고리즘의 존재를 모른다. 둘은 표준 이벤트 어휘 + 식별자 문법(`index:N`, `node:A`, `edge:A-B`)으로만 만난다.

## DSL

호스트(에디터)에 임베드되는 단일 식별자 표기.

```
{facet:quickSort}
{facet:bubbleSort}
```

식별자 안의 모든 구체(데이터, 시각화, 코드 패널 종류, 메트릭)는 등록된 `FacetJson` 안에 산다. DSL 자체는 `{` + `facet:` + id + `}` 일 뿐.

## 호스트 어댑터

코어는 호스트 독립적이다. 호스트 어댑터가 마크다운/문서에서 DSL 표현을 발견하고, 그 자리에 `runFacet()` 의 결과를 인서트한다. 첫 어댑터는 Tiptap (`@facet/host-tiptap`).

## 디렉토리 구조

```
packages/
  core/                       # 4-layer 러너 + 표준 View Catalog (10 종)
    src/
      runtime/                # 러너·레지스트리·이벤트·Projector·layout-builder
      views/                  # bar-chart, graph-layout, tree-layout, code-view, ... + design-tokens
      examples/               # counter (러너 검증용 최소 예제)
      types.ts                # IR/Transpiler 타입
  algorithm-quicksort/        # quicksort: algorithm + projector + irs + transpilers + facet JSON
  algorithm-bubblesort/       # bubblesort: 같은 4-layer 구조, 같은 bar-chart View 재사용
  host-tiptap/                # Tiptap NodeView — getFacetById + runFacet
apps/
  playground/                 # Vite + React 데모 — bootstrapFacet() 으로 모듈 일괄 등록
docs/
  01-architecture.md, 02-dsl.md, 03-catalog.md, 04-runtime.md,
  05-host-plugin.md, 06-first-plugin-quicksort.md
```

## 새 시각화 추가하는 방법

`algorithm-bubblesort` 가 모범 사례. 5 단계.

1. **Algorithm** — `src/algorithm.ts`
   - 비동기 함수: `(ctx: FacetContext<TData>) => Promise<void>`
   - 데이터를 변형하면서 단계마다 `await ctx.emit({ type, target, payload })`
   - 메트릭: `ctx.metric('compare-count', 'inc')`
2. **Projector** — `src/projector.ts`
   - `(views) => { onInit, onEvent, onReset }`
   - 이벤트의 `target` 식별자(`index:3` 등)를 파싱해 `views.stage.setItemState(...)` 호출
3. **IR + Transpiler** — `src/irs.ts` + `src/transpilers.ts`
   - 코드 패널이 표시할 코드 라인을 `{ code, phase }` 배열로 산출
   - `phase` 어휘는 알고리즘이 emit 하는 `phase` 이벤트의 어휘와 같아야 동기 하이라이트가 작동
4. **Facet JSON** — `src/facet.ts`
   - id, layout(row/column/ref), blocks(bar-chart, code-view, control-bar, title-block ...)
   - `algorithm: 'module:bubblesort'`, `projector: 'module:bubblesortProjector'` 로 모듈 참조
5. **등록 헬퍼** — `src/index.ts`
   - `registerAlgorithm` + `registerProjector` + `registerIR/Transpiler` + `registerFacets`
   - 호스트 앱은 한 번만 호출

새 시각화 종류(예: `bar-chart` 가 아닌 `heatmap`)가 필요하면 `packages/core/src/views/` 에 View 모듈을 추가하고 `registerView` 한다. 한번 등록된 View 는 모든 알고리즘 패키지에서 재사용 가능 — `bar-chart` 를 quicksort/bubblesort 가 공유하듯.

## 실행

```sh
pnpm install
pnpm dev          # playground @ http://localhost:5173
pnpm test         # vitest 전체
pnpm typecheck    # 모든 패키지 tsc --noEmit
pnpm build        # playground 프로덕션 번들
```

## 설계 원칙

1. **DSL 은 끝까지 가볍다.** 단일 식별자 + 중괄호. 모든 구체는 JSON.
2. **알고리즘은 View 를 모르고, View 는 알고리즘을 모른다.** 표준 이벤트 어휘 + 식별자 문법으로만 만난다.
3. **Projector 가 번역기.** 알고리즘 이벤트의 의미를 View 메서드 호출로 옮기는 책임은 Projector 에만 있다.
4. **View Catalog 는 공용 자산.** 한 번 만든 bar-chart 가 모든 정렬 알고리즘에서 재사용된다.
5. **호스트는 무엇이든 될 수 있다.** 코어는 호스트 독립, 어댑터가 다리.
