/**
 * convolution 개념 선언.
 *
 * canonical facet 은 `facet:convolution` — 같은 3×3 창(가운데 4 · 상하좌우 −1)을 같은 8×8 입력에 대고, 손잡이 둘
 * 보폭(1 · 2 · 3, 처음 2)과 패딩(0 · 1, 처음 1)을 돌린다. 걸음 하나가 출력 한 줄이고, 끝 걸음에 창이 한 번도 닿지
 * 못한 입력 칸을 센다. 여섯 조합이 출력 6×6 · 3×3 · 2×2 · 8×8 · 4×4 · 3×3 과 버린 칸 0 · 15 · 28 · 0 · 0 · 0 을 낸다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 한 자리의 곱 아홉과 합(`slideTheKernel`) · 무게 한 벌이 자리마다 되쓰임
 * (`weightSharing`) · 한 설정(패딩 1 · 보폭 2)에서 창이 두른 0 위에 걸치며 뛰어 앉음(`strideAndPadding`).
 * 이쪽은 **손잡이를 돌려 조합끼리 견주는 것**을 맡는다. 그래서 definition 은 output size · combinations ·
 * never covered · border rows 를 쥐고, 조각들이 독점한 products · sum · parameter count · zeros under the window ·
 * jumps two cells 를 쓰지 않는다. 무게 수 9 는 "그대로" 로만 말한다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `convolution.md` 가 밝힌 것):
 *  - 교차 상관이다(창을 뒤집지 않는다). 편향 없음 · 채널 하나.
 *  - 입력과 창 값은 예로 정한 것이고, 창은 라플라시안 꼴이다. 두르는 값은 0.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것 — 두른 격자를 만들지 않고 입력 밖을 0 으로 읽으며, 쓰임을 한 축으로 센다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const convolutionConcept: FacetConceptSource = {
  id: 'convolution',
  label: 'Convolution: How Stride and Padding Set the Output Size',
  canonicalFacet: 'facet:convolution',

  surface: {
    definition:
      'Across combinations of stride and zero padding, one fixed 3×3 convolution kernel lands on different input positions, which decide the output size and whether border rows are never covered.',
    exemplarKeywords: [
      'convolution output size formula',
      'floor((n + 2p - k) / s) + 1',
      'stride and padding hyperparameters',
      'same padding vs valid padding',
      'CNN output shape calculation',
      'conv2d stride padding',
      'input pixels ignored by the convolution',
      'downsampling with strided convolution',
      'Laplacian kernel',
      'feature map size',
    ],
  },

  briefing: {
    observable: [
      'An 8×8 input grid, a 3×3 window (0 −1 0 / −1 4 −1 / 0 −1 0) and an output grid are shown together. At the start of each round the output side is written out, for the default "Output side: ⌊(8 + 2·1 − 3) / 2⌋ + 1 = 4", with "Stride 2 · padding 1 · window positions: 16".',
      'With padding 1 the next step wraps the input in a ring of zeros: "Wrap one ring of 0 — grid 10×10", "Padded cells: 36". With padding 0 there is no such step.',
      'Each further step fills one output row: the window frame moves along that row from left to right, a dot marks each position at the window\'s top-left cell, and a caption such as "Output row 1: 4 −4 6 −1" appears with "Positions: 4 · input cells reached: 16". A shade on each input cell counts how many times it has been inside the window.',
      'The last step counts coverage — "Dropped input cells: 0 · corner use: 1 · max use: 4" and "The window reaches every input row and column" for the default. With padding 0 and stride 2 the 8th row and column are marked as never reached (15 cells dropped); with stride 3 the 7th and 8th are (28 cells).',
      'Across the six settings: stride 1/2/3 with padding 0 give outputs 6×6, 3×3, 2×2 from 36, 9, 4 positions; with padding 1 they give 8×8, 4×4, 3×3 from 64, 16, 9 positions and drop no cells. Stride 1 with padding 1 keeps the output the same size as the input.',
      'The shading pattern differs by stride: centre cells are covered up to 9 times at stride 1, 4 times at stride 2, and once at stride 3.',
      'Premises the screen does not footnote: this is cross-correlation (the kernel is not flipped), with no bias and one channel; the input and kernel values are chosen for the example; the padding value is 0.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a "Stride" slider (1, 2, 3, starting at 2) and a "Padding" slider (0, 1, starting at 1). A round plays every output row, then the coverage count, then waits for the handles; the longest setting takes 11 steps.',
        'Three readouts sit under the controls: "Positions", "Weights" and "Dropped cells". Weights reads 9 in every setting.',
        'The move that makes the idea land is holding padding at 0 and stepping the stride from 1 to 3: the position dots thin out, the output shrinks from 6×6 to 2×2, and the last rows of the input go unreached. Switching padding to 1 then brings them back.',
        'The code panel, labelled "Convolution", starts empty with a "+ Add language" button; the chosen language shows a `convolve` function and a `droppedCells` function and highlights the lines of the current phase. It reads cells outside the input as 0 instead of building a padded grid, and carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article gives the output-size formula for a convolutional layer and wants the reader to check it against six concrete settings, including one where the output keeps the input size and ones where it shrinks to 2×2.',
      'A reader is surprised that a strided convolution without padding silently ignores the last rows of an image, and the article needs the dropped cells counted and marked.',
    ],

    avoidWhen: [
      'The article explains how a single output value is computed from the kernel and the patch under it. The products are never spread out here; only finished output rows appear.',
      'The subject is multiple channels, bias terms, dilation or transposed convolution. There is one channel, no bias, and neither dilation nor upsampling.',
      'The article is about convolution in signal processing, where the kernel is flipped. The operation here is cross-correlation.',
      'The point is how the kernel weights are learned. The kernel is fixed throughout.',
    ],

    contrastWith: [
      {
        concept: 'slideTheKernel',
        note: 'Computing one output cell as a sum of products is the operation itself; how stride and padding choose where that operation is applied decides the size of the output and which inputs it never sees.',
      },
      {
        concept: 'strideAndPadding',
        note: 'One fixed choice of padding and stride explains where the window lands and how often it overlaps the added zeros. The output size and any uncovered border are what follow from those choices, and they change as the choices change.',
      },
      {
        concept: 'weightSharing',
        note: 'Reusing one kernel at every position is why the weight count stays at nine in every setting; the claim here is about positions and output size, and treats that constant only as a fixed point.',
      },
      {
        concept: 'receptiveField',
        note: 'Stride and padding decide what one layer covers of its input. How far a cell several layers up reaches back into the input is a question about stacking layers.',
      },
    ],
  },
};
