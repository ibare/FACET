/**
 * tlbCachesTranslation 개념 선언.
 *
 * canonical facet 은 `facet:tlbCachesTranslation` — 가상 주소 여덟이 차례로 온다. TLB 에 없으면 페이지 표를 찾아가
 * 그 번역 한 줄을 TLB 에 적고, 같은 페이지의 주소가 다시 오면(오프셋이 달라도) 그 줄에서 바로 끝난다.
 * 표 찾기 3 · 적중 5 로 끝난다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `paging`(완제품)은 칸 수를 돌리며 표 찾기가 어디서 꺾이는지를 쥔다. 이쪽은 칸 넷 고정 · 내보내기 없음 —
 * **한 번 찾은 번역이 남아 같은 페이지의 다른 주소에도 쓰인다** 하나다. 그래서 definition 은 copied · later ·
 * same page · different offset · instead of 를 쥐고, number of entries · sharply · frequently used 를 쓰지 않는다.
 * 형제 `pageTableLookup` 의 divides · reattach 도 쓰지 않는다.
 *
 * 전제: 표 · 주소 · 칸 수는 예로 정한 값. 주소 16비트 · 페이지 4 KiB. TLB 는 넷 칸이고 페이지 셋만 쓰여 차지 않는다 —
 * 내보내기를 다루지 않는다. 실제 TLB 는 크고, 문맥 전환 때 비우거나 주소 공간 번호로 가른다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tlbCachesTranslationConcept: FacetConceptSource = {
  id: 'tlbCachesTranslation',
  label: 'TLB Keeps a Translation (Same Page, No Second Lookup)',
  canonicalFacet: 'facet:tlbCachesTranslation',

  surface: {
    definition:
      'A translation looked up once in the page table is copied into the TLB, and every later address on that page, even at a different offset, is answered from the copy instead of the table.',
    exemplarKeywords: [
      'translation lookaside buffer',
      'what is a TLB',
      'TLB hit and TLB miss',
      'caching page table entries',
      'avoid a second memory access for translation',
      'one TLB entry per page',
      'spatial locality and the TLB',
      'address translation cache',
    ],
  },

  briefing: {
    observable: [
      'Eight virtual addresses wait in a row: `0x1A00`, `0x1A04`, `0x3100`, `0x1B20`, `0x3104`, `0x1C00`, `0x5008`, `0x3108`. The start reads "Accesses waiting: 8. The TLB is empty."',
      'On the right, a four-slot TLB headed "page → frame" and a six-row page table (0 → 4, 1 → 9, 2 → 7, 3 → 2, 4 → E, 5 → C). Two counters: "TLB hits" and "Table walks".',
      'A miss takes two steps: "Page 1 is not in the TLB. Walk the page table: 1 → 9.", then "Line written to the TLB: 1 → 9. Physical address 0x9A00."',
      'A hit takes one step and names the address whose walk wrote the line: "TLB hit on page 1, the line written for 0x1A00. Physical address 0x9A04." Each address in the row is tagged "table" or "TLB" once served.',
      '`0x1A04`, `0x1B20` and `0x1C00` are different addresses on page 1, and all three reuse the single line written for `0x1A00`. The run ends at 3 table walks and 5 TLB hits, with three lines in the TLB.',
      'The values are chosen for illustration. Only three pages are used, so the TLB never fills and nothing is evicted. Real TLBs hold dozens to thousands of entries, and real table walks often pass through several levels.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops on the eighth access, a hit — twelve steps including the start.',
        'A Replay button and a playback strip sit below it. Stepping back and forth between the second and third accesses contrasts a one-step hit with a two-step walk.',
        'The addresses and table are fixed, so the article can quote which accesses walked the table and which were served by the TLB.',
      ],
    },

    useWhen: [
      'The article introduces the TLB and needs the reader to see why it pays off even when it is small: a line is per page, so nearby addresses all hit the same line.',
      'A reader confuses a TLB with a data cache and needs to watch it store a page-to-frame line rather than a value.',
    ],

    avoidWhen: [
      'The article is about sizing a TLB or about eviction from a full TLB. The four slots never fill.',
      'The subject is the CPU data cache, cache lines or associativity. What is stored here is a translation, not data.',
      'The point is TLB shootdown, flushing on a context switch, or address-space tags. One address stream runs from start to finish.',
    ],

    contrastWith: [
      {
        concept: 'paging',
        note: 'That a remembered translation is reused is the principle. How much reuse a given number of entries buys, and why it arrives all at once when the busy pages fit, is a question about capacity.',
      },
      {
        concept: 'pageTableLookup',
        note: 'The table lookup is what the TLB saves; the lookup itself, splitting the address and swapping only the page number, is unchanged whether its result is cached or not.',
      },
      {
        concept: 'lruCache',
        note: 'Both keep recent results in a small store to avoid repeating a slower step. A software cache is keyed by arbitrary keys and centres on what to evict; a TLB is keyed by page number and holds one translation per page.',
      },
    ],
  },
};
