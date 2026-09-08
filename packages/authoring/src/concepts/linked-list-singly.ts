/**
 * linkedListSingly 개념 선언.
 *
 * canonical facet 은 `facet:linkedListSingly` — 카드와 화살표 체인, 재배선을 2단계로
 * 나누어 보여주는 stage view.
 *
 * reactive 다. mount 직후 insert(2, "25") 를 자동 시연한 뒤 입력을 기다린다.
 *
 * 변별어를 붙인 이유: 이중·원형 연결 리스트가 모두 "linked list" 를 자칭한다
 * (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const linkedListSinglyConcept: FacetConceptSource = {
  id: 'linkedListSingly',
  label: 'Singly Linked List',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:linkedListSingly',

  surface: {
    definition:
      'A chain of nodes where each node stores one reference to its successor only, so the sequence is held by the links rather than by position in memory.',
    exemplarKeywords: [
      'linked list',
      'singly linked list',
      'node and next pointer',
      'head',
      'rewiring pointers',
      'insertion without shifting',
      'sequential access',
      'traversal from the head',
      'null terminator',
      'pointer-based structure',
    ],
  },

  briefing: {
    observable: [
      'Every card holds a single finger pointing only at the card after it — nothing points backwards, which is the whole reason a walk can only go one way.',
      'An insert happens in two separate beats: first the new card\'s finger is tied to the next card, then the previous card\'s finger is moved over. The order matters, and splitting it into two frames is what makes that visible.',
      'A remove is one beat — the previous card\'s finger swings past the departing card straight to the one after it. The card itself is not moved anywhere.',
      'Inserting at the head slides the head label onto the new card, so the entry point of the whole list changes rather than any card shifting.',
      'A search starts at the head and steps one card at a time, and the step count accumulates on screen — reaching position 5 costs 5 steps no matter what the list holds.',
      'Four counters run along: inserts, removes, searches, and total steps walked.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet. It demonstrates one insert on mount, then stops and waits.',
        'The controls are two fields (index and value) plus Insert, Remove, Search and Reset.',
        'The two-beat insert is the thing to slow down on — ask the reader to watch which finger moves first, because tying them in the other order loses the tail.',
      ],
    },

    useWhen: [
      'The article contrasts links with contiguous storage, and the reader needs to feel that reaching the tenth node means walking ten.',
      'The reader should see what an insert costs here — relinking two references, with no shifting anywhere.',
    ],


    avoidWhen: [
      'The article is about a doubly linked list. Every node here holds exactly one finger, and backwards traversal is precisely what this visualization cannot show.',
      'The subject is a circular list. The chain here ends, and nothing loops back to the head.',
      'The point is contiguous memory or cache behaviour. The cards are drawn in a row for legibility, which would mislead an argument about locality.',
    ],

    contrastWith: [
      {
        concept: 'array',
        note: 'The trade is exact: a linked list inserts by rewiring two fingers but must walk to find the place; an array reaches the place in one step but shifts everything behind it.',
      },
      {
        concept: 'lruCache',
        note: 'An LRU cache is a linked list carrying order plus a hash map carrying lookup — this facet is the half that holds the order.',
      },
    ],
  },
};
