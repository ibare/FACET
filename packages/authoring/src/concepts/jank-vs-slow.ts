/**
 * jankVsSlow 개념 선언.
 *
 * canonical facet 은 `facet:jankVsSlow` — 조각. `origin` 토픽 `frame-deadline`
 * 에서 나온 조각 중 이것 하나만 남았다(나머지는 다른 완제품에 흡수됨). 완제품이
 * 없으니 이 토픽 이름으로 묶는다.
 *
 * 고른 쪽(장마다 일 20ms, 여섯 장)과 들쭉날쭉한 쪽(일 8·8·30·8·40·8·8·8·8ms,
 * 아홉 장)이 같은 속도(px/ms)로 같은 열두 박자 동안 움직인다. 들쭉날쭉한 쪽은
 * 장 수가 더 많아 초당 장 수는 오히려 높지만, 장 사이 간격이 붙었다 벌어졌다
 * 한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const jankVsSlowConcept: FacetConceptSource = {
  id: 'jankVsSlow',
  label: 'Jank vs. Slow (Even Speed, Uneven Frame Spacing)',
  canonicalFacet: 'facet:jankVsSlow',

  surface: {
    definition:
      "Two sides advance at the identical average speed over the same span, but one side's frames land at a fixed interval while the other's per-frame work varies, so its frames arrive at uneven intervals — sometimes closely bunched, sometimes with a wide gap — even as it delivers more frames overall across the same span.",
    exemplarKeywords: [
      'jank',
      'frame time variance',
      'stutter vs slowness',
      'uneven frame pacing',
      'higher frame count can still look worse',
      'frame interval jitter',
      'perceived smoothness',
      'consistent frame timing matters more than raw frame rate',
      'animation stutter',
    ],
  },

  briefing: {
    observable: [
      'Two tracks, a steady side and an uneven side, each carry a marker that only jumps forward on the beats where that side actually receives a new frame — a given beat may update one side, both, or neither.',
      'The steady side\'s frames land one beat apart from each other every time, each captioned with the same gap in milliseconds and the same distance moved.',
      "The uneven side's frames sometimes land close together and sometimes leave a wide gap since its per-frame work varies sharply — each new frame is captioned with its own gap and distance since the previous one, and those numbers differ from one frame to the next on that side.",
      'A running per-side frame count climbs independently on each track as its own new frames arrive, so the two counts fall out of step with each other over the course of the run.',
      'A final beat adds a per-second frame-rate summary for both sides at once, computed over the whole run — the uneven side ends the run with a higher frame count than the steady side despite its visibly irregular spacing.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole fixed twelve-beat run — both sides\' frames landing whenever their own schedule calls for one — on its own and stops after the final summary.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any beat holds that beat\'s gap and distance reading for whichever side just received a frame.',
        'Both sides\' per-frame work durations, their shared speed, and the run length are fixed, so an article can name the exact gap and frame count each side ends up with.',
      ],
    },

    useWhen: [
      'The reader assumes a higher measured frame count always means smoother motion. The uneven side ending with more total frames than the steady side, while its own frames visibly bunch and then gap, next to the steady side\'s lower count but perfectly even spacing, is the corrective.',
      'The article needs to separate "how much, on average" from "how evenly spaced" as two different readings of the same run, with each side\'s own per-frame gap and distance making the difference countable rather than asserted.',
    ],

    avoidWhen: [
      'The article is about why a given frame\'s work took as long as it did — which property changed, which pipeline stage ran. No property or pipeline stage is modeled here, only an abstract per-frame work duration already given as a number.',
      'The article is about a value being coalesced into a single read once per frame. That is a claim about how often data is picked up, not about the frames themselves arriving unevenly (that is justBeforePaint).',
      'The article is about the task queue, timers, or microtasks. No scheduling API appears in this piece — only two tracks advancing on an abstract beat.',
    ],

    contrastWith: [
      {
        concept: 'frameBudget',
        note: "That concept is about how much work fits inside one frame's time slot before something must be dropped or deferred. This one takes a run where every frame does eventually land — some frames just take longer than others to produce — and asks only whether even spacing or a higher average frame count makes the better claim for smoothness.",
      },
    ],
  },
};
