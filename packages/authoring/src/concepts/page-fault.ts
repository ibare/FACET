/**
 * pageFault 개념 선언.
 *
 * canonical facet 은 `facet:pageFault` — 페이지 넷 가운데 0 만 프레임 1 에 있고 1 · 2 · 3 은 디스크에만 있다.
 * 접근 다섯(0 · 2 · 0 · 2 · 3) 가운데 없는 페이지에 닿은 둘이 네 걸음 — 멈춤 · 디스크에서 빈 프레임으로 올림 ·
 * 표 고침 · 같은 접근 다시 — 을 밟는다. 있는 페이지는 한 걸음에 지나간다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `virtualMemory`(완제품)는 프로세스 수를 돌리며 CPU 이용률이 무너지는 자리를 쥔다. 형제 `swapInOut` 은 프로세스가
 * 통째로 오가는 것, `thrashing` 은 밀려난 페이지가 곧바로 되불리는 맴돌기를 쥔다. 이쪽은 **한 접근의 네 걸음**
 * — 멈추고, 올리고, 고치고, 같은 접근을 다시 — 하나다. 빈 프레임이 넉넉해 내보내기가 없다. definition 은
 * not present · stops · read from disk · entry updated · same access restarts 를 독점하고, CPU utilization · evict ·
 * whole process 를 쓰지 않는다.
 *
 * 전제: 값은 예로 정한 것. 빈 프레임은 번호 낮은 것부터. 내보내기 없음. TLB 는 없다고 본다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pageFaultConcept: FacetConceptSource = {
  id: 'pageFault',
  label: 'Page Fault (Stop, Load, Fix the Table, Retry)',
  canonicalFacet: 'facet:pageFault',

  surface: {
    definition:
      'Touching a page whose table entry says it is not in memory stops the access; the page is read from disk into a free frame, the entry is updated, and the same access restarts and now completes.',
    exemplarKeywords: [
      'page fault',
      'what happens on a page fault',
      'page fault handling steps',
      'demand paging',
      'valid-invalid bit',
      'present bit',
      'restart the faulting instruction',
      'major page fault',
      'lazy loading of pages',
    ],
  },

  briefing: {
    observable: [
      'On screen: an "Accesses" row (0, 2, 0, 2, 3), a "Program" status that reads running or stopped, a "Page table" with rows 0 → 1, 1 → none, 2 → none, 3 → none, a "Memory" column with Frame 1 holding Page 0 and Frames 3 and 5 free, and a "Disk" column holding Pages 1, 2 and 3. Counters read "Accesses done" and "Page faults".',
      'An access to a present page passes in one step: "Page 0 is in frame 1 — the access goes straight through."',
      'An access to an absent page takes four steps. "Page 2: the table says none. Execution stops — page fault." — the Program status turns to stopped. "Page 2 comes up from disk into free frame 3." "The table row for page 2 is fixed: frame 3." "The same access restarts and this time reaches frame 3."',
      'The Accesses done counter does not advance while the access is stopped; it moves only on the retry.',
      'The second access to page 2 passes straight through. Page 3 faults the same way and lands in frame 5. The run ends at 5 accesses and 2 faults; page 1, never touched, stays on disk.',
      'The values are chosen for illustration. Free frames are used lowest number first and never run out here, so no page is evicted. There is no TLB in the model.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops after the retry of the last access — twelve steps including the start.',
        'A Replay button and a playback strip sit below it. Scrubbing across a fault\'s four steps shows the table row still reading none while the page is already in its frame, then the row changing, then the retry.',
        'The accesses and table are fixed, so an article can quote each caption in order.',
      ],
    },

    useWhen: [
      'The article walks through page fault handling and needs each stage as a separate, visible step, especially that the faulting access is retried rather than skipped.',
      'The reader wonders why a program can run with only some of its pages loaded, and the article needs a page that is never touched and never loaded.',
    ],

    avoidWhen: [
      'The article is about page replacement or evicting a page when memory is full. Free frames never run out here.',
      'The subject is thrashing or system-wide performance. There is one short run with two faults.',
      'The point is segmentation faults or invalid memory access that kills a program. Every page here is legal; it is only not yet loaded.',
      'The subject is the TLB. The model has none.',
    ],

    contrastWith: [
      {
        concept: 'pageTableLookup',
        note: 'Normal translation assumes the table row names a frame. A fault is what happens when it does not, and the translation can proceed only after the row has been filled in.',
      },
      {
        concept: 'virtualMemory',
        note: 'One fault is a delay for one access. When many processes fault faster than one disk can serve them, the delays add up to a collapse in CPU use, a separate system-level claim.',
      },
      {
        concept: 'swapInOut',
        note: 'Paging on demand moves single pages as they are touched; swapping moves an entire process at once based on its state, without waiting for any access.',
      },
      {
        concept: 'evictLeastRecent',
        note: 'When no frame is free, a fault needs a victim before the page can come in. Choosing that victim is the replacement policy\'s job; with free frames available there is no choice to make.',
      },
    ],
  },
};
