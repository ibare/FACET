/**
 * clocksDrift 개념 선언.
 *
 * canonical facet 은 `facet:clocksDrift` — 시계 A(+40 ppm)와 B(−25 ppm)가 참 0h 에 어긋남 0 에서 출발해 한 시간마다
 * A 는 144 ms 앞서고 B 는 90 ms 처진다. 참 3h 에 A, B 가 차례로 시간 서버 S 와 맞추면 +10.0 · −4.0 ms 로 좁혀지되
 * 0 이 되지 않고, 같은 기울기로 다시 벌어진다(4h 248.0 · 5h 482.0 ms). 스스로 재생하고 멈춘다(걸음 여덟).
 *
 * ── 묶음 안에서의 자리
 *
 * `clockSync`(완제품)는 빠르기 · 맞춤 주기를 돌려 메시지가 거꾸로 서는 수를 센다. 이쪽은 그 전제 한 장면 —
 * **시계가 왜 벌어지고, 맞춰도 왜 0 이 되지 않는가**. 사건의 순서는 나오지 않는다. 그래서 definition 은 rate ·
 * offset · round trip · asymmetric path · residual 쪽 낱말을 쥐고, message order · inverted · Lamport 를 쓰지 않는다.
 *
 * 전제 (화면 각주 없음 — 설명 글 `clocksDrift.md`):
 *  - +40 · −25 ppm 과 길 지연(A 30 · 10 ms, B 12 · 20 ms)은 예로 정한 값이다. S 는 받자마자 돌려준다(T3 = T2).
 *  - θ 를 한 번에 더한다 — 실제 NTP 는 흔히 slew 로 천천히 따라잡는다.
 *  - 빠르기는 온도와 나이로도 바뀌지만 여기서는 고정이다.
 *  - 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const clocksDriftConcept: FacetConceptSource = {
  id: 'clocksDrift',
  label: 'Clock Drift and Residual Offset After NTP Sync',
  canonicalFacet: 'facet:clocksDrift',

  surface: {
    definition:
      'Computer clocks tick at slightly different rates, so their offsets from true time grow steadily; syncing with a time server shrinks each offset but leaves half the round-trip path asymmetry, and drift resumes.',
    exemplarKeywords: [
      'clock drift',
      'ppm clock error',
      'quartz oscillator accuracy',
      'NTP offset calculation',
      'theta = ((T2 - T1) + (T3 - T4)) / 2',
      'asymmetric network delay',
      'why clocks need periodic resync',
      'time server',
      'Cristian algorithm',
      'two computers show different times',
    ],
  },

  briefing: {
    observable: [
      'The horizontal axis is true time from 0 h to 5 h and the vertical axis is "Offset (ms)", a clock\'s reading minus true time. A thick centre line is "Time server S", whose clock is taken as true time. Labels show "Clock A · Rate: +40 ppm" and "Clock B · Rate: −25 ppm".',
      'Both start at +0.0 ms. Each hour A moves 144 ms ahead and B 90 ms behind, and a bracket joining the two ends reads "Gap between the clocks": 234.0, 468.0, 702.0 ms by 3 h.',
      'At 3 h Clock A syncs with S: "Sync Clock A ↔ Time server S: correction θ −422.0 ms · Offset of Clock A: +432.0 → +10.0 ms". Then Clock B: θ +266.0 ms, −270.0 → −4.0 ms. The gap falls to 14.0 ms.',
      'A small inset, "Left after sync" at a scale of ±20 ms, magnifies what remains near the centre line: A +10.0 ms and B −4.0 ms. The remainder is half the difference between the outbound and return paths — A goes in 30 ms and returns in 10, B goes in 12 and returns in 20.',
      'After syncing the rates are unchanged, so both lines leave from their new points at the same slopes: 248.0 ms apart at 4 h and 482.0 ms at 5 h. The graph becomes a sawtooth.',
      'The run is eight steps counting the start: 0 h, 1 h, 2 h, 3 h, sync A, sync B, 4 h, 5 h.',
      'The rates +40 and −25 ppm and the path delays are example values within the usual range for quartz; real rates also shift with temperature and age. The server replies the instant it receives (T3 = T2), and the correction θ is applied in one step, whereas NTP normally slews the clock gradually so time never runs backward. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight steps by itself and stops at 5 h.',
        'A Replay button and a playback strip sit below it. Dragging between the two sync steps and 4 h shows the offsets dropping to a few milliseconds and then leaving again at the old slopes.',
        'Rates, delays and every offset are fixed, so an article can quote each θ and gap exactly.',
      ],
    },

    useWhen: [
      'The article explains why two servers disagree about the time even right after both synchronized with NTP, and needs the leftover offset tied to unequal network paths rather than to error in the server.',
      'A reader asks why clock synchronization must be repeated rather than done once; the same slope carrying on after the correction answers it.',
    ],

    avoidWhen: [
      'The subject is ordering events or messages by timestamp. No messages between the two clocks are shown.',
      'The article is about logical clocks, vector clocks or causality.',
      'The topic is leap seconds, time zones or daylight saving.',
    ],

    contrastWith: [
      {
        concept: 'clockSync',
        note: 'Drift and imperfect synchronization are the cause. Whether they make timestamped messages appear out of order, and how often one must resync to limit that, is the downstream effect.',
      },
      {
        concept: 'happensBefore',
        note: 'Drifting clocks are the reason physical time cannot order events across machines. Happens-before drops physical time altogether and orders events only through the messages that connect them.',
      },
    ],
  },
};
