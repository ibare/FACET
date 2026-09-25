/**
 * switchCosts 개념 선언.
 *
 * canonical facet 은 `facet:switchCosts` — 캐시 두 칸 · 메모리 줄 · CPU. A 가 `a1` · `a2` 를 1 틱씩 읽고, B 로 바꾸는 데
 * 3 틱, B 의 첫 두 읽기는 캐시에 없어 10 틱씩(각각 A 의 것을 밀어냄), 다시 읽으면 1 틱. A 로 돌아오면 A 가 같은 값을
 * 치른다. 끝에 시각 50 · 일 8 · 바꿈 6 · 식은 캐시 36 — 일이 아닌 몫 42 / 50. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `contextSwitching` 은 저장-복원 사이 빈 무대를 오버헤드로 그린다 — 바꾸는 순간의 값. 이쪽은 **바꾼 뒤**의 값,
 * 곧 식은 캐시가 바꾸는 값의 여섯 배라는 것을 쥔다. 그래서 definition 은 cache · misses · cold · after the switch ·
 * refetch 를 독점하고, 레지스터 · 저장 · 복원은 쓰지 않는다.
 *
 * 전제 (설명 글 `switchCosts.md`): 틱 수(캐시 적중 1 · 빗나감 10 · 바꿈 3)는 예로 정한 값. 빗나간 읽기의 1 틱을 일로,
 * 나머지 9 를 식은 캐시 값으로 나눴다. 캐시는 두 칸 · 먼저 든 것부터 밀어냄 — 교체 정책은 주장 밖이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const switchCostsConcept: FacetConceptSource = {
  id: 'switchCosts',
  label: 'Switch Cost Includes the Cold Cache Afterwards',
  canonicalFacet: 'facet:switchCosts',

  surface: {
    definition:
      'Switching processes costs more than the switch itself: the incoming process finds the cache filled with the previous one\'s data, so its first reads miss and go to memory, and this cold-cache penalty can exceed the switch time.',
    exemplarKeywords: [
      'context switch overhead',
      'cache pollution',
      'cold cache after context switch',
      'cache misses after switching',
      'indirect cost of context switching',
      'warm-up cost',
      'CPU affinity',
      'why frequent switching hurts performance',
      'TLB flush',
    ],
  },

  briefing: {
    observable: [
      'A two-slot Cache sits above a Memory row holding `a1`, `a2`, `b1`, `b2`; a CPU box shows who is running. At the start the cache holds A\'s `a1` and `a2` ("Running: A. In the cache: a1 · a2.").',
      'A reads `a1` and `a2`: "in the cache. +1" each. Then "Switch A → B. +3" — the cache is not emptied; it still holds A\'s two items.',
      'B reads `b1`: "not in the cache, fetched from memory. Pushed out: a1. +10", and `b2` likewise pushes out `a2`. B\'s second reads of `b1` and `b2` cost +1 each.',
      '"Switch B → A. +3", and now A pays: "A reads a1: not in the cache, fetched from memory. Pushed out: b1. +10", then `a2` the same. Reads that cost 1 tick at the start now cost 10.',
      'Two time bars run underneath: the whole clock, and the part that was not work. The run ends at "Clock: 50 · Not work: 42 / 50 · Work: 8 · Switching: 6 · Cold cache: 36" — the cold-cache share is six times the switching share.',
      'Eleven steps: the start, eight reads and two switches. The tick values (hit 1, miss 10, switch 3) are example values, each miss is split into 1 tick of work and 9 of cold-cache cost, and the two-slot cache evicts the oldest item. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays the eleven steps by itself and stops once A has refetched both items.',
        'A Replay button and a playback strip sit below it. Stepping past "Switch A → B" to B\'s first read shows the small switch charge followed by the much larger miss.',
      ],
    },

    useWhen: [
      'The article claims that frequent switching is expensive and needs to show that most of the price arrives after the switch, as misses on data the other process displaced.',
      'A reader measures only the time spent inside the switch routine; the "Cold cache: 36" beside "Switching: 6" shows what that measurement leaves out.',
    ],

    avoidWhen: [
      'The article is about what gets saved and restored in a switch. Registers and records do not appear; the switch is a single charge.',
      'The subject is cache replacement policies. With two slots and two incoming items, every eviction is forced.',
      'The point is how often a scheduler should switch or what time slice to choose. There are exactly two switches in a fixed order.',
    ],

    contrastWith: [
      {
        concept: 'contextSwitching',
        note: 'Context switching counts its overhead as the idle gap between saving one flow and restoring the other; the cold-cache cost is paid after that gap, by the process that resumes.',
      },
      {
        concept: 'saveAndRestore',
        note: 'Saving and restoring is what a switch must do to stay correct; the cold cache is a cost that correctness does not require and cannot avoid.',
      },
    ],
  },
};
