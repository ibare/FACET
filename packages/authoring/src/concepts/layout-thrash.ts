/**
 * layoutThrash 개념 선언.
 *
 * canonical facet 은 `facet:layoutThrash` — 완제품이다. 상자 열(1·2·4·8·16개)에
 * `+10px` 를 적용하는 세 차례(번갈아 / 쓰고읽기 / 읽기 모아서) 중 하나를 골라
 * 재생하고, 판마다 강제 레이아웃 횟수를 계기로 쌓는다. 코드 패널이 차례에 따라
 * 통째로 다른 native 자바스크립트를 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `forcedSyncLayout` 은 한 번의 쓰기-읽기 쌍이 왜 그 자리에서 멈춰 서는지,
 * 더러움/깨끗함이라는 하나의 상태 기계를 맡는다. 이 완제품은 그 낱개 사건이
 * 상자 여러 개에 걸쳐 **반복될 때** 차례가 강제 레이아웃 횟수를 어떻게
 * 가르는지를 맡는다 — definition 의 단위가 "쓰기 하나 다음 읽기 하나" 가 아니라
 * "차례 하나로 도는 루프 전체" 다. 조각 `oneGrowsRestShift` 는 레이아웃이
 * 다시 도는 시점이 아니라 다시 돈 뒤 좌표가 어떻게 바뀌는지를 맡으므로, 이
 * 완제품의 keywords 에는 흐름 배치 어휘(shift·push down)를 넣지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const layoutThrashConcept: FacetConceptSource = {
  id: 'layoutThrash',
  label: 'Layout Thrash',
  canonicalFacet: 'facet:layoutThrash',

  surface: {
    definition:
      'Looping over elements while alternating a geometry read with a style write forces one synchronous layout per iteration, because each read hits layout freshly dirtied by the write before it; reordering the same operations so every read precedes every write collapses that loop to a single layout.',
    exemplarKeywords: [
      'layout thrashing',
      'avoid layout thrashing',
      'batch DOM reads and writes',
      'read-write interleaving in a loop',
      'measure then mutate',
      'FastDOM pattern',
      'forced reflow count',
      'why a loop of offsetWidth is slow',
      'separating reads from writes',
      'DOM read/write scheduling',
    ],
  },

  briefing: {
    observable: [
      'A segmented control switches the script between three literally different bodies of native code — alternating read/write, write-then-read, and batched reads — and the code panel shows whichever one is selected, not a paraphrase of it.',
      'A row of boxes lays out like real inline content: growing one box by 10px visibly shifts every box after it, and the row wraps to a new line once it runs out of width.',
      'Every time a read forces layout, a red flash sweeps the whole canvas once, and a "Forced" counter climbs by exactly one at that instant, not at the write that dirtied it.',
      'Under alternating order the flash fires once per box; under write-then-read it also fires once per box but at a different point in each box\'s turn; under batched reads it fires once for the whole row regardless of how many boxes there are.',
      'A dirty/clean badge sits over the row and flips to dirty the instant a write lands, then back to clean the instant a layout — forced or not — resolves it.',
      'Raising the box count control from 1 to 16 changes how many times the pattern repeats within a round but not which pattern is running, so the Forced counter scales with box count under the two per-box orders and stays flat under batching.',
    ],

    screen: {
      affordances: [
        'Standard playback — play, step, pause, reset, speed — runs one round of whichever order and box count are selected.',
        'A box-count control (1, 2, 4, 8, 16) sets how many boxes take part in the round.',
        'An order control chooses among alternating, write-then-read, and batched reads; changing it starts a fresh round with its counters reset to zero.',
        'Three counters — Layouts, Forced, Measured boxes — accumulate across the round and reset when a new round starts.',
      ],
    },

    useWhen: [
      'The article claims that reading layout right after writing it, inside a loop, is what makes a page slow, and the reader needs to watch the Forced counter climb once per box under an interleaved order and then watch the same counter stop at one once the reads are moved before the writes.',
      'The reader needs the box count to matter as evidence, not as a side detail — the same reorder that fixes one box fixes sixteen, and the difference between "one forced layout per element" and "one forced layout total" only shows once there is more than one element to loop over.',
      'The prose distinguishes three concrete orderings by name and expects the reader to tell them apart by what happens on screen, not by remembering which snippet was which.',
    ],

    avoidWhen: [
      'The article is walking through a single write followed by a single read and wants the dirty/clean state machine behind why that one read is forced — that is one iteration in isolation, not a loop with an order to compare.',
      'The subject is what the recomputed positions look like once layout has run — which box moved where and by how much. This screen counts how many times layout runs, not what it draws when it does.',
      'The article is about paint or compositing cost, GPU layers, or repaint regions rather than layout (geometry) recomputation.',
      'The article is about CSS cascade, specificity, or `!important` resolution rather than the layout pass itself.',
    ],

    contrastWith: [
      {
        concept: 'forcedSyncLayout',
        note: 'This is the loop-wide comparison of three orderings and the resulting layout count across many boxes; forcedSyncLayout is the single write/read pair and the dirty-flag mechanism that each forced layout inside this loop is built from.',
      },
      {
        concept: 'oneGrowsRestShift',
        note: 'This asks how many times the browser recomputes geometry depending on script order; oneGrowsRestShift asks what the recomputed geometry looks like once one box changes size, independent of any script timing.',
      },
    ],
  },
};
