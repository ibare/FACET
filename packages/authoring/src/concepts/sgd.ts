/**
 * sgd 개념 선언.
 *
 * canonical facet 은 `facet:sgd` — 점 열여섯에 직선 ŷ = w·x + b 를 두 에폭 동안 맞춘다. 섞은 차례 한 벌은 고정이고
 * 손잡이 "묶음 크기"(1 · 2 · 4 · 8 · 16, 처음 2)가 그 차례를 B 점씩 끊는다. 갱신마다 전체 내리막에서 이 갱신이
 * 간 방향까지의 각(비낌)이 바늘로 서고, 90° 를 넘으면 거꾸로 간 갱신으로 센다. B 가 작을수록 갱신 수 · 평균 비낌 ·
 * 거꾸로 간 갱신이 늘고, 같은 두 에폭 끝의 손실은 낮다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `oneBatchAtATime` 은 한 바퀴 동안 전체 배치는 한 번, 미니배치는 네 번 움직이는 장면(몇 번), `noisyPath` 는
 * 점 하나의 기울기가 진짜 내리막에서 이쪽저쪽으로 비끼는 장면(어느 쪽)이다. 이쪽은 **묶음 크기 하나를 돌려 그 둘이
 * 함께 바뀌는 것**을 쥔다. definition 은 batch size · per epoch · average angle · against the full gradient 를 쥐고,
 * 조각들의 waits to see every example · single example · zigzag 를 쓰지 않는다.
 *
 * 전제 (설명 글 `sgd.md`):
 *  - 점 열여섯은 y ≈ 1.5x + 0.5 에 흩어짐을 더한 장난감 자료, η 0.05 · 출발 (0, 0). 섞은 차례는 한 벌로 고정했다.
 *  - 같은 에폭 수로 견준 것이다 — 갱신 수를 여덟으로 맞추면 B 1 이 가장 나쁘다. "작은 묶음이 늘 낫다" 가 아니다.
 *  - 코드 패널은 거꾸로 간 갱신을 내적의 부호로 센다. 각 자체는 화면이 따로 셈한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sgdConcept: FacetConceptSource = {
  id: 'sgd',
  label: 'Stochastic Gradient Descent and Mini-Batch Size',
  canonicalFacet: 'facet:sgd',

  surface: {
    definition:
      'Shrinking the mini-batch size multiplies the number of updates per epoch and widens their average angle from the full-dataset gradient, until some updates point against it.',
    exemplarKeywords: [
      'stochastic gradient descent',
      'SGD',
      'mini-batch gradient descent',
      'batch size',
      'batch size 1 vs full batch',
      'updates per epoch',
      'gradient noise',
      'epoch',
      'shuffling the training data',
      'choosing a batch size',
      'PyTorch DataLoader batch_size',
    ],
  },

  briefing: {
    observable: [
      'A strip with two rows, "Epoch 1" and "Epoch 2", holds the sixteen point numbers in each epoch\'s fixed shuffled order. Bold dividers cut it into batches of B: 32 one-point batches at B 1, two sixteen-point batches at B 16.',
      'Each update raises a needle over its batch. Up is the full-data downhill direction; the needle tilts by the angle between that and where this update actually went, labelled in degrees. A needle past 90° drops below the dashed line — the legend reads "below the dashed line = against it (past 90°)".',
      'At the default B 2 the round is 20 steps: the start, one step per epoch lighting its order, sixteen updates and a final step. Two updates go against the full downhill (127° and 105°, both in epoch 2), and the end reads "After 2 epochs: 16 updates · 2 against the downhill · mean |skew| 39°", with "w = 1.30, b = 0.34 · full loss 0.328".',
      'Across the handle, B 1 · 2 · 4 · 8 · 16 give 32 · 16 · 8 · 4 · 2 updates, 7 · 2 · 0 · 0 · 0 against the downhill, mean skew 65° · 39° · 15° · 14° · 0°, and final full loss 0.290 · 0.328 · 0.634 · 1.263 · 1.970 from a start of 3.173. At B 16 each batch is all the data, so both needles stand straight up.',
      'Two readouts carry the round: "Updates" and "Against downhill".',
      'Everything is compared over the same two epochs. The data are sixteen toy points, the learning rate 0.05 and the shuffled order one fixed draw; with the number of updates fixed at eight instead, B 1 ends worst. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle, "Batch size", with 1 · 2 · 4 · 8 · 16 (starts at 2). Turning it slides the batch dividers on the strip to their new places and replays both epochs from (0, 0).',
        'The move that makes the idea land is going from 16 down to 1: two upright needles become thirty-two needles leaning every way, seven of them below the dashed line, while the final loss falls.',
        'The code panel, labelled "Mini-batch updates over two epochs", starts empty with an add-language button; the chosen language shows `sgdEpochs`, which updates on each batch gradient and counts an update as against the downhill when its dot product with the full gradient is negative. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article has to explain what the batch size changes in training and wants the two effects — more updates per epoch and noisier directions — to move together on one handle.',
      'A reader thinks a mini-batch gradient is just a smaller copy of the full gradient; at B 1 seven of 32 updates push against the full-data downhill.',
      'The article warns against concluding that smaller batches are simply better, and needs a comparison where the result depends on fixing epochs rather than updates.',
    ],

    avoidWhen: [
      'The subject is batch size as a hardware or memory trade-off, or learning-rate scaling rules for large batches. Neither is shown.',
      'The article is about the path of the weights on a contour map of the loss. The screen shows angles on a strip, not the weight path.',
      'The point is batch normalization. "Batch" here only decides how many points feed each update.',
    ],

    contrastWith: [
      {
        concept: 'oneBatchAtATime',
        note: 'Moving after every small batch instead of once per pass is the first difference; varying the batch size shows it together with how far each such move strays from the full direction.',
      },
      {
        concept: 'noisyPath',
        note: 'A single example\'s gradient pointing off the true downhill is the source of the noise; the batch size is the dial that sets how much of it each update carries.',
      },
      {
        concept: 'gradientDescent',
        note: 'Full-batch gradient descent uses the exact gradient at every update; the stochastic version trades that exactness for more updates from the same data.',
      },
      {
        concept: 'batchnorm',
        note: 'Both depend on the mini-batch, but in different ways: in stochastic descent the batch decides which points shape one weight update, in batch normalization it decides the statistics a value is rescaled with.',
      },
      {
        concept: 'earlyStopping',
        note: 'Both count training in epochs; the batch-size question is what happens inside a fixed number of epochs, the early-stopping question is how many epochs to run.',
      },
    ],
  },
};
