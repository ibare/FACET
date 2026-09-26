/**
 * readIsSubscribe 개념 선언.
 *
 * canonical facet 은 `facet:readIsSubscribe` — 조각. 뷰가 첫 돌기에서 값을 읽는
 * 순간이 곧 구독이 되고, 그 뒤 쓰기는 그렇게 미리 그어진 줄만 따라간다는 것을
 * 값 넷 · 뷰 셋 · 쓰기 셋으로 보인다. `reactiveUpdates`(완제품)의 sub·sync 방식을
 * 이 한 대목만 떼어 자세히 보인다 — origin 은 그 완제품이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const readIsSubscribeConcept: FacetConceptSource = {
  id: 'readIsSubscribe',
  label: 'Reading Is Subscribing',
  canonicalFacet: 'facet:readIsSubscribe',

  surface: {
    definition:
      'A view reading a value while it first runs is recorded as a subscription edge from that value to that view; a later write to the value looks up only its recorded edges and reruns exactly the views found there, in the order the edges were recorded.',
    exemplarKeywords: [
      'dependency tracking',
      'automatic subscription',
      'read tracking',
      'fine-grained reactivity',
      'signals',
      'implicit subscribe on read',
      'observer registration',
      'selective rerender',
      'reactive dependency graph',
    ],
  },

  briefing: {
    observable: [
      'A value draws a line to a view the first time that view reads it while first running — one line per read, appearing in the order the view\'s dependencies are declared.',
      'A view\'s own output only changes once it has read every value it depends on; reading a value that is not the view\'s last dependency draws the line but leaves the view\'s text untouched.',
      'A write only travels along lines that already exist. It looks up every view recorded at the far end of its value\'s lines and reruns exactly that list, in the order those lines were drawn — nothing else moves.',
      'The banner view reads only theme, so writing price or count never reaches it: no line was ever drawn from either value to banner, and the write step names an empty list of targets.',
      'A redraw count next to the stage rises only by however many views a given write\'s target list actually contained — a write with no lines redraws zero.',
    ],

    screen: {
      affordances: [
        'Values, views and the writes still to come are all listed before anything runs, so the starting shape of the dependency graph is visible before the first line is drawn.',
        'The screen plays through every read and every write on its own; replay and a scrub-back timeline are the only controls, so re-examining one write\'s target list means stepping back to it rather than pausing mid-flow.',
      ],
    },

    useWhen: [
      'The reader assumes a framework must ask every view "did you use this value?" at write time. Watching the line get drawn earlier — while the view is reading — and the write merely follow a line that already exists corrects that.',
      'The article needs a reason writing to theme costs nothing when no view reads theme: the write\'s target list is read off lines already drawn at read time, not computed by searching all views when the write happens.',
    ],

    avoidWhen: [
      'The subject is a value that no view has ever read, i.e. there is no dependency graph to walk yet. Every view here reads before any write runs, so a write always finds either a populated or a deliberately empty target list — this piece never shows a value written with no reader history at all.',
      'The point is deferring or batching what a write triggers. Every write here reruns its full target list to completion before the next write begins.',
      'The article uses "subscribe" for a network broker relationship between publishers, topics and consumers. Here subscribing is a side effect of a pure function reading a value in the same process — there is no message, no broker, and no possibility of joining late.',
    ],

    contrastWith: [
      {
        concept: 'reactiveUpdates',
        note: 'This piece isolates one mode (sub·sync) and shows every read edge and write target list in full; that screen reduces the same mechanism to flashes and places it beside batching and scanning.',
      },
      {
        concept: 'dirtyScan',
        note: 'Here a write finds its readers by following lines drawn in advance at read time; dirtyScan keeps no lines at all and must recheck every watched value against what it last held to recover the same information.',
      },
      {
        concept: 'coalesceUpdates',
        note: 'Both end with a write reaching a view, but here every write reruns its targets immediately and completely; coalesceUpdates asks what happens to several writes queued inside one handler before anything is drawn.',
      },
      {
        concept: 'messagingPubsub',
        note: 'Both use the word "subscribe", but a view here subscribes by merely reading a value in the same process — there is no broker, no topic, and no delivery that could fail to arrive.',
      },
    ],
  },
};
