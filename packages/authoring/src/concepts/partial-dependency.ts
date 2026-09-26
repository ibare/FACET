/**
 * partialDependency 개념 선언.
 *
 * canonical facet 은 `facet:partialDependency` — 표 `enrollment`(student_id · course_id · grade · course_title) 여섯 줄,
 * 열쇠는 (student_id, course_id). `grade` 는 두 열을 다 붙잡아야 정해지고(한쪽씩은 반례 짝 S1 → A / B · C1 → A / B),
 * `course_title` 은 `course_id` 한쪽만으로 정해진다. `course_title` 이 `course_id` 를 데리고 떨어져 나가 `courses`
 * 세 줄이 되고, 과목 이름 사본이 6 → 3. 걸음 다섯, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `normalForms` 는 이 떼어 내기를 2NF 한 칸으로 지나간다. 형제 `transitiveDependency` 는 열쇠가 **아닌** 열을
 * 건너 매달린 열, `determinantMustBeKey` 는 정하는 쪽이 열쇠인가를 판정한다. 이쪽은 **여러 열 열쇠의 한쪽에만
 * 매달린 열**을 쥔다. 그래서 definition 은 composite key · only one of its columns · counterexample 을 독점하고,
 * chain · intermediate · closure · stage 를 쓰지 않는다.
 *
 * 전제 (설명 글 `partialDependency.md`): 종속은 선언이다(줄은 반례만 보일 수 있다) · 반례 짝은 데이터 차례로 처음
 * 나오는 짝 · 떼어 낸 표는 같은 줄을 처음 것 하나만 둔다 · 무손실 분해는 보이지 않는다 · 데이터는 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const partialDependencyConcept: FacetConceptSource = {
  id: 'partialDependency',
  label: 'Partial Dependency (Column Fixed by Half a Composite Key)',
  canonicalFacet: 'facet:partialDependency',

  surface: {
    definition:
      'In a table keyed by a composite key, a column determined by only one of its key columns repeats on every row sharing that half; moving it with that half into its own table stores it once per value.',
    exemplarKeywords: [
      'partial dependency',
      'partial functional dependency',
      'second normal form',
      '2NF',
      'composite primary key',
      'non-key attribute depends on part of the key',
      'enrollment table student course',
      'split course details into their own table',
      'full functional dependency',
    ],
  },

  briefing: {
    observable: [
      'Table `enrollment` with `student_id`, `course_id`, `grade`, `course_title` and six rows. The key step joins `student_id` and `course_id` into one key: "Key: student_id + course_id — distinct values: 6 / 6".',
      'For `grade`, each half alone fails with a counterexample pair — "student_id alone: S1 → A / B · course_id alone: C1 → A / B" — and only the pair gives one value: "grade is fixed by the whole key: student_id + course_id".',
      'For `course_title`, `student_id` alone fails ("S1 → Databases / Networks") but `course_id` alone gives one value each: "course_title is fixed by part of the key: course_id".',
      'The detach step pulls `course_title` out together with a copy of `course_id` into a new table `courses`: "course_title leaves with course_id — new table courses". The remaining `enrollment` keeps `student_id`, `course_id`, `grade` and all six rows.',
      'In the last step equal rows of `courses` fold to three — C1 Databases, C2 Networks, C3 Compilers — and the caption reads "Copies of course_title: 6 → 3".',
      'The dependencies are declared, and the rows are only checked not to contradict them; a counterexample pair is the first pair in data order with the same left value and different right values. The data is a made-up example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its five steps by itself and stops after the split-off table shrinks to three rows.',
        'A Replay button and a playback strip sit below it. Setting the `grade` step beside the `course_title` step shows the two kinds of attachment to the same key.',
      ],
    },

    useWhen: [
      'The article defines the second normal form and needs to show what "depends on part of the key" means on real rows, including why the other key column is irrelevant to that column.',
      'A reader is unsure how to tell a column that belongs with a composite key from one that should move out; the counterexample pairs for each half settle it column by column.',
    ],

    avoidWhen: [
      'The table has a single-column key. A partial dependency needs a key of two or more columns.',
      'The subject is a column that depends on another non-key column. That chain is a different dependency and is not shown here.',
      'The point is proving that the split loses no information or joining the tables back. Neither is shown.',
    ],

    contrastWith: [
      {
        concept: 'transitiveDependency',
        note: 'A partial dependency hangs a column on a piece of the key; a transitive one hangs it on a column outside the key. Both are removed by splitting, but they are found by looking in different places.',
      },
      {
        concept: 'determinantMustBeKey',
        note: 'Here the question is where the determined column is attached. The stricter rule asks only whether each determining side is itself a key, which also catches cases this test lets through.',
      },
      {
        concept: 'normalForms',
        note: 'Removing partial dependencies is the move that reaches 2NF. The full progression shows which repeated facts that settles and which remain for later forms.',
      },
    ],
  },
};
