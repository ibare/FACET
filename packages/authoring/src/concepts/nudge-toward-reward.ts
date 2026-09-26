/**
 * nudgeTowardReward 개념 선언.
 *
 * canonical facet 은 `facet:nudgeTowardReward` — 세 행동(왼쪽 · 곧장 · 오른쪽)의 선호 θ 와 그 softmax 확률 π 만 가진
 * 행위자가 다섯 판을 돈다. 홀수 걸음에 주사위 u 가 확률 띠 위로 떨어져 행동 하나가 뽑히고, 짝수 걸음에 뽑힌 몫의
 * 경계가 상의 부호대로 미끄러진다. 오른쪽의 확률이 0.33 에서 0.83 으로 밀린다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `policyGradient` 는 여러 행위자 · 여러 판에서 기준값과 상 옮기기를 돌리는 대비를 쥔다. 이쪽은 **한 번 뽑고
 * 한 번 미는 장면** 하나다 — 값을 두지 않는 행위자가 받은 상으로 무엇을 고치는가. definition 은 draws one action ·
 * sign of the reward · share 를 쥐고, baseline · constant · lock onto · agents 를 쓰지 않는다.
 *
 * 전제: 상(−1 · 0 · +2) · α 0.5 · θ 처음 0 · 판 다섯 · 주사위는 예로 정한 값이다. 한 판이 한 걸음이라 G = r 이다.
 * 기준값은 두지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nudgeTowardRewardConcept: FacetConceptSource = {
  id: 'nudgeTowardReward',
  label: 'Nudging an Action Probability by Its Reward',
  canonicalFacet: 'facet:nudgeTowardReward',

  surface: {
    definition:
      'An agent holding only action probabilities draws one action, then enlarges or shrinks that action\'s softmax share according to the sign of the reward it received, with no value estimates at all.',
    exemplarKeywords: [
      'policy gradient update',
      'log-probability gradient',
      'stochastic policy',
      'softmax preferences',
      'θ and π',
      'reinforce the chosen action',
      'reward sign',
      'zero reward changes nothing',
      'sampling is exploration',
      'learning without a value function',
    ],
  },

  briefing: {
    observable: [
      'Two readouts, "Preference θ" and "Probability π", for three actions — left, straight, right — start at 0.00 each and 0.33 each. A band of total length 1 is divided among the three actions by their probabilities, and five slots "Round 1" to "Round 5" wait below.',
      'On odd steps a die u falls onto the band; the band\'s boundaries are the cumulative probabilities, so the action whose share u lands in is drawn: "Round 1 · die 0.83 → right · reward: +2".',
      'On even steps the boundaries slide, with a dashed line marking where they were: "Pushed up. right: 0.33 → 0.58". The band\'s length does not change, so what the drawn action gains the others give up.',
      'Round 2 draws left for −1: "Pushed down. left: 0.21 → 0.12". Round 3 draws straight for 0: "Not pushed (reward: 0). straight: 0.21 → 0.21" — neither θ nor π moves.',
      'After five rounds θ reads −0.94 · −0.57 · 1.51 and π reads 0.07 · 0.10 · 0.83. The agent never read a reward table; the rewards appear only in the round slots as they are received.',
      'When left is pushed down, its lost share goes mostly to right, whose π is already large; straight barely changes. What is shown is the drawn action moving with the reward\'s sign, not every other action rising.',
      'The rewards (left −1 · straight 0 · right +2), α 0.5, starting θ of 0, five rounds and the dice are example values. Each round is one action, so the return equals the reward; no baseline is subtracted.',
    ],

    screen: {
      affordances: [
        'The screen plays five rounds by itself, a draw and a push per round, eleven steps including the start.',
        'A Replay button and a playback strip sit below. Dragging back to round 3 shows the draw with reward 0 that moves nothing.',
        'All dice and rewards are fixed, so an article can quote "right: 0.77 → 0.83" or the final π exactly.',
      ],
    },

    useWhen: [
      'The article introduces policy gradient methods and needs the reader to see an agent that learns without estimating any value — only the probability of the action it drew moves.',
      'The reader expects every reward to change something; a reward of 0 here leaves θ and π untouched.',
      'The article explains why a stochastic policy needs no separate exploration rule: a 0.12 share can still be drawn.',
    ],

    avoidWhen: [
      'The subject is the baseline, variance, or what happens when all rewards are positive. No baseline is used and the run is five draws long.',
      'The article is about temperature or reshaping a probability distribution at sampling time. Here the probabilities are changed by rewards, not by a dial.',
      'The point is choosing the action with the largest estimated value. No values are kept.',
    ],

    contrastWith: [
      {
        concept: 'policyGradient',
        note: 'A single nudge follows the reward\'s sign; whether many nudges converge on the best action depends on what reference the reward is compared with.',
      },
      {
        concept: 'exploreVsExploit',
        note: 'A value-keeping chooser must be told to explore; a chooser that keeps probabilities explores every time it draws.',
      },
      {
        concept: 'flattenOrSharpen',
        note: 'Both change a softmax distribution, but temperature reshapes all shares at once without changing their order, while a reward moves one action\'s share and can change the order.',
      },
    ],
  },
};
