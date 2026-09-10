/**
 * interpolationSearch 개념 선언.
 *
 * canonical facet 은 `facet:interpolationSearch` — 겨누는 식을 틀 · 값을 넣은 꼴 ·
 * 줄여 나간 꼴 세 줄로 쌓아 보이고, 그 아래 열두 칸 배열과 두 트랙(겨눔 · 반 접기)을
 * 같은 열 좌표에 나란히 찍는다. 카운터 둘과 여섯 언어 코드 패널을 갖춘 완결형이다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 개념이 지는 것은 **식 자체와 그 식이 딸고 오는 것들** 이다 — 정수 나눗셈의
 * 차례, 구간 밖 값을 막는 두 부등식, 그리고 자료가 치우쳤을 때의 최악.
 * 비율이 자리로 옮겨진다는 직관 하나는 조각 `guessByValue` 가 맡으므로
 * definition 에서 그 무게를 덜었다.
 *
 * 변별어를 붙이지 않았다. "interpolation search" 는 이 방법 하나를 가리킨다.
 * 다만 "interpolation" 만 쓰는 다른 주제(수치 보간 · lerp)는 avoidWhen 이 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const interpolationSearchConcept: FacetConceptSource = {
  id: 'interpolationSearch',
  label: 'Interpolation Search',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:interpolationSearch',

  surface: {
    definition:
      'A search on a sorted array that replaces the midpoint formula with a position computed from the target\'s proportion between the endpoint values, then narrows the interval as usual.',
    exemplarKeywords: [
      'interpolation search',
      'the mid formula',
      'integer division and operator order',
      'log log n average',
      'worst case linear search cost',
      'searching a phone book',
      'evenly distributed keys',
      'bounds check before probing',
      'a one-line variant of binary search',
      'probe count comparison',
    ],
  },

  briefing: {
    observable: [
      'The formula stands at the top in three stacked lines — the template, the same line with this run\'s numbers substituted, and the reduced result — so the arithmetic that picks a seat is legible before the array is touched.',
      'The array is twelve cells and only the live interval is drawn brightly; discarded cells dim, so the shrinking of the interval is a change in the picture rather than a pair of numbers.',
      'Two tracks share the array\'s column coordinates: the aiming track marks the seats it probes and the halving track marks the seats it would take, so one probe against three sits on one vertical line.',
      'On this data the aim lands on seat 10 immediately, while halving takes seat 5, then seat 8, then seat 10; the Probe and Halving counters end at 1 and 3.',
      'The captions state the verdict of each probe as too small, too large or a hit, and a discard is announced as a seat and everything on one side of it going.',
      'Before probing, the screen checks that the wanted value lies between the two endpoint values and says so, which is a step the picture spends time on rather than skips.',
      'The code panel carries the same mid line the formula band shows, and the highlighted line follows the step being played across whichever languages are open.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'The twelve values run from 10 to 120 in even steps and the target is 110; the data is not shuffled on reset, so the article can name the one-probe result and the three halving steps.',
        'Opening two languages side by side is how the reader sees the same formula written with integer division, plain division and a floor call without the order of operations changing.',
      ],
    },

    useWhen: [
      'The article has said this method differs from halving by a single line, and the reader wants to see the line rather than be told about it. The formula band and the code panel carry the same expression, and the array underneath shows what that expression decides.',
      'The prose is about to argue that operator order matters because the division truncates. The substituted line on screen holds the actual numbers the argument needs.',
      'The reader has to accept that a bounds test on the wanted value is required here and not merely defensive — the caption spends a step on it before every probe is allowed.',
      'The article is comparing two search methods and needs the comparison to be a measurement. Both counters run over the same array in the same playback.',
    ],

    avoidWhen: [
      'The article uses "interpolation" for estimating values between samples — linear interpolation, lerp, curve fitting, resampling. The word matches and nothing else does.',
      'The point is the worst case on clustered or skewed data. Everything here is evenly spaced and the aim lands each time, so the screen would contradict the passage.',
      'The collection in the article is unsorted, or is reached by keys that have no size relation to their position.',
      'The subject is a hash lookup or an index that reaches a record in one step by construction rather than by estimate.',
      'The values in the article are not numbers that can be subtracted and divided — strings, tuples, opaque keys.',
    ],

    contrastWith: [
      {
        concept: 'guessByValue',
        note: 'That one measures the proportion on a drawn scale to make the idea land; this one writes the same proportion as a formula and deals with what the formula costs.',
      },
      {
        concept: 'binarySearch',
        note: 'The same loop and the same three-way verdict, differing only in how the probe position is chosen — which is why their costs can be counted against each other.',
      },
      {
        concept: 'halveTheRange',
        note: 'Halving guarantees the same shrinkage whatever the data holds; aiming shrinks far more when the data is even and far less when it is not.',
      },
      {
        concept: 'requiresSorted',
        note: 'Sorted order is the precondition for both, but aiming needs more than order — it needs the values to be spaced in a way that order alone does not promise.',
      },
    ],
  },
};
