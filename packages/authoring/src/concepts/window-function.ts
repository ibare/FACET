/**
 * windowFunction 개념 선언.
 *
 * canonical facet 은 `facet:windowFunction` — 표 `run (id, team, km)` 아홉 줄에 두 질의를 나란히 건다. 왼쪽은
 * `SUM(km) OVER (PARTITION BY team ORDER BY id ROWS BETWEEN k PRECEDING AND k FOLLOWING) AS near`, 오른쪽은
 * `GROUP BY team` 의 `total`. 손잡이 "틀"(0 · 1 · 2 · UNBOUNDED, 처음 1)을 넓히면 near 가 total 과 같은 줄이
 * 0 → 3 → 7 → 9 로 번지고, 윈도 쪽은 끝까지 아홉 줄 · GROUP BY 쪽은 세 줄이다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * 조각 `windowSlides` 는 틀 하나(앞뒤 한 줄)가 줄을 따라 미끄러지며 제 줄 칸에 합을 적는 장면, `groupThenAggregate` 는
 * 같은 값의 줄이 모여 한 줄로 접히는 장면이다. 이쪽은 **틀의 폭을 돌려 두 결과를 견주는 것**을 쥔다 — 넓힐수록
 * 윈도 값이 묶음 합에 다가가고, 그래도 줄 수는 9 대 3 그대로. 그래서 definition 은 widening · PARTITION BY ·
 * UNBOUNDED · approaches the total · nine rows vs three 를 쥐고, 조각이 독점한 slides · edges · gathers · collapses 를
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `windowFunction.md`): 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기 · `ROWS` 틀은 줄 수로 세고
 * 묶음 끝에서 준다 · km 는 모두 양수 · 두 결과의 줄 차례는 팀이 처음 나온 차례(SQL 의 약속이 아니다).
 * 코드 패널은 IR → 여섯 언어로, UNBOUNDED 는 k = 9 로 건넨다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const windowFunctionConcept: FacetConceptSource = {
  id: 'windowFunction',
  label: 'Window Function vs GROUP BY (Widening the Frame)',
  canonicalFacet: 'facet:windowFunction',

  surface: {
    definition:
      'Widening a partitioned window frame from the current row to UNBOUNDED brings each row\'s windowed SUM up to its partition\'s GROUP BY total, yet the window query keeps every row while GROUP BY returns one per group.',
    exemplarKeywords: [
      'window function',
      'analytic function',
      'OVER PARTITION BY',
      'window function vs GROUP BY',
      'ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING',
      'window frame clause',
      'aggregate without collapsing rows',
      'per-group total on every row',
      'PostgreSQL window functions',
      'moving sum per partition',
    ],
  },

  briefing: {
    observable: [
      'The table `run` has nine rows of id, team and km: 1 hawk 5, 2 lynx 8, 3 hawk 3, 4 orca 6, 5 hawk 7, 6 lynx 2, 7 orca 4, 8 hawk 1, 9 lynx 9. Two queries sit side by side: `SUM(km) OVER (PARTITION BY team ORDER BY id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS near` and `SELECT team, SUM(km) AS total FROM run GROUP BY team;`. The frame clause changes with the handle.',
      'A round is seven steps: the starting table; rows lining up by team and then by id ("partitions: 3 · rows in the largest: 4"); one step each for hawk, lynx and orca in which every row\'s frame bracket opens and its near value rolls to a new sum; GROUP BY folding the rows ("rows before: 9 · rows after: 3"); and rows whose near equals total being linked to their team\'s GROUP BY row.',
      'The GROUP BY side always gives hawk 16, lynx 19, orca 10 in three rows. The window side always has nine rows, under panels titled "Window result — rows kept" and "GROUP BY result — rows folded".',
      'Rows with near equal to total grow as the frame widens: frame 0 gives 0 (near is each row\'s own km), frame 1 gives 3 (the middle lynx row and both orca rows), frame 2 gives 7 (only hawk\'s first and last rows still fall short), UNBOUNDED gives 9.',
      'Frames count rows, not value ranges, and shrink at the edges of a team instead of padding with zeros. Because every km is positive, near reaches total only when the frame covers the whole team. The result row order (teams in order of first appearance, then id) is not promised by SQL. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: "Frame", four positions 0, 1, 2, UNBOUNDED (starting at 1). Each change replays the round with rows keeping their places.',
        'The move that makes the idea land is stepping the frame up to UNBOUNDED: the brackets open, the near values climb, the links to the GROUP BY rows spread from 0 to 9 rows, and the window side never loses a row.',
        'Readouts under the controls: Window rows, GROUP BY rows and Same as total.',
        'The code panel, labelled "Frame sums and group totals", starts empty with a "+ Add language" button; it shows the loop that computes each frame sum and each team total and counts the rows where they agree, passing UNBOUNDED as a width of 9, in Python, JavaScript, TypeScript, Java, C++ or C#. It is not SQL.',
      ],
    },

    useWhen: [
      'The article explains when to reach for a window function instead of GROUP BY, and needs the two run side by side on one table so the reader sees nine rows kept against three rows returned.',
      'A reader wonders how a frame clause relates to a partition total; watching near equal total on 0, 3, 7 and then all 9 rows as the frame widens connects the frame to the partition.',
    ],

    avoidWhen: [
      'The article is about ranking functions such as ROW_NUMBER, RANK or LAG/LEAD. Only SUM over a frame appears.',
      'The subject is RANGE or GROUPS frames defined by value distance. Frames here count rows.',
      'The point is a running total that accumulates from the start of the table. Frames here are symmetric around each row within a team.',
    ],

    contrastWith: [
      {
        concept: 'windowSlides',
        note: 'A frame moving along ordered rows and writing each row\'s own sum is the basic behaviour of a window aggregate; partitioning and widening that frame is what ties it to the per-group total.',
      },
      {
        concept: 'groupThenAggregate',
        note: 'GROUP BY answers one value per group and the individual rows are gone from the output; a window aggregate can produce that same value while every input row remains.',
      },
      {
        concept: 'reduceFold',
        note: 'A fold consumes a whole sequence into one value; a window aggregate performs a small fold for every row over its neighbours and returns as many results as there were rows.',
      },
      {
        concept: 'subquery',
        note: 'A correlated subquery can also give each row a figure for its own group, by rerunning an aggregate per row; a window function computes the partition once and attaches the figure to every row.',
      },
    ],
  },
};
