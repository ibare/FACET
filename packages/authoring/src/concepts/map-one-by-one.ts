/**
 * mapOneByOne 개념 선언.
 *
 * canonical facet 은 `facet:mapOneByOne` — `let tens = map(nums, x => x * 10)`. [3, 1, 4, 2] 의 원소가 자리 0 부터 하나씩
 * 함수를 지나 30 · 10 · 40 · 20 이 되어 새 목록 `tens` 의 같은 자리에 선다. 가장 큰 40 이 자리 2 에 그대로 — 줄 세우지
 * 않는다. "Items in: 4 · items out: 4". 걸음 일곱 (시작 포함, 원소 하나 = 한 걸음).
 *
 * ── 묶음 안에서의 자리 (map · filter · reduce — origin `map-filter-reduce`)
 *
 * **값은 바뀌고 개수는 그대로**. "transform · position · length · one-to-one" 을 이쪽이 독점한다.
 * 조건으로 거르는 일(predicate · keep · drop · shorter · unaltered)은 `filterKeepSome`, 하나로 접는 일(accumulator ·
 * single value · combine · fold)은 `reduceFold` 에 두고 definition 에서 쓰지 않는다. 옛 목록이 그대로 남는다는 것은
 * `immutableCopy` 의 말이라 definition 에 original · copy 를 쓰지 않는다. 함수를 인자로 넘기는 일(higher-order)은
 * `functionAsValue` 가 독점한다.
 *
 * 전제: `map(list, f)` 는 이 표기의 내장이고 인자 차례는 목록이 앞이다 (자바스크립트는 `nums.map(f)`, 파이썬 내장
 * `map(f, nums)` 은 함수가 앞). 코드는 어느 한 언어도 아닌 표기다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mapOneByOneConcept: FacetConceptSource = {
  id: 'mapOneByOne',
  label: 'map (Transform Every Element)',
  canonicalFacet: 'facet:mapOneByOne',

  surface: {
    definition:
      'Map applies one function to every element of a list independently and puts each transformed value at the matching position of a result list, so length and ordering are preserved.',
    exemplarKeywords: [
      'map function',
      'Array.prototype.map',
      'list comprehension',
      'Select in LINQ',
      'Stream.map',
      'apply a function to each element',
      'element-wise transformation',
      'one-to-one mapping of a list',
      'map vs forEach',
    ],
  },

  briefing: {
    observable: [
      'The code is three lines: `let nums = [3, 1, 4, 2]`, `let tens = map(nums, x => x * 10)`, `show tens`.',
      'Elements leave `nums` one at a time from position 0, pass through the function `x => x * 10`, and land in the new list `tens` at the same position: "Position 0: in 3, out 30 → tens[0]", then 1 → 10, 4 → 40, 2 → 20.',
      'Each element is computed on its own; no element looks at its neighbours. The largest result, 40, stays at position 2 — nothing is sorted.',
      'The output is [30, 10, 40, 20] and the final line reads "Items in: 4 · items out: 4" — nothing is dropped or merged.',
      'The `map` line is spread over four steps, one per element; with the start, the first line and the print, there are seven steps.',
      '`map(list, f)` is a built-in of this notation with the list first; JavaScript writes `nums.map(x => x * 10)`, Python `map(lambda x: x * 10, nums)` or `[x * 10 for x in nums]`, C# `Select`. The code is written in a small language-neutral notation rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the four elements through the function by itself and stops on the printed list.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any element shows `tens` filled up to that position.',
        'The list and the function are fixed.',
      ],
    },

    useWhen: [
      'The reader is meeting `map` for the first time and needs to see that each output sits exactly where its input was — four in, four out, in the same order.',
      'The article turns a loop that builds a new array element by element into a single `map` call and wants the correspondence between positions made visible.',
      'The reader expects `map` might reorder, skip or merge values; the counts and the unsorted 40 at position 2 settle it.',
    ],

    avoidWhen: [
      'The subject is the map or dictionary data structure (key-value lookup, hash map). This is the list operation.',
      'The point is selecting some elements by a condition, or collapsing a list into one number. Every element passes through and comes out here.',
      'The article is about lazy evaluation, parallel map or MapReduce across machines. Only a single eager pass over four numbers is drawn.',
    ],

    contrastWith: [
      {
        concept: 'filterKeepSome',
        note: 'The two are mirror images: one keeps the count and changes every value, the other keeps every surviving value exactly and changes the count.',
      },
      {
        concept: 'reduceFold',
        note: 'Each element here is handled in isolation and yields its own result. Folding carries one running value from element to element, so each step depends on everything before it, and the answer is no longer a list.',
      },
      {
        concept: 'functionAsValue',
        note: 'Handing a function to another function is the mechanism map relies on; this concept is what that particular receiver does with it — apply it once per element and keep positions.',
      },
      {
        concept: 'mapFilterReduce',
        note: 'Mapping alone is one stage whose property is keeping count and position. Chained after a selection and before a fold, that property is what makes its length always follow the stage before it.',
      },
    ],
  },
};
