/**
 * joinKinds 개념 선언.
 *
 * canonical facet 은 `facet:joinKinds` — 두 표 `player (id, name, team_id)` 여섯 줄과 `team (id, tname)` 세 줄을
 * `p.team_id = t.id` 로 잇는다. 손잡이 "조인 종류"(INNER · LEFT · RIGHT · FULL · CROSS)를 돌리면 짝 맞은 네 줄은 자리를
 * 지키고, 짝 없는 줄(왼쪽 Lee · Ned, 오른쪽 Bees)만 NULL 을 달고 들어오거나 떨어진다. 결과 줄 4 · 6 · 5 · 7 · 18.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 한 장면씩이다 — 열쇠로 짝을 찾아 복사해 새 줄을 만듦(`matchOnKey`) · LEFT 가 짝 없는 왼쪽 줄을 NULL 로
 * 남김(`keepUnmatched`) · 조건 없이 모든 짝(`allPairs`). 이쪽은 **종류를 돌려 견주는 것**을 쥔다 — 공통인 짝 맞은 줄과
 * 종류마다 갈리는 짝 없는 줄. 그래서 definition 은 INNER · LEFT · RIGHT · FULL · CROSS 를 나란히 두고 which side
 * survives · same matched rows 를 쥐며, 조각이 독점한 copied · Cartesian product · discarding 을 쓰지 않는다.
 *
 * 전제 (설명 글 `joinKinds.md`): 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기 · player.team_id 는 외래 키로
 * 선언하지 않았다(그래서 가리킬 곳 없는 값이 있다) · 결과 줄 차례는 중첩 루프가 내는 차례이지 SQL 의 약속이 아니다.
 * 코드 패널은 IR → 여섯 언어로, 그 질의를 셈하는 중첩 루프다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const joinKindsConcept: FacetConceptSource = {
  id: 'joinKinds',
  label: 'Join Kinds (INNER, LEFT, RIGHT, FULL, CROSS Compared)',
  canonicalFacet: 'facet:joinKinds',

  surface: {
    definition:
      'INNER, LEFT, RIGHT, FULL OUTER and CROSS JOIN over the same two tables share the same matched rows and differ in which side\'s unmatched rows survive with NULL; CROSS removes the condition entirely.',
    exemplarKeywords: [
      'types of SQL joins',
      'inner vs outer join',
      'LEFT JOIN vs RIGHT JOIN',
      'FULL OUTER JOIN',
      'CROSS JOIN',
      'join Venn diagram',
      'which join to use',
      'rows missing after a join',
      'NULLs from an outer join',
      'orphan rows',
    ],
  },

  briefing: {
    observable: [
      'Two tables stand side by side: `player` with six rows (Ivy 2, Jay 1, Kai 2, Lee 4, Mo 1, Ned 5 as name and team_id) and `team` with three (1 Owls, 2 Foxes, 3 Bees). The query reads `SELECT p.name, t.tname FROM player p INNER JOIN team t ON p.team_id = t.id;`, and its join keyword changes with the handle.',
      'Lee (team_id 4) and Ned (team_id 5) have no team; Bees (id 3) has no player. The four matched rows Ivy-Foxes, Jay-Owls, Kai-Foxes and Mo-Owls are the same in INNER, LEFT, RIGHT and FULL and keep their places when the kind changes.',
      'A round is four steps: the starting tables, matched rows joining at once ("Matched rows: 4 · key compares: 18"), the left unmatched rows, then the right unmatched rows. Unmatched rows either stay with the other side filled by NULL ("Unmatched on the left: 2 · kept, right side NULL: Lee, Ned") or return to their table ("dropped from the result").',
      'Result rows by kind: INNER 4, LEFT 6 (2 with NULL), RIGHT 5 (1 with NULL), FULL 7 (3 with NULL), CROSS 18. LEFT and RIGHT differ because two rows lack a partner on the left and one on the right.',
      'CROSS drops the ON line; each player row branches out to all three team rows, the caption reads "No condition · player 6 × team 3 = result rows: 18", key compares are 0, and the round has only two steps.',
      'When the kind changes, the previous result stays faintly in place and is sorted out again step by step. Row order follows a nested loop — player order, then team order, left unmatched rows in their player position, right unmatched rows at the end; SQL promises no order without ORDER BY. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: "Join kind", five positions INNER, LEFT, RIGHT, FULL, CROSS (starting at INNER). Each change replays the round from the previous result.',
        'The move that makes the idea land is stepping INNER → LEFT → RIGHT → FULL: the four matched rows never move while Lee, Ned and Bees come in with NULL or drop out; then CROSS, where the result jumps to 18.',
        'Readouts under the controls: Result rows, Rows with NULL and Key compares.',
        'The code panel, labelled "Nested loop join", starts empty with a "+ Add language" button; it shows the nested loop that computes the join, writing -1 where the screen shows NULL, in Python, JavaScript, TypeScript, Java, C++ or C#. It is not SQL.',
      ],
    },

    useWhen: [
      'The article introduces the join family and needs one pair of tables under every kind, so the reader sees that the kinds agree on matched rows and disagree only about the leftovers.',
      'A reader confuses LEFT with RIGHT or cannot say what FULL adds; the result counts 6, 5 and 7 over the same data, with the NULL-filled rows named, settle it.',
    ],

    avoidWhen: [
      'The article is about join algorithms or performance — hash join, merge join, index nested loop. The loop here only serves to count compares.',
      'The subject is a join where one row matches several on the other side and duplicates results. Each player row has at most one team.',
      'The point is self-joins, semi-joins, anti-joins or NATURAL JOIN. None of these appear.',
    ],

    contrastWith: [
      {
        concept: 'matchOnKey',
        note: 'How one row finds its partner by equal key values and yields a new combined row is the core of every conditional join; the join kinds are rules layered on top about rows that find no partner.',
      },
      {
        concept: 'keepUnmatched',
        note: 'Keeping unmatched left rows is one kind taken alone; set among the others it becomes one choice out of four about which leftovers to keep.',
      },
      {
        concept: 'allPairs',
        note: 'A join without a condition is the degenerate member of the family: with no match test there are no unmatched rows to keep or drop, only a product of the two sizes.',
      },
      {
        concept: 'foreignKeyPoints',
        note: 'A declared foreign key prevents a value that points nowhere; outer joins are what a query uses to reveal or keep rows whose values point nowhere when no such constraint exists.',
      },
      {
        concept: 'relationalTablesAndKeys',
        note: 'Keys define which rows are related; a join kind decides what a query returns when a row has no related row on the other side.',
      },
    ],
  },
};
