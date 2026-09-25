/**
 * elevatorSweep 개념 선언.
 *
 * canonical facet 은 `facet:elevatorSweep` — 팔이 90 에서 위로 가는 중이고, 온 차례는 150 · 40 · 120 · 20 · 170 · 95 다.
 * 팔은 가는 쪽에서 가장 가까운 것을 받고, 두 번째를 받은 직후 110 · 185 가 새로 온다 — 185 는 앞이라 이번 훑기에, 110 은
 * 뒤라 돌아온 뒤에. 받은 차례 95 · 120 · 150 · 170 · 185 · 110 · 40 · 20, 돌아서기 한 번. 열한 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `diskScheduling` 은 정책 다섯의 총 이동 거리를 견준다. `seekDistanceCosts` 는 요청 하나의 시간이다. 이쪽은 거리를
 * 세지 않는다 — **온 차례와 받는 차례가 어떻게 갈리는가** 하나다. 그래서 definition 은 arrival order · direction of travel ·
 * reverses only when · newcomers ahead or behind 쪽 낱말을 쥐고, total movement · five policies · milliseconds 를 쓰지 않는다.
 *
 * 전제: LOOK 꼴이다 — 끝 실린더까지 가지 않고 곧바로 돌아선다(SCAN 도 이 예에서 받는 차례는 같다). 새 요청이 오는 때는
 * 시각이 아니라 받은 요청 수로 정했다. 시간은 셈하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const elevatorSweepConcept: FacetConceptSource = {
  id: 'elevatorSweep',
  label: 'Elevator Algorithm (Sweep, Then Turn Back)',
  canonicalFacet: 'facet:elevatorSweep',

  surface: {
    definition:
      'Under the elevator algorithm the disk arm ignores arrival order, serving the nearest request in its direction of travel and reversing only when none remain ahead; a new request behind it waits for the return pass.',
    exemplarKeywords: [
      'elevator algorithm',
      'SCAN disk scheduling',
      'LOOK algorithm',
      'arrival order vs service order',
      'disk arm direction',
      'requests arriving during a sweep',
      'one-directional sweep',
      'why the arm does not zigzag',
    ],
  },

  briefing: {
    observable: [
      'An "Arrival order" row at the top holds 150 · 40 · 120 · 20 · 170 · 95, each with a line down to its place on a 0–199 cylinder axis; the lines cross wherever arrival order and position disagree. The arm stands at 90: "Requests wait in arrival order. The arm is heading up." A shaded band marks the side ahead of the arm.',
      'Each step pulls one request out: "Nearest request ahead of the arm is served: cylinder 95, #1", then 120 as #2. The served request leaves a gap in the top row and drops into the next slot of the "Service order" row below.',
      'After the second, "New requests arrive. Ahead of the arm: this sweep. Behind: after the turn." 185 is tagged "ahead" and 110 "behind".',
      'The arm continues up through 150, 170 and 185, then "Nothing left above the arm. It turns down." and the band flips. It serves 110, 40, and finally "Last request served: cylinder 20, #8. Turns: 1".',
      'The service order is 95 · 120 · 150 · 170 · 185 · 110 · 40 · 20. Taking the first six in arrival order would have reversed the arm five times.',
      'This is the LOOK form: the arm turns at the last request instead of running on to cylinder 199 or 0; the SCAN form would serve the same order here with more travel. New arrivals are timed by the number of requests served, not by a clock, and no time or distance is totalled.',
    ],

    screen: {
      affordances: [
        'The screen plays eleven steps by itself — eight services, one arrival and one turn after the start — and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the arrival step shows 185 and 110 tagged ahead and behind.',
        'All cylinder numbers are fixed, so an article can quote the order exactly.',
      ],
    },

    useWhen: [
      'The article explains the elevator (SCAN/LOOK) idea: the arm reorders the queue by position and direction, not by who came first.',
      'A reader asks what happens to a request that arrives mid-sweep, and the article needs one arrival ahead of the arm served on this pass and one behind it left for the return.',
    ],

    avoidWhen: [
      'The article ranks disk scheduling policies by total movement. No distances are summed and no other policy is shown.',
      'The subject is circular variants such as C-SCAN or C-LOOK that jump back instead of reversing. The arm here reverses.',
      'The point is seek time in milliseconds. Time is not counted.',
    ],

    contrastWith: [
      {
        concept: 'diskScheduling',
        note: 'The sweep rule decides an order; whether that order moves the arm less than nearest-first or first-come depends on where the arm starts, which is a comparison across policies.',
      },
      {
        concept: 'seekDistanceCosts',
        note: 'Reordering by position is worthwhile because each request\'s time grows with the distance from the arm; the sweep is one way to keep those distances short.',
      },
    ],
  },
};
