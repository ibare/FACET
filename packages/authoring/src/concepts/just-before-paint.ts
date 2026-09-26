/**
 * justBeforePaint 개념 선언.
 *
 * canonical facet 은 `facet:justBeforePaint` — 조각. `origin` 토픽
 * `animation-frame-callback` 은 버려졌고 조각이 이 하나뿐이라, 완제품 없이 이
 * 토픽 이름으로 묶는다.
 *
 * `socket.onmessage` 가 `latest` 를 여러 번 덮어써도, `requestAnimationFrame`
 * 에 건 `draw` 는 박자(프레임)마다 한 번만 불려 그 순간의 `latest` 를
 * `box.textContent` 에 넣는다. `draw` 안에서 다시 건 요청은 같은 박자가 아니라
 * 다음 박자의 몫이 된다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const justBeforePaintConcept: FacetConceptSource = {
  id: 'justBeforePaint',
  label: 'Just Before Paint (requestAnimationFrame Coalesces Updates)',
  canonicalFacet: 'facet:justBeforePaint',

  surface: {
    definition:
      "A value overwritten many times between two frames is written however often it changes, but a callback given to requestAnimationFrame reads it only once per frame, right before that frame's style, layout and paint — coalescing every intervening write into the single value the read finds, and any request the callback makes for the next frame waits for the following frame rather than the current one.",
    exemplarKeywords: [
      'requestAnimationFrame',
      'rAF throttling',
      'coalescing rapid updates',
      'render once per frame',
      'why the UI does not update on every message',
      'reading the latest value right before paint',
      'decoupling data arrival from rendering',
      'update coalescing',
      'frame-aligned rendering',
    ],
  },

  briefing: {
    observable: [
      'A seven-line code panel shows socket.onmessage overwriting a variable, and a draw function that copies it into a text box and re-requests itself via requestAnimationFrame, with the active line highlighted at each step.',
      'A message arriving between two beats overwrites the tracked value, captioned with the old and new value and a running message count; when a message overwrites another that never reached a beat, that earlier value is separately marked as overwritten before any beat.',
      'At each beat, the callback runs exactly once regardless of how many messages arrived since the previous beat, captioned with how many messages were gathered since then and which one (if any) the call actually took.',
      'The callback\'s new request for the next frame is not honored until the following beat, captioned by naming that next beat number explicitly.',
      'Style, layout and paint follow immediately after each call, putting the value the callback took onto the screen and incrementing a paint counter — the screen only ever shows the one value the most recent call took, never an intermediate one.',
      'A closing readout lists the on-screen value, total messages, total calls, total paints, and any message value that was overwritten before a beat ever took it — a value that arrived but was never seen on screen at all.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole fixed timeline of messages and beats on its own and stops after the last beat\'s paint.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any message or beat holds that value and count on screen.',
        'The arrival times and values of every message, and the frame rate the beats land at, are fixed, so an article can name exactly which values were coalesced into which call.',
      ],
    },

    useWhen: [
      'The reader assumes the UI updates on every incoming message, or that requestAnimationFrame runs as often as data arrives. The coalesced call count — one per beat no matter how many messages landed since the last one — and the explicit callout of values never seen on screen are the corrective.',
      'The article explains why re-requesting requestAnimationFrame from inside the callback still only fires on the next frame rather than immediately or twice within the same one.',
    ],

    avoidWhen: [
      'The article is about frame timing irregularity, or frames arriving at uneven intervals. Every beat here lands exactly on schedule; nothing about jittery or dropped frame arrival is modeled (that is jankVsSlow).',
      'The article is about the cost of layout, paint or compositing for a specific changed property. Style, layout and paint are shown here as one fixed bundle after every call, not broken apart by which property changed (that is repaintCost).',
      'The article is about setTimeout, the task queue, or timer lateness. Nothing here is scheduled through the task queue; everything hinges on requestAnimationFrame\'s once-per-frame callback list.',
    ],

    contrastWith: [
      {
        concept: 'frameBudget',
        note: "This is one case of that budget already in use — a single requestAnimationFrame callback squeezed in before one frame's style, layout and paint, no matter how many messages arrived in between. That concept is about how much total work fits inside a frame's time slot before something has to be dropped or deferred, rather than about one already-cheap callback being called just once.",
      },
    ],
  },
};
