/**
 * planIsATree 개념 선언.
 *
 * canonical facet 은 `facet:planIsATree` — `SELECT e.name, d.floor FROM emp e JOIN dept d ON e.dept_id = d.id WHERE e.salary > 5000`
 * 의 계획 하나(Seq Scan · Filter · Hash Join · Project). dept 셋이 먼저 올라가 해시표에 고이고, emp 다섯이 하나씩 올라가 Filter 에서
 * 멈추거나(Ben · Eli) 짝을 찾아 답이 된다(Ana · Cho · Dev). 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `optimizer` 는 계획 트리를 모양이 바뀌는 대상으로 쓰고, 형제 둘은 계획 사이의 견줌이다. 이쪽은 **계획 하나 안에서 줄이
 * 한 번에 하나씩 잎에서 위로 흐른다** — 짓는 쪽은 고이고, 걸린 줄은 멈추고, 끝까지 오른 줄만 답 — 를 쥔다. 그래서 definition 은
 * operators · flow upward one at a time · build side pooled · stop · root 를 독점하고, 차례 · 같은 답 · 비용은 쓰지 않는다.
 *
 * 전제 (설명 글 `planIsATree.md`): 예로 정한 작은 자료와 계획(실제 EXPLAIN 이 아니다, 연산자 이름과 조건식은 EXPLAIN 표기를 빌렸다) ·
 * 끌어올리기(반복자) 모형 · 표는 id 차례로 읽는다 · ORDER BY 가 없어 답의 차례는 약속되지 않는다 · Filter 를 지난 emp 는 모두 짝을
 * 찾는다 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const planIsATreeConcept: FacetConceptSource = {
  id: 'planIsATree',
  label: 'An Execution Plan Is a Tree: Rows Flow Up',
  canonicalFacet: 'facet:planIsATree',

  surface: {
    definition:
      'An execution plan is a tree of operators through which rows flow upward one at a time from the table scans; a hash join pools its whole build side first, a filter stops failing rows, and only rows reaching the root are output.',
    exemplarKeywords: [
      'execution plan tree',
      'query plan operators',
      'iterator model',
      'Volcano model',
      'pipelined execution',
      'blocking operator',
      'hash join build and probe',
      'reading EXPLAIN bottom up',
      'Seq Scan Filter Hash Join Project',
    ],
  },

  briefing: {
    observable: [
      'The query `SELECT e.name, d.floor FROM emp e JOIN dept d ON e.dept_id = d.id WHERE e.salary > 5000` sits beside its plan: `Seq Scan` leaves over `dept` and `emp`, a `Filter` above the emp scan, a `Hash Join` with a "build" and a "probe" side and a "hash table" slot, and `Project` at the top leading to "answer". "The plan waits for its first row. Nothing has risen yet."',
      'The first three steps take dept 10, 20 and 30 up the build side: "The build side is read to the end first. dept 10 rises and stays in the hash table. Stored rows: 1". They pool in the hash table.',
      'Then the emp rows rise one per step. Ana (6200): "emp Ana rises all the way: e.salary 6200 meets e.salary > 5000, it pairs with dept 10 from the hash table, and becomes an answer. Answer rows: 1". Cho (5100) and Dev (7000) do the same.',
      'Ben (4800) and Eli (3900) stop at the filter: "emp Ben rises and stops at Filter: e.salary 4800 fails e.salary > 5000. Stopped rows: 1".',
      'The travelling row changes its fields as it goes: it gains the paired dept\'s fields after the join and keeps only two after `Project`. Rows read from a table stay faintly in place — reading is not moving. The answer is (Ana, 3), (Cho, 3), (Dev, 2).',
      'The tables and plan are a small invented example; operator names and conditions borrow EXPLAIN notation. Tables are read in id order and, with no ORDER BY, the answer order is not guaranteed. In this data every emp that passes the filter finds a match. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the plan by itself, one row\'s journey per step, and stops after the last emp row.',
        'A Replay button and a playback strip sit below it. Holding the step where the first emp row rises shows all three dept rows already waiting in the hash table.',
      ],
    },

    useWhen: [
      'The article teaches how to read an EXPLAIN plan and needs the idea that data moves from the leaves toward the root, one row at a time.',
      'A reader asks what a "blocking" operator is; the build side of the hash join filling up completely before any emp row gets through shows the difference from a filter that passes rows on at once.',
    ],

    avoidWhen: [
      'The article compares alternative plans or explains how the optimizer picks one. Only one plan is shown.',
      'The subject is the cost or speed of the plan. Nothing is timed or priced.',
      'The point is sorting, grouping or aggregation operators. The plan has only scans, a filter, a hash join and a projection.',
    ],

    contrastWith: [
      {
        concept: 'optimizer',
        note: 'Running a plan is what happens after the choice; the optimizer\'s work is deciding which tree to build before any row moves.',
      },
      {
        concept: 'sameAnswerDifferentPlan',
        note: 'A single plan\'s flow shows how an answer is produced; equivalent plans show that the shape of the tree can change without changing that answer.',
      },
      {
        concept: 'hashTableChaining',
        note: 'A hash table is a lookup structure; in a hash join it becomes the point where one input must be fully collected before the other can be matched.',
      },
    ],
  },
};
