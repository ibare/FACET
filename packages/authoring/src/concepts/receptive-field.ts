/**
 * receptiveField 개념 선언.
 *
 * canonical facet 은 `facet:receptiveField` — 3×3 합성곱(보폭 1)을 1 · 2 · 3 층 쌓고, 손잡이로 그 사이에 2×2 풀링
 * (보폭 2)을 끼우거나 뺀다. 판마다 맨 위 층의 가운데 칸 하나에서 출발해 한 층씩 거슬러 내려가며 기대는 칸을
 * 칠하고, 마지막 걸음이 입력 18×18 에 닿는다. 입력에서의 한 변은 풀링 없이 3 · 5 · 7, 풀링을 끼우면 3 · 8 · 18.
 * 배우는 무게는 같은 층 수면 같다(9 · 18 · 27).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `fieldGrowsWithDepth` 는 합성곱만 쌓아 한 층에 한 칸씩 번지는 한 장면을, `shrinkBySummary` 는 최댓값 풀링
 * 창 하나가 넷 중 하나를 남기는 장면을 맡는다. 이쪽은 **두 손잡이로 층 수와 풀링 유무를 견주는 것**을 맡는다 —
 * 주장은 "풀링 층을 거스르면 걸음이 두 배가 되어 영역이 거의 곱으로 넓어지고, 무게 수는 그대로" 다. 그래서
 * definition 은 with and without pooling · doubles · weight count unchanged 를 쥐고, 조각들이 독점한
 * one cell on every side · largest value · discarded 를 쓰지 않는다. 풀링은 자리를 반으로 줄이는 층으로만 나온다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `receptiveField.md` 가 밝힌 것):
 *  - 풀링은 합성곱 **사이에만** 둔다(맨 위 합성곱 뒤에는 없다) — 그래서 층 1 에서는 풀링 손잡이가 화면을 바꾸지 않는다.
 *  - 풀링은 최댓값이지만 자리만 센다. 칸의 값이 없다. 창 네 칸을 모두 "기대는 칸" 으로 센다.
 *  - 입력 한 변 18 · 맨 위 칸을 가운데로 고른 것은 예로 정한 것. 교차 상관 · 채널 하나 · 패딩 없음.
 *  - 이론상 수용 영역이다. 유효 수용 영역(가운데로 몰림)은 더 좁고, 다루지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것 — 같은 구간을 한 축으로 셈한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const receptiveFieldConcept: FacetConceptSource = {
  id: 'receptiveField',
  label: 'Receptive Field: Stacked Convolutions With and Without Pooling',
  canonicalFacet: 'facet:receptiveField',

  surface: {
    definition:
      'How much of the input one top-layer cell depends on in stacked 3×3 convolutions, compared with and without pooling between them: pooling roughly doubles the region per layer while the learned weight count stays unchanged.',
    exemplarKeywords: [
      'receptive field size calculation',
      'receptive field of a CNN',
      'effect of pooling on receptive field',
      'downsampling enlarges the receptive field',
      'VGG stacked 3x3 convolutions',
      'global context in deep layers',
      'pooling layer has no parameters',
      'receptive field formula with stride',
      'how deep networks see the whole image',
    ],
  },

  briefing: {
    observable: [
      'Layer grids are drawn as flat planes stacked at an angle: the 18×18 input at the bottom, always in the same place, and above it the convolution and pooling layers, each labelled with its size — for the default "Input 18×18 · Conv 1 16×16 · Pool 1 8×8 · Conv 2 6×6 · Pool 2 3×3 · Conv 3 1×1".',
      'A round starts at one cell of the top layer ("Top layer Conv 3 · one cell at row 1, column 1") with "Learned weights: 27", then descends one layer per step, colouring the cells that the region above relies on and naming the window it went back through: "Back through the conv window, one layer down · k 3 · s 1" or "Back through the pooling window, one layer down · k 2 · s 2".',
      'Each step reports the region in that layer, for example "Pool 2: rows and columns 1–3 · side 3 · 9 cells", "Conv 2: rows and columns 1–6 · side 6 · 36 cells". Passing back through a pooling layer nearly doubles the side (3 → 6, 8 → 16); passing through a convolution adds 2.',
      'The last step reaches the input. Without pooling the final side is 3, 5, 7 for 1, 2, 3 conv layers; with pooling it is 3, 8, 18, and with three layers the region covers all 324 input cells. A dashed frame on the input shows the previous round\'s final region and moves to the new one.',
      'The learned weight count is 9 per convolution layer — 9, 18, 27 — and is the same with or without pooling. With one conv layer the pooling handle changes nothing, because pooling sits only between convolutions.',
      'Premises the screen does not footnote: pooling is max pooling but only positions are counted (cells have no values); the input side of 18 and the choice of the top layer\'s centre cell are for the example; this is the theoretical receptive field — the effective one, where influence concentrates near the centre, is narrower.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a "Conv layers" slider (1, 2, 3, starting at 3) and a "Pooling between" slider (Off, On, starting at On). A round descends from the top cell to the input and then waits for the handles.',
        'Three readouts sit under the controls: "Field side", "Field cells" and "Learned weights".',
        'The move that makes the idea land is keeping three conv layers and switching pooling Off and On: the final region on the input jumps between 7×7 and 18×18 while Learned weights stays at 27.',
        'The code panel, labelled "Field side, one axis", starts empty with a "+ Add language" button; the chosen language shows a `fieldSide` function that walks down the layers widening an interval, and highlights the lines of the current phase. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why CNNs insert downsampling between convolutions and wants the effect measured: with three layers the top cell sees a 7×7 patch without pooling and the whole 18×18 input with it, at the same 27 weights.',
      'A reader needs the receptive-field size worked out for a small architecture, layer by layer, with the jump at each pooling layer visible.',
    ],

    avoidWhen: [
      'The subject is which value max pooling keeps and what it throws away. Cells carry no values here; pooling appears only as a layer that halves the grid.',
      'The article is about the effective receptive field or how much each input cell influences the output. Every cell in the region is counted equally.',
      'The subject is dilated convolutions, stride or padding choices within a convolution. Convolutions here always use stride 1 and no padding.',
      'The point is attention spanning the whole input in a single layer.',
    ],

    contrastWith: [
      {
        concept: 'fieldGrowsWithDepth',
        note: 'Convolutions alone widen the region by a fixed amount per layer, so it grows linearly with depth. Downsampling between them multiplies the step for every layer below, so the region grows much faster for the same depth.',
      },
      {
        concept: 'shrinkBySummary',
        note: 'Max pooling is a choice of which value survives in each window. For the region a top cell depends on, only the window\'s size and stride matter — every cell in the window counts.',
      },
      {
        concept: 'convolution',
        note: 'Stride and padding settle what one layer covers of its own input. The receptive field compounds that coverage across a stack of layers.',
      },
    ],
  },
};
