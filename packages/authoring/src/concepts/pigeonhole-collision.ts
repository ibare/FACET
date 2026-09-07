/**
 * pigeonholeCollision 개념 선언.
 *
 * canonical facet 은 `facet:pigeonholeCollision` — 한 주장을 말하는 조각(piece) facet.
 * 조각은 누구의 하위도 아니므로 `aspects` 를 쓰지 않고 canonicalFacet 은 자기 자신이다.
 *
 * 출처는 해시다 — "암호학적 해시란 무엇인가" 를 설명하다 나온 맥락이다. 다만
 * 소속은 하나가 아니다. 해시 테이블(자료구조), 압축의 한계, 지문·식별자 설계
 * 같은 글에서도 같은 셈이 쓰인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pigeonholeCollisionConcept: FacetConceptSource = {
  id: 'pigeonholeCollision',
  label: 'Why Hash Collisions Must Exist',
  domain: 'security',
  canonicalFacet: 'facet:pigeonholeCollision',

  surface: {
    definition:
      'Hash collisions are guaranteed by counting rather than by chance: inputs are unlimited while output values are finite, so two inputs must share one value.',
    exemplarKeywords: [
      'pigeonhole principle',
      'hash collision',
      'why collisions exist',
      'finite output space',
      'two inputs same hash',
      'collision resistance',
      'counting argument',
      'unavoidable collision',
    ],
  },

  briefing: {
    observable: [
      'Sixteen empty places are laid out first, so the reader sees how few there are before anything is placed.',
      'Inputs take the places one at a time until every place is occupied — the filling is the premise of the argument, not decoration.',
      'A seventeenth input then appears, already coloured differently, with every place already taken.',
      'It lands on a place that is occupied and the two names sit together in one box, outlined to mark the collision.',
      'A footnote states the scale honestly: sixteen places here, 2^256 in SHA-256, the same counting either way.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops, so it says what it has to say without asking for a click.',
        'A single Replay button is the only control. Watching the places fill up is what makes the last step inevitable rather than surprising, so it is worth seeing again.',
        'The place numbers come from real SHA-256 values (the last nibble), so the arrangement is not invented for the picture.',
      ],
    },

    avoidWhen: [
      'The article is about how sensitive a hash is to input changes. That is a different property and a different screen.',
      'The point is how expensive it is to find a collision — birthday bounds, 2^128 work. This shows that collisions exist, never how hard they are to find.',
      'The subject is a hash table resolving collisions by chaining or probing. That is about handling collisions in a data structure, not about why they are unavoidable.',
      'The article claims a hash function is broken because a collision was found. Existence is universal; a break is about collisions becoming cheap to produce.',
    ],

    contrastWith: [
      {
        concept: 'hashAvalanche',
        note: 'Both are about the output of a hash, but one is about how violently it changes and this one is about how few distinct values it can take.',
      },
      {
        concept: 'hashTableChaining',
        note: 'A hash table also puts many keys into few slots, but it is about what to do once two collide, while this is about why the collision cannot be avoided.',
      },
    ],
  },
};
