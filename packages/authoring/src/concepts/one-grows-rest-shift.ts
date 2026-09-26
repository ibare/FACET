/**
 * oneGrowsRestShift 개념 선언.
 *
 * canonical facet 은 `facet:oneGrowsRestShift` — 조각(piece)이다. h1·p·p·p·img·p
 * 여섯 블록짜리 문서 흐름 하나에서 블록 하나(`p2`)의 줄 수가 늘어 자란다.
 * 앞의 블록은 제자리, 자란 블록은 자기 높이만, 뒤의 블록은 전부 같은 거리만큼
 * y 만 밀려 내려간다. 걸음마다 하나씩(자람 → 밀림 → 밀림 → … → 담는 상자
 * 높이) 보이고, 움직인 것마다 오른쪽에 길이가 같은 화살표가 계단으로 남는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `layoutThrash` 와 조각 `forcedSyncLayout` 은 둘 다 **레이아웃이 언제,
 * 몇 번 다시 도는지** — 스크립트의 읽기/쓰기 시점 — 를 다룬다. 이 조각은
 * 스크립트도 읽기/쓰기도 등장하지 않는다. 자란 뒤의 배치가 **어떤 모습인지**
 * 만 다룬다 — definition 의 주어가 "레이아웃이 다시 도는 사건" 이 아니라
 * "한 블록의 자람이 흐름 속 좌표에 남기는 결과" 다. keywords 도 강제/깨끗함
 * /더러움 같은 시점 어휘를 피하고 흐름·y 좌표·밀림 어휘로만 채웠다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneGrowsRestShiftConcept: FacetConceptSource = {
  id: 'oneGrowsRestShift',
  label: 'One Box Grows, the Rest Shift Down',
  canonicalFacet: 'facet:oneGrowsRestShift',

  surface: {
    definition:
      'In a vertical block flow, when one element becomes taller, every element before it keeps its position and size, that element keeps its own top edge and only grows downward, and every element after it is pushed straight down by exactly the amount the height increased — none of them change size themselves.',
    exemplarKeywords: [
      'normal flow',
      'block-level reflow',
      'content pushes siblings down',
      'height change shifts following elements',
      'document flow layout',
      'expanding an accordion pushes content below it',
      'adding a line of text moves everything after it',
      'y-position recalculation in a flow',
      'why elements move without resizing',
      'top offset shifts by a fixed amount',
    ],
  },

  briefing: {
    observable: [
      'The container is drawn as an outline whose height only changes at the very last step, after every block inside it has already settled into its new position.',
      'The block that grows keeps its top edge fixed and only its bottom edge moves down; every block that appears above it in the document never moves at all through the whole sequence.',
      'Each block that moves afterward does so one at a time, in document order, and each of those moves changes only its y position — its own height stays exactly what it was before.',
      'Every block that moved, plus the container if its height changed, gets its own arrow on the right, and all of those arrows are the same length — the same length as the height the growing block gained.',
      'Before a block has been pushed down, its old and new positions are shown overlapping and shaded to mark the collision, which is what the next step resolves.',
      'A left-hand ruler gives the top-edge y coordinate of every block and the container height as plain numbers, so a reader can check the arithmetic — the sum of everything above a block is its y — rather than take the movement on faith.',
      'A closing tally states how many blocks kept their exact position and how many were pushed down, separating the flow into what changed from what did not.',
    ],

    screen: {
      affordances: [
        'The screen plays through the whole sequence on its own — one growth, then one push per affected block, then the container — and stops once the container has settled.',
        'A Replay button and a scrub strip sit below; the strip lets a reader hold on any single push and compare its arrow to the growing block\'s own arrow.',
        'The six blocks, their tags, and which one grows are fixed, so the article can point at a specific block by name and describe exactly what happens to it.',
      ],
    },

    useWhen: [
      'The article says a taller element "pushes" the content after it and the reader could easily picture every later element resizing along with it; the screen has to show height changing at exactly one block while every other displaced block only moves, with its own height untouched.',
      'The reader needs the distance every later block moves to be identical, and identical to how much the growing block itself gained — not a diminishing effect, not distributed unevenly — and that identity is what the matched-length arrows are for.',
      'The prose needs to state that content before the change never moves, as something demonstrated rather than asserted, in a case with several blocks positioned above the one that grows.',
    ],

    avoidWhen: [
      'The article is about a script reading a geometric property right after writing one and the browser being forced to recompute layout mid-script to answer it — nothing here is script-driven or timed; the change is given directly and the resulting positions are computed once.',
      'The subject is how many times, or under what ordering, the browser recomputes layout at all. This shows one change and its one resulting layout, not a count or a comparison of orderings.',
      'The article is about absolutely or fixed positioned elements, which are removed from the normal flow and would not push their siblings this way.',
      'Several elements change size or position at once, or the same flow is put through more than one change in sequence. This model checks that only one property of one block changed and refuses to run otherwise.',
    ],

    contrastWith: [
      {
        concept: 'layoutThrash',
        note: 'This is what the resulting geometry looks like once one block changes size; layoutThrash is how many times a script forces that geometry to be recomputed, depending on the order its reads and writes are issued.',
      },
      {
        concept: 'forcedSyncLayout',
        note: 'This never involves a script reading or writing mid-execution — the change and its consequence are given directly; forcedSyncLayout is specifically about a script write dirtying layout and a script read then forcing it to be recomputed synchronously.',
      },
    ],
  },
};
