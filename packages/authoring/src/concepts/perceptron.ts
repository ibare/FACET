/**
 * perceptron 개념 선언.
 *
 * canonical facet 은 `facet:perceptron` — 정수 점 열 개(p1 … p10)를 적힌 차례로 훑으며, 틀린 점마다
 * w0 += d · w1 += d·x1 · w2 += d·x2 (d = y − ŷ) 로 경계선 s = 0 을 한 번에 옮긴다. 손잡이 하나가 부류 1 점 p3 를
 * (6, 6) 에서 (2, 2) 까지 대각선으로 옮긴다. 가를 수 있는 셋은 틀린 점 0 인 에폭에서 멈추고, 못 가르는 둘은
 * 에폭 끝 무게가 앞선 에폭 끝 무게로 돌아와 되풀이로 판정된다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `weightedSumThreshold` 는 학습 없이 **합을 싣고 문턱과 한 번 견주는** 한 장면이다. 이쪽은 그 판정을 틀린
 * 점마다 고치는 **학습 규칙이 끝나는가**를 쥔다 — 손잡이를 돌리면 멈춤과 되풀이가 갈린다. 그래서 definition 은
 * learning rule · linearly separable · stops · cycles 를 쥐고, 조각이 독점하는 multiply · sum · threshold ·
 * all-or-nothing 을 쓰지 않는다.
 *
 * 전제 (설명 글 `perceptron.md`): 좌표는 정수 장난감 점 · 합이 0 이면 꺼짐 · 첫 무게 (0, 0, 0) · 학습률 1 ·
 * 점의 차례는 판이 짧게 끝나도록 고른 것(끝나는가는 데이터가, 언제 끝나는가는 차례도 정한다) ·
 * 코드 패널은 IR 하나를 여섯 언어로 옮긴 그 셈의 함수.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const perceptronConcept: FacetConceptSource = {
  id: 'perceptron',
  label: 'Perceptron Learning Rule (Does It Stop?)',
  canonicalFacet: 'facet:perceptron',

  surface: {
    definition:
      'The perceptron learning rule moves its line after each misclassified point; on linearly separable data it reaches a mistake-free epoch and stops, otherwise its weights recur and it cycles forever.',
    exemplarKeywords: [
      'perceptron',
      'Rosenblatt perceptron',
      'perceptron convergence theorem',
      'perceptron update rule w += (y - y_hat) x',
      'linearly separable vs not linearly separable',
      'perceptron never converges',
      'online mistake-driven learning',
      'epochs until convergence',
      'single-layer perceptron limitation',
      'Minsky and Papert',
    ],
  },

  briefing: {
    observable: [
      'A plane holds ten integer points p1 … p10, class 1 and class 0. The boundary s = w0 + w1·x1 + w2·x2 = 0 is drawn with its on side (s > 0) shaded. The weights start at (0, 0, 0), so at step 0 the sum is 0 everywhere, every point is off and there is no line: "The whole plane is on the off side".',
      'An epoch sweeps the points in their listed order. When the sweep marker meets a wrong point, the line and the on side jump at once toward that point; the line just before stays as a faint dashed line, so each jump shows where it came from. The weights are integers, so the line jumps rather than glides.',
      'A bar chart on the right counts wrong points per epoch. Counters under the controls read "Epochs" and "Updates"; the caption for each epoch gives its wrong points and the weights after its updates.',
      'With the moved point at (6, 6) the rule stops at epoch 4 after 11 updates — the bar reaches 0 and the line holds. The round is six steps: start, four epochs, verdict "Stopped".',
      'Across the handle: (5, 5) stops at epoch 8 with 31 updates, (4, 4) stops at epoch 5 with 17. At (3, 3) and (2, 2) the two classes can no longer be split by one line, and the verdict is "Repeats": the weights at the end of epoch 10 equal those at the end of epoch 7 (for (2, 2), epoch 8 equals epoch 6). The line of the paired epoch rises from its bar and lies exactly on the current line.',
      'The epoch counts 4 · 8 · 5 do not grow steadily as the gap narrows; the convergence theorem bounds the number of updates, not the epoch at which it ends.',
      'Premises the screen does not footnote: the points are integer toy data; a sum of exactly 0 counts as off, and that tie is really hit several times per round; the learning rate is 1; the point order was chosen to keep rounds short — shuffled orders keep the same stop-or-repeat verdict per position but can take up to 150 epochs to stop or 683 to repeat.',
    ],

    screen: {
      affordances: [
        'Playback controls (Play, Step, Pause, Reset, Speed) and one handle: a five-position "Moved point" slider that places p3 at (6, 6), (5, 5), (4, 4), (3, 3) or (2, 2), starting at (6, 6). Moving it reruns the rule from the zero weights.',
        'The move that lands the idea is sliding p3 from (4, 4) to (3, 3): the verdict flips from "Stopped" to "Repeats", and the paired epoch\'s line settles exactly on the current one.',
        'The code panel, labelled "Perceptron learning rule", starts empty with a "+ Add language" button; each chosen language shows the same training function, returning the stopping epoch or, for a repeat, that epoch negated. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article states the perceptron convergence theorem and wants its two sides shown: separable data ends in an epoch with no mistakes, and a single moved point that breaks separability makes the weights return to an earlier value, proof that the rule never ends.',
      'A reader expects the number of epochs to track how hard the data is; the stop epochs 4, 8, 5 as the gap narrows show that the theorem promises termination, not speed.',
    ],

    avoidWhen: [
      'The subject is the arithmetic of one neuron deciding one input — weights times inputs, a sum, a threshold. No learning is needed for that, and here every step is a learning update.',
      'The article is about a multilayer network or backpropagation. There is one layer and one line here, trained by the mistake-driven rule, not by gradients.',
      'The point is a soft probability output or a loss curve. The output here is only on or off, and progress is counted as wrong points per epoch.',
    ],

    contrastWith: [
      {
        concept: 'weightedSumThreshold',
        note: 'How a single unit turns inputs into on or off is fixed arithmetic; the learning rule is what changes those weights after each mistake, and whether it ever stops depends on the data.',
      },
      {
        concept: 'logisticRegression',
        note: 'Both learn a straight boundary between two classes. Logistic regression follows the gradient of a smooth loss and settles even on overlapping data; the perceptron rule reacts only to mistakes and, when no line separates the classes, never settles.',
      },
      {
        concept: 'mlpActivation',
        note: 'One line cannot separate XOR-like data, which is exactly the case where the perceptron rule cycles. A hidden layer with a bend between layers is the remedy; the perceptron claim is only about when the single-line rule terminates.',
      },
    ],
  },
};
