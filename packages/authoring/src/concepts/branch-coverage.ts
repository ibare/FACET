/**
 * branchCoverage 개념 선언.
 *
 * canonical facet 은 `facet:branchCoverage` — 대상 함수 `fee(age, member)` 다섯 줄에 시험 넷(T1..T4, 이 차례가 데이터)을
 * 앞에서부터 n 개 돌리고, 네 계기(줄 · 갈래 · 조건 가름 · 변이 점수)를 판마다 셈한다. 손잡이 "시험 수" 1~4(처음 2)를
 * 올리면 가득 차는 계기가 줄 → 갈래 → 조건 가름 → 변이 점수로 한 칸씩 옮겨 간다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯, 버린 토픽의 조각 하나는 contrastWith 로만)
 *
 * 조각 다섯은 각각 한 장면이다 — 줄에 쌓이는 표시(`linesYouSteppedOn`) · 제 줄이 없는 갈래(`linesCoveredBranchNot`) ·
 * 한 조건만 다른 두 시험의 짝(`whichConditionDecided`) · 곱절로 불어나는 길(`pathExplosion`) · 죽고 사는 사본(`survivingMutant`).
 * 이쪽은 그 계기들을 **같은 시험 모음에 한꺼번에 대고 시험 수를 돌려 견주는 것**을 맡는다. 그래서 definition 은
 * 계기 넷의 이름 · 시험을 하나씩 더함 · 차는 차례 · 얕은 계기가 깊은 계기를 말해 주지 않음을 쥐고, 조각들이 독점한
 * hit count · loop · edge without its own line · independence pair · doubles · survives · shrink 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `branchCoverage.md` 가 밝힌 것):
 *  - 줄 하나에 문 하나라 여기서는 줄 커버리지와 구문 커버리지가 같다. 구문 커버리지는 문 단위다.
 *  - 조건 가름은 변형 조건 · 결정 커버리지(MC/DC)의 짝 셈이다. 조건값은 입력이 정한다(단락 평가와 무관).
 *  - 변이 다섯은 예로 고른 것이다. 실제 도구는 연산자마다 변이를 여럿 만든다.
 *  - 시험 차례는 데이터다. 차례가 바뀌면 계단 모양이 뭉개진다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다. 조건 가름 · 변이 판정은 IR 밖이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const branchCoverageConcept: FacetConceptSource = {
  id: 'branchCoverage',
  label: 'Coverage Metrics Compared (Line, Branch, MC/DC, Mutation Score)',
  canonicalFacet: 'facet:branchCoverage',

  surface: {
    definition:
      'Line, branch, MC/DC and mutation-score metrics measure one growing test suite at different depths; adding tests fills them in that order, so a full shallower metric says nothing about a deeper one.',
    exemplarKeywords: [
      'code coverage metrics compared',
      'is 100% line coverage enough',
      'line coverage vs branch coverage vs mutation score',
      'test adequacy criteria',
      'coverage is not test quality',
      'how many tests are enough',
      'coverage.py --branch',
      'istanbul nyc coverage report',
      'Stryker mutation score',
      'coverage percentage misleading',
      'boundary value test catches what coverage misses',
    ],
  },

  briefing: {
    observable: [
      'On the left, the target function `fee(age, member)` in five numbered lines: `let f = 10`, `if age >= 65 and member`, `f = f - 5`, `return f`. Beside line 3 sit two slots, `true` and `false`, and a running value `f = 10` or `f = 5`. Below, a Conditions box holds A `age >= 65` and B `member`.',
      'On the right, four tests in a fixed order — T1 `fee(70, true) == 5`, T2 `fee(30, true) == 10`, T3 `fee(70, false) == 10`, T4 `fee(65, true) == 5` — each marked waiting, running, "pass: 5" or "not used", and five mutant cards M1–M5, each showing the changed line (for example M1 "line 3 · if age > 65 and member", M3 "line 4 · f = f + 5") and marked "survived" or "killed ← T1".',
      'Four gauge bars carry the round: Lines x/4, Branches x/2, Condition pairs x/2, Mutation score x/5. A running test steps through its lines one per step; Lines and Branches rise on those steps. Each test then has a verdict step, where Condition pairs and Mutation score rise and the mutants it caught flip together.',
      'With 1 test: Lines 4/4, Branches 1/2, Condition pairs 0/2, Mutation score 1/5 (M3 killed by T1). With 2: 4/4, 2/2, 1/2 ("pair T1-T2" beside A), 3/5 (M2 and M5 killed by T2). With 3: 4/4, 2/2, 2/2 ("pair T1-T3" beside B), 4/5 (M4 killed by T3). With 4: everything full, M1 killed by T4.',
      'The full gauge moves one place per added test — lines after one, branches after two, condition pairs after three, mutation score after four — and never do two become full on the same test. M1 (`>=` changed to `>`) survives until T4 tests the boundary age 65; ages 70 and 30 give the same answer under both comparisons.',
      'A round is 6 steps for one test, 10 for two, 14 for three and 19 for four; T1 and T4 step on lines 2, 3, 4, 5, while T2 and T3 skip line 4.',
      'The definitions behind the gauges, which the screen does not footnote: the `function` line is not counted; with one statement per line, line coverage equals statement coverage here, though statement coverage counts statements, not lines. Condition pairs are the pair rule of modified condition/decision coverage (MC/DC) — two tests differing only in that condition with opposite decisions — and condition values come from the inputs regardless of short-circuit evaluation. The five mutants are chosen examples; real tools generate many per operator. The test order is fixed data.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a four-position "Tests run" slider (1, 2, 3, 4), starting at 2. Each round replays the chosen number of tests from the start of the list, then waits for the handle. The control bar also shows the four gauges as percentages: Lines %, Branches %, Condition pairs %, Mutation score %.',
        'The move that makes the idea land is stepping the slider from 1 to 4 and watching which gauge reaches full each time: exactly one new gauge fills per added test.',
        'The code panel, labelled "Target function", starts empty with a "+ Add language" button; the chosen language shows `fee` and highlights the line the running test is on. It carries the same function across Python, JavaScript, TypeScript, Java, C++ and C#; the condition pairs and mutant verdicts are worked out beside it, not in it.',
      ],
    },

    useWhen: [
      'The article argues that a coverage percentage is not a measure of test quality and needs one small function where 100% line coverage, then 100% branch coverage, each still leaves something untested.',
      'A reader is choosing between coverage.py or istanbul line and branch reports, MC/DC requirements and a mutation-testing tool, and the article wants the four set against the same four tests so their order of strictness is visible.',
      'The claim is that the missing test is a boundary value: the last surviving mutant falls only when the input sits exactly on 65.',
    ],

    avoidWhen: [
      'The article is about how a coverage tool instruments code or collects data at runtime. Nothing here shows instrumentation; the counts are simply derived from the steps taken.',
      'The subject is path coverage or test counts that grow with many decisions. This function has one decision and two paths.',
      'The point is generating tests automatically or reducing a failing input. The four tests are fixed and hand-written.',
      'The article needs a real project report with files and percentages per module. There is one five-line function.',
    ],

    contrastWith: [
      {
        concept: 'linesYouSteppedOn',
        note: 'Statement coverage alone is about what counts as executed and how the fraction is formed. Setting it beside three stricter measures on the same tests is what shows it is the first to fill and the least informative once full.',
      },
      {
        concept: 'linesCoveredBranchNot',
        note: 'That one test can execute every line and still miss an outcome of an if is the single gap between the first two measures. Here that gap is one rung in a ladder of four, each closed by one more test.',
      },
      {
        concept: 'whichConditionDecided',
        note: 'The independence-pair rule is one criterion with its own proof. In the comparison it sits between branch coverage, which it strictly extends, and the mutation score, which asks about behaviour rather than structure.',
      },
      {
        concept: 'pathExplosion',
        note: 'Path counts multiplying across independent decisions explain why the strictest structural measure is rarely demanded. With a single decision there are only two paths, so the comparison here stays with measures a small suite can satisfy.',
      },
      {
        concept: 'survivingMutant',
        note: 'Killing or sparing each changed copy is how a mutation score is earned. The comparison sets that score beside structural measures, which can all be full while a mutant still survives.',
      },
      {
        concept: 'shrinkToSmallest',
        note: 'Reducing a failing input asks what the smallest counterexample is once a test has failed. Comparing coverage measures asks how much of the code passing tests have exercised, before any test fails.',
      },
    ],
  },
};
