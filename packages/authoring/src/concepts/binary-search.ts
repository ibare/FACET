/**
 * binarySearch 개념 선언.
 *
 * canonical facet 은 `facet:binarySearch` — 완결형이다. 줄 선 값 열둘 한 줄 위에
 * 지금 남은 구간을 재는 자와 「거쳐 온 구간」 계단이 함께 그려지고, 누적 계기
 * 셋(견줌 · 찾기 · 찾음)과 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다. 있는 값
 * 하나(71)와 없는 값 하나(40)를 잇달아 찾아 두 가지 끝을 다 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **절차 전체와 그 결과** 를 맡는다 — 경계 둘을 움직여 구간을 좁히는
 * 반복문이 값을 만나면 끝나고, 만나지 못하면 구간이 비어야만 끝난다는 것. 즉
 * 무게중심이 「두 가지 종료 조건을 가진 하나의 절차」와 그것의 코드다.
 * 조각 `halveTheRange` 는 한 번의 견줌이 후보에서 정확히 몇을 지우는가라는
 * **셈** 만, 조각 `requiresSorted` 는 그 버림이 정당한 **전제** 만 말한다.
 * keywords 도 이쪽은 구현 어휘(lo/hi · mid 식 · -1 반환 · 라이브러리 이름)를
 * 갖고, 조각들은 각각 로그 비용 어휘 · 사전 조건 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const binarySearchConcept: FacetConceptSource = {
  id: 'binarySearch',
  label: 'Binary Search (Both Ways a Search Can End)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:binarySearch',

  surface: {
    definition:
      'A lookup on a sorted array that repeatedly compares the middle element to the target and discards the half that cannot hold it, ending at a match or an empty range.',
    exemplarKeywords: [
      'binary search',
      'bisect',
      'lo and hi bounds',
      'mid = (lo + hi) / 2',
      'while lo <= hi',
      'return -1 when nothing matches',
      'off-by-one in the loop condition',
      'integer division for the midpoint',
      'O(log n) lookup',
      'lower_bound',
      'bsearch',
      'searching a sorted table',
    ],
  },

  briefing: {
    observable: [
      'Twelve values stand in one row with their seat numbers printed underneath, and the row never rearranges — narrowing is done entirely by a bracket that closes in from the sides.',
      'A bracket under the live seats carries the count of what is still in play, and for the first target it reads twelve, six, three, one before the value is met on the fourth comparison.',
      'Two pills on the right hold the values being looked for, seventy-one and forty; the one in play is outlined, and each takes a mark when its search finishes.',
      'A ladder titled "Ranges searched" gains one bar per comparison, each bar as wide as the range at that moment with the probed seat picked out and the range size printed at its left edge.',
      'When the second search runs out of range the bracket is not drawn at all, the count reads zero in the warning colour, and the ladder closes with a dashed line saying the range is empty.',
      'The caption at that point states outright that the empty range is the proof of absence, and reports how many comparisons it took to reach it.',
      'Three counters run along the bottom — Compare, Search, Hit — and they finish at seven, two and one, so the second search visibly costs comparisons without producing a hit.',
      'The code panel highlights the line matching the current step, and the midpoint line is spelled differently across languages because integer division is explicit in some and implicit in others.',
    ],

    screen: {
      affordances: [
        'Nothing happens until Play is pressed. The bar carries play, single step, pause, reset and a speed slider.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side.',
        'The row of values and the two targets are fixed, so an article can name seventy-one, forty, and the seat each search ends on.',
        'Stepping is the way to sit on the comparison itself — between the middle being picked and the half being dropped — since the two are separate steps.',
      ],
    },

    useWhen: [
      'The article writes the loop condition as lo <= hi and a reader has no reason to care about the equals sign. The second search ending only once the bounds cross, with the answer arriving after the loop rather than inside it, is what makes that condition load-bearing.',
      'The prose treats "not found" as the leftover case that needs no explanation. Running a value that is present and one that is absent back to back puts both endings of the same procedure in one picture, and the Hit counter stays one behind Search.',
      'The subject is how one procedure reads in a particular language — where the midpoint needs a floor and where the division already gives one. Two panels side by side on the line currently running is the comparison.',
    ],

    avoidWhen: [
      'The article uses "binary" for base-two representation, bitwise work, or a binary file format. The word matches and nothing here concerns bits.',
      'The subject is a binary search tree. The halving there comes from following stored links, while here it comes from arithmetic on two indices over one flat row.',
      'The point is finding the first or last position equal to the target, or the insertion point among duplicates. Every value in the row is distinct and the run stops at the match it meets.',
      'The article needs data that is not in order, or the story of how the ordering was produced. The row is sorted before anything starts.',
      'The subject is searching a linked structure, a stream, or anything where reaching the middle costs a walk rather than an index calculation.',
    ],

    contrastWith: [
      {
        concept: 'halveTheRange',
        note: 'Counting what a single comparison removes is one claim; carrying those comparisons through to both endings, a match and an empty range, is another.',
      },
      {
        concept: 'requiresSorted',
        note: 'Order is the premise here and the subject there: this is the procedure that runs on sorted input, that is the argument for why the sorting has to hold.',
      },
      {
        concept: 'linearSearch',
        note: 'Both answer whether a value is present, but walking from the front learns about one position per comparison while this learns about a whole side.',
      },
      {
        concept: 'interpolationSearch',
        note: 'Same bounds and same narrowing, except the probe position is computed from the values rather than from the seat numbers.',
      },
    ],
  },
};
