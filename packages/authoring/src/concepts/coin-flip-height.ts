/**
 * coinFlipHeight 개념 선언.
 *
 * canonical facet 은 `facet:coinFlipHeight` — 조각이다. 값 열둘이 차례로 들어오며
 * 각자 동전을 던지고, 앞면이 이어지는 동안 블록이 한 칸씩 밀려 올라간다. 뒷면이
 * 나오면 그 기둥은 거기서 멈춘다. 마지막에 층을 왼쪽으로 모아 12 · 6 · 3 을 재고,
 * 짧은 층이 끝나는 자리에서 점선을 내려 그어 그것이 아래 층을 반으로 가르는지 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **높이가 정해지는 방식** 이다 — 값도 아니고 지금까지
 * 쌓인 모양도 아니고 동전뿐이라는 것, 그리고 앞면 확률 1/2 이 층마다 절반을
 * 남긴다는 것. definition 의 주어가 "몇 층까지 서는가를 정하는 일" 이고, keywords
 * 는 생성·확률 어휘만 갖는다. 탐색 경로 어휘는 조각 `skipALayer` 가, 규모에 따른
 * 비용 어휘는 완제품 `skipList` 가 가져간다.
 *
 * 찾는 장면은 이 화면에 없으므로 avoidWhen 이 그 자리를 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const coinFlipHeightConcept: FacetConceptSource = {
  id: 'coinFlipHeight',
  label: 'A Coin Decides How High a Node Stands',
  canonicalFacet: 'facet:coinFlipHeight',

  surface: {
    definition:
      'Deciding how many levels a value stands on by flipping a coin until it comes up tails, which leaves every level holding about half of the level beneath it.',
    exemplarKeywords: [
      'coin flip decides the height',
      'promote with probability one half',
      'geometric distribution of heights',
      'randomized instead of maintained',
      'each level keeps about half',
      'no rotation and no rebalancing',
      'expected height of a node',
      'randomness does the balancing',
      'a shape nobody manages',
      'why one half is the right probability',
    ],
  },

  briefing: {
    observable: [
      'Each value throws its own coins on a row above the towers. The discs spin before they settle, and a head settles into the accent colour while a tail stays plain, so the run of heads is countable after the fact.',
      'Heads push blocks upward: the first block rises from below the baseline, and every further one rises out of the block underneath it. Promoted blocks carry the same colour as a head, which ties the height back to the throws that produced it.',
      'The caption names the count of heads and the resulting height for each value, and the first tail ends that tower — no further coins are thrown for it, so the length of the run is what is being decided.',
      'Nothing about the value or about the towers already standing enters into it. Neighbouring values get wildly different heights, and a tall one can stand next to four short ones.',
      'Five of the twelve stop at a single block and the tallest reach three, so the shape is uneven up close while still being even in the aggregate.',
      'Then every level slides left to a common starting position and a count appears at the end of each row — 12, 6 and 3.',
      'A dashed line drops from where each shorter row ends, and it lands in the middle of the row below. Halving is shown as a position on screen rather than asserted as arithmetic.',
      'The closing caption credits the coin rather than any rule, which is the whole claim in one line.',
    ],

    screen: {
      affordances: [
        'The run plays once by itself — twelve towers, then the levels lining up and being measured, then the guide lines — and stops there.',
        'Two buttons: Replay, and a step control. The first press rewinds and raises the first tower; each further press takes one more value, which is how a reader can stop on a tower while its coins are still readable.',
        'The throws are fixed data rather than drawn live, so the counts are always 12, 6 and 3 and an article can name them. For the same reason a reader pressing Replay sees the same draw again.',
      ],
    },

    useWhen: [
      'The article has said randomness can take over the work of keeping a shape in order, and the reader needs to know precisely what is random: one coin per value, thrown until it fails, with neither the value nor the existing arrangement having any say.',
      'A reader is being asked to believe that a level ends up holding about half of the one below it although nobody counted or intervened. The dashed line coming down onto the middle of the row beneath is that claim in the form of a position.',
    ],

    avoidWhen: [
      'The subject is what the levels are for — how a lookup climbs down through them or what they save. Nothing is searched for here; the run ends once the towers are standing and measured.',
      'The article needs the general case rather than one favourable draw. This sequence of throws halves exactly, 12 to 6 to 3, and a draw is under no obligation to be that tidy.',
      'The point is the generator behind the randomness: its seed, its period, whether it is fair. The throws are fixed data here and nothing is generated while the run plays.',
      'The article uses a coin flip as an image for an arbitrary choice between two options. What matters here is not one throw but how long a run of heads lasts before it ends.',
      'The subject is a randomized choice that changes what answer comes back — a sampled estimate, an approximate count. The randomness here settles the shape only; nothing about it makes an answer less exact.',
    ],

    contrastWith: [
      {
        concept: 'skipList',
        note: 'One is the rule that produces the shape; the other is the claim that a shape produced this way is as cheap to search as one that is deliberately maintained.',
      },
      {
        concept: 'skipALayer',
        note: 'The making and the spending of the same levels: one decides how high each value reaches, the other is what a lookup does with the levels once they are there.',
      },
      {
        concept: 'rotateToBalance',
        note: 'Two answers to the same problem of shape: a corrective move applied wherever a rule was broken, against a rule that never looks at the shape it is producing.',
      },
      {
        concept: 'heightBalanceCheck',
        note: 'One measures the shape and judges it against a bound; here nothing measures and nothing judges, and the levels still come out even.',
      },
      {
        concept: 'heightStaysLow',
        note: 'Both are about why a structure does not get tall, but one counts what each level can hold as a matter of arithmetic while this one gets the same thinning out of a probability.',
      },
    ],
  },
};
