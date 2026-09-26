/**
 * determinantMustBeKey 개념 선언.
 *
 * canonical facet 은 `facet:determinantMustBeKey` — 표 `tutoring`(student · subject · tutor) 여섯 줄, 선언 종속 둘:
 * FD1 `student, subject → tutor` · FD2 `tutor → subject`. 결정자 둘을 씨앗으로 두고 종속을 따라 번지게 한다.
 * {student, subject} 는 FD1 로 세 열 모두에 닿아 열쇠, {tutor} 는 FD2 로 subject 까지 번지고 멈춰 student 에 닿지
 * 못한다(2 / 3, 열쇠 아님). 그 짝 Han · math 가 세 줄에 되풀이된다. 걸음 일곱, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `normalForms` 는 BCNF 로 떼어 낸 뒤 잃는 종속을 센다. 형제 `partialDependency` · `transitiveDependency` 는
 * **정해지는 쪽**이 어디 매달렸는가를 보고 떼어 낸다. 이쪽은 **정하는 쪽**이 열쇠인지를 번짐(폐포)으로 판정하고
 * 떼어 내지 않는다. 그래서 definition 은 determinant · closure · reaches every column · superkey 를 독점하고,
 * part of the key · intermediate · decompose · stage 를 쓰지 않는다.
 *
 * 전제 (설명 글 `determinantMustBeKey.md`): 종속은 선언이다 · 번지기는 선언을 적힌 차례로 훑는다 · 이 표의 후보 키는
 * (student, subject) 와 (student, tutor) 이고 subject 가 후보 키의 일부라 3NF 는 FD2 를 허락한다 — 3NF 를 지나도
 * 되풀이가 남는다(설명 글이 밝히고 화면은 걸음으로 두지 않았다) · 데이터는 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const determinantMustBeKeyConcept: FacetConceptSource = {
  id: 'determinantMustBeKey',
  label: 'Every Determinant Must Be a Key (BCNF Test by Closure)',
  canonicalFacet: 'facet:determinantMustBeKey',

  surface: {
    definition:
      'Growing each determinant\'s closure through the declared dependencies tests whether it is a key: one reaches every column, while one that stops short still decides values, so its pairing repeats across rows.',
    exemplarKeywords: [
      'Boyce-Codd normal form',
      'BCNF',
      'determinant',
      'attribute closure',
      'superkey test',
      'candidate key',
      'every determinant must be a candidate key',
      'BCNF violation that 3NF allows',
      'tutor determines subject',
      'student subject tutor example',
    ],
  },

  briefing: {
    observable: [
      'Table `tutoring` with `student`, `subject`, `tutor` and six rows (Ara math Han, Ara physics Seo, Bo math Han, Bo physics Oh, Cy math Yoon, Dan math Han). A "Declared dependencies" box lists FD1 `student, subject → tutor` and FD2 `tutor → subject`.',
      'Two determinant panels each show the three columns. The first round seeds `student, subject`: "Seed: student, subject." ("Reached: 2 / 3"), then "FD1 applies. Added: tutor. Reached: 3 / 3." and the panel is marked "Key".',
      'The second round seeds `tutor` ("Reached: 1 / 3"), then "FD2 applies. Added: subject. Reached: 2 / 3.", then "No dependency adds more. Not reached: student." The `student` column is marked "not reached" and the panel "Not a key".',
      'The last step marks the pairing the non-key determinant decides: "Repeated pairs: Han · math. Rows: 3." — the rows of Ara, Bo and Dan. The other tutor pairs appear once each here, but would repeat the same way as a tutor gains students.',
      'Dependencies are declared, not discovered from rows, and the closure applies them in the order written. The table\'s candidate keys are (student, subject) and (student, tutor); because `subject` is part of a candidate key, 3NF permits FD2, so this repetition survives 3NF. The screen does not show that point or footnote these premises.',
    ],

    screen: {
      affordances: [
        'The screen plays its seven steps by itself and stops on the repeated Han · math rows.',
        'A Replay button and a playback strip sit below it. Setting the two panels side by side at the stop — "Reached: 3 / 3 · Key" against "Reached: 2 / 3 · Not a key" — is the comparison the screen builds toward.',
      ],
    },

    useWhen: [
      'The article defines BCNF and needs the test itself carried out: grow what a determinant decides until nothing more is added, and see whether it covers the whole table.',
      'A reader asks why BCNF is stricter than 3NF; a table where the non-key determinant `tutor` still repeats its subject, though every column is part of some candidate key, is the case to show.',
      'The article teaches attribute closure as a method and wants each dependency application counted as it adds a column.',
    ],

    avoidWhen: [
      'The article is about how to decompose into BCNF or the dependency that decomposition can no longer preserve. Nothing is split here.',
      'The subject is finding all candidate keys algorithmically. Only the two declared determinants are grown.',
      'The point is multivalued dependencies or 4NF. Only functional dependencies are used.',
    ],

    contrastWith: [
      {
        concept: 'partialDependency',
        note: 'Partial dependency is judged by where a determined column is attached to the key. BCNF ignores the determined side and asks only whether the determining side is a key, which is why it catches cases the key-part test does not.',
      },
      {
        concept: 'transitiveDependency',
        note: 'A transitive chain is one way a non-key column comes to determine another. The key test covers it and more, including a determinant whose target is itself part of a key.',
      },
      {
        concept: 'normalForms',
        note: 'Testing whether each determinant is a key diagnoses a BCNF violation. Fixing it by splitting the table can leave a dependency that no single table holds anymore, a cost the diagnosis alone does not show.',
      },
      {
        concept: 'primaryKeyIdentifies',
        note: 'A key picks out one row when called by its value. Here being a key is established another way: by what its declared dependencies let it determine.',
      },
    ],
  },
};
