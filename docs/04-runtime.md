# 04 · 런타임

런타임은 호스트 어댑터로부터 `FacetJson` 과 mount 엘리먼트를 받아 인터랙티브 영역을 DOM 에 그린다. 코어는 호스트 독립적이다.

## 진입점

```ts
import { runFacet, type FacetRunHandle } from '@facet/core/runtime';

const handle: FacetRunHandle = runFacet(facetJson, mountEl, { autoStart: false });
// handle.start(); handle.step(); handle.stop(); handle.reset(); handle.setSpeed(2); handle.destroy();
```

## 실행 흐름

`runFacet` 는 다음을 순서대로 수행한다.

1. **모듈 조회** — `json.algorithm`, `json.projector` 를 `getAlgorithm` / `getProjector` 로 조회. 미등록이면 throw.
2. **title-block 자동 채움** — `blocks` 의 `title-block` 에 title/description 이 비어 있으면 `json.title` / `json.description` 을 주입.
3. **Layout 빌드** — `buildLayout(layout, blocks)` 가 `row` / `column` / `ref` 트리를 flex DOM 으로 변환하고 ref 마다 마운트 슬롯을 만든다.
4. **code-view 사전 transpile** — `code-view` 블록이 `ir` + `transpiler` 를 가지면 `transpiler.transpile(ir)` 를 호출해 `_transpiledLines` 를 spec 에 첨부. 마운트 시 code-view 가 자동으로 적용한다.
5. **블록 마운트** — `mountBlocks` 가 ref 마다 `View.mount(slot, params)` 를 호출, 결과 ViewInstance 를 `views` 맵에 저장.
6. **Projector 인스턴스화** — `projectorFactory(views)` 호출 → `projector.onInit(initialData)`.
7. **컨트롤 wire-up** — `views` 안에 `onPlay` / `onPause` 메서드를 가진 view 가 있으면 control-bar 로 식별, 핸들 함수를 바인딩.
8. **알고리즘 코루틴** — `algorithmFn(ctx)` 를 비동기로 실행. `ctx.emit` 안에서 mode 에 따라 일시정지/스텝/속도 처리.

## emit 의 lifecycle

```ts
async emit(event) {
  if (cancelled) return;

  // 1) paused/idle 이면 다음 신호까지 대기 (렌더링 전에 멈춤)
  while (mode === 'paused' || mode === 'idle') {
    await new Promise<void>((res) => { stepResolve = res; });
    if (cancelled) return;
  }

  // 2) projector 갱신
  await projector.onEvent(event);
  if (cancelled) return;

  // 3) 후처리: stepping 이면 다음 emit 전에 paused 로
  if (mode === 'stepping') { setMode('paused'); return; }

  // playing — 속도 비례 setTimeout
  await new Promise<void>((res) => {
    pendingTimerResolve = res;
    pendingTimer = setTimeout(() => res(), Math.max(10, BASE_DELAY_MS / speedMul));
  });
}
```

이 구조 덕분에 알고리즘 코드는 동기 루프처럼 보이고, 일시정지/스텝/속도 제어는 러너의 책임으로만 남는다.

## reset 시 race 처리

`reset()` 은 cancelled 플래그를 세우고 — 알고리즘이 await 중인 모든 Promise 를 명시적으로 해소한다.

- `stepResolve` 가 살아 있으면 호출 → emit 의 `while` 루프 빠져나감 → cancelled 체크 후 return.
- `pendingTimerResolve` 가 살아 있으면 호출 + clearTimeout → playing 모드의 setTimeout 대기에서 해방.
- 알고리즘 Promise 가 종료되면 `initialData` 를 deep clone 해 `ctx.data` 에 다시 채움 → metric 초기화 → projector.onReset() → mode='idle'.

## ProjectorViews

`ProjectorViews` 는 `Record<string, ViewInstance>`. 키는 `blocks` 의 ref 그대로 (`stage`, `codePanel`, `controls`, `header`, ...). Projector 는 ref 이름으로 view 를 꺼내 메서드를 호출한다 — 옛 시스템처럼 "어떤 lens 를 쓸지" 같은 동적 선택이 없다. JSON 작성자가 ref 이름으로 의도를 고정한다.

## View Catalog 와 design-tokens

내장 View 는 모두 `colors` / `radii` / `space` / `fonts` 디자인 토큰을 사용한다 (`packages/core/src/views/design-tokens.ts`). 색상 토큰: `itemDefault`, `itemComparing`, `itemSwapping`, `itemSorted`, `itemPivot`, `itemActive`. 새 View 는 같은 토큰을 따르면 시각 일관성이 자동으로 유지된다.

## destroy 의 책임

`handle.destroy()` 는:

- `cancelled = true` + 모든 pending Promise 해소.
- `projector.onDestroy?.()` 호출.
- 모든 View 인스턴스의 `destroy?.()` 호출.
- 빌드된 root DOM 제거.

호스트 어댑터는 노드 destroy 시점(예: Tiptap NodeView 의 `destroy`)에 반드시 이 핸들을 호출해야 한다 — 메모리 누수 방지의 유일한 보장점.
