/**
 * diagonalIsFree 개념 선언.
 *
 * canonical facet 은 `facet:diagonalIsFree` — A 일곱 줄 · B 일곱 줄의 격자에서 자리 (0, 0) 에서 (7, 7) 까지 맞춰 간다.
 * 값 0 에서 두 칸 공짜로 미끄러지고, 값 1 의 두 끝점은 하나가 셋 미끄러져 (5, 6) 까지, 다른 하나는 제자리 (3, 2) 다.
 * 값 2 에서 A6 을 지운 끝점이 한 칸 미끄러져 (7, 7) 에 닿고 멈춘다. 경로 값 2 · 공짜 6 칸. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `myersDiff`(완제품)는 손잡이로 고친 줄 수와 파일 길이를 돌려 **일의 양이 무엇을 따르는가**를 보인다.
 * 이쪽은 그 아래의 **값 매기기 한 장면**이다 — 지움 · 넣음 한 칸은 값 1, 같은 줄 짝은 값 0 이라 같은 값으로 간 끝점이
 * 멀리도 가깝게도 갈 수 있다. 그래서 definition 은 costs one · zero cost · diagonal · same cost different distance 를
 * 쥐고, 완제품이 쥔 work · file length · quadratic 과 이웃 조각이 쥔 count · list 를 쓰지 않는다.
 * 이 화면은 손질을 세거나 목록으로 적지 않는다.
 *
 * 전제: 줄은 글자 그대로 견준다(앞 빈칸도 글자). Myers 의 앞으로 가는 탐욕판 차례를 따른다. 파일 줄은 어느 언어도
 * 아닌 가상 표기다. 자리 (x, y) 는 지나온 줄 수라 0 부터, 화면의 줄 번호는 1 부터.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const diagonalIsFreeConcept: FacetConceptSource = {
  id: 'diagonalIsFree',
  label: 'Diff Grid: Edits Cost One, Matching Lines Are Free',
  canonicalFacet: 'facet:diagonalIsFree',

  surface: {
    definition:
      'In the grid that aligns two files, a deleted or inserted line costs one move while a pair of identical lines is crossed diagonally at zero cost, so paths of equal cost can end very different distances apart.',
    exemplarKeywords: [
      'edit graph diagonal',
      'snake in Myers diff',
      'matching lines are free',
      'cost of a diff path',
      'furthest reaching point per diagonal',
      'k diagonal x minus y',
      'shortest edit path',
      'why diff follows runs of equal lines',
    ],
  },

  briefing: {
    observable: [
      'A seven-line A lies along the top ("A → right: delete one line") and a seven-line B down the side ("B ↓ down: insert one line"). B is A with `show n` added as line 3 and `    show i` gone. A legend separates "paid step: cost 1" from "free slide: cost 0".',
      'The start is "Start at (0, 0): no line passed yet." Then "Cost 0: nothing paid — cells slid for free: 2" carries the point to (2, 2) along two matching lines.',
      'At cost 1 two endpoints leave (2, 2). One pays to insert B3 and slides three free cells to (5, 6); the other pays to delete A3 and slides none, stopping at (3, 2). Same cost, very different reach.',
      'At cost 2 the far endpoint branches again: inserting B7 stops at (5, 7), while deleting A6 slides one free cell to (7, 7). The run ends with "Reached (7, 7). Path cost: 2 · free cells: 6."',
      'Each endpoint is tagged with its cost and position ("Cost 1 · (5, 6)") and a +1 mark shows where a cost was paid. Six steps in all counting the start.',
      'Lines are compared as exact text, leading spaces included. The order of endpoints follows the forward greedy Myers search, and the file lines are written in a small language-neutral notation rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one endpoint per step, and stops once (7, 7) is reached.',
        'A Replay button and a playback strip sit below. Holding the strip on the two cost-1 steps shows both endpoints side by side: one at (5, 6) after three free cells, one still at (3, 2).',
        'The two files and every position are fixed, so an article can quote each coordinate and caption as shown.',
      ],
    },

    useWhen: [
      'The article introduces the edit graph behind diff and needs a small case where the reader sees that only deletions and insertions are paid for, while runs of identical lines are crossed for nothing.',
      'A reader wonders why two paths with the same edit cost can be so far apart, and the article wants one endpoint racing down three matching lines while its twin goes nowhere.',
    ],

    avoidWhen: [
      'The article compares diff effort against file length or a full LCS table. There is one pair of short files and no handle.',
      'The subject is writing out the resulting patch or counting its edits. Here only the path through the grid and its cost are shown.',
      'The subject is edit distance with substitutions. There is no diagonal that costs one; a diagonal exists only where lines are identical.',
    ],

    contrastWith: [
      {
        concept: 'myersDiff',
        note: 'The pricing of moves is the premise; the algorithm-level claim is what follows from it at scale, that total effort grows with the number of edits rather than with file length.',
      },
      {
        concept: 'keepTheCommon',
        note: 'Both rest on identical lines not being edits. Here the claim is about moves and their price along a path; there it is about the tally, that each kept line removes two edits.',
      },
      {
        concept: 'threeEditChoices',
        note: 'An edit-distance cell chooses among delete, insert and a substitution that can cost one; in a line diff the diagonal is either free or unavailable, never a paid substitution.',
      },
    ],
  },
};
