/**
 * conditionalNarrowing 개념 선언.
 *
 * canonical facet 은 `facet:conditionalNarrowing` — 주사위 한 개를 두 번 던진 36 가지 결과를 격자로 놓고, A(두 눈의 합 ≥ 10)
 * 6 가지를 표시해 P(A) = 6 / 36 을 세운다. B(첫 눈 ≥ 5) 를 알게 되면 B 밖의 24 가지가 떠나 세상이 12 가지로 좁혀지고,
 * A 였던 (4, 6) 도 함께 떠난다. 남은 세상에서 A 를 다시 세어 P(A | B) = 5 / 12 를 앞의 몫과 나란히 둔다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `bayes` 와 조각 `bayesUpdate` · `baseRate` 는 모두 증거로 믿음을 고치는 쪽이다. 이쪽은 그 밑의 한 장면 —
 * **조건이 분모를 바꾼다** — 만 쥐고, 가능도 · 사전 · 사후 · 검사 같은 낱말을 쓰지 않는다. definition 은 outcomes outside B
 * leave · denominator · recount · equally likely 쪽 낱말을 독점한다.
 *
 * 전제 (설명 글 `conditionalNarrowing.md` 가 밝힌 것):
 *  - 36 가지 결과가 모두 같은 가능성이다 (공정한 주사위, 두 던짐이 서로 무관).
 *  - 문턱 10 과 5 는 예로 정한 값이다. 분수는 무엇을 세었는지 보이려고 기약하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const conditionalNarrowingConcept: FacetConceptSource = {
  id: 'conditionalNarrowing',
  label: 'Conditional Probability: The Condition Shrinks the Denominator',
  canonicalFacet: 'facet:conditionalNarrowing',

  surface: {
    definition:
      'Knowing that B happened removes every outcome outside B, so the probability of A is recounted over the outcomes that remain: P(A | B) = |A ∩ B| / |B| among equally likely outcomes.',
    exemplarKeywords: [
      'conditional probability',
      'probability of A given B',
      'P(A|B)',
      'reduced sample space',
      'given that the first die shows',
      'two dice outcomes grid',
      'intersection over the condition',
      'counting equally likely outcomes',
      'P(A and B) / P(B)',
    ],
  },

  briefing: {
    observable: [
      'A 6 × 6 grid holds the 36 outcomes of rolling one die twice, cells labelled "a,b" along axes "first roll a" and "second roll b", with "World: 36". Two definitions stand beside it: "A: the two rolls sum to at least 10" and "B: the first roll is at least 5".',
      'Mark A: six cells are numbered — (4, 6) (5, 5) (5, 6) (6, 4) (6, 5) (6, 6) — and "P(A) = 6 / 36 = 16.7%" is set up with a strip divided into 36 parts, 6 of them filled.',
      '"Now B is known. Outcomes outside B leave: 24." The wall of the world moves in to B\'s first column, the 24 cells with a first roll below 5 drop away one after another, and the World count falls from 36 to 12. "Leaving from A as well: (4, 6)" — that cell leaves only a dotted trace.',
      '"Count A again inside the remaining world: 5." The five A cells left are numbered afresh.',
      '"P(A | B) = 5 / 12 = 41.7%" stands next to "P(A) = 6 / 36 = 16.7%", with a second strip divided into 12 parts, 5 filled, and the caption "The denominator changed: 36 → 12".',
      'Fractions are left unreduced so the counts stay visible. All 36 outcomes are taken as equally likely, and the thresholds 10 and 5 are example values; the screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself — world, mark A, B leaves, recount, answer — and stops.',
        'A Replay button and a playback strip sit below it. After the run, stepping back into the leaving step shows the denominator counting down from 36 to 12 while A loses exactly one member.',
        'Both events and the dice are fixed, so every count can be quoted.',
      ],
    },

    useWhen: [
      'The article introduces conditional probability and wants the reader to see that conditioning changes what is being divided by, before any formula.',
      'A reader confuses P(A | B) with P(A and B), and the article needs 5/12 and 5/36 told apart by which outcomes are still in the world.',
    ],

    avoidWhen: [
      'The article is about updating beliefs with evidence, priors and likelihoods. Nothing here is a hypothesis; the outcomes are simply counted.',
      'The subject is independence testing or P(A | B) = P(A). These two events are dependent and the numbers show it, but independence is not discussed.',
      'The outcomes are not equally likely, or the space is continuous. Every count here rests on 36 equally likely cells.',
    ],

    contrastWith: [
      {
        concept: 'bayesUpdate',
        note: 'Conditioning on an observed event removes outcomes and recounts. Bayesian updating runs the same idea in reverse direction, from evidence back to hypotheses, and needs likelihoods to do it.',
      },
      {
        concept: 'baseRate',
        note: 'Restricting to positives is conditioning on the test result. The base-rate effect is what that restriction does when one of the groups being counted is far larger than the other.',
      },
      {
        concept: 'inclusionExclusion',
        note: 'Counting |A ∪ B| by adding and subtracting overlaps also works on the intersection A ∩ B. Conditional probability divides that intersection by |B| instead of by the whole space.',
      },
    ],
  },
};
