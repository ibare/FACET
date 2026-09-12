/**
 * recallSpeedTradeoff 개념 선언.
 *
 * canonical facet 은 `facet:recallSpeedTradeoff` — 조각이다. 고리 위에 자리가
 * 다섯 있고 자리마다 임자(참값)가 있다. 덜 뒤지면 임자가 자리에서 빠져나가 고리
 * 바깥에 점선 유령으로 남고, 더 먼 것이 반대쪽 호를 타고 들어와 그 자리를 메운다.
 * 둘이 같은 걸음에 서로 반대로 휘어 엇갈린다. 가운데 계기가 재현율을 재고 지난
 * 값이 눈금으로 남는다. 컨트롤은 다시 보기와 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 지는 것은 **덜 뒤지면 무엇을 놓치는가** 다. 답이 어떻게 갈리는지가
 * 주인공이고 **여는 일 자체는 전제일 뿐이다** — 평면도 칸도 뚜껑도 그리지 않는다.
 * 그래서 definition 의 주어가 "답이 무너지는 일" 이고 꼬리가 "더 먼 것이 그 자리를
 * 메운다" 로 닫힌다.
 *
 * 형제 `probeAFewCells` 는 여는 일 자체만, 완제품 `invertedFileIndex` 는 정확함과
 * 비용이 한 손잡이에 매인 것을 맡는다. 어휘도 갈라 두었다 — 이쪽은 참값 · 빠짐 ·
 * 재현율 어휘만 갖고, 가르기 · 뚜껑 · 조율 어휘는 쓰지 않는다.
 *
 * 두 조각은 같은 데이터를 쓰지만 화면이 전혀 다르다 — 저쪽은 평면과 뚜껑,
 * 이쪽은 고리와 드나듦이다. definition 도 그만큼 갈랐다.
 *
 * "재현율" 이 분류기의 recall 과, "놓침" 이 캐시 미스와 겹치므로 avoidWhen 이 그
 * 오검출을 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const recallSpeedTradeoffConcept: FacetConceptSource = {
  id: 'recallSpeedTradeoff',
  label: 'Recall Lost by Searching Less',
  domain: 'ai-engineering',
  canonicalFacet: 'facet:recallSpeedTradeoff',

  surface: {
    definition:
      'The degradation of an approximate nearest-neighbour answer as less of the data is examined: true neighbours drop out of the answer and farther items take their places.',
    exemplarKeywords: [
      'recall@k',
      'ground truth neighbours',
      'missed nearest neighbours',
      'exact results versus approximate ones',
      'false negatives in similarity retrieval',
      'a farther item takes the slot',
      'measuring retrieval quality',
      'how good is good enough for retrieval',
      'brute force baseline',
      'what approximation gives up',
    ],
  },

  briefing: {
    observable: [
      'Five seats stand on a ring, each held from the start by the item that truly belongs there, and every token carries its own coordinates, so the answer is named rather than summarised.',
      'Each widening prints what it cost beside what it bought — how much was opened out of the whole, and how many items were examined out of twenty-four.',
      'An item that loses its seat does not vanish: it settles just outside the ring as a dashed ghost still tied to the seat it left, so what is missing stays on screen and keeps its identity.',
      'The item that replaces it arrives along the opposite arc in the very same step, the two paths bowing away from each other and crossing, which makes the loss and the substitution one event rather than two.',
      'The gauge in the middle reads the share of seats still held by their owners and leaves a tick behind at each earlier value, so sixty, eighty and a hundred are readable side by side instead of recalled.',
      'The run stops as soon as the seats are all held by their owners, so the reader sees the answer become exact rather than being told that it eventually does.',
      'The three stages measure six, twelve and eighteen items and hold three, four and five of the true five, which is what makes the improvement countable rather than directional.',
    ],

    screen: {
      affordances: [
        'The sequence plays by itself from the true answer being laid out to the closing line, and then the screen waits.',
        'Two buttons: Replay, and a step control that rewinds and walks the same stages one press at a time, which is how a reader can stop on the crossing and see which item left and which one took the seat.',
        'The data, the query and the five that truly belong in the answer are fixed, so the article can name a departing item by its coordinates and quote the three percentages.',
      ],
    },

    useWhen: [
      'A system reports a quality figure for its retrieval and the reader takes it for a property of the software rather than a consequence of how much was examined. Three stages, each printing its own figure next to the amount of data it read, puts the figure back where it came from.',
      'The prose says an approximate search returns roughly the right things, and a reader hears a blur. Every emptied seat here is filled by one specific farther item with a coordinate on it, so the error has a shape.',
      'A reader needs to accept that the search cannot report its own misses — what is absent from the answer is knowable only because a full measurement was carried out alongside it, and the ghosts outside the ring are that second measurement made visible.',
      'The argument requires that losses and substitutions are the same event. Watching one item leave along one arc while another arrives along the other, in a single step, is that identity rather than an assertion of it.',
    ],

    avoidWhen: [
      'The article uses "recall" for the share of positives a classifier finds among labelled examples, or pairs it with precision. Here it is the share of the genuinely nearest items that survived into the answer.',
      'The article uses "miss" for a cache lookup that has to go to slower storage, or for a dropped packet or request.',
      'The subject is which parts of the data get searched or how the data was divided. That is a premise here, stated as an amount and never as a structure.',
      'The subject is the time or throughput an approximate search buys. What is counted here is items examined, and nothing on the screen is measured in seconds.',
      'The article is about a structure that guarantees the exact answer, or about why an exact answer is affordable. The exact answer here exists only to be fallen short of.',
    ],

    contrastWith: [
      {
        concept: 'probeAFewCells',
        note: 'Restricting the search is the claim there and a premise here; this one never says which parts were skipped, only what their absence takes out of the answer.',
      },
      {
        concept: 'invertedFileIndex',
        note: 'This is about the loss alone; that treats the loss and the saving as two readings off one setting, so the loss becomes something chosen rather than something suffered.',
      },
      {
        concept: 'knn',
        note: 'One consults every stored example and therefore cannot miss anything; this concept exists to name what is missed once that guarantee has been given up.',
      },
      {
        concept: 'spaceErrorTradeoff',
        note: 'Both measure what an approximation costs in the units of its own answer, but one overstates counts it does report, while this omits items it never reports at all.',
      },
    ],
  },
};
