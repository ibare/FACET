/**
 * fuseTwoRankings 개념 선언.
 *
 * canonical facet 은 `facet:fuseTwoRankings` — 조각이다. 위에 질의 "reset router password"
 * 에 대한 두 등수 줄(word match · meaning match, 다섯씩)이 나란히 서고, 자리마다 몫
 * 1/(60 + r) 이 막대로 매달려 있다. 아래에는 문서 일곱의 기둥 자리가 있다. 걸음마다 한 등수의
 * 몫이 두 줄에서 떨어져 제 문서의 기둥에 쌓이고 (1 등부터 5 등까지 다섯 걸음), 마지막에 기둥이
 * 쌓인 높이대로 다시 선다 — 맨 앞은 어느 줄에서도 1 등이 아니던 d2 다. 스스로 한 바퀴
 * 재생하고 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **단위가 다른 점수를 버리고 등수만으로 합치는 셈** 이다.
 * 몫을 한쪽에 더 주는 손잡이는 없다 — 두 줄이 똑같이 센다. definition 에 `hybridSearch` 의
 * 낱말(weight · split · balanced · term · meaning · passages)도, `sameWordVsSameMeaning` 의
 * 낱말(keyword · embedding · reworded · sinks · climbs)도 쓰지 않았다. 여기 가져간 것은
 * lists · units · rank · 1/(k + rank) · crediting · steady 다.
 *
 * ── 전제
 *
 * 두 등수는 예로 정한 값이다 — 실제 검색기가 이 문서들에 낸 결과가 아니다. 이 조각은
 * 등수를 셈하지 않는다. 합은 분수로 정확히 견주고, 이 자료에는 동률이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fuseTwoRankingsConcept: FacetConceptSource = {
  id: 'fuseTwoRankings',
  label: 'Fusing Two Rankings (Reciprocal Rank Fusion)',
  canonicalFacet: 'facet:fuseTwoRankings',

  surface: {
    definition:
      'Merging two result lists whose scores are in incompatible units by discarding the scores and crediting each document 1/(k + rank) from every list it appears on, so steady placement on both beats leading one.',
    exemplarKeywords: [
      'reciprocal rank fusion',
      'RRF',
      'combining search results from two engines',
      'rank fusion',
      'merge ranked lists',
      'scores on different scales cannot be added',
      'score normalization for search',
      'RRF constant k = 60',
      'metasearch result merging',
      'fusing BM25 and vector results',
    ],
  },

  briefing: {
    observable: [
      'The query "reset router password" heads two lists of five, one labelled word match and one labelled meaning match. The word list runs d1 to d5 in order; the meaning list runs d6, d2, d7, d3, d1. Seven documents are involved, and a document missing from a list is marked unlisted there.',
      'The opening caption says the two lists scored the query in different units and that only their ranks are kept; no score from either list ever appears.',
      'Under each place hangs a bar whose height is that place\'s share, 1/(60 + rank), drawn to the same scale as the columns below, so a bar keeps its size when it falls. Because k is 60 the bars shrink only slightly from place 1 (1/61) to place 5 (1/65).',
      'There are five dropping steps, one per rank from 1 to 5. In each, the bar at that place falls from both lists into the column of the document it belongs to, and the caption states the fraction being handed over.',
      'In the final step the columns slide sideways into order of height: d2, d1, d3, d6, d7, d4, d5, with each total shown to four decimals. The caption names d2 as the leader, placed #2 and #2 — first in neither list.',
      'd6, first on the meaning list, collects a single 1/61 because it is absent from the word list and ends fourth; d1, first on the word list, is second because its other share arrives from fifth place.',
      'Both lists are invented for the example rather than returned by any real search engine, and nothing here computes them. The totals are compared as exact fractions, and in this data no two totals are equal.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own — the two lists, five drops, then the re-ordering of the columns — and stops on the fused order.',
        'Beneath it are a Replay button and a playback strip; once the run is over, dragging the handle to a single drop holds the columns at that partial height.',
        'The query, the seven titles, both lists and k = 60 are fixed, so an article can quote any share or total and name the document it belongs to.',
      ],
    },

    useWhen: [
      'An article proposes adding a text-matching score to a vector distance, and the reader needs to see why that sum means nothing. Here the scores are thrown away at the first step and only places survive, which is the whole point of the method.',
      'A reader expects the merged result to be led by whichever list\'s favourite is strongest. Neither favourite leads: a document that was second on both lists outscores them, because two modest shares outweigh one large one when k is 60.',
      'The prose explains what happens to a document found by only one retriever. It receives nothing from the other list, and the top result of one list lands fourth for that reason alone.',
    ],

    avoidWhen: [
      'The subject is how the two lists were produced — how the word match or the meaning match scores anything. The lists here are made-up inputs; no retrieval happens on screen.',
      'The article is about giving one source more say than the other. Both lists count equally throughout, and there is no control that changes that.',
      'The point is score normalisation — rescaling scores into a common range and then adding them. That route is not taken here; the scores are discarded rather than rescaled.',
      'The article concerns merging sorted arrays in the sense of merge sort, or merging branches in version control. The word "merge" matches and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'hybridSearch',
        note: 'This is the combining rule with both sources counted alike; the other puts an adjustable share on each source and is about which share produces the best top results.',
      },
      {
        concept: 'sameWordVsSameMeaning',
        note: 'The other explains why two retrievers return different orders in the first place; this starts from two such orders and settles how to reconcile them without trusting either one\'s scores.',
      },
      {
        concept: 'reranking',
        note: 'Both produce a new order from candidates already found, but this uses nothing except where each candidate stood, while the other re-reads the candidates themselves and scores them afresh.',
      },
    ],
  },
};
