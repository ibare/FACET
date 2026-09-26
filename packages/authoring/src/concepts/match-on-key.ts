/**
 * matchOnKey 개념 선언.
 *
 * canonical facet 은 `facet:matchOnKey` — `emp` 다섯 줄(Ann 20 · Bo 10 · Cy 20 · Di 30 · Eve 20)이 하나씩 dept_id 를 들고
 * `dept`(10 Sales · 20 Dev · 30 Ops)로 건너가 같은 id 의 줄을 찾고, 그 줄의 복사본이 붙어 결과 한 줄이 된다. Dev 는
 * 세 번 복사된다. 걸음 여섯, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `joinKinds` 는 종류를 돌려 짝 없는 줄이 남는지 빠지는지를 견준다. 이쪽은 **짝을 찾는 한 동작** — 열쇠 값이
 * 같은 줄을 찾아 새 줄을 만들고, 찾은 줄은 제자리에 남아 또 쓰인다 — 을 쥔다. 이 데이터에는 짝 없는 줄이 없다.
 * 그래서 definition 은 key value · same value · new combined row · copied into several results 를 독점하고,
 * 종류 낱말(LEFT · RIGHT · FULL · CROSS) · unmatched · NULL 을 쓰지 않는다.
 *
 * 전제 (설명 글 `matchOnKey.md`): 중첩 루프로 돈다(바깥 emp · 안쪽 dept) — 실제 엔진은 해시 · 병합 조인을 고를 수
 * 있지만 결과 모음은 같다 · 결과 줄 차례는 emp 차례(약속이 아니다) · 외래 키 선언은 이 조각의 말이 아니다 ·
 * 표와 값은 예로 정한 것 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matchOnKeyConcept: FacetConceptSource = {
  id: 'matchOnKey',
  label: 'INNER JOIN Pairs Rows by Equal Keys',
  canonicalFacet: 'facet:matchOnKey',

  surface: {
    definition:
      'An inner equi-join carries each left row\'s key value to the other table, finds the row holding the same value, and emits a new combined row; the found row stays put and can be copied into several results.',
    exemplarKeywords: [
      'INNER JOIN',
      'equi-join',
      'JOIN ON',
      'how a SQL join works',
      'join condition',
      'combine rows from two tables',
      'one-to-many join repeats values',
      'lookup table join',
      'nested loop join',
    ],
  },

  briefing: {
    observable: [
      'Two tables and a query: `emp` (Ann 20, Bo 10, Cy 20, Di 30, Eve 20 as name and dept_id), `dept` (10 Sales, 20 Dev, 30 Ops), and `SELECT e.name, d.dname FROM emp e JOIN dept d ON e.dept_id = d.id;`. The caption reads "Rows in emp: 5 · rows in dept: 3".',
      'One step per emp row: the row carries its dept_id across ("Ann looks for dept.id = 20."), meets the row with the same id, and a copy of that row\'s dname joins it in a new Result row.',
      'The dept row is not moved; it stays in its table and is found again later. After Eve the caption reads "Result rows: 5 · copies of Dev: 3".',
      'The Result holds Ann Dev, Bo Sales, Cy Dev, Di Ops, Eve Dev — five rows although dept has only three; Dev appears three times, Sales and Ops once each.',
      'Every emp row finds a partner in this data. The join runs as a nested loop, outer emp and inner dept; a real database may choose a hash or merge join with the same set of result rows. Result rows appear in emp order, which SQL does not promise without ORDER BY. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself — the starting tables, then one emp row per step — and stops.',
        'A Replay button and a playback strip sit below it. Holding the fifth or sixth step shows the Dev row still in dept while its third copy sits in the result.',
      ],
    },

    useWhen: [
      'The article explains what a join produces — new rows built from a pair of rows — and needs a reader to see that the looked-up row is copied, not moved or used up.',
      'A reader is puzzled why a joined result has more rows than the smaller table, or repeats the same department name; the three copies of Dev answer that.',
    ],

    avoidWhen: [
      'The article is about rows that find no partner or about outer joins. Every row here matches.',
      'The subject is join algorithms and their cost. The step order is a nested loop only as a way to show matching.',
      'The point is many-to-many joins that multiply on both sides. Each dept_id points at exactly one dept row.',
    ],

    contrastWith: [
      {
        concept: 'joinKinds',
        note: 'Matching on equal keys is common to every conditional join; the join kinds differ only in what they do with rows that fail to match.',
      },
      {
        concept: 'keepUnmatched',
        note: 'An inner join emits a row only when a partner is found; keeping a row that has no partner, padded with NULL, is a separate rule.',
      },
      {
        concept: 'allPairs',
        note: 'A match condition is what limits pairing to rows with equal keys; without it every row pairs with every row.',
      },
      {
        concept: 'foreignKeyPoints',
        note: 'A foreign key is a declared promise that the value points at an existing row; a join only compares values at query time and works whether or not that promise was declared.',
      },
    ],
  },
};
