/**
 * reactiveUpdates 개념 선언.
 *
 * canonical facet 은 `facet:reactiveUpdates` — 완제품. 같은 값 여덟 · 뷰 넷 · 쓰기
 * 여덟을 두고 "무엇을 다시 그릴지 아는 방법 + 언제 반영하는지"만 세 가지로 바꿔가며
 * (줄·곧바로 / 줄·모아서 / 훑기) 다시 그리기 수를 손잡이로 견주는 화면이다.
 *
 * 이 개념은 세 방식을 나란히 비교하는 데서 서지, 어느 한 방식을 깊이 설명하는 데서
 * 서지 않는다 — 각 방식을 깊게 보는 자리는 조각 셋(readIsSubscribe · dirtyScan ·
 * coalesceUpdates)이 맡는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const reactiveUpdatesConcept: FacetConceptSource = {
  id: 'reactiveUpdates',
  label: 'Reactive Updates (Three Ways to Know What Changed)',
  canonicalFacet: 'facet:reactiveUpdates',

  surface: {
    definition:
      'The same values, views and order of writes run through three interchangeable strategies for deciding what to redraw and when — immediate subscription-based rerender, deferred subscription-based rerender, and periodic scanning without subscriptions — so the resulting number of renders can be compared directly.',
    exemplarKeywords: [
      'reactive rendering',
      'dependency tracking',
      'change detection',
      'digest cycle',
      'dirty checking vs subscriptions',
      'batching renders',
      'render count comparison',
      'fine-grained reactivity',
      'signals',
      'synchronous vs batched updates',
    ],
  },

  briefing: {
    observable: [
      'On the first pass, values draw a subscribe line to every view that reads them, in the order each view declares its dependencies — the same line-drawing in all three modes.',
      'In sub·sync mode, a write flashes its value card and a point travels along an existing line before the view at the other end updates its text; each write finishes rendering before the next one starts.',
      'In sub·batch mode, a write slides its value into a labelled batch box as a chip instead of touching any view; only when the round\'s writes are done does the box empty and every queued view flash and update together.',
      'In scan mode, a cursor sweeps every value in declared order on every round, comparing each one against what it held after the previous sweep; a card only flashes when that comparison finds a difference.',
      'Two counters accumulate underneath regardless of mode: how many values were looked at, and how many views were re-rendered — the same sequence of writes produces different numbers in each mode.',
      'Switching the mode or the write-count slider restarts the whole round from the original eight values; a round never carries over the value changes of the round before it.',
    ],

    screen: {
      affordances: [
        'Play, step, pause, reset and a speed control drive one round of playback; the round runs to completion on its own.',
        'A segmented slider switches among sub·sync, sub·batch and scan, and a second chooses how many of the eight prepared writes to run (1, 2, 4 or 8) — changing either restarts the round from the same starting values.',
        'A code panel beside the stage shows the round as imperative pseudo-notation, so the reader can line up a write in the code with its effect on the stage.',
      ],
    },

    useWhen: [
      'The article claims automatic reactivity is inherently cheaper than dirty-checking without saying by how much or under what write pattern — running the identical writes through all three modes and reading off the Looked/Rendered counters turns that claim into numbers.',
      'The reader needs immediate-per-write rerendering and end-of-round batched rerendering to register as two settings of the same subscription mechanism rather than as unrelated ideas — both draw the same lines on the first pass, and only the flush timing differs between them.',
    ],

    avoidWhen: [
      'The subject is one of the three mechanisms examined closely — read-time subscription\'s line-drawing and rerun payload, scanning\'s pass-by-pass digest loop, or a single handler\'s queue collapsing writes to the same key. Point to the matching piece instead; this screen exists to compare three mechanisms side by side, not to explain any one of them in depth.',
      'The point is virtual-DOM diffing or tree reconciliation. None of the three modes here diffs a tree — all three decide, at the level of a single named value, whether a view needs to run again.',
    ],

    contrastWith: [
      {
        concept: 'readIsSubscribe',
        note: 'That piece isolates sub·sync\'s line-drawing and shows every rerun payload in detail; this screen reduces the same mechanism to flashes and puts it beside batching and scanning for comparison.',
      },
      {
        concept: 'dirtyScan',
        note: 'That piece slows this screen\'s scan mode down to twelve individual looks across two full passes; here a whole sweep plays as one animated step so its render count can sit next to the other two modes.',
      },
      {
        concept: 'coalesceUpdates',
        note: 'That piece narrows this screen\'s sub·batch mode to a single handler\'s own queue and the case of overwriting an already-queued write; here batching is one of three toggled alternatives across many values and views.',
      },
    ],
  },
};
