/**
 * spaceErrorTradeoff 개념 선언.
 *
 * canonical facet 은 `facet:spaceErrorTradeoff` — "자리를 아끼면 무엇을 치르는가"
 * 한 주장만 말하고 멈추는 짧은 화면이다. 같은 스트림을 폭만 바꿔 세 번 센다. 줄 수는
 * 3 으로 고정하고 폭이 2 → 4 → 8 로 갈라지며, 막대가 그때마다 제자리에서 내려앉고
 * 떠난 높이는 흐린 눈금으로 남는다.
 *
 * 스스로 세 폭을 다 돌고 멈춘다. 독자가 폭을 고르는 자리는 없다 — 순서는 정해져
 * 있고, 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 말하는 것은 **한 방향의 사실 하나**다 — 자리를 줄이면 읽힌 값이 더
 * 부푼다. 손잡이가 없으므로 "어디에 쓸 것인가" 를 묻지 않고, 폭 하나만 움직여
 * 값과 오차의 관계를 단조로 보인다. 읽는 규칙의 근거는 `trustTheSmallest` 가,
 * 폭과 깊이의 배분은 `countMinSketch` 가 맡는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const spaceErrorTradeoffConcept: FacetConceptSource = {
  id: 'spaceErrorTradeoff',
  label: 'Paying for a Smaller Counter Table in Error',
  canonicalFacet: 'facet:spaceErrorTradeoff',

  surface: {
    definition:
      'The price of a compact summary of counts: the fewer counters a fixed set of keys is spread over, the more keys have to share one, and the further every value read back stands above its true count.',
    exemplarKeywords: [
      'space accuracy tradeoff',
      'memory versus accuracy',
      'how much memory does a sketch need',
      'smaller table more error',
      'approximate counting cost',
      'error grows as memory shrinks',
      'why approximate counters are worth it',
      'bounded memory counting',
      'sizing a counter table',
      'estimate inflates under crowding',
    ],
  },

  briefing: {
    observable: [
      'The same stream is counted three times over, and between the runs the table is seen splitting: each cell divides and the halves slide outward, so the table grows from very few columns to several while the rows stay as they were.',
      'Every cell carries its running total and a small filled strip whose length is that cell\'s share of the whole stream, so crowded cells are legible as a block before any number is read.',
      'A cell\'s number changes colour once it stands above the true count, which at the narrowest table is nearly every cell.',
      'One bar per key stands at the bottom against a dashed line marking the true count, with the stretch above that line filled separately — the overshoot is the visible top of the bar.',
      'When the table widens the bars slide downward and a faint tick is left behind at the height each one had before, so the earlier run stays legible on the same scale as the new one.',
      'The vertical scale for the bars is set once for the whole run and never rescaled between the three sizes, which is what makes the leftover ticks comparable.',
      'Each stage is captioned with its width, its row and column count, the resulting number of cells and how many items were counted, and after the readings a line gives the total overshoot and how many keys came back exactly right.',
      'The closing line places the two ends beside each other: the total overshoot at the smallest cell count against the total at the largest.',
      'No bar is ever seen below the dashed line at any of the three sizes.',
    ],

    screen: {
      affordances: [
        'It plays through all three table sizes by itself and stops on the closing line, so the whole comparison arrives without anything being pressed.',
        'Two buttons: Replay, and Step. Step returns to an empty board and advances one moment per press, which is how a single widening can be held still while the bars drop.',
        'The sizes shown, the keys and how often each arrives are fixed, and every count and every reading is computed from them rather than written in, so the numbers can be quoted in the text as they appear.',
        'Nothing here is set by the reader, so a comparison beyond the three sizes shown is not available.',
      ],
    },

    useWhen: [
      'The prose asks how much memory to hand an approximate counter and answers with a formula, leaving the reader to take on faith that the term in the denominator does anything. Three table sizes counting one unchanged stream, with the previous heights left behind as marks, turns that term into a distance that can be pointed at.',
      'A reader has concluded that an approximate counter is not worth using because it can be wrong. The overshoot shrinking as the table grows recasts the error as something bought back with memory rather than a defect to be tolerated.',
      'The article justifies a summary structure by the memory it saves and never names the cost. The gap between the bars and the true line at the smallest size is the cost, stated in the same units as the answer itself.',
      'Someone is about to size a counting structure by what fits comfortably rather than by how wrong the answers may be, and needs to see crowding and inflation as the same event.',
    ],

    avoidWhen: [
      'The article distinguishes what more rows buy from what more columns buy. The rows are held at one number throughout and only the columns change.',
      'The reader is meant to try sizes and reach a judgment, or to weigh one configuration against another of their own choosing. The sizes here are fixed and play in a set order.',
      'The claim needed is the read rule itself — why the lowest of the readings is the answer given. That rule is applied here but never argued.',
      'The subject is memory in another sense: cache capacity, a working set, compression ratios of exact data, or how much of a structure fits in a level of cache. What is traded here is the count of counters against how far the answers overstate.',
      'The question is membership, or how many distinct keys a stream held. Every reading here is a count for a named key.',
    ],

    contrastWith: [
      {
        concept: 'countMinSketch',
        note: 'One states a single direction with everything but the table width held still; the other treats width and depth as two purchases out of one budget and leaves the balance to be chosen.',
      },
      {
        concept: 'trustTheSmallest',
        note: 'Both concern the inflation that shared counters cause, but one argues that it can only go upward while this one measures how much of it there is at each size.',
      },
      {
        concept: 'loadFactorRehash',
        note: 'Both answer what happens as a table fills, but one grows the table to keep lookups exact, and this one keeps the table as it is and accepts overstated answers as the price of the space.',
      },
      {
        concept: 'bloomFilter',
        note: 'Both trade memory for a wrong answer in one direction only, but a filter pays in claims of presence for keys that were never added, and this pays in counts that come back too large.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'One argues that keys must share places once there are more keys than places; this takes that as given and measures what the sharing costs as the places grow scarcer.',
      },
    ],
  },
};
