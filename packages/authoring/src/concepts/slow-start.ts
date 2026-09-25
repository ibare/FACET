/**
 * slowStart 개념 선언.
 *
 * canonical facet 은 `facet:slowStart` — 혼잡 창 1 · 문턱 16 에서 일곱 왕복. 줄 하나가 한 왕복에 나간 조각들이고,
 * 돌아온 확인이 아랫줄로 내려앉는다. 문턱 전에는 확인 하나가 둘로 갈라져(창 +1) 1 · 2 · 4 · 8 · 16, 문턱 뒤에는
 * 확인 하나가 1/창 만큼 끝자리 새 조각을 키워 16 · 17 · 18 → 19. 보낸 조각 합 66. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `congestionControl`(완제품)은 두 창 가운데 작은 쪽이 보냄을 정하는 판이다. 형제 조각 셋이 혼잡 창의 서로 다른
 * 대목을 나눈다 — 이쪽은 **출발부터 문턱까지 불어나기**, `backOffOnLoss` 는 잃음 하나에 꺾기, `sawtooth` 는 오래 둔
 * 모양. 그래서 definition 은 starting from one · per acknowledgment · doubles · threshold 를 독점하고, 잃음 · 반 ·
 * 용량 · 평균은 쓰지 않는다.
 *
 * 전제 (설명 글 `slowStart.md`): 처음 창 1 · 문턱 16 · 왕복 일곱은 예로 정한 값. 창은 조각 수(실제는 바이트 · MSS).
 * 한 걸음 = 한 왕복, 확인이 모두 그 왕복 안에 돌아온다. 아무것도 잃지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const slowStartConcept: FacetConceptSource = {
  id: 'slowStart',
  label: 'TCP Slow Start',
  canonicalFacet: 'facet:slowStart',

  surface: {
    definition:
      'Starting from one segment, a TCP sender adds one to its congestion window per returning acknowledgment, which doubles the window every round trip until the slow-start threshold, then adds just one per round trip.',
    exemplarKeywords: [
      'slow start',
      'exponential window growth',
      'ssthresh',
      'slow start threshold',
      'initial congestion window',
      'congestion window doubles each RTT',
      'cwnd += 1 per ACK',
      'switch to congestion avoidance',
      'TCP ramp-up',
      'why is it called slow start',
    ],
  },

  briefing: {
    observable: [
      'Each row is one round trip\'s worth of segments; the bottom row is the window not yet sent. A vertical dashed line marks "Threshold: 16", and because every segment cell has a fixed width, the length of a row is the window. The first caption reads "Window: 1 · threshold: 16. Nothing sent yet."',
      'Below the threshold the caption reads "Round 1 — sent: 1 · acks back: 1. Each ack adds 1 to the window." Every returning acknowledgment splits in two as it lands in the row below — its own place plus one new one — so the rows run 1, 2, 4, 8 and the fifth round sends 16.',
      'From the threshold on the caption changes to "Each ack adds 1/16 to the window": each acknowledgment lands as one cell and grows a new cell at the end of the row by a sliver, and a full round of acknowledgments completes it. The rows now lengthen by one cell at a time — 16, 17, 18 — and after the seventh round the window is 19.',
      'Each round closes with "Window: 1 → 2 · sent so far: 1" and so on; after seven round trips 66 segments have been sent. Four doublings reach 16, where adding one per round trip would have needed fifteen.',
      'The starting window 1, the threshold 16 and the seven rounds are fixed example values. The window is counted in segments, while real TCP counts bytes and grows by one maximum segment size. One step is one round trip with all its acknowledgments returning inside it, and nothing is lost. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven round trips by itself and stops.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is the switch at the threshold, where acknowledgments stop splitting in two and the rows begin to grow by a single cell.',
        'The starting window and threshold are fixed, so every row length and the total 66 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader is puzzled that "slow start" grows exponentially. Adding one per acknowledgment, with a whole window of acknowledgments per round trip, shows where the doubling comes from.',
      'The article contrasts growth before and after the slow-start threshold and needs both rates side by side in one run.',
    ],

    avoidWhen: [
      'The article is about what happens when a segment is lost. Nothing is lost here and the window never shrinks.',
      'The subject is the long-run up-and-down pattern of the window over many losses.',
      'The article is about choosing the initial window size for web latency, such as an initial window of ten segments. The start here is fixed at one.',
    ],

    contrastWith: [
      {
        concept: 'sawtooth',
        note: 'Slow start is the opening ramp before anything goes wrong. The sawtooth is the pattern that follows, in which slow linear growth and halving alternate for as long as the transfer lasts.',
      },
      {
        concept: 'backOffOnLoss',
        note: 'Slow start raises the sending rate while nothing is lost. Backing off is the opposite move, made when a loss is detected, and it also lowers the threshold that ends the next ramp.',
      },
      {
        concept: 'congestionControl',
        note: 'Doubling describes how the congestion window alone grows. Whether that growth reaches the wire depends on it still being smaller than what the receiver allows.',
      },
    ],
  },
};
