/**
 * countMinSketch 개념 선언.
 *
 * canonical facet 은 `facet:countMinSketch` — 완결형이다. 위에 줄 × 칸의 표가
 * 있고 아래에 키 열둘의 막대가 있으며, 손잡이 둘(폭 w 4·6·8·12·16, 깊이 d 1·2·3·4)
 * 과 계기 넷(칸 · 올린 횟수 · 부푼 양 · 정확히 맞은 키), 여섯 언어로 펼쳐지는
 * 코드 패널이 딸려 있다. 한 판이 끝나면 손잡이를 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **표를 얼마나 크게, 그리고 어느 쪽으로 크게 잡을 것인가** 를 맡는다.
 * 칸 수는 폭 × 깊이인데 둘이 하는 일이 같지 않다는 것, 그래서 같은 칸 수를 어디에
 * 쓸지가 독자의 선택이라는 것이 무게중심이다.
 *
 * 조각 `trustTheSmallest` 는 읽는 규칙 하나(왜 최솟값인가)만, 조각
 * `spaceErrorTradeoff` 는 한 방향의 사실 하나(좁히면 더 부푼다)만 말한다. 셋이 다
 * "자리와 오차" 를 다루므로 definition 을 일부러 갈랐다 — 이쪽은 **두 손잡이의
 * 배분**, 조각 하나는 **읽는 규칙의 근거**, 다른 하나는 **좁힘 → 부풂의 단조성**이다.
 * keywords 도 이쪽은 크기 잡기 · ε/δ · 응용 어휘를, 조각들은 각각 최솟값 추정
 * 어휘 · 메모리 대 정확도 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const countMinSketchConcept: FacetConceptSource = {
  id: 'countMinSketch',
  label: 'Count-Min Sketch (Sizing a Counter Table Against Its Error)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:countMinSketch',

  surface: {
    definition:
      'A Count-Min Sketch estimates key frequencies from a table of hash rows by counter columns, where the choice of width against depth splits one cell budget between avoiding collisions and surviving them.',
    exemplarKeywords: [
      'count-min sketch',
      'CMS',
      'frequency estimation',
      'sketch data structure',
      'heavy hitters',
      'top-k queries',
      'counting a stream',
      'width and depth',
      'epsilon and delta',
      'sizing a sketch',
      'sublinear counting',
      'approximate counters',
      'how many times has this key been seen',
      'telemetry counts without storing every key',
    ],
  },

  briefing: {
    observable: [
      'The table on top carries a number in every cell and a row tag down the left side, and the row of bars below carries one bar per key with the key name printed under it.',
      'A bar rises to the value the sketch reports, a dashed tick marks the true count on the same bar, and the stretch above the tick is filled in a separate colour named in the legend as overshoot.',
      'The vertical ruler under the bars is the same on every run, so when a setting changes the bars are seen dropping on a scale that did not move with them.',
      'Counting lights one cell per row for the key being added, then raises those cells one at a time; reading lights the same cells again and then marks a single one of them as the answer, and the caption gives that smallest reading as a number.',
      'The closing line of each run reports width, depth, the resulting cell count, the total overshoot and how many of the twelve keys came back exactly right, and the four counters along the bottom carry the same values for the run in progress rather than accumulating across runs.',
      'The number of bumped cells reported for a run is the key count multiplied by the depth, which is what makes the depth setting visible as work as well as accuracy.',
      'With depth set to 1 the answer comes from a single row and there is nothing to take a smallest of, and with width at its narrowest the counts stay high for almost every key.',
      'When a run ends the caption asks for width or depth to be moved, and the same twelve keys are counted again from zero rather than continuing.',
      'The code panel highlights the line matching the current step as the run plays.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. The first run starts on mount and plays through counting, reading and the closing line.',
        'Two segmented sliders sit beside the playback controls — width over 4, 6, 8, 12 and 16, and depth over 1, 2, 3 and 4 — and moving either one starts the whole count again at the new setting.',
        'Comparing two settings means reading the closing line and the bar heights after each run, because only one setting is on screen at a time.',
        'Holding the cell count roughly fixed while trading the two sliders against each other — width 16 with depth 1 against width 4 with depth 4 — is how the two can be weighed against one another.',
        'The keys and their frequencies are fixed and every number on screen is computed from them, so the values can be quoted in the text exactly as they appear.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article hands over the sizing formulas — width from a target error rate, depth from a target failure probability — and a reader has no sense of what moving either one buys. Counting the same twelve keys again at a new setting, against a ruler that does not move with the bars, turns two symbols into two separable effects.',
      'The prose treats memory and accuracy as one dial when this structure offers two. A tall narrow table and a short wide one can hold nearly the same number of counters and still answer differently, and that is the fact a reader has to see before the shape of a sketch looks like a decision.',
      'A reader suspects the estimate is a guess that could land anywhere. Every bar standing on or above its own true mark, at every setting tried, fixes the error as inflation with a known direction rather than noise.',
    ],

    avoidWhen: [
      'The question is membership — has this key appeared at all — rather than how often. Every answer here is a number, and nothing on screen reduces to yes or no.',
      'The subject is how many distinct keys a stream contained. The keys are known in advance here and each one is asked about by name.',
      'The article needs quantiles, medians or the shape of a distribution of values. What is summarised here is how often each key arrived, not the spread of any measurement.',
      'The point is the read rule on its own — why the smallest of the readings is the one to answer with. Running the whole structure at several sizes carries much more than that single claim.',
      'The article is about exact counting where every key owns a counter, or about a hash table that keeps keys apart so lookups stay exact. Sharing counters is the premise here, not a failure.',
      'The word "sketch" refers to a drawing, a wireframe or a rough draft.',
    ],

    contrastWith: [
      {
        concept: 'trustTheSmallest',
        note: 'One establishes the read rule and its justification; this one takes that rule as settled and asks how large, and in which direction, the table it reads from should be.',
      },
      {
        concept: 'spaceErrorTradeoff',
        note: 'Both weigh space against error, but that one states a single direction with the rows held fixed, while this one treats width and depth as two different purchases out of the same budget.',
      },
      {
        concept: 'bloomFilter',
        note: 'Both spend one small table on far more keys than it has room for, and both hash a key several ways, but a filter answers whether a key was ever present and this answers how many times it arrived.',
      },
      {
        concept: 'hyperloglog',
        note: 'Both summarise a stream in far less space than the stream itself, but one answers how many different keys appeared and this one answers how often a named key did.',
      },
      {
        concept: 'hashTableChaining',
        note: 'Both accept that keys collide, but a table keeps colliding keys separate so a lookup stays exact, while this one lets their counts merge and pays for it in overstatement.',
      },
    ],
  },
};
