/**
 * valueOfAction 개념 선언.
 *
 * canonical facet 은 `facet:valueOfAction` — 복도 다섯 칸(구덩이 −8 · s0 · s1 · s2 · 목표 +8)의 가운데 세 자리에
 * 선택 둘(왼쪽 · 오른쪽)마다 값 막대 하나, 모두 여섯이 0 에서 시작한다. 정해진 네 판의 선택 차례를 따라 갱신 열 번
 * (α 0.5 · γ 0.9)이 일어나고, 상의 소식이 판 하나에 한 자리씩 거슬러 와 판 4 에 출발 자리 s0 에 닿는다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `qLearning` 은 ε 을 돌려 큰 상을 알아내는 행위자 수를 견주는 전체를, 형제 조각 `exploreVsExploit` 은
 * 무엇을 고를지의 결정을 맡는다. 이쪽은 **선택이 주어졌을 때 그 선택의 값이 어떻게 채워지는가** 하나다.
 * definition 은 state-action pair · target · halfway · one state per episode 를 쥐고, explore · ε · agents ·
 * probability 를 쓰지 않는다.
 *
 * 전제: 복도 · 상 ±8 · α 0.5 · γ 0.9 · 판 넷과 선택 차례는 예로 정한 값이다. 미끄러짐은 없다.
 * 끝 칸이 다음 자리면 "다음 자리의 가장 큰 값" 은 0 으로 친다. 판을 더 돌리면 값은 계속 자란다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const valueOfActionConcept: FacetConceptSource = {
  id: 'valueOfAction',
  label: 'Action Value Q(s, a) and How It Fills In',
  canonicalFacet: 'facet:valueOfAction',

  surface: {
    definition:
      'Each state-action pair keeps its own value, moved partway toward reward plus the discounted best next value after every step, so news of an end reward travels back one state per episode.',
    exemplarKeywords: [
      'Q-value',
      'Q(s, a)',
      'action-value function',
      'temporal difference update',
      'TD target',
      'bootstrapping',
      'reward propagates backwards',
      'learning rate alpha',
      'max over next actions',
      'Bellman update',
      'credit assignment for delayed reward',
    ],
  },

  briefing: {
    observable: [
      'A five-cell corridor: "Pit" (−8) at the left end, "Goal" (+8) at the right end, and s0 · s1 · s2 between them. Each of the three middle places carries two value bars, left and right, all six starting at 0.00 — "Start · every value: 0.00".',
      'Each step updates one move. A small marker leaves the cell just entered and travels back to the cell just left, carrying the target, and the status shows the arithmetic: "Target = reward + γ × best next value: 8 + 0.90 × 0.00 = 8.00", then "Value (s2, right): 6.00 + 0.50 × (8.00 − 6.00) = 7.00". The bar moves only halfway to the target.',
      'Round 1 goes left from s0 into the pit and sets (s0, left) to −4.00. Round 2 goes right three times: the first two updates read 0.00 → 0.00 because the next place still holds nothing, and only the last sets (s2, right) to 4.00.',
      'Round 3 brings s2\'s value back to (s1, right) = 1.80; round 4 brings s1\'s value back to (s0, right) = 0.81. The reward\'s news moves back by exactly one place per round.',
      'At the end s0 holds −4.00 for left and 0.81 for right; s1 holds 0.00 / 3.60 and s2 0.00 / 7.00, each larger side marked "larger". The counter reads "Updates: 10" with seven of them changing a value.',
      'The corridor, ±8 rewards, α 0.5, γ 0.9, four rounds and the order of choices are example values; there is no slipping. The choices are given — how they were picked is not part of the picture. More rounds would keep the values growing toward their true size.',
    ],

    screen: {
      affordances: [
        'The screen plays the ten updates by itself, eleven steps including the start, and stops after round 4.',
        'A Replay button and a playback strip sit below. Dragging back into round 2 shows the updates that change nothing, the moment before the news has arrived.',
        'The corridor and all values are fixed, so an article can quote the 0.81 at s0 or the full update line exactly.',
      ],
    },

    useWhen: [
      'The article explains why values are attached to state-action pairs rather than to states alone: s0 ends with −4.00 for one choice and 0.81 for the other.',
      'The reader needs to see a temporal-difference update as arithmetic — target, current value, a step of α toward it — with every number printed.',
      'A reader asks how a reward that only appears at the end ever reaches the first choice; the updates that stay at 0.00 until the next place has a value show why it takes one round per place.',
    ],

    avoidWhen: [
      'The subject is how the agent decides which action to take. The sequence of choices is given in advance.',
      'The article is about neural-network function approximation for values. The six values here are a table.',
      'The point is summing a known list of future rewards with powers of γ. Here γ is applied once per update.',
    ],

    contrastWith: [
      {
        concept: 'qLearning',
        note: 'The update fills in values for whatever choices were made; Q-learning also decides which choices to make, and so decides which values get filled in at all.',
      },
      {
        concept: 'discountFuture',
        note: 'Discounting a known list applies γ^k in one step; an action-value update applies γ once and lets repeated rounds build up the powers.',
      },
      {
        concept: 'exploreVsExploit',
        note: 'Filling in a value and choosing by value are separate steps; this is only the first.',
      },
    ],
  },
};
