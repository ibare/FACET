/**
 * greedy 개념 선언.
 *
 * canonical facet 은 `facet:greedy` — 회의실 하나에 회의 여덟을 넣는 활동 선택
 * 완결형이다. 시간 축 위의 막대, 고른 것만 놓이는 회의실 한 줄, `last_end` 를
 * 나타내는 세로선, 견줌 · 고름 · 건너뜀 세 카운터, 그리고 여섯 언어로 펼쳐지는
 * 코드 패널을 갖췄다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 둘과 한 묶음이다. 갈래는 이렇게 잡았다.
 *   greedy        절차 전체와 그 결과 — 정렬 한 번 + 훑기 한 번이 왜 최적인가
 *   takeBestNow   그 절차의 한 걸음 — 무엇을 보고 무엇을 하는가
 *   greedyCanFail 그 한 걸음이 빗나가는 자리 — 같은 규칙이 더 많이 쓰게 되는 입력
 * definition 의 무게중심을 각각 절차·걸음·반례에 두고, exemplarKeywords 는
 * 활동 선택 / 거스름돈 만들기 / 반례와 동적 계획법으로 갈라 겹치지 않게 했다.
 *
 * 변별어를 붙이지 않았다. 이 개념이 곧 설계 기법 "그리디" 자체이고, 같은 이름을
 * 쓰는 다른 뜻(정규식의 탐욕 일치 등)은 avoidWhen 이 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const greedyConcept: FacetConceptSource = {
  id: 'greedy',
  label: 'Greedy Method (Activity Selection)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:greedy',

  surface: {
    definition:
      'A design technique that sorts candidates on one key and scans them once, committing to each that still fits, which for interval scheduling yields a provably maximal answer.',
    exemplarKeywords: [
      'greedy algorithm',
      'activity selection',
      'interval scheduling',
      'meeting room booking',
      'non-overlapping intervals',
      'earliest finishing time first',
      'exchange argument',
      'proving a greedy rule optimal',
      'sort then sweep once',
      'fit as many tasks as possible',
    ],
  },

  briefing: {
    observable: [
      'Eight meetings are drawn as bars on one shared time axis, and the ordering step reports that they already stand in finishing-time order, so nothing visibly moves at that point.',
      'One bar runs from 0 to 6 — it starts earliest of all eight — and it is dropped, which makes the choice of key visible rather than merely asserted.',
      'Every dropped bar keeps the overlapping slice painted red, so the reason for the rejection stays on screen next to the bar.',
      'A single thick vertical line marks how far the room is booked, and it only ever moves to the right; nothing else on the screen carries state between steps.',
      'Chosen meetings drop into one room track along the bottom, where they sit end to end without touching.',
      'Three counters run under the picture — compares, picks, skips — and the compare count finishes equal to the number of meetings, one look per bar.',
      'The code panel starts empty with an Add language button; once a language is picked, the running phase highlights its line, and the whole routine turns out to carry one variable, last_end.',
    ],

    screen: {
      affordances: [
        'Play, step, pause, reset and a speed control drive one full pass; stepping is how a reader can stop on the comparison that rejects the earliest-starting meeting.',
        'The eight meetings are fixed, so an article can name a specific interval and the reader will find that bar.',
        'The code panel is empty until a language is added, and several languages can be shown side by side against the same run.',
      ],
    },

    useWhen: [
      'The prose asserts that picking the meeting that finishes earliest is the right key, and the reader has no reason to prefer it over "starts earliest" or "shortest". The bar from 0 to 6 being passed over is the case that separates the two rules.',
      'The reader believes an optimal schedule must require looking ahead or comparing whole plans. Watching a single boundary line advance, with nothing else remembered, shows how little the method actually keeps.',
      'The article puts a cost on the method and needs the reader to see where it comes from: the ordering happens once, and after that the compare counter rises exactly as many times as there are meetings.',
    ],

    avoidWhen: [
      'The article uses "greedy" for regular-expression quantifiers that match as much text as possible, or for greedy decoding in a language model. Those are unrelated senses of the word.',
      'The subject is a greedy method on graphs — shortest paths or a minimum spanning tree. Those pick over edges and maintain far more than one boundary value.',
      'The point is that a greedy rule can be wrong. Every pick here is correct, so this screen argues the opposite case.',
      'The article is about weighted scheduling — maximizing total value or profit rather than the count of jobs. The bars here carry no value, and the counted answer is how many fit.',
    ],

    contrastWith: [
      {
        concept: 'takeBestNow',
        note: 'That concept is the single decision — read only the current state, commit, never revisit; this one is that decision carried to the end of a real problem and the answer it yields.',
      },
      {
        concept: 'greedyCanFail',
        note: 'Same rule shape, opposite verdict: here the myopic choice provably reaches the best answer, there it reaches a worse one on an input chosen to break it.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'Both settle an optimization problem, but one commits to each candidate as it passes and the other keeps every partial answer around until the end.',
      },
      {
        concept: 'kruskalMst',
        note: 'The same shape on a graph — order everything by one key, then walk the list once accepting whatever is still admissible.',
      },
    ],
  },
};
