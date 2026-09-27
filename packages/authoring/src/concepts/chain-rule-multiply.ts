/**
 * chainRuleMultiply 개념 선언.
 *
 * canonical facet 은 `facet:chainRuleMultiply` — 안쪽 함수 u = 3x 와 바깥 함수 y = u²/3 을 잇고, x 를 1 에서 0.01 민다.
 * 그 작은 움직임이 안쪽 문을 건너며 3 배(Δu 0.0300), 바깥 문을 건너며 2.01 배(Δy 0.0603)로 불어나고, 통째 배 6.03 이
 * 두 배의 곱이다. 끝 걸음에 민 폭을 0 으로 보낸 값 3 · 2 · 6 이 선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `integral` 은 한 곡선에서 폭을 줄여 가며 오차를 견준다. 이쪽은 **함수 둘을 이었을 때 배가 곱해진다**는 한 주장이다.
 * 그래서 definition 은 chained · inner · outer · multiply · evaluated at the inner output 을 쥐고, secant · tangent ·
 * 오차 같은 말을 넣지 않는다. 층을 거슬러 무게를 곱하는 ml 의 `gradientThroughLayers` 와는 방향(앞으로 미는 작은 움직임)과
 * 대상(함수의 국소 배)이 다르다.
 *
 * 전제 (설명 글 `chainRuleMultiply.md` 가 밝힌 것):
 *  - 두 함수 · 출발점 x₀ = 1 · 미는 폭 0.01 은 예로 정한 값이다. 도함수는 거듭제곱 규칙으로 셈했다.
 *  - 막대는 움직임을 크게 늘려 그렸다. 세 막대끼리만 길이를 견줄 수 있다.
 *  - 한 사례다. 두 함수가 그 점에서 미분 가능하면 언제나 성립한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const chainRuleMultiplyConcept: FacetConceptSource = {
  id: 'chainRuleMultiply',
  label: 'Chain Rule (Rates Multiply Through a Composition)',
  canonicalFacet: 'facet:chainRuleMultiply',

  surface: {
    definition:
      'When two functions are chained, a small input change is scaled once by the inner function\'s rate and again by the outer function\'s rate at the inner output, so the overall rate is their product.',
    exemplarKeywords: [
      'chain rule',
      'composite function',
      'derivative of a composition',
      'dy/dx = dy/du · du/dx',
      'inner and outer function',
      'function of a function',
      'rates of change multiply',
      'small change propagation',
      'Leibniz notation',
      'differentiating nested functions',
    ],
  },

  briefing: {
    observable: [
      'Three places x, u and y each carry a scale, with two gates between them: the inner function u = 3x and the outer function y = u²/3. Bars show how far each place moves, all three drawn to the same enlarged scale.',
      'Opening: "Nothing has moved yet." — x 1.00, u 3.00, y 3.00. Then "Push x by 0.01." and a bar labelled Δx 0.0100 rises at x, which now reads 1.01.',
      'The bar crosses the inner gate and grows: "Across the inner function: Δu = 0.0300 · ratio ×3.00". It crosses the outer gate and grows again: "Across the outer function: Δy = 0.0603 · ratio ×2.01".',
      'A bracket spans from input to output: "Whole ratio Δy/Δx = 6.03 = 3.00 × 2.01".',
      'In the last step the push width is sent to zero: "Push width → 0: du/dx = 3.00 · dy/du = 2.00 · product 6.00". The measured ratios ×2.01 and ×6.03 stay on screen beside the limits, so 6.03 and 6.00 can be compared. Six steps in all, counting the opening.',
      'The outer rate is taken at u = 3, the value the inner function hands over, not at x. The two functions, the start x = 1 and the push 0.01 are chosen examples; the bars are magnified and only comparable with each other; the result holds whenever both functions are differentiable at the relevant points. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps by itself and stops on the limiting product.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip back to the two gate crossings shows the one movement growing twice on its way to the output.',
        'The functions, the start and the push are fixed, so every change and ratio can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article states the chain rule and needs to justify why the rates are multiplied rather than added, by following one small change through both functions.',
      'A reader forgets that the outer derivative is evaluated at the inner function\'s output, and the article wants a case where that point (u = 3, not x = 1) is visible.',
    ],

    avoidWhen: [
      'The article is about backpropagation through a network with many layers and weights. There are only two functions and the change is pushed forward from the input.',
      'The subject is the product rule or quotient rule, where two functions are multiplied rather than nested.',
      'The reader should pick the functions or the push size. All values are fixed.',
    ],

    contrastWith: [
      {
        concept: 'gradientThroughLayers',
        note: 'Backward through a network the gradient is multiplied by each layer\'s factor in turn; the chain rule is the calculus fact underneath, stated for a forward nudge through two functions and their local rates.',
      },
      {
        concept: 'secantToTangent',
        note: 'A single function\'s derivative is the limit of one ratio; the chain rule is about how two such ratios combine when the output of one function becomes the input of the next.',
      },
      {
        concept: 'integral',
        note: 'Approximating a derivative by a finite difference raises the question of how the step controls the error; the chain rule assumes the derivatives and asks how they compose.',
      },
      {
        concept: 'partialSlice',
        note: 'The chain rule links rates along a chain of single-input functions; a partial derivative isolates one rate of a function with several inputs by holding the rest still.',
      },
    ],
  },
};
