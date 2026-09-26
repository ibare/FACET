/**
 * editScript 개념 선언.
 *
 * canonical facet 은 `facet:editScript` — A 네 줄 · B 네 줄을 읽는 자리가 위에서 내려가며 목록이 한 줄씩 자란다
 * (`-` let port = 80 · 남김 let host · `+` let port = 443 · 남김 connect · `-` show "ok" · `+` show "done").
 * 다 적은 뒤 남김 · 지움 줄만 읽어 A 가, 남김 · 넣음 줄만 읽어 B 가 다시 걸러져 나온다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `keepTheCommon` 은 고칠 **수**를 깎고, `diagonalIsFree` 는 맞춰 가는 **값**을 치른다. 이쪽은 **목록** —
 * 차이를 한 줄씩 차례로 적은 기록 하나에 두 파일이 다 들어 있다는 것. 그래서 definition 은 ordered list · keep · delete ·
 * insert · rebuild both files · unified diff 를 쥐고, number · minus twice · cost · free 를 쓰지 않는다.
 * 이웃 개념 `editDistance` 도 "edit script" 를 검색어로 가진다 — 그쪽은 문자열의 표를 되짚어 고침을 얻는 일이고,
 * 이쪽은 줄 단위 목록 자체와 그 목록에서 두 파일이 되돌아오는 일이다.
 *
 * 전제: 줄은 글자 그대로 견준다. 목록 차례는 LCS 로 걷는 diff 의 규칙(같으면 남김, 다르면 지움을 넣음보다 먼저)을 따른다.
 * 목록 줄 앞의 `-` · `+` · 빈칸은 unified diff 모양이고 hunk 머리(`@@`)는 두지 않았다. 파일 줄은 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const editScriptConcept: FacetConceptSource = {
  id: 'editScript',
  label: 'Diff as an Ordered List of Kept, Deleted and Inserted Lines',
  canonicalFacet: 'facet:editScript',

  surface: {
    definition:
      'A line diff written as one ordered list of kept, deleted and inserted lines holds both files at once: reading the kept and deleted lines rebuilds the old file, the kept and inserted lines the new one.',
    exemplarKeywords: [
      'edit script',
      'unified diff format',
      'reading a diff',
      'minus and plus lines in a diff',
      'context lines',
      'diff -u',
      'patch file contents',
      'what git diff output means',
      'reconstruct a file from a patch',
    ],
  },

  briefing: {
    observable: [
      'File A ("before") and file B ("after") each have four lines and a "Read: 0/4" counter. An empty "Edit script" column waits beside them; the caption says "Two files, read from the top."',
      'Each step writes one row and moves the reading positions: "Only A steps down — written as a deletion: A1." gives `- let port = 80`; "Same line on both sides — both step down: A2 · B1." gives a keep row `let host = "a"`; "Only B steps down — written as an insertion: B2." gives `+ let port = 443`.',
      'The list grows to six rows — delete, keep, insert, keep, delete, insert — each labelled keep, delete or insert, while the counters climb to "Read: 4/4" on both sides.',
      '`let port` appears on both sides with a different value in a different place; with different text it is a deletion and an insertion, not a pair.',
      'Two read-back steps filter the finished list: "Keep and delete lines only — A comes back. Lines: 4." and "Keep and insert lines only — B comes back. Lines: 4." Nine steps in all counting the start.',
      'Row marks follow unified diff (`-`, `+`, a space for kept lines) without hunk headers. Where two different lines meet, the deletion is written before the insertion. File lines are in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one row per step, then the two read-backs, and stops.',
        'A Replay button and a playback strip sit below. Dragging the strip to the last two steps holds the finished list beside A and B rebuilt from it.',
        'The files and the list are fixed, so every row and caption can be quoted as shown.',
      ],
    },

    useWhen: [
      'The article teaches how to read diff or patch output and needs to show that the `-`, `+` and unmarked rows are one sequence from which either version can be read back.',
      'A reader thinks a diff stores only the changes and wonders how it can be applied or reversed; filtering the same list two ways into A and into B answers that.',
    ],

    avoidWhen: [
      'The article is about how many edits a diff has or how the minimum is found. No count is driven down and no search is shown.',
      'The subject is hunk headers, line offsets or fuzzy patch application. The list here has no `@@` headers or offsets.',
      'The subject is character-level edits inside a word or string. Rows here are whole lines.',
    ],

    contrastWith: [
      {
        concept: 'keepTheCommon',
        note: 'How many edits a diff contains is fixed by the kept lines; this is about the record itself, an ordered list whose rows can be filtered back into either file.',
      },
      {
        concept: 'editDistance',
        note: 'Recovering edits from a filled string-distance table is a traceback over characters with substitution; a line edit script has only keep, delete and insert, and its point is that the list alone reproduces both files.',
      },
      {
        concept: 'moveLooksLikeRewrite',
        note: 'An edit script has no move row, which is exactly why relocated lines come out as a deletion in one place and an insertion in another.',
      },
    ],
  },
};
