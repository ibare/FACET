# @ffacet/authoring

facet 개념(concept)의 authoring 메타데이터. 호스트의 글 작성 파이프라인이
**글에 넣을 시각화를 고르고**, 고른 시각화의 내용을 **writer 에게 전달**하는 데
쓰는 단일 출처다.

```sh
pnpm add @ffacet/authoring
```

## 왜 facet 이 아니라 개념인가

writer 가 고르는 단위는 개념이다. 실제로 마운트되는 facet 은 한 개념에 여럿
붙을 수 있고 시간이 지나면 교체된다. 글에 박히는 봉투가 개념을 가리키면 facet 이
바뀌어도 이미 발행된 글이 깨지지 않는다.

## 쓰는 법

```ts
import { getFacetConcepts, getFacetConcept } from '@ffacet/authoring';

const all = getFacetConcepts();            // 전체
const one = getFacetConcept('queueFifo');  // 하나
```

`locale` 을 주면 `briefing.screen.labels` 가 그 언어의 화면 문자열로 해석된다
(기본 `en`). 나머지 필드는 영어 단일이며, 다른 언어가 필요하면 호스트가 번역해
쓴다.

## 두 종류의 필드

| | 쓰임 |
| --- | --- |
| `surface` | **임베딩 재료.** "이 글에 어떤 개념이 맞는가" 를 가리는 데만 쓴다. 중립적이고 검색어에 걸리는 문장. |
| `briefing` | **선택 이후 재료.** 화면에서 실제로 무엇이 관찰되는지, 어떤 용어를 써야 글과 화면이 맞물리는지. |

한 필드에 두 용도를 겹치면 양쪽 다 나빠진다.

`briefing.useWhen` 은 **같은 개념에 화면이 둘 있을 때** 무엇을 고를지 가린다.
한쪽은 개념 하나를 보이고 멈추고, 다른 쪽은 독자가 값을 넣고 몰아 보는 물건이라
`definition` 도 `exemplarKeywords` 도 겹치기 때문이다. `avoidWhen` 은 그 반대로,
검색이 만드는 오검출을 되돌리는 유일한 장치다 — `definition` 에 "queue" 가 들어
있는 한 우선순위 큐 글은 반드시 잘못 걸린다.

## 의존 0

이 패키지는 `@ffacet/core` 를 포함해 어떤 워크스페이스 패키지도 import 하지
않는다. 소비자가 브라우저 런타임이 아니라 호스트의 LLM 서버이기 때문에, 개념
메타를 읽는 대가로 View / transpiler 코드가 딸려오면 안 된다.

## 라이선스

MIT
