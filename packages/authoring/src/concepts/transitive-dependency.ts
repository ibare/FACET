/**
 * transitiveDependency 개념 선언.
 *
 * canonical facet 은 `facet:transitiveDependency` — 표 `employees`(emp_id · name · zip · city) 다섯 줄, 열쇠 `emp_id`.
 * FD1 `emp_id → name, zip` · FD2 `zip → city`. 열쇠에서 출발한 정해짐이 FD1 로 name · zip 에(고리 1), FD2 로 zip 을
 * 건너 city 에(고리 2) 닿는다. zip 은 서로 다른 값 3 / 5 라 열쇠가 아니다. 고리 `zip → city` 가 끊겨 `zips` 세 줄로
 * 떼어 나가고 `employees` 는 다섯 줄 그대로. 걸음 다섯, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `normalForms` 는 이 떼어 내기를 3NF 한 칸으로 지나간다. 형제 `partialDependency` 는 열쇠의 **일부**에 매달린
 * 열, `determinantMustBeKey` 는 정하는 쪽이 열쇠인가를 판정한다. 이쪽은 **열쇠에서 가운데 열을 건너서야 닿는 열** —
 * 사슬의 길이를 쥔다. 그래서 definition 은 through an intermediate non-key column · two links · directly 를 독점하고,
 * composite · part of the key · closure · stage 를 쓰지 않는다.
 *
 * 전제 (설명 글 `transitiveDependency.md`): 종속은 선언이다 · 번지는 차례는 선언된 종속을 적힌 차례로 · 우편번호는
 * 예로 정한 값(실제 번호 체계를 흉내 내지 않는다) · 떼어 낸 표는 같은 줄을 처음 것 하나만 둔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const transitiveDependencyConcept: FacetConceptSource = {
  id: 'transitiveDependency',
  label: 'Transitive Dependency (Column Reached Through a Non-Key Column)',
  canonicalFacet: 'facet:transitiveDependency',

  surface: {
    definition:
      'A column fixed by some non-key column is linked to the key only through that intermediate, a chain of length two; cutting the middle link into a separate lookup relation puts every column one step from its key.',
    exemplarKeywords: [
      'transitive dependency',
      'transitive functional dependency',
      'third normal form',
      '3NF',
      'non-key attribute depends on another non-key attribute',
      'zip code determines city',
      'employee zip city table',
      'lookup table for derived attributes',
      'A → B → C dependency chain',
    ],
  },

  briefing: {
    observable: [
      'Table `employees` with `emp_id`, `name`, `zip`, `city` and five rows (E1 Hana 21000 Incheon … E5 Jin 44000 Ulsan). Two declared dependencies sit above it: FD1 `emp_id → name, zip` and FD2 `zip → city`. Each column head carries a knot showing how many links it is from the key; `emp_id` shows 0.',
      'FD1 fires first: "FD1 applied. Reached: name, zip. Links from the key: 1". `name` and `zip` get 1.',
      'City is not reached by FD1. Once `zip` is in, a dot travels from `emp_id` through `zip` to `city`: "Reached only through zip: city. Links from the key: 2".',
      'The middle link breaks: "Link cut: zip → city. Distinct zip values: 3 / 5". The `city` column is dragged out with a copy of `zip`, while the original `zip` column stays in `employees`. Equal-coloured cells mark the repeated city values: Incheon twice, Gwangju twice, Ulsan once.',
      'The dragged-out rows fold into table `zips` with three rows — 21000 Incheon, 61000 Gwangju, 44000 Ulsan: "Split off: zips, rows: 3. Remaining: employees, rows: 5". In both tables every column is now one link from its key.',
      'The dependencies are declared rather than discovered from the rows, and the zip codes are made-up values that imitate no real postal system. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its five steps by itself and stops on the two resulting tables.',
        'A Replay button and a playback strip sit below it. Holding the step where the dot passes through `zip` shows the two-link path that the split later removes.',
      ],
    },

    useWhen: [
      'The article defines the third normal form and needs "depends on the key only through another attribute" shown as a path with a length, not just stated.',
      'A reader keeps a derived attribute such as a city next to its zip code in every row and needs to see the chain that makes it repeat and the lookup table that ends it.',
    ],

    avoidWhen: [
      'The table has a composite key and the problem column depends on part of it. That is a different dependency and is not shown.',
      'The subject is BCNF or a determinant that is part of a candidate key. Here the middle column is plainly not part of any key.',
      'The point is the rules of transitivity in dependency theory (Armstrong\'s axioms). Only one chain in one table is followed.',
    ],

    contrastWith: [
      {
        concept: 'partialDependency',
        note: 'A transitive dependency hangs a column on a column outside the key; a partial one hangs it on a piece of a composite key. The first is found by following a chain, the second by testing each half of the key.',
      },
      {
        concept: 'determinantMustBeKey',
        note: 'A chain through a non-key column is one way a determinant fails to be a key. The general rule tests every determinant directly and also flags cases where the determined column is itself part of a key.',
      },
      {
        concept: 'normalForms',
        note: 'Removing chains through non-key columns is the move that reaches 3NF. In the full sequence it is one step, after which one kind of repeated fact can still remain.',
      },
    ],
  },
};
