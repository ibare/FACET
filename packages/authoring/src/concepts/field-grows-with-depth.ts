/**
 * fieldGrowsWithDepth 개념 선언.
 *
 * canonical facet 은 `facet:fieldGrowsWithDepth` — 입력 7×7 위에 3×3 창의 합성곱 층 셋(7 → 5 → 3 → 1)을 쌓는다.
 * 맨 위 층 3 의 칸 하나에서 출발해 한 층씩 거슬러 내려가며 기대는 칸이 3×3 = 9 · 5×5 = 25 · 7×7 = 49 로 번진다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `receptiveField` 는 층 수와 풀링 유무를 돌려 넓어지는 속도를 견준다. 이쪽은 풀링 없이 **거슬러 넓어진다**
 * 한 동사만 본다 — 주인공은 층마다 사방으로 한 칸씩 번지는 자리, 그리고 창은 늘 3×3 인데 영역이 커진다는 것이다.
 * 그래서 definition 은 one cell on every side · kernel stays 3×3 · depth 를 독점하고, pooling · doubles ·
 * weight count 를 쓰지 않는다.
 *
 * 전제: 층 셋 · 창 3×3 · 보폭 1 · 패딩 없음 · 입력 7×7 은 예로 정한 값 · 채널 하나 · 자리만 셈한다(칸의 값 없음) ·
 * 유효 수용 영역은 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fieldGrowsWithDepthConcept: FacetConceptSource = {
  id: 'fieldGrowsWithDepth',
  label: 'Receptive Field Grows With Depth',
  canonicalFacet: 'facet:fieldGrowsWithDepth',

  surface: {
    definition:
      'Tracing a single cell of the third stacked 3×3 convolution back down, the positions it relies on spread one cell outward on every side per layer — 3×3, 5×5, 7×7 — though each kernel stays 3×3.',
    exemplarKeywords: [
      'receptive field',
      'deeper layers see more of the image',
      'stacking small kernels instead of one large kernel',
      'two 3x3 convolutions equal one 5x5 receptive field',
      '1 + L(k - 1)',
      'hierarchical features in CNNs',
      'local to global',
      'what a neuron in a deep layer sees',
    ],
  },

  briefing: {
    observable: [
      'Four grids stand side by side, the input on the left and the top layer on the right: "Input 7 × 7", "Layer 1 5 × 5", "Layer 2 3 × 3", "Layer 3 1 × 1", with a "window 3 × 3" tag between each pair.',
      'The start marks the single cell of Layer 3: "Start in Layer 3: 1 × 1 = 1".',
      'Each step moves one layer down and colours the cells the marked region relies on, spreading one cell further on every side: "Relied on in Layer 2: 3 × 3 = 9", then "Relied on in Layer 1: 5 × 5 = 25", then "Relied on in Input: 7 × 7 = 49" — the whole input.',
      'The window tag between layers reads 3 × 3 at every level while the coloured region widens. The run is four steps including the start.',
      'Premises the screen does not footnote: three layers, 3×3 kernels, stride 1, no padding and a 7×7 input are chosen for the example; one channel; only positions are traced, with no cell values or products.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one layer per step, and stops when the region reaches the input.',
        'A Replay button and a playback strip sit below it. Dragging the strip back and forth between steps 1 and 3 shows the region growing from 9 to 49 cells.',
        'Sizes and counts are fixed, so an article can quote 9, 25 and 49 exactly as they appear.',
      ],
    },

    useWhen: [
      'The article argues that stacking small 3×3 kernels lets a deep cell see a wide patch of the image, and needs the growth traced one layer at a time: 3, then 5, then 7 across.',
      'A reader asks how a cell in a deep layer can respond to a large object when every kernel is only 3×3.',
    ],

    avoidWhen: [
      'The subject is how pooling or strided layers enlarge the receptive field faster. There is no pooling and every stride is 1.',
      'The article is about how the output value of a cell is computed. No values appear; only positions are marked.',
      'The subject is the effective receptive field, where central inputs matter more. Every cell in the region is marked the same.',
      'The point is the parameter savings of two 3×3 layers over one 5×5 layer. Weights are not counted here.',
    ],

    contrastWith: [
      {
        concept: 'receptiveField',
        note: 'Plain convolutions widen the region by the same amount at every layer. Putting downsampling between them multiplies that amount, so the region grows far faster for the same number of learned layers.',
      },
      {
        concept: 'slideTheKernel',
        note: 'One layer\'s kernel looks at a 3×3 patch of the layer just below. The receptive field follows that dependence through several layers, all the way to the input.',
      },
      {
        concept: 'attendToAllAtOnce',
        note: 'Convolution reaches distant inputs only by stacking layers, a few cells per layer. Self-attention lets every position draw on every other one within a single layer.',
      },
    ],
  },
};
