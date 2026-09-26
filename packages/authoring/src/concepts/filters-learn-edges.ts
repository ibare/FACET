/**
 * filtersLearnEdges 개념 선언.
 *
 * canonical facet 은 `facet:filtersLearnEdges` — 배운 것으로 정한 3×3 창(−1.0 0.2 1.1 / −1.2 0.1 0.9 / −0.8 −0.1 1.0)은
 * 제자리에 있고, 무늬 다섯이 차례로 와서 맞대어진다. 응답은 세로 경계 3.0 · 가로 경계 0.1 · 고른 면 0.2 · 대각선 0.4 ·
 * 뒤집힌 세로 경계 −3.0. 끝에 응답 큰 것부터 늘어선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `learnedFilter` 는 0 에서 시작한 창을 과제마다 배워 모양이 갈리는 것을 보인다. 이쪽은 학습을 그리지 않고,
 * 다 된 창 하나에 **맞대어 가려진다** 한 동사만 본다 — 주인공은 응답의 차례, 그리고 맨 앞이 창의 값을 닮은 무늬,
 * 맨 뒤가 그 반전이라는 것이다. 그래서 definition 은 responds · ranked · reversed · resembles its own weights 를
 * 독점하고, training · gradient · target · starting from zero 를 쓰지 않는다.
 *
 * 전제: 창의 값은 학습으로 얻은 것이 아니라 알려진 경향(첫 층 창이 경계를 닮는다)을 본떠 예로 정한 것 ·
 * 교차 상관 · 편향 · 활성 함수 없음 · 채널 하나 · 응답은 배정도로 셈하고 표시만 소수 한 자리.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const filtersLearnEdgesConcept: FacetConceptSource = {
  id: 'filtersLearnEdges',
  label: 'What a Trained Filter Responds To (Probing With Patterns)',
  canonicalFacet: 'facet:filtersLearnEdges',

  surface: {
    definition:
      'Probing one trained 3×3 filter with several input patterns and ranking their responses shows it responds most to the pattern its own weights resemble, a vertical edge, and most negatively to that edge reversed.',
    exemplarKeywords: [
      'edge detector filter',
      'what does a convolution filter detect',
      'filter response to patterns',
      'template matching',
      'vertical edge kernel',
      'Sobel-like kernel',
      'negative response to the inverted pattern',
      'a filter looks like what it detects',
      'feature detector',
    ],
  },

  briefing: {
    observable: [
      'A 3×3 "Window" stands still at the top with values −1.0 0.2 1.1 / −1.2 0.1 0.9 / −0.8 −0.1 1.0, shaded on the same grey ladder as the patterns, so it reads as dark on the left and bright on the right. The caption says "The window stays put. Patterns come to it one at a time."',
      'Five patterns rest on a tray below: "Vertical edge", "Horizontal edge", "Flat", "Diagonal", "Reversed edge", each drawn in two brightnesses, 0 and 1.',
      'One per step, a pattern rises and presses against the window, and its response appears as a bar at its place on the tray, up for positive and down for negative: "Against the window: Vertical edge. Response: 3.0", then Horizontal edge 0.1, Flat 0.2, Diagonal 0.4, Reversed edge −3.0.',
      'The last step lines the patterns up by response: Vertical edge, Diagonal, Flat, Horizontal edge, Reversed edge — "Lined up by response. Largest: Vertical edge (3.0). Smallest: Reversed edge (−3.0)." The run is seven steps including the start.',
      'Premises the screen does not footnote: the window values are set by hand to imitate the edge-like filters trained CNNs are known to learn, not produced by training here; response is the sum of nine elementwise products with no bias and no activation; values are shown to one decimal place.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself: five patterns pressed one at a time, then the ranking, and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip between step 1 and step 5 sets the vertical edge (3.0) against its reversal (−3.0).',
        'Weights, patterns and responses are fixed, so every number can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article claims that a learned convolution filter is a detector for the pattern it resembles, and needs a filter tested against several patterns with the strongest and weakest responses named.',
      'A reader wants to know what "this filter detects vertical edges" means in numbers, and the article wants the edge scoring 3.0 while the flipped edge scores −3.0 and a flat patch scores near zero.',
    ],

    avoidWhen: [
      'The subject is how the filter came to have these weights through training. The values are given, and nothing is learned on screen.',
      'The article is about sliding the filter over an image to build a feature map. The filter stays still and patterns come to it.',
      'The subject is hand-designed image-processing kernels such as Sobel for their own sake, with gradients and magnitudes. This is one small filter and five 0-or-1 patterns.',
      'The point is visualising what deep layers or whole networks respond to.',
    ],

    contrastWith: [
      {
        concept: 'learnedFilter',
        note: 'A filter\'s strongest response going to the pattern it resembles is a property of finished weights. Why the weights have that shape is a question about training: they take the form of whatever target they were trained against.',
      },
      {
        concept: 'slideTheKernel',
        note: 'Sliding asks what one fixed kernel produces at every position of one input. Here the question is turned around: which of several inputs, placed in the same position, one kernel answers most strongly.',
      },
      {
        concept: 'angleNotLength',
        note: 'The response here is a raw sum of products, so it grows with both how well the pattern lines up with the weights and how large they are; a cosine keeps only the first.',
      },
    ],
  },
};
