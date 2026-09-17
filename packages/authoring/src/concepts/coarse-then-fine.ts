/**
 * coarseThenFine 개념 선언.
 *
 * canonical facet 은 `facet:coarseThenFine` — 조각이다. 같은 평면이 판 세 장으로
 * 계단처럼 어긋 쌓여 있고 (L2 넷 · L1 여덟 · L0 열여섯), 고리가 판 안에서는 실선을
 * 따라 옮기고 판 사이에서는 점선을 따라 같은 좌표로 떨어진다. 위층에서 두 걸음,
 * 가운데 층에서 한 걸음, 맨 아래층에서는 한 걸음도 떼지 못하고 멎는다. 마지막에
 * 같은 출발점에서 맨 아래층 한 장만으로 다시 걸어 여덟 대 열다섯을 견준다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **층 사이에서 자리를 물려주는 일** 이다 — 위가 성기고
 * 아래가 촘촘하다는 것, 성긴 데서 걸음이 크고 촘촘한 데서 잘다는 것, 그리고 멎은
 * 자리가 버려지지 않고 아래층의 출발이 된다는 것. definition 의 주어가 "겹쳐 쌓인
 * 같은 공간" 이고, 낱말은 성김 · 촘촘함 · 물려줌 · 건너뜀뿐이다.
 *
 * definition 에 "층(layer)" 이라는 낱말을 아예 쓰지 않았다 — 완제품 `hnsw` 가
 * 깊이를 말하며 그 낱말을 쥐고 있어서다. 걷는 일의 어휘(이음 · 들여다봄 · 멎음)는
 * `neighborsLinkedAhead` 의 것이라 여기서는 쓰지 않는다.
 *
 * 이 화면이 재는 값은 **출발점을 같게 둔 한 번의 견줌**이다. 출발 자리가 바뀌면
 * 어떻게 되는가는 여기서 답하지 않으므로 avoidWhen 이 그 자리를 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const coarseThenFineConcept: FacetConceptSource = {
  id: 'coarseThenFine',
  label: 'Coarse Above, Fine Below (Handing the Spot Down)',
  canonicalFacet: 'facet:coarseThenFine',

  surface: {
    definition:
      'Stacked copies of one space, sparse above and complete below: where a copy settles is handed down to the next copy, so the long jumps fall to the thinly populated copies and the short ones to the full copy.',
    exemplarKeywords: [
      'coarse to fine search',
      'a sparse copy above and the full collection below',
      'long jumps first and short ones afterwards',
      'multi-resolution index',
      'zoom in from a rough position',
      'the thin copy acts as a map of the full one',
      'hand a position down to the level beneath',
      'settle the position roughly before settling it finely',
      'each level holds a subset of the one below it',
      'fewer measurements than searching the full set flat',
    ],
  },

  briefing: {
    observable: [
      'Three sheets of the same plane are stepped down and across like stairs, drawn at one scale with every position in the same place on all three. The top sheet holds four points, the middle eight, the bottom all sixteen, and each sheet carries its own name in the corner.',
      'The same crosshair sits at the same spot on all three sheets, so the fact that only the density changes from sheet to sheet is something the reader reads off the picture instead of taking on trust.',
      'A ring labelled with the point it occupies does the moving, and it moves in two distinguishable ways: inside a sheet it slides along a solid line to the next point, while between sheets it falls along a dashed line straight down to the identical position on the sheet below.',
      'A point lights up when its distance is first measured, and only on the sheet where that first happened — so the count of lit points and the count spoken in the caption can never disagree, and a position that arrives from above costs nothing to take up again.',
      'The moves get shorter as the walk descends: two across the sparse top sheet, one on the middle, and none at all on the bottom, where the first look already finds nothing nearer. The stopping condition is reached by standing still.',
      'The closing line reports eight points measured out of sixteen.',
      'A comparison follows: the upper two sheets fade back, every mark is cleared away, and the same search runs again from the same starting point using the bottom sheet alone. It takes four moves, lights fifteen of the sixteen, and finishes on the very same point as before.',
    ],

    screen: {
      affordances: [
        'The run plays once by itself — down through the three sheets, then the single-sheet comparison — and stops with both results on screen.',
        'Two buttons: Replay, and a step control. The first press clears back to the bare sheets and each further press takes one more beat, which is how a reader can hold the picture at the instant the position drops between sheets.',
        'The sixteen positions, which of them appear on each sheet, how many links each sheet gives a point, the starting place and the target are all fixed. The sheets are named on screen and the ring names the point it stands on, so an article can quote the route.',
      ],
    },

    useWhen: [
      'The prose says the search narrows down through levels and the reader has no image of what passes between one level and the next. Here the position itself is the thing that crosses, dropping to the identical spot one sheet down while everything already measured is left behind on the sheet above.',
      'The claim that thinning the upper levels saves work needs a figure the reader can hold against the alternative, and the screen supplies it by running the same search from the same place on the full sheet alone: fifteen measured against eight, ending at the same point.',
    ],

    avoidWhen: [
      'The subject is how points come to be on one sheet and not another. The membership is handed to this screen as given and nothing on it produces or justifies the split.',
      'The article is about whether the answer survives starting somewhere else. One starting place is used throughout, and the comparison at the end deliberately holds it fixed.',
      'The subject is how the saving grows with the size of the collection. Sixteen points, one target, one run at one size.',
      'The article uses "coarse to fine" for image pyramids, mesh refinement or progressive rendering. The phrase matches and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'hnsw',
        note: 'Whether the stacking goes deep enough to be depended on, and what depending on it costs, is a further question than what one level hands to the level beneath it.',
      },
      {
        concept: 'neighborsLinkedAhead',
        note: 'The rule for moving is the same in both; the difference is that one holds every point at a single density while here they are thinned out overhead so a position can arrive already roughly right.',
      },
      {
        concept: 'skipALayer',
        note: 'Both descend through levels that grow denser downward, but one runs along an ordered line where the target can be overshot and the overshoot is itself the signal to drop, while here there is no order to overshoot and the signal is that nothing adjacent is any better.',
      },
      {
        concept: 'coinFlipHeight',
        note: 'One is about how it gets decided how high a thing stands; this takes the heights as already settled and is about what descending through them does to the work.',
      },
    ],
  },
};
