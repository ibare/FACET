/**
 * myersDiff 개념 선언.
 *
 * canonical facet 은 `facet:myersDiff` — 고치기 전 A 와 고친 뒤 B 를 편집 격자에 놓고 Myers 의 앞으로 가는 탐욕판이
 * 값 D 한 층씩 끝점을 넓힌다. 손잡이 둘: 고친 줄 k(0~4, 처음 2) · 파일 길이 N(10 · 20 · 30 · 40, 처음 20).
 * k 를 올리면 D(= 2k)와 들른 끝점(1 · 5 · 13 · 25 · 41)이 불어나고, N 을 올리면 LCS 표 칸만 제곱으로 자랄 뿐 D 와
 * 들른 끝점은 그대로다. 곁의 두 막대(표 칸 · Myers 일)가 N 에서 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 둘 + 조각 일곱 가운데 diff 쪽)
 *
 * 조각 셋은 각각 한 장면이다 — 남긴 줄이 고칠 수를 정한다(`keepTheCommon`) · 차이가 한 목록으로 적힌다(`editScript`) ·
 * 한 칸은 값을 치르고 같은 줄은 공짜다(`diagonalIsFree`). 이쪽은 두 손잡이로 **일의 양이 무엇을 따르는가**를 견준다.
 * 그래서 definition 은 work · grows with the number of differing lines · file length · quadratic LCS table 을 쥐고,
 * 조각들이 독점한 minus twice / ordered list · rebuild / zero cost · costs one 을 쓰지 않는다.
 *
 * 전제 (설명 글 `myersDiff.md` 가 밝힌 것, 화면은 각주가 없다):
 *  - 줄 단위로 글자 그대로 견준다. 바꿈은 없다 — 달라진 줄은 지움 하나와 넣음 하나.
 *  - 앞에서 끝으로만 가는 탐욕판이다. `git diff` 는 가운데서 만나는 선형 공간판에 휴리스틱을 더해 쓴다.
 *  - 바꿀 자리를 고르게 흩은 것은 예로 정한 것이다. A 는 가상 표기로 적은 마흔 줄 코드의 앞 N 줄.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이고, 편집 목록으로 접는 되짚기는 패널 밖이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const myersDiffConcept: FacetConceptSource = {
  id: 'myersDiff',
  label: 'Myers Diff (Work Follows the Size of the Change)',
  canonicalFacet: 'facet:myersDiff',

  surface: {
    definition:
      "Myers' line-diff algorithm explores the edit graph in rounds of increasing edit cost, so its work grows with the number of differing lines, whereas a full LCS table grows with the square of the file length.",
    exemplarKeywords: [
      'Myers diff algorithm',
      'O(ND) difference algorithm',
      'how git diff works',
      'diff algorithm complexity',
      'why diff is fast on large files',
      'edit graph',
      'furthest reaching D-path',
      'LCS table is quadratic',
      'git diff --diff-algorithm=myers',
      'line-based diff',
    ],
  },

  briefing: {
    observable: [
      'File A ("Before") runs along the top of a grid and file B ("After") down its side. Moving right deletes a line of A, moving down inserts a line of B, and cells where the two lines match allow a diagonal step.',
      'With the defaults (2 lines edited, file length 20), B replaces lines 7 and 13 of A with `show "check 1"` and `show "check 2"`; the round opens with "A 20 lines · B 20 lines · 2 lines edited" and marks -7, -13, +7, +13.',
      'Each cost layer takes two steps. A pay step ("D 2 · 3 endpoints each pay one step") moves every endpoint one cell; a slide step ("D 2 · slid free 5") carries them down diagonals of matching lines. The fan of endpoints widens by one per layer.',
      'At the defaults the search reaches the far corner at D 4 ("D 4 · slid free 7 · reached the end") after 13 endpoints and 18 slid cells; the path then folds into an edit script — "Edit script: keep 18 · delete 2 · insert 2" — with runs of unchanged lines collapsed ("… 6 unchanged lines").',
      'Two bars sit beside the grid: "Table cells", what a full LCS table would fill ((N+1) × (M+1), 441 at length 20), and "Myers work", endpoints plus slid cells (31 at the defaults). The readouts are Edit cost D, Endpoints visited, Cells slid and LCS table cells.',
      'Across "Lines edited" 0 to 4, D goes 0, 2, 4, 6, 8 and endpoints 1, 5, 13, 25, 41. Across "File length" 10 to 40 with 2 lines edited, D stays 4 and endpoints stay 13, while table cells go 121, 441, 961, 1681 and Myers work only 21, 31, 41, 51.',
      'Lines are compared as exact text, leading spaces included, and there is no substitution: a changed line counts as one deletion and one insertion. This is the forward greedy form of Myers; `git diff` uses a linear-space variant with heuristics. The screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: a five-position "Lines edited" slider (0–4, starting at 2) and a four-position "File length" slider (10, 20, 30, 40, starting at 20). Each change replays the search from the empty grid.',
        'The move that makes the idea land is raising File length with Lines edited held still: the Table cells bar climbs steeply while D and Endpoints visited do not move. Raising Lines edited instead widens the fan of endpoints layer by layer.',
        'The code panel, labelled "Myers forward search", shows the cost search in a chosen language (Python, JavaScript, TypeScript, Java, C++ or C#) and highlights the current line; the fold into an edit script is outside the code. It carries one meaning across the languages, not language-specific behaviour.',
      ],
    },

    useWhen: [
      'The article explains why diffing two long, nearly identical files is fast, and needs to show the work staying flat as files grow while a full LCS table balloons.',
      "The reader meets Myers' O(ND) bound and wants to see what N and D each are, by moving the number of edited lines and the file length separately and watching which counts respond.",
    ],

    avoidWhen: [
      'The subject is character-level edit distance with substitution or the Levenshtein table. Lines here are whole units, and a changed line is a deletion plus an insertion.',
      'The article is about patience or histogram diff, or about how git picks between diff algorithms. Only the forward greedy Myers search runs here.',
      'The point is reading or applying a patch file. The edit script appears only as the folded result of the search.',
    ],

    contrastWith: [
      {
        concept: 'diagonalIsFree',
        note: 'That matching lines cost nothing and each edit costs one is the pricing rule; the algorithm-level claim built on it is that the total effort therefore scales with the number of edits and hardly with how long the files are.',
      },
      {
        concept: 'keepTheCommon',
        note: 'The count of edits follows from how many lines are kept in common; this is about how much searching it takes to find that answer, and how that effort depends on the edits rather than the length.',
      },
      {
        concept: 'editScript',
        note: 'A diff as an ordered keep/delete/insert list is the output format. Myers is one way of computing that output and is judged by how its cost grows.',
      },
      {
        concept: 'editDistance',
        note: 'Edit distance fills a full table and prices substitution; a line diff has no substitution, and Myers avoids filling the table at all by searching only as far as the difference requires.',
      },
    ],
  },
};
