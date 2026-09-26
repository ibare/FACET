/**
 * pathExplosion 개념 선언.
 *
 * canonical facet 은 `facet:pathExplosion` — 서로 독립인 결정 `d1`..`d10` 을 차례로 지날 때마다 길의 수가
 * 2 · 4 · … · 1024 로 곱절이 되고, 같은 걸음에 갈래 칸은 2 · 4 · … · 20 으로 둘씩만 늘며, 갈래를 채우는 시험은
 * 끝까지 2(모두 참 · 모두 거짓)다. 끝 걸음에 2 와 1024 를 나란히 둔다. 코드 글자는 없다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `branchCoverage` 는 결정이 하나라 길이 둘뿐이고, 계기 넷을 시험 수로 견준다. 형제 `linesCoveredBranchNot`
 * 은 결정 하나의 빠진 결과, `whichConditionDecided` 는 결정 하나 안의 조건 짝을 쥔다. 이쪽은 **결정 여럿이 이어질 때
 * 길이 곱해지고 갈래는 더해진다** 하나를 쥔다. 그래서 definition 은 path coverage · independent decisions ·
 * doubles · 2^n · grows by two 를 독점하고, line · executed · pair · condition · mutant 를 쓰지 않는다.
 *
 * 전제 (설명 글 `pathExplosion.md`):
 *  - 결정 열은 서로 독립이라 둔다 — 어느 조합으로도 끝까지 간다. 실제 코드에서는 갈 수 없는 길이 섞여 2 의
 *    거듭제곱보다 적어진다.
 *  - 결정의 내용은 주장 밖이라 코드 글자를 두지 않았다.
 *  - 길은 수식이 아니라 실제로 늘어놓아 센다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pathExplosionConcept: FacetConceptSource = {
  id: 'pathExplosion',
  label: 'Path Explosion (Path Coverage vs Branch Coverage)',
  canonicalFacet: 'facet:pathExplosion',

  surface: {
    definition:
      'Path coverage requires every combination of decision outcomes; across independent decisions the path count doubles at each one, while branch coverage adds only two outcomes and two tests still satisfy it.',
    exemplarKeywords: [
      'path coverage',
      'path explosion',
      'exponential number of paths',
      '2^n paths',
      'why 100% path coverage is impractical',
      'path coverage vs branch coverage',
      'sequential if statements combinations',
      'infeasible paths',
      'symbolic execution path explosion',
      'basis path testing',
    ],
  },

  briefing: {
    observable: [
      'The screen starts from a single root line with ten decision columns ahead, labelled `d1` to `d10`, and a caption "Start — Paths: 1 · Branches: 0 · Branch tests: 0". There is no code on the screen; the decisions are named only.',
      'Each step passes one decision, and every path end splits in two, true and false: "Passed d1 — Paths: 2 · Branches: 2 · Branch tests: 2", then 4, 8, 16, 32, 64, 128, 256, 512, 1024. The fan grows denser to the right until it reads as a solid surface.',
      'Each decision band carries two numbers: above it, on the Paths row, the number of paths after it; below it, on the Branches row, two branch slots and the running branch count. They read 2 and 2 at `d1`, 8 and 6 at `d3`, 64 and 12 at `d6`, 1024 and 20 at `d10` — the upper row doubles per band, the lower adds two.',
      'Two thick lines, "all true" along the top edge of the fan and "all false" along the bottom, cover every branch slot from the first decision on; "Branch tests" stays at 2 for the whole run.',
      'Paths first pass a thousand at `d10` (512 at `d9`). The last step sets the totals side by side: "Tests to cover every branch: 2 · Tests to walk every path: 1024".',
      'The screen assumes the ten decisions are independent, so every combination can run to the end. In real code one decision often constrains another and some paths are infeasible, so the true count is below the power of two; the multiplication comes from independent decisions in sequence. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one decision per step, and stops on the two totals.',
        'A Replay button and a playback strip sit below it. Dragging the strip back and forth shows the number above each band doubling while the number below creeps up by two.',
        'Ten decisions and every count are fixed, so an article can quote any column pair, such as 512 and 18 at `d9`, exactly.',
      ],
    },

    useWhen: [
      'The article explains why tools stop at branch coverage and treat full path coverage as impractical, and needs the growth of the two requirements side by side for the same code.',
      'A reader wonders why two tests can satisfy branch coverage for ten ifs; the all-true and all-false lines covering every slot show it directly.',
      'The article discusses symbolic execution or exhaustive testing and needs a concrete picture of how quickly paths multiply with independent decisions.',
    ],

    avoidWhen: [
      'The article is about loops making the number of paths unbounded. There are no loops here, only ten decisions in a row.',
      'The subject is conditions combined inside one if, or which condition decides it. Each decision here is a single, unnamed outcome pair.',
      'The reader needs code to trace. The decisions have no content on the screen.',
      'The point is counting combinations in general, as in combinatorics exercises. The counts here are about tests needed for a program.',
    ],

    contrastWith: [
      {
        concept: 'linesCoveredBranchNot',
        note: 'Missing one outcome of one decision is a gap branch coverage catches. Covering every outcome of every decision still leaves nearly all the combinations of those outcomes untested, which is the gap path coverage names.',
      },
      {
        concept: 'whichConditionDecided',
        note: 'The independence-pair rule stays inside one decision and needs only a few tests per condition. Path coverage spans decisions in sequence, and its demand multiplies with each one.',
      },
      {
        concept: 'branchCoverage',
        note: 'Comparing coverage measures asks which one a growing suite fills first. Path explosion explains why the strictest structural measure stays out of that ladder: with many decisions in a row, no small suite reaches it.',
      },
    ],
  },
};
