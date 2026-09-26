/**
 * slideTheKernel 개념 선언.
 *
 * canonical facet 은 `facet:slideTheKernel` — 4×5 입력 위에 3×3 창(1 0 −1 / 2 1 0 / 0 −1 1)이 여섯 자리에 차례로
 * 앉는다. 자리마다 두 걸음 — 겹친 아홉 쌍의 곱이 드러나고, 그 합이 출력 칸으로 내려간다. 특징 지도는
 * 1 · 9 · 2 / 3 · 4 · 3. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `convolution` 은 보폭 · 패딩을 돌려 출력 크기를 견주고, 형제 `weightSharing` 은 무게 수를 세고,
 * `strideAndPadding` 은 두른 0 과 뛰는 자리를 말한다. 이쪽의 한 동사는 **겹쳐 곱해 한 수로 모은다** — 주인공은
 * 한 자리의 곱 아홉과 그 합이다. 그래서 definition 은 elementwise products · sum · one output cell 을 독점하고,
 * stride · padding · parameter count · output size 를 쓰지 않는다.
 *
 * 전제: 입력과 창 값은 예로 정한 것 · 교차 상관(창을 뒤집지 않는다) · 채널 하나 · 편향 · 활성 함수 없음 ·
 * 보폭 1 · 패딩 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const slideTheKernelConcept: FacetConceptSource = {
  id: 'slideTheKernel',
  label: 'Sliding the Kernel: Multiply and Sum at Each Position',
  canonicalFacet: 'facet:slideTheKernel',

  surface: {
    definition:
      'A convolutional layer computes each feature-map cell by laying a small kernel over one input patch, multiplying the overlapping pairs elementwise and summing them, then sliding one cell onward.',
    exemplarKeywords: [
      'how convolution works step by step',
      'kernel times image patch',
      'elementwise multiply and sum',
      'dot product of kernel and patch',
      'sliding window over an image',
      'feature map',
      'filter in a CNN',
      'convolution by hand',
      'cross-correlation in deep learning',
      '2D convolution example',
    ],
  },

  briefing: {
    observable: [
      'A 4×5 input grid (1 0 2 1 0 / 0 3 1 0 2 / 2 1 0 3 1 / 1 2 1 0 1), a 3×3 window with weights ×1 ×0 ×−1 / ×2 ×1 ×0 / ×0 ×−1 ×1, and an empty 2×3 "Output (feature map)". The caption reads "Input 4 × 5 · window 3 × 3 · output 2 × 3".',
      'Each position takes two steps. First the window sits on the input and a "Products" grid shows the nine products: "Window at (row 0, col 0) · overlapping pairs multiplied: 9" with products 1 0 −2 / 0 3 0 / 0 −1 0.',
      'Then the nine products collapse into one number that drops into the output: "Sum of products: 1 → output (row 0, col 0) · filled: 1 / 6".',
      'The window moves one cell right each time, and at the end of the row drops to the first position of the next row. The six sums are 1, 9, 2 on the top row and 3, 4, 3 on the bottom row; the run is thirteen steps including the start, and ends at "filled: 6 / 6".',
      'Premises the screen does not footnote: the input and weights are chosen for the example; the operation is cross-correlation, so the kernel is not flipped; one channel, no bias, no activation, stride 1, no padding.',
    ],

    screen: {
      affordances: [
        'The screen plays the six positions by itself, two steps each, and stops when the feature map is full.',
        'A Replay button and a playback strip sit below it. Dragging the strip to any odd step holds the nine products for one position before they are summed.',
        'Input, weights and products are small integers, so an article can quote any product or sum exactly as it appears.',
      ],
    },

    useWhen: [
      'The article introduces what a convolutional layer actually computes and needs one output value worked out in full: nine pairs multiplied, then added into a single cell.',
      'A reader pictures a convolution as something that looks at the whole image at once, and has to see that each output number comes only from the small patch under the window.',
    ],

    avoidWhen: [
      'The subject is how stride or padding change the output size. The window moves one cell at a time and never goes past the edge.',
      'The article is about how many parameters a convolutional layer has. Nothing is counted beyond the products of each position.',
      'The subject is image filtering in signal processing, where the kernel is flipped before sliding. Here it is laid on as it is.',
      'The point is how the weights are learned. They are fixed values.',
    ],

    contrastWith: [
      {
        concept: 'convolution',
        note: 'The multiply-and-sum at one position is the unit of work. Where that unit is applied, and so how big the output comes out, is set separately by stride and padding.',
      },
      {
        concept: 'weightSharing',
        note: 'Both slide one kernel across the input. This is about what is computed at each position; weight sharing is about the fact that the same few numbers do that work everywhere, and what that saves.',
      },
      {
        concept: 'shrinkBySummary',
        note: 'Both reduce a small window to one number, but a kernel multiplies by learned weights and adds everything under it, while max pooling has no weights and keeps just the largest value.',
      },
      {
        concept: 'filtersLearnEdges',
        note: 'Sliding computes one kernel against every patch of one input. Holding the kernel still and bringing different patterns to it asks the reverse question: which input a given kernel answers most strongly.',
      },
    ],
  },
};
