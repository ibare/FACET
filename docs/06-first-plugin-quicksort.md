# 06 · 첫 알고리즘 플러그인 — QuickSort

새 4-layer 구조의 첫 실 알고리즘. 이 문서를 따라 패키지를 그대로 만들면 동작하는 facet 이 완성된다. 두 번째 알고리즘(`@facet/algorithm-bubblesort`)도 같은 골격을 따른다.

## 결과물

DSL 표현:

```
{facet:quickSort}
```

플레이그라운드(또는 다른 호스트)에서 이 표현은 다음을 렌더한다.

- **bar-chart** — 8 개 막대, pivot/comparing/swapping/sorted 색상 토큰
- **code-view** — Python 명령형 quicksort 의 라인들, 알고리즘의 phase 이벤트로 동기 하이라이트
- **control-bar** — play / step / pause / reset + speed-slider + 비교/교환 메트릭
- **title-block** — facet 의 title/description

## 패키지 구조

```
packages/algorithm-quicksort/
├── package.json
├── tsconfig.json
├── src/
│   ├── algorithm.ts      # Layer 1
│   ├── projector.ts      # Layer 2
│   ├── facet.ts          # Layer 3 (JSON 선언)
│   ├── irs.ts            # 직교 모듈 — IR 메타
│   ├── transpilers.ts    # 직교 모듈 — 패러다임 × 언어 코드 산출
│   └── index.ts          # 모듈 export + registerQuicksort() 헬퍼
└── test/
    └── quicksort.test.ts
```

## Layer 1 — Algorithm

`src/algorithm.ts`

```ts
import type { FacetContext } from '@facet/core/runtime';

export type QuickSortData = { type: 'array'; values: number[] };

export async function quicksort(ctx: FacetContext<QuickSortData>): Promise<void> {
  const arr = ctx.data.values;
  await partitionRecurse(arr, 0, arr.length - 1, ctx);
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}

async function partitionRecurse(arr, lo, hi, ctx) {
  if (ctx.cancelled || lo > hi) return;
  if (lo === hi) {
    await ctx.emit({ type: 'mark', target: `index:${lo}`, payload: { kind: 'sorted' } });
    return;
  }

  await ctx.emit({ type: 'phase', payload: { phase: 'pivot-select' } });
  await ctx.emit({ type: 'highlight', target: `index:${hi}`, payload: { kind: 'pivot' } });

  let i = lo - 1;
  for (let j = lo; j < hi; j++) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'compare' } });
    await ctx.emit({ type: 'highlight', target: `index:${j}`, payload: { kind: 'compare' } });
    ctx.metric('compare-count', 'inc');

    if (arr[j] < arr[hi]) {
      i++;
      await ctx.emit({ type: 'phase', payload: { phase: 'swap' } });
      [arr[i], arr[j]] = [arr[j], arr[i]];
      await ctx.emit({
        type: 'state-changed',
        target: [`index:${i}`, `index:${j}`],
        payload: { kind: 'swap', i, j },
      });
      ctx.metric('swap-count', 'inc');
    }
    await ctx.emit({ type: 'unhighlight', target: `index:${j}` });
  }
  // ... partition 마무리, mark sorted, 좌우 재귀
}
```

핵심: `arr` 를 직접 변형하면서 변형의 매 단계 직후 `await ctx.emit(...)`. View/색상/DOM 의 존재를 모른다.

## Layer 2 — Projector

`src/projector.ts`

```ts
export const quicksortProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as BarChart | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const sortedIndices = new Set<number>();

  return {
    onInit(initialData) {
      stage?.setData((initialData as { values: number[] }).values);
      sortedIndices.clear();
    },
    onEvent(event) {
      switch (event.type) {
        case 'highlight': {
          const kind = event.payload?.kind;
          const state = kind === 'pivot' ? 'pivot' : kind === 'compare' ? 'comparing' : 'active';
          for (const i of toIndex(event.target)) {
            if (!sortedIndices.has(i)) stage?.setItemState(i, state);
          }
          break;
        }
        case 'state-changed': {
          if (event.payload?.kind === 'swap') {
            stage?.swapItems(event.payload.i, event.payload.j);
          }
          break;
        }
        case 'mark': {
          if (event.payload?.kind === 'sorted') {
            for (const i of toIndex(event.target)) {
              sortedIndices.add(i);
              stage?.setItemState(i, 'sorted');
            }
          }
          break;
        }
        case 'phase': {
          codePanel?.highlightPhase(event.payload?.phase ?? null);
          break;
        }
        case 'done': {
          codePanel?.clearHighlight();
          break;
        }
      }
    },
    onReset() { sortedIndices.clear(); codePanel?.clearHighlight(); },
  };
};
```

