/**
 * congestionControl 개념 선언.
 *
 * canonical facet 은 `facet:congestionControl` — 보내는 쪽이 왕복마다 받는 창과 혼잡 창 가운데 작은 쪽만큼 보낸다.
 * 손잡이 "앱이 읽는 양"(2 · 4 · 6 · 8 · 12, 처음 8)과 "망 용량"(8 · 12, 처음 12)을 돌리면 조이는 쪽이 받는 쪽에서
 * 망으로 옮겨 간다 — 용량 12 에서 읽는 양 8 까지는 보냄이 평평하고 잃음 0, 12 에서 톱니와 잃은 왕복 2. 용량 8 에서는
 * 그 자리가 4 와 6 사이로 내려온다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각은 각각 한 장면이다 — 빈자리를 수로 돌려주기(`receiverWindow`) · 확인마다 하나씩 불어나기(`slowStart`) ·
 * 셋째 중복에 반으로 꺾기(`backOffOnLoss`) · 오래 두면 톱니(`sawtooth`). 이쪽은 **두 한도 가운데 작은 쪽이 보냄을
 * 정하고, 어느 쪽이 조이는지가 손잡이에 따라 옮겨 간다** 를 맡는다. 그래서 definition 은 smaller of · whichever is
 * tighter · read rate · capacity 를 쥐고, 조각이 독점한 free buffer space · doubles · third duplicate · sawtooth 를 쓰지 않는다.
 *
 * 카탈로그 정리로 flow-control 토픽이 이 완제품에 합쳐졌다 — 흐름 제어 낱말은 exemplarKeywords 가 품는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `congestionControl.md` 가 밝힌 것):
 *  - 창 · 버퍼 · 보냄 · 전달 모두 조각 수로 센다(실제 TCP 는 바이트).
 *  - 시간은 왕복 단위. 버퍼 16 · 용량 · 읽는 양 · 처음 창 1 · 문턱 4 는 예로 정한 값.
 *  - 용량을 넘긴 왕복은 용량만큼만 전달. 잃음을 알아채는 법과 재전송은 그리지 않는다.
 *  - 받는 창에 조인 왕복에서는 혼잡 창을 키우지 않는다(줄인 모형). 동률이면 받는 창이 조이지 않은 것으로 본다.
 *  - 코드 패널은 IR 하나(`runRounds`)를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const congestionControlConcept: FacetConceptSource = {
  id: 'congestionControl',
  label: 'Flow Control and Congestion Control (The Smaller Window Wins)',
  canonicalFacet: 'facet:congestionControl',

  surface: {
    definition:
      "Each round trip a TCP sender sends the smaller of the receive window and the congestion window, so the application's read rate or the network's capacity, whichever is tighter, sets throughput.",
    exemplarKeywords: [
      'flow control vs congestion control',
      'flow control',
      'congestion control',
      'min(cwnd, rwnd)',
      'effective send window',
      'TCP throughput limit',
      'is the receiver or the network the bottleneck',
      'slow receiving application',
      'faster network did not help',
      'network capacity',
      'TCP sliding window',
      'RFC 5681',
    ],
  },

  briefing: {
    observable: [
      'The top chart plots "Sent" for rounds 1 to 20 against a red dashed "Link capacity: 12" line. When a handle moves, the previous run stays as a faded dotted "Previous run" trace and each new point moves from the trace to its new value.',
      'Below it two lanes record which window was smaller each round: "Receive window limits" gets a square, "Network limits" a circle, and a lost round a cross on the network lane.',
      'At the bottom sit bars for "Congestion window" and "Receive window" with a triangle in front of the smaller one and a dashed line marking what was sent, plus a sixteen-cell "Receiver buffer" that fills with delivered segments and drains by what the app reads ("unread: … · app read: …"). A bold tick on the congestion-window bar is that round\'s threshold.',
      'Each round\'s caption names what happened: "Slow start · next congestion window: …", "Congestion avoidance · …", "Receive window is smaller · congestion window stays: …", or "Lost round · delivered: … · threshold: … · next congestion window: …".',
      'At capacity 12, raising the read rate 2 → 4 → 6 → 8 → 12 gives delivered totals 53, 87, 118, 145, 162. Up to 8 there are no lost rounds and the sent line settles flat at the read rate, with 14, 13, 11, 10 receive-window-limited rounds for read rates 2, 4, 6, 8. At 12 the receive window never binds, the congestion window overruns capacity, rounds 12 and 20 are lost, and rounds 11–20 read 12 13 6 7 8 9 10 11 12 13.',
      'At capacity 8 the switchover drops to between 4 and 6. From read rate 6 upward the sent line is identical: the congestion window climbs to 9, loses in rounds 8, 14 and 20, falls to 4 and climbs again, for 117 delivered and 3 lost rounds. The same read rates 6 and 8 are flat at capacity 12 and sawtoothed at capacity 8.',
      'Everything is counted in segments rather than bytes, and time in round trips. The 16-segment buffer, the capacities, the read rates, the starting window 1 and threshold 4 are example values. A round that exceeds capacity delivers only the capacity; how the loss is detected and resent is not drawn, and the congestion window is not grown in rounds the receive window limited. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "App read rate" with 2, 4, 6, 8, 12 (8 to start) and "Link capacity" with 8 and 12 (12 to start). Three readouts: "Delivered total", "Lost rounds", "Receive-window-limited rounds". A run is round 0 plus twenty rounds.',
        'The move that makes the idea land is stepping the read rate upward at capacity 12: the flat sent line lifts into a sawtooth between 8 and 12 while the lane marks cross from the receive-window lane to the network lane. Switching capacity to 8 then shows the crossover moving down.',
        'The code panel, labelled "Round loop", starts empty with a "+ Add language" button and shows `runRounds(rounds, readRate, capacity)`, highlighting the line for each round. It is one meaning carried across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article separates flow control from congestion control and needs them shown as two limits on one sender, with the amount sent set by whichever is smaller at that moment.',
      'A reader asks why a faster link did not speed up a transfer, or why a slow consumer caused no packet loss at all. Turning the read rate across the crossover shows the binding limit changing sides.',
    ],

    avoidWhen: [
      'The article dwells on one mechanism in detail — how duplicate acknowledgments reveal a loss, or the doubling at connection start on its own. Loss here is decided by comparing against capacity and its detection is not drawn.',
      'The subject is comparing congestion-control algorithms such as CUBIC, BBR or Reno variants. One simplified rule is used throughout.',
      'The article is about backpressure or rate limiting between services or in message queues. The windows here belong to a single TCP sender.',
    ],

    contrastWith: [
      {
        concept: 'receiverWindow',
        note: "Advertising free buffer space protects the receiver on its own. Setting it beside the congestion window turns the question into which of two limits binds, and the answer changes with the application's speed.",
      },
      {
        concept: 'slowStart',
        note: 'Doubling from one segment is how a sender probes an unknown network at the start. Here that growth is only one way the congestion window rises before one of the two limits takes over.',
      },
      {
        concept: 'backOffOnLoss',
        note: 'Halving on a detected loss is the network-side reaction to a single event. The two-limit view asks when that reaction happens at all, and it stops happening once the receiver is the tighter limit.',
      },
      {
        concept: 'sawtooth',
        note: "The sawtooth is the long-run shape when the network is the only limit. With the receiver's window in play as well, the same sender can instead run flat and without loss.",
      },
      {
        concept: 'tcpHandshake',
        note: 'Reliable delivery is about getting every segment through despite loss. Flow and congestion control decide how much to send at once, so that loss and overflow occur less often in the first place.',
      },
    ],
  },
};
