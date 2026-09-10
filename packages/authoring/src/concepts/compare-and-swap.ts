/**
 * compareAndSwap 개념 선언.
 *
 * canonical facet 은 `facet:compareAndSwap` — 서로 떨어진 짝 셋을 차례로 다루는
 * 조각이다. 점선 칸(자리) 위에 타일(값)이 얹혀 있고, 견주면 두 값이 살짝 들렸다가
 * 판정이 참일 때만 호를 타고 엇갈려 서로의 자리로 건너간다. 셋 중 자리를 바꾸는
 * 것은 하나뿐이다 — 어긋난 짝 하나, 이미 순서가 맞은 짝 하나, 두 값이 같은 짝 하나.
 *
 * ── 묶음 안에서 무엇을 맡는가
 *
 * 형제 `bubbleAdjacentSwap` 은 짝들이 줄지어 이어질 때 무엇이 생기는지를 말하고,
 * `bubbleSort` 는 그 이음을 되풀이하는 절차 전체를 말한다. 이 조각은 그보다 한
 * 층 아래 — **짝 하나 안에서 견줌과 맞바꿈이 서로 다른 연산이라는 것** 하나만
 * 말한다. 그래서 definition 의 무게중심은 정렬도 배열도 아니고 두 연산의 관계,
 * 곧 판정과 조건부 쓰기다.
 *
 * avoidWhen 첫 줄이 이 개념의 존재 이유에 가깝다 — 같은 이름의 원자적 CAS 명령이
 * 동시성 문헌에 널려 있어, 이름만으로는 반드시 오검출된다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const compareAndSwapConcept: FacetConceptSource = {
  id: 'compareAndSwap',
  label: 'Comparing Versus Swapping',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:compareAndSwap',

  surface: {
    definition:
      'Comparing asks whether two values are out of order and changes nothing, while swapping is the write that happens only when the answer to that question is yes.',
    exemplarKeywords: [
      'comparison count versus swap count',
      'conditional write',
      'reads and writes cost differently',
      'why equal values are left alone',
      'nearly sorted input does almost no work',
      'exchanging two variables',
      'moving large records is expensive',
      'the primitive step of a comparison sort',
      'counting operations in an algorithm',
    ],
  },

  briefing: {
    observable: [
      'Seats and values are drawn as separate things — a dotted outline stays fixed and a tile sits on top of it, so a value can leave a seat without the seat moving.',
      'A comparison lifts both tiles slightly and prints the verdict between them; the row is otherwise unchanged when the lift ends.',
      'Only the out-of-order pair actually moves, and the two tiles cross simultaneously along arcs into each other\'s seats rather than one pushing the other aside.',
      'The already-ordered pair and the equal pair both settle straight back down, with captions giving different reasons — ordered, and nothing to order.',
      'The crossing arc is left behind only on the pair that moved, so the finished screen shows at a glance that three judgments produced one movement.',
      'The closing caption states both totals — how many comparisons were made and how few of them moved anything.',
    ],

    screen: {
      affordances: [
        'Three pairs play through on their own and the screen stops on the summary.',
        'Two buttons: Replay, and a step control that rewinds and advances one judgment or one movement at a time, which is how a reader can stop between the verdict and its consequence.',
        'The three pairs are fixed and deliberately chosen — out of order, already ordered, and equal — so the article can refer to each case by name.',
      ],
    },

    useWhen: [
      'The article counts comparisons and swaps as separate costs and the reader does not yet see why one number cannot stand in for the other.',
      'A sort is being described as "moving values around" and the reader needs to see that most comparisons move nothing at all before an argument about nearly sorted input can land.',
      'The rule that equal values are left in place is about to be used, and the reader should see that no movement follows an equal verdict.',
    ],

    avoidWhen: [
      'The article means the atomic compare-and-swap (CAS) instruction — lock-free stacks, spin loops, ABA problems, std::atomic. That is a hardware primitive about concurrent updates and has nothing to do with this screen.',
      'The subject is a full sorting algorithm and how the pairs are chosen. The three pairs here stand apart from one another and never form a single array.',
      'The point is comparator design for compound keys or custom orderings. Every judgment here is a plain numeric ordering.',
    ],

    contrastWith: [
      {
        concept: 'bubbleAdjacentSwap',
        note: 'This isolates one pair to separate the judgment from the write; that one chains such pairs across a row and shows what the chain leaves at its end.',
      },
      {
        concept: 'sortStability',
        note: 'Leaving equal values untouched is the rule stated here, and stability is what that rule buys once a whole sort is built out of these steps.',
      },
      {
        concept: 'insertIntoSortedPart',
        note: 'Both move values by an ordering test, but insertion shifts a run of elements to open a gap while this exchanges exactly two.',
      },
    ],
  },
};
