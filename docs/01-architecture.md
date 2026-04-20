# 01 · 4-layer 아키텍처

FACET 의 모든 facet 은 네 개의 분리된 책임 층으로 구성된다. 각 층은 다른 층의 내부를 모르고, 표준 인터페이스로만 만난다.

## Layer 1 — Algorithm

알고리즘은 **데이터를 변형하는 비동기 함수**다.

```ts
type AlgorithmFn<TData> = (ctx: FacetContext<TData>) => Promise<void>;
```

핵심: `ctx.data` 를 직접 변형하면서, 변형의 매 단계 직후 `await ctx.emit(event)` 로 표준 이벤트를 발신. `await` 는 러너가 일시정지/스텝/속도 제어를 끼워 넣을 수 있게 한다.

알고리즘은 어떤 시각화가 자기를 그릴지 모른다. View 의 존재도, 색상 토큰도, DOM 도 모른다. 오직 `ctx.data` + `ctx.emit` + `ctx.metric` 만 안다.

표준 이벤트 어휘 (`@facet/core/runtime` 의 `FacetRuntimeEvent`):

- `highlight` / `unhighlight` — 항목 강조/해제
- `mark` — 영구 표시 (예: `payload.kind = 'sorted'`)
- `state-changed` — 상태 변화 (`payload.kind = 'swap'` 등)
- `enqueue` / `dequeue` / `append` — 컬렉션 변형
- `phase` — 현재 코드 라인 어휘 (코드 패널 동기화용)
- `done` — 알고리즘 종료

`target` 식별자 문법: `index:N` (배열 인덱스), `node:A` (그래프 노드), `edge:A-B` (간선).

## Layer 2 — Projector

Projector 는 **알고리즘 이벤트를 View 메서드 호출로 번역**한다.

```ts
type ProjectorFactory = (views: ProjectorViews) => Projector;
type Projector = {
  onInit?(initialData: unknown): void;
  onEvent(event: FacetRuntimeEvent): void | Promise<void>;
  onReset?(): void;
  onDestroy?(): void;
};
```

`views` 는 facet JSON 의 `blocks` ref 를 키로 갖는 마운트된 View 인스턴스 맵. 예를 들어 quicksort 의 Projector 는 `views.stage` 를 bar-chart 로 보고 `setItemState(i, 'pivot')` 을 호출한다.

Projector 는 번역 외 책임을 갖지 않는다. 자체 누적 상태(예: `sortedIndices` 집합)는 번역의 일부로 허용 — 알고리즘이 모르는 "이미 정렬됨" 같은 시각화 표시를 다른 이벤트 사이에서 유지해야 하기 때문.

## Layer 3 — JSON

facet 자체는 **순수 선언**이다.

```ts
type FacetJson = {
  id: string;             // 'facet:quickSort'
  title?: string;
  description?: string;
  algorithm: string;      // 'module:quicksort'
  projector: string;      // 'module:quicksortProjector'
  initialData: unknown;
  layout: LayoutNode;     // row/column 트리 + ref
  blocks: Record<string, BlockSpec>;  // ref → 어떤 View, 어떤 옵션
};
```

JSON 은 로직이 없다. 어떤 모듈을 쓸지(`module:...`), 어떤 IR/Transpiler 로 코드 패널을 채울지(`ir:...`, `transpiler:...`), 막대 차트의 높이가 얼마인지만 적는다.

## Layer 4 — Runner

`runFacet(json, mountEl)` 의 책임:

1. `json.algorithm` / `json.projector` 를 레지스트리에서 조회
2. `json.blocks` 의 `code-view` 가 `ir` + `transpiler` 를 가지면 사전 transpile 하여 `_transpiledLines` 를 첨부
3. `json.layout` 을 row/column 플렉스 DOM 으로 빌드, 각 ref 위치에 View 인스턴스 마운트
4. `projector.onInit(initialData)` 호출
5. control-bar 가 있으면 play/step/pause/reset/speed 콜백 wire-up
6. 알고리즘 코루틴 시작 — `emit` 안에서 paused/idle 이면 await, stepping 이면 다음 emit 후 일시정지, playing 이면 속도 비례 setTimeout 후 진행

`runFacet` 의 반환은 `FacetRunHandle = { start, stop, step, reset, setSpeed, destroy }`.

## 직교 모듈 — IR / Transpiler

코드 패널 콘텐츠는 4-layer 와 직교한 모듈로 분리된다.

- **IR**: `{ id, algorithm, paradigm }` — 패러다임 메타.
- **Transpiler**: `transpile(ir): { lines: { code, phase }[] }` — 패러다임 + 언어 조합으로 코드 라인 산출.

같은 알고리즘에 대해 명령형 Python, 함수형 Python, 명령형 JavaScript ... 의 transpiler 를 등록할 수 있고, JSON 은 그 중 하나를 `transpiler:` 로 참조한다. 각 라인의 `phase` 는 알고리즘이 emit 하는 `phase` 이벤트의 어휘와 같아야 동기 하이라이트가 동작한다.

## 데이터 흐름

```
[host] ──runFacet(json, mount)──▶ [runner]
                                      │
                          ┌───────────┼───────────────────────────────┐
                          ▼           ▼                               ▼
                      [layout]   [algorithm coroutine]            [control-bar]
                      [blocks]        │                               │ play/step/...
                      mounted         │ await ctx.emit(event)         │
                                      ▼                               │
                                  [projector.onEvent(event)]          │
                                      │                               │
                                      ▼                               ▼
                                  views.stage.swapItems(...)      runner.start/...
                                  views.codePanel.highlightPhase(...)
```

알고리즘과 View 사이에 직접 연결은 없다. Projector 가 유일한 다리.