`sortedIndices` 는 Projector 의 자체 상태. 알고리즘이 sorted 마킹 이후에도 다른 highlight/state 이벤트를 보낼 때, sorted 색상을 덮어쓰지 않게 보장한다.

## Layer 3 — JSON

`src/facet.ts`

```ts
export const quicksortFacet: FacetJson = {
  id: 'facet:quickSort',
  title: '퀵 정렬',
  description: 'pivot 기준 분할 정복 — 평균 O(n log n)',
  algorithm: 'module:quicksort',
  projector: 'module:quicksortProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4] },
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      {
        type: 'row',
        gap: 12,
        grow: 1,
        children: [
          { ref: 'stage', grow: 1 },
          { ref: 'codePanel', grow: 1 },
        ],
      },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'bar-chart', height: 220 },
    codePanel: {
      type: 'code-view',
      label: 'Python · 명령형',
      ir: 'ir:quicksort-imperative',
      transpiler: 'transpiler:quicksort-python-imperative',
    },
    controls: {
      type: 'control-bar',
      controls: ['play', 'step', 'pause', 'reset', { type: 'speed-slider', default: 1 }],
      metrics: [
        { name: 'compare-count', label: '비교', initial: 0 },
        { name: 'swap-count', label: '교환', initial: 0 },
      ],
    },
  },
};
```

JSON 에는 로직이 없다. ref 이름(`stage`, `codePanel`, `controls`, `header`)이 Projector 가 view 를 꺼내는 키.

## IR / Transpiler

```ts
export const quicksortIRs: IR[] = [
  { id: 'quicksort-imperative', algorithm: 'quicksort', paradigm: 'imperative' },
  { id: 'quicksort-functional', algorithm: 'quicksort', paradigm: 'functional' },
];

export const quicksortPythonImperative: Transpiler = {
  id: 'quicksort-python-imperative',
  paradigm: 'imperative',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def quicksort(arr, lo, hi):',                  phase: null },
        { code: '    pivot = arr[hi]',                          phase: 'pivot-select' },
        { code: '        if arr[j] < pivot:',                   phase: 'compare' },
        { code: '            arr[i], arr[j] = arr[j], arr[i]',  phase: 'swap' },
        // ...
      ],
    };
  },
};
```

각 라인의 `phase` 어휘는 알고리즘이 emit 하는 `phase` 이벤트 어휘와 동일. 그래야 동기 하이라이트가 작동.

## 등록 헬퍼

`src/index.ts`

```ts
import {
  registerAlgorithm, registerProjector, registerFacets,
  registerIR, registerTranspiler,
} from '@facet/core/runtime';

export function registerQuicksort(): void {
  registerAlgorithm('quicksort', quicksort);
  registerProjector('quicksortProjector', quicksortProjector);
  for (const ir of quicksortIRs) registerIR(ir.id, ir);
  for (const t of quicksortTranspilers) registerTranspiler(t.id, t);
  registerFacets([quicksortFacet]);
}
```

호스트 앱에서 한 번만 호출.

## 사용

```ts
// 호스트 앱 부트스트랩
import { registerBuiltinViews } from '@facet/core/runtime';
import { registerQuicksort } from '@facet/algorithm-quicksort';

registerBuiltinViews();
registerQuicksort();

// Tiptap 콘텐츠
'<p><span data-facet="true" data-facet-id="facet:quickSort"></span></p>';
```

## 두 번째 알고리즘이 가져갈 것

`@facet/algorithm-bubblesort` 는 위와 똑같은 5 파일 구조를 갖는다. 차이는:

- `algorithm.ts` — 재귀 없이 단순 이중 루프 + early-exit.
- `projector.ts` — pivot 색상 분기 없음. 나머지 `bar-chart` 호출은 동일.
- `irs.ts` / `transpilers.ts` — 다른 코드 라인.
- `facet.ts` — 같은 layout/blocks 구성. id 만 `facet:bubbleSort`.

같은 `bar-chart` View 가 두 알고리즘에서 재사용된다 — 이것이 View Catalog 의 가치.
