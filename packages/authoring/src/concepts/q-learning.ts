/**
 * qLearning 개념 선언.
 *
 * canonical facet 은 `facet:qLearning` — 복도 네 칸(왼쪽 끝 작은 목표 +3 · 출발 · 빈 칸 · 오른쪽 끝 큰 목표 +10)을
 * 행위자 다섯이 판 60 동안 Q-러닝(α 0.6 · γ 0.9)으로 배운다. 손잡이는 탐험 ε(0 · 0.1 · 0.2 · 0.3 · 0.5) 하나.
 * 판 60 뒤 출발의 탐욕이 오른쪽(큰 목표)인 행위자 수가 ε 마다 0 · 0 · 2 · 3 · 5 로 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `valueOfAction` 은 정해진 선택 차례에서 Q 값이 한 판에 한 자리씩 거슬러 채워지는 셈을, `exploreVsExploit` 은
 * 자리 하나(밴딧)에서 ε-탐욕이 문을 고르는 한 결정을 맡는다. 이쪽은 둘을 한 판에 잇고 **ε 을 돌리면 먼 큰 상을
 * 알아내는 행위자가 몇이 되는가** 라는 대비를 쥔다. definition 은 learning by trial · stuck on the first small reward ·
 * distant larger reward · several agents 를 쥐고, 조각들의 bandit · door · sample average · one state per episode ·
 * halfway 를 쓰지 않는다.
 *
 * 전제 (설명 글 `qLearning.md`):
 *  - 복도 · 상 · α · γ · 판 60 은 예로 정한 값이다.
 *  - 보이는 다섯은 행위자 이백에서 ε 마다 이백의 비율과 맞는 첫 묶음을 고른 것이다 (이백으로는 0 · 20 · 79 · 154 · 198).
 *  - 이 복도에서 판 60 안에 "탐험이 많으면 손해" 는 드러나지 않는다 — 그런 주장은 하지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const qLearningConcept: FacetConceptSource = {
  id: 'qLearning',
  label: 'Q-Learning with ε-Greedy Exploration',
  canonicalFacet: 'facet:qLearning',

  surface: {
    definition:
      'Q-learning agents learn by trial which way pays, and the exploration rate decides how many ever find a distant larger reward instead of staying stuck on the first small one they met.',
    exemplarKeywords: [
      'Q-learning',
      'model-free reinforcement learning',
      'off-policy temporal difference control',
      'ε-greedy',
      'exploration rate',
      'Q-table',
      'learning rate alpha',
      'stuck in a local optimum',
      'sparse delayed reward',
      'greedy policy after training',
      'why agents need to explore',
      'corridor environment',
    ],
  },

  briefing: {
    observable: [
      'A strip labelled "Environment" shows a four-cell corridor: "Small goal" with "reward +3" at the left end, "Start" in the second cell, an empty third cell, and "Big goal" with "reward +10" at the right end. From the start the small goal is one move away, the big goal two.',
      'Below, under "What each agent holds", five rows (Agent 1 to Agent 5) show only two bars per non-end cell — "value of going left" and "value of going right" — and a "Greedy" arrow at the start showing which bar is currently larger.',
      'All values start at 0 and ties go left, so every agent\'s first episode ends at the small goal. After that the start\'s left bar climbs toward 3 while its right bar stays at 0.',
      'With ε above 0, some agents stumble right and reach the big goal. The right bar in the cell before the big goal rises first (toward 10), then over later episodes the start\'s right bar rises toward 0.9 × 10 = 9; when it passes the left bar\'s 3, that agent\'s Greedy arrow swings right.',
      'Each step is one episode for all five agents: "ε 0.2 · episode 16/60" and "Ended at the big goal: …/5 · Ever reached it: …/5 · Greedy at the start points right: …/5". Readouts under the controls count Episode, Reached big goal and Greedy goes right.',
      'The last step reads the start: at ε 0.2, "Right, toward the big goal: 2/5 · Left, toward the small goal: 3/5". Across ε 0 · 0.1 · 0.2 · 0.3 · 0.5 the count going right is 0 · 0 · 2 · 3 · 5.',
      'At ε 0 no agent ever moves right, so the big reward is never discovered. At ε 0.1 the count is still 0, but four of the five have nonzero right-hand values at the start (such as 1.57 and 2.22) from exploratory trips; the fifth never went right in 60 episodes.',
      'The corridor, rewards, α 0.6, γ 0.9 and 60 episodes are example values. The five agents were chosen from two hundred so that their counts match the two-hundred proportions (0 · 20 · 79 · 154 · 198 of 200).',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Exploration ε", with 0 · 0.1 · 0.2 · 0.3 · 0.5 (starts at 0.2). Turning it resets all values to 0 and relearns from the same seeds; a round is 62 steps — start, 60 episodes, and a final reading of the start cell.',
        'The move that makes the idea land is setting ε to 0 and playing to the end — every right-hand bar stays empty — then stepping ε up and watching more Greedy arrows turn right.',
        'The code panel, labelled "Choose and update", starts empty with an add-language button; the chosen language shows `chooseAction`, `greedyAction` and `qUpdate`. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article presents Q-learning end to end and needs the reader to see both halves working together: choosing with some randomness, and pulling one value toward reward plus the discounted best next value.',
      'The argument is that an agent which only exploits locks onto the first reward it happens to find; setting exploration to zero and then raising it shows the larger reward going from never found to found by every agent.',
      'A reader asks how a reward two moves away ever influences the first move; the right-hand bars fill from the far end back toward the start over many episodes.',
    ],

    avoidWhen: [
      'The article claims more exploration is costly or that ε should decay. In this corridor within 60 episodes, more exploration only helps; no cost appears.',
      'The subject is deep Q-networks, replay buffers or target networks. The values here are a small table.',
      'The point is planning with a known model. These agents never see the reward table; they only learn from moves they make.',
    ],

    contrastWith: [
      {
        concept: 'valueOfAction',
        note: 'How a single action value is pulled toward its target is the update rule alone; Q-learning adds the choice of which action to try, and that choice decides whether a value ever gets pulled at all.',
      },
      {
        concept: 'exploreVsExploit',
        note: 'With one state, exploring only reveals which option pays more right now; with several states, a single exploratory step can also open up a route whose reward arrives later.',
      },
      {
        concept: 'mdp',
        note: 'Both end with a best action per state; value iteration computes it from known transitions and rewards, Q-learning has to act in order to find them out.',
      },
      {
        concept: 'policyGradient',
        note: 'Q-learning scores each action and acts on the scores; a policy gradient method keeps no scores and shifts the probability of choosing each action directly.',
      },
    ],
  },
};
