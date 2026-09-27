/**
 * powerSet 개념 선언.
 *
 * canonical facet 은 `facet:powerSet` — S = {a, b, c, d} 의 원소를 a → d 차례로 하나씩 들인다. 걸음마다 옛
 * 부분집합 카드는 제자리에 남고, 카드마다 사본이 생겨 새 원소를 얹는다. 수가 1 → 2 → 4 → 8 → 16 이 된다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `combinatorics` 는 같은 갈라짐을 크기 열로 나눠 n · k 를 돌리며 이항 계수를 읽는다. 이쪽은 크기를 세지
 * 않는다 — 주장은 "원소 하나에 두 배" 하나다. 그래서 definition 은 doubles · copy · unchanged · 2^n 을 독점하고
 * size · Pascal · k 를 쓰지 않는다.
 *
 * 전제: S 와 들이는 차례는 예로 정한 값이다. 원소 넷의 한 사례이고, 일반은 "넣는다 · 뺀다" 논증이 받친다
 * (설명 글 `powerSet.md`).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const powerSetConcept: FacetConceptSource = {
  id: 'powerSet',
  label: 'Power Set (Each New Element Doubles the Subsets)',
  canonicalFacet: 'facet:powerSet',

  surface: {
    definition:
      'Taking in one more element doubles the collection of subsets: every existing subset remains unchanged while a copy of it gains the new element, so a set of n elements has 2^n subsets.',
    exemplarKeywords: [
      'power set',
      'number of subsets is 2^n',
      'why 2 to the n subsets',
      'include or exclude each element',
      'empty set is a subset',
      'all subsets of a set',
      'P(S)',
      'subsets and binary numbers',
      'doubling',
    ],
  },

  briefing: {
    observable: [
      'The set is written across the top as "S =" with the chips a, b, c, d. At the start the only card is ∅, and the caption reads "No element taken yet — the only subset is the empty set."',
      'Each step takes in the next letter. Every card already on screen stays where it is, a copy of it slides off to a new place behind the old ones, and the new letter flies down from its chip onto every copy. The caption reads "Take c: every subset stays as it is, and its copy gets c." with "Subsets: 4 → 8".',
      'A running line of counts grows along the top: 1 → 2 → 4 → 8 → 16.',
      'The final sixteen cards stand in the order ∅ {a} {b} {a, b} {c} {a, c} {b, c} {a, b, c} {d} {a, d} {b, d} {a, b, d} {c, d} {a, c, d} {b, c, d} {a, b, c, d}; no two are the same. The last caption adds "Elements taken: 4".',
      'The count is taken by counting the cards, not by evaluating a power. The set {a, b, c, d} and the order of intake are example values; the screen shows four elements, and the general 2^n rests on the include-or-exclude argument, which the screen does not state.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself (the empty start and four intakes) and stops at sixteen cards.',
        'A Replay button and a playback strip sit below it. Dragging the strip back and forth over one intake shows that the old cards never move while their copies appear.',
        'The set and the order are fixed, so an article can quote every card in the order it appears.',
      ],
    },

    useWhen: [
      'The article states that a set of n elements has 2^n subsets and wants the reader to see the count double at each element rather than accept the formula.',
      'Students list subsets by hand and keep missing some; the article wants a systematic listing where each new element copies everything so far, including the empty set.',
    ],

    avoidWhen: [
      'The article needs how many subsets have a given size. Sizes are never counted here.',
      'The subject is searching all subsets for one that meets a condition, such as subset sum. Nothing is examined or tested; the collection only grows.',
      'The set is infinite or the article is about cardinality of infinite sets. Only four elements appear.',
    ],

    contrastWith: [
      {
        concept: 'combinatorics',
        note: 'Doubling at each element gives the total. Splitting that total by subset size is the next question, and it is where the binomial coefficients and Pascal\'s triangle come from.',
      },
      {
        concept: 'productRuleTree',
        note: 'Each element offering in or out is a product of n factors of two. The product rule covers any number of options per position; the power set is the case where every position has exactly two.',
      },
      {
        concept: 'verifyVsFind',
        note: 'The 2^n subsets are what an exhaustive search would have to examine. Here the point is only how that collection grows, not the cost of looking through it.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'Both double with each step. In a binary tree the positions per level double; here the number of distinct subsets doubles because each old one gains a copy with one more element.',
      },
    ],
  },
};
