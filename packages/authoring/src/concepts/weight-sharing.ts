/**
 * weightSharing 개념 선언.
 *
 * canonical facet 은 `facet:weightSharing` — 1 차원 입력 열 칸(0 1 3 1 0 2 1 3 1 0) 위로 무게 한 벌(−1 · 2 · −1)이
 * 여덟 자리를 차례로 옮겨 간다. 쓰인 자리 · 곱셈 · "따로 둔다면" 의 수는 24 까지 오르고, 둔 무게는 3 에서 움직이지
 * 않는다. 같은 조각 1 3 1 이 놓인 자리 1 · 6 이 같은 출력 4 를 낸다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `convolution` 은 보폭 · 패딩으로 출력 크기를 견주고, 형제 `slideTheKernel` 은 한 자리의 곱과 합을,
 * `strideAndPadding` 은 뛰어 앉는 자리를 말한다. 이쪽의 한 동사는 **옮겨 쓰인다** — 주인공은 세지 않고
 * 되쓰이는 무게 한 벌과, 그래서 같은 무늬가 어디서나 같은 답을 내는 것이다. 그래서 definition 은
 * parameter count · reused at every position · same pattern same response 를 독점하고, products · sum ·
 * output size · stride 를 쓰지 않는다.
 *
 * 전제: 1 차원으로 줄였다(2 차원 창도 같은 이유로 공유한다) · 교차 상관 · 편향 · 활성 함수 없음 · 채널 하나 ·
 * 보폭 1 · 패딩 없음 · 입력과 무게는 같은 무늬가 두 번 나오도록 고른 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const weightSharingConcept: FacetConceptSource = {
  id: 'weightSharing',
  label: 'Weight Sharing in Convolution (One Kernel Reused at Every Position)',
  canonicalFacet: 'facet:weightSharing',

  surface: {
    definition:
      'A convolutional layer stores a single set of kernel weights and reuses it at every input position, so its parameter count stays fixed and an identical pattern produces the identical response wherever it appears.',
    exemplarKeywords: [
      'parameter sharing',
      'shared weights in CNNs',
      'why CNNs have fewer parameters than dense layers',
      'number of parameters in a conv layer',
      'translation equivariance',
      'same feature detected anywhere in the image',
      'locally connected layer without sharing',
      '1D convolution',
      'tied weights across positions',
    ],
  },

  briefing: {
    observable: [
      'Three yellow weight tiles −1 · 2 · −1 sit above a row of ten inputs 0 1 3 1 0 2 1 3 1 0 and eight empty output slots numbered 0 to 7. The caption reads "One set of weights · output positions: 8".',
      'At each step the three tiles move one slot right, multiply the three inputs under them and drop the result into the output slot: "Position 0 → output −1", "Position 1 → output 4", and so on to −1 4 −1 −3 3 −3 4 −1.',
      'Four counters run beside it: "Positions used" climbs 1 to 8, "Multiplications" climbs by three to 24, "Weights if separate" climbs with it to 24, and "Weights stored" stays at 3 from the first step to the last. A row of dashed tiles labelled "If separate" grows to show the 24 weights that separate positions would have needed.',
      'At step 7 the caption reads "Position 6: same input as position 1 → same output 4", and at step 8 "Position 7: same input as position 2 → same output −1" — the same slice of input gives the same output in a different place.',
      'Premises the screen does not footnote: the input is one-dimensional as a simplification (a 2D kernel is shared the same way); cross-correlation, no bias, no activation, one channel, stride 1, no padding; the input and weights are chosen so that a pattern repeats.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight positions by itself, one per step, and stops after position 7.',
        'A Replay button and a playback strip sit below it. Dragging the strip between step 2 and step 7 sets the two positions holding 1 3 1 side by side with the same output 4.',
        'The numbers are fixed and small, so an article can quote every output and every counter exactly as it appears.',
      ],
    },

    useWhen: [
      'The article claims a convolutional layer needs far fewer parameters than a dense one and wants the gap shown as two counts rising apart: 3 weights stored against 24 that separate positions would need.',
      'A reader asks why a CNN recognises a feature no matter where it sits in the image, and the article needs one repeated pattern giving the same output at two positions.',
    ],

    avoidWhen: [
      'The subject is how the output size depends on stride or padding. The kernel moves one slot at a time with no padding.',
      'The article is about sharing weights across time steps in a recurrent network. The sharing here is across positions in space.',
      'The point is invariance to shifts after pooling, where the output stops changing when the input moves. Here the output moves with the pattern.',
      'The subject is weight tying between input and output embeddings in language models.',
    ],

    contrastWith: [
      {
        concept: 'sameWeightsEachStep',
        note: 'Both keep the parameter count fixed by reusing one set of weights. In a convolution the reuse is across positions in space and each use is independent; in a recurrent network it is across steps in time, and each use also takes the previous step\'s state.',
      },
      {
        concept: 'slideTheKernel',
        note: 'What the kernel computes at one position is the same operation either way. Sharing is the separate claim that one small set of numbers does that work everywhere, and what that saves.',
      },
      {
        concept: 'convolution',
        note: 'The weight count stays the same whatever the stride and padding, because of sharing; what stride and padding change instead is how many positions there are and how large the output is.',
      },
    ],
  },
};
