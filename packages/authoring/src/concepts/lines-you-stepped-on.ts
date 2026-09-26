/**
 * linesYouSteppedOn 개념 선언.
 *
 * canonical facet 은 `facet:linesYouSteppedOn` — 시험 `total([3, 5])` 하나가 일곱 줄 함수를 지나가며 밟은 줄마다
 * 표시가 하나씩 쌓인다. 반복 안의 줄 3 · 4 · 6 은 표시가 1 → 2 로 오르지만 표시된 줄 수는 4 에서 그대로이고,
 * `throw BadValue`(줄 5)는 끝까지 비어 남는다. 끝 걸음에 표시된 줄 5 / 센 줄 6 = 83%. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `branchCoverage` 는 계기 넷을 시험 수로 견준다. 형제 `linesCoveredBranchNot` 은 줄 사이의 **건너감**을 센다.
 * 이쪽은 **줄 위에 쌓이는 표시** 하나만 쥔다 — 한 줄을 몇 번 지났는가(hit count)와 몇 줄을 지났는가(covered)가
 * 다른 수라는 것. 그래서 definition 은 statement coverage · executed · hit count · loop · 분수 낱말을 독점하고,
 * branch · outcome · pair · path · mutant · metric 비교 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `linesYouSteppedOn.md`):
 *  - 한 줄에 문이 하나라 문을 줄로 센다. 한 줄에 문이 여럿이면 줄 수와 문 수가 갈린다.
 *  - `function` 정의 줄은 세지 않는다. `for each` 줄은 항목을 하나 꺼낼 때마다 한 번 밟힌다(끝 확인은 세지 않는다) —
 *    실제 도구는 이 줄을 세는 방식이 저마다 다르다.
 *  - 코드는 어느 한 언어도 아닌 가상 표기(`tasks/pseudo-notation.md`)다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const linesYouSteppedOnConcept: FacetConceptSource = {
  id: 'linesYouSteppedOn',
  label: 'Statement Coverage (Executed Lines and Hit Counts)',
  canonicalFacet: 'facet:linesYouSteppedOn',

  surface: {
    definition:
      'Statement coverage records each statement a test executes and reports executed statements over all statements; a loop re-running a line raises its hit count without adding to the executed total.',
    exemplarKeywords: [
      'statement coverage',
      'what does line coverage measure',
      'executed lines',
      'hit count per line',
      'lines covered vs times executed',
      'uncovered line in a coverage report',
      'error path never tested',
      'coverage percentage calculation',
      'gcov line counts',
      'coverage.py line report',
    ],
  },

  briefing: {
    observable: [
      'A seven-line function stands with a mark column beside each line: `function total(list)`, `let sum = 0`, `for each x in list`, `if x < 0`, `throw BadValue`, `sum = sum + x`, `return sum`. Above it, "Test" and `total([3, 5])`; every mark starts at 0, and a counter reads "Marked lines: 0 / 6".',
      'An execution cursor steps one line at a time, and each line it lands on gains one mark. The order is lines 2, 3, 4, 6, then 3, 4, 6 again for the second item, then 7 — eight steps in all.',
      'On the second pass the captions read "Stepped on line 3 again. Marks on it: 2" and so on for lines 4 and 6: their marks go from 1 to 2 while "Marked lines" stays at 4 / 6 for three steps in a row.',
      'Because both 3 and 5 fail `x < 0`, line 5 `throw BadValue` is never stepped on; at the end it still shows 0 and is labelled "never stepped".',
      'The last step shows "Returned: 8" and the tally "Lines with a mark / lines counted = 5 / 6 = 83%". Final marks per line: 2:1, 3:2, 4:2, 5:0, 6:2, 7:1.',
      'The counting rules, which the screen does not footnote: the `function` line is not counted, leaving six. There is one statement per line, so counting lines here equals counting statements. The `for each` line is counted once per item taken; the final check that finds no more items is not counted, and real tools differ on how they count such a line. The code is a language-neutral notation, not any one real language; percentages are rounded only for display.',
    ],

    screen: {
      affordances: [
        'The screen plays the run by itself, one line per step, and stops at the tally.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the fifth step holds the moment line 3 gets its second mark while the marked-line count does not move.',
        'The function, the test and every count are fixed, so an article can quote the step order, the per-line marks and the final 5 / 6 exactly.',
      ],
    },

    useWhen: [
      'The article defines statement or line coverage and needs to show what "executed" means in practice: a mark per line visited, then a fraction of lines with any mark.',
      'A reader confuses how often a line ran with whether it ran at all; the loop lines climbing to 2 while the marked-line count stays at 4 separate the two numbers.',
      'The claim is that an uncovered line is usually an unhandled case — here the throw for a negative input — rather than dead code.',
    ],

    avoidWhen: [
      'The article is about branch outcomes, decisions taken both ways or conditions inside an if. The screen counts lines only and never records which way the if went.',
      'The subject is profiling or hot spots by execution count. The marks here only exist to separate "ran" from "ran twice"; nothing is timed.',
      'The reader is meant to add a second test and watch the gap close. One test runs, and line 5 stays empty.',
    ],

    contrastWith: [
      {
        concept: 'linesCoveredBranchNot',
        note: 'Statement coverage counts places the run arrived at. Branch coverage counts the moves between places, including a move that lands on no statement of its own, so it can stay short when every statement has been reached.',
      },
      {
        concept: 'branchCoverage',
        note: 'Here there is one measure and one test, and the question is how the number is formed. Comparing several measures across a growing suite asks instead which measure fills first and what a full one fails to say.',
      },
      {
        concept: 'loopBack',
        note: 'A loop returning to its condition is what makes lines run again. For coverage that repetition only raises a count; whether a line was covered depends on its first visit alone.',
      },
    ],
  },
};
