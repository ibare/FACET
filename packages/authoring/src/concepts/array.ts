/**
 * array 개념 선언.
 *
 * canonical facet 은 `facet:array` — 띠 모양 셀 배열 + 주소 산술 표시 + 시프트 집계.
 *
 * reactive 다. mount 직후 read(3) → insert(1, "5") 를 자동 시연한 뒤 멈추고 입력을
 * 기다린다. 코드 패널은 없다.
 *
 * 변별어를 붙이지 않은 이유: "배열" 이 단독으로 불려도 모호하지 않다 (C4 명명 규칙 3).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const arrayConcept: FacetConceptSource = {
  id: 'array',
  label: 'Array',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:array',

  surface: {
    definition:
      'A block of equal-width cells laid contiguously in memory and addressed by a number counted from 0, so any cell is reached in one step.',
    exemplarKeywords: [
      'array',
      'index',
      'zero-based indexing',
      'contiguous memory',
      'random access',
      'shifting elements on insert',
      'dynamic array growth',
      'capacity and resize',
      'out of bounds',
      'cache locality',
    ],
  },

  briefing: {
    observable: [
      'A read jumps straight to its cell and the address arithmetic appears beside it as "start + index" — one addition, no walking.',
      'An insert in the middle pushes every cell behind it one place along, and the shift counter climbs by exactly that many. The cost of touching the middle is a number on screen, not a claim.',
      'A remove pulls the cells behind it back by one, so the same count appears for the opposite move.',
      'An append lands on the end with nothing shifting, which is what makes it the cheap operation.',
      'When the cells fill up, the whole strip is copied onto a new one of twice the length — the resize is a visible migration, not a hidden detail.',
      'A search walks cell by cell, which is the moment it becomes obvious that indexing and searching are different things.',
      'Eight counters run along: reads, writes, inserts, removes, appends, searches, shifted cells, resizes.',
      'A size / capacity readout distinguishes how many cells are used from how many exist.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet. It demonstrates itself once on mount — a read then an insert — then stops and waits.',
        'The controls are two fields (index and value) plus Read, Write, Insert, Remove, Append, Search and Reset.',
        'The shift counter is the thing to invite the reader toward: insert at 0, then insert at the end, and compare the numbers.',
        'There is a teaching limit on size, so a reader who keeps appending will be told the limit rather than growing without bound.',
      ],
    },

    useWhen: [
      'The article calls both of them the same operation — putting a value at the front and adding one at the end — and the reader takes the cost to be the same. Doing both on one block and reading the shift counter after each is what separates them.',
      'The prose sets reaching a cell by its number against looking for a value, and the two sit side by side here as buttons on one block, so the reader can take a turn at each and watch one finish at once while the other works through the cells.',
    ],


    avoidWhen: [
      'The article is about a linked structure where insertion costs nothing to shift. The shifting here is the point and would argue the opposite case.',
      'The subject is a hash map or dictionary. Both are indexed, but by a computed address rather than by position, and nothing on this screen represents a hash function.',
    ],

    contrastWith: [
      {
        concept: 'linkedListSingly',
        note: 'The trade is exact: an array reaches any position in one step but shifts on insert; a linked list inserts by rewiring but must walk to find the place.',
      },
      {
        concept: 'queueFifo',
        note: 'A queue gives up random access to the middle in exchange for constant-time work at both ends — an array is what it gave up.',
      },
    ],
  },
};
