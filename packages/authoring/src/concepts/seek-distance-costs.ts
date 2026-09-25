/**
 * seekDistanceCosts 개념 선언.
 *
 * canonical facet 은 `facet:seekDistanceCosts` — 팔이 실린더 100 에서 출발해 온 차례 그대로 104 · 30 · 34 · 190 을 받는다.
 * 요청 시간 = 옮겨 간 실린더 수 × 0.1 ms + 고정분 4.0 ms. 4.4 · 11.4 · 4.4 · 19.6 ms, 합 39.8 ms 중 60% 가 탐색이다.
 * 자리가 다른 104 와 34 는 거리가 4 로 같아 시간도 같다. 다섯 걸음, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `diskScheduling` 은 정책 다섯의 총 이동 거리(실린더)를 견준다. `elevatorSweep` 은 받는 차례다. 이쪽은 차례를
 * 고르지 않는다 — 요청 **하나의 시간**이 무엇으로 이루어지는가 하나다. 그래서 definition 은 service time · seek ·
 * rotational latency · transfer · milliseconds · from the arm's current position 쪽 낱말을 쥐고, policy · order 를 쓰지 않는다.
 *
 * 전제: 탐색을 거리 × 0.1 ms 의 선형 모형으로, 회전 + 전송을 요청마다 4.0 ms 로 둔 것은 예로 정한 값이다. 실제 탐색은
 * 짧은 거리에서 선형이 아니고(가속 · 감속 · 자리 잡기), 회전 대기도 요청마다 다르다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const seekDistanceCostsConcept: FacetConceptSource = {
  id: 'seekDistanceCosts',
  label: 'Seek Time Grows With Arm Distance',
  canonicalFacet: 'facet:seekDistanceCosts',

  surface: {
    definition:
      'A disk request\'s service time is a seek that grows with how far the arm must travel from its current cylinder, plus a rotational latency and transfer part that stays the same for every request.',
    exemplarKeywords: [
      'seek time',
      'rotational latency',
      'transfer time',
      'disk access time formula',
      'hard drive latency',
      'why random reads are slow on HDD',
      'head movement cost',
      'milliseconds per request',
      'disk arm travel',
    ],
  },

  briefing: {
    observable: [
      'A cylinder axis from 0 to 199 shows the arm at 100 and four requests at 104, 30, 34 and 190: "Arm: cylinder 100 · Waiting requests: 4". Below, one bar per request is split into "Seek" and "Rotation + transfer", drawn on the same scale as the axis.',
      'Requests are served in arrival order, one per step, each labelled with its sum: "100 → 104 · Distance 4 × 0.1 ms + fixed 4.0 ms = 4.4 ms", then 104 → 30 at 74 cylinders for 11.4 ms, 30 → 34 at 4 for 4.4 ms, and 34 → 190 at 156 for 19.6 ms.',
      'The length the arm travels on the axis becomes the seek part of that request\'s bar; the fixed part has the same width every time.',
      'At the third request the screen notes "Same distance as request 104 · Same time": 104 and 34 lie far apart on the disk, but both were 4 cylinders from the arm.',
      'A running total ends at "Total: seek 23.8 ms + fixed 16.0 ms = 39.8 ms" — 60% of the time went to moving the arm.',
      'Seek as 0.1 ms per cylinder and a flat 4.0 ms for rotation plus transfer are example values. Real seeks are not linear for short distances, because the arm accelerates, decelerates and settles, and real rotational delay varies with where the platter is when the arm arrives.',
    ],

    screen: {
      affordances: [
        'The screen plays the four requests by itself, one per step, and stops at the total.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the third request sets the two equal 4.4 ms bars side by side.',
        'All distances and times are fixed, so an article can quote each sum exactly.',
      ],
    },

    useWhen: [
      'The article breaks disk access time into seek, rotation and transfer, and needs to show that only the seek part changes from request to request.',
      'A reader asks why the order of disk requests matters, and the article wants the observation that time depends on distance from where the arm is, not on where the request lies.',
    ],

    avoidWhen: [
      'The article compares disk scheduling policies. Requests here are taken strictly in arrival order.',
      'The subject is SSD latency. There is no arm and no seek on flash storage.',
      'The point is precise drive timing. The seek model is linear and the fixed part is constant by assumption.',
    ],

    contrastWith: [
      {
        concept: 'diskScheduling',
        note: 'Once time per request is known to follow distance, choosing the order of requests becomes a way to shorten the total, and policies can be ranked by it.',
      },
      {
        concept: 'elevatorSweep',
        note: 'Sweeping in one direction is one rule for keeping each move short; the cost of a single move is what makes such a rule worth having.',
      },
    ],
  },
};
