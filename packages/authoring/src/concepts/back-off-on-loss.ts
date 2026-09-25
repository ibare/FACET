/**
 * backOffOnLoss 개념 선언.
 *
 * canonical facet 은 `facet:backOffOnLoss` — 혼잡 창 8 · 문턱 6 에서 조각 21~28 을 보내고 23 이 사라진다. 빈자리 뒤의
 * 조각이 닿을 때마다 확인 23 이 거듭 돌아와 보내는 쪽 발치에 쌓이고, 셋째 중복에서 창 막대가 반으로 접힌다(8 → 4,
 * 문턱 6 → 4)며 23 을 곧바로 다시 보낸다. 넷째 · 다섯째 중복은 쌓이기만 한다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `congestionControl`(완제품)은 두 창 가운데 어느 쪽이 조이는가를 견주고, 잃음을 알아채는 법은 그리지 않는다. 이쪽이
 * 그 빈 대목 — **셋째 중복 확인을 잃음으로 읽고 한 번 꺾는다** — 를 쥔다. 형제 `slowStart` 는 불어나기, `sawtooth` 는
 * 오래 둔 모양. 그래서 definition 은 third duplicate · resends immediately · halves · in flight 를 독점하고,
 * 톱니 · 평균 · 용량 · 두 배는 쓰지 않는다.
 *
 * 전제 (설명 글 `backOffOnLoss.md`): 창 · 번호를 조각 수로 센다(실제는 바이트). 빠른 회복의 창 부풀리기는 뺐다.
 * 시작 번호 21 · 창 8 · 문턱 6 · 잃는 조각 23 · 도착 묶음은 예로 정한 값. 한 걸음 = 도착 묶음 하나, 마지막 걸음은
 * 다음 왕복 하나를 통째로 담았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const backOffOnLossConcept: FacetConceptSource = {
  id: 'backOffOnLoss',
  label: 'TCP Backs Off on Loss (Third Duplicate ACK)',
  canonicalFacet: 'facet:backOffOnLoss',

  surface: {
    definition:
      'A TCP sender reads a third duplicate ACK as a lost segment: it resends that segment immediately and halves how much it may have in flight, just once however many duplicates follow.',
    exemplarKeywords: [
      'triple duplicate ACK',
      'fast retransmit',
      'duplicate acknowledgment',
      'multiplicative decrease',
      'congestion window halved',
      'ssthresh = cwnd / 2',
      'loss detection in TCP',
      'why three duplicate ACKs',
      'TCP Reno',
      'fast recovery',
    ],
  },

  briefing: {
    observable: [
      'The sender\'s congestion window is a bar of joined cells labelled "Window: 8", with a "Threshold: 6" mark and a line marking "Resend at duplicate: 3". Step 1 sends a whole window: "Sent: 21–28. Lost on the way: 23."',
      '21 and 22 arrive and "ACK 22" and "ACK 23" come back. Then 24 and 25 arrive one at a time, and each time the same number returns — "ACK 23 (duplicate 1)", "ACK 23 (duplicate 2)" — piling up at the sender\'s feet while the window stays 8.',
      'When 26 arrives the third duplicate reaches the line. The right half of the window bar swings up on a hinge and folds over the left half, the threshold mark moves, and 23 goes straight back onto the path: "Window: 8 → 4 · threshold: 6 → 4. Resent: 23."',
      '27 and 28 then bring duplicates 4 and 5, which only land on the pile; the window stays 4. The resent 23 arrives, and the receiver, which had kept 24 to 28, answers "ACK 29".',
      'The last step sends a new window, "Next round sent: 29–32. All acknowledged: ACK 33.", and because the window is at the threshold it grows by one, to 5. Nine steps in all, with exactly one cut, 8 → 4.',
      'Windows and numbers are counted in segments rather than bytes, and the temporary window inflation of real fast recovery is left out. The starting number 21, window 8, threshold 6, the lost segment 23 and how arrivals are bunched into steps are fixed example values; the final step packs a whole round trip. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the nine steps by itself and stops.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is the third duplicate, where the pile reaches the line and the window folds in half.',
        'The segments, the loss and the arrival bunches are fixed, so every acknowledgment and window value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader asks how a sender that cannot see the path learns a segment was lost, and why it waits for a third repeat rather than acting on the first.',
      'The article explains why a single loss halves the window once, even though more duplicate acknowledgments keep arriving afterwards.',
    ],

    avoidWhen: [
      'The subject is retransmission after a timeout, or doubling the timeout on repeated failures. Here the resend is triggered by duplicates, and no timer appears.',
      'The article is about an application retrying failed requests with growing delays. What shrinks here is how much is sent at once, not how long the sender waits.',
      'The subject is the long-run shape of the window across many losses. Only one loss happens.',
    ],

    contrastWith: [
      {
        concept: 'sequenceNumber',
        note: 'A repeated acknowledgment number is only the receiver reporting that a gap remains. Treating the third repeat as a loss, resending and cutting the window is the sender\'s interpretation of that report.',
      },
      {
        concept: 'sawtooth',
        note: 'One halving for one detected loss is the event. The sawtooth is what repeating that event after steady growth looks like over many round trips.',
      },
      {
        concept: 'collisionAndBackoff',
        note: 'Both back off after trouble, in different quantities. Ethernet stations wait a random, widening time before retrying; a TCP sender keeps sending but reduces how much it has outstanding at once.',
      },
      {
        concept: 'congestionControl',
        note: 'Cutting the window is the network-side reaction to a loss. Whether losses happen at all depends on whether the congestion window, rather than the receiver\'s limit, is the one in control.',
      },
    ],
  },
};
