/**
 * mapFilterReduce 개념 선언.
 *
 * canonical facet 은 `facet:mapFilterReduce` — `marks = [6, 3, 8, 1, 5, 9]` 가 세 줄
 * `filter(marks, x => x > 문턱)` → `map(kept, x => x * x)` → `reduce(squares, 0, (acc, x) => acc + x)` 를 차례로
 * 지난다. 손잡이는 문턱 하나(0 · 2 · 4 · 6 · 8, 처음 4). 문턱 4 에서 filter 뒤 4 개 · map 뒤 4 개 · 답 206,
 * 문턱 6 에서 2 · 2 · 145. 문턱을 올리면 앞 판에 지나던 원소가 문 앞에서 떨어지며 "passed last time" 표가 붙는다.
 * 코드 패널 "The loops inside the three stages" 가 같은 셈을 반복 셋으로 편다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각들은 저마다 한 단계를 쥔다 — 원소마다 바꿔 같은 자리에(`mapOneByOne`), 조건으로 거름(`filterKeepSome`),
 * 누적 하나로 접음(`reduceFold`), 함수를 값으로 건넴(`functionAsValue`). 이쪽은 **셋을 한 줄로 이어 문턱을
 * 돌렸을 때 변화가 어디서 생기고 어디로 번지는가**를 맡는다. 그래서 definition 은 "pipeline · chains three
 * stages · each changes one property (count, values, shape) · tightening the cutoff · downstream · final total" 를
 * 쓰고, 조각이 독점한 낱말(transform · position · one-to-one · predicate · keep · drop · unaltered · accumulator ·
 * initial value · single value · fold · first-class · higher-order)을 쓰지 않는다. 조각 둘이 함께 갖던
 * "functional programming list operations" 는 이쪽이 가져온다. LINQ 이름 하나씩(`Select` · `Where` · `Aggregate`)은
 * 그 단계를 콕 집는 검색어라 조각에 남기고, 이쪽은 셋을 이은 꼴로만 적는다.
 *
 * 전제 (화면은 각주를 달지 않는다):
 * - 화면의 표기는 목록이 첫 인자다(`filter(marks, f)` · `reduce(list, start, f)`). 자바스크립트는 `marks.filter(f)`,
 *   파이썬은 `filter(f, marks)`, `functools.reduce(f, xs, start)` 처럼 차례가 다르다.
 * - 코드 패널은 여섯 언어가 함께 쓰는 IR 에서 옮겨 오는데 IR 에는 함수 값이 없다. 그래서 넘기는 함수가 반복 몸에
 *   박혀 있다 (`xs[i] > threshold` · `kept[i] * kept[i]` · `acc + squares[i]`). 결과 목록은 부르는 쪽이 만든 버퍼다.
 * - 견줌은 `x > 문턱` 이라 문턱과 같은 원소는 떨어진다. 목록과 문턱 값은 예로 정한 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const mapFilterReduceConcept: FacetConceptSource = {
  id: 'mapFilterReduce',
  label: 'map / filter / reduce Pipeline',
  canonicalFacet: 'facet:mapFilterReduce',

  surface: {
    definition:
      'A map-filter-reduce pipeline chains three list stages that each change one property — count, then values, then shape — so tightening the filter\'s cutoff shortens every downstream stage and lowers the final total.',
    exemplarKeywords: [
      'map filter reduce',
      'chaining array methods',
      'method chaining on collections',
      'data pipeline over a list',
      'Java Stream pipeline',
      'LINQ Where Select Aggregate',
      'functional programming list operations',
      'sum of squares of values above a threshold',
      'declarative list processing instead of loops',
      'composing collection operations',
    ],
  },

  briefing: {
    observable: [
      'Three stage gates stand in a row, labelled with the lines `let kept = filter(marks, x => x > 4)`, `let squares = map(kept, x => x * x)` and `let sum = reduce(squares, 0, (acc, x) => acc + x)`. The function each stage is given sits in its gate as a separate chip — `x => x > 4`, `x => x * x`, `(acc, x) => acc + x`.',
      'Rows for `marks`, `kept` and `squares` have slots numbered from 0, and there is a `sum` cell, a "Dropped" area, and the six elements 6, 3, 8, 1, 5, 9 at their starting places.',
      'Filter: elements step up to the gate one at a time with captions such as "6 > 4: true" and "3 > 4: false". A true element passes with its value unchanged and joins the end of `kept`; a false one falls into Dropped. Survivors keep their original order.',
      'Map: each element of `kept` passes the map gate and lands in the same slot of `squares` with its new value — "6 → 36", "8 → 64", "5 → 25", "9 → 81".',
      'Reduce: the squares are folded into `sum` from the front — "0 + 36 = 36", "36 + 64 = 100", "100 + 25 = 125", "125 + 81 = 206" — and the round ends on "Result: 206".',
      'Across thresholds 0, 2, 4, 6, 8 the counters "Kept by filter" and "Out of map" read 6, 5, 4, 2, 1 — always equal to each other — and "Reduce result" reads 216, 215, 206, 145, 81. A round is 8 + 2k steps, k being the number kept: 20, 18, 16, 12, 10.',
      'The six elements start from the same places every round. When the threshold rises, an element that passed in the previous round falls at the gate this time with a "passed last time" tag (raising 4 → 6 drops 6 and 5); when it falls, a revived element passes with "dropped last time". The comparison is strict, so an element equal to the threshold is dropped.',
      'A code panel titled "The loops inside the three stages" shows the same computation as `pipeline` calling `filterInto`, `mapInto` and `reduceSum`, one loop each; the highlighted line follows the step. The reader adds up to two of Python, JavaScript, TypeScript, Java, C++ and C# with "+ Add language". The functions shown as chips are written inline in the loop bodies there (`xs[i] > threshold`, `kept[i] * kept[i]`, `acc + squares[i]`), because the shared source the six languages are generated from has no function values; the output lists are buffers the caller creates.',
      'The notation puts the list first (`filter(marks, f)`, `reduce(list, start, f)`); real languages differ — JavaScript `marks.filter(f)`, Python `filter(f, marks)` and `functools.reduce(f, xs, start)`, C# `Where` / `Select` / `Aggregate`, Java stream `filter` / `map` / `reduce`, C++ `std::copy_if` / `std::transform` / `std::accumulate`.',
    ],

    screen: {
      affordances: [
        'The bar carries play, single step, pause, reset and a speed slider, plus one Threshold handle with the values 0, 2, 4, 6 and 8, at 4 to begin with.',
        'One round plays through and then waits. Moving the threshold replays the whole pipeline from the same six elements, changing only the number in the filter chip.',
        'The move that makes the idea land is raising the threshold from 4 to 6: the tagged elements fall at the first gate, the map row and the fold both get shorter by the same amount, and the result drops from 206 to 145.',
      ],
    },

    useWhen: [
      'The reader can use each of the three operations alone but has not seen them chained, and needs to see what each stage hands to the next and which property each one changes.',
      'The article rewrites a loop that tests, transforms and totals in one body as a chain of three calls, and wants the stages and the loop form side by side.',
      'The reader asks why narrowing the filter changes the final number, and should trace a single change at the first stage through the length of the second and the size of the third.',
    ],

    avoidWhen: [
      'The subject is lazy streams, short-circuiting or fusion of stages. Each stage here finishes its whole list before the next begins.',
      'The article is about MapReduce on a cluster or parallel reduction. This is one list processed front to back.',
      'The reader is meant to swap the functions themselves. Only the filter\'s threshold can be changed; the transformation and the combining rule are fixed.',
    ],

    contrastWith: [
      {
        concept: 'filterKeepSome',
        note: 'Selection alone is a claim about one stage — survivors pass unchanged and the count shrinks. In a chain, that shrinking is the only way the later stages ever change length.',
      },
      {
        concept: 'mapOneByOne',
        note: 'Mapping alone keeps position and count while changing values. Inside a chain, that property is what makes the count after mapping always equal the count after selecting.',
      },
      {
        concept: 'reduceFold',
        note: 'A fold on its own turns a list into one value through a running total. At the end of a chain, it is the stage that converts every upstream change into a change in a single number.',
      },
      {
        concept: 'functionAsValue',
        note: 'Passing a function as an argument is the mechanism all three stages share; the pipeline is about what the stages do with those functions and how their results feed each other.',
      },
    ],
  },
};
