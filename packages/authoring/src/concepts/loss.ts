/**
 * loss 개념 선언.
 *
 * canonical facet 은 `facet:loss` — 답이 y = 0 인 보기 하나, 출력 p = σ(z) 가 틀린 쪽에 확신 p0 를 준 자리에서 출발해
 * z ← z − η·∂L/∂z (η 1) 를 12 번 한다. 손잡이 둘 — 손실 종류(제곱 · 교차 엔트로피) · 틀린 확신(0.7 · 0.9 · 0.99 · 0.999).
 * 확신이 커질수록 걸음 1 의 미는 크기가 제곱은 0.2940 → 0.0020 으로 줄고, 교차 엔트로피는 0.7000 → 0.9990 으로 는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `lossMeasuresWrongness` 는 교차 엔트로피 하나로 **틀림을 한 수로 재고 평균 내는** 장면이다 — 기울기도 갱신도
 * 없다. 이쪽은 **두 손실의 기울기가 확신하고 틀린 출력을 얼마나 세게 되미는가**를 견준다. 그래서 definition 은
 * squared loss vs cross-entropy · gradient · confidently wrong · shrinks/grows 를 쥐고, 조각이 독점한 negative log ·
 * probability given to the true label · average over examples 를 쓰지 않는다.
 *
 * 전제 (설명 글 `loss.md`): 보기 하나 · 답 0 · 점수 z 하나를 직접 미는 장난감 셈(앞 층 무게 없음) · η 1 · 갱신 12 ·
 * 제곱 손실은 ½ 없는 L = (p − y)² · 코드 패널은 IR → 여섯 언어의 `lossRun`.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lossConcept: FacetConceptSource = {
  id: 'loss',
  label: 'Loss Functions: Squared Error vs Cross-Entropy Gradient',
  canonicalFacet: 'facet:loss',

  surface: {
    definition:
      'For a confidently wrong sigmoid output, the squared-loss gradient shrinks toward zero as confidence grows while the cross-entropy gradient grows toward one, so cross-entropy corrects the worst mistakes fastest.',
    exemplarKeywords: [
      'loss function',
      'mean squared error vs cross-entropy',
      'MSE vs log loss for classification',
      'why use cross-entropy with sigmoid',
      'gradient of cross-entropy is p - y',
      'binary cross-entropy',
      'BCEWithLogitsLoss',
      'learning slowdown with squared error',
      'confidently wrong predictions',
      'choosing a loss function',
    ],
  },

  briefing: {
    observable: [
      'One example with answer y = 0; the output p = σ(z) starts confidently wrong, giving p0 to the answer 1. The loss curve plots L against the score z; the output is a dot on that curve, and the tangent slope there is the push ∂L/∂z.',
      'An arrow from the dot points left by the distance the next update will move z (η = 1, so the arrow is ∂L/∂z itself), and a bar beside it shows the same push on a 0 … 1 scale. A band from 0 to 1 marks the output p and the 0.5 point.',
      'A round is fourteen steps: the start (z, p, L), the push at the starting point, then updates #1 … #12, each "z ← z − η·∂L/∂z" with the new z, p, L and push. A counter reads "Updates"; a caption names the update that took p below 0.5, or says p is still above 0.5.',
      'Squared loss (L = (p − y)², ∂L/∂z = 2(p − y)·p(1 − p)): as p0 goes 0.7, 0.9, 0.99, 0.999 the starting loss grows 0.490, 0.810, 0.980, 0.998 but the first push shrinks 0.2940, 0.1620, 0.0196, 0.0020. After twelve updates p is 0.211 and 0.347 for the first two and still 0.987 and 0.999 for the last two, never crossing 0.5.',
      'Cross-entropy (∂L/∂z = p − y): the starting loss grows 1.204, 2.303, 4.605, 6.908 and the first push grows with it, 0.7000, 0.9000, 0.9900, 0.9990. All four cross below 0.5, at updates #2, #3, #6 and #8.',
      'The push is not monotone within a run: squared loss at 0.9 pushes 0.1620 first, rises to 0.2955 as p nears 0.5 (where p(1 − p) is largest) and falls back to 0.1576.',
      'Axes are fixed across the ladder: z from −3 to 7, push 0 … 1, L 0 … 1 for squared and 0 … 7 for cross-entropy, so the squared loss really does look small.',
      'Premises the screen does not footnote: one example, answer 0, and the score z is pushed directly with no earlier layer; η = 1 and twelve updates, each gradient taken before the update; squared loss is written without the ½ so it sits beside cross-entropy on a probability output.',
    ],

    screen: {
      affordances: [
        'Playback controls (Play, Step, Pause, Reset, Speed) plus two handles: a "Loss" slider with Squared and Cross-entropy (starting at Cross-entropy) and a "Wrong confidence" slider with 0.7, 0.9, 0.99, 0.999 (starting at 0.99). Changing the confidence slides the dot to its new place on the curve; changing the loss reshapes the curve.',
        'The move that lands the idea is switching Loss at confidence 0.99: under cross-entropy the push is 0.99 and p drops below 0.5 at update #6; under squared loss the curve lies flat there, the push is 0.0196 and p is still 0.987 after twelve updates.',
        'The code panel, labelled "Loss, slope and update", starts empty with a "+ Add language" button; the chosen language shows `lossRun`, which fills buffers of p, push and L for each update and returns the final p. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues for cross-entropy over squared error in classification and needs the mechanism: the same confidently wrong output at 0.999 gets a push of 0.0020 from one and 0.9990 from the other.',
      'A reader sees that squared loss also grows with the mistake and asks why it learns slowly; the loss value rising while its gradient falls, side by side on one handle, answers that.',
    ],

    avoidWhen: [
      'The article is about regression with squared error on real-valued targets. The output here is a sigmoid probability, which is what flattens the squared-loss gradient.',
      'The subject is computing an average loss over a dataset. There is one example and the focus is its gradient, not a mean.',
      'The article discusses gradients flowing back into earlier layers. The score is moved directly; there are no weights behind it.',
    ],

    contrastWith: [
      {
        concept: 'lossMeasuresWrongness',
        note: 'Measuring how wrong predictions are and averaging them into one number is what a loss is; what a loss does to learning depends on its slope, and two losses that both grow with the error can push in opposite ways.',
      },
      {
        concept: 'leastSquares',
        note: 'Squared error on a real-valued target has a gradient proportional to the error. Put behind a sigmoid, the same squared form is multiplied by p(1 − p) and loses its push exactly where the output is most wrong.',
      },
      {
        concept: 'saturateAndVanish',
        note: 'The flat sigmoid tail is the cause of squared loss stalling; cross-entropy\'s logarithm cancels that slope, which is why its push survives saturation.',
      },
      {
        concept: 'backprop',
        note: 'The loss\'s own slope with respect to the output is where every backward pass begins; distributing it to all the weights is a separate step.',
      },
    ],
  },
};
