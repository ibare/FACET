/**
 * strideAndPadding 개념 선언.
 *
 * canonical facet 은 `facet:strideAndPadding` — 5×5 입력 둘레에 0 한 겹이 둘러져 7×7 이 되고, 3×3 창
 * (0 1 0 / 1 −1 1 / 0 1 0)이 두 칸씩 뛰어 아홉 자리(행 · 열 0 · 2 · 4)에 앉는다. 모서리 자리에서는 창 아홉 칸 중
 * 다섯, 변 자리에서는 셋, 가운데에서는 0 칸이 두른 0 위에 놓인다. 출력 3×3 은 −1 0 −2 / 5 0 2 / 4 4 2.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `convolution` 은 보폭 · 패딩을 **돌려** 조합마다 출력 크기와 버려지는 가장자리를 견준다. 이쪽은 한
 * 설정에 머물러 **두르고 뛴다** 는 두 동사를 본다 — 주인공은 가장자리 자리에서 창이 걸치는 0 과 두 칸 간격의
 * 자리들이다. 그래서 definition 은 ring of zeros · jumps two cells · edge positions overlap the zeros 를 독점하고,
 * 설정끼리의 견줌(compare · never covered · combinations)과 곱의 내역(products · sum)을 쓰지 않는다.
 *
 * 전제: 입력 · 창 · 패딩 1 · 보폭 2 는 예로 정한 값 · 교차 상관 · 채널 하나 · 편향 · 활성 함수 없음 · 좌표는 두른 격자 기준.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const strideAndPaddingConcept: FacetConceptSource = {
  id: 'strideAndPadding',
  label: 'Zero Padding and a Stride of Two (Where the Window Lands)',
  canonicalFacet: 'facet:strideAndPadding',

  surface: {
    definition:
      'Zero padding wraps the input in a ring of zeros so windows at the edge partly rest on them, and a stride of two makes the window jump two cells, landing on every other position.',
    exemplarKeywords: [
      'zero padding',
      'padding=1 stride=2',
      'padding the border of an image',
      'why pad before convolution',
      'edge pixels in convolution',
      'strided convolution',
      'step size of the kernel',
      'skipping positions',
      'padded input grid 7x7',
    ],
  },

  briefing: {
    observable: [
      'The start shows a 5×5 input (2 0 1 1 3 / 1 2 0 2 0 / 0 1 3 1 1 / 3 0 1 0 2 / 1 2 0 1 1), a 3×3 window (0 1 0 / 1 −1 1 / 0 1 0) and the settings "Padding: 1" and "Stride: 2".',
      'The next step wraps a ring of zeros around the input: "Padded: 7×7", "Zeros added around the input: 24", and the output size worked out as "⌊(5 + 2·1 − 3) / 2⌋ + 1 = 3".',
      'The window then jumps two cells at a time along each row and two rows at a time down — top-left corners at columns 0, 2, 4 and rows 0, 2, 4. A dot stays at each corner it sat on, and a dimension line marks the length of each jump.',
      'At every seat the cells of the window lying on the added zeros are coloured and counted: "Window at (0, 0) · zeros under it: 5 · Output (0, 0): −1 · seats: 1 / 9". Corner seats have 5, edge seats 3, and the centre seat (2, 2) has 0.',
      'Each seat writes one output cell, filling a 3×3 output with −1 0 −2 / 5 0 2 / 4 4 2. The run is eleven steps including the start.',
      'Premises the screen does not footnote: input, weights, padding 1 and stride 2 are chosen for the example; coordinates count on the padded grid; cross-correlation, one channel, no bias, no activation. The products inside a seat are not spread out.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself: the input, the ring of zeros, then nine seats one per step, and stops at "seats: 9 / 9".',
        'A Replay button and a playback strip sit below it. Dragging the strip between step 2, step 3 and step 6 compares a corner seat (5 zeros under it), an edge seat (3) and the centre seat (0).',
        'Padding and stride are fixed, so every seat, zero count and output value can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article explains what padding is for and needs the reader to see border cells finally reaching the window, with the window partly resting on the added zeros at the edges and corners.',
      'A reader does not picture what a stride of 2 means on the grid, and the article wants the window jumping over every other position and leaving a spaced pattern of seats.',
    ],

    avoidWhen: [
      'The subject is how the output size changes as stride or padding change. Both are fixed at one setting here.',
      'The article wants the products inside one window worked out. Only the finished value of each seat is shown.',
      'The subject is padding other than zeros, such as reflect or replicate padding. Only zero padding appears.',
      'The article is about padding variable-length sequences in a batch for a language model. That padding fills sequence positions, not image borders.',
    ],

    contrastWith: [
      {
        concept: 'convolution',
        note: 'Where the window lands under one choice of padding and stride is the mechanism; the output size and any unreached border are its consequences, which differ from one choice to the next.',
      },
      {
        concept: 'slideTheKernel',
        note: 'Moving one cell at a time with no padding keeps every window fully inside the input. Adding a zero border and a larger step changes which positions exist, not what is computed at each one.',
      },
      {
        concept: 'shrinkBySummary',
        note: 'Pooling with stride 2 also jumps two cells and halves the grid, but its windows do not overlap and have no weights; a strided convolution still multiplies and adds under an overlapping window.',
      },
    ],
  },
};
