/**
 * countThenPlace 개념 선언.
 *
 * canonical facet 은 `facet:countThenPlace` — 값 여섯 개와 종류 셋짜리 작은 판에서
 * 세로로 쌓인 눈금 더미가 그대로 누워 결과 배열의 구역이 되는 장면 하나를 보인다.
 * 눈금 하나의 폭이 결과 칸의 폭과 같아, 더미가 눕는 것이 셈이 아니라 같은 것의
 * 방향만 바뀐 일로 읽힌다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **견줌 없이 자리가 정해진다** 는 주장 하나다. 정렬을 견주는
 * 일과 동의어로 아는 독자에게 n log n 하한이 여기 적용되지 않는 까닭을 말한다.
 * 누적합의 산술 · 안정성 · 여벌 배열의 대가는 완제품 `countingSort` 가 지므로
 * definition 에서 뺐다.
 *
 * 변별어를 붙인 이유: "counting" 만으로는 빈도 세기와 갈리지 않는다. 세는 일이
 * 곧 자리를 정하는 일이라는 것이 이 조각의 요지라 두 동사를 id 에 함께 넣었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const countThenPlaceConcept: FacetConceptSource = {
  id: 'countThenPlace',
  label: 'Ordering Without Comparing (Count, Then Place)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:countThenPlace',

  surface: {
    definition:
      'Tallies of how often each value occurs fix every destination in advance, so items are ordered without any two of them being weighed against each other.',
    exemplarKeywords: [
      'sorting without comparisons',
      'non-comparison sort',
      'the n log n lower bound',
      'why some sorts beat n log n',
      'comparison lower bound does not apply',
      'tally marks',
      'histogram of values',
      'the value is the address',
      'direct addressing',
      'bounded range of keys',
    ],
  },

  briefing: {
    observable: [
      'Values are read one at a time from left to right, and each read drops a tally mark into the column belonging to that value — only the value just read is ever looked at.',
      'A tally mark is exactly as wide as one slot of the result array, so when the stacks lie down they become regions of that array at the same size, and the reader sees a turn rather than a calculation.',
      'The stacks harden into starting slot numbers before anything is placed, so every destination exists on screen while the result row is still empty.',
      'Placement sends each value straight to its own number with no intermediate position, and the number ticks up by one as it is used.',
      'At no moment in the run are two values set beside each other, which is the shape of the claim: the screen has no frame that could be pointed at as a comparison.',
      'Three values, six items and a run that finishes in one pass — the whole thing is small enough that the reader can predict the finished row before it fills.',
    ],

    screen: {
      affordances: [
        'The screen plays the three phases on its own — tally, harden, place — and stops on the finished row.',
        'Two buttons: replay, and a step button. The first press of the step button rewinds and shows the first move in the same press, and each press after that advances one moment.',
        'The six values and the three kinds are fixed, so the article can name the columns and the slot numbers they harden into.',
        'Stepping is how a reader checks the claim frame by frame, since the argument is about what never appears rather than about what does.',
      ],
    },

    useWhen: [
      'The article has just stated a bound on comparison sorting and now needs the reader to accept that some methods sit outside it. Watching a full ordering complete with no pair ever set side by side is what makes "outside it" concrete.',
      'The reader treats sorting and comparing as the same word. Separating them is the precondition for any method that addresses by value.',
      'The prose is about to spend the range as a resource — one column per possible value — and the reader should first see what that expenditure buys.',
    ],

    avoidWhen: [
      'The values in the article are strings, floats, or spread over a range too wide to give each one a column.',
      'The subject is the arithmetic that turns counts into positions, or the order equal items end up in. This screen shows the destinations arriving, not how they are derived or what they guarantee.',
      'The article only needs a frequency table — how many of each — and nothing is ever put in order afterwards.',
      'The point is how a comparison sort actually works, or how to choose between two of them.',
      'The article is proving the lower bound itself, by decision trees or an information argument. This is a counterexample to its scope, not a step in it.',
    ],

    contrastWith: [
      {
        concept: 'countingSort',
        note: 'The same three phases carried through with the arithmetic on show — cumulative sums, seats pushed on, a second array — where this stops once the claim about comparison is made.',
      },
      {
        concept: 'compareAndSwap',
        note: 'The operation this one never performs: two values held side by side and exchanged on the answer, which is the unit of cost in every method the lower bound covers.',
      },
      {
        concept: 'hashToBucket',
        note: 'Both turn a value straight into a location instead of searching for one, but hashing scatters on purpose and this keeps the locations in value order.',
      },
    ],
  },
};
