/**
 * shrinkBySummary 개념 선언.
 *
 * canonical facet 은 `facet:shrinkBySummary` — 4×4 특징 지도(1 4 0 2 / 3 2 5 1 / 0 6 2 3 / 2 1 4 0) 위에 2×2 창이
 * 보폭 2 로 겹치지 않고 네 자리에 앉는다. 창마다 가장 큰 수(4 · 5 · 6 · 4)만 줄어든 2×2 지도로 올라가고 나머지
 * 셋은 아래로 떨어져 나간다. 남은 칸 4 · 버린 칸 12. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이 조각의 origin 은 토픽 `pooling` 이었고, 그 토픽은 완제품 `receptiveField` 로 합쳐졌다. 그 완제품에서 풀링은
 * 자리를 반으로 줄이는 층으로만 나오고 값이 없다. 이쪽은 **추려 올린다** 한 동사 — 주인공은 올라가는 하나와
 * 떨어져 나가는 셋, 그리고 함께 버려지는 "어느 칸이었나" 다. 그래서 definition 은 largest value · discards ·
 * position within the window 를 독점하고, receptive field · layers · depth 를 쓰지 않는다.
 *
 * 전제: 특징 지도 값은 예로 정한 것(앞 층의 ReLU 를 지난 지도로 보아 음수 없음) · 채널 하나 · 창 안 동률 없음 ·
 * 평균 풀링은 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shrinkBySummaryConcept: FacetConceptSource = {
  id: 'shrinkBySummary',
  label: 'Max Pooling (Keep the Largest, Drop the Rest)',
  canonicalFacet: 'facet:shrinkBySummary',

  surface: {
    definition:
      'Max pooling cuts a feature map into non-overlapping 2×2 windows and passes up only the largest of each four values, discarding the other three along with where the maximum sat.',
    exemplarKeywords: [
      'max pooling',
      'pooling layer',
      'MaxPool2d kernel 2 stride 2',
      'downsampling a feature map',
      'halving width and height',
      'pooling has no learnable parameters',
      'small shifts tolerated after pooling',
      'subsampling in CNNs',
      'spatial reduction',
    ],
  },

  briefing: {
    observable: [
      'A 4×4 "Feature map" (1 4 0 2 / 3 2 5 1 / 0 6 2 3 / 2 1 4 0) sits beside an empty 2×2 "Pooled map". The caption reads "Each 2×2 window keeps only its largest value. Stride: 2." with "Kept: 0" and "Dropped: 0".',
      'The window sits on four places in turn, never overlapping: (0, 0), (0, 2), (2, 0), (2, 2). Each time the caption names the winner — "Window at (0, 0): largest is 4, at (0, 1)." and "Only it goes up; the other cells fall away."',
      'The largest value rises into its cell of the pooled map, and the other three drop into a row beneath, where they stay. The winners are 4, 5, 6 and 4.',
      '"Kept" climbs 1, 2, 3, 4 and "Dropped" climbs 3, 6, 9, 12; the last step adds "Cells: 16 → 4". The pooled map shows only 4 5 / 6 4, with nothing recording which cell of each window the value came from. The run is five steps including the start.',
      'Premises the screen does not footnote: the feature-map values are chosen for the example and read as the output of a ReLU, so none are negative; one channel; no window has a tie for the largest value.',
    ],

    screen: {
      affordances: [
        'The screen plays the four windows by itself, one per step, and stops when the pooled map is full.',
        'A Replay button and a playback strip sit below it. Dragging the strip to step 1 holds the moment the 4 at (0, 1) rises while 1, 3 and 2 fall.',
        'All values are fixed, so the kept and dropped cells can be quoted exactly as they appear.',
      ],
    },

    useWhen: [
      'The article introduces the pooling layer of a CNN and needs one pass worked out: which value each 2×2 window keeps, which three it throws away, and a 4×4 map becoming 2×2.',
      'A reader wonders what information pooling loses, and the article wants to show that strength survives while the exact position inside the window does not.',
    ],

    avoidWhen: [
      'The subject is average pooling or global average pooling. Only the maximum is taken here.',
      'The article is about how pooling widens the receptive field of later layers. Only one pooling layer on one map is shown.',
      'The subject is pooling of token embeddings in language models (mean or CLS pooling). The windows here are 2×2 patches of a grid.',
      'The point is a convolution with weights. Nothing is multiplied here.',
    ],

    contrastWith: [
      {
        concept: 'receptiveField',
        note: 'Which value survives is what pooling does to the numbers. What it does to the geometry — each cell above now standing for a block twice as wide below — is what makes later layers see more of the input.',
      },
      {
        concept: 'slideTheKernel',
        note: 'A convolution window multiplies by weights and adds everything under it, and its windows overlap. A pooling window has no weights, never overlaps its neighbours, and keeps one value instead of combining them.',
      },
      {
        concept: 'strideAndPadding',
        note: 'Both move a window two cells at a time and shrink the grid. A strided convolution still combines every cell under its window with weights; pooling selects.',
      },
    ],
  },
};
