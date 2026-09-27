/**
 * inclusionExclusion 개념 선언.
 *
 * canonical facet 은 `facet:inclusionExclusion` — A = {a … g} · B = {e … i}. |A| 를 더하면 일곱 원소에 표가 하나씩,
 * |B| 를 더하면 e · f · g 에 표가 둘 쌓여 센 수가 12 가 된다. |A ∩ B| = 3 을 빼면 표가 모두 하나로 돌아와 9,
 * 끝에 하나씩 직접 센 9 와 나란히 선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `setOperations` 가 **어느 원소인가**를 쥐므로 이쪽은 **몇 번 세었는가**를 쥔다 — definition 은 sizes ·
 * counts twice · subtract once 를 독점하고 keeps · belonging 을 쓰지 않는다.
 *
 * 전제: A · B 는 예로 정한 모음. 모음 셋 이상의 포함배제는 화면에 없고 설명 글 `inclusionExclusion.md` 가 잇는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const inclusionExclusionConcept: FacetConceptSource = {
  id: 'inclusionExclusion',
  label: 'Inclusion–Exclusion for Two Sets (Subtract What Was Counted Twice)',
  canonicalFacet: 'facet:inclusionExclusion',

  surface: {
    definition:
      'Adding the sizes of two sets counts every shared element twice, so the size of their union is |A| + |B| − |A ∩ B|, with the overlap subtracted exactly once.',
    exemplarKeywords: [
      'inclusion-exclusion principle',
      '|A ∪ B| = |A| + |B| - |A ∩ B|',
      'double counting',
      'size of a union',
      'overlapping sets count',
      'how many are in either group',
      'Venn diagram counting',
      'sum rule for overlapping cases',
    ],
  },

  briefing: {
    observable: [
      'Nine elements a to i stand in one row; two bands underneath mark membership in A (a to g) and in B (e to i). Tallies of how many times each element has been counted stack above it, none at first, with "Count 0" and the caption "Nothing counted yet · Count: 0".',
      'Adding |A| sends one tally from the formula term onto each of a to g: "Added |A| = 7 · Count: 7".',
      'Adding |B| puts one more tally on each of e to i, so e, f and g now carry two: "Added |B| = 5 · Count: 12 · Elements with two tallies: 3". The running line reads |A| 7, |B| + 5, = 12.',
      'Subtracting |A ∩ B| knocks the top tally off e, f and g and returns it to the "− 3" term: "Subtracted |A ∩ B| = 3 · Count: 9 · Elements with two tallies: 0". Every element now carries exactly one tally.',
      'The last step counts the elements of A ∪ B one by one, numbering them 1 to 9, and places the result beside the formula: "Counted one by one, A ∪ B: 9 · Formula: 9".',
      'A and B are example sets. The three-set version of the principle is not shown.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself (the start, two additions, one subtraction and a direct count) and stops with the formula and the direct count side by side.',
        'A Replay button and a playback strip sit below it. Dragging back to the second addition holds the moment three elements carry two tallies.',
        'The sets are fixed, so every count and tally can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article derives |A ∪ B| = |A| + |B| − |A ∩ B| and wants the reader to see which elements were counted twice before the correction, not just the arithmetic.',
      'A word problem asks how many people belong to at least one of two groups and readers keep adding the two group sizes; the article needs the overcount made visible element by element.',
    ],

    avoidWhen: [
      'The article needs inclusion–exclusion for three or more sets, with alternating signs. Only two sets appear.',
      'The subject is which elements belong to a union or intersection. The screen counts; it never builds a result set.',
      'The article is about probability of a union, P(A ∪ B). Only counts of elements appear, no probabilities.',
    ],

    contrastWith: [
      {
        concept: 'setOperations',
        note: 'Set operations say which elements end up in a union or intersection; inclusion–exclusion says how many there are, using only the sizes and the overlap.',
      },
      {
        concept: 'conditionalNarrowing',
        note: 'Conditioning shrinks the space to one set and asks what fraction of it also lies in another; inclusion–exclusion keeps the whole union and corrects its count for the shared part.',
      },
      {
        concept: 'productRuleTree',
        note: 'The product rule multiplies independent choices made in sequence; inclusion–exclusion adds alternative cases and must subtract any outcome that belongs to more than one.',
      },
    ],
  },
};
