/**
 * keepTheCommon 개념 선언.
 *
 * canonical facet 은 `facet:keepTheCommon` — A 다섯 줄 · B 여섯 줄. 처음 고칠 것은 11(A 를 다 지우고 B 를 다 넣음).
 * 글자가 같은 줄이 위에서부터 짝으로 이어질 때마다 고칠 것이 둘씩 깎인다 — 11 → 9 → 7 → 5. 짝 없는 A 줄 둘이 지움으로,
 * B 줄 셋이 넣음으로 떨어져 끝은 "2 + 3 = 5". 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `editScript` 는 차이를 **목록**으로 적고, `diagonalIsFree` 는 맞춰 가는 **자리의 운동과 값**을,
 * `moveLooksLikeRewrite` 는 글자가 같아도 **차례가 엇갈려** 짝이 못 되는 줄을 말한다. 이쪽은 **수** 하나다 — 남긴 줄이
 * 하나 늘 때마다 고칠 수가 둘 준다. 그래서 definition 은 number of edits · lines kept in common · minus twice ·
 * longest common subsequence 를 쥐고, list · order · cost · move 를 쓰지 않는다. 짝이 못 되는 이유는 **글자가 달라서**다.
 *
 * 전제: 줄은 글자 그대로 견준다 — 들여쓰기 빈칸도 글자이고 비슷한 줄은 짝이 아니다. 바꿈은 없어서 달라진 줄은 지움 하나와
 * 넣음 하나다(편집 거리였다면 바꿈 1 로 셌을 자리). 파일 줄은 어느 언어도 아닌 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keepTheCommonConcept: FacetConceptSource = {
  id: 'keepTheCommon',
  label: 'Lines Kept in Common Set the Number of Edits',
  canonicalFacet: 'facet:keepTheCommon',

  surface: {
    definition:
      'The number of line edits between two files is their total lines minus twice the lines kept in common, so each kept line saves a deletion and an insertion and the longest common subsequence gives the fewest.',
    exemplarKeywords: [
      'longest common subsequence',
      'LCS and diff',
      'how many lines changed',
      'minimum number of edits',
      'diff size',
      'lines added and removed count',
      'similar line is not a match',
      'git diff --stat insertions deletions',
    ],
  },

  briefing: {
    observable: [
      'File A ("before") has five lines and file B ("after") six. At the start every A line is marked `-` and every B line `+`, an "Edits" counter reads 11, and the caption says "Nothing kept yet: every line of A is deleted, every line of B inserted."',
      'Three pairs of identical lines join from the top, one per step: A1 = B1 `function area(w, h)`, A4 = B3 `let x = area(2, 3)`, A5 = B5 `show x`. Each pair drops its two marks and the caption counts the cut — "Same text, kept: A4 = B3. Edits: 9 → 7" — so Edits goes 11, 9, 7, 5.',
      '`    let s = w * h` and `    return s` in A and `    return w * h` in B look alike but are never paired, because their text differs.',
      'The unpaired lines then fall out into two trays: "Unpaired lines of A fall out as deletions: 2" (A2, A3) and "Unpaired lines of B fall out as insertions: 3. Edits: 2 + 3 = 5" (B2, B4, B6). Six steps in all counting the start.',
      'Lines are compared as exact text, leading spaces included, and there is no substitution: a changed line is one deletion plus one insertion. The file lines are written in a small language-neutral notation rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one pair or one tray per step, and stops at "Edits: 2 + 3 = 5".',
        'A Replay button and a playback strip sit below. Stepping the strip across the three pairing steps shows the Edits counter dropping by exactly two each time.',
        'The files are fixed, so every line, pair and count can be quoted as shown.',
      ],
    },

    useWhen: [
      'The article claims that finding a small diff means finding as many shared lines as possible, and needs the arithmetic in view: every kept line takes two edits off the total.',
      'A reader expects near-identical lines to count as one change, and the article wants to show that without substitution they are a deletion and an insertion, adding two to the count.',
    ],

    avoidWhen: [
      'The article is about the output format of a patch, with `-`, `+` and context lines in order. Only the count and the pairing are shown here.',
      'The subject is the dynamic-programming table for LCS or edit distance. No table is drawn; pairs are joined directly.',
      'The article is about lines that moved. All three kept lines here are in the same order in both files.',
    ],

    contrastWith: [
      {
        concept: 'editScript',
        note: 'Keeping lines decides how many edits there are; writing them out as an ordered list is a separate question about sequence and about recovering both files from one record.',
      },
      {
        concept: 'moveLooksLikeRewrite',
        note: 'Here an unpaired line differs in text. There a line has an exact twin on the other side yet stays unpaired, because pairing it would cross the pairs already kept.',
      },
      {
        concept: 'diagonalIsFree',
        note: 'Both hold that identical lines are not edits. This is the tally over the whole file; that one is about the price of each move while searching for the alignment.',
      },
      {
        concept: 'editDistance',
        note: 'Edit distance counts a substitution as one operation; a line diff has none, so a changed line costs a deletion and an insertion, and the total follows from the kept lines alone.',
      },
    ],
  },
};
