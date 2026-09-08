/**
 * heapBinary 개념 선언.
 *
 * canonical facet 은 `facet:heapBinary` — 배열 한 줄과 나무를 한 화면에 같이
 * 그리고, 넣기 · 빼기 · 한 번에 힙으로 · 정렬 네 연산과 누적 카운터 넷,
 * 그리고 코드 패널을 갖춘 완결형이다.
 *
 * 화면은 mount 직후 씨앗 여섯 값을 하나씩 넣는 시연을 한 번 보인 뒤 멈추고,
 * 그때부터 독자의 입력을 기다린다. 값을 몰아 넣어 봐야 드러나는 것 —
 * 한 번에 힙으로 만드는 쪽이 견줌을 얼마나 덜 쓰는지, 꼭대기를 계속 빼면
 * 정렬이 어떻게 딸려 나오는지 — 이 이 화면의 몫이다.
 *
 * 변별어를 붙인 이유: 이진 힙 말고도 피보나치 힙 · 이항 힙이 모두 "힙" 을
 * 자칭하고, 언어 런타임의 동적 할당 영역도 같은 이름을 쓴다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const heapBinaryConcept: FacetConceptSource = {
  id: 'heapBinary',
  label: 'Binary Heap (Min-Heap)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:heapBinary',

  surface: {
    definition:
      'A complete binary tree held in a flat array where every parent precedes its children, so the smallest value always sits at index 0.',
    exemplarKeywords: [
      'binary heap',
      'min-heap',
      'priority queue',
      'heapify',
      'build heap',
      'heap sort',
      'extract-min',
      'insert into a heap',
      'scheduler picks the earliest deadline',
      'top-k',
    ],
  },

  briefing: {
    observable: [
      'The array is drawn as a numbered row and the tree hangs below it, and the same value is painted in both at once — a comparison lights up two cells and two circles together.',
      'On mount six values go in one at a time, each landing in the last cell before it starts climbing, so the reader sees a heap being built rather than a finished one.',
      'Values often stop after a single swap, or after none at all, instead of reaching the top — the climb ends at the first parent the new value does not precede.',
      'Extracting takes the top value away, seats the last value in its place and sends it back down, choosing the smaller of the two children before each step.',
      'Heapify shuffles the values first and then repairs the whole array from the last parent backwards — without the shuffle the array is already a heap and the operation would show nothing.',
      'Sorting drains the heap into the back of the same array in a different fill, so the tree shrinks from the front while the sorted tail grows from the back, with no second array in sight.',
      'Four counters run along the bottom — compares, swaps, inserts, extracts — and the compare counter is what makes the two routes to a heap comparable rather than merely described.',
      'The heap holds fifteen values; a sixteenth insert is refused with a caption naming the limit instead of silently doing nothing.',
    ],

    screen: {
      affordances: [
        'The reader drives this screen. It builds a heap from six values on mount, then stops and waits.',
        'The controls are one value field plus Insert, Extract, Heapify, Sort and Reset. A non-numeric or empty field still inserts — a random value goes in — so the button never appears broken.',
        'The code panel starts empty with an Add language button; once a language is picked, the line matching the current step is highlighted as the animation runs.',
        'The way to make the cost of heapify visible is to note the compare counter, press Heapify, and read it again.',
      ],
    },

    useWhen: [
      'The prose claims that building a heap in one pass is cheaper than inserting values one at a time, and the reader has no way to weigh that. Running both routes on the same values and reading the compare counter after each is what turns the claim into a number.',
      'The article treats a heap and heap sort as two separate subjects. Emptying the top repeatedly until the sorted tail has eaten the whole array shows they are one machine seen from two sides.',
    ],

    avoidWhen: [
      'The article uses "heap" for the memory region a program allocates from. That is an unrelated meaning of the word and nothing here speaks to allocation.',
      'The subject is a Fibonacci, binomial or pairing heap, or the cost of merging two heaps. Those exist for merge and decrease-key, neither of which is an operation here.',
      'The point is a priority queue\'s interface rather than its storage — priority tuples, tie-breaking, decrease-key, cancelling a queued job.',
      'The article needs ordered iteration, range queries or the k-th smallest read in order. Only the front value is ever known.',
    ],

    contrastWith: [
      {
        concept: 'bst',
        note: 'Both keep an ordering rule between a parent and its children, but a search tree orders every value against every other and a heap only ever knows which one comes first.',
      },
      {
        concept: 'queueFifo',
        note: 'Both hand out one element at a time; the queue decides by arrival order and this decides by value, which is the whole difference between waiting and priority.',
      },
      {
        concept: 'bubbleSort',
        note: 'Two ways of sorting by repeated comparison — one scans neighbours over and over, the other pays once to build a structure and then takes the front repeatedly.',
      },
    ],
  },
};
