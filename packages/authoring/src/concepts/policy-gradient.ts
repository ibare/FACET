/**
 * policyGradient 개념 선언.
 *
 * canonical facet 은 `facet:policyGradient` — 행동 셋(a1 · a2 · a3, 상 0 · 3 · −1)에 대한 점수 θ 만 가진 행위자
 * 다섯이 판 30 동안 REINFORCE 로 확률을 민다. 손잡이 둘 — 기준값(없음 · 평균 상) 과 상에 더한 값(0 · +3) — 을
 * 돌리면, 기준값 없이 +3 을 더했을 때만 뽑힌 행동이 늘 올라 한 행위자가 a1 에 몰린다. 평균 상을 빼면 다시 모두 a2.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `nudgeTowardReward` 는 한 행위자가 상의 부호대로 뽑힌 행동의 확률을 미는 한 장면이다. 이쪽은 그 밀기를
 * 여러 행위자 · 여러 판에 걸고 **상을 모두 옮기면 왜 헤매고 평균을 빼면 왜 제자리를 찾는가** 라는 대비를 쥔다.
 * definition 은 baseline · constant added to every reward · lock onto a worse action · subtract the mean 을 쥐고,
 * 조각의 sign of the reward · one draw · share 를 쓰지 않는다.
 *
 * 전제 (설명 글 `policyGradient.md`):
 *  - 행동 셋 · 상 · α 0.3 · 판 30 · θ 처음 0 은 예로 정한 값이다. 기준값을 "지금까지의 평균 상" 으로 둔 것은 단순화다.
 *  - 보이는 다섯은 행위자 이백에서 네 조합 모두 이백의 비율과 맞는 첫 묶음을 고른 것이다
 *    (없음 · +3 에서 딴 행동에 몰린 행위자 42/200, 나머지 조합 0/200).
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const policyGradientConcept: FacetConceptSource = {
  id: 'policyGradient',
  label: 'Policy Gradient and the Baseline (REINFORCE)',
  canonicalFacet: 'facet:policyGradient',

  surface: {
    definition:
      'In REINFORCE, adding a constant to every reward keeps the best action best yet lets agents without a baseline lock onto a worse one; subtracting the mean reward restores learning.',
    exemplarKeywords: [
      'policy gradient',
      'REINFORCE',
      'baseline',
      'advantage',
      'G − b',
      'variance reduction',
      'softmax policy',
      'reward shifting',
      'all rewards positive',
      'policy converges to a suboptimal action',
      'rich-get-richer',
      'actor-critic motivation',
    ],
  },

  briefing: {
    observable: [
      'On the left an "Environment" table lists the reward for each action: a1 0, a2 3, a3 −1, with a "G" column that includes whatever has been added to every reward. The agents never read it.',
      'On the right five rows, Agent 1 to Agent 5, each hold three probability bars for a1 · a2 · a3 and nothing else. Each episode every agent draws once (a triangle marks the drawn action), and "G − b" under it shows the reward minus the baseline, such as "G − b +3.00".',
      'Positive G − b raises the drawn bar and the other two give up the same amount; negative lowers it. Only the tallest bar is coloured — accent if it is a2, red if another action leads — and a tie, as at the start with three 1/3 bars, colours nothing. "a2 leads" appears beside rows where a2 is tallest.',
      'Status lines read "Episode 12/30 · a2 leads 5/5 · another action leads 0/5". Readouts under the controls count Episode, Best action leads and Another action leads.',
      'With no baseline and +3 added, every reward is 0 or more (a1 3 · a2 6 · a3 2), so whatever is drawn rises, in every episode for every agent. An agent that drew a1 often early keeps pushing it: one of the five ends at π(a1) 0.97.',
      'With the mean reward as baseline, G − b means "better than so far?", and all five end with a2 leading whether or not +3 is added; with the mean baseline and +3, a drawn action is pushed down in twelve agent-episodes. With no baseline and nothing added, all five also end on a2 (average π(a2) 0.97).',
      'The three actions, rewards, α 0.3, 30 episodes and starting θ of 0 are example values, and a running mean of past rewards stands in for a learned value baseline. The five agents were chosen from two hundred so their outcomes match the larger count: with no baseline and +3, 42 of 200 settle on a worse action; in the other three settings none do.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Baseline" with None · Mean reward (starts at None) and "Added to reward" with 0 · +3 (starts at 0). Turning either restarts all five agents from equal probabilities; a round is 32 steps — start, 30 episodes, and a final reading.',
        'The move that makes the idea land is setting "Added to reward" to +3 with no baseline and playing to the end — one row turns red — then switching the baseline to Mean reward and replaying, where all five end on a2.',
        'The code panel, labelled "REINFORCE with a baseline", starts empty with an add-language button; the chosen language shows `softmax`, `sampleAction`, `baselineValue` and `reinforce`. Episode steps light the update side, the first and last steps the probability side. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article introduces the baseline in REINFORCE and needs a reason stronger than "it reduces variance": shifting every reward by the same amount leaves the ranking unchanged and still sends one agent to the wrong action.',
      'A reader asks why a reward that is always positive is a problem for policy gradients; with no baseline every draw is reinforced, so early luck decides.',
      'The article motivates the advantage G − b, or actor-critic methods that learn b, and wants to show what subtracting even a crude average already fixes.',
    ],

    avoidWhen: [
      'The subject is multi-step episodes, discounting along a trajectory, or credit assignment across time. Every episode here is one draw and one reward.',
      'The article is about PPO, trust regions or clipping. The update here is plain REINFORCE.',
      'The point is value-based methods that pick the action with the largest estimate. These agents keep only probabilities.',
    ],

    contrastWith: [
      {
        concept: 'nudgeTowardReward',
        note: 'One nudge moves the drawn action by the reward\'s sign; what the reward is measured against decides whether repeated nudges settle on the best action.',
      },
      {
        concept: 'qLearning',
        note: 'Q-learning improves by estimating how good each action is; a policy gradient improves the probabilities directly and needs a reference point to know whether a reward was good.',
      },
      {
        concept: 'gan',
        note: 'A policy gradient has one learner following a gradient against a fixed reward; adversarial training has two learners following opposite gradients, each reshaping the other\'s signal.',
      },
    ],
  },
};
