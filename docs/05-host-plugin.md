# 05 · 호스트 플러그인

호스트 어댑터는 FACET 런타임을 특정 에디터/렌더러 환경에 통합한다. 호스트마다 노드/마크다운 처리 방식이 다르므로 — Tiptap, ProseMirror, MDX, 슬라이드 도구, 정적 SSR — 어댑터가 그 차이를 흡수한다.

## 어댑터의 두 가지 책임

1. 호스트 문서에서 DSL(`{facet:<id>}`)을 발견하면 inline atom 노드로 치환.
2. 그 노드가 실제 DOM 으로 렌더될 때 `runFacet(getFacetById(id), mount)` 호출. 노드 destroy 시점에 핸들의 `destroy()` 호출.

코어 API 는 `runFacet` + `getFacetById` 두 개로 충분하다. 그 외 모든 차이(파싱 룰, 노드 라이프사이클)는 어댑터가 흡수.

## Tiptap 어댑터 (`@facet/host-tiptap`)

```ts
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension } from '@facet/host-tiptap';
import { registerBuiltinViews } from '@facet/core/runtime';
import { registerQuicksort } from '@facet/algorithm-quicksort';

registerBuiltinViews();
registerQuicksort();

new Editor({
  element: hostEl,
  extensions: [StarterKit, FacetExtension],
  content: `<p><span data-facet="true" data-facet-id="facet:quickSort"></span></p>`,
});
```

Extension 자체는 옵션이 필요 없다 — facet 의 모든 구체는 레지스트리가 들고 있기 때문.

### 구조

`packages/host-tiptap/src/index.ts`

- Tiptap Node — `name: 'facet'`, `inline + atom`.
- `addAttributes`: `{ id: string }` 단일 필드. `data-facet-id` 로 직렬화.
- `parseHTML`: `span[data-facet]` + `data-facet-id` 속성 매칭.
- `renderHTML`: `<span data-facet="true" data-facet-id="...">`.
- `addInputRules` / `addPasteRules`: `\{(facet:[a-zA-Z][a-zA-Z0-9-]*)\}` 매치 시 노드 치환.

`packages/host-tiptap/src/node-view.ts`

- `getFacetById(node.attrs.id)` 조회 → 없으면 인라인 에러 박스.
- `runFacet(facetJson, mountDiv)` → `FacetRunHandle` 보관.
- Tiptap NodeView 의 `update(updatedNode)` 에서 id 가 바뀌면 이전 핸들 destroy + 재마운트.
- Tiptap NodeView 의 `destroy()` 에서 핸들 destroy — **메모리 누수 방지의 유일한 지점**.
- `ignoreMutation: () => true` — 내부 DOM 변경은 ProseMirror 가 무시.

## 파서 헬퍼

```ts
import { parseFacetRaw } from '@facet/host-tiptap';

parseFacetRaw('{facet:quickSort}');  // → 'facet:quickSort'
parseFacetRaw('{facet:bubble-sort}'); // → 'facet:bubble-sort'
parseFacetRaw('{foo:bar}');          // → null
```

다른 호스트 어댑터를 만들 때, 같은 정규식과 같은 id 형식을 따르면 facet JSON 을 그대로 재사용할 수 있다.

## 새 호스트 어댑터를 만든다면

(가상의 MDX 렌더러 예시)

1. MDX 컴파일러 단계에서 `{facet:<id>}` 텍스트를 발견 → React 컴포넌트 호출로 치환.
2. 컴포넌트 mount 시 `useEffect` 안에서 `getFacetById(id)` + `runFacet(json, ref.current)`.
3. cleanup 함수에서 핸들 destroy.

코어 API 가 작아서 (`runFacet` + `getFacetById` + `register*` + `parseFacetRaw`) 어댑터 자체는 100~150 줄 수준.
