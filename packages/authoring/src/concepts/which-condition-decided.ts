/**
 * whichConditionDecided 개념 선언.
 *
 * canonical facet 은 `facet:whichConditionDecided` — `if age >= 18 and hasTicket` 에 시험 셋(T1 (20, true) ·
 * T2 (15, true) · T3 (20, false))을 차례로 돌리고, 조건마다 "그 조건만 다르고 결정이 뒤집힌 두 시험" 짝을 찾는다.
 * 결정 결과는 T2 에서 이미 2/2 인데 B 는 짝이 없어 남고, T3 이 들어와서야 T1-T3 짝이 선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `branchCoverage` 는 이 짝 셈을 계기 넷 가운데 셋째로 두고 시험 수로 견준다. 형제 `linesCoveredBranchNot`
 * 은 결정의 두 결과, `pathExplosion` 은 결정 여럿의 조합을 쥔다. 이쪽은 **결정 하나 안의 조건 각각** 과 그 증명인
 * 짝을 쥔다. 그래서 definition 은 MC/DC · compound condition · independently · pair of tests differing in only that
 * condition 을 독점하고, line · executed · path · mutant · coverage 계기 비교 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `whichConditionDecided.md`):
 *  - MC/DC 는 **변형** 조건 · 결정 커버리지(Modified Condition/Decision Coverage)다.
 *  - 조건값은 입력이 정한다 — 단락 평가로 T2 의 `hasTicket` 이 읽히지 않아도 입력 값 true 를 둔다. 읽히지 않은
 *    조건을 "상관없음" 으로 두는 더 너그러운 변형도 있다.
 *  - 짝이 여럿이면 돌린 차례로 앞선 짝 하나만 보인다. 조건 둘 · 결정 하나만 다룬다.
 *  - 코드는 어느 한 언어도 아닌 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const whichConditionDecidedConcept: FacetConceptSource = {
  id: 'whichConditionDecided',
  label: 'MC/DC Independence Pairs (Which Condition Decided)',
  canonicalFacet: 'facet:whichConditionDecided',

  surface: {
    definition:
      'MC/DC shows that each condition in a compound decision independently affects its result, by finding two tests that differ in that condition alone and produce opposite decisions.',
    exemplarKeywords: [
      'MC/DC',
      'modified condition/decision coverage',
      'independence pair',
      'unique-cause MC/DC',
      'condition coverage for and / or',
      'compound boolean condition testing',
      'DO-178C level A coverage',
      'short-circuit evaluation and coverage',
      'minimum tests for a two-condition and',
      'decision coverage is not enough for compound conditions',
    ],
  },

  briefing: {
    observable: [
      'The four-line function `canEnter(age, hasTicket)` with one decision, `if age >= 18 and hasTicket`, stands above a table: columns A, B and decision; rows T1 `(20, true)`, T2 `(15, true)`, T3 `(20, false)`. The conditions are named A `age >= 18` and B `hasTicket`. Two counters read "Shown to decide: 0/2" and "Decision outcomes: 0/2".',
      'Running a test fills its row with the condition values and the decision: T1 gives true · true · true ("Decision outcomes: 1/2"); T2 gives false · true · false ("Decision outcomes: 2/2"). After two tests the decision has come out both ways.',
      'A pair step then looks for A: "Pair for A: T1 and T2 differ only in A, and the decision flips." A is marked "decides" with the two rows copied beneath it, and "Shown to decide" goes to 1/2.',
      'The next pair step finds nothing for B: "No pair for B: every test so far has B = true." B is marked "no pair" although both decision outcomes are already on the board.',
      'T3 runs (true · false · false), and the last step reads "Pair for B: T1 and T3 differ only in B, and the decision flips." "Shown to decide" reaches 2/2 with three tests; the combination false · false is never used.',
      'The rules behind the table, which the screen does not footnote: MC/DC is modified condition/decision coverage. Condition values come from the inputs — in T2 `and` stops before reading `hasTicket`, but B still counts as true; some tools instead treat an unread condition as "don\'t care" and match pairs more loosely. When several pairs exist, the first in run order is shown. The code is a language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — three test runs and three pair searches, one per step — and stops once B has its pair.',
        'A Replay button and a playback strip sit below it. Holding the strip on the step where B has no pair keeps "Decision outcomes: 2/2" and "no pair" in view together.',
        'The function, the three inputs and their order are fixed, so an article can quote every row and both pairs as they appear.',
      ],
    },

    useWhen: [
      'The article introduces MC/DC for avionics or other safety standards and needs one worked example of an independence pair: two tests, one condition changed, the decision flipped.',
      'A reader believes that covering both outcomes of `if a and b` tests both conditions; the moment B has no pair while the decision has already gone both ways answers that.',
      'The article explains how short-circuit evaluation interacts with condition coverage, and needs a row where the second condition is never read but still has a value.',
    ],

    avoidWhen: [
      'The subject is whether each line or each if-outcome was reached. Nothing here walks through lines; the code is shown only for the decision.',
      'The article needs the general rule for how many tests n conditions require. Only two conditions and one decision are shown.',
      'The point is operator precedence or boolean algebra simplification. The decision is not rewritten, only tested.',
    ],

    contrastWith: [
      {
        concept: 'linesCoveredBranchNot',
        note: 'Branch coverage asks whether a decision came out true and false. MC/DC looks inside the decision and asks, condition by condition, whether each one alone can flip it — a question branch coverage leaves open.',
      },
      {
        concept: 'pathExplosion',
        note: 'Independence pairs work within one decision and grow roughly with its number of conditions. Covering every path works across decisions and grows with the product of their outcomes.',
      },
      {
        concept: 'branchCoverage',
        note: 'On its own, the pair rule is one criterion with its own proof. Placed among line, branch and mutation measures on a growing suite, it is the one that fills after branches are already complete.',
      },
    ],
  },
};
