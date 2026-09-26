/**
 * normalForms 개념 선언.
 *
 * canonical facet 은 `facet:normalForms` — 수강 표 하나(학생 넷 · 과목 둘 · 1NF 줄 여덟)를 UNF · 1NF · 2NF · 3NF · BCNF
 * 로 떼어 간다. 손잡이 둘 — 단계(처음 1NF)와 고칠 사실(title ← subject = 'chem' · office ← major = 'Bio' ·
 * subject ← tutor = 'Kwon', 처음 title). 한 판 걸음 넷: 표 자리 · 고칠 줄 · 찾은 줄 · 종속의 집. 계기 넷 — 표 수 ·
 * 고칠 줄 · 찾은 줄 · 잃은 종속. 사실마다 고칠 줄이 1 로 떨어지는 단계가 다르고(title 2NF · office 3NF · subject BCNF),
 * BCNF 에서 FD1 이 어느 한 표에도 담기지 않는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각 다섯은 각각 한 장면이다 — 사본이 갈라지는 사건(`updateAnomaly`) · 목록 칸이 풀려 나옴(`atomicCell`) ·
 * 열쇠 한쪽에 매달린 열(`partialDependency`) · 가운데 열을 건너 매달린 열(`transitiveDependency`) ·
 * 정하는 쪽이 열쇠인가를 번짐으로 판정(`determinantMustBeKey`). 이쪽은 **단계 손잡이를 돌릴 때 고칠 줄 수가
 * 어떻게 갈리는가**와 마지막 단계의 값(지킬 수 없게 된 종속)을 쥔다. 그래서 definition 은 UNF · BCNF · 단계 ·
 * 고칠 줄 수 · 어느 한 표에도 담기지 않는 종속을 쥐고, 조각들이 독점한 old value · two answers · list in one cell ·
 * part of the key · through an intermediate · closure 를 쓰지 않는다.
 *
 * 전제 (설명 글 `normalForms.md`): 함수 종속은 선언이다(줄에서 찾지 않는다, 어긋나면 멈춘다) · 단계마다의 표는
 * 여러 분해 가운데 하나를 고른 것 · 떼어 낸 표의 줄 차례는 처음 나온 차례 · 화면의 조건식은 SQL 그대로
 * (`@notation native`) · 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이고 표를 짓지 않고 센다 · 표와 값은 예로 정한 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const normalFormsConcept: FacetConceptSource = {
  id: 'normalForms',
  label: 'Normal Forms (UNF to BCNF, Rows to Edit per Fact)',
  canonicalFacet: 'facet:normalForms',

  surface: {
    definition:
      'Decomposing one table stage by stage from UNF through 1NF, 2NF and 3NF to BCNF shrinks the rows an edit to one fact must touch, each fact reaching one row at a different stage, while BCNF leaves a dependency no single table holds.',
    exemplarKeywords: [
      'database normalization',
      'normal forms',
      '1NF 2NF 3NF BCNF',
      'Boyce-Codd normal form',
      'decompose a table',
      'normalize a schema step by step',
      'dependency preservation',
      'BCNF loses a functional dependency',
      'unnormalized form',
      'why normalize tables',
      'redundancy and normalization',
    ],
  },

  briefing: {
    observable: [
      'One enrollment table with seven columns — `student`, `major`, `office`, `subject`, `title`, `tutor`, `grade` — and eight rows in 1NF (students Lia, Max, Noa, Oli, each taking `chem` and `draw`). Five declared dependencies sit beside it: FD1 `student, subject → tutor, grade`, FD2 `subject → title`, FD3 `student → major`, FD4 `major → office`, FD5 `tutor → subject`.',
      'The Stage handle lays out that stage\'s tables side by side: UNF one `enrollment` table whose last four columns hold comma-joined lists (four groups instead of eight rows), 1NF one table, 2NF three (`enrollment`, `student`, `subject`), 3NF four (a `major` table splits off), BCNF five (a `tutor` table splits off). Raising the stage makes columns drop into their own table and equal rows fold into one; lowering it unfolds them back.',
      'Each round has four steps. Step 0 places the tables and shows the fact to fix and a condition such as `subject = \'chem\'`. Step 1 lights the rows that record the fact in the first table holding both columns — "Fact title ← subject = \'chem\' · held in enrollment · rows to fix: 4" in the default round.',
      'Step 2 outlines the rows the condition finds. In 1NF and later this always equals the rows to fix. In UNF a list cell is compared whole — "A list cell is compared whole: \'chem, draw\' ≠ \'chem\'" — so title and subject find 0 rows while 4 and 3 need fixing.',
      'Step 3 seats each dependency under the first table that holds all its columns. At BCNF FD1 finds no such table and drops to a "No home table" row: "Dependencies with a home table: 4 · lost: 1".',
      'Rows to fix per stage, UNF / 1NF / 2NF / 3NF / BCNF: title 4, 4, 1, 1, 1; office 2, 4, 2, 1, 1; subject 3, 3, 3, 3, 1. So title reaches one row at 2NF, office at 3NF, and subject ← tutor only at BCNF. Going from UNF to 1NF raises office from 2 to 4, because each student\'s single group spreads into one row per course.',
      'Dependencies are declared, not discovered from the rows; the rows are only checked not to contradict them. The table set at each stage is one chosen decomposition among several possible ones, and split-off tables keep the first occurrence of equal rows in first-seen order. The condition is written as SQL. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Stage", a five-position slider UNF, 1NF, 2NF, 3NF, BCNF (starting at 1NF), and "Fact to fix", three positions `title`, `office`, `subject` (starting at `title`). Each round plays its four steps, then waits for a handle.',
        'The move that makes the idea land is fixing one fact and stepping the stage upward: the lit rows fold from several to one at the stage that splits that fact\'s columns out. Then switching the fact shows the mark move to a different table and a different stage.',
        'Four readouts under the controls: Tables, Rows to fix, Rows found, Lost dependencies.',
        'The code panel, labelled "Rows to fix · lost dependencies", starts empty with a "+ Add language" button. The chosen language shows `rowsToFix`, which counts the rows from the 1NF rows and a column mask without building any table, and `lostDependencies`, and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article walks through 1NF, 2NF, 3NF and BCNF as a sequence and needs one table carried through every stage, with a count showing what each stage actually buys.',
      'A reader wants to know why the normal forms are distinct steps rather than one rule; three facts that each collapse to a single row at a different stage answer that.',
      'The article raises the cost of BCNF — that a dependency can end up spread over tables so no single table enforces it — and needs the moment it happens beside what was gained.',
    ],

    avoidWhen: [
      'The article is about denormalizing for read speed or the cost of joins. Nothing here measures queries or joins; only rows to edit and dependency homes are counted.',
      'The subject is 4NF, 5NF, multivalued or join dependencies. The stages stop at BCNF and every dependency is a functional one.',
      'The point is an algorithm that finds candidate keys or derives a decomposition. The tables at each stage are given, not computed.',
    ],

    contrastWith: [
      {
        concept: 'updateAnomaly',
        note: 'An update anomaly is the failure itself: copies that disagree after an edit touches only some of them. Normalization is the remedy measured stage by stage, as the number of copies a single fact is stored in.',
      },
      {
        concept: 'atomicCell',
        note: 'One value per cell is the entry condition for 1NF and is about whether a condition can match at all. The later forms assume it and ask how many rows repeat a fact.',
      },
      {
        concept: 'partialDependency',
        note: 'Removing columns fixed by part of a composite key is the single move that defines 2NF; the progression places that move among the others and shows which facts it settles and which it leaves.',
      },
      {
        concept: 'transitiveDependency',
        note: 'Removing a column reached through a non-key column is the move that defines 3NF. Seen alone it is one split; in sequence it is the step after which some facts are settled and one still is not.',
      },
      {
        concept: 'determinantMustBeKey',
        note: 'Requiring every determinant to be a key is the BCNF test. The progression adds what meeting it costs: a dependency that no longer fits inside any one table.',
      },
      {
        concept: 'relationalTablesAndKeys',
        note: 'Tables and keys are the structure normalization works on. Normalization asks how to divide columns among tables so each fact is stored once.',
      },
      {
        concept: 'nestedDocument',
        note: 'Embedding related data inside one record is a deliberate return toward repetition for the sake of reading it together; normalization moves the other way, trading that locality for single copies.',
      },
    ],
  },
};
