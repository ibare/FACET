/**
 * filterKeepSome 개념 선언.
 *
 * canonical facet 은 `facet:filterKeepSome` — `let older = filter(ages, x => x > 4)`. [7, 2, 9, 4, 6, 1] 의 원소가 자리 0 부터
 * 조건 앞에 서서 7 · 9 · 6 은 값 그대로 `older` 끝에 붙고 2 · 4 · 1 은 떨어진다 (4 > 4 는 거짓). 출력 [7, 9, 6],
 * "Length: ages 6 → older 3". 걸음 아홉 (시작 포함, 원소 하나 = 한 걸음).
 *
 * ── 묶음 안에서의 자리 (map · filter · reduce — origin `map-filter-reduce`)
 *
 * **개수는 줄고 값은 그대로**. "predicate · keep · drop · shorter · unaltered" 를 이쪽이 독점한다.
 * 원소마다 바꾸는 일(transform · position · length)은 `mapOneByOne`, 하나로 접는 일(accumulator · single value)은
 * `reduceFold` 에 두고 definition 에서 쓰지 않는다. 옛 목록이 그대로 남는 것은 `immutableCopy` 의 말이다.
 *
 * 전제: `filter(list, f)` 는 이 표기의 내장이고 목록이 앞이다. 코드는 어느 한 언어도 아닌 표기다. 화면은 각주를 달지
 * 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const filterKeepSomeConcept: FacetConceptSource = {
  id: 'filterKeepSome',
  label: 'filter (Keep Only the Elements That Pass)',
  canonicalFacet: 'facet:filterKeepSome',

  surface: {
    definition:
      'Filter tests each element against a predicate, keeping those that pass with their values unaltered and dropping the rest, so the list that comes out is shorter.',
    exemplarKeywords: [
      'filter function',
      'Array.prototype.filter',
      'list comprehension with if',
      'Where in LINQ',
      'Stream.filter',
      'predicate function',
      'select elements matching a condition',
      'remove items that fail a test',
      'boolean callback',
    ],
  },

  briefing: {
    observable: [
      'The code is three lines: `let ages = [7, 2, 9, 4, 6, 1]`, `let older = filter(ages, x => x > 4)`, `show older`.',
      'Elements step up to the condition one at a time from position 0; the test is shown with the value filled in, such as `7 > 4 · true` or `2 > 4 · false`.',
      'True elements move to the new list `older` with the same value ("Value added to older: 7"); false ones fall into a "dropped" row ("It drops out"). 7, 9 and 6 are kept; 2, 4 and 1 are dropped — 4 is dropped because 4 > 4 is false.',
      'Kept elements close up with no gaps and keep their original order: 9 was at position 2 in `ages` and is at position 1 in `older`.',
      'The output is [7, 9, 6] with the caption "Length: ages 6 → older 3". No kept value differs from what went in.',
      'The `filter` line is spread over six steps, one per element; with the start, the first line and the print, there are nine steps.',
      '`filter(list, f)` is a built-in of this notation with the list first; JavaScript writes `ages.filter(x => x > 4)`, Python `[x for x in ages if x > 4]`. The code is written in a small language-neutral notation rather than any one real language.',
    ],

    screen: {
      affordances: [
        'The screen tests all six elements by itself and stops on the printed list with the dropped row beside it.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to position 3 shows the boundary case `4 > 4 · false`.',
        'The list and the condition are fixed.',
      ],
    },

    useWhen: [
      'The reader is meeting `filter` and needs to see that it only decides in or out — the survivors come through with their values untouched and the count shrinks.',
      'The article turns a loop with an `if` that appends to a new array into a single `filter` call.',
      'The reader is unsure whether a strict comparison keeps the boundary value; the 4 that drops out answers it.',
    ],

    avoidWhen: [
      'The subject is a signal-processing or image filter, or a Bloom filter. This is the list operation.',
      'The point is finding the first element that matches and stopping. Every element is tested here and all passing ones are kept.',
      'The article needs values changed or summed. Nothing is recomputed here; values pass through as they are.',
    ],

    contrastWith: [
      {
        concept: 'mapOneByOne',
        note: 'The two are mirror images: one keeps every surviving value exactly and changes the count, the other keeps the count and changes every value.',
      },
      {
        concept: 'reduceFold',
        note: 'Selecting leaves a list of the original kind, only thinner. Folding consumes the list and leaves one value of possibly another kind.',
      },
      {
        concept: 'linearSearch',
        note: 'Both examine a sequence front to back against a test. A search stops at the first match and reports where it is; selection keeps going to the end and collects every element that passes.',
      },
      {
        concept: 'mapFilterReduce',
        note: 'Selection alone is a claim about which elements pass. In a chain of stages it is the only one that changes the count, so every later stage inherits its decisions.',
      },
    ],
  },
};
