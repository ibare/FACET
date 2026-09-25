/**
 * receiverWindow 개념 선언.
 *
 * canonical facet 은 `facet:receiverWindow` — 받는 쪽 버퍼 4000 바이트, 조각 1000 바이트, 보낼 것 8000 바이트. 앱이
 * 라운드마다 0 · 2000 · 1000 · 3000 을 읽고, 받는 쪽은 버퍼의 빈자리를 창으로 돌려준다. 창이 0 인 라운드에 보내는 쪽은
 * 멈춰 선다. 다섯 라운드 동안 버퍼는 한 번도 넘치지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 카탈로그 정리로 flow-control 토픽이 `congestionControl`(완제품)에 합쳐지며 이 조각이 그 묶음에 들었다. 완제품은
 * 받는 창과 혼잡 창 가운데 **어느 쪽이 조이는가** 를 견준다. 이쪽은 망을 빼고 **받는 쪽이 빈자리를 수로 알려 보내는
 * 쪽을 묶는다** 만 쥔다. 그래서 definition 은 free buffer space · reports · zero window · overflowing 을 독점하고,
 * congestion · network · smaller of 는 쓰지 않는다.
 *
 * 전제 (설명 글 `receiverWindow.md`): 수는 모두 예로 정한 값. 시간은 라운드로만, 보낸 조각은 같은 걸음에 닿아 확인된다
 * (날아가는 양 없음). 창 0 탐침 없음. 앱이 읽는 양도 조각 단위. 혼잡 창은 이 장면 밖.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const receiverWindowConcept: FacetConceptSource = {
  id: 'receiverWindow',
  label: 'TCP Receive Window (Flow Control)',
  canonicalFacet: 'facet:receiverWindow',

  surface: {
    definition:
      'With each acknowledgment the receiver reports its free buffer space, and the sender never sends more than that, so a slow-reading application halts the sender at a zero window instead of overflowing.',
    exemplarKeywords: [
      'receive window',
      'rwnd',
      'advertised window',
      'zero window',
      'window size field',
      'receiver buffer full',
      'slow consumer',
      'sender cannot see the receiver buffer',
      'preventing receiver overflow',
      'flow control in TCP',
    ],
  },

  briefing: {
    observable: [
      'The sender\'s row of eight 1000-byte segments runs across the top; below sit the "Receiver buffer: 0 / 4000" and the App with its "Read" count. The first caption reads "Window advertised when the connection opened: 4000 bytes".',
      'Each round has two steps. In the first, a frame the size of the window is drawn over the sender\'s row and only the segments inside it drop into the buffer ("Round 1 · window: 4000 · segments sent: 4 (bytes 1–4000)"). In the second, the app reads, and the free space rises as a number and travels back up to the sender ("Free space sent back as the window: 0 bytes").',
      'Round 1 fills the buffer and the app reads nothing, so the window sent back is 0. In round 2 a bar stands where the frame was, the next segment bounces off it, and the caption reads "segments sent: 0 — the sender waits". The app then reads 2000 and a window of 2000 goes back.',
      'Round 3 sends two segments (4001–6000) and the app reads 1000, giving a window of 1000; round 4 sends one (6001–7000) and the app reads 3000, giving 3000. Round 5 has room for three but only one segment is left (7001–8000): "All sent: 8000 bytes", with 2000 still unread in the buffer.',
      'Over five rounds and nine steps the buffer never overflows. Sending all 8000 bytes in the first round without looking at the window would have overflowed it by 4000.',
      'The buffer, segment and total sizes and the app\'s reads are fixed example values. Time moves only in rounds and a sent segment arrives and is acknowledged within the same step, so nothing is ever in flight. A stalled sender simply waits for the next report instead of probing, and the network\'s own limits play no part. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the five rounds by itself and stops once all 8000 bytes are sent.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is round 2, where the window is 0 and the next segment bounces back from the bar.',
        'Sizes and reads are fixed, so every window value and byte range can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader asks how a sender can avoid overrunning a receiver whose buffer it cannot see. The free-space number travelling back each round is the answer.',
      'The article explains the zero-window stall and how the flow resumes once the application reads.',
    ],

    avoidWhen: [
      'The subject is congestion in the network, or a sender limiting itself by guessing network capacity. The network never limits anything here.',
      'The article is about go-back-N or selective-repeat protocols with lost frames and resending. Nothing is lost.',
      'The subject is the window scale option or window sizes beyond 65535 bytes.',
    ],

    contrastWith: [
      {
        concept: 'congestionControl',
        note: "The receive window alone guards the receiver's buffer. Once the sender's own congestion window is also in play, the amount sent is the smaller of the two, and the application's speed decides which one that is.",
      },
      {
        concept: 'boundedBuffer',
        note: 'A bounded buffer makes an insert into a full buffer fail. Flow control keeps that failure from arising by telling the producer in advance how much room is left.',
      },
      {
        concept: 'slowStart',
        note: "Both cap what a sender puts out, but the receive window is set by the receiver's buffer and reported to the sender, while the congestion window is the sender's own estimate of the network.",
      },
    ],
  },
};
