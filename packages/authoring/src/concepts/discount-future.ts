/**
 * discountFuture 개념 선언.
 *
 * canonical facet 은 `facet:discountFuture` — 앞으로 받을 상 여섯(2 · 0 · 3 · 0 · 0 · 10)이 줄지어 있고,
 * 걸음마다 하나가 "지금" 자리로 당겨 오며 γ^k(γ = 0.8)만큼 줄어 할인 합 기둥에, 제 크기 그대로 날 합 기둥에
 * 쌓인다. 끝에 날 합 15 · 할인 합 7.20. 격자도 행동도 없다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mdp` 는 γ 가 미끄러짐과 맞서 길을 바꾸는 대비를, 형제 조각 `stateActionReward` 는 주고받기 한 번을 맡는다.
 * 이쪽은 **상의 줄 하나를 한 수로 모으는 셈** 하나다. definition 은 γ^k · return · raw total · distant reward 를
 * 쥐고, route · agent · environment · policy 를 쓰지 않는다.
 *
 * 전제: 상 여섯과 γ = 0.8 은 예로 정한 값이다. 셈은 실수로 쌓고 화면은 소수 둘째 자리로 보인다(γ³ = 0.512, 할인 합 7.1968).
 * γ 를 바꾸는 손잡이는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const discountFutureConcept: FacetConceptSource = {
  id: 'discountFuture',
  label: 'Discounting Future Rewards (γ to the Power k)',
  canonicalFacet: 'facet:discountFuture',

  surface: {
    definition:
      'A reward arriving k steps ahead counts γ^k of its size in the discounted return, so the sum falls below the raw total and the most distant reward loses the largest share.',
    exemplarKeywords: [
      'discount factor',
      'gamma',
      'discounted return',
      'G_t = r + γr + γ²r',
      'present value of future rewards',
      'raw sum vs discounted sum',
      'short-sighted vs far-sighted agent',
      'why discount future rewards',
      'geometric weighting',
      'time preference',
    ],
  },

  briefing: {
    observable: [
      'A row of six future rewards, 2 · 0 · 3 · 0 · 0 · 10, labelled k = 0 to k = 5, with a "Now" place on the left and two columns, "Raw sum" and "Discounted". The header reads "Rewards ahead: 6" and "γ: 0.80".',
      'Each step pulls one reward to Now. On the way a filled piece shrinks by γ once per step travelled and stacks on Discounted, while an outlined copy of full size stacks on Raw sum. The cell it left keeps its weight and arrival, such as "× 0.64" and "→ 1.92".',
      'The status line reads "Reward: 3 · k: 2 · γ^k: 0.64 · Value now: 1.92". For zero rewards it adds "Discounted sum unchanged: 3.92" — the weight keeps shrinking but nothing arrives.',
      'The last reward, 10 at k = 5, arrives as 3.28: "Share of its size kept: 32.8%". The run ends with Raw sum 15 against Discounted 7.20.',
      'The largest reward is the farthest one, so it accounts for most of the gap between the two columns.',
      'The rewards and γ = 0.8 are example values. Sums are accumulated at full precision and shown to two decimals, so 7.20 is 7.1968 rounded rather than a re-multiplication of the shown weights 0.51 and 0.33. There is no grid, no action and no handle for γ.',
    ],

    screen: {
      affordances: [
        'The screen pulls the six rewards in one by one on its own, seven steps including the start, and stops with both columns filled.',
        'A Replay button and a playback strip sit below. Dragging back to k = 5 holds the moment the 10 arrives as 3.28 beside the raw 15.',
        'All numbers are fixed, so an article can quote "× 0.64", "32.8%" or the final 15 against 7.20 as they appear.',
      ],
    },

    useWhen: [
      'The article writes the return as a sum of rewards multiplied by powers of γ and the reader needs to see each term shrink with its distance before trusting the formula.',
      'A reader asks why a reinforcement learning agent does not simply add up all future rewards; the two columns ending at 15 and 7.20 answer how much the distant ones are cut.',
    ],

    avoidWhen: [
      'The subject is choosing γ for a task or how γ changes the best policy. γ is fixed here and nothing is chosen.',
      'The article is about discounting cash flows or interest rates in finance. The weighting is the same shape, but the screen is labelled in rewards and steps.',
      'The point is how values are learned from experience. The rewards are all known in advance and simply summed.',
    ],

    contrastWith: [
      {
        concept: 'mdp',
        note: 'Discounting is a fixed weight on a known list of rewards; in planning the same weight trades off against risk and changes which route is best.',
      },
      {
        concept: 'stateActionReward',
        note: 'The interaction loop is what generates rewards one at a time; discounting only concerns how they are combined afterwards.',
      },
      {
        concept: 'valueOfAction',
        note: 'Discounting a known list raises γ to the power of each distance at once; in an action-value update γ is applied once per update and the powers build up over repeated rounds.',
      },
    ],
  },
};
