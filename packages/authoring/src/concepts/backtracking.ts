/**
 * backtracking 개념 선언.
 *
 * canonical facet 은 `facet:backtracking` — 4×4 판에 퀸 넷을 놓되 **모든** 배치를
 * 찾는 완결형이다. 판 · 찾은 해 두 줄 · 탐색 자취 띠가 한 캔버스에 있고, 누적
 * 계기 셋(놓음 · 물림 · 해)과 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **절차 전체와 그 결과** 를 맡는다 — 층마다 한 선택을 박고, 내려가고,
 * 돌아와 물리는 세 줄이 짝을 이루며, 해를 찾고도 멈추지 않아 결국 판이 비는 것.
 * 조각 `tryAndUndo` 는 그중 물리는 한 걸음이 왜 절차의 절반인지만 말하고,
 * 조각 `pruneBranch` 는 아래를 안 보고 접는 것이 왜 답을 잃지 않는지만 말한다.
 * keywords 도 이쪽은 열거 · 전수 탐색 어휘를, 조각들은 되돌림 · 접기 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const backtrackingConcept: FacetConceptSource = {
  id: 'backtracking',
  label: 'Backtracking (Enumerating Every Arrangement)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:backtracking',

  surface: {
    definition:
      'A recursive search that fixes one choice per level, descends, then retracts it on return, continuing past each success until every complete arrangement has been enumerated.',
    exemplarKeywords: [
      'backtracking',
      'n-queens',
      'eight queens puzzle',
      'count all solutions',
      'exhaustive search',
      'enumerate every arrangement',
      'constraint satisfaction',
      'sudoku solver',
      'generating permutations',
      'choose, recurse, unchoose',
      'recursive solve function',
      'search tree of decisions',
    ],
  },

  briefing: {
    observable: [
      'One candidate cell at a time lights up on a 4×4 board, and when it is refused a line is drawn from the queen already standing to that cell, with the caption naming whether the clash is the column or a diagonal and which row the offending queen sits in.',
      'Solutions do not replace one another — the two that exist are kept side by side as small boards, so both can be read at once after the run ends.',
      'A trail band along the bottom stacks one bar per step in time order, its height being the number of queens on the board just then; the band keeps going after a solution is marked, which is what makes "it does not stop at the first answer" visible.',
      'The three counters end at sixteen placements, sixteen take-backs and two solutions — placed and taken back come out equal, and the board is empty when the run finishes.',
      'The code panel highlights the line matching the current step, and the recursive call is given a step of its own, so that line is actually stepped on rather than skipped over.',
      'The closing caption reports the totals as counts rather than as a verdict: how many solutions, how many placements, how many take-backs.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider. Stepping once advances one phase, which is how a reader can sit on the moment a candidate is refused.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'The board and the two starting rows of the solution panel are fixed, so an article can name the two answers and the column each row ends up holding.',
      ],
    },

    useWhen: [
      'The article claims that a solver which finds every answer differs from one that stops at the first by a single line, and the reader cannot see where that line would go. Watching the search resume after a solution is recorded, and end with an empty board, is what puts the difference somewhere.',
      'The prose treats undoing as error handling. Sixteen placements answered by sixteen take-backs, with the counters ending equal, shows retraction running exactly as often as commitment.',
      'A reader needs to see why a search over choices is written as a recursive function rather than a loop, and the code panel steps on the recursive call itself while the board descends a row.',
    ],

    avoidWhen: [
      'The article uses "backtracking" for a regular-expression engine blowing up on a pathological pattern, or for a parser retrying alternatives over text. Nothing here measures a scan over a string.',
      'The subject is skipping a subtree in advance from a bound or a feasibility estimate. Candidates here are refused one at a time against the queens already placed, and no branch is written off before it is entered.',
      'The point is that a search should stop at the first answer, or return as soon as one is found. This one deliberately keeps going and empties the board at the end.',
      'The word means rewinding a user action, an editor undo stack, or navigating back through a browser history.',
    ],

    contrastWith: [
      {
        concept: 'tryAndUndo',
        note: 'That is the single retraction shown as its own event; this is the whole search built out of them, counted and carried on past every answer.',
      },
      {
        concept: 'pruneBranch',
        note: 'Both explore a tree of choices, but pruning refuses a whole subtree on a proof, while this refuses one cell at a time and still visits every branch that stays legal.',
      },
      {
        concept: 'greedy',
        note: 'A greedy method commits to each choice and never revisits it; this one commits provisionally and takes the commitment back, which is what buys completeness.',
      },
      {
        concept: 'dfs',
        note: 'Both descend and return, but depth-first search walks a graph that already exists while this one builds and unbuilds the arrangement it is walking.',
      },
    ],
  },
};
