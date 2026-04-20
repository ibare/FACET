# 03 · 레지스트리 (구 카탈로그)

옛 시스템의 4-카테고리 카탈로그(Container/Algorithm/Body/IR/Transpiler)는 폐기되었다. 새 시스템에서 호스트 앱은 다섯 종류의 모듈을 **단순히 등록만** 한다 — 자동 매칭이나 호환성 추론은 없다.

## 등록 API (`@facet/core/runtime`)

```ts
registerAlgorithm(name: string, fn: AlgorithmFn): void;
registerProjector(name: string, factory: ProjectorFactory): void;
registerFacets(jsons: FacetJson[]): void;
registerIR(id: string, ir: IR): void;
registerTranspiler(id: string, t: Transpiler): void;

// 조회
getAlgorithm(name): AlgorithmFn | undefined;
getProjector(name): ProjectorFactory | undefined;
getFacetById(id): FacetJson | undefined;
getIR(id), getTranspiler(id);
listFacets(): string[];

// 테스트용
clearRegistry(): void;
```

JSON 안의 모듈 참조는 접두로 카테고리를 명시한다 — 러너가 `stripPrefix` 로 접두를 떼고 조회.

| 참조 형태 | 조회 |
|----------|------|
| `module:quicksort` | `getAlgorithm('quicksort')` |
| `module:quicksortProjector` | `getProjector('quicksortProjector')` |
| `ir:quicksort-imperative` | `getIR('quicksort-imperative')` |
| `transpiler:quicksort-python-imperative` | `getTranspiler(...)` |

facet id 자체는 접두를 포함한 전체 문자열(`facet:quickSort`)이 그대로 키.

## 패키지가 제공하는 일괄 등록 헬퍼

알고리즘 패키지는 보통 다섯 모듈을 한 번에 등록하는 헬퍼를 export 한다.

```ts
// packages/algorithm-quicksort/src/index.ts
export function registerQuicksort(): void {
  registerAlgorithm('quicksort', quicksort);
  registerProjector('quicksortProjector', quicksortProjector);
  for (const ir of quicksortIRs) registerIR(ir.id, ir);
  for (const t of quicksortTranspilers) registerTranspiler(t.id, t);
  registerFacets([quicksortFacet]);
}
```

호스트 앱(playground)은 다음 형태로 부트스트랩한다.

```ts
import { registerBuiltinViews } from '@facet/core/runtime';
import { registerQuicksort } from '@facet/algorithm-quicksort';
import { registerBubblesort } from '@facet/algorithm-bubblesort';

registerBuiltinViews();   // 표준 View Catalog 10 종 등록
registerQuicksort();
registerBubblesort();
```

## View Catalog

View 도 별도의 레지스트리로 관리된다 — JSON 의 `blocks[ref].type` 이 키.

```ts
import { registerView, registerBuiltinViews } from '@facet/core/runtime';

registerBuiltinViews();   // bar-chart, graph-layout, tree-layout,
                          // linked-list-chain, queue-display, ordered-list,
                          // text-display, code-view, control-bar, title-block

// 커스텀 View 추가
registerView('heatmap', heatmapView);
```

한 번 등록된 View 는 모든 알고리즘 패키지에서 재사용된다 — quicksort 와 bubblesort 가 같은 `bar-chart` View 를 공유하는 것이 그 가치의 검증.

## 자동 매칭 없음

옛 시스템은 algorithm 의 `phases`, body 의 `available_irs`, transpiler 의 `paradigm` 메타로 UI 옵션을 자동 생성했다. 새 시스템은 그 결정을 모두 **JSON 작성자가 명시적으로** 한다 — `code-view` 블록의 `ir` 필드에 어떤 IR 을, `transpiler` 필드에 어떤 transpiler 를. 명시 비용이 곧 가독성이다.

다중 패러다임 토글이나 언어 탭이 필요해지면, JSON 의 `code-view` 블록을 다중 변종으로 확장하는 방향으로 진화 — 자동 매칭으로 회귀하지 않는다.
