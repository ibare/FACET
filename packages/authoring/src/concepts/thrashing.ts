/**
 * thrashing 개념 선언.
 *
 * canonical facet 은 `facet:thrashing` — 두 프로세스의 페이지 넷(a1 · a2 · b1 · b2)이 프레임 셋을 함께 쓴다. 참조 열둘
 * (a1 a2 b1 b2 × 3) 이 모두 폴트이고, 넷째부터 밀려난 페이지가 **바로 다음 참조**에서 다시 불린다. 교체는 전역 LRU.
 * 참조 12 · 폴트 12 · 밀어냄 9. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `virtualMemory`(완제품)는 프로세스 수를 돌려 CPU 이용률이 어디서 무너지는지 — 시간 축과 곡선 — 를 쥔다.
 * 이쪽은 **맴돌기의 속 모양** — 내보낸 것이 곧바로 필요해져 모든 참조가 폴트 — 한 판이다. 형제 `pageFault` 는
 * 한 접근의 네 걸음, `swapInOut` 은 프로세스 통째. definition 은 fewer frames than pages cycled · evicts exactly the
 * page needed next · every reference faults · bounce 를 독점하고, CPU utilization · working sets add up · processes
 * share 를 쓰지 않는다.
 *
 * 전제: 값은 예로 정한 것. 교체는 프레임 셋 전체의 LRU(프로세스를 가리지 않는다). 동률 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const thrashingConcept: FacetConceptSource = {
  id: 'thrashing',
  label: 'Thrashing (Evicted, Then Needed Right Back)',
  canonicalFacet: 'facet:thrashing',

  surface: {
    definition:
      'With fewer frames than the pages being cycled through, each fault evicts exactly the page the next reference needs, so every reference faults and pages bounce between memory and disk without useful progress.',
    exemplarKeywords: [
      'thrashing',
      'page thrashing example',
      'every reference is a page fault',
      'evicted page needed immediately',
      'too few frames',
      'LRU worst case cyclic access',
      'pages ping-pong between memory and disk',
      'working set does not fit',
    ],
  },

  briefing: {
    observable: [
      'Three frames on the left ("Frame 0", "Frame 1", "Frame 2"), the disk on the right holding process p1\'s pages a1, a2 and process p2\'s pages b1, b2. A loop between them has an upper path marked "brought in" and a lower path marked "pushed out". The start reads "Shared frames: 3 — every page starts on disk."',
      'The reference string a1 a2 b1 b2 repeated three times runs one per step. The first three fill empty frames: "Reference a1: fault — brought in to empty frame 0."',
      'From the fourth on, each step brings one page up and pushes one down: "Reference b2: fault — brought in to frame 0; pushed out to disk: a1". The next step calls a1 straight back: "This page was pushed out at step 4 — steps until called back: 1".',
      'A band below builds one column per step: the page pushed out on top, the page referenced in the middle, a fault mark at the bottom. A curved line joins each pushed-out cell to the cell where that page is called again, and every curve lands on the very next column.',
      'Counters "Pushed out", "Referenced" and "Faults" rise together; the end reads "References done. Faults: 12 / 12", with 9 pages pushed out. Eight of those nine were needed at the next reference; the last one, a1, is not called again because the references end.',
      'The values are chosen for illustration. Replacement picks the least recently used page across all three frames regardless of which process owns it. With four frames only the first four references would fault — the screen does not show that case.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one reference per step, and stops after the twelfth — thirteen steps including the start.',
        'A Replay button and a playback strip sit below it. Scrubbing through steps 4 to 12 shows every curve in the band dropping into the adjacent column.',
        'The references and frame count are fixed, so an article can quote the eviction order and the final 12 / 12.',
      ],
    },

    useWhen: [
      'The article defines thrashing and needs the reader to see the loop itself: the page just pushed out is the very next one asked for, over and over.',
      'A reader thinks least-recently-used replacement is always a good choice, and the article needs a cyclic pattern one page larger than memory where it evicts exactly the wrong page every time.',
    ],

    avoidWhen: [
      'The article is about CPU utilization, the number of processes, or when a system tips into thrashing. There is one short reference string and no time axis.',
      'The subject is comparing replacement policies. Only one policy runs.',
      'The point is swapping whole processes out. Individual pages move here.',
    ],

    contrastWith: [
      {
        concept: 'virtualMemory',
        note: 'The loop of evicting what is needed next is the mechanism. Where it starts as processes are added, and how it drags CPU use down across a whole system, is the load-level claim built on it.',
      },
      {
        concept: 'pageFault',
        note: 'A single fault is a pause while one page is loaded. Thrashing is when every reference pays that pause because the page it needs was just evicted.',
      },
      {
        concept: 'evictLeastRecent',
        note: 'Choosing the page used longest ago is usually a good guess about the future. When pages are used in a cycle one larger than memory, that same choice is always the page needed next.',
      },
      {
        concept: 'beladyAnomaly',
        note: 'Both are cases where more faults happen than intuition predicts. Here the cause is too few frames for the pages in use; there, adding a frame under first-in-first-out replacement is itself the cause.',
      },
    ],
  },
};
