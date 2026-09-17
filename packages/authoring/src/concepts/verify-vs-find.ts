/**
 * verifyVsFind 개념 선언.
 *
 * canonical facet 은 `facet:verifyVsFind` — 수 `3 · 7 · 12 · 19 · 24 · 31` 에서 합이
 * 50 인 부분집합을 놓고, 확인 줄에 칸 하나와 찾기 줄에 칸 예순넷을 같은 크기로
 * 그리는 화면이다. 두 줄이 세는 단위가 같다 — 들여다본 후보의 수. 답이 셋이고 첫
 * 답을 만나고도 끝까지 훑는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 성장을 말하는 셋과 달리 이것은 **두 일의 값이 왜 다른가**를 말한다. 자라는 것을
 * 보이지 않고 한 크기(여섯 → 64)에서 벌어진 간격을 곧이곧대로 그린다. 사다리
 * (1,048,576) 는 글이 말하고 화면에 뜨지 않으므로 observable 에 적지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const verifyVsFindConcept: FacetConceptSource = {
  id: 'verifyVsFind',
  label: 'Checking a Given Answer Against Finding One',
  canonicalFacet: 'facet:verifyVsFind',

  surface: {
    definition:
      'The gap between confirming a candidate handed to you and producing one yourself: checking a single subset is one look, while settling whether any subset reaches the target means examining all 2^n of them.',
    exemplarKeywords: [
      'P versus NP',
      'easy to check hard to find',
      'verifying a certificate',
      'subset sum',
      'brute force over every subset',
      'exponential search space',
      'checking a solution is cheap',
      'nondeterministic polynomial time',
      'why searching costs more than confirming',
      'exhaustive enumeration',
    ],
  },

  briefing: {
    observable: [
      'Six numbers and a target of 50 stand along the top, and the two rows beneath them count in the same unit — candidates looked at — with tiles of the same size, so the two areas are directly comparable.',
      'The checking row holds a single tile: copies of 7, 19 and 24 drop out of the row above, merge leftward into a running sum and come to rest directly under the target, where a tick mark is drawn.',
      'The finding row lays out all 64 tiles before anything is examined, each carrying a pattern of up to six dots that says which of the numbers that candidate takes.',
      'A frame slides across the field eight tiles at a time and the tiles it has passed flip colour behind it, while the number beside the frame counts 8, 16, 24 and on to 64.',
      'Three tiles come up as answers and fly to a shelf where they open out and read 7 + 19 + 24 = 50, 7 + 12 + 31 = 50 and 19 + 31 = 50, and the sweep carries on past the first of them to the last tile on the board.',
      'At the end the frame expands to enclose the whole field and reads 64, standing beside the single-tile frame of the checking row, which reads 1.',
    ],

    screen: {
      affordances: [
        'The screen runs both rows to the end on its own and stops with the two frames standing side by side, one around 64 tiles and one around a single tile.',
        'Two buttons: Replay, and a step control that advances one block of eight candidates at a time, which is how a reader can stop just after an answer has been found and watch the sweep continue anyway.',
        'The six numbers and the target are fixed, so an article can name the candidate that gets handed over and the three combinations that reach 50.',
      ],
    },

    useWhen: [
      'The article claims that some problems are easy to check and hard to solve, and the reader has no reason yet to treat those as two different activities. One row finishing in a single look while the other has to reach the last of 64 tiles makes the difference countable.',
      'The reader assumes that meeting an answer ends the work. The run finds one partway through and keeps sweeping, because whether there are others, or none, is only settled at the final candidate.',
      'The prose needs the cheapness of checking to read as conditional rather than lucky: that row is cheap only because a candidate was handed to it, and that assumption is the whole of the difference.',
    ],

    avoidWhen: [
      'The subject is a smarter search — ordering the candidates, pruning, abandoning a branch early. Every candidate here is looked at in the same flat way.',
      'The article is about solving subset sum efficiently with a table over reachable sums. No table is built; the candidates are enumerated as they stand.',
      'The point is the formal statement of the open question about these two costs, or its current status. What is shown is the gap between them at one small size.',
      'The article uses "verify" for checking a signature, a hash, a password or an identity.',
    ],

    contrastWith: [
      {
        concept: 'pNp',
        note: 'One is the gap between the two jobs at a single instance; the wider concept is what that gap does as the instance grows — checking gaining one step per element while the candidates double.',
      },
      {
        concept: 'backtracking',
        note: 'Both face a space of candidates, but one is about cutting whole regions of that space away before they are entered, and this one is about the size of the space when nothing can be cut.',
      },
      {
        concept: 'greedyCanFail',
        note: 'One shows a cheap rule arriving at a worse answer than the best one; the other shows a problem for which no cheap rule is known at all, so the only certain method is to look at everything.',
      },
      {
        concept: 'overlappingSubproblems',
        note: 'Reuse pays off when the same smaller problem keeps reappearing; here every candidate is a distinct combination, so what was computed for one says nothing about the next.',
      },
      {
        concept: 'reduceToKnown',
        note: 'One measures how much a problem costs to solve outright; the other carries a problem over to where methods already exist, which borrows the methods without making that cost smaller.',
      },
    ],
  },
};
