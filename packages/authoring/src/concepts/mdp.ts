/**
 * mdp 개념 선언.
 *
 * canonical facet 은 `facet:mdp` — 3 × 5 격자에서 모형(전이 · 상)을 다 아는 계획자가 가치 반복으로
 * 칸마다의 값 V 와 화살표를 열두 바퀴 고쳐 쓰고, 마지막 걸음에 출발에서 화살표를 뜻대로 따라간 길을 긋는다.
 * 손잡이 둘 — 할인율 γ(0.6 · 0.8 · 0.96) 와 미끄러짐(0 · 0.1 · 0.2) — 을 돌리면 길이 셋으로 갈린다:
 * 바로 아래 작은 목표 · 구덩이 옆 지름길 · 위로 돌아가는 길.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `stateActionReward` 는 한 번의 주고받기(행위자가 고르고 환경이 정한다)를, `discountFuture` 는 상의 줄 하나에
 * γ^k 를 곱하는 셈을 맡는다. 이쪽은 **모형을 아는 계획** 과 **두 손잡이가 최선의 길을 가르는 대비** 를 쥔다.
 * 그래서 definition 은 value iteration · known model · 길 셋(near small reward · shortcut beside pits · detour)
 * 낱말을 쥐고, 조각들이 가진 agent · environment · trajectory · γ^k · raw sum 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `mdp.md` 가 밝힌 것):
 *  - 격자 · 상(+3 · +10 · −10) · 바퀴 수 12 · 미끄러짐이 좌우로 도는 몫이라는 모형은 예로 정한 값이다.
 *  - 무작위는 없다. 미끄러짐은 뽑지 않고 기댓값으로 셈한다.
 *  - 화면의 V 는 바퀴 12 의 값이다. 화살표는 이미 끝값과 같지만 γ 0.96 · 미끄러짐이 있을 때 V(S) 는 아직 오르는 중이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mdpConcept: FacetConceptSource = {
  id: 'mdp',
  label: 'Markov Decision Process (Value Iteration Under Discount and Slip)',
  canonicalFacet: 'facet:mdp',

  surface: {
    definition:
      'Value iteration plans over a fully known model, and the discount factor and slip chance together decide whether the best route takes a near small reward, a shortcut beside the pits, or a safer detour.',
    exemplarKeywords: [
      'Markov decision process',
      'MDP',
      'value iteration',
      'Bellman optimality equation',
      'Bellman backup',
      'optimal policy',
      'planning with a known model',
      'model-based reinforcement learning',
      'gridworld',
      'stochastic transitions',
      'slippery grid',
      'discount factor gamma',
      'risk of falling into a pit',
      'dynamic programming in reinforcement learning',
    ],
  },

  briefing: {
    observable: [
      'A 3 × 5 grid: the start cell sits on the middle row at the left edge, a small goal (+3) directly below it, a big goal (+10) at the right end of the middle row, and three pits (−10) along the bottom row between them. Entering any of those three ends the run; every other move earns 0.',
      'Every cell starts at value 0 with no arrow. Each sweep rewrites all values at once from the previous sweep\'s values: for each of four directions it adds the intended share `1 − 2p` and the two sideways-slip shares `p`, taking `reward + γ · V(next)` for an ordinary cell and just the reward for an end cell. The largest becomes the new V and its direction the arrow.',
      'Values spread outward from the goals and pits by about one cell per sweep. Far cells show no arrow for the first two sweeps because all four directions are still exactly 0.',
      'Status lines report each sweep: "sweep n · nonzero cells … · arrows turned …" and "V(S) after sweep n: … · largest change …". Three readouts under the controls count sweeps, arrows turned and path moves.',
      'After sweep 12 a last step draws the path from the start following the arrows as intended, without slipping — "Following the arrows as intended: ↑→→→→↓" and "reaches: big goal · moves 6". It is the shape of the plan, not a sampled run.',
      'At the defaults (γ 0.96, slip 0.1) the start arrow points down for sweeps 1–5, right for 6–7 and up from sweep 8: the near small goal looks best until the big goal\'s value has spread that far.',
      'Across the handles the route splits three ways. γ 0.6 always goes straight down to the small goal (V(S) 3.00 · 2.62 · 2.14 for slip 0 · 0.1 · 0.2). With no slip, γ 0.8 and 0.96 run the row beside the pits to the big goal (V(S) 5.12 and 8.85). With slip, γ 0.96 detours up and over (7.34 · 5.05), while γ 0.8 falls back to the small goal (2.88 · 2.54).',
      'The grid, rewards, twelve sweeps and the rule that a slip turns the move left or right are example values. Nothing is random: slips are counted by their expected share, not drawn.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "discount γ" with 0.6 · 0.8 · 0.96 (starts at 0.96) and "slip" with 0 · 0.1 · 0.2 (starts at 0.1). Turning either resets every value to 0 and replays all twelve sweeps; one round is fourteen steps including the empty start.',
        'The move that makes the idea land is holding slip at 0.1 and stepping γ from 0.96 down to 0.8: the start arrow swings from the detour to the small goal below. Then set slip to 0 at the same γ and the shortcut beside the pits comes back.',
        'The code panel, labelled "Value iteration", starts empty with an add-language button; the chosen language shows `sweep`, `actionValue`, `outcome`, `moveTo` and `followPolicy` with the current line highlighted. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article introduces value iteration and needs the reader to see that a planner who knows the transitions and rewards can compute the best move for every cell without ever acting.',
      'The article argues that the optimal policy depends on how far ahead one looks and how unreliable moves are, and wants one grid where changing those two numbers flips the route between a near reward, a risky shortcut and a detour.',
      'A reader asks why an optimal policy avoids the edge of a cliff even though it is shorter; slip turns that edge into an expected loss, and the arrows move up a row.',
    ],

    avoidWhen: [
      'The subject is learning from experience without knowing the model — sampling moves, updating from observed rewards. The planner here reads the model directly and never samples.',
      'The article is about partially observable problems, continuous states, or function approximation with neural networks. The states are fifteen known cells.',
      'The point is shortest paths in a graph with edge weights. Moves here have uncertain outcomes and rewards at the ends, not costs along edges.',
    ],

    contrastWith: [
      {
        concept: 'stateActionReward',
        note: 'One exchange between a chooser and a world that decides the result defines the problem; value iteration takes the whole model of those exchanges and solves for the best choice in every state at once.',
      },
      {
        concept: 'discountFuture',
        note: 'Discounting says how much a reward k steps away is worth now; in planning that weight competes against slip risk and changes which route is best.',
      },
      {
        concept: 'qLearning',
        note: 'Both end with a best action per state, but value iteration computes it from a known model, while Q-learning must discover transitions and rewards by acting and exploring.',
      },
      {
        concept: 'dynamicProgramming',
        note: 'Value iteration is dynamic programming over states, but the table is refilled every sweep until it settles instead of being written once in dependency order.',
      },
      {
        concept: 'bellmanFord',
        note: 'Both repeat full sweeps of local updates until values stop changing; shortest paths minimise fixed edge costs, value iteration maximises expected discounted reward under uncertain moves.',
      },
    ],
  },
};
