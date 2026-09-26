/**
 * dirtyScan 개념 선언.
 *
 * canonical facet 은 `facet:dirtyScan` — 조각. 구독(줄)이 전혀 없을 때 값 하나가
 * 바뀌었다는 것을 알아내려면 지켜보는 값 전부를 처음부터 끝까지 훑어 지난번 본
 * 값과 견주는 수밖에 없다는 것을, 값 여섯 · 쓰기 하나 · 두 바퀴로 보인다.
 * `reactiveUpdates`(완제품)의 훑기 방식을 이 한 대목만 떼어 느리게 보인다 —
 * origin 은 그 완제품이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dirtyScanConcept: FacetConceptSource = {
  id: 'dirtyScan',
  label: 'Dirty Checking by Scanning',
  canonicalFacet: 'facet:dirtyScan',

  surface: {
    definition:
      'With no record of who reads what, discovering that a value changed requires comparing every watched value against the value last recorded for it, one at a time, once per pass, and repeating full passes until an entire pass finds nothing different.',
    exemplarKeywords: [
      'dirty checking',
      'digest cycle',
      '$digest',
      'Angular dirty checking',
      'watchers',
      'value comparison',
      'polling for changes',
      'change detection without subscriptions',
      'scan and compare',
    ],
  },

  briefing: {
    observable: [
      'A write to one watched value happens before any scanning starts and changes it directly — nothing is emitted to any watcher, and the caption states that nobody is notified.',
      'A cursor moves through all six watched values in the same fixed order on every pass, regardless of whether the values earlier in that order changed; a pass never stops partway through.',
      'Each look compares the value now held against the value last recorded for that same watcher, one watcher at a time — every one of the six is looked at even though only one was written.',
      'Only when a look finds a difference does that watcher\'s last-seen value update and its card redraw; a look that finds no difference still costs a step but redraws nothing.',
      'A second full pass over all six values runs after the first, even though the first pass already found and recorded the one difference — only a pass that finds zero differences is allowed to stop the scan.',
      'A running count of how many values have been looked at climbs by six every pass, reaching twelve by the time the scan settles, next to a separate count of how many turned out different.',
    ],

    screen: {
      affordances: [
        'The six watched values and the one write to come are listed before anything runs, so the size of what has to be scanned is visible up front.',
        'The screen plays the write and both full passes on its own; replay and a scrub-back timeline are the only controls, so comparing one look against an earlier one means stepping back to it.',
      ],
    },

    useWhen: [
      'The reader assumes that without subscriptions a runtime could still somehow know which single value changed. Watching every one of six values get looked at — including the five that did not change — shows there is no shortcut available.',
      'The article needs to justify why a second full pass runs after the first already found the change: watchers were updated to their new values during the first pass, so only a pass that finds zero differences can prove nothing is left to settle.',
    ],

    avoidWhen: [
      'The subject is how the number of watched values scales to hundreds or thousands. Six is chosen here to keep every single look visible, not to make a claim about cost at scale.',
      'The point is what a subscription-based runtime does instead. This piece has no lines and no views reading values — only watchers and the last value each one recorded.',
      'The article is about a digest loop that fails to settle. The pass limit here exists only to throw if that ever happened; the scene shown always settles in exactly two passes.',
    ],

    contrastWith: [
      {
        concept: 'reactiveUpdates',
        note: 'This piece slows one round of scan mode down to twelve individual looks across two passes; that screen runs the whole sweep as a single animated step so its render count can sit beside the other two modes.',
      },
      {
        concept: 'readIsSubscribe',
        note: 'Here nothing is recorded about who reads what, so a change is found by comparing every watched value against its last-seen value; there, a value knows exactly which views to rerun because reading drew a line in advance.',
      },
      {
        concept: 'coalesceUpdates',
        note: 'Both concern a delay before anything is redrawn, but here the delay is the unavoidable cost of having no subscriptions at all; coalesceUpdates has subscriptions and delays the draw on purpose, to draw once instead of three times.',
      },
    ],
  },
};
