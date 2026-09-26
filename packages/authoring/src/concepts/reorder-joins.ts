/**
 * reorderJoins 개념 선언.
 *
 * canonical facet 은 `facet:reorderJoins` — "오늘 시험이 있는 과목을 듣는 학생의 이름". `students`(다섯) · `enrolls`(스물) ·
 * `today_exams`(하나, `DB`). 학생 먼저면 중간 결과가 스무 줄로 부풀었다가 두 줄로(만든 줄 22), 시험 먼저면 처음부터 두 줄(만든 줄 4).
 * 끝 답은 두 차례 모두 Ana · Cho. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `optimizer` 는 거르는 줄 수를 돌려 싼 차례가 뒤집히는 자리를 쥔다. 형제 `sameAnswerDifferentPlan` 은 거르기의 자리를
 * 옮기는 것, `planIsATree` 는 한 계획 안의 흐름. 이쪽은 **셋 가운데 어느 둘을 먼저 잇느냐로 중간 결과가 부풀거나 작게 머문다**는
 * 한 번의 갈림을 쥔다. 그래서 definition 은 which two first · intermediate result swells · discards rows earliest 를 독점하고,
 * 옵티마이저가 고른다 · 뒤집힌다 · 거르기를 옮긴다 · 검사 수는 쓰지 않는다.
 *
 * 전제 (설명 글 `reorderJoins.md`): 예로 정한 작은 자료 · 조인이 짝을 찾는 방법은 말하지 않는다(어느 방법이든 결과 줄 수는 같다) ·
 * 결과 줄은 왼쪽 표 차례, 그 안에서 오른쪽 표 차례로 보인다 · 셋째 차례(students × today_exams)는 이음 조건이 없는 곱이라 그리지
 * 않았다 · 실제 옵티마이저는 줄 수를 추정한다 — 여기서는 실제로 이어 본 수 · SQL 은 그대로 쓴 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const reorderJoinsConcept: FacetConceptSource = {
  id: 'reorderJoins',
  label: 'Join Order Decides the Intermediate Result',
  canonicalFacet: 'facet:reorderJoins',

  surface: {
    definition:
      'Joining three tables means choosing which two to join first; the final rows are the same either way, but the intermediate result swells or stays small depending on whether the join that discards rows comes first.',
    exemplarKeywords: [
      'join order',
      'intermediate result size',
      'which table to join first',
      'multi-way join',
      'join reordering',
      'selective join first',
      'blow-up of intermediate rows',
      'star join order',
      'three table join',
    ],
  },

  briefing: {
    observable: [
      'The query is `SELECT s.name FROM students s JOIN enrolls e ON e.student_id = s.id JOIN today_exams x ON x.course_id = e.course_id`. Under "Tables" stand `students` (five rows), `enrolls` (twenty rows) and `today_exams` (one row, `DB`). "Which pair of tables to join first?"',
      'Students first: "students ⋈ enrolls first. Intermediate rows: 20" — every enrolment gets a name and the pile swells to twenty, four per student. Then "Then ⋈ today_exams. Rows: 20 → 2".',
      'Exams first: "enrolls ⋈ today_exams first. Intermediate rows: 2" — only the two enrolments in `DB` are made. Then "Then ⋈ students. Rows: 2 → 2".',
      'The two lanes end side by side: "Answer in both orders: Ana, Cho. Rows made: 22 · 4". Each lane keeps a "Rows made" count; eighteen of the twenty rows made in the students-first lane are thrown away at the second join.',
      'The data is a small invented example. How a join finds its pairs is not shown, since any method gives the same row counts. The third order, joining `students` with `today_exams` first, has no join condition and would be a cross product; it is not drawn. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays both orders by itself and stops on the comparison of rows made.',
        'A Replay button and a playback strip sit below it. Holding the first join of each lane sets a pile of twenty beside a pile of two.',
      ],
    },

    useWhen: [
      'The article explains why the order of joins matters when the SQL never states one, and needs a case where one order builds a large intermediate result only to discard most of it.',
      'A reader asks what "join the most selective table first" means; the one-row exam table cutting twenty enrolments to two before names are attached shows it.',
    ],

    avoidWhen: [
      'The article is about join algorithms such as nested loop, hash or merge join. How pairs are found is left out.',
      'The subject is how an optimizer estimates sizes or picks the order automatically. Both orders are simply run and counted.',
      'The point is a two-table join or the difference between inner and outer joins. There are three tables and only inner joins.',
    ],

    contrastWith: [
      {
        concept: 'optimizer',
        note: 'That one order makes far more rows than the other is the fact an optimizer works from; which order is cheaper can itself reverse when the filtering changes.',
      },
      {
        concept: 'sameAnswerDifferentPlan',
        note: 'Both keep the answer fixed and change the work. Reordering joins changes which tables meet first; moving a filter changes whether rows are removed before or after they meet.',
      },
      {
        concept: 'matchOnKey',
        note: 'A join pairing rows on a key is one operation; ordering several such operations is where the size of what passes between them starts to matter.',
      },
    ],
  },
};
