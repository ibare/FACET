# 개념 메타를 여러 개 만들 때 — 작업 절차

`packages/authoring/src/concepts/<id>.ts` 를 여러 개 만들 때의 방식이다. 규칙이
아니라 작업 방식이라 `rules/` 에 두지 않는다. 스키마 자체의 규범은
`packages/authoring/src/concept-types.ts` 의 주석에 있다.

## 왜 있는가 — 묶어서 쓰지 않으면 검색이 갈리지 않는다

호스트는 `definition` · `label` · `exemplarKeywords` 를 임베딩해 "이 글에 어떤
개념이 맞는가" 를 가린다. 그런데 FACET 에는 **같은 것을 다루는 조각과 완제품이
나란히 있다.** `facet:kmeans`(완제품)와 `facet:assignThenMove`(조각)는 둘 다
k-평균을 다루고, 글의 어느 대목이냐에 따라 답이 갈린다.

**개별로 쓰면 그 갈림이 사라진다.** 한 facet 만 보고 definition 을 쓰면 조각도
완제품도 "k-means clustering assigns points to the nearest centroid and moves
the centroid to the mean" 같은 같은 문장이 된다. 벡터 공간에서 두 점이 붙고,
검색은 어느 쪽인지 답할 수 없다. `useWhen` 이 그 자리를 맡도록 설계되어 있지만
(concept-types.ts 참조), 애초에 `definition` 과 `exemplarKeywords` 가 갈려
있어야 후보 목록에 둘 다 오른 뒤에 `useWhen` 이 일한다.

그래서 **완제품과 그것이 포괄하는 조각을 한 묶음으로 묶어, 묶음 하나를 에이전트
하나가 통째로 쓴다.** 같은 에이전트가 형제들을 한자리에서 보아야 "이쪽은 전체
절차, 저쪽은 그중 한 걸음" 이 문장으로 갈린다.

## 묶는 법

묶음의 근거는 `apps/playground/src/catalog.json` 의 조각 `origin` 필드다. 조각을
도출할 때 출발한 토픽을 가리킨다.

1. **완제품 하나 + 그것을 `origin` 으로 삼는 조각 전부** 가 한 묶음이다.
2. `origin` 이 **구현되지 않았거나 목록에서 내려간 토픽**을 가리키는 조각이 있다
   (구현된 조각 120 중 20). 덱 · 이진 트리 · 그래프처럼 조각이 그 자리를 대신한
   것들이다. 이들은 **그 토픽 이름으로 묶는다** — 완제품이 없을 뿐 개념 묶음으로는
   하나다.
3. 묶음이 너무 크면(조각 10 초과) 나눈다. 나눌 때는 서로 가장 덜 닮은 선으로
   가른다.

## 에이전트에게 주는 것

- 묶음의 facet 목록 (완제품 + 조각)
- 각 facet 의 `facet.ts` · `algorithm.ts` · stage 경로
- 이미 쓰인 이웃 개념들 (`contrastWith` 로 이을 후보)
- 스키마 파일과 작성례 하나 (`concepts/sift-down.ts`)

**묶음 안에서 definition 이 서로 갈리게 쓰라고 명시한다.** 이것이 묶는 이유이므로
지시에서 빠지면 묶은 값이 없다.

## 지켜야 하는 것

- **`id` 는 `facet:<id>` 가 `canonicalFacet` 이 되도록 짓는다.** 스키마 주석은
  둘이 달라도 된다고 하고 실제로 타입은 허용하지만, **저장소의 개념 74 개가 전부
  같고 예외가 0 건이다.** 허용과 관행은 다르다. 다르게 지을 이유가 생기면 그때
  이 문장을 고친다.
- `aspects` 는 쓰지 않는다 (현재 74 개 중 0 건). 호스트 어댑터가 "aspect facet 은
  아직 싣지 않는다 — 2단 노출 배선이 없다" 고 밝혀 두었다.
- `screen.labels` 는 쓰지 않는다. `pnpm screen:gen` 산출물에서 조회 시점에 붙는다.
- **`contrastWith[].note` 는 개념 층위로 쓴다.** 상대 facet 의 화면을 서술하지
  않는다 — "That screen runs it many times over" 는 그 화면이 바뀌면 함께 틀리고,
  writer 가 독자에게 보이지도 않는 화면을 언급하게 만든다. 두 개념 사이의 **주장
  차이**를 쓴다. 2026-09-10 배치에서 25 파일 28 건이 이렇게 나갔다가 배포 직전
  rule-guard 에 걸려 되돌렸다 (기존 74 개에서는 2 건뿐이었다). 사양에서 빠지면
  반복된다.
- 다 쓰면 `concepts/index.ts` 의 `CONCEPT_SOURCES` 에 등록한다. 등록하지 않으면
  파일만 있고 아무 데도 안 나온다.

## 마치고

```sh
pnpm concept:audit                                   # 어휘 되풀이 · 분류 어휘 누출 · 미선언 참조
pnpm vitest run test/concept-covers-facets.test.ts   # facet 전수를 덮는가
```

`concept:audit` 은 **선언된 것끼리만** 본다. 전수를 덮는지는 두 번째 검사가 본다 —
0.4.0 에서 facet 이 74 → 179 로 늘었는데 개념은 74 그대로여서 호스트가 "신규 0" 으로
판정한 적이 있고, 그때 `concept:audit` 은 통과했다.
