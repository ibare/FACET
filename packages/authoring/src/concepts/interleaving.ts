/**
 * interleaving 개념 선언.
 *
 * canonical facet 은 `facet:interleaving` — 스레드 A(`show "x"` · `show "y"`)와 B(`show "1"` · `show "2"`). 한 걸음이
 * 한 판이고, 판마다 네 줄이 한 실행 줄로 끼워 든다. 판은 사전순으로 여섯 — `x y 1 2` · `x 1 y 2` · `x 1 2 y` ·
 * `1 x y 2` · `1 x 2 y` · `1 2 x y`, 넘어감 1 · 3 · 2 · 2 · 3 · 1. 끝에 "Merged orders: 6 · Arrangements of the
 * outputs: 24". 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mutex` 는 차례를 돌림 몫이 정하게 하고 공유 값이 어떻게 틀어지는지를 본다. 이쪽은 공유 값이 없다 — 주장은
 * **섞인 차례가 각 스레드의 제 차례를 지킨다, 그래서 가능한 차례는 끼워 맞추는 방법의 수뿐** 하나다. 그래서 definition 은
 * merged sequence · keeps each thread's own order · six of 24 를 독점하고, 공유 값 · 잃은 올림 · 자물쇠는 쓰지 않는다.
 *
 * 전제 (설명 글 `interleaving.md`): CPU 하나 · 한 틱 한 줄. 실제 스케줄러가 어느 판을 고를지는 알 수 없다 — 가능한 판을
 * 모두 늘어놓았다. 코드는 가상 표기(`show`).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const interleavingConcept: FacetConceptSource = {
  id: 'interleaving',
  label: 'Interleaving (Merged Orders of Two Threads)',
  canonicalFacet: 'facet:interleaving',

  surface: {
    definition:
      'Two threads on one CPU run as a single merged sequence that keeps each thread\'s own statement order, so the only possible orders are the ways of fitting the two sequences together: six of the 24 orders of four outputs.',
    exemplarKeywords: [
      'interleaving',
      'thread interleaving',
      'execution order of concurrent threads',
      'concurrency on a single core',
      'program order is preserved within a thread',
      'number of possible interleavings',
      'nondeterministic output order',
      'time-sharing threads',
    ],
  },

  briefing: {
    observable: [
      'Thread A holds `show "x"` then `show "y"`; thread B holds `show "1"` then `show "2"`. They share no value and only print. A central "Run" row takes the merged order, and "Orders so far" collects each finished one.',
      'Each step is one whole order. The two threads\' cards first sidestep to the cells they will take this time, then drop one by one into the Run row in execution order.',
      'The six orders appear in dictionary order: `x y 1 2`, `x 1 y 2`, `x 1 2 y`, `1 x y 2`, `1 x 2 y`, `1 2 x y`. A yellow mark sits wherever two neighbouring lines belong to different threads — a switch — and the caption counts them: "Switches: 1", 3, 2, 2, 3, 1.',
      'Even while sidestepping, the `x` card stays left of `y` and `1` stays left of `2`; no order ever prints `y` before `x`.',
      'The last step reads "Order 6 · Switches: 1 · Merged orders: 6 · Arrangements of the outputs: 24".',
      'One CPU runs one line per tick. A real scheduler could pick any of the six and which it picks cannot be predicted; the screen lists all of them instead. The code uses a small language-neutral notation (`show` prints). The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the six orders by itself, one per step, and stops after the sixth.',
        'A Replay button and a playback strip sit below it. Stepping between two neighbouring orders shows which cards moved and which kept their relative place.',
      ],
    },

    useWhen: [
      'The article introduces concurrency on a single processor and needs the idea that threads take turns line by line, with each thread\'s own order intact, before any shared data enters.',
      'A reader thinks concurrent output can come out in any order at all; the six merged orders out of 24 arrangements pin down what can and cannot happen.',
    ],

    avoidWhen: [
      'The article is about wrong results from shared variables. Nothing is shared here; only print order changes.',
      'The subject is instruction reordering by the compiler or processor, or memory models. Each thread\'s order is strictly kept.',
      'The point is how the scheduler chooses between threads. All possible orders are enumerated rather than one being chosen.',
    ],

    contrastWith: [
      {
        concept: 'mutex',
        note: 'Interleaving counts which merged orders are possible; the mutex question is what one of those orders does to a shared value, and how a lock takes the danger out of all of them.',
      },
      {
        concept: 'lostUpdate',
        note: 'With nothing shared, every interleaving is harmless and only the print order differs; once two threads read and write the same value, some interleavings lose work.',
      },
    ],
  },
};
