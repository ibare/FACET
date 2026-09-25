/**
 * evictOldest 개념 선언.
 *
 * canonical facet 은 `facet:evictOldest` — 프레임 셋에 참조 여섯(4 · 8 · 3 · 4 · 6 · 4)을 흘린다. t4 의 적중은 들어온
 * 차례를 바꾸지 않아, t5 에 한 걸음 전에 쓰인 4 가 밀려 나가고 t6 에 곧바로 다시 불려 폴트를 낸다. 폴트 5 · 적중 1.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `pageReplacement`(완제품)는 정책 셋을 프레임 수에 걸쳐 견준다. 형제 `beladyAnomaly` 도 FIFO 지만 프레임 3 칸과 4 칸
 * 을 나란히 흘려 **프레임 수**의 역설을 쥔다 — 이쪽은 프레임 셋 하나에서 **쓰임을 보지 않는다** 하나다.
 * definition 은 entered earliest · ignores use · hit changes nothing · used one step ago · faulted straight back 을
 * 독점하고, more frames · overtakes · last used · looks back 을 쓰지 않는다.
 *
 * 전제: 값은 예로 정한 것. 빈 프레임은 번호 낮은 것부터, 내보낸 프레임에 새 페이지, 새 페이지는 차례의 끝으로.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const evictOldestConcept: FacetConceptSource = {
  id: 'evictOldest',
  label: 'FIFO Eviction (Arrival Order Only, Even Just After Use)',
  canonicalFacet: 'facet:evictOldest',

  surface: {
    definition:
      'FIFO replacement evicts the page that entered memory earliest and ignores use entirely, so a hit changes nothing and a page used one step ago can be evicted and faulted straight back in.',
    exemplarKeywords: [
      'FIFO page replacement',
      'first in first out',
      'oldest page evicted',
      'FIFO ignores recently used pages',
      'FIFO queue of pages',
      'FIFO vs LRU',
      'page replacement worked example',
      'simple replacement algorithm',
    ],
  },

  briefing: {
    observable: [
      'An "Arrival order" line runs from "First in · out next" at one end to "New pages join here" at the other. Each page is a card showing its frame, "In: t1" and "Used: t1". The start reads "Frames: 3 · all empty".',
      'References t1–t3 (4, 8, 3) fault into free frames 0, 1, 2 and join the end of the line: "Reference t1: page 4 · fault · Into free frame 0 · end of the line".',
      't4 is page 4 again: "hit · Place in line: 1 of 3 · last used: t4". The card\'s Used changes to t4, but it stays first in line.',
      't5 is page 6: "fault · Out: page 4, first in line, last used t4 · into frame 0". The page used a moment ago is the one evicted, and page 6 takes its frame and joins the end.',
      't6 asks for page 4 again: "fault · evicted at t5 · Out: page 8, first in line, last used t2 · into frame 1". An "Evicted" row keeps 4 (out t5) and 8 (out t6).',
      'The run ends at "Faults: 5 · Hits: 1" with the line 3 · 6 · 4. The values are chosen for illustration.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one reference per step, and stops after t6 — seven steps including the start.',
        'A Replay button and a playback strip sit below it. Moving between t4 and t5 shows the card\'s Used time changing without its place in line changing, and then that card leaving.',
        'The references are fixed, so an article can quote each card and caption.',
      ],
    },

    useWhen: [
      'The article introduces FIFO replacement and needs its blind spot made concrete: a page used at the previous step is the one thrown out.',
      'A reader asks what FIFO actually tracks, and the article needs cards that show both arrival time and last use, with only the first ever mattering.',
    ],

    avoidWhen: [
      'The article is about Bélády\'s anomaly or what happens when frames are added. There is one frame count.',
      'The subject is a FIFO queue as a data structure, or FIFO process scheduling. This is page eviction.',
      'The point is comparing several policies on screen. Only first-in-first-out runs.',
    ],

    contrastWith: [
      {
        concept: 'evictLeastRecent',
        note: 'Both evict one page when memory is full. Least-recently-used goes by the last use, so a page just touched is safe; first-in-first-out goes by arrival alone, so it is not.',
      },
      {
        concept: 'beladyAnomaly',
        note: 'Ignoring use is the rule\'s blind spot at one memory size. The same blindness means the eviction order shifts wholesale when a frame is added, which is how more frames can produce more faults.',
      },
      {
        concept: 'secondChance',
        note: 'The clock keeps first-in-first-out\'s circular order but gives a page with its use bit set one pass of reprieve, repairing exactly the case where a just-used page would be thrown out.',
      },
      {
        concept: 'queueFifo',
        note: 'A queue data structure serves items in arrival order by design. As an eviction rule the same order becomes a flaw, because arrival says nothing about whether a page is still needed.',
      },
    ],
  },
};
