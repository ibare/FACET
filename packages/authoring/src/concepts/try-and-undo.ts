/**
 * tryAndUndo 개념 선언.
 *
 * canonical facet 은 `facet:tryAndUndo` — 조각(piece)이다. 4×4 판을 가로로 넓은
 * 띠 넷으로 그리고, 말이 위에서 떨어져 내려앉았다가 막히면 도로 올라가 사라진다.
 * 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `backtracking` 이 절차 전체(열여섯 놓음 · 열여섯 물림 · 해 둘)와 코드의
 * 세 줄 짝을 맡으므로, 이 조각은 **물리는 한 걸음** 에만 무게를 싣는다 — 말을
 * 걷어낼 때 그 말이 막고 있던 × 와 아래 행의 자국까지 함께 풀려 판이 정확히
 * 이전 상태로 돌아간다는 것. definition 은 "복원" 을 주어로 삼고, keywords 는
 * 되돌림 · 상태 복원 어휘만 갖는다 (완제품은 열거 · 전수 탐색 어휘).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tryAndUndoConcept: FacetConceptSource = {
  id: 'tryAndUndo',
  label: 'Taking a Move Back (the Undo Half of a Trial)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:tryAndUndo',

  surface: {
    definition:
      'The retraction that completes a trial move: removing the last placement also clears every restriction and trace it created, leaving the state identical to before the attempt.',
    exemplarKeywords: [
      'undo the move',
      'take the move back',
      'make and unmake',
      'restore the state after the recursive call',
      'reset the flag you set',
      'mutating shared state inside recursion',
      'dead end',
      'hit a wall and step back',
      'the board must return to exactly what it was',
      'leftover state from a failed attempt',
      'trial and error',
    ],
  },

  briefing: {
    observable: [
      'The board is drawn as four wide horizontal rows rather than a square, so the top-down order of the procedure reads along the vertical axis; a piece drops into its row from above, and a take-back sends it back up through the ceiling of its own cell.',
      'Every cell a standing piece rules out carries an ×, and the marks are recomputed from scratch on each step, so a take-back never leaves half of them behind.',
      'A cell that was tried and then given up keeps a dotted circle the size of a piece, which is how the search can be seen avoiding a square it already visited rather than being blocked by another piece.',
      'When a row has no square left, the caption says so before anything is removed, and the piece that comes off is the one in the row above — the retreat is one row, not a jump.',
      'The board goes completely empty at one point, with a caption saying the very first move has been taken back, and the search then restarts from a different column on the top row.',
      'The final caption names the two totals the search itself counted — how many placements and how many take-backs it took to get four pieces standing.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole search on its own and stops with the four pieces standing.',
        'Two buttons: Replay, and a step control that rewinds to the empty board and then walks the same search one move at a time, which is the way to stop on the moment a piece is lifted.',
        'The board size and the search order are fixed, so an article can name which first column fails and how far the search descends before it comes all the way back.',
      ],
    },

    useWhen: [
      'The article says a wrong guess is simply thrown away, and the reader pictures the leftovers being harmless. Watching the × marks and the dotted traces come off together with the piece is what makes "exactly as it was" a visible property instead of a promise.',
      'A reader has written recursion that mutates a shared board and cannot see why the answers go wrong later. The screen puts the pairing on the surface: whatever the descent added, the return removes before the next column is tried.',
      'The prose needs the moment where a first move turns out to be hopeless, and the point is that this could not be known in advance — the board emptying after several descents is that moment.',
    ],

    avoidWhen: [
      'The article is about an undo stack in an application — command objects, redo, editing history. Nothing here stores a list of past actions for a person to replay.',
      'The subject is transaction rollback or restoring a database to a checkpoint. The retraction here is one step of a search, not a durability guarantee.',
      'The point is how much of the search space is eliminated, or how a bound removes work in advance. This screen shows one retreat at a time and never skips a branch it has not entered.',
      'The article is about persistent or immutable data structures, where nothing is ever mutated and so nothing has to be put back.',
    ],

    contrastWith: [
      {
        concept: 'backtracking',
        note: 'That is the whole search seen at once, counted and carried past every answer; this is one retraction, shown slowly enough to see the board come back to what it was.',
      },
      {
        concept: 'pruneBranch',
        note: 'Both are answers to a dead end, but retracting happens after a branch has been walked and pruning refuses to walk it at all.',
      },
      {
        concept: 'diveThenBacktrack',
        note: 'Both descend and come back, but returning from a graph vertex only moves the walker, while returning from a trial must also erase what the trial wrote.',
      },
    ],
  },
};
