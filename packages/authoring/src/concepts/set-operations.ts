/**
 * setOperations 개념 선언.
 *
 * canonical facet 은 `facet:setOperations` — A = {1, 2, 3, 4, 5} · B = {4, 5, 6, 7} 에서 교집합 · 합집합 · 차집합이
 * 차례로 원소의 사본을 모은다. 양쪽에서 온 같은 원소는 하나로 포개지고, 차집합은 B 에도 있는 원소를 덜어 낸다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `inclusionExclusion` 이 **몇 개인가**를 쥐므로 이쪽은 **어느 원소인가**를 쥔다 — definition 은 keeps ·
 * belonging to both · takes every element once · lacks 를 독점하고 size · count · twice 를 쓰지 않는다.
 * 완제품 `combinatorics` 와는 "부분집합은 집합 연산이 다루는 모음" 이라는 설명 글의 끈뿐이다.
 *
 * 전제: A · B 는 예로 정한 모음. B − A · 여집합 · 대칭차는 화면에 없고 설명 글 `setOperations.md` 가 잇는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const setOperationsConcept: FacetConceptSource = {
  id: 'setOperations',
  label: 'Set Operations (Intersection, Union and Difference)',
  canonicalFacet: 'facet:setOperations',

  surface: {
    definition:
      'Intersection keeps only the elements belonging to both sets, union takes every element once even when both sets hold it, and the difference A − B keeps the elements of A that B lacks.',
    exemplarKeywords: [
      'intersection',
      'union',
      'set difference',
      'A ∩ B',
      'A ∪ B',
      'A minus B',
      'Venn diagram',
      'elements in both sets',
      'no duplicates in a set',
      'relative complement',
    ],
  },

  briefing: {
    observable: [
      'The sets are written as "A = 1 2 3 4 5" and "B = 4 5 6 7". Below them three result places wait, labelled "Intersection A ∩ B", "Union A ∪ B" and "Difference A − B"; the first caption reads "Each operation gathers copies of elements from A and B".',
      'Intersection: 4 and 5 each come down once from A and once from B, four copies in all, and merge into two. "|A ∩ B| = 2", with the caption "Only elements in both come out, one copy from each side, and merge: {4, 5}".',
      'Union: nine copies come in, five from A and four from B, and the two 4s and two 5s merge so each appears once. "|A ∪ B| = 7" with 1 2 3 4 5 6 7.',
      'Difference: all five copies of A come in, then 4 and 5 are taken out because B also has them, leaving "|A − B| = 3" with 1 2 3. A second caption notes "Only in B, nothing to take out: {6, 7}"; 6 and 7 do not move.',
      'A and B stay in place throughout and the three results remain side by side at the end. Elements that came from both sets are drawn half in each set\'s colour.',
      'A and B are example sets. B − A, complements and the symmetric difference are not shown.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps by itself (the start and one operation each) and stops with all three results visible.',
        'A Replay button and a playback strip sit below it. Dragging back to one operation holds the moment copies merge or are taken out.',
        'The sets are fixed, so every result can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article defines intersection, union and difference and wants the reader to see which elements each one brings in from the same pair of sets.',
      'A reader thinks a union lists shared elements twice, or that A − B also removes B\'s own elements; the article needs the merging and the untouched 6 and 7 in view.',
    ],

    avoidWhen: [
      'The question is how many elements the union has and how to correct for overlap. Sizes appear only as labels; no counting argument is made.',
      'The article is about SQL joins or relational algebra over rows. The elements here are plain integers with no keys or tables.',
      'The subject is complements relative to a universe, symmetric difference, or set identities like De Morgan\'s laws. Only three operations on two sets are shown.',
    ],

    contrastWith: [
      {
        concept: 'inclusionExclusion',
        note: 'Which elements a union contains is a membership question; how many it contains, given the sizes of the parts, is a counting question that needs the overlap subtracted.',
      },
      {
        concept: 'powerSet',
        note: 'Set operations combine two given sets into a third; the power set collects every subset of one set, a collection of sets rather than a set of elements.',
      },
      {
        concept: 'joinKinds',
        note: 'Joins pair up rows by a matching key and keep or drop unmatched rows; set operations compare whole elements for equality and never pair anything.',
      },
      {
        concept: 'bitwiseCombine',
        note: 'A bitwise AND over membership bitmaps computes an intersection in bulk. The set view states which elements belong, independent of how membership is stored.',
      },
    ],
  },
};
