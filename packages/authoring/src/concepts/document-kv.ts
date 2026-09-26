/**
 * documentKv 개념 선언.
 *
 * canonical facet 은 `facet:documentKv` — 같은 주문 셋(`customers` · `orders` · `items` 에서 접은 주문 101 · 102 · 103)을
 * 표 셋 · 문서 · 키-값 세 가지로 담고, 질의 셋(주문 101 통째로 · `city` = `Lima` 인 손님의 주문 · Ana 의 `city` → `Quito`)이
 * 저마다 덩어리(줄 · 문서 · 값)를 몇 번 꺼내고 고쳐 넣는지 센다. 손잡이 둘 — 담는 법 · 질의. 가장 적게 건드린 쪽이
 * 질의를 따라 문서 · 키-값(1) → 문서(2) → 표 셋(1) 으로 옮겨 간다.
 *
 * ── 묶음 안에서의 자리 (완제품 셋 + 조각 넷 가운데, 이 완제품 아래 조각 둘)
 *
 * 조각 `nestedDocument` 는 흩어진 줄이 문서 하나로 **접히는** 장면, `keyToValue` 는 열쇠로는 하나 · 값 속으로는 전부
 * **꺼내 여는** 장면이다. 이쪽은 두 모형을 표 셋과 나란히 놓고 **질의를 돌려 싼 쪽이 옮겨 가는 것**을 쥔다. 그래서
 * definition 은 same orders · three ways · which query is cheapest · shared fact 를 쥐고, 조각들이 독점한 fold ·
 * embed · foreign-key columns vanish · opaque · GET · every value out 을 쓰지 않는다.
 *
 * 전제 (설명 글 `documentKv.md`): 자료는 예로 정한 것 · 문서와 값은 표 셋에서 주문마다 접어 만든 것 · 표와 문서는
 * 찾는 칸마다 색인이 있다고 치고 색인 읽기는 세지 않는다 · 키-값의 앱은 열쇠 셋을 미리 안다 · 줄 · 문서 · 값을 모두 같은
 * 하나로 센다(크기 무시) · 문서와 값은 JSON 그대로 적는다(`@notation native`). 이 완제품은 IR 이 없어 코드 패널이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const documentKvConcept: FacetConceptSource = {
  id: 'documentKv',
  label: 'Tables vs Documents vs Key-Value (Layout Decides the Cheap Query)',
  canonicalFacet: 'facet:documentKv',

  surface: {
    definition:
      'Storing the same orders as three tables, one document per order, or one value per key decides which query touches the fewest chunks: reading an order whole, filtering on an inner field, or editing a shared fact.',
    exemplarKeywords: [
      'document database vs relational database',
      'key-value store vs document store',
      'SQL vs NoSQL data modeling',
      'MongoDB vs PostgreSQL',
      'Redis vs MongoDB',
      'embedding vs referencing trade-off',
      'denormalization cost of updates',
      'access-pattern driven schema design',
      'aggregate-oriented database',
      'choosing a NoSQL data model',
    ],
  },

  briefing: {
    observable: [
      'A Store area on one side and an App area on the other. The data is three orders built from tables `customers` (c1 Ana Lima · c2 Ben Oslo · c3 Cho Seoul), `orders` (101 · 102 · 103) and `items` (six rows). A caption names the round, like "Stored as: Documents · Query: Order 101, whole", and a counter reads "Reads: 0 · Writes: 0".',
      'Under Tables the store shows the three tables; under Documents it shows three JSON documents, each order with its `customer` object and `items` array; under Key-value it shows keys `order:101` · `order:102` · `order:103` whose values stay closed bars inside the store. Customer c3 has no order and appears in no document or value.',
      'Each step takes one chunk — a row, a document or a value — out to the App, or writes one back into its place in the store, with captions such as "Read: row 3 of items (…)", "Read: document 101", "GET order:101 — the whole value comes out" or "PUT order:103 — the whole value goes back in". Key-value values open only after they reach the App, where a verdict like "city = Lima · match" appears.',
      'Whole order 101: Tables reads 5 rows (the order, its customer, and items rows 1, 3 and 5), Documents reads 1 document, Key-value 1 value. Answer for all three: "order 101 · customer Ana · items: 3".',
      'Orders where city = Lima: Tables reads 3 rows, Documents 2 documents, Key-value 3 values — it has to GET and open every value and does not stop at a match. Answer for all three: orders 101 and 103.',
      'Ana\'s city → Quito: Tables writes 1 row, because the city sits in one customers row. Documents writes 2, because Ana\'s customer object is copied into documents 101 and 103. Key-value reads 3 and writes 2, putting each whole value back. The answer reports how many copies changed: 1, 2, 2.',
      'At the end of each round a tally "Chunks this query touched, per way of storing" lists Tables, Documents and Key-value with their counts, and a "Fewest" mark sits on the lowest — on both Documents and Key-value for the whole-order read (1 each), on Documents for the filter (2), on Tables for the edit (1).',
      'The data is an example. Tables and documents are assumed to have an index on every field searched, and index reads are not counted — only chunks. The key-value app is assumed to know its three keys. A row, a document and a value each count as one regardless of size. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Stored as" — Tables, Documents or Key-value (starting at Documents) — and "Query" — Whole order, Filter inside or Edit a fact (starting at Whole order). Each round plays to its answer, then waits for a handle.',
        'The move that makes the idea land is holding one query and turning "Stored as" through all three, then switching the query: the "Fewest" mark moves from Documents and Key-value, to Documents, to Tables.',
        'Readouts under the controls: Reads and Writes, reset to 0 at the start of every round.',
      ],
    },

    useWhen: [
      'The article argues that no storage model is simply faster, and needs one set of orders where the cheapest layout changes with the query: whole reads favour one chunk per order, edits to a shared fact favour storing it once.',
      'A reader is deciding between relational tables, a document store and a key-value store for the same data, and the article wants the three counted side by side against the same three questions.',
    ],

    avoidWhen: [
      'The article is about scaling out, sharding or replication of NoSQL stores. Everything here sits in a single store and only chunk counts are compared.',
      'The subject is transactions or consistency guarantees across documents. The edit is counted, not protected; no concurrency appears.',
      'The point is query languages such as SQL or MongoDB syntax. Queries are named in short phrases, and no query text is shown.',
    ],

    contrastWith: [
      {
        concept: 'nestedDocument',
        note: 'Embedding an order\'s related rows into one document is how the document layout is built; which queries that layout makes cheap or expensive compared with tables and key-value pairs is the further question.',
      },
      {
        concept: 'keyToValue',
        note: 'A store that finds values only by key and cannot see inside them is one model; against tables and documents it is cheapest only for reading one aggregate whole by key, and costliest for anything about content.',
      },
      {
        concept: 'normalForms',
        note: 'Normalization removes duplicated facts to prevent update anomalies. Embedding reintroduces the duplication on purpose, trading more writes when a shared fact changes for fewer reads of the whole aggregate.',
      },
      {
        concept: 'relationalTablesAndKeys',
        note: 'Tables linked by keys are one of the three layouts compared; the relational model itself is about identifying and linking rows, not about how many rows a query must fetch.',
      },
    ],
  },
};
