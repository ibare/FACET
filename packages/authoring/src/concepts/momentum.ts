/**
 * momentum 개념 선언.
 *
 * canonical facet 은 `facet:momentum` — 비탈(g −1) · 평지(g 0) · 그릇(바닥 w 3.5)을 이은 장난감 곡선에서 v ← β·v − η·g ·
 * w ← w + v 를 40 번 한다. 손잡이 β(0 · 0.6 · 0.7 · 0.8 · 0.9 · 0.95, 처음 0.8)를 돌리면 w 의 시간 자취가 다시 그려진다 —
 * 0 · 0.6 은 평지에 서고, 0.7 · 0.8 은 건너가 바닥을 넘어섰다 가라앉고(갱신 26 · 34 부터), 0.9 · 0.95 는 40 번 안에
 * 가라앉지 못한다(0.95 는 되튀어 평지를 거꾸로 건넌다). 넘어선 폭 0.31 · 0.53 · 0.84 · 1.27 이 β 를 따라 커진다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `carryVelocity` 는 β 0.9 하나로 기울기 0 인 평지를 이어 받은 몫만으로 건너는 장면이다. 이쪽은 **β 가 쥔
 * 맞바꿈 — 너무 작으면 서고, 크면 건너지만 넘어서 출렁인다** 를 쥔다. definition 은 coefficient · trade-off · stall
 * short · overshoot · oscillate · settle 을 쥐고, 조각의 decayed share of the previous movement · zero-gradient plateau
 * · keeps moving 을 쓰지 않는다.
 *
 * 전제 (설명 글 `momentum.md`):
 *  - 곡선은 꺾인 선에 그릇을 이은 장난감이다. η 0.2 · 출발 w 0 · v 0 · 갱신 40 번은 고른 값이다.
 *  - 40 번에서 멈추는 것은 재생 길이이지 수렴이 아니다. "가라앉았다" 는 그 갱신부터 끝까지 바닥 띠(±0.05) 안에 머문 경우만.
 *  - "β 가 클수록" 으로 넓혀 말할 수 있는 것은 넘어선 폭 하나다 — 두 계기는 β 에 한쪽으로 움직이지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const momentumConcept: FacetConceptSource = {
  id: 'momentum',
  label: 'Momentum Coefficient β (Stalling vs Overshooting)',
  canonicalFacet: 'facet:momentum',

  surface: {
    definition:
      'The momentum coefficient β sets a trade-off: too small and the weight stalls short of the minimum, larger and it reaches the minimum but overshoots and oscillates longer before settling.',
    exemplarKeywords: [
      'momentum',
      'heavy ball method',
      'momentum coefficient',
      'β = 0.9',
      'SGD with momentum',
      'overshoot and oscillation',
      'damping',
      'tuning the momentum hyperparameter',
      'Polyak momentum',
      'torch.optim.SGD momentum',
    ],
  },

  briefing: {
    observable: [
      'A time trace: across are update numbers 0 to 40, up is w. Three bands mark the curve\'s pieces — "Slope g = −1" below w 1.1, "Plateau g = 0" up to 2.5, and "Bowl" beyond — with a line at "Bottom 3.5" and a thin ±0.05 bottom band around it. The header shows `v ← β·v − η·g · w ← w + v` with β and η 0.2.',
      'Beside the trace, a "Movement v" bar splits each update into "Carried β·v" (grey) and "New push −η·g" (orange). On the plateau the orange part is absent, and the captions name the stretch: "Slope — the new push adds to what is carried over", "Plateau — g = 0, only the carried part moves w", "Bowl — the new push points toward the bottom".',
      'At the default β 0.8 the round is 41 steps (the start and 40 updates). w crosses the plateau by update 7, goes past the bottom to 4.03 at update 12, swings back and forth, and ends "Crossed at update 7, stays in the bottom band from update 34", with "Farthest 4.03 · overshoot 0.53".',
      'Across the handle: β 0 stops on the plateau at w 1.20 and β 0.6 at 2.00; 0.7 crosses and settles from update 26 (farthest 3.81); 0.9 reaches 4.34 and is still swinging at update 40; 0.95 reaches 4.77, rebounds back across the plateau onto the first slope and ends at w 1.74. The overshoot grows with β: 0.31 · 0.53 · 0.84 · 1.27.',
      'Two readouts, "Plateau updates" and "Updates past bottom", do not move one way with β — 3 and 19 at 0.8, 4 and 18 at 0.9, 26 and 7 at 0.95.',
      'The curve is a toy — a bent line joined to a bowl — and η 0.2, the start at w 0 and the 40 updates are chosen. Stopping at update 40 is the run\'s length, not convergence; "settled" is claimed only when w stays in the bottom band to the end.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Momentum β", with 0 · 0.6 · 0.7 · 0.8 · 0.9 · 0.95 (starts at 0.8). Turning it clears the previous trace and rolls w again from 0.',
        'The move that makes the idea land is stepping β from 0.6 to 0.7 and then to 0.95: a trace that lies flat inside the plateau band becomes one that climbs into the bowl and ripples around the bottom line, then one that shoots past and comes all the way back.',
        'The code panel, labelled "Momentum update", starts empty with an add-language button; the chosen language shows `momentumRun`, and each update lights the slope, plateau or bowl branch the weight is in. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article recommends a momentum value and needs to show why neither end is safe: too little leaves the weight stuck before the minimum, too much carries it past and keeps it swinging.',
      'A reader assumes more momentum simply means faster convergence; at β 0.9 and 0.95 the weight crosses sooner yet has not settled after 40 updates, while 0.7 settles first.',
    ],

    avoidWhen: [
      'The article is about Nesterov momentum or the moving averages inside Adam. Only the plain heavy-ball update runs.',
      'The subject is a real loss surface or the effect of momentum on generalization. The curve is a one-weight toy built from straight pieces and a bowl.',
      'The point is only that momentum carries a weight across a stretch with no slope, with nothing beyond it.',
    ],

    contrastWith: [
      {
        concept: 'carryVelocity',
        note: 'Carrying part of the previous move is what gets a weight across a stretch with no slope; the same carried part is what makes it overshoot the minimum once it arrives.',
      },
      {
        concept: 'gradientDescent',
        note: 'Without momentum each move depends only on the current slope, so a weight stops wherever the slope does; β adds memory of past moves, with the swinging that memory brings.',
      },
      {
        concept: 'learningRateTooBig',
        note: 'Both overshoot the bottom. An oversized rate overshoots because a single step is too long; momentum overshoots because earlier moves keep pushing after the slope has turned.',
      },
      {
        concept: 'adam',
        note: 'Adam also keeps a running average of gradients, but what it adds is dividing each weight\'s step by its own gradient size; momentum alone keeps one scale for every weight.',
      },
    ],
  },
};
