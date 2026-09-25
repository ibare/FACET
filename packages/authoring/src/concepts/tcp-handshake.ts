/**
 * tcpHandshake 개념 선언.
 *
 * canonical facet 은 `facet:tcpHandshake` — 클라이언트가 조각 여섯(d1 … d6)을 서버 앱에 보낸다. 길은 조각마다
 * 지연이 달라 d5 가 d4 를 앞지르고, 손잡이 "잃는 조각" 만큼 길에서 사라진다. 손잡이 "방식" 을 UDP 로 두면 닿은 것을
 * 닿은 차례대로 넘기고 끝이며, TCP 로 두면 핸드셰이크 · 쥐기 · 기한 재전송을 치르고 여섯을 차례대로 모두 넘긴다.
 * 잃음 0/1/2 에서 UDP 받음 6 → 5 → 4, TCP 마지막 넘김 틱 12 → 15 → 18 · 덧붙은 패킷 9 → 10 → 11.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각은 각각 한 장면이다 — 세 번 주고받기(`threeWaySync`) · 누적 확인 번호(`sequenceNumber`) · 보내고 잊기
 * (`sendAndForget`) · 받는 포트로 가르기(`portDemultiplex`) · 명령 길과 짐 길(`controlAndDataChannel`). 이쪽은
 * **같은 길 위에서 두 전송 방식을 견주는 것** 을 맡는다. 그래서 definition 은 TCP · UDP 를 함께 세우고 "치르는 값"
 * (늦게 끝남 · 덧붙은 패킷)과 "빈자리" 쪽 낱말을 쥐며, 조각이 독점한 SYN · 시작 번호 · 다음 바이트 · 사본 · 포트 ·
 * PASV 를 쓰지 않는다.
 *
 * 카탈로그 정리로 udp · transport-layer 토픽이 이 완제품에 합쳐졌다 — UDP 와 전송 계층 낱말은 exemplarKeywords 가 품는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `tcpHandshake.md` 가 밝힌 것):
 *  - 조각 번호로 센다(바이트가 아니다). 확인 번호는 다음에 기대하는 조각 번호.
 *  - 지연 · 핸드셰이크 한 방향 2 틱 · 확인 2 틱 · 기한 6 틱 · 잃는 조각(d3, 다음 d5)은 예로 정한 값.
 *  - 다시 보냄은 기한으로만. 같은 확인이 거듭 와도 보내는 쪽은 아무것도 하지 않는다(빠른 재전송 · 창은 혼잡 제어 몫).
 *  - FIN 은 그리지 않는다. 주소는 문서용 대역.
 *  - 코드 패널은 IR 하나(`receiveInOrder`)를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tcpHandshakeConcept: FacetConceptSource = {
  id: 'tcpHandshake',
  label: 'TCP vs UDP (What Reliable Delivery Costs)',
  canonicalFacet: 'facet:tcpHandshake',

  surface: {
    definition:
      'Over a path that drops and reorders segments, TCP still delivers all of them in order but pays with a later finish and extra packets, while UDP finishes early with the lost ones missing.',
    exemplarKeywords: [
      'TCP vs UDP',
      'UDP',
      'User Datagram Protocol',
      'transport layer',
      'reliable vs unreliable transport',
      'connection-oriented vs connectionless',
      'cost of reliability',
      'retransmission timeout',
      'RTO',
      'head-of-line blocking',
      'when to use UDP instead of TCP',
      'latency vs reliability trade-off',
      'RFC 793',
      'RFC 768',
    ],
  },

  briefing: {
    observable: [
      'The upper panel puts the Client (`192.0.2.10:50000`) on the left and the Server (`198.51.100.20:5004`) on the right. Data and `SYN` / `ACK` travel along the upper lane of the path, `SYN+ACK` and acknowledgments come back along the lower lane, and each packet advances by its own delay — d4, with delay 3, takes three steps to cross.',
      'Under the client, "Sender copies" holds segments sent but not yet acknowledged; under the server, "Receiver queue" holds segments TCP is keeping back. The server always shows "Listening socket · port 5004"; with TCP a "Connection socket" splits off beside it when the handshake completes, keyed by `192.0.2.10:50000 ↔ 198.51.100.20:5004`.',
      'The lower panel, "Tick each segment reached the app", has one row per segment with ticks running across; a mark lands at the tick each segment was handed to the app. Segments UDP never delivered end the round as blanks in a "Not received" column.',
      'In the opening round (TCP, one segment lost) `SYN` leaves at tick 0, `SYN+ACK` at 2, `ACK` at 4, and the server is `ESTABLISHED` at tick 6. d3 leaves at tick 7 and is lost; d5, d4 and d6 pile up in the receiver queue, each answered with ACK 3. At tick 13 the caption reads "Timer expired · resent: d3"; it arrives at tick 15 and d3 to d6 go to the app together. ACK 7 returns at tick 17 and the round ends.',
      'Across the six rounds: UDP gives the app 6, 5, 4 segments for 0, 1, 2 losses, always finishing at tick 8 with 0 extra packets. TCP always gives 6, finishing at tick 12, 15, 18 with 9, 10, 11 extra packets. Even with no loss TCP finishes 4 ticks later than UDP, the cost of the handshake round trip.',
      'With no loss the UDP app receives d1 d2 d3 d5 d4 d6 — d5 overtakes d4 on the path. TCP holds d5, which arrives at tick 10, and hands it over together with d4 at tick 11.',
      'Segments are counted as whole units, not bytes, and the acknowledgment number is the next segment expected (7 once all six are in). Delays, the 6-tick timer and which segments are lost are fixed example values. Resending happens only when the timer expires; repeated acknowledgments trigger nothing. Closing the connection is not drawn, and the addresses are documentation ranges. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Transport" with UDP and TCP (TCP to start) and "Segments lost" with 0, 1, 2 (1 to start). Three readouts track the round: "Received by app", "Last handover tick", "Extra packets".',
        'When a handle moves, the previous round\'s marks stay as dotted traces and each new mark slides from its trace to its new tick. The move that makes the trade-off land is flipping between UDP and TCP at the same loss count: the handshake pushes every data arrow later, and the received count returns to 6 while the last handover tick climbs.',
        'The code panel, labelled "Receiver: hand over in order", starts empty with a "+ Add language" button. It shows one receiver function, `receiveInOrder`, where a single parameter `hold` separates handing over at once (UDP) from holding until the gap fills (TCP), and it highlights the line for each arrival. It is one meaning carried across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article has to justify UDP for games, voice or live streaming, and needs the price TCP pays on the same lossy path — a later finish and extra packets — set against the gaps UDP simply leaves.',
      'A reader assumes reliability comes for free once the protocol handles it. Stepping the loss count shows the delivered count under TCP never moving while its finishing tick keeps climbing.',
    ],

    avoidWhen: [
      'The article is about congestion control: shrinking a sending window, or fast retransmit on repeated acknowledgments. Here resending happens only on a timer and no window is drawn.',
      'The subject is QUIC, HTTP/3, or reliability an application builds on top of UDP. Only plain UDP and plain TCP appear.',
      'The article needs byte-level sequence numbers or the numbers exchanged during the handshake. Segments are counted as whole units and the handshake appears as three flagged arrows without numbers.',
    ],

    contrastWith: [
      {
        concept: 'threeWaySync',
        note: 'Why opening a connection takes three messages is its own question. What that opening costs a transfer — a fixed delay before any data moves, paid by every TCP connection and never by UDP — is one part of the price of reliability.',
      },
      {
        concept: 'sequenceNumber',
        note: 'Cumulative acknowledgment is the mechanism that lets a receiver report a gap. Reliable delivery is the whole service built from it together with holding, timing out and resending, judged by what it costs against sending without it.',
      },
      {
        concept: 'sendAndForget',
        note: 'Sending without copies or acknowledgments describes UDP on its own and what it leaves to the application. The comparison asks what that saving is worth against the time and packets TCP spends to leave no gap.',
      },
      {
        concept: 'portDemultiplex',
        note: 'Choosing an application by destination port alone is how a connectionless receiver delivers. A connection-oriented receiver adds the sender\'s address and port to that key, one of several differences a reliable transport brings.',
      },
      {
        concept: 'controlAndDataChannel',
        note: 'A protocol that opens a new connection per file pays connection setup again for every file. The comparison of transports prices that setup once; how often it is paid is decided by the application protocol.',
      },
      {
        concept: 'congestionControl',
        note: 'Both concern a TCP sender. Reliability is about getting every segment to the application in order despite loss; flow and congestion control are about how much to send at once so that loss and overflow happen less.',
      },
    ],
  },
};
