/**
 * requiresSorted 개념 선언.
 *
 * canonical facet 은 `facet:requiresSorted` — 조각(piece)이다. 같은 값 일곱을
 * 두 줄로 놓고 (한 줄은 줄이 서 있고 한 줄은 흐트러져 있다) 같은 이진 탐색을
 * 나란히 건다. 찾는 값이 실제로 든 칸에는 내내 고리가 둘러져 있다. 계기도 코드
 * 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `binarySearch` 는 절차 전체와 두 가지 끝을, 조각 `halveTheRange` 는
 * 견줌 한 번의 셈을 맡는다. 이 조각이 홀로 맡는 것은 **사전 조건과 그것을 어겼을
 * 때의 실패 양식** 이다 — 느려지는 것이 아니라 조용히 틀린 답이 나오고, 아무
 * 신호도 남지 않는다는 것.
 * definition 의 주어가 "버림의 사전 조건" 이고, keywords 는 계약 · 미정의 동작 ·
 * 조용한 오답 어휘만 갖는다 (완제품의 구현 어휘, halveTheRange 의 로그 어휘와
 * 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const requiresSortedConcept: FacetConceptSource = {
  id: 'requiresSorted',
  label: 'The Sorted Precondition (Where Halving Loses Its Warrant)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:requiresSorted',

  surface: {
    definition:
      'The precondition behind halving: discarding a side is warranted only when order vouches for what it holds, so an unordered input produces a confident wrong answer rather than a slow one.',
    exemplarKeywords: [
      'precondition',
      'undefined behaviour on unsorted input',
      'silently wrong result',
      'an invariant the caller has to maintain',
      'assert that the array is sorted',
      'sort once, search many times',
      'no exception is raised',
      'reports not found for a value that is present',
      'the contract of a function',
      'debug-only check',
      'garbage in, plausible answer out',
    ],
  },

  briefing: {
    observable: [
      'The same seven values stand in two rows, one labelled as being in order and one as being out of order, and a chip above them names the single value both rows are looking for.',
      'A dashed ring sits on the seat where that value actually lives in each row and stays there for the whole run, so its position is never in doubt while the search goes on.',
      'One procedure drives both rows at once: they are probed at the same seat and, while their ranges still agree, they discard the same half on the same step.',
      'At the step where the lower row discards the half that actually holds the ringed value, the caption says so as it happens, and no probe afterwards ever reaches that seat again.',
      'The upper row lands on the value and is labelled as found at its seat; the lower row keeps narrowing until its range closes on nothing and is labelled as answering that the value is not there.',
      'The lower row finishes the way the upper one does — with a verdict printed beneath it — so the wrong answer arrives as an ordinary completed result.',
      'The closing caption sets the two verdicts against each other while the ringed seat still visibly holds the value.',
    ],

    screen: {
      affordances: [
        'The screen runs both rows on its own and stops with the two verdicts standing side by side.',
        'Two buttons: Replay, and a step control that rewinds and walks the same probes one at a time, which is how a reader can stop on the step where the two rows part.',
        'Both rows and the value being looked for are fixed, so an article can name the seat the value occupies in each row and the step where the answers diverge.',
      ],
    },

    useWhen: [
      'The article carries "works on a sorted array" as a footnote and a reader files it under performance advice. Two rows of the same seven values ending in opposite verdicts is what moves it from advice to requirement.',
      'The prose has to explain why this class of bug surfaces late: the failing row completes normally and hands back a verdict, so a caller receives an answer with nothing attached to say it is worthless.',
      'A reader wants to know exactly where correctness is lost rather than that it is lost. The step that discards the half holding the value is nameable, and everything after it is already too late.',
    ],

    avoidWhen: [
      'The subject is the cost of sorting first, or which sort to run before searching. Neither row is ever put in order on screen.',
      'The article is about checking the precondition in code — an assertion over neighbouring pairs, a debug build that verifies the input. Nothing here inspects a row before searching it.',
      'The point is how much a comparison narrows the range or why the cost is logarithmic. Both rows narrow at the same rate and the counts are not the subject.',
      'The article uses "sorted" for ordering query results, sorting a table in an interface, or the relative order of records that compare equal.',
      'The subject is a search that copes with unordered data by design rather than one whose warrant depends on order.',
    ],

    contrastWith: [
      {
        concept: 'binarySearch',
        note: 'That screen assumes the ordering and spends its attention on the two ways the procedure can end; this one holds the procedure fixed and removes the ordering instead.',
      },
      {
        concept: 'halveTheRange',
        note: 'That counts what the ordering buys on every comparison; this shows the same discard being made without any warrant behind it.',
      },
      {
        concept: 'linearSearch',
        note: 'Walking from the front has no precondition to violate — it asks about each position separately, which is exactly the guarantee given up in exchange for halving.',
      },
      {
        concept: 'interpolationSearch',
        note: 'Both depend on the input satisfying something; there the added assumption is about how the values are spread, on top of the ordering questioned here.',
      },
    ],
  },
};
