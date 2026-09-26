/**
 * linesCoveredBranchNot 개념 선언.
 *
 * canonical facet 은 `facet:linesCoveredBranchNot` — 시험 `price(50, true)` 하나가 다섯 줄 함수를 지나가며 줄에서
 * 줄로 건너간 길이 하나씩 그어진다. 줄 계기는 4/4 = 100% 로 차지만 갈래 계기는 1/2 = 50% 에 머문다. 비어 있는
 * 갈래는 줄 3 → 줄 5 로 곧장 가는 거짓 쪽 길이고, 그 길에는 제 줄이 없다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `branchCoverage` 는 계기 넷을 시험 수로 견준다. 형제 `linesYouSteppedOn` 은 줄 위에 쌓이는 표시를,
 * `whichConditionDecided` 는 묶인 조건의 짝을, `pathExplosion` 은 결정이 이어질 때의 길 수를 쥔다. 이쪽은
 * **if 의 한 결과가 제 줄을 갖지 않아 줄을 다 밟아도 드러나지 않는다** 하나를 쥔다. 그래서 definition 은
 * branch coverage · outcome · if without else · edge · no line of its own 을 독점하고, hit count · loop · pair ·
 * paths multiply · mutant 를 쓰지 않는다.
 *
 * 전제 (설명 글 `linesCoveredBranchNot.md`):
 *  - 갈래는 `if` 하나의 참 · 거짓 두 결과만 센다. 조건이 묶인 결정은 다루지 않는다.
 *  - `function` 정의 줄은 세지 않는다 (센 줄 넷).
 *  - 코드는 어느 한 언어도 아닌 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const linesCoveredBranchNotConcept: FacetConceptSource = {
  id: 'linesCoveredBranchNot',
  label: 'Full Line Coverage, Half Branch Coverage',
  canonicalFacet: 'facet:linesCoveredBranchNot',

  surface: {
    definition:
      'Branch coverage counts the if outcomes a test took; an if without else has a false outcome with no line of its own, so executing every line can still leave it untaken.',
    exemplarKeywords: [
      'branch coverage',
      '100% line coverage but 50% branch coverage',
      'if without else',
      'missing else branch not tested',
      'decision coverage',
      'edge coverage control flow',
      'untaken branch',
      'line coverage vs branch coverage',
      'coverage.py --branch partial branch',
      'istanbul branches column',
    ],
  },

  briefing: {
    observable: [
      'The five-line function `price(amount, member)` — `let cost = amount`, `if member`, `cost = cost - 10`, `return cost` — sits beside a column of nodes, one per counted line (2, 3, 4, 5), with the possible moves between them drawn faintly. Line 3 has two exits labelled "true side" and "false side". The test is `price(50, true)`.',
      'Two gauges run side by side under the same run: "Lines stepped on" x/4 and "Branches taken" x/2, both starting at 0.',
      'Each step walks one move and draws it solid: "Enters the function: line 2", then "Walks: line 2 → line 3" with "Branch picked: true side (line 3)", then line 3 → line 4, then line 4 → line 5. Lines climb 1/4, 2/4, 3/4, 4/4; Branches reaches 1/2 on the step at line 3 and stays there.',
      'The last step shows "→ 40" beside the test and "Lines 4/4 = 100% · branches 1/2 = 50% · Never walked: line 3 → line 5 (false side)".',
      'The move left undrawn goes straight from `if member` to `return cost`. Line 5 was reached anyway through the true side, so no line on the screen is empty — the gap exists only as a missing move.',
      'Branches here are the two outcomes of the single `if`; there is no compound condition. The `function` line is not counted. The code is a language-neutral notation, not any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the single test by itself, one move per step, and stops on the two percentages.',
        'A Replay button and a playback strip sit below it. Holding the strip on the last step keeps 4/4 and 1/2 side by side with the undrawn false-side move.',
        'The function and the test are fixed; nothing adds a second test. An article can quote `price(50, true)`, the returned 40 and both fractions as shown.',
      ],
    },

    useWhen: [
      'The article explains why a report can show every line green and still flag a partial branch, and needs the exact shape that causes it: an if with no else.',
      'A reader thinks branch coverage is just line coverage counted differently; the untaken move that has no line to land on shows what the second measure sees that the first cannot.',
      'The claim is that the forgotten case is the one where nothing happens — here a non-member paying full price — and that it is invisible until outcomes rather than lines are counted.',
    ],

    avoidWhen: [
      'The article is about `and` / `or` conditions and whether each one affects the result. The only condition here is a single boolean.',
      'The subject is how many tests every combination of decisions would need. There is one decision.',
      'The point is lines run repeatedly or hit counts. There is no loop and each line is visited once.',
    ],

    contrastWith: [
      {
        concept: 'linesYouSteppedOn',
        note: 'Statement coverage is complete once every statement has been reached. Branch coverage asks also for every way out of each decision, which can be missing even when no statement is.',
      },
      {
        concept: 'whichConditionDecided',
        note: 'Branch coverage is satisfied once a decision has come out true and false. MC/DC asks further that each condition inside a compound decision be shown to flip the result by itself.',
      },
      {
        concept: 'pathExplosion',
        note: 'Branch coverage needs each outcome of each decision once. Path coverage needs every combination of outcomes along the way, which multiplies instead of adding.',
      },
      {
        concept: 'branchCoverage',
        note: 'The gap between line and branch coverage for one test is a single step on a longer ladder of measures. Comparing them all on a growing suite asks which measure fills when, and what each full one still misses.',
      },
      {
        concept: 'branchTakeOnePath',
        note: 'That only one side of an if runs on a given input is a fact about execution. Branch coverage turns it into a testing requirement: the side not run needs a test of its own.',
      },
    ],
  },
};
