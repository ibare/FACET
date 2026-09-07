# facet 데이터 정의·주입 가능성 분석

작성 2026-09-07 · 대상 커밋 `b8828b1` · 범위 facet 19종 / core runtime / authoring

호스트의 LLM 콘텐츠 생성 파이프라인이 facet 의 시각화 데이터를 **정의하고 주입**할 수 있게
여는 것이 가능한지, 어디가 막혀 있고 비용이 어디에 쏠려 있는지 조사한 기록.
구현 지침이 아니라 현황 실측이다.

---

## 1. 현재 데이터는 어디에 있나

전 facet 이 동일한 형태다 — **`facet.ts` 의 `FacetJson.initialData` 선언**. algorithm 은
`ctx.data` 로 읽기만 하고 값 리터럴을 갖지 않는다.

```ts
// facets/cs-fundamentals/lru-cache/src/facet.ts:28
initialData: {
  type: 'lru-cache', capacity: 4, autoDemoIntervalMs: 900,
  autoDemoSequence: [ { op: 'put', key: 'k1', value: 'v1' }, ... ],
}
// facets/cs-fundamentals/lru-cache/src/algorithm.ts:88
const { capacity, autoDemoIntervalMs, autoDemoSequence } = ctx.data;
```

배선은 `runner.ts:160` 한 곳이다. clone 하나를 View 와 mechanism 양쪽에 넘겨 같은 객체를
공유시킨다 (의도는 `mechanism.ts:133` 주석).

```ts
const initialDataClone = deepClone(json.initialData) as Record<string, unknown>;
mountParams: { initialData: initialDataClone, ... }   // View
mechanism.init(projector, initialDataClone, { ... })  // algorithm ctx.data
```

### facet 마다 데이터가 짊어진 무게가 다르다

| facet | initialData 가 담는 것 | 특징 |
| --- | --- | --- |
| lru-cache | `capacity`, `autoDemoSequence` | 값만. 규칙은 전부 algorithm |
| relational-tables-and-keys | `tables` / `columns` / `rows` / `relations` / `candidateKeys` / `pkChoice` / `rejects` | **판정까지 데이터가 대신함** |
| tokenization | `examples[3]` / `keywords` / `kindPalette` | 프리셋 다수. 단 문법은 코드 |

`rejects` 가 특징적이다. 무결성 위반 행을 알고리즘이 계산해 내는 게 아니라 "무엇이 왜
거부되는지" 를 미리 적어둔다. `candidateKeys` / `pkChoice` 도 후보키 판정을 데이터가 대신한다.

---

## 2. 이미 확보된 자산

### 2-1. 런타임이 이미 임의 JSON 을 받는다

`runFacet(json, mount, opts)` (`runner.ts:98`) 는 FacetJson 을 **인자로** 받는다. 레지스트리
조회(`getFacetById`)는 편의 경로일 뿐이라, 호스트가 만든 JSON 을 그대로 넘겨도 마운트된다.
"생성된 facet 을 띄운다" 는 새로 만들 필요가 없다.

### 2-2. 데이터 스키마가 이미 타입으로 형식화되어 있다

19종 중 **12종이 `*FacetData` 를 export** 한다. DB facet 은 index.ts 에서 세부 타입까지 공개.

```ts
// facets/database/relational-tables-and-keys/src/index.ts:14
export { type TablesAndKeysFacetData, type TableInit, type ColumnInit, type ColumnKind,
         type RowInit, type RelationInit, type RejectInit, type CandidateKeysInit,
         type AutoHoverStep } from './algorithm.js';
```

타입 미보유 7종 — `bfs` `bst` `bubble-sort` `matrix-transform-2d` `linear-regression`
`ip-routing` `context-switching`.

### 2-3. LLM 서버용 패키지가 이미 존재한다

`@ffacet/authoring` 이 정확히 이 파이프라인을 위해 있다 (`packages/authoring/src/index.ts:1`).
소비자가 브라우저가 아닌 호스트 LLM 서버라 의존 0 을 유지한다. `surface` 가 글↔개념 매칭
(임베딩), `briefing` 이 writer 브리핑. **데이터 주입 슬롯만 빠져 있다.**

