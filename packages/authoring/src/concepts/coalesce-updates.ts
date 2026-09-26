/**
 * coalesceUpdates 개념 선언.
 *
 * canonical facet 은 `facet:coalesceUpdates` — 조각. 한 처리기 안에서 상태를 세 번
 * 쓰더라도 화면은 처리기가 끝날 때 딱 한 번만 다시 그려진다는 것을, 이미 모아 둔
 * 자리를 두 번째 쓰기가 덮어쓰는 경우까지 포함해 보인다. `reactiveUpdates`(완제품)의
 * 줄·모아서 방식을 한 처리기 내부의 한 자리 겹쳐쓰기로 좁혀 보인다 — origin 은 그
 * 완제품이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const coalesceUpdatesConcept: FacetConceptSource = {
  id: 'coalesceUpdates',
  label: 'Coalescing Writes Within One Handler',
  canonicalFacet: 'facet:coalesceUpdates',

  surface: {
    definition:
      'Several writes to state inside a single handler are queued rather than drawn immediately, a later write to an already-queued name overwrites the pending value in place instead of adding a second entry, and the queue is drawn exactly once when the handler finishes.',
    exemplarKeywords: [
      'batched updates',
      'update coalescing',
      'render scheduling',
      'single re-render per event handler',
      'setState batching',
      'deduping writes to the same key',
      'flush at end of handler',
      'microtask flush',
    ],
  },

  briefing: {
    observable: [
      'A handler writes left, then top, then left again — three writes to two named slots — and none of the three draws anything on the screen by itself.',
      'The second write to left replaces the value still queued from the first, before that first value was ever drawn; the queue holds one pending value per name, not a history of every write.',
      'Only when the handler ends does the queue turn into a single draw: the screen jumps once straight to left 90, top 20, and the intermediate left 40 is never drawn at all.',
      'A count of scheduled draws goes from 0 to 1 on the very first write and stays at 1 through the second and third — scheduling happens once, even though writing happens three times.',
      'The handler\'s four-line body is shown as pseudo-notation before anything runs, and each write step highlights the line of code it corresponds to as it happens.',
    ],

    screen: {
      affordances: [
        'The handler\'s code, the screen\'s starting position and the queue are all visible before anything runs, so a reader can already see there are three writes and two names.',
        'The screen plays the whole handler — all three writes and the single flush — on its own; replay and a scrub-back timeline are the only controls.',
      ],
    },

    useWhen: [
      'The reader assumes three writes inside one function must mean three redraws, one right after each write. Watching all three enter a queue and only one draw happen at the very end corrects that.',
      'The article needs to explain why overwriting the same field twice before it is ever drawn is free: the second write to left simply replaces the queued value, since there was never a first draw for it to invalidate.',
    ],

    avoidWhen: [
      'The subject is scheduling across multiple separate handlers, event turns, or a microtask/animation-frame flush mechanism. This piece never leaves a single handler; the flush is the handler\'s own last step, not a separately scheduled callback.',
      'The point is which views or subscribers get notified of a change. There are no views or reads here at all — a fixed two-field screen and a queue are the entire mechanism.',
      'The article contrasts batching against writing with no batching at all, where every write draws immediately. This piece only shows the batched side of that contrast.',
    ],

    contrastWith: [
      {
        concept: 'reactiveUpdates',
        note: 'This piece narrows that screen\'s sub·batch mode to a single handler\'s own queue and the case of overwriting an already-queued write; that screen runs the same batching as one of three toggled modes across many values and views.',
      },
      {
        concept: 'readIsSubscribe',
        note: 'There, a write finds its targets by following lines drawn when views first read; here there are no views or lines at all — a write only ever queues a value under its own name.',
      },
      {
        concept: 'dirtyScan',
        note: 'Both draw the screen only once for multiple changes, but here that single draw is scheduled on purpose as the handler\'s last step; dirtyScan has no schedule at all and instead discovers the change later by re-examining every watched value.',
      },
    ],
  },
};
