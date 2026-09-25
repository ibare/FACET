/**
 * reduceFold 개념 선언.
 *
 * canonical facet 은 `facet:reduceFold` — `let sum = reduce(costs, 0, (total, x) => total + x)`. 누적값이 시작값 0 에서
 * 출발해 [5, 2, 6, 3] 을 앞에서부터 하나씩 받아 0 → 5 → 7 → 13 → 16. 결과 칸에 목록이 서지 않고 `sum` 에 16 하나.
 * 걸음 일곱 (시작 포함, 원소 하나 = 한 걸음 — 시작값을 놓는 것은 따로 걸음이 아니다).
 *
 * ── 묶음 안에서의 자리 (map · filter · reduce — origin `map-filter-reduce`)
 *
 * **목록이 값 하나로**. "fold · accumulator · initial value · single value · absorbs · combining" 을 이쪽이 독점한다.
 * 원소마다 바꾸는 일(transform · position · length)은 `mapOneByOne`, 조건으로 거르는 일(predicate · keep · drop)은
 * `filterKeepSome` 에 두고 definition 에서 쓰지 않는다.
 *
 * 전제: `reduce(list, start, f)` 는 이 표기의 내장이고 인자 차례는 목록 · 시작값 · 함수다 (자바스크립트는 시작값이
 * 뒤, 파이썬 `functools.reduce(f, costs, 0)`). 앞에서부터 접는다(왼쪽 접기). 목록은 예로 정한 값이다. 코드는 어느
 * 한 언어도 아닌 표기다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const reduceFoldConcept: FacetConceptSource = {
  id: 'reduceFold',
  label: 'reduce / fold (Collapse a List Into One Value)',
  canonicalFacet: 'facet:reduceFold',

  surface: {
    definition:
      'Reduce folds a sequence into a single value: an accumulator begins at an initial value and absorbs the elements front to back, each combining step producing the next accumulator.',
    exemplarKeywords: [
      'reduce',
      'fold',
      'foldl',
      'left fold',
      'Array.prototype.reduce',
      'functools.reduce',
      'Aggregate in LINQ',
      'accumulator',
      'sum of a list',
      'aggregate a collection',
      'initial value of reduce',
      'running total',
    ],
  },

  briefing: {
    observable: [
      'The code is three lines: `let costs = [5, 2, 6, 3]`, `let sum = reduce(costs, 0, (total, x) => total + x)`, `show sum`.',
      'An "accumulator" labelled `total` starts at 0. Elements are taken from the front one at a time: "Index 0: accumulator 0, element 5 → accumulator 5", then 5 + 2 → 7, 7 + 6 → 13, 13 + 3 → 16.',
      'Each element taken in disappears into the accumulator, and the next element meets the new accumulator. The trail of accumulator values 0 · 5 · 7 · 13 · 16 stays visible.',
      'At the last element the area is relabelled "result" and 16 is "stored in sum". No list forms on the result side; the printed output is the single number 16.',
      'Placing the initial value is not a step of its own. The `reduce` line is spread over four steps, one per element; with the start, the first line and the print, there are seven steps.',
      '`reduce(list, start, f)` is a built-in of this notation, argument order list · start · function; JavaScript puts the start last (`costs.reduce(f, 0)`), Python writes `functools.reduce(f, costs, 0)`, Haskell `foldl (+) 0 costs`. It folds from the left. The list is an example value, and the code is written in a small language-neutral notation rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen takes in all four elements by itself and stops on the printed 16.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any element shows the accumulator as it stood after taking that element in.',
        'The list, the initial value and the function are fixed.',
      ],
    },

    useWhen: [
      'The reader can call `reduce` for a sum but does not see what the two parameters of the callback are. The running total visibly becoming the first argument of the next call answers it.',
      'The article explains why `reduce` needs an initial value and where it enters.',
      'The article generalises sums, products, maximums and counts into one pattern — a running value and a rule for taking in one more element.',
    ],

    avoidWhen: [
      'The subject is the reduce phase of MapReduce across machines, or parallel reduction in a tree shape. This is a single left-to-right pass.',
      'The article needs a right fold or an operation whose order matters. Only addition, from the left, is shown.',
      'The point is producing a new list of equal or smaller length. The result here is one number.',
    ],

    contrastWith: [
      {
        concept: 'mapOneByOne',
        note: 'Folding threads one running value through the elements, so each step depends on all earlier ones. Mapping handles every element on its own and returns as many results as it received.',
      },
      {
        concept: 'filterKeepSome',
        note: 'Selecting still returns a list, only thinner; folding consumes the list and returns one value, which need not be a list at all.',
      },
      {
        concept: 'loopBack',
        note: 'A fold is the loop-with-a-running-total pattern packaged as one call. The repetition is still there; the loop header, counter and update line are hidden inside the operation.',
      },
    ],
  },
};
