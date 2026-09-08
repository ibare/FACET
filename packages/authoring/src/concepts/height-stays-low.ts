/**
 * heightStaysLow 개념 선언.
 *
 * canonical facet 은 `facet:heightStaysLow` — 자식 수가 다른 두 나무(×2 와
 * ×100)를 사다리 두 줄로 세워 두고, 같은 백만 장의 잎에 닿기까지 각자 몇 층을
 * 내려가는지를 층마다 세어 보이고 멈춘다.
 *
 * 스스로 재생하고 멈추는 화면이다. 재생이 끝나면 한 걸음 버튼으로 층을 하나씩
 * 다시 짚는다.
 *
 * 변별어를 붙인 이유: "높이" 는 균형·회전·깊이 등 여러 주장에 얹히는 말이다.
 * 이 개념이 말하는 것은 자식 수가 층수를 정한다는 결과 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const heightStaysLowConcept: FacetConceptSource = {
  id: 'heightStaysLow',
  label: 'Branching Factor and Tree Height',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:heightStaysLow',

  surface: {
    definition:
      'The relation between how many children a node has and how many levels a tree needs: each level multiplies the leaves reachable by that number.',
    exemplarKeywords: [
      'branching factor',
      'fan-out',
      'tree height',
      'logarithmic depth',
      'levels to reach a million',
      'shallow tree',
      'index depth',
      'disk reads per lookup',
      'why B-trees are wide',
    ],
  },

  briefing: {
    observable: [
      'Two ladders stand side by side, one headed ×2 and the other ×100, and one is 21 rungs long while the other is 4 — the gap is visible before anything moves.',
      'Both descend a level at a time together, and every row prints how many leaves that depth reaches: 1, 2, 4, 8 on one side against 1, 100, 10,000 on the other, with a bar beside the number growing as it goes.',
      'The wide ladder passes the million on its fourth row and is marked as done there, while the narrow one carries on alone for seventeen more rows to get past the same number.',
      'The row where the narrow ladder finally arrives reads 1,048,576 — it overshoots, because doubling cannot land on the target exactly.',
      'The closing line puts the two level counts together, the same leaves covered by walks of very different length.',
    ],

    screen: {
      affordances: [
        'It counts down both ladders on its own and stops on the comparison. The target, one million leaves, is stated above the ladders from the start.',
        'Two buttons: Replay, and Step to descend one level at a time. Stepping is the only way to sit on the early rows, where 2, 4, 8 still looks like progress.',
        'The numbers are computed rather than quoted — the ladders are as long as the multiplication makes them, 21 rungs and 4.',
      ],
    },

    useWhen: [
      'The article is about to state that an index over a million records is only a handful of levels deep, and the reader will hear that as rounding. Twenty-one rungs standing next to four fixes the size of the gap.',
      'A cost is being counted in levels touched rather than in records held — one level per fetch — and the reader has to see that the number of children, not the amount of data, is what sets that count.',
    ],

    avoidWhen: [
      'The subject is what a node contains or how a walk picks its way down — keys, comparisons, gaps between keys. No key is drawn here; only levels are counted.',
      'The article is about how a tree comes to have that shape: insertion, splitting, rebalancing. The branching factor is given here, not earned.',
      'The point is a range scan along the bottom row of a B+Tree. Only the walk from the top down to a leaf is counted here.',
      'The subject is time — milliseconds per read, cache versus disk latency, throughput. The ladders count levels and never convert them into a duration.',
    ],

    contrastWith: [
      {
        concept: 'depthDoublesCount',
        note: 'Both turn a level into a multiplication, but one stays with doubling and this one sets doubling against a hundredfold to show what the multiplier is worth.',
      },
      {
        concept: 'bTree',
        note: 'This is the payoff stated in levels; the structure itself is what maintains a wide node so the payoff holds while keys are added and removed.',
      },
      {
        concept: 'heightBalanceCheck',
        note: 'Two ways a tree ends up short: one measures whether a node has drifted out of shape, and this one shows the height that wide branching gives before any repair is needed.',
      },
    ],
  },
};
