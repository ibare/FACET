/**
 * bubbleSort 개념 선언.
 *
 * canonical facet 은 `facet:bubbleSort` — 막대 차트 + 목표 미리보기 + 패스 추적기 +
 * 스냅샷 스트립 + 코드 패널. 한 화면에 시각 요소가 가장 많은 facet 이다.
 *
 * shuffleOnReset 이 켜져 있어 재실행마다 다른 시작 배치가 나온다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bubbleSortConcept: FacetConceptSource = {
  id: 'bubbleSort',
  label: 'Bubble Sort',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bubbleSort',

  surface: {
    definition:
      'A sort that repeatedly compares each adjacent pair and swaps them when out of order, so the largest remaining value settles at the end of every pass.',
    exemplarKeywords: [
      'bubble sort',
      'adjacent swap',
      'in-place sorting',
      'quadratic time sorting',
      'stable sort',
      'number of passes and comparisons',
      'sorted tail',
      'teaching sorting algorithms',
      'why O(n^2) matters',
      'comparison-based sorting',
    ],
  },

  briefing: {
    observable: [
      'Each pass sweeps left to right comparing neighbours, and the largest remaining value is carried to the end — the wave always breaks at the same edge.',
      'A rising marker follows the value being carried, so the reader can see one value travel the whole length rather than watching bars flicker.',
      'The sorted tail grows by one after every pass and is shaded apart from the unsorted region, which makes the shrinking work visible.',
      'A start preview and a goal preview sit beside the main chart, so the current state can be read against both ends at once.',
      'A pass tracker reports the current pass number, the size of the sorted tail, and how many swaps that pass made — a pass with zero swaps is the early-exit condition made visible.',
      'A snapshot strip accumulates the array state at the end of each pass, leaving the whole history on screen instead of only the present.',
      'Three counters run along: comparisons, swaps, passes.',
      'The code panel highlights the running phase in step with the animation — compare, swap, end of pass.',
      'Reset reshuffles the array, so each run starts from a different arrangement.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'The snapshot strip is the place to point when the article argues about how much work a pass actually saves — the rows shorten visibly.',
      ],
    },

    avoidWhen: [
      'The article is about an efficient sort (merge, quick, heap). This one exists to show the quadratic pattern, and its pass structure does not carry over to divide-and-conquer.',
      'The point is sorting stability or comparator design. Those are properties of the algorithm rather than anything this screen distinguishes.',
    ],

    contrastWith: [
      {
        concept: 'array',
        note: 'Sorting is what an array is for — random access by index is exactly what lets a sort compare and swap any pair in one step.',
      },
    ],
  },
};
