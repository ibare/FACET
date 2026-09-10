/**
 * mergeTwoSorted 개념 선언.
 *
 * canonical facet 은 `facet:mergeTwoSorted` — 줄 둘이 위에 나란히 눕고 빈 결과줄이
 * 아래에서 기다리는 조각이다. 이긴 칸이 제 줄에서 떨어져 나와 결과줄로 내려앉고
 * 떠난 자리에는 점선 윤곽이 남는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 완제품 `mergeSort` 가 재귀 전체를 말하므로, 이 조각은 **합침 한 걸음의 셈**
 * 만 맡는다 — 왜 맨 앞 둘만 보면 충분한가, 왜 되돌아가지 않는가, 그래서 왜 비용이
 * 두 줄의 길이 합인가. 재귀 · 층 · 빌린 넓이는 여기서 말하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mergeTwoSortedConcept: FacetConceptSource = {
  id: 'mergeTwoSorted',
  label: 'Merging Two Sorted Runs',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:mergeTwoSorted',

  surface: {
    definition:
      'Combining two ordered sequences into one by repeatedly taking the smaller of the two front elements, in a single pass that never moves a placed value again.',
    exemplarKeywords: [
      'merge two sorted arrays',
      'merge two sorted lists',
      'the merge step',
      'two pointers',
      'k-way merge',
      'merge phase of an external sort',
      'combining sorted files',
      'intersecting posting lists',
      'linear time merge',
      'the front of each list',
    ],
  },

  briefing: {
    observable: [
      'Two rows of three lie side by side on top and an empty result row waits below, already as wide as the finished sequence, so the reader can see how much is still to come.',
      'A ring marks the front of each row and slides one cell along when that row wins, which makes the next front a movement rather than a colour change.',
      'Cells are not copied: the winning cell leaves its row, drops straight down, then slides to its seat, and a dashed outline stays where it was.',
      'Cells behind the two fronts are drawn faint, so even a paused frame shows that only two cells are ever being weighed.',
      'Once one row is empty the remaining cells come down with nothing lit against them, and the caption says there is no longer anything to compare.',
      'A value that has landed in the result row never moves again — no seat is revisited and no pair down there is ever weighed.',
      'The closing caption gives the count: six values placed with five comparisons.',
    ],

    screen: {
      affordances: [
        'The whole combination plays through by itself and stops with the top rows empty and the result row full.',
        'Two buttons: Replay, and one that advances a single step, which is how one comparison can be held on screen and read.',
        'The rows are fixed at three values each and hold no repeats, so the article can name which value comes down at each step.',
      ],
    },

    useWhen: [
      'The article says two ordered lists are combined and the reader pictures pouring both together and ordering the pile again. One pass with nothing ever re-placed is the correction.',
      'The reader has to accept that reading two cells is enough to know the next value of the whole output. The argument rests on each row holding its own smallest at the front, and the faded tails are that premise made visible.',
      'The prose is about to claim a cost proportional to the total length. Each cell leaving its row exactly once, and never being touched afterwards, is what that proportionality means.',
    ],

    avoidWhen: [
      'The two inputs are not already in order. The whole economy comes from that premise, and without it the fronts say nothing about the rest.',
      'The subject is how the ordered runs came to exist — the recursion above this step, the number of levels, the total cost of a whole sort.',
      'The point is where the combined output is written, or the buffer it needs. The result row is simply there from the start and nothing accounts for it.',
      'The article means merging by key or resolving conflicts — joining two tables, reconciling two edited copies, a version control merge. Those decide what to keep; this only ever takes the smaller of two numbers.',
    ],

    contrastWith: [
      {
        concept: 'mergeSort',
        note: 'One step against the whole machine: repeating this step level by level, over runs that keep doubling, is what the sort is.',
      },
      {
        concept: 'splitUntilOne',
        note: 'The other direction of the same algorithm. Cutting costs no comparison and orders nothing; every comparison and every move belongs to this step.',
      },
      {
        concept: 'sortStability',
        note: 'Equal fronts are where stability is decided — taking the left one first keeps the original order of ties, and that single tie-break is the whole of the guarantee.',
      },
      {
        concept: 'inPlaceVsExtra',
        note: 'This step needs somewhere to write the combined output, which is exactly the room a sort built on it has to borrow.',
      },
    ],
  },
};
