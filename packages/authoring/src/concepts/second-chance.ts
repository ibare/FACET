/**
 * secondChance 개념 선언.
 *
 * canonical facet 은 `facet:secondChance` — 칸 넷(0 → 1 → 2 → 3 → 0)에 페이지와 참조 표시가 있고 바늘이 칸 0 에 있다.
 * 참조 넷(8 · 6 · 3 · 7). 적중은 표시만 켜고 바늘은 그대로. 폴트면 바늘이 돌며 표시 1 은 지우고 넘어가고, 표시 0 에
 * 닿으면 그 페이지를 내보낸다. 페이지 3 은 두 번 짚혔지만 그 사이 쓰여 두 번 다 살아남고, 8 은 한 번 봐준 뒤 다음
 * 바퀴에 나간다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `pageReplacement`(완제품)에서 Clock 은 걸음 안의 운동이지만, 이쪽은 **짚는 칸마다 한 걸음** 이다 — 바늘이 돌며
 * 지우고, 한 번 봐주는 것 하나. 형제 `evictLeastRecent` 는 정확한 때를, `recencyReorder` 는 줄 순서를 쓴다 — 이쪽은
 * 비트 하나. definition 은 hand · sweeps in a circle · clears a set bit · first page with its bit clear · spared once 를
 * 독점하고, last used · list · arrival · frames count 를 쓰지 않는다.
 *
 * 전제: 칸 넷 · 처음 페이지와 표시 · 참조 넷은 예로 정한 값. 새 페이지는 표시가 켜진 채 들어가고, 바늘은 그 다음
 * 칸으로 간다. 적중일 때 바늘은 움직이지 않는다. 실제로는 하드웨어가 페이지 표 항목에 표시를 켠다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const secondChanceConcept: FacetConceptSource = {
  id: 'secondChance',
  label: 'Second Chance / Clock (Clear the Bit, Move On)',
  canonicalFacet: 'facet:secondChance',

  surface: {
    definition:
      'The clock algorithm sweeps a hand around the frames, clearing each set reference bit and moving on, and evicts the first page whose bit is already clear, so a page used since the last pass is spared once.',
    exemplarKeywords: [
      'clock algorithm',
      'second chance page replacement',
      'reference bit',
      'use bit',
      'accessed bit',
      'clock hand',
      'LRU approximation',
      'enhanced second chance',
      'how Linux approximates LRU',
    ],
  },

  briefing: {
    observable: [
      'Four slots, "slot 0" to "slot 3", each showing a page and its reference mark (1 or 0), and a "hand" beneath them. At the start: slot 0 page 3 mark 1, slot 1 page 8 mark 0, slot 2 page 5 mark 1, slot 3 page 2 mark 0; "The hand rests on slot 0." A "References" row holds 8, 6, 3, 7; a "Slots checked" counter and an "Evicted" row sit alongside.',
      'Reference 8 is a hit: "Page 8 is already in slot 1. Hit: its mark turns on, the hand stays."',
      'Reference 6 is a fault: "Page 6 is in no slot. Fault: the hand starts to turn." The hand then visits one slot per step: "Slot 0 holds page 3 with its mark on. Clear the mark, move on." — the same for slots 1 and 2 — until "Slot 3 holds page 2 with no mark. Evict it; page 6 goes in." The new page enters with its mark on and the hand moves to slot 0.',
      'Reference 3 is a hit and turns slot 0\'s mark back on. Reference 7 faults: the hand clears slot 0 again and moves on, then "Slot 1 holds page 8 with no mark. Evict it; page 7 goes in." The hand ends on slot 2.',
      'Page 3 was reached by the hand twice and survived both times, because it was used in between. Page 8 was spared on the first pass, not used again, and evicted on the next. The run ends with 6 slots checked and pages 2 and 8 evicted; slots hold 3·0, 7·1, 5·0, 6·1.',
      'The slots, starting pages, marks and references are chosen for illustration. In real systems the hardware sets the mark in the page table entry.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one step per hit and per slot the hand checks, and stops after page 7 goes in — eleven steps including the start.',
        'A Replay button and a playback strip sit below it. Scrubbing through the fault on page 6 shows three marks switching off one after another before the hand finds an unmarked slot.',
        'The starting marks and references are fixed, so an article can quote each check in order.',
      ],
    },

    useWhen: [
      'The article explains the clock or second-chance algorithm and needs the hand\'s sweep broken into single checks, each clearing a bit or evicting.',
      'A reader wonders how an operating system approximates least-recently-used without timestamps, and the article needs a page that survives two sweeps only because it was used between them.',
    ],

    avoidWhen: [
      'The article compares replacement policies or looks at how faults change with the number of frames. One policy, four slots.',
      'The subject is exact least-recently-used with timestamps or an ordered list. The only record here is one bit.',
      'The point is the enhanced variant that also weighs a dirty bit, or multi-handed clocks used in Linux or BSD. There is one hand and one bit.',
    ],

    contrastWith: [
      {
        concept: 'evictLeastRecent',
        note: 'Exact least-recently-used compares when each page was last used. The clock keeps only whether a page was used since the hand last passed, which costs far less and tells the rule less.',
      },
      {
        concept: 'evictOldest',
        note: 'Without the bit the hand\'s circular order is first-in-first-out. The bit is what lets a page used a moment ago escape the eviction that plain arrival order would give it.',
      },
      {
        concept: 'recencyReorder',
        note: 'Reordering pages on every use keeps exact recency at a cost paid on each access. The clock pays nothing on a hit beyond setting a bit, and does its work only when a victim is needed.',
      },
      {
        concept: 'pageReplacement',
        note: 'How the clock spares a page is a mechanism on its own. Whether it inherits least-recently-used\'s immunity to more frames causing more faults is a comparative question, and it does not.',
      },
    ],
  },
};
