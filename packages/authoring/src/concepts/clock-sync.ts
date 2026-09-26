/**
 * clockSync 개념 선언.
 *
 * canonical facet 은 `facet:clockSync` — 프로세스 셋(P1 · P2 · P3)의 시계가 저마다 빠르기로 벌어지고, 메시지 열둘을
 * **물리 도장**과 **램포트 수** 두 눈으로 나란히 본다. 손잡이 둘 — 빠르기 배수(0 · 1 · 2 · 4 · 8, 처음 4)를 올리면
 * 받음이 보냄보다 앞선 메시지가 늘고, 다시 맞춤 주기(없음 · 8 · 4 · 2 분, 처음 없음)를 줄이면 준다(배수 4 에서 6 · 3 · 1 · 1).
 * 램포트 쪽 거꾸로는 스무 조합 모두 0.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `clocksDrift` 는 시계 둘이 벌어지고 서버와 맞춰도 0 이 되지 않는 장면, `happensBefore` 는 잇는 길이 있는 짝만
 * 먼저라고 말할 수 있다는 장면이다. 이쪽은 **돌리면 무엇이 갈리는가** — 빠르기 · 맞춤 주기 ↔ 거꾸로 선 메시지 수,
 * 그리고 그 손잡이에 램포트 쪽은 꿈쩍하지 않는다는 견줌. 그래서 definition 은 timestamp · receive before send ·
 * resynchronization interval · never inverts 쪽 낱말을 쥐고, ppm · round trip · concurrent · path 를 쓰지 않는다.
 *
 * 전제 (화면 각주 없음 — 설명 글 `clockSync.md`):
 *  - 빠르기를 ms/분으로 과장해 17 분에 담았다(배수 1 ≈ +50 · −33 · +17 ppm, 배수 8 은 나쁜 시계).
 *  - 맞춤은 한 번에 더하기(slew 아님), 남는 어긋남은 (가는 − 오는)/2 = +2 · −1 · +1 ms.
 *  - 나는 동안의 드리프트는 뺐다. 사건은 메시지뿐. 램포트 수는 참 시각이 아니다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const clockSyncConcept: FacetConceptSource = {
  id: 'clockSync',
  label: 'Clock Synchronization (Physical Timestamps vs Lamport Clocks)',
  canonicalFacet: 'facet:clockSync',

  surface: {
    definition:
      'Timestamping messages with drifting physical clocks records some receives before their sends; faster drift adds inversions and shorter resynchronization intervals remove some, while Lamport clock numbers never invert.',
    exemplarKeywords: [
      'clock synchronization in distributed systems',
      'physical clock vs logical clock',
      'NTP resync interval',
      'timestamp ordering anomaly',
      'message received before it was sent',
      'clock skew',
      'Lamport clock',
      'why not use wall-clock time to order events',
      'Spanner TrueTime',
      'hybrid logical clock',
    ],
  },

  briefing: {
    observable: [
      'The top panel, "Clock offset (ms)", draws each process clock\'s offset from true time as a sawtooth over a minute axis ("min"): P1 climbs, P2 falls, P3 climbs more slowly, and at each resync mark the line drops back near zero. A vertical bar at the current minute joins the fastest and slowest clock.',
      'Bottom left, "Physical stamp": each message is drawn on a millisecond axis with its true send time at 0 — tail at the sender\'s stamp, head at the receiver\'s. When the receiver\'s clock lags the sender\'s by more than the delay, the head lands left of the tail and the arrow bends backward ("m1 · receive − send: -3 ms · inverted").',
      'Bottom right, "Lamport number": the same message goes from the sender\'s count plus one to max(own, carried) + 1 at the receiver ("Lamport: 1 → 2"), so every arrow points forward.',
      'Each of the twelve messages takes a send step ("m1 · minute 1 · P1 → P2") and a receive step, 24 steps in all. With the defaults (Drift × 4, no resync) six messages invert — m1 −3, m4 −31, m6 −86, m7 −143, m10 −91, m12 −190 ms — and the Lamport receive numbers run 2, 4, 6, 8, 8, 10, 11, 13, 15, 17, 17, 19.',
      'At Drift × 4, resyncing never, every 8, 4 or 2 minutes gives 6, 3, 1, 1 inverted messages and a maximum skew of 343, 143, 63, 23 ms. The one left at 2 minutes is m1: one minute after a resync P1 is +14 and P2 −9 ms, a 23 ms spread against a 20 ms delay. At Drift × 8, four still invert with a 2-minute resync. At Drift × 0 the skew is still 3 ms, below every delay, so none invert.',
      '"Lamport inverted" stays at 0 for all twenty combinations of the two handles; turning either one moves nothing in the Lamport panel.',
      'The rates are exaggerated in ms per minute to fit into 17 minutes: Drift × 1 is P1 +3, P2 −2, P3 +1 ms/min (about +50, −33, +17 ppm, typical of quartz), while × 8 is a very bad clock. Each resync steps the clock at once rather than slewing, and leaves (outbound − return)/2 of asymmetric path delay: +2, −1, +1 ms. Drift during a message\'s flight is ignored, the only events are messages, and Lamport numbers say nothing about the actual time. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Drift ×" with five positions 0, 1, 2, 4, 8, starting at 4, and "Resync (min)" with four positions none, 8, 4, 2, starting at none. Each run plays all 24 steps and waits for the handles.',
        'Three readouts: "Physical inverted", "Lamport inverted" and "Max skew (ms)".',
        'The move that makes the idea land is raising Drift × and then shortening Resync while watching bent arrows appear and straighten in the physical panel, with the Lamport panel unchanged throughout.',
        'The code panel, labelled "Code", starts empty with a "+ Add language" button; the chosen language shows `clockRun`, which picks the earliest unsent message each time, computes both stamps and both Lamport numbers, and returns physical inversions, Lamport inversions and maximum skew — the same three readouts for every handle setting. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article warns against ordering events across machines by wall-clock timestamps and needs a count of messages that appear received before they were sent, and how that count responds to worse clocks and more frequent synchronization.',
      'A reader asks why distributed systems use Lamport clocks when NTP exists; the answer to land is that synchronization shrinks the problem without removing it, while a logical counter never records an effect before its cause.',
    ],

    avoidWhen: [
      'The subject is how NTP or PTP estimate an offset from a round trip. Resyncs appear only as drops in the sawtooth.',
      'The article is about vector clocks, detecting concurrency, or building a total order from Lamport numbers. Those are not shown.',
      'The topic is leap seconds, time zones or monotonic versus wall-clock APIs on one machine.',
    ],

    contrastWith: [
      {
        concept: 'clocksDrift',
        note: 'That clocks drift apart and never resync to exactly zero is the premise. What that drift does to ordering, and how resync frequency trades against it, is the consequence.',
      },
      {
        concept: 'happensBefore',
        note: 'Lamport numbers never put an effect before its cause, which is the guarantee compared against physical stamps. What they cannot do — tell apart events with no causal link — is a separate limit of the same counter.',
      },
    ],
  },
};
