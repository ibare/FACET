/**
 * stateActionReward 개념 선언.
 *
 * canonical facet 은 `facet:stateActionReward` — 2 행 × 3 열 격자에서 행위자는 정해진 정책표로 행동을 골라
 * 위 길로 넘기고, 환경은 주사위로 실제 방향을 정해 다음 자리와 상을 아래 길로 돌려준다. 같은 자리 (0,1) 에서
 * 같은 행동(오른쪽)을 두 번 넘기는데 한 번은 미끄러지고 한 번은 목표에 든다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mdp` 는 모형을 아는 계획과 손잡이 대비를, 형제 조각 `discountFuture` 는 상을 한 수로 모으는 셈을 맡는다.
 * 이쪽은 **한 번의 주고받기에서 누가 무엇을 정하는가** 하나다 — 고르는 것은 행위자, 결과는 환경.
 * definition 은 agent · environment · same action different outcome 낱말을 쥐고, value · plan · discount 를 쓰지 않는다.
 *
 * 전제: 격자 · 정책표 · 미끄러짐 확률(0.8 / 0.1 / 0.1) · 상(+10 · −1) · 주사위 다섯은 예로 정한 값이다.
 * 행위자는 배우지 않고, 상을 더하거나 할인하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stateActionRewardConcept: FacetConceptSource = {
  id: 'stateActionReward',
  label: 'State, Action, Reward (Who Decides What)',
  canonicalFacet: 'facet:stateActionReward',

  surface: {
    definition:
      'In the agent–environment loop the agent only picks an action from its current state; the environment rolls the outcome, returning next state and reward, so an identical choice can land in different places.',
    exemplarKeywords: [
      'agent and environment',
      'state action reward',
      'reinforcement learning loop',
      'transition probability',
      'stochastic environment',
      'slippery move',
      'Markov property',
      'trajectory',
      'episode ends at the goal',
      'policy as a lookup table',
      'same action different result',
    ],
  },

  briefing: {
    observable: [
      'Two boxes, Agent and Environment, joined by two lanes: "action" going to the environment and "next state · reward" coming back. The Agent box shows "Sees: (row,col)" and a policy table of five rows, such as `(0,1) → right`.',
      'The Environment holds a 2 × 3 grid with start (1,0) and goal (0,2). When an action arrives, three branches fan out from the current cell with their chances: "as meant" 0.8 and a slip to either side 0.1 each.',
      'Odd steps hand an action up; even steps roll a die and send the result back: "Die: 0.41 → as meant: up", then "Next state: (0,0) · Reward: −1". Each return adds a (state, action, reward) cell to the "Trajectory" row.',
      'At (0,1) the agent hands "right" and the die reads 0.93: "Die: 0.93 → slipped. Meant: right · Went: down", landing on (1,1) for −1.',
      'Two exchanges later the agent is back at (0,1), reads the same row and hands "right" again; the die reads 0.52 and it enters the goal: "Next state: (0,2) (goal) · Reward: +10 — the episode ends". A line reads "Same state (0,1) and same action right as before — then: (1,1) · now: (0,2)" and both trajectory cells light up together.',
      'The run ends with "Actions handed: 5 · Slips: 1". Every move except entering the goal costs −1; no wall is hit and (1,2) is never visited.',
      'The grid, policy table, slip chances, rewards and the five dice (0.41 · 0.66 · 0.93 · 0.27 · 0.52) are example values. The policy is fixed and nothing is learned; rewards are listed, never summed.',
    ],

    screen: {
      affordances: [
        'The screen plays the five exchanges by itself, half an exchange per step, and stops when the goal is entered.',
        'A Replay button and a playback strip sit below. Dragging the strip back to the slip at (0,1) and then forward to the last step puts the two outcomes of the same choice side by side.',
        'Every die and outcome is fixed, so an article can quote "Die: 0.93" or the final "Slips: 1" exactly.',
      ],
    },

    useWhen: [
      'The article defines the pieces of a reinforcement learning problem and needs the reader to see which side owns which: the agent chooses, the environment decides where that choice lands and what it pays.',
      'The reader assumes a good policy guarantees a good result; the same state and the same action here lead once to a slip and once to the goal.',
      'The Markov property needs a concrete meaning: the next state depends on the current state, the action and chance, not on the path that led there.',
    ],

    avoidWhen: [
      'The subject is how the agent improves its choices. The policy table is fixed from start to finish.',
      'The article is about adding rewards into a return or discounting them. Rewards are only recorded here.',
      'The point is a multi-agent or adversarial setting. There is one agent and one environment.',
    ],

    contrastWith: [
      {
        concept: 'mdp',
        note: 'A single exchange shows who decides what; solving the process means using the whole transition model to find the best action everywhere.',
      },
      {
        concept: 'discountFuture',
        note: 'The loop produces a sequence of rewards; discounting is the separate rule for collapsing that sequence into one number.',
      },
      {
        concept: 'valueOfAction',
        note: 'In the bare loop an action is only handed over and its outcome recorded; an action value is what an agent builds when it starts scoring those outcomes.',
      },
    ],
  },
};
