/**
 * tellThemToSlowDown 개념 선언.
 *
 * canonical facet 은 `facet:tellThemToSlowDown` — 보내는 쪽에 통 여섯(m1..m6), 받는 쪽 자리 둘(한 통 2 틱).
 * 보내는 쪽은 크레딧 둘로 시작해 한 통에 하나를 쓰고, 받는 쪽이 한 통을 끝낼 때마다 하나가 되돌아온다.
 * 크레딧이 없는 틱 3 · 5 · 7 에 보내는 쪽이 멈추고, 보내는 간격이 1 → 2 틱으로 벌어진다. 잃은 통 0.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `backpressure` 는 세 방식을 한 서버에 갈아 끼워 잃음이 쌓이는 자리를 견준다. 이쪽은 그중 배압 **한 방식의
 * 기계** — 되돌아오는 허락이 보내는 속도를 정한다 — 하나만 말한다. 이웃 조각 `shedToSurvive` 는 되돌아가는 신호가
 * 없는 거절을 말한다. 그래서 definition 은 credit · spends · returns · stalls · send interval 을 독점하고,
 * 503 · deadline · accept all 은 쓰지 않는다. TCP 의 `receiverWindow` 와는 층위(전송 계층 ↔ 메시지 흐름 제어)로 가른다.
 *
 * 전제: 틱은 예로 정한 단위, 망 지연 0 (실제로는 크레딧이 돌아오는 데도 시간이 걸려 창을 더 크게 잡는다),
 * 한 틱 안의 차례는 끝남 → 보냄 → 처리 시작. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tellThemToSlowDownConcept: FacetConceptSource = {
  id: 'tellThemToSlowDown',
  label: 'Credit-Based Flow Control: the Receiver Paces the Sender',
  canonicalFacet: 'facet:tellThemToSlowDown',

  surface: {
    definition:
      'In credit-based flow control the sender spends one credit per message and the receiver returns one each time it finishes a message, so a sender out of credits stalls and its send interval stretches to the receiver\'s pace.',
    exemplarKeywords: [
      'credit-based flow control',
      'backpressure signal',
      'producer blocked by slow consumer',
      'reactive streams request(n)',
      'HTTP/2 WINDOW_UPDATE',
      'permits returned by the consumer',
      'bounded in-flight messages',
      'fast producer slow consumer',
      'pull-based flow control',
    ],
  },

  briefing: {
    observable: [
      'A Sender holds six messages m1 to m6 and two credits; a Receiver has two places ("Held: 0 / 2") and takes 2 ticks to finish each message, one at a time. Messages travel on one path, credits come back on another.',
      'Ticks 0 and 1: m1 and m2 go out, each spending a credit — "Credits left: 1", then 0. The receiver is now at "Held: 2 / 2".',
      'Tick 2: "m1 finished — its credit came back and m3 went out on it at once." The credit counter stays at 0, but a yellow credit is seen returning and leaving again with the next message.',
      'Ticks 3, 5 and 7 read "no credit — the sender stops. Next to send: …", and the sender is marked Stopped. Ticks 4, 6 and 8 each finish one message and send the next on its returned credit.',
      'A Gap strip under the timeline records the spacing between sends: 1, 1, 2, 2, 2. Once the two starting credits are spent, the sender sends exactly as often as the receiver finishes.',
      'The run ends at Tick 12: "m6 finished. Delivered: 6 · Lost: 0 · Send gap (ticks): 1 → 2", with both credits back at the sender. Throughout, credits held by the sender plus messages held by the receiver equal 2, and the receiver never holds more than 2.',
      'Ticks are an example time unit and credits return with zero delay; in practice a credit also takes time to travel back, so the window is sized larger to keep the sender busy. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays itself from the starting state through tick 12 and stops. There are no handles; the numbers are fixed.',
        'A Replay button and a playback strip sit below it. Scrubbing back to tick 3 holds the first moment the sender stands still with a message ready and no credit.',
      ],
    },

    useWhen: [
      'The article explains how a slow consumer can throttle a fast producer without dropping anything, and wants the returned credit to be the visible thing that decides when the next message may leave.',
      'A reader asks why the send rate of a flow-controlled stream settles at the consumer\'s processing rate rather than the producer\'s, and the spacing widening from one tick to two answers it.',
    ],

    avoidWhen: [
      'The topic is what to do when the producer cannot be slowed — rejecting, dropping or timing out requests. Nothing here is refused or lost.',
      'The article is about TCP specifically, with sequence numbers, acknowledgments and advertised window sizes in bytes. Credits here count whole messages.',
      'The subject is congestion in the network between the two sides. The only constraint here is the receiver\'s own processing speed.',
    ],

    contrastWith: [
      {
        concept: 'backpressure',
        note: 'Credit return is one way to push back on a sender; the broader overload question sets pushing back beside rejecting and accepting everything, and asks where each policy puts the loss.',
      },
      {
        concept: 'shedToSurvive',
        note: 'Credits slow the producer so excess never reaches the receiver; shedding lets the excess arrive and refuses it there, telling the sender nothing about pace.',
      },
      {
        concept: 'receiverWindow',
        note: 'Both cap what a sender may have outstanding by the receiver\'s capacity. The receive window does it inside TCP in bytes on each acknowledgment; message credits do it at the application level, one permit per message.',
      },
      {
        concept: 'leakyBucket',
        note: 'A leaky bucket smooths output to a fixed configured rate; credit-based flow control has no configured rate and lets the receiver\'s actual completions set it.',
      },
      {
        concept: 'consumerOffset',
        note: 'A log consumer that falls behind simply leaves its offset further back while the producer keeps writing; credit flow control instead stops the producer so no backlog accumulates.',
      },
    ],
  },
};
