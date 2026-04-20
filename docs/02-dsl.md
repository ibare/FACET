# 02 · DSL

FACET DSL 은 호스트(에디터, 마크다운 렌더러 등) 안에 임베드되도록 설계된 단일 식별자 표기다.

## 문법

```
{facet:<id>}
```

- 중괄호 `{` `}` 로 감싸진 단일 토큰.
- `facet:` 접두는 네임스페이스. 향후 다른 네임스페이스(`{facet/diagram:...}` 등)를 추가할 여지를 열어둔다.
- `<id>` 는 영문자로 시작하는 카멜/케밥 케이스 식별자. 정규식: `[a-zA-Z][a-zA-Z0-9-]*`.
- 표현식 내부 토큰 분리는 없다. 컨테이너/본체 같은 옛 이중 식별자(`{facet:loop facet:bubbleSort}`)는 폐기.

예:

```
{facet:quickSort}
{facet:bubbleSort}
{facet:bfs}
```

DSL 안에는 데이터, 색상, 레이아웃, 코드 패널, 메트릭 등 어느 구체도 들어가지 않는다. 모든 구체는 등록된 `FacetJson` 에 산다 — DSL 은 "어떤 facet 인지" 만 가리킨다.

## 호스트에서의 인식

Tiptap 어댑터(`@facet/host-tiptap`)는 두 경로로 DSL 을 노드로 변환한다.

1. **InputRule / PasteRule** — 사용자가 `{facet:quickSort}` 를 타이핑하거나 붙여 넣으면 즉시 `facet` 노드로 치환.
2. **parseHTML** — 직렬화된 문서에서 `<span data-facet="true" data-facet-id="facet:quickSort">` 를 만나면 동일 노드로 복원.

NodeView 는 `getFacetById(id)` 로 등록된 JSON 을 조회하고 `runFacet(facetJson, mount)` 을 호출한다. id 가 등록되어 있지 않으면 인라인 에러 박스("unknown facet: ...") 를 그려 디버깅을 돕는다.

## 파서 헬퍼

```ts
import { parseFacetRaw } from '@facet/host-tiptap';

parseFacetRaw('{facet:quickSort}');  // → 'facet:quickSort'
parseFacetRaw('{facet:bubble-sort}'); // → 'facet:bubble-sort'
parseFacetRaw('{foo}');              // → null
```

전체 id (네임스페이스 포함) 를 반환한다는 점이 중요. 레지스트리도 같은 형식의 id 로 등록된다.

## 비-목표

- 인라인 파라미터 — DSL 은 "어떤" 만 표현한다. "어떻게" 는 JSON.
- 매크로/표현식 — DSL 은 식별자 한 개 그 자체.
- 다중 노드 합성 — facet 한 개 = DSL 한 개.

이 제약 덕분에 호스트 어댑터는 "정규식 한 줄 + id 조회" 라는 매우 얇은 책임만 진다.
