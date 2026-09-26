/**
 * backprop 개념 선언.
 *
 * canonical facet 은 `facet:backprop` — 은닉 층 하나(ReLU · 치우침 없음)의 망에서 무게 모두의 기울기를 두 길로 얻는다.
 * 역전파는 앞먹임 한 번 · 뒤로 한 번(곱셈 7H), 밀어 보기는 무게 하나씩 ε 로 밀어 망을 다시 돈다(곱셈 3H(1 + 3H)).
 * 손잡이 둘 — 은닉 폭(3 · 6 · 12 · 24, 비용 배 4.3 · 8.1 · 15.9 · 31.3) · 밀어 볼 폭 ε(0.1 · 0.01 · 0.001, 가장 큰 어긋남이
 * 정확히 열 배씩 준다). 일곱 걸음.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `errorFlowsBackward` 는 출력의 틀림이 무게 비례로 **갈라져** 은닉으로 흐르는 장면, `gradientThroughLayers` 는 층을
 * 건널 때마다 무게가 **곱해져** 크기가 오르내리는 장면이다. 이쪽은 **왜 그 길인가** — 역전파가 치르는 비용을
 * 무게마다 밀어 보는 길과 견주고, 밀어 본 값이 역전파 값으로 모이는 것을 보인다. 그래서 definition 은 cost ·
 * one forward and one backward pass · finite differences · per weight · converge as ε shrinks 를 쥐고, 조각들이 독점한
 * split · share · sign flip · multiply by each layer's weight · grow or shrink 를 쓰지 않는다.
 *
 * 전제 (설명 글 `backprop.md`): 입력 x = (1.0, 0.6) · 목표 1.2 · 출력은 활성화 없는 합 · L = ½(ŷ − y)² · 폭 H 는 단위
 * 스물넷 한 벌의 앞 H 개(앞 셋은 조각 errorFlowsBackward 의 망) · 곱셈은 밀집 셈의 자리로 센다 · 앞 차분 ·
 * 코드 패널은 IR → 여섯 언어.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const backpropConcept: FacetConceptSource = {
  id: 'backprop',
  label: 'Backpropagation vs Finite-Difference Gradients',
  canonicalFacet: 'facet:backprop',

  surface: {
    definition:
      'Backpropagation obtains every weight\'s gradient from one forward and one backward pass, whereas finite differences rerun the network once per weight; the cost gap widens with network size, and nudged estimates converge to the backprop values as ε shrinks.',
    exemplarKeywords: [
      'backpropagation',
      'backprop',
      'reverse-mode automatic differentiation',
      'numerical gradient',
      'finite difference approximation',
      'gradient checking',
      'why backpropagation is efficient',
      'computational cost of computing gradients',
      'loss.backward()',
      'Rumelhart Hinton Williams 1986',
      'autograd',
    ],
  },

  briefing: {
    observable: [
      'A small network — inputs x₁ = 1.0 and x₂ = 0.6, H ReLU hidden units, output ŷ = Σ w2·h, target y = 1.2, loss L = ½(ŷ − y)² — and every weight needs its own gradient ∂L/∂w. Units that are off (z ≤ 0) are marked.',
      'A round is seven steps: the network, the forward pass, the backward pass (backprop is done), then nudging each w2, each wa and each wb by ε and running the whole network again, then the comparison.',
      'Two bars at the top accumulate multiplications separately for "Backprop" and "Nudging". Backprop costs 7H; nudging costs 3H(1 + 3H) — one base forward pass plus one per weight. The cost ratio reads ×4.3 at width 3, ×8.1 at 6, ×15.9 at 12, ×31.3 at 24.',
      'For every weight, the backprop value is a tick with its number to three decimals, and the nudged value stands next to it as a ▲ mark. The final step reports the largest gap and the unit and weight where it occurs.',
      'Dividing ε by ten moves every ▲ ten times closer: the largest gap is 0.0405, 0.00405, 0.000405 at width 3, and 0.0794, 0.00794, 0.000794 at widths 6, 12 and 24. Off units have zero gradient on both paths.',
      'Width H uses the first H of one fixed set of 24 units; at this input 2, 5 and 10 units are off at widths 6, 12 and 24.',
      'Premises the screen does not footnote: one hidden layer, no biases, toy values; multiplications are counted as dense positions (3 per unit forward, 4 per unit backward), off units included, and the ½(ŷ − y)² product, ReLU comparisons and the difference quotient are not counted; the nudge is a forward difference — a central difference would agree with backprop almost exactly here, because the loss is quadratic in each weight, and the gaps would not change with ε; nudged gradients appear only as ▲ positions, not numbers.',
    ],

    screen: {
      affordances: [
        'Playback controls (Play, Step, Pause, Reset, Speed) plus two handles: a "Hidden width" slider with 3, 6, 12, 24 (starting at 3) and a "Nudge size ε" slider with 0.1, 0.01, 0.001 (starting at 0.1). Counters read "Backprop mults" and "Nudging mults".',
        'Two moves carry the idea. Stepping the width up shows the nudging bar racing ahead while backprop stays at one forward and one backward pass. Stepping ε down shows every ▲ closing in on its backprop tick by exactly a factor of ten.',
        'The code panel, labelled "Two ways to the gradient", starts empty with a "+ Add language" button; the chosen language shows `gradientGap`, which fills gradient buffers both ways, counts each path\'s multiplications and returns the largest gap. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why backpropagation made neural network training practical and wants the cost comparison in numbers: 7H multiplications against 3H(1 + 3H), a ratio that grows from 4.3 to 31.3 as the layer widens.',
      'The article teaches gradient checking — comparing backprop against numerically nudged gradients — and needs to show that the numerical estimate approaches the backprop value as ε shrinks, ten times closer per step.',
    ],

    avoidWhen: [
      'The subject is how the error divides among branches or how its size changes from layer to layer. The backward pass here completes in a single step; its inner flow is not unfolded.',
      'The article is about updating weights with gradient descent or learning rates. The gradients are computed and compared; no weight is changed.',
      'The network in question is deep, recurrent or convolutional. There is one hidden layer, and the cost counts are specific to it.',
    ],

    contrastWith: [
      {
        concept: 'errorFlowsBackward',
        note: 'How the output error is divided among branches in proportion to their weights is the mechanism inside the backward pass; the claim here is about what that mechanism costs compared with nudging weights one by one.',
      },
      {
        concept: 'gradientThroughLayers',
        note: 'The size a gradient reaches after crossing many layers is set by the product of their factors. Whether it is computed by one backward pass or by rerunning the network per weight is the separate question of cost.',
      },
      {
        concept: 'unrollThenBackprop',
        note: 'Backpropagation through time applies the same backward pass to a recurrent network unrolled over steps; the efficiency argument against per-weight nudging is the same one.',
      },
      {
        concept: 'gradientDescent',
        note: 'Backpropagation only produces the gradients; gradient descent is the rule that uses them to change the weights.',
      },
    ],
  },
};
