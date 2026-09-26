/**
 * keyToValue 개념 선언.
 *
 * canonical facet 은 `facet:keyToValue` — 저장소에 짝 여섯(`user:11` … `user:16` → 이름과 도시의 JSON 글자)이 닫힌 채 있다.
 * 물음 ① `GET user:14` 는 값 하나만 밖으로 꺼내고, 물음 ② "city 가 Oslo 인 값" 은 저장소가 값 속을 모르므로 여섯을 차례로
 * GET 해 바깥(앱)에서 열어 본다 — 맞은 것이 나와도 멈추지 않는다. 꺼낸 값 1 대 6, 맞은 것 3. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `documentKv` 는 키-값을 표 셋 · 문서와 나란히 놓고 질의마다 싼 쪽을 센다. 이쪽은 **키-값 저장소 하나의 동작** —
 * 열쇠로는 하나, 값 속으로는 전부 꺼내 연다 — 을 쥔다. 그래서 definition 은 only by its key · opaque · every value
 * out to the application 을 독점하고, 표 · 문서 · 가장 싼 쪽은 쓰지 않는다. 형제 `nestedDocument` 의 fold · nested ·
 * foreign-key 도 쓰지 않는다.
 *
 * 전제 (설명 글 `keyToValue.md`): 자료는 예로 정한 것 · 훑기 차례는 열쇠 차례 · 열쇠가 저장소 안 어디에 놓이는가(해시 ·
 * 버킷)는 다루지 않는다 · `GET` 은 특정 제품의 명령이 아니라 키-값 모형의 연산 이름이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keyToValueConcept: FacetConceptSource = {
  id: 'keyToValue',
  label: 'Key-Value Store: By Key One Value, By Content Every Value',
  canonicalFacet: 'facet:keyToValue',

  surface: {
    definition:
      'A key-value store finds a value only by its key and treats the value as opaque, so asking about a field inside forces every value out to the application to be opened and checked.',
    exemplarKeywords: [
      'key-value store',
      'Redis GET',
      'DynamoDB get item',
      'opaque value blob',
      'query by value in a key-value store',
      'full scan outside the database',
      'secondary index in a key-value store',
      'lookup by key only',
      'NoSQL key-value model',
    ],
  },

  briefing: {
    observable: [
      'A Store holds six keys, `user:11` to `user:16`, each value a closed bar; an "Outside (the app)" area sits beside it. The first caption reads "Pairs in the store: 6. Every value is sealed." Two counters read "Taken out by key 0" and "Taken out to look inside 0".',
      'Question ① "the value of user:14": `GET user:14` brings one value out whole, `{"name":"Lia","city":"Oslo"}`. Caption: "GET user:14: one value comes out whole. Taken out: 1."',
      'Question ② "values whose city is Oslo": the app sends GET for each key in order, and each value is opened outside, its `city` read and marked — "GET user:11, then opened outside. city: Lima does not match. Taken out: 1 · Matched: 0."',
      'Matches at `user:12` and `user:14` do not stop the scan; all six come out. It ends with "Taken out by key: 1. Taken out to look inside: 6 · Matched: 3." — user:12, user:14 and user:16. Inside the store, no value is ever opened.',
      'The six pairs are an example. Where a key sits inside the store (hashing, buckets) is not shown, and `GET` is the key-value model\'s operation name rather than one product\'s command. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays nine steps by itself — the sealed store, one GET by key, six GETs to look inside, and the closing counts — and then stops.',
        'A Replay button and a playback strip sit below it. Holding the step where `user:14` matches but the scan goes on to `user:15` shows that a match does not end the search.',
      ],
    },

    useWhen: [
      'The article explains what a key-value store can and cannot answer, and needs the gap between one value for a key lookup and every value for a question about content.',
      'A reader wonders why filtering on a field in Redis or a similar store means pulling everything into the application, or why a secondary index is needed.',
    ],

    avoidWhen: [
      'The article is about how a hash table places keys into buckets or handles collisions. Placement inside the store is not shown.',
      'The subject is caching, expiry or eviction policies. Values here never expire or leave the store.',
      'The point is document databases that can query fields inside a value. This store cannot look inside at all.',
    ],

    contrastWith: [
      {
        concept: 'documentKv',
        note: 'Looking up by key versus scanning for content is the behaviour of one key-value store; compared with tables and documents, that behaviour makes a whole read by key the cheapest query and any question about content the costliest.',
      },
      {
        concept: 'hashToBucket',
        note: 'Hashing a key to a bucket is how a store can find one key quickly; the key-value model is about what can be asked at all, which is only keys, not what the values contain.',
      },
      {
        concept: 'exactMatchOnly',
        note: 'A hash index answers only equality on the indexed key; a key-value store has the same limit and adds another — anything inside the value is invisible to it.',
      },
      {
        concept: 'nestedDocument',
        note: 'A document store keeps nested fields visible so they can be searched; a key-value store holds the same content sealed.',
      },
    ],
  },
};
