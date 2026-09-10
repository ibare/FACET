/**
 * bubbleAdjacentSwap 개념 선언.
 *
 * canonical facet 은 `facet:bubbleAdjacentSwap` — 값 다섯을 왼쪽 끝에서 오른쪽
 * 끝까지 **한 번만** 훑고 멈추는 조각이다. 칸 아래를 달리는 선두 표시가 견줌
 * 한 번마다 예외 없이 한 칸씩 오른쪽으로 가고, 그 자취가 끊긴 데 없이 이어져
 * "찾는 걸음 없이 최댓값이 끝에 닿았다" 를 정지 화면으로 남긴다.
 *
 * ── 묶음 안에서 무엇을 맡는가
 *
 * `bubbleSort`(완제품) 는 훑기를 되풀이해 정렬이 끝나는 절차 전체와 그 비용을
 * 말한다. 이 조각은 그 되풀이의 **한 번**만 떼어 내, 왜 그 한 번으로 끝자리가
 * 확정되는지 — 선두가 한 칸씩만 간다는 불변식 — 하나만 말한다. definition 의
 * 무게중심을 "정렬" 이 아니라 "한 번의 훑음과 그 불변식" 에 둔 까닭이다.
 * 형제 `compareAndSwap` 은 짝 하나 안에서 견줌과 맞바꿈이 갈리는 것을 말하고,
 * 이 조각은 그 짝들이 줄지어 이어질 때 생기는 결과를 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bubbleAdjacentSwapConcept: FacetConceptSource = {
  id: 'bubbleAdjacentSwap',
  label: 'One Sweep of Neighbour Swaps',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bubbleAdjacentSwap',

  surface: {
    definition:
      'A single left-to-right sweep over neighbouring pairs, in which the running maximum moves exactly one slot per comparison and therefore ends at the last position.',
    exemplarKeywords: [
      'why the largest value ends up at the end',
      'one pass over the array',
      'running maximum',
      'loop invariant of a pass',
      'no separate search step',
      'carrying a value to the far end',
      'settling the last position',
      'neighbour-only comparison',
      'n-1 comparisons in a sweep',
    ],
  },

  briefing: {
    observable: [
      'Only two boxes are lit at a time, and they are always side by side — no step ever reaches across the row.',
      'A swap is drawn as the larger value rising over its neighbour and landing one slot to the right, so a value that keeps winning is seen travelling several slots in a row.',
      'A marker below the row tracks the lead — the largest value seen so far — and it advances exactly one slot after every comparison, whether or not anything was swapped.',
      'When the right-hand value is already larger, nothing moves and the caption says the lead has passed to the neighbour instead.',
      'The marker leaves an unbroken trail, so at the end the line runs from the leftmost box to the rightmost one with no jump anywhere along it.',
      'The closing caption gives the number of neighbour comparisons made and names the value now sitting at the far right.',
      'The row is left unsorted when the sweep ends — only the last box is settled.',
    ],

    screen: {
      affordances: [
        'The sweep plays once on its own from a fixed five-value row and stops at the end.',
        'Two buttons: Replay, and a step control that rewinds and then walks the same sweep one comparison at a time.',
        'The starting arrangement never changes, so the article can name the value that travels and count the comparisons it takes.',
      ],
    },

    useWhen: [
      'The reader has read the code and cannot find the step that looks for the largest value, because there is none — the marker advancing one slot per comparison is where that value comes from.',
      'A later argument depends on the end of the row being settled after one pass, and the reader has to accept that before the shrinking-range version of the loop makes sense.',
    ],

    avoidWhen: [
      'The article needs a finished sorted array. This stops after one sweep and leaves the rest in its original disorder.',
      'The subject is the total cost of the sort, the early-exit test, or how many passes are needed. Nothing here repeats or accumulates across passes.',
      'The point is that a value can be moved a long way in one step, as in gap-based or partition-based sorts. Every move here crosses exactly one boundary.',
    ],

    contrastWith: [
      {
        concept: 'compareAndSwap',
        note: 'That one separates the judgment from the write inside a single pair; this one chains those pairs and shows what the chain produces at the end of the row.',
      },
      {
        concept: 'bubbleSort',
        note: 'The same mechanism seen at two scales — one sweep settling one position, against the repetition of sweeps that finishes the array and costs quadratic time.',
      },
      {
        concept: 'selectMinEachPass',
        note: 'Both settle one position per pass, but selection scans the whole remainder to find the extreme value while here no step ever goes looking for it.',
      },
    ],
  },
};
