/**
 * sortStability 개념 선언.
 *
 * canonical facet 은 `facet:sortStability` — 이름표 달린 항목 넷(B3 · A1 · C3 · D1)
 * 하나의 입력에서 결과 줄 둘이 갈라져 나오는 조각이다. 값만 보면 두 줄이 똑같이
 * 1 · 1 · 3 · 3 이고, 이름표를 접으면 구별이 사라진다. 두 결과 줄 사이에 같은
 * 항목끼리 실을 이으면 한 짝만 엇갈리는데, 그 교차 하나가 이 조각의 전부다.
 *
 * ── 묶음 안에서 무엇을 맡는가
 *
 * `bubbleSort`(완제품) 와 `bubbleAdjacentSwap` 은 값의 차례가 어떻게 만들어지는지를
 * 말한다. 이 조각은 **값의 차례가 다 맞은 뒤에도 남는 자유도** 를 말한다 — 값이
 * 같은 둘의 앞뒤. 그래서 definition 에 견줌도 맞바꿈도 훑기도 넣지 않고, 정렬
 * 결과가 여럿이라는 사실과 그중 하나를 고르는 성질에만 무게를 둔다.
 * 형제 `compareAndSwap` 이 "같으면 바꾸지 않는다" 는 규칙을 말한다면, 이 조각은
 * 그 규칙이 정렬 전체에서 무엇을 지켜 주는지를 말한다.
 *
 * 이 조각은 정렬 과정을 보이지 않는다 — 같은 입력에서 갈라져 나온 두 **결과**만
 * 보인다. observable 이 걸음이 아니라 결과를 말하는 까닭이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sortStabilityConcept: FacetConceptSource = {
  id: 'sortStability',
  label: 'Sort Stability (Ties Keep Their Input Order)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:sortStability',

  surface: {
    definition:
      'When several records share a sort key, more than one ordering is correct; a sort is called stable when it always leaves those records in their original relative order.',
    exemplarKeywords: [
      'stable sorting algorithm',
      'unstable sort',
      'ties and tie-breaking',
      'sorting twice by two columns',
      'secondary sort key',
      'sort by department then by name',
      'merge sort keeps duplicates in order',
      'selection sort and heap sort do not',
      'ORDER BY with duplicate keys',
      'attaching the original index to break ties',
    ],
  },

  briefing: {
    observable: [
      'Every item is drawn as a chip carrying two things — a name tag and a value — so two items with the same value are still told apart.',
      'One input row produces two result rows, and the chips travel from the input row down into each of them.',
      'The two result rows read identically as values: 1, 1, 3, 3 in both.',
      'A step folds the name tags away, and with them hidden the two rows become indistinguishable on screen.',
      'Threads are then drawn between the two result rows, joining each item to itself: two run parallel and one pair crosses.',
      'The final caption points at the crossed pair and names the shared value, marking the top row as the one that kept the input order of those two.',
      'The row labels say which result is which — input, the stable result, and the selection-sort result.',
    ],

    screen: {
      affordances: [
        'The comparison builds itself in five steps and stops on the crossed threads, leaving the finished picture on screen.',
        'Two buttons: Replay, and a step control that rewinds and then advances one step at a time — useful for pausing on the moment the name tags are hidden.',
        'The four items are fixed, with two pairs of equal values, so the article can name the items by their tags when describing which pair crossed.',
      ],
    },

    useWhen: [
      'The article states which sorts are stable and the reader has no idea what property is being claimed, because both outputs look correct.',
      'A multi-key sort is being built by sorting once per key in reverse order, and the whole technique rests on the earlier ordering surviving the later sort.',
      'The reader assumes a sorted array is unique and needs to see that equal keys leave a genuine choice, not an implementation detail.',
    ],

    avoidWhen: [
      'The article uses "stable" for numerical stability, for a stable API or release, or for the stability of an iterator or hash under rehashing. Those are unrelated senses of the word.',
      'The subject is how any particular sort works step by step. No sorting procedure is animated here — only two finished results are compared.',
      'The point is sorting performance, memory use, or which sort to pick for speed.',
    ],

    contrastWith: [
      {
        concept: 'compareAndSwap',
        note: 'That screen states the rule that equal values are never exchanged; this one shows what a whole sort gains or loses depending on whether it obeys that rule.',
      },
      {
        concept: 'selectMinEachPass',
        note: 'The unstable result shown here comes from exactly that pass structure — swapping a distant minimum into the front is what jumps one equal value over another.',
      },
      {
        concept: 'mergeTwoSorted',
        note: 'Merging is stable because a tie takes from the left run first; that single tie-breaking choice is what this concept is measuring.',
      },
      {
        concept: 'countThenPlace',
        note: 'Counting sort stays stable only if the placement pass walks the input backwards, which is the same property arrived at by a very different route.',
      },
    ],
  },
};