### 2-4. codegen 파이프가 이미 facet 을 읽는다

`scripts/gen-screen-labels.mts` 는 AST 파싱이 아니라 facet 을 Node 에서 실제 import 해
FacetJson 을 읽고 authoring 에 generated 파일을 뱉는다. 같은 자리에 스키마 추출을 얹을 수 있다.
`contentHash` / `definitionHash` 변경 감지 기제도 이미 있다.

---

## 3. 막혀 있는 4개 관문

| 관문 | 현 상태 | 난이도 |
| --- | --- | --- |
| ① 주입 구멍 | 없음 | 낮음 |
| ② 런타임 스키마 | 없음 | 중간 |
| ③ 의미 불변식 검증 | 없음 | **높음** |
| ④ View 의 데이터 가정 | 다수 | **높음** |

### ① 주입 구멍 자체가 없다

- `RunFacetOptions` (`runner.ts:40`) 는 `autoStart` / `locale` / `theme` 뿐. data 오버라이드 없음.
- 호스트 DSL (`host-tiptap/src/markdown.ts:25`) 은 `{facet:<id>}` 토큰만 파싱. 파라미터 문법 없음.

결과적으로 facet 당 데이터셋이 1개로 고정된다. tokenization 만 `examples[]` 배열을
initialData 안에 넣어 자체 해결했고, `queue-fifo/src/facet.ts:11` 주석에도 같은 한계가
"향후 별도 preset 드롭다운으로 분리" 로 남아 있다.

### ② 타입이 런타임에 없다

```ts
// packages/core/src/types/facet-json.ts:88
export type InitialData = { type: string; [key: string]: unknown };
```

완전 open. zod / ajv / valibot 저장소 내 0건, 전 facet algorithm 통틀어 `throw new Error` 1건.
LLM 산출물을 걸러낼 수단이 현재 전무하다.

### ③ 타입은 통과하는데 의미가 틀리는 층 — 가장 어렵다

DB facet 기준으로 타입 검사를 다 통과하고도 화면이 거짓을 말하는 경우:

- `relations[].from.tableId` 가 실재하지 않는 테이블을 가리킴
- `pkChoice.member` 가 `candidateKeys.member` 에 없는 컬럼임
- `candidateKeys` 선언 컬럼에 실제로는 중복 값이 있음
- **`rejects[].kind: 'duplicate-pk'` 인데 그 행이 실은 중복이 아님** — 화면은 "이미 있는 값이라
  거부" 라고 말하는데 데이터는 그렇지 않음

마지막이 특히 나쁘다. 교육 콘텐츠에서 시각화가 틀린 것을 자신 있게 보여주는 건 없느니만 못하다.
LLM 생성에서 가장 자주 틀릴 층이기도 하다.

### ④ View 가 데이터를 알고 있다 — 예상 밖의 진짜 병목

**id 누수** (작은 문제):

```ts
// facets/database/relational-tables-and-keys/src/tables-stage.ts:702
function updateChipText(): void {
  const tbl = tables.get('member');          // 데이터 id 가 코드에
  const pkColId = pkChoice['member'] ?? '';
```
`algorithm.ts:283` 도 `?? 'member'` fallback. 바로 위 `labelOfColumn(tableId, ...)` 은 인자로
제대로 받는데 PK 칩 갱신 경로만 리터럴이다. 데이터를 갈면 조용히 동작하지 않는다.

**좌표 고정** (큰 문제):

```ts
// tables-stage.ts:50
const LEFT_CARD_X = 12;   const LEFT_CARD_W = 280;
const RIGHT_CARD_X = 428; const RIGHT_CARD_W = 280;
```
테이블 2개 전제로 좌표가 박혀 있다. 3개짜리 스키마를 주입하면 그릴 자리가 없다. `ROW_H = 22`
고정 격자라 행·컬럼 수도 같은 제약을 받는다. 즉 자유 주입은 stage view 재작성을 요구하고,
이는 배관이 아니라 facet 별 시각 설계 문제다.

