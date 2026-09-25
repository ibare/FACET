/**
 * pureFunction 개념 선언.
 *
 * canonical facet 은 `facet:pureFunction` — 원본 목록 `[3, 6, 2]` 에 같은 셈 `change(slot, mul, add)` 의 부르기 셋
 * (A 칸 0 +5 · B 칸 0 ×4 · C 칸 1 +10)을 손잡이의 차례로 부른다. 부르기마다 바뀐 목록의 합을 돌려준다.
 * 다루는 법이 "고치기" 면 차례 여섯이 답 여섯 가지를 내고 끝의 원본도 `[32, 16, 2]` · `[17, 16, 2]` 로 갈린다.
 * "새로 만들기" 면 어느 차례든 A 16 · B 20 · C 21, 원본은 `[3, 6, 2]` 그대로. 코드 패널이 있다 (`runCalls`).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각들은 저마다 한 장면을 쥔다 — 같은 인자로 거듭 불러 출력이 같은가(`pureSameOutput`, 바깥 이름을 읽는 쪽),
 * 부른 뒤 바깥 변수가 바뀌는가(`noSideEffect`), 덮어쓰면 옛 값이 사라지고 베끼면 남는가(`immutableCopy`).
 * 이쪽은 **부르는 차례를 손잡이로 돌려** 받은 목록을 고치는 함수와 제 사본에서 일하는 함수를 가른다. 그래서
 * definition 은 "reordering · permutations · edit a list passed to them · order-dependent · any order" 를 쓰고,
 * 조각이 독점한 낱말(referential transparency · identical arguments · side effect · outside · immutability · copy ·
 * original · overwrite · version)을 쓰지 않는다. 넓은 이름 `pure function` 은 이쪽이 가져온다.
 * 조각 둘이 avoidWhen 에서 밀어낸 "인자로 받은 목록 고치기" 가 바로 이쪽의 자리다.
 *
 * 전제 (화면은 각주를 달지 않는다):
 * - 코드 패널의 `fresh` 는 "새 목록을 만든다" 의 자리다. IR 이 목록을 짓지 못해 부르는 쪽이 버퍼를 건네고,
 *   `changeCopy` 가 부를 때마다 통째로 덮어쓴다. 실제 언어에서는 사본을 짓는다(`[...xs]` · `list(xs)` ·
 *   `new ArrayList<>(xs)` · `new List<int>(xs)` · C++ 은 값으로 받기).
 * - 여섯 언어 모두 목록 매개변수를 공유로 건넨다 — C++ 은 코드 패널이 `std::vector<int>&` 로 받아 뜻을 맞춘다.
 * - A · B · C 는 화면의 이름표이고 코드에서는 번호 0 · 1 · 2 다. 원본 값과 셈은 예로 정한 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pureFunctionConcept: FacetConceptSource = {
  id: 'pureFunction',
  label: 'Pure Functions and Call Order',
  canonicalFacet: 'facet:pureFunction',

  surface: {
    definition:
      'Purity tested by reordering: functions that edit a list passed to them give order-dependent answers across permutations of the same calls, while ones working on a fresh duplicate answer identically in any order.',
    exemplarKeywords: [
      'pure function',
      'impure function',
      'mutating a function argument',
      'modifying a list parameter in place',
      'why does my function change the list I passed',
      'order of function calls changes the result',
      'shared mutable state between calls',
      'defensive copy before modifying',
      'functional programming purity',
      'safe to reorder or parallelise calls',
    ],
  },

  briefing: {
    observable: [
      'A dashed area at the top holds the original list `[3, 6, 2]` as bars with slot numbers from 0. Three call boxes stand in positions 1, 2 and 3, marked A "slot 0 +5", B "slot 0 ×4" and C "slot 1 +10" — three argument sets for one shared computation that updates `xs[slot] = xs[slot] * mul + add` and returns the sum of the changed list.',
      'Under the boxes, "Returned" cards are fixed to the call names, not to the positions: when the order changes, the boxes slide into new positions but A\'s card stays where A\'s card was, so A\'s answer can be compared across orders at a glance.',
      'With Handling on "Modify", the original list itself travels into each box in turn and its bars grow and multiply. Captions run "Order: ABC", "Call: A", "Slot 0: 3 → 8", "Returned: 16", and so on, ending with "Original: [32, 16, 2]" and "Sum: 50".',
      'In Modify, the six orders give six different sets of answers — A alone returns 16, 25, 26 or 35 depending on where it stands — and the original ends as either `[32, 16, 2]` (sum 50) or `[17, 16, 2]` (sum 35).',
      'With Handling on "Make new", each call first detaches a duplicate from the original, changes only the duplicate, returns its sum and discards it. The original bars never move. Every order gives A 16, B 20, C 21, and the original ends as `[3, 6, 2]` (sum 11); changing the order leaves each card on the same number.',
      'The counters hold the current round only: "Writes to original" 3 for Modify and 0 for Make new, "Copies made" 0 and 3, "Original sum" 50 or 35 for Modify and 11 for Make new. A round is 11 steps in Modify and 14 in Make new.',
      'A code panel titled "Code" shows the same computation as `runCalls`, which loops over the order and calls either `changeInPlace` or `changeCopy`, plus `total`; the highlighted line follows the step. The reader adds up to two of Python, JavaScript, TypeScript, Java, C++ and C# with "+ Add language".',
      'In the code panel, `fresh` stands in for building a new list: the caller passes a buffer and `changeCopy` overwrites it whole on every call. Real code would build a copy (`[...xs]`, `list(xs)`, `new ArrayList<>(xs)`, `new List<int>(xs)`, or taking the vector by value in C++). All six languages pass the list parameter by sharing, which is why Modify reaches the caller\'s list; the C++ version takes `std::vector<int>&` to match. A, B and C are screen labels; in the code they are indexes 0, 1 and 2.',
    ],

    screen: {
      affordances: [
        'The bar carries play, single step, pause, reset and a speed slider, plus two handles: Call order (ABC, ACB, BAC, BCA, CAB, CBA — ABC to begin with) and Handling (Modify or Make new — Modify to begin with).',
        'One round plays through and then waits. Turning a handle restarts from the original `[3, 6, 2]` with the new order or handling.',
        'The move that makes the idea land is leaving Handling on Modify and stepping through the orders while watching A\'s card change, then switching to Make new and stepping through them again while every card stays put.',
      ],
    },

    useWhen: [
      'The reader believes a function is safe as long as it returns the right value, and needs to see that one which edits its list argument gives a different answer depending on what ran before it.',
      'The article argues that pure functions can be reordered, cached or run in parallel freely, and wants the same three calls permuted six ways with and without in-place edits.',
      'The article recommends copying an argument before changing it, and needs the original list surviving untouched as the concrete payoff.',
    ],

    avoidWhen: [
      'The impurity in question is a function reading a global or a clock. Every call here depends only on its arguments and the list it is handed.',
      'The article is about I/O, printing or network calls as side effects. The only effect shown is writing into a list passed as an argument.',
      'The subject is persistent data structures or structural sharing. The duplicate here is a full copy of three numbers made and thrown away on every call.',
    ],

    contrastWith: [
      {
        concept: 'pureSameOutput',
        note: 'Same-input-same-output can be tested by calling one function repeatedly while something it reads changes. Testing by permuting several calls exposes a different fault: each call changes the input the next one receives.',
      },
      {
        concept: 'noSideEffect',
        note: 'A side effect is anything a call leaves changed behind it. Editing a received list is one such effect, and its specific consequence is that the order of calls starts to decide every result.',
      },
      {
        concept: 'immutableCopy',
        note: 'Immutability is the discipline of keeping the old version intact beside the new. Purity is the property that discipline buys a function: its answer no longer depends on what was called before.',
      },
      {
        concept: 'passByValueVsReference',
        note: 'How a list reaches a function decides whether an edit inside it can reach the caller at all. Purity asks the next question: once it can, what happens to the answers of calls made in a different order.',
      },
    ],
  },
};
