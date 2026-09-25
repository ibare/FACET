/**
 * paging 개념 선언.
 *
 * canonical facet 은 `facet:paging` — 주소 열여섯이 차례로 번역된다. TLB 를 먼저 보고, 없으면 페이지 표를 찾아가
 * 번역을 TLB 칸에 적는다(칸이 차면 LRU 로 내보낸다). 손잡이 TLB 칸(0~4, 처음 2)을 돌리면 표 찾기가
 * 16 · 15 · 13 · 6 · 5 로 간다 — 자주 쓰는 페이지 셋이 다 들어가는 칸 3 에서 한꺼번에 꺾인다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 주소가 갈라져 앞쪽만 바뀌는 것(`pageTableLookup`), 같은 길이로 잘려 떨어진
 * 빈 칸으로 흩어지는 것(`fixedSizeFrames`), 한 번 찾은 번역이 곁에 남아 다시 쓰이는 것(`tlbCachesTranslation`).
 * 이쪽은 **칸 수를 돌리면 효과가 고르게 오지 않는다**는 것을 쥔다. 그래서 definition 은 칸 수 · 표 찾기 횟수 ·
 * 자주 쓰는 페이지 · 급히 꺾임 쪽 낱말을 쓰고, 조각들이 쥔 split · offset · reattach · equal-length · kept · same page
 * 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `paging.md` 가 밝힌 것):
 *  - 표와 주소는 예로 정한 값. 페이지 4 KiB, 주소 16비트라 맨 앞 16진 한 자리가 페이지다.
 *  - 페이지 표는 한 단계이고 메모리에 있다고 본다 — 표 찾기는 메모리 읽기 둘, 적중은 하나. 실제는 여러 단계다.
 *  - 표의 다섯 줄은 모두 메모리에 있어 폴트가 없다. TLB 교체는 LRU 로 본다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pagingConcept: FacetConceptSource = {
  id: 'paging',
  label: 'Paging and the TLB (How Many Entries Pay Off)',
  canonicalFacet: 'facet:paging',

  surface: {
    definition:
      'How the number of TLB entries changes the count of page-table walks over one address trace: extra entries barely help until they can hold every frequently used page at once, then walks drop sharply.',
    exemplarKeywords: [
      'TLB size',
      'how many TLB entries',
      'TLB hit rate',
      'TLB reach',
      'page table walk cost',
      'effective memory access time',
      'hot pages fit in the TLB',
      'address translation performance',
      'paging overhead',
      'MMU',
    ],
  },

  briefing: {
    observable: [
      'Sixteen references stand in a row as 16-bit hex addresses, `0x0A10` to `0x1504`. Their pages run `0 0 1 0 2 1 0 3 0 1 2 0 1 4 0 1`: pages 0, 1 and 2 keep coming back, pages 3 and 4 appear once each.',
      'Each step translates one address. The address splits into page and offset; the page either finds its slot in the TLB ("TLB hit: slot 1") or goes down to the five-row page table and comes back with a frame ("Table walk: page 2 → frame D"), is written into a slot ("Written to slot 2") and, when the slots are full, pushes out the slot used longest ago ("Evicted from TLB: page 1"). The caption ends with the physical address, e.g. "Physical: 0xD040".',
      'Every slot shows its page, frame and `#n`, the number of the reference that last used it. Slots beyond the current count stay closed.',
      'Under each reference a route marker sits in the upper row if it was translated in the TLB and in the lower row if it needed a table walk. A running "Hit rate" readout sits beside the TLB.',
      'Final counts over the handle (TLB hits / Table walks / Memory reads): 0 slots 0 / 16 / 32, 1 slot 1 / 15 / 31, 2 slots 3 / 13 / 29, 3 slots 10 / 6 / 22, 4 slots 11 / 5 / 21. Going from 2 to 3 slots moves seven references from the table route to the TLB route at once; no reference ever loses its hit when a slot is added.',
      'With 2 slots the three busy pages evict each other in turn — at the fifth reference page 2 pushes out page 1, at the sixth page 1 comes back and pushes out page 0.',
      'The page table and addresses are chosen for illustration. The table is taken to be one level and held in memory, so a walk costs one extra memory read; real tables have several levels and cost more. All five pages are resident, so no page fault occurs. TLB replacement is least-recently-used. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: "TLB slots", five positions 0 to 4, starting at 2. Each round translates all sixteen references, then waits for the handle.',
        'Three counters under the controls — "TLB hits", "Table walks", "Memory reads" — restart at zero each round and end at the values for that slot count.',
        'The move that makes the idea land is 2 → 3: table walks fall from 13 to 6 in a single step, after 16 → 15 → 13 before it and only 6 → 5 after. When the handle moves, the previous round\'s route markers stay hollow and slide to the new row as each reference is reached.',
        'The code panel, labelled "Address translator", starts empty with a "+ Add language" button; the chosen language shows the translation routine and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article asks how large a TLB has to be and needs the non-linear answer: extra entries do almost nothing until the pages in active use all fit, and then the walks collapse.',
      'A reader wants to connect locality of reference to TLB hit rate, with a trace where three pages dominate and the counters show exactly where the benefit arrives.',
    ],

    avoidWhen: [
      'The article is about page faults, demand paging or swapping. Every page here is resident; the only cost measured is walking the table.',
      'The subject is multi-level page tables, inverted page tables or huge pages. The table here is a single level with five rows and one page size.',
      'The point is a CPU data cache or cache associativity. The slots hold address translations, not data.',
      'The subject is TLB flushes on a context switch or address-space identifiers. One process\'s addresses run from start to finish.',
    ],

    contrastWith: [
      {
        concept: 'pageTableLookup',
        note: 'Splitting an address and replacing only the page number is the mechanism of every translation. How often that lookup can be skipped, and how the savings depend on the number of cached entries, is a question about cost, not mechanism.',
      },
      {
        concept: 'tlbCachesTranslation',
        note: 'That a fetched translation is kept and reused is the principle behind a TLB. Measuring how the benefit changes with the number of entries, including when entries must be evicted, turns the principle into a sizing question.',
      },
      {
        concept: 'fixedSizeFrames',
        note: 'Cutting a process into equal pages that land in scattered frames is what makes a page table necessary at all; the cost of consulting that table on every access is the separate problem a TLB addresses.',
      },
      {
        concept: 'cacheReplacement',
        note: 'Both keep a few recently useful items in a small fast store. A processor cache stores data lines and the question is the discard rule; a TLB stores translations, and its benefit depends sharply on how many it can hold.',
      },
    ],
  },
};
