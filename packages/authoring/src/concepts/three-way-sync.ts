/**
 * threeWaySync 개념 선언.
 *
 * canonical facet 은 `facet:threeWaySync` — 클라이언트와 서버가 각자 확인할 칸 둘을 쥐고, `SYN` · `SYN+ACK` · `ACK`
 * 가 닿을 때마다 칸이 채워진다. 가운데 메시지가 칸 둘을 한꺼번에 채우지만 두 번이 오간 뒤에도 서버의 "내 번호가 닿은
 * 것을 안다" 칸이 비어 있어, 셋째가 가서야 서버가 `ESTABLISHED` 가 된다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `tcpHandshake`(완제품)는 연결을 여는 값이 전송 전체에 얼마로 치이는지를 UDP 와 견준다. 이쪽의 질문은 하나 —
 * "왜 두 번이 아니라 세 번인가". 그래서 definition 은 각 끝이 알아야 할 사실 둘 · 시작 번호 · SYN+ACK 가 둘을 싣는다는
 * 낱말을 독점하고, 비용 · 늦음 · UDP 는 쓰지 않는다. 형제 `sequenceNumber` 가 쥔 바이트 · 누적 확인도 쓰지 않는다.
 *
 * 전제 (설명 글 `threeWaySync.md`): 시작 번호 4200 · 9100 과 주소는 예로 정한 값(실제 ISN 은 무작위, 주소는 문서용 대역).
 * 한 걸음 = 메시지 하나. 잃음 · 재전송 · 동시 열기는 없다. 연결이 열리는 데서 멈춘다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const threeWaySyncConcept: FacetConceptSource = {
  id: 'threeWaySync',
  label: 'TCP Three-Way Handshake (Why Three Messages)',
  canonicalFacet: 'facet:threeWaySync',

  surface: {
    definition:
      "Opening a TCP connection takes three messages because each end must receive the other's initial sequence number and learn that its own arrived; SYN+ACK carries two of those four facts at once.",
    exemplarKeywords: [
      'three-way handshake',
      'SYN, SYN-ACK, ACK',
      'why not a two-way handshake',
      'initial sequence number',
      'ISN',
      'TCP connection establishment',
      'SYN-RECEIVED state',
      'ESTABLISHED state',
      'ack = seq + 1',
      'RFC 793',
    ],
  },

  briefing: {
    observable: [
      'The Client (`192.0.2.10:49152`, `CLOSED`) stands on the left and the Server (`198.51.100.20:80`, `LISTEN`) on the right. Under each are two slots: the server\'s "Has the client\'s number" and "Knows its number arrived", the client\'s "Has the server\'s number" and "Knows its number arrived". The first caption counts the slots each side has to fill.',
      'Message 1, `SYN` with `seq=4200`, crosses to the server; its number drops into the server\'s first slot. The client becomes `SYN-SENT`, the server `SYN-RECEIVED`, and the tally reads 1 of 4 filled.',
      'Message 2, `SYN+ACK` with `seq=9100 ack=4201`, drops two pieces at once — one into each client slot — and the caption reports "Slots it filled: 2". The client turns `ESTABLISHED`; the tally reads 3 of 4 and "Not open yet" names the server, still `SYN-RECEIVED`.',
      'Message 3, `ACK` with `ack=9101`, fills the server\'s last slot, "Knows its number arrived". Both sides read `ESTABLISHED` and the tally is 4 of 4. Each slot keeps a tag showing which message filled it.',
      'Each acknowledgment number is the received starting number plus one (4201, 9101), because `SYN` itself uses up one number.',
      'The starting numbers 4200 and 9100 and the addresses are fixed example values — real TCP picks starting numbers at random, and the addresses are documentation ranges. One step is one message; nothing is lost or resent, both ends do not open at once, and the run stops as soon as the connection is open. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the three messages by itself and stops once both sides are `ESTABLISHED`.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is right after the second message, when three of four slots are full and the server alone is still waiting.',
        'The addresses, numbers and messages are fixed, so every flag, number and state can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'A reader asks why two messages cannot open a connection. After `SYN+ACK` one server slot is still empty — the server cannot yet know its own number reached the client — and that empty slot is the answer.',
      'The article explains what a `SYN+ACK` carries and why its acknowledgment number is the received sequence number plus one.',
    ],

    avoidWhen: [
      'The article is about SYN floods, SYN cookies or other attacks on connection setup. Only a clean, single exchange is shown.',
      'The subject is closing a connection with `FIN` or the `TIME_WAIT` state. The run ends when the connection opens.',
      'The article is about a TLS handshake or key exchange. Nothing here is secret or authenticated.',
    ],

    contrastWith: [
      {
        concept: 'tcpHandshake',
        note: 'Why the opening needs three messages is a question about what each end must know. What the opening costs a whole transfer — delay paid by every connection before data moves — is a question about reliability versus speed.',
      },
      {
        concept: 'sequenceNumber',
        note: 'The handshake agrees on starting numbers. Numbering every byte after that and acknowledging them cumulatively is what that agreement makes possible.',
      },
      {
        concept: 'sharedSecretInPublic',
        note: 'Both are opening exchanges, but this one agrees on starting numbers sent in the clear, while a key exchange agrees on a secret that an eavesdropper who sees every message still cannot compute.',
      },
    ],
  },
};
