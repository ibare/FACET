/**
 * pageTableLookup 개념 선언.
 *
 * canonical facet 은 `facet:pageTableLookup` — 가상 주소 셋(`0x2A3C` · `0x0104` · `0x3FF0`)이 차례로 앞 한 자리와
 * 뒤 세 자리로 갈라지고, 앞쪽만 페이지 표의 제 줄로 가서 프레임 번호로 바뀌어 돌아와, 손대지 않은 뒤쪽과 다시
 * 붙는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `paging`(완제품)은 TLB 칸 수를 돌려 표 찾기가 어디서 꺾이는지를 쥐고, 형제 조각 `tlbCachesTranslation` 은 찾은
 * 번역이 곁에 남는 것, `fixedSizeFrames` 는 같은 길이로 잘려 흩어지는 것을 쥔다. 이쪽은 **번역 하나의 해부** —
 * 주소가 둘로 갈라지고 앞쪽만 바뀐다 — 하나다. 그래서 definition 은 page number · offset · replaced · reattach 를
 * 독점하고 TLB · walk · cut · kept 를 쓰지 않는다.
 *
 * 전제: 값은 예로 정한 것. 주소 16비트, 페이지 4 KiB 라 맨 앞 16진 한 자리가 페이지 번호다. 표의 네 줄은 모두
 * 메모리에 있다(없는 페이지는 다루지 않는다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pageTableLookupConcept: FacetConceptSource = {
  id: 'pageTableLookup',
  label: 'Page Table Lookup (Page Number Swapped, Offset Kept)',
  canonicalFacet: 'facet:pageTableLookup',

  surface: {
    definition:
      'A virtual address divides into a page number and an offset; only the page number is replaced, through the page table, by a frame number, while the unchanged offset is reattached to form the physical address.',
    exemplarKeywords: [
      'virtual to physical address translation',
      'page number and offset',
      'page table entry',
      'frame number',
      'logical address to physical address',
      'address translation example in hex',
      'why the offset does not change',
      'page size power of two',
      'MMU translation',
    ],
  },

  briefing: {
    observable: [
      'Three areas: the addresses to translate on the upper left, a four-row page table in the middle (0 → 6, 1 → 3, 2 → B, 3 → 1), and translated physical addresses on the upper right. The start reads "Addresses to translate: 3".',
      'Each address takes three steps. First it comes down to a work area and a gap opens between its first hex digit and the last three: "Split: 0x2A3C → page 2 · offset 0xA3C".',
      'Second, only the page digit rises to its row in the table and crosses it, turning into the frame number: "Table row 2 → frame B". The offset stays where it was.',
      'Third, the frame comes down from the table and the offset slides across beneath it; the two join: "Joined: frame B + offset 0xA3C → 0xBA3C".',
      'The three results are `0xBA3C`, `0x6104` and `0x1FF0`. Set side by side with `0x2A3C`, `0x0104` and `0x3FF0`, each pair differs only in the first digit.',
      'The values are chosen for illustration. Addresses are 16 bits and pages are 4 KiB, so the first hex digit is the page number and the last three are the offset. Every row of the table is resident; a page that is not in memory never comes up.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, three steps per address, and stops after the third join — ten steps including the start.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to a split step holds the moment the address is in two parts, before the page number has been replaced.',
        'The table and the three addresses are fixed, so an article can quote every split and result exactly.',
      ],
    },

    useWhen: [
      'The reader has heard that paging maps addresses through a table and needs to see that the table is consulted for only part of the address, while the offset passes through untouched.',
      'The article works a hex translation example by hand and wants the reader to watch the first digit swap while the last three stay put.',
    ],

    avoidWhen: [
      'The article is about the TLB or the cost of translation. Every lookup here goes to the table and nothing is cached or counted.',
      'The subject is a page fault or a missing page. All four rows are present.',
      'The point is multi-level page tables or how the table itself is laid out in memory. There is a single four-row table.',
      'The subject is segmentation with base and limit registers. Pages here have one fixed size and there is no length check.',
    ],

    contrastWith: [
      {
        concept: 'paging',
        note: 'One translation shows what happens to an address; how many table lookups a stream of addresses needs, and how a small cache of translations cuts that number, is a separate performance question.',
      },
      {
        concept: 'tlbCachesTranslation',
        note: 'The table lookup produces a translation; keeping that result so later addresses on the same page skip the lookup is the next idea and does not change how the address itself is divided.',
      },
      {
        concept: 'pageFault',
        note: 'Translation assumes the table row names a frame. When the row says the page is absent, the access stops and the operating system has to bring the page in first.',
      },
      {
        concept: 'pointerDereference',
        note: 'A program following a pointer sees a single address and one hop to the value. Underneath, that address is itself virtual, and the hardware divides and translates it before any memory is read.',
      },
    ],
  },
};
