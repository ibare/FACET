/**
 * divideConquerCombine 개념 선언.
 *
 * canonical facet 은 `facet:divideConquerCombine` — 값 넷짜리 문제 하나가 재귀
 * 나무를 이루며 내려갔다 올라오는 조각이다. 자리(프레임)는 한 번 생기면 사라지지
 * 않고, 내려갈 때는 **문제**(테두리만 있는 빈 칸)를, 올라올 때는 **답**(채워진 칸)을
 * 들고 있다. 갈래마다 `↓n` · `↑n` 표식이 남아, 뿌리에 `↓1 ↑3` 이 함께 남는 것이
 * 이 조각의 주장 전부다.
 *
 * ── 묶음 안에서 무엇을 맡는가
 *
 * 이 묶음은 이 조각 하나뿐이라, 갈라야 할 상대는 이웃 개념들이다. `mergeSort`
 * (완제품) 는 정렬이라는 결과와 그 비용을 말하고 `mergeTwoSorted` 는 합침 한 번의
 * 안쪽을 연다. 이 조각은 정렬을 말하지 않는다 — 값이 어떻게 견줘지는지를 아예
 * 열지 않고, **방향과 순서** 만 말한다. 그래서 definition 에 정렬도 견줌도 넣지
 * 않고, 내려갈 때 답이 없다는 것과 순서가 뒤집힌다는 것에만 무게를 둔다.
 *
 * 화면이 줄인 것 하나는 개념에 적어 두어야 오해가 없다 — 실제 재귀는 깊이
 * 우선이지만 이 화면은 층 단위로 묶어 내려보내고 올려 보낸다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const divideConquerCombineConcept: FacetConceptSource = {
  id: 'divideConquerCombine',
  label: 'Divide and Conquer (Down, Then Back Up)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:divideConquerCombine',

  surface: {
    definition:
      'A recursive shape in which cutting descends and produces no answer at all, while answers form only on the way back up, in the reverse order of the cuts.',
    exemplarKeywords: [
      'divide and conquer',
      'recursion tree',
      'base case',
      'the call stack unwinding',
      'why the first split finishes last',
      'top-down then bottom-up',
      'the combine step',
      'T(n) = 2T(n/2) + n',
      'what a recursive call returns',
      'post-order',
      'merge sort and quicksort have the same shape',
    ],
  },

  briefing: {
    observable: [
      'A frame appears once and never disappears; the same place is passed twice, holding an outlined problem on the way down and a filled answer on the way up.',
      'On the descent every frame is empty — not a single answer exists anywhere on screen until the bottom is reached.',
      'The bottom row settles all at once, and the caption names why: a single value is already an answer, and this is where the direction reverses.',
      'Coming up, values from two child frames cross past each other into the parent frame, so the ordering visibly happens during the ascent and not before it.',
      'A parent frame holds exactly as many slots as its two children together, so nothing changes size — only what the place is holding changes.',
      'Each branching place keeps two marks, a down-arrow with the order it was cut and an up-arrow with the order it was combined, and both stay after the animation ends.',
      'The root ends up carrying the first cut number and the last combine number together, which is the whole point left standing as a still image.',
      'The closing caption states the two totals — cuts going down and combines coming up.',
      'Layers move as a whole: an entire level is cut before the next one is, and an entire level is combined before the level above it.',
    ],

    screen: {
      affordances: [
        'The round trip plays once by itself and stops with the order marks left on screen.',
        'Two buttons: Replay, and a step control that rewinds and then advances one cut or one combine at a time, which is the way to stop at the bottom and see that nothing has an answer yet.',
        'The four values never change, so the tree is the same shape every time and the article can refer to the numbered cuts and combines directly.',
      ],
    },

    useWhen: [
      'The reader has been taught splitting and combining as two separate lessons and cannot see why they are one procedure; the frames being visited twice, once per direction, is the join.',
      'A recursive function is about to be traced and the reader expects the answer to accumulate as the calls go in, rather than appearing as they return.',
      'An argument depends on the outermost work happening last — the final merge, the root of the recursion tree — and that ordering keeps being read backwards.',
    ],

    avoidWhen: [
      'The subject is how two ordered runs are actually merged, or how a comparison sort decides anything. The combine step is deliberately left closed here.',
      'The article is about sorting itself — its cost, its stability, or the choice between sorting methods. The values are only there to give the frames something to carry.',
      'The subject is a recursion that returns nothing to combine, such as walking a tree for its side effects, or one that recurses on a single subproblem, such as binary search.',
      'The article uses "divide and conquer" in its political or managerial sense.',
    ],

    contrastWith: [
      {
        concept: 'splitUntilOne',
        note: 'That one dwells on the descent alone and where it has to stop; this one exists to show that the descent is only half of the trip.',
      },
      {
        concept: 'mergeTwoSorted',
        note: 'This leaves the combine step closed and shows only which place it happens in and when; that one opens a single combine and shows the comparisons inside it.',
      },
      {
        concept: 'mergeSort',
        note: 'The same shape carrying an actual task, with the cost of the whole thing at stake rather than only the order in which its places are visited.',
      },
      {
        concept: 'bottomUpTable',
        note: 'Both end up computing small answers before large ones, but this reaches the small ones by descending from the problem, while a filled table starts at the bottom and never goes down at all.',
      },
    ],
  },
};
