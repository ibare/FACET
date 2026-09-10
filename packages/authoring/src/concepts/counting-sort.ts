/**
 * countingSort 개념 선언.
 *
 * canonical facet 은 `facet:countingSort` — 입력 줄 · 값 칸(개수 줄 + 시작 자리
 * 줄) · 출력 줄 세 띠를 세우고 그 사이를 꺾인 선으로 잇는다. 값 하나가 자기 값
 * 칸을 거쳐 자리 번호를 받아 출력의 그 자리로 가는 경로가 그림의 전부다.
 * 카운터 셋(Count · Place · Compare)과 여섯 언어 코드 패널을 갖춘 완결형이다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 개념이 지는 것은 **누적합이 자리를 만드는 산술과 그 결과** 다 — 개수가 0 인
 * 값이 앞 값과 같은 자리를 받는 일, 놓을 때마다 자리를 한 칸 밀어 같은 값끼리의
 * 원래 순서가 보존되는 일, 그리고 값의 가짓수만큼 자리를 미리 잡아야 한다는 대가.
 *
 * 견줌이 한 번도 없다는 주장 자체는 조각 `countThenPlace` 의 몫이라, 여기서는
 * definition 의 무게를 누적합과 안정성에 실었다.
 *
 * 변별어를 붙이지 않았다. "counting sort" 는 이 방법 하나를 가리키는 이름이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const countingSortConcept: FacetConceptSource = {
  id: 'countingSort',
  label: 'Counting Sort',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:countingSort',

  surface: {
    definition:
      'A sort for integers in a small range where a cumulative sum of value counts gives each value its first output position and equal values keep their input order.',
    exemplarKeywords: [
      'counting sort',
      'prefix sum',
      'cumulative count',
      'key-indexed counting',
      'stable sort',
      'sorting small integers',
      'ages, grades or scores into order',
      'the building block inside radix sort',
      'count array of size k',
      'linear time sorting',
      'O(n + k)',
    ],
  },

  briefing: {
    observable: [
      'Three bands stand one above another — the input row, the value slots with a count line and a starting-seat line, and the output row — and a folded two-segment line is drawn from an input cell through its value slot to the seat it lands in, so the address calculation is the picture.',
      'This data holds no 1 and no 4, and their count slots stay dotted and empty; on the starting-seat line those two values receive the same seat as the value before them, so the reader sees the addition skipping them by itself rather than a gap being reserved.',
      'The seat number of a value is pushed on by one every time an item is placed there, and because the input is read left to right the earlier of two equal values reaches the earlier seat.',
      'The output is a separate row that fills up while the input row stays as it was, so the extra space the method needs is visible as a second array rather than described.',
      'Three counters run along the bottom — Count, Place and Compare — and the Compare counter is still showing zero when the run ends.',
      'The run is divided into three named steps on screen, and the middle one produces nothing but numbers on the seat line; nothing moves during it.',
      'The code panel shows the two lines that carry the whole method, both of them an index sitting inside another index, and the highlighted line follows the step being played.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset, and a speed slider.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
        'The eight input values and the range of six are fixed and are not shuffled on reset, so the article can name the missing 1 and 4 and rely on them being missing.',
        'The Compare counter is the place to point when the article claims this method never weighs two values against each other — it is read at the end, next to the other two counters.',
      ],
    },

    useWhen: [
      'The article has written out the cumulative sum and the reader can follow the arithmetic without seeing why it produces addresses. The folded line from an input cell through its value slot to a seat is the same arithmetic drawn as a route.',
      'The prose asserts stability and the reader takes it as a label. Watching the seat number advance by one after each placement shows where the property comes from, so it stops being a claim about the method and becomes a consequence of one line.',
      'The reader needs to weigh the trade before choosing this method: the value slots are laid out before any item moves, and the row is exactly as wide as the range allows.',
      'The article is heading toward digit-by-digit sorting and the reader has to be comfortable with a single stable pass before repeating it makes sense.',
    ],

    avoidWhen: [
      'The values in the article are floating point, strings, or drawn from a range too large to lay out — the whole method starts by making one slot per possible value.',
      'The subject is sorting by an arbitrary comparator or a user-supplied ordering. Nothing here consults an ordering; the value is the address.',
      'The point is sorting in place or under a memory bound. A second array is where the answer is built.',
      'The article merely tallies occurrences — a histogram, a frequency table, a word count — and never puts anything in order.',
      'The subject is the lower bound on comparison sorting as a theoretical result. This screen shows a method, not an argument about what methods are possible.',
    ],

    contrastWith: [
      {
        concept: 'countThenPlace',
        note: 'That one isolates the single claim that no pair is ever weighed; this one carries the arithmetic around it — the cumulative sum, the pushed seat, the second array.',
      },
      {
        concept: 'radixSort',
        note: 'This is one stable pass over whole values; that repeats a pass like it once per digit, which is how a large range is handled without a slot per value.',
      },
      {
        concept: 'sortStability',
        note: 'Stability as a property in its own right, against the single line here — advancing the seat after each placement — that produces it.',
      },
      {
        concept: 'mergeSort',
        note: 'Both are stable and both use extra space, but one earns its order by merging compared pairs and the other by arithmetic on counts.',
      },
    ],
  },
};
