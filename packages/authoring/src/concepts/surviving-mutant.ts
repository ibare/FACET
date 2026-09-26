/**
 * survivingMutant 개념 선언.
 *
 * canonical facet 은 `facet:survivingMutant` — 원본 `grade(score)` 에 시험 둘(T1 `grade(90) == "pass"` ·
 * T2 `grade(30) == "fail"`)을 돌려 통과를 보인 뒤, 한 자리를 바꾼 사본 셋(M1 `<=` · M2 `return "pass"` · M3 `>`)에
 * 시험을 차례로 돌린다. M1 은 T1 에, M2 는 T2 에 잡혀 죽고, M3 은 둘 다 통과해 살아남는다. 끝 걸음 변이 점수 2/3 = 67%.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `branchCoverage` 는 변이 점수를 계기 넷 가운데 마지막으로 두고 시험 수로 견준다. 이쪽은 **사본 하나하나에
 * 시험이 달려들어 죽거나 사는 판정** 과, 살아남은 사본이 가리키는 빠진 시험(경계값)을 쥔다. 그래서 definition 은
 * mutation testing · mutant · killed · survives · copy with one small change 를 독점하고, line · branch · pair ·
 * path · 계기 비교 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `survivingMutant.md`):
 *  - 변이 셋은 예로 고른 것이다. 실제 도구는 연산자 · 상수 · 돌려주는 값마다 변이를 여럿 자동으로 만든다.
 *  - 한 변이에 시험 하나가 떨어지면 남은 시험을 건너뛴다 — 도구들이 흔히 쓰는 방식.
 *  - 원본의 커버리지가 가득 찼다는 것(줄 3/3 · 갈래 2/2)은 설명 글이 말하고 화면에는 계기가 없다.
 *  - 코드는 어느 한 언어도 아닌 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const survivingMutantConcept: FacetConceptSource = {
  id: 'survivingMutant',
  label: 'Mutation Testing (Killed and Surviving Mutants)',
  canonicalFacet: 'facet:survivingMutant',

  surface: {
    definition:
      'Mutation testing reruns the tests on copies of the code each changed in one place; a failing test kills the copy, and one passing every test survives, exposing behaviour left unchecked.',
    exemplarKeywords: [
      'mutation testing',
      'mutant killed',
      'surviving mutant',
      'mutation score',
      'mutation operator',
      'relational operator mutation >= to >',
      'Stryker',
      'PIT pitest',
      'mutmut',
      'are my tests actually checking anything',
      'missing boundary value test',
    ],
  },

  briefing: {
    observable: [
      'Four copies of a four-line function stand side by side: the Original `grade(score)` — `if score >= 60`, `return "pass"`, `return "fail"` — and three mutants, each with one line changed and its line number shown: M1 "Line 2" `if score <= 60`, M2 "Line 4" `return "pass"`, M3 "Line 2" `if score > 60`. Above them, the tests T1 `grade(90) == "pass"` and T2 `grade(30) == "fail"`. The opening caption reads "Copies with one line changed: 3. No test has run yet."',
      'Each step runs one test against one copy and writes the result under it. The Original goes first: T1 gets "pass", T2 gets "fail", both as expected.',
      'M1: T1 gets "fail" where "pass" was expected — "fails. Caught — remaining tests skipped." M1 is marked Killed and its T2 slot says "skipped".',
      'M2: T1 passes ("Next test."), then T2 gets "pass" where "fail" was expected, and M2 is Killed.',
      'M3: T1 gets "pass", T2 gets "fail", both as expected — "Every test passed — it survives." M3 is marked Survived.',
      'The last step reads "Killed: 2 · Survived: 1 · Mutation score: 2/3 = 67%".',
      'Background the screen does not footnote: the three mutants are chosen examples; real tools such as Stryker or PIT generate many automatically, per operator, constant and return value. Skipping a mutant\'s remaining tests after the first failure is a common tool behaviour. The original\'s line and branch coverage are already full with these two tests, but no gauge for them is on the screen. The code is a language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one test on one copy per step, and stops on the mutation score.',
        'A Replay button and a playback strip sit below it. Holding the strip on the M3 T2 step shows the surviving copy with both tests passed beside the two killed ones.',
        'The function, both tests and the three mutants are fixed, so an article can quote each changed line and each result string exactly.',
      ],
    },

    useWhen: [
      'The article introduces mutation testing and needs one complete, small run: the original passes, one mutant dies on the first test, one on the second, one survives both.',
      'A reader believes passing tests on fully covered code prove the code is checked; the survivor M3, which only an input of exactly 60 could tell apart, shows the missing boundary test.',
      'The article explains how a mutation score is computed and why a surviving mutant is a pointer to a specific missing test rather than a bug in the code.',
    ],

    avoidWhen: [
      'The article is about fault injection in running systems or chaos engineering. The changes here are to source code, judged by unit tests.',
      'The subject is how coverage tools count lines or branches. No coverage gauge appears on the screen.',
      'The reader is meant to add the missing test and watch the survivor die. The tests are fixed at two; M3 stays alive.',
      'The point is equivalent mutants that no test can ever kill. M3 differs from the original at score 60, so it is killable.',
    ],

    contrastWith: [
      {
        concept: 'branchCoverage',
        note: 'Mutation testing on its own judges tests by the changed copies they catch. Setting a mutation score beside line, branch and condition measures on the same tests is about showing the structural ones can all be full while mutants still survive.',
      },
      {
        concept: 'linesCoveredBranchNot',
        note: 'Branch coverage asks whether each outcome of a decision was taken. Mutation testing asks whether taking it was checked: a mutant that moves the boundary survives while every outcome is still being taken.',
      },
      {
        concept: 'whichConditionDecided',
        note: 'MC/DC demands structural evidence that each condition can flip a decision. Mutation testing demands behavioural evidence that the tests notice when a condition is altered; the two ask for different tests.',
      },
    ],
  },
};
