/**
 * perParameterStep 개념 선언.
 *
 * canonical facet 은 `facet:perParameterStep` — 늘인 그릇 L = 5a² + 0.05b² 의 (1, 1) 에서 두 무게 a · b 가 받는 기울기는
 * 10 과 0.1 로 백 배 다르다. Adam 은 자리마다 보폭 η/(√v̂ + ε) 를 따로 써서 a 는 0.010, b 는 1.00 으로 거꾸로 백 배
 * 벌리고, 실제 움직임은 두 자리 모두 0.100 이 된다. 세 줄(기울기 · 보폭 · 움직임)이 같은 로그 축에 선다. 여섯 갱신,
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `adam` 은 축 비 r 과 갱신 규칙을 돌려 축마다 간 몫이 r 에 무딘 것을 견준다. 이쪽은 **한 갱신 안에서 보폭이
 * 기울기와 거꾸로 벌어지는 장면** 하나다. definition 은 divides · running average of squared gradients · step size ·
 * inversely · equal movement 를 쥐고, 완제품의 axis ratio · capped · pace whatever r 를 쓰지 않는다.
 *
 * 전제: 손실 · 처음 (1, 1) · η 0.1 · β1 0.9 · β2 0.999 · ε 1e−8 은 손으로 고른 값이다. 두 움직임이 셋째 자리까지 같은
 * 것은 한 그릇을 축마다 늘인 모양이기 때문이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const perParameterStepConcept: FacetConceptSource = {
  id: 'perParameterStep',
  label: 'Per-Weight Step Sizes in Adam',
  canonicalFacet: 'facet:perParameterStep',

  surface: {
    definition:
      'Adam divides each weight\'s update by the square root of its own running average of squared gradients, so step sizes spread inversely to gradient size and the actual movements come out equal.',
    exemplarKeywords: [
      'adaptive learning rate',
      'per-parameter learning rate',
      'η / (√v̂ + ε)',
      'second moment estimate',
      'RMSProp',
      'AdaGrad',
      'normalizing by gradient magnitude',
      'effective step size',
      'Adam update rule',
    ],
  },

  briefing: {
    observable: [
      'Three rows share one log axis from 0.001 to 10: "Gradient g", "Step size η / (√v̂ + ε)" and "Movement = step size · m̂", each with a marker for a and one for b. In the step-size row both lines branch out from the mark "η = 0.10". In the movement row a hollow dashed marker (legend "With one learning rate: η·g") shows where a single rate would have put each move, with a dashed line to where it actually lands.',
      'Before any update the weights read "a: 1.00, b: 1.00". On update 1 a gets gradient 10.00 and b gets 0.100; with one rate they would have moved 1.00 and 0.010.',
      'The step sizes land the opposite way: 0.010 for a and 1.00 for b. The caption reads "Update #1 — step size b / a: 100; movement a: 0.100, b: 0.100".',
      'Over six updates the step-size ratio stays at 100 while both weights walk the same path, 1.00 → 0.90 → 0.80 → 0.70 → 0.60 → 0.51 → 0.41, their movements shrinking together from 0.100 to 0.094.',
      'On the log axis a hundredfold gap is the same length anywhere, so the gradient gap and the opposite step-size gap look equal and cancel in the movement row.',
      'The loss, the start (1, 1), η 0.1 and Adam\'s β1 0.9, β2 0.999, ε 1e−8 are chosen values. The movements agree to three decimals because the loss is one bowl stretched along each axis separately.',
    ],

    screen: {
      affordances: [
        'The screen plays seven steps by itself — the start and six updates — and stops.',
        'A Replay button and a playback strip sit below. Holding update 1 shows the three rows at their clearest: gradients 100 times apart, step sizes 100 times apart the other way, movements on top of each other.',
        'All values are fixed, so an article can quote every gradient, step size and movement exactly.',
      ],
    },

    useWhen: [
      'The article introduces adaptive learning rates and needs one picture of what "per-parameter" means: each weight receives its own step size, set from its own gradients.',
      'The reader wonders what the √v̂ in the Adam formula accomplishes; dividing by it turns gradients 100 times apart into equal movements.',
    ],

    avoidWhen: [
      'The article compares Adam with plain gradient descent over a whole run, or across different steepness ratios. Only Adam runs, on one loss, for six updates.',
      'The subject is Adam\'s momentum term, bias correction or weight decay. The screen shows only the division by gradient size.',
      'The point is scaling input features or normalizing activations. What is divided here is each weight\'s update.',
    ],

    contrastWith: [
      {
        concept: 'adam',
        note: 'Step sizes set against each weight\'s gradient size are the mechanism; the resulting indifference to how uneven the loss is across weights is what that mechanism buys over a full descent.',
      },
      {
        concept: 'carryVelocity',
        note: 'Carrying earlier movement changes a step according to that weight\'s own history of moves; dividing by gradient size changes it according to how large that weight\'s gradients have been.',
      },
      {
        concept: 'rescaleEachBatch',
        note: 'Both divide by a measured spread. Batch normalization rescales activation values within a batch; an adaptive optimizer rescales each weight\'s update.',
      },
    ],
  },
};