**참고** — tokenization 은 데이터/규칙 분리가 덜 되어 있다. `keywords` 는 데이터인데 스캐너
문법은 `algorithm.ts` 하드코딩이다.
`isPunct`(:149) / 2글자 연산자(:170) / `//` 주석(:244) / `"` 문자열(:367), 게다가
`KEYWORDS_DEFAULT`(:117) fallback 상수가 있어 키워드가 코드·데이터에 이중 존재한다.
파이썬 `#` 주석을 넣으면 연산자로 잘못 잘린다.

---

## 4. 난이도 층화

- **Tier A — 주입 구멍 (1~2일, 전 facet 공통)**
  `RunFacetOptions.data` 추가 → `runner.ts:160` 에서 병합, DSL 파라미터 문법 추가.
  순수 배관, 리스크 낮음.
- **Tier B — 스키마 노출 (facet 당 0.5~1일)**
  `*FacetData` → JSON Schema. 타입 보유 12종은 `ts-json-schema-generator` 로 반자동,
  `screen:gen` 옆에 `schema:gen` 을 붙여 authoring 에서 `getFacetDataSchema(conceptId)` 로 배포.
  미보유 7종은 타입부터 세워야 함.
- **Tier C — 안전하게 열기 (facet 당 1~3일, 편차 큼)**
  의미 검증기 + id 누수 제거 + 레이아웃 가변화. **비용의 8할이 여기고 facet 마다 다른 작업.**

---

## 5. facet 별 값어치 대 비용

| facet | 주입 값어치 | 비용 | 판단 |
| --- | --- | --- | --- |
| tokenization | 높음 — 글이 다루는 스니펫 그대로 | **낮음** | 1순위 |
| array / stack / queue | 중간 — 글의 예시 값 | 낮음 | 2순위 |
| relational-tables-and-keys | 높음 — 도메인마다 다른 스키마 | 높음 | 3순위, 별건 |
| bubble-sort | 낮음 — 값이 뭐든 같은 이야기 | 낮음 | 열 이유 없음 |
| bfs / bst | 중간 | 매우 높음 — 그래프 레이아웃 붕괴 | 보류 |

**tokenization 이 압도적 진입점.** 주입 대상이 `examples[].source` — 문자열 하나다. 불변식이
사실상 없고(어떤 문자열이든 토큰화는 된다), 레이아웃도 문자열 길이에 이미 반응한다. 틀려도
화면이 거짓말하지 않고 다른 토큰이 나올 뿐이다.
단 "JS 계열 문법만 정확" 제약을 briefing 에 명시하거나, `commentPrefix` / `stringDelimiters`
정도를 initialData 로 빼는 반나절 작업을 선행해야 한다.

---

## 6. 결론

- **Tier A + tokenization 한정 = 3~4일, 확실히 가능.** 파이프라인 전체 모양
  (스키마 배포 → LLM 생성 → 검증 → DSL 주입 → 마운트) 을 한 바퀴 돌려볼 수 있다.
- **전 facet 자유 주입은 현실적으로 어렵다.** 막는 것이 데이터 배관이 아니라 각 stage view 의
  시각 설계 가정이며, 리팩토링이 아니라 재설계에 해당한다.
- 대신 facet 별로 **"주입 가능 표면" 을 좁게 선언**하는 방식 — 관계 모델이라면 "테이블 2개·
  컬럼 4개 고정, 도메인 이름과 값만 교체" — 이면 현 뷰를 건드리지 않고 상당한 값어치를 얻는다.
  회원/주문을 도서/대출로 바꾸는 것만으로 글과 화면이 맞물린다. 콘텐츠 파이프라인이 실제로
  원하는 것도 대개 이쪽으로 보인다.

## 후속 판단 대기

1. Tier A + tokenization 으로 한 바퀴 먼저 돌릴 것인가
2. facet 별 "주입 가능 표면" 선언 스키마부터 설계할 것인가
