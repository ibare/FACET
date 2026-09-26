/**
 * forcedSyncLayout 개념 선언.
 *
 * canonical facet 은 `facet:forcedSyncLayout` — 조각(piece)이다. 상자 넷에 대해
 * 네 줄짜리 native 코드(읽기·쓰기 루프)를 한 번 돈다. 레이아웃은 깨끗/더러움
 * 둘뿐이고, 쓰기는 더럽히기만 하고 그 다음 읽기가 더러운 채로 오면 그 자리에서
 * 문서 전체를 다시 잰다. 스크립트가 끝난 뒤 더러운 채로 남으면 프레임 앞에서
 * 한 번 더 돈다(강제가 아닌 프레임 레이아웃).
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `layoutThrash` 는 같은 사건이 상자 여럿에 걸쳐 반복될 때 차례(순서)가
 * 강제 레이아웃 **횟수**를 어떻게 가르는지 맡는다. 이 조각은 그 낱개 사건 하나
 * — 쓰기 하나가 더럽히고 읽기 하나가 멈춰 세우는 것 — 자체의 **왜**를 맡는다.
 * definition 의 단위가 "쓰기-읽기 한 쌍" 이고, keywords 는 더러움/깨끗함이라는
 * 상태 자체에 집중해 layoutThrash 의 차례 비교 어휘(batch·order·interleaving)와
 * 겹치지 않게 했다. `oneGrowsRestShift` 는 레이아웃이 언제 다시 도는지가 아니라
 * 다시 돈 뒤 좌표가 어떻게 바뀌는지를 맡으므로, 여기서는 밀림 좌표를 다루지
 * 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const forcedSyncLayoutConcept: FacetConceptSource = {
  id: 'forcedSyncLayout',
  label: 'Forced Synchronous Layout',
  canonicalFacet: 'facet:forcedSyncLayout',

  surface: {
    definition:
      'A style write only marks layout dirty and lets the script keep running; it is the next read of a geometric property, such as offsetWidth, that pays for it — the browser must synchronously recompute layout for the whole document, on the spot, before it can hand back the value, rather than waiting until the next frame.',
    exemplarKeywords: [
      'forced synchronous layout',
      'forced reflow',
      'layout thrashing single pair',
      'dirty layout flag',
      'offsetWidth triggers reflow',
      'synchronous reflow',
      'style recalculation blocks the script',
      'read after write forces layout',
      'reflow on the spot',
      'why reading offsetWidth is expensive',
    ],
  },

  briefing: {
    observable: [
      'Each box shows two overlaid widths — a filled bar for what the last layout actually measured, and a dashed outline for what the style says but has not yet been measured. A write only stretches the dashed outline.',
      'When a read lands while a box is still dashed past its filled bar, the execution cursor freezes on that read line, and a layout sweeps top to bottom across all four boxes, pulling every filled bar out to meet its dashed outline at once — not just the one box that was read.',
      'A clean/dirty badge over the code sits at "clean" through the read line and flips to "dirty" the instant the write line runs; it only returns to "clean" when a layout, forced or not, resolves it.',
      'A caption at each read states the exact value handed back and, when layout was clean, says explicitly that nothing was measured to get it.',
      'A running Layouts counter climbs by one at each forced layout, and a small chip on that count distinguishes a forced layout from the one frame layout that runs after the script if it ends dirty.',
      'The script always ends with one more layout opportunity if it left the last write dirty — a frame layout with no read line and no blocked cursor to point to, only the fact that it ran.',
    ],

    screen: {
      affordances: [
        'The screen plays through the whole four-box loop on its own and stops after the final layout resolves.',
        'A Replay button and a scrub strip sit below; the strip lets a reader park on the exact read that blocked, or on the write right before it, and move between them.',
        'The code, the boxes, and their starting widths are fixed, so the article can name the read line and the write line and refer to them as fixed lines in a fixed loop.',
      ],
    },

    useWhen: [
      'The article warns "never read offsetWidth right after writing style.width" and the reader needs to see the single mechanism the warning rests on — a write leaves layout dirty, and it is specifically the next geometric read, not the write itself, that stalls the script to resolve it.',
      'The reader has to be shown that the browser would have recomputed this layout for free before the next frame regardless — the cost being demonstrated is doing that recomputation early and synchronously in the middle of a script, not the recomputation itself.',
      'The article needs the distinction between a forced layout (mid-script, blocking, caused by a read hitting dirty state) and a frame layout (after the script ends, not blocking anything) to be something the reader watches happen rather than a rule taken on faith.',
    ],

    avoidWhen: [
      'The article compares several boxes across three different script orderings and wants the reader to see how the ordering changes the total number of forced layouts — that comparison across an order is the loop-wide subject, not this single read/write pair.',
      'The subject is what the recomputed positions or sizes look like once layout has resolved, independent of when or why it ran.',
      'The article is about paint, compositing, or GPU layers rather than the layout (geometry) pass.',
      'The article uses "forced" for something unrelated to layout timing, such as forced garbage collection or a forced page reload.',
    ],

    contrastWith: [
      {
        concept: 'layoutThrash',
        note: 'This is the one write/read pair and the dirty-flag mechanism that makes a single forced layout happen; layoutThrash is the loop-wide comparison of orderings across many boxes and the resulting count of forced layouts.',
      },
      {
        concept: 'oneGrowsRestShift',
        note: 'This is about when the browser recomputes layout mid-script and why; oneGrowsRestShift is about what the recomputed geometry looks like — which boxes move and by how much — independent of any script or timing.',
      },
    ],
  },
};
