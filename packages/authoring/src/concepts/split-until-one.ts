/**
 * splitUntilOne 개념 선언.
 *
 * canonical facet 은 `facet:splitUntilOne` — 값 넷을 맨 위에 한 번만 적고 그 아래로
 * 세로 레일을 내린 뒤, 묶음 상자만 층층이 갈라지는 조각이다. 스스로 재생하고
 * 멈추며 다시 보기와 한 걸음이 딸린다.
 *
 * ── 묶음 안에서 어디에 무게를 두었나
 *
 * 완제품 `mergeSort` 는 내려갔다 올라오는 절차 전체를 말한다. 이 조각은 그중
 * **내려가는 절반만** 붙잡아, 그 동안 무엇이 바뀌지 않는가를 말한다 — 값도 좌우
 * 순서도 그대로이고 견줌은 0 이며, 바뀌는 것은 묶음의 경계뿐이다. 그리고 낱개에서
 * 멈추는 것이 "더 못 가서" 가 아니라 "답을 이미 알아서" 라는 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const splitUntilOneConcept: FacetConceptSource = {
  id: 'splitUntilOne',
  label: 'Splitting Down to Single Items',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:splitUntilOne',

  surface: {
    definition:
      'The descending half of divide and conquer: a range is cut in two by position until every group holds one item, comparing nothing and moving nothing.',
    exemplarKeywords: [
      'divide and conquer',
      'base case of a recursion',
      'why recursion stops at one element',
      'halving a range',
      'recursion depth',
      'log n levels',
      'midpoint index',
      'a single element is already sorted',
      'splitting a problem into subproblems',
    ],
  },

  briefing: {
    observable: [
      'The four values are written once along the top and never written again; a vertical rail drops from each of them through the whole picture, so a value could not move without its rail moving.',
      'What moves is the group frame — a box slides one level down and tears open in the middle into two, its outer edges staying exactly where the parent had them.',
      'Items inside a group are drawn as dots on the rails: a box with two dots has somewhere to cut and a box with one dot has nowhere, which is the stopping rule as a shape rather than a sentence.',
      'Levels stack downward, one per round of cutting, and four values reach single items in three levels.',
      'The captions say what each cut did not do — nothing compared, no value moved, only a boundary added.',
      'Read left to right, the last level spells the same four numbers in the same order as the first.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole descent on its own and stops with every box holding one dot.',
        'Two buttons: Replay, and one that takes the cuts a level at a time so a single tear can be held still.',
        'The four values are fixed, so the levels come out even — one group, then two, then four — and no group ever ends up a cell larger than its sibling.',
      ],
    },

    useWhen: [
      'The article introduces divide and conquer and the reader hears the dividing as a step that already does some of the work. Boundaries multiplying while the numbers stay put settles that before any combining is described.',
      'The reader treats a base case as the point where the recursion gives up. A box with one dot has no place left to cut because the answer for it is already known, and the picture makes those the same fact.',
      'The prose is about to count levels — the depth of a recursion, the logarithm in a cost — and the reader needs the levels as something visible before the arithmetic arrives.',
    ],

    avoidWhen: [
      'The article is about what happens on the way back up. Nothing here is combined; the picture ends at the moment the recursion turns around.',
      'The split is decided by a value rather than a position — a pivot, a search tree, a median. Cutting here looks only at indices and never at what the items hold.',
      'The subject is splitting text, files, tables or traffic. The word covers all of those and none of them is what is drawn.',
      'The point is the memory a recursion consumes, or the order in which the calls are made. Levels appear here all at once rather than as a sequence of calls.',
    ],

    contrastWith: [
      {
        concept: 'mergeSort',
        note: 'This is the first half of that run held still. There the same descent is followed by the ascent where every value finally moves.',
      },
      {
        concept: 'mergeTwoSorted',
        note: 'The two directions of one algorithm: cutting costs no comparison and settles nothing, combining is where every comparison and every move happens.',
      },
      {
        concept: 'halveTheRange',
        note: 'Both halve a range repeatedly, but a search keeps one half and throws the other away, while this keeps both and has to come back for the second.',
      },
      {
        concept: 'partitionAroundPivot',
        note: 'The other way to split. One cuts at the midpoint and moves nothing; the other moves values across a chosen boundary and its halves come out uneven.',
      },
    ],
  },
};
