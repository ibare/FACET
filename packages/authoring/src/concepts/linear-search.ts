/**
 * linearSearch 개념 선언.
 *
 * canonical facet 은 `facet:linearSearch` — 완결형이다. 찾는 값 표찰 · 칸 여덟 ·
 * 훑기마다 한 줄씩 쌓이는 기록 세 층을 그리고, 누적 계기 셋(훑기 · 견줌 · 찾음)과
 * 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다. 이 완제품의 주인공은 코드 패널이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **절차 전체와 그 결과** 를 맡는다 — 앞에서부터 한 칸씩 견주는 루프가
 * 여섯 언어로 어떻게 적히는지, 두 번의 훑기가 계기에 얼마로 쌓이는지.
 * 조각 `scanUntilFound` 는 그중 한 가지만 말한다 — 찾은 훑기와 없다고 답한 훑기의
 * **길이 차이**. stage 도 서로 안 겹치게 갈라 두었다 (기록은 장부이지 길이 비교가
 * 아니다). keywords 도 이쪽은 구현 · 자료구조 어휘를, 조각은 이른 탈출 · 최악의
 * 경우 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const linearSearchConcept: FacetConceptSource = {
  id: 'linearSearch',
  label: 'Linear Search (Looking at Every Cell in Turn)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:linearSearch',

  surface: {
    definition:
      'Examining a sequence one position at a time from the front, comparing each value against the target, stopping at the first match and otherwise running to the end.',
    exemplarKeywords: [
      'linear search',
      'sequential search',
      'find a value in an unsorted array',
      'indexOf',
      'contains',
      'scan a list',
      'a for loop with an if inside',
      'first occurrence',
      'brute force lookup',
      'O(n) lookup',
      'the simplest search there is',
    ],
  },

  briefing: {
    observable: [
      'The eight cells are drawn at equal size with their values written plainly, and nothing about the drawing suggests an order — the values are deliberately out of order and the picture does not encode magnitude.',
      'A cursor rests on exactly one cell at a time; the cell under it is highlighted, and cells already passed sink into a fainter shade so how far the scan has come is readable at a glance.',
      'A label on the left holds the value being looked for and takes on a different colour depending on how the search ended — one shade when the value turned up, another when it did not.',
      'Two searches run in sequence over the same row, and each leaves one line in a record below: which value, whether it was found, and how many cells had to be looked at.',
      'The two lines differ in that count — one search stops partway, the other reads every cell before it can answer — and a caption states outright that with no order to lean on there is no place to give up early.',
      'Three counters run along the bottom: searches, comparisons and hits, and the comparison counter is the total across both searches rather than a per-search figure.',
      'The code panel highlights the line matching the current step, so the comparison in the source and the cell under the cursor light up together.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. Stepping once advances one phase, which separates moving the cursor from making the comparison.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'The row and the two values searched for are fixed, so an article can name the value that is present, the seat it sits in, and the value that is absent.',
      ],
    },

    useWhen: [
      'The article is introducing search at all and needs the baseline every other method is measured against — the version with no precondition, no preparation and nothing to maintain.',
      'A reader is being shown the same loop in a second language and needs to see that the shape does not change. The code panel holds two languages side by side while a single cursor drives both.',
      'The prose distinguishes a search that succeeds from one that fails and treats them as the same operation. Two runs over one row, ending with different counts in the record, is where that assumption comes apart.',
    ],

    avoidWhen: [
      'The row in the article is sorted and the point is what that buys — halving the range, or the precondition that makes halving legal. Nothing here may assume an order.',
      'The subject is a lookup that does not scan at all: a hash table, an index, a dictionary keyed by value.',
      'The article means a linear scan over rows in a database or a log file where the cost is disk or network, not comparisons. What is counted here is value-against-value comparisons.',
      'The point is finding every occurrence, a count, or a range of matches. Each search here stops at the first hit.',
      '"Linear" refers to a linear model, linear regression, or a straight-line fit.',
    ],

    contrastWith: [
      {
        concept: 'scanUntilFound',
        note: 'That concept is the asymmetry between finding and failing to find; this one is the procedure itself, one position at a time from the front.',
      },
      {
        concept: 'binarySearch',
        note: 'Both answer the same question, but halving requires a sorted row and this requires nothing, which is the whole trade being made.',
      },
      {
        concept: 'requiresSorted',
        note: 'That concept is the precondition this one does without: with no order there is nothing to reason from, so every cell has to be looked at.',
      },
      {
        concept: 'hashToBucket',
        note: 'Computing a position from the value skips the scan entirely; this walks because it has no way to compute where to look.',
      },
    ],
  },
};
