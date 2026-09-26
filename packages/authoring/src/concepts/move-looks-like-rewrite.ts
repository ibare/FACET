/**
 * moveLooksLikeRewrite 개념 선언.
 *
 * canonical facet 은 `facet:moveLooksLikeRewrite` — A 다섯 줄의 4 · 5 줄 덩이를 맨 위로 옮긴 B. 같은 두 파일을
 * 두 눈으로 본다. 사람의 눈은 옮김 1. 줄의 눈은 제자리 세 줄을 짝 지은 뒤, 옮긴 두 줄은 글자가 같은 짝이 건너편에
 * 있어도 이으면 남긴 짝과 엇갈려(엇갈림 6) 끊기고, 지움 2 · 넣음 2 로 떨어진다. 끝 "Edits by the human eye: 1 ·
 * Edits by the line eye: 4". 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `keepTheCommon` 은 짝 없는 줄이 **글자가 달라서** 생기고, 이쪽은 글자가 같은데 **차례가 엇갈려서** 생긴다.
 * `threeWayMerge`(완제품)는 이 사실이 병합에서 충돌을 부르는 결과를 손잡이로 보이지만 이쪽은 두 파일뿐이고 충돌을 그리지
 * 않는다. 그래서 definition 은 no move operation · moved block · crossing · deletions at the old place and insertions at
 * the new 를 쥐고, number minus twice · conflict · chunk 를 쓰지 않는다.
 *
 * 전제: 줄 단위로 글자 그대로 견준다. 남김 짝은 서로 엇갈리지 않는다(LCS). `git diff --color-moved` 같은 표시 기능은
 * 옮긴 줄에 색만 입힐 뿐 diff 자체는 여전히 지움과 넣음이다. 파일 줄은 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const moveLooksLikeRewriteConcept: FacetConceptSource = {
  id: 'moveLooksLikeRewrite',
  label: 'Line Diff Sees a Move as Delete Plus Insert',
  canonicalFacet: 'facet:moveLooksLikeRewrite',

  surface: {
    definition:
      'A line diff has no move operation: a block moved elsewhere cannot be matched without crossing the lines kept in place, so identical text is reported as deletions at its old position and insertions at its new one.',
    exemplarKeywords: [
      'moved lines in a diff',
      'diff does not detect moves',
      'code move shows as delete and add',
      'git diff --color-moved',
      'reordered functions diff',
      'refactor produces a huge diff',
      'block move detection',
      'non-crossing matches',
    ],
  },

  briefing: {
    observable: [
      'Two five-line files, "Before the move" and "After the move", with two panels below: "Human eye" and "Line eye". The prompt asks "How many edits apart are the two files?"',
      'B is A with its last two lines, `function load()` and `    return read()`, moved to the top; not a character changed. The human eye counts it first: "the block A 4–5 travels in one piece to B 1. Moves: 1".',
      'The line eye links equal lines "as many as possible, with no two links crossing": A1 = B3, A2 = B4, A3 = B5, "Kept: 3".',
      'The moved lines have word-for-word twins on the other side, but linking them would cross the three kept links, so the lines snap apart: "Crossings: 6".',
      'The snapped lines fall out as "Deletes: 2" on the A side (marked `-`) and "Inserts: 2" on the B side (marked `+`), the same text in both trays. The run ends "Edits by the human eye: 1 · Edits by the line eye: 4", seven steps counting the start.',
      'Lines are compared as exact text. Tools that colour moved lines, such as `git diff --color-moved`, only highlight them; the diff underneath is still deletions and insertions. File lines are in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops on the two counts side by side, 1 against 4.',
        'A Replay button and a playback strip sit below. Dragging the strip to the crossing step holds the moment the two moved lines snap while their twins sit across from them.',
        'The files are fixed, so every link, count and caption can be quoted as shown.',
      ],
    },

    useWhen: [
      'The article explains why moving or reordering code makes a diff look like a large rewrite, and needs the moved lines to have exact twins that the diff still refuses to pair.',
      'A reader assumes diff tools track moved lines; setting one move against two deletions and two insertions for the same pair of files corrects that.',
    ],

    avoidWhen: [
      'The article is about lines that were changed, not moved. Every line here keeps its exact text.',
      'The subject is merge conflicts caused by moved code. Only two files appear and no merge is performed.',
      'The subject is move detection in version control, such as git\'s rename or copy detection for whole files. Moves here are within one file.',
    ],

    contrastWith: [
      {
        concept: 'keepTheCommon',
        note: 'There, unpaired lines differ in text. Here the unpaired lines are identical to lines on the other side; they stay unpaired because pairs must keep their order.',
      },
      {
        concept: 'editScript',
        note: 'An edit list has only keep, delete and insert rows, so a move has no row of its own and must be written as a deletion plus an insertion.',
      },
      {
        concept: 'threeWayMerge',
        note: 'That a move reads as a deletion and an insertion is a fact about comparing two files. In a merge it means the move touches two places, and edits near either one can collide with it.',
      },
    ],
  },
};
