/**
 * nestedDocument 개념 선언.
 *
 * canonical facet 은 `facet:nestedDocument` — 표 셋(`customers` · `orders` · `items`)에 흩어진 주문 101 의 줄 다섯이 한 걸음에
 * 하나씩 JSON 문서 하나로 접혀 들어간다. 주문 줄이 껍질이 되고, 손님 줄은 `customer` 객체가, 품목 줄 셋은 `items` 배열의 칸이
 * 된다. 줄끼리 잇던 열쇠 칸(`orders.customer_id` · `customers.id` · `items.order_id`)은 접히는 순간 사라진다. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `documentKv` 는 문서 · 키-값 · 표 셋을 나란히 두고 질의마다 싼 쪽이 옮겨 가는 것을 센다. 이쪽은 **문서가 어떻게
 * 생기는가** 한 장면이다 — 줄이 안으로 접히고 열쇠 칸이 안에 들어 있음으로 바뀐다. 그래서 definition 은 fold · nested
 * object · array · foreign-key columns disappear · containment 를 독점하고, 질의 비용 · 가장 싼 쪽 · 공유 사실 고치기는 쓰지
 * 않는다. 형제 `keyToValue` 의 opaque · GET 도 쓰지 않는다.
 *
 * 전제 (설명 글 `nestedDocument.md`): 자료는 예로 정한 것 · 접는 주문은 101 하나 · 손님 c1 이 주문 103 에도 걸리지만 겹쳐
 * 담기는 일은 다루지 않는다 · 문서는 JSON 그대로 적는다(`@notation native`).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nestedDocumentConcept: FacetConceptSource = {
  id: 'nestedDocument',
  label: 'Folding Related Rows into One Nested Document',
  canonicalFacet: 'facet:nestedDocument',

  surface: {
    definition:
      'An order\'s rows spread across separate tables fold into one JSON document: the customer row becomes a nested object, item rows become array elements, and the foreign-key columns disappear because containment now is the link.',
    exemplarKeywords: [
      'document model',
      'embedded document',
      'nested JSON',
      'MongoDB embedding',
      'denormalize into a document',
      'one-to-many as an array',
      'JSON document vs relational rows',
      'aggregate as a single document',
      'no join needed',
    ],
  },

  briefing: {
    observable: [
      'On the left, three tables: `customers` (id, name, city — c1 Ana Lima, c2 Ben Oslo, c3 Cho Seoul), `orders` (id, customer_id, date — 101, 102, 103) and `items` (order_id, product, qty — six rows, with no id of their own). On the right, a document area that starts empty. The first caption reads "Order 101: its rows sit in separate tables. Tables: 3."',
      'Step 1: "Row 1 of orders becomes the shell of the document." The document shows `"id": 101`, `"date": "2026-03-02"` and `"customer_id": "c1"`, and the caption notes it is still pointing outside: `orders.customer_id`.',
      'Step 2: the c1 row leaves `customers` and folds inside as `"customer": {"name": "Ana", "city": "Lima"}`; the caption lists the key cells gone — `customers.id` and `orders.customer_id`.',
      'Steps 3 to 5: the items rows for order 101 fold into the `items` array in table order — rows 1, 3 and 5 (pen 2, pad 1, cup 3) become slots 1, 2 and 3 — and each time `items.order_id` is listed as gone.',
      'The end reads "Rows folded: 5 → documents: 1. Links turned into nesting: 4. Rows left in tables: 7." The finished document is `{"id": 101, "date": "2026-03-02", "customer": {"name": "Ana", "city": "Lima"}, "items": [{"product": "pen", "qty": 2}, {"product": "pad", "qty": 1}, {"product": "cup", "qty": 3}]}`, three levels deep; rows not belonging to order 101 stay in their tables.',
      'The tables and values are an example, and only order 101 is folded. Customer c1 also has order 103, but a customer copied into two documents is not shown. The document is written as JSON. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the six steps by itself, one row folding per step, and stops at the finished document.',
        'A Replay button and a playback strip sit below it. Holding step 2 shows the customer row arriving as an object while two key cells vanish at once.',
      ],
    },

    useWhen: [
      'The article introduces the document model and needs to show where a document comes from: the same rows a relational schema keeps in three tables, packed inside one order.',
      'A reader asks what replaces foreign keys and joins in a document store; watching the key columns vanish as rows move inside shows that nesting itself carries the relationship.',
    ],

    avoidWhen: [
      'The article compares query costs between documents, tables and key-value pairs. Nothing is queried here; only one document is assembled.',
      'The subject is the drawback of duplicating a shared customer across documents, or keeping those copies in sync. Only one order is folded, so no copy appears.',
      'The point is JSON syntax or parsing. The JSON is shown as the result, not explained.',
    ],

    contrastWith: [
      {
        concept: 'documentKv',
        note: 'Folding rows into a document is how the document layout comes to be; whether that layout is the cheap one depends on the query, which is a comparison across storage models.',
      },
      {
        concept: 'foreignKeyPoints',
        note: 'A foreign key links two rows by storing a value that names the other row; nesting drops that value because the related data is placed inside rather than pointed at.',
      },
      {
        concept: 'matchOnKey',
        note: 'A join rebuilds the related rows at query time by matching key values; embedding does that assembly once when the data is stored, so reading the order needs no matching.',
      },
      {
        concept: 'keyToValue',
        note: 'A document keeps its fields visible to the store; a key-value store holds the same content as a value it cannot look inside.',
      },
    ],
  },
};
