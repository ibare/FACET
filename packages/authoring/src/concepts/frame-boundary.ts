/**
 * frameBoundary 개념 선언.
 *
 * canonical facet 은 `facet:frameBoundary` — 데이터 `48 7E 49 7D 21` 을 채워 넣은 선 위 아홉 바이트
 * `7E 48 7D 5E 49 7D 5D 21 7E` 를 받는 쪽이 한 바이트씩 읽는다. 상태 셋(열리기 전 · 열림 · 탈출 뒤)을 오가며
 * `5E` 를 `7E` 로, `5D` 를 `7D` 로 되돌려 담고, 마지막 `7E` 에서 닫아 보낸 다섯 바이트를 그대로 얻는다.
 *
 * ── 묶음 안에서의 자리
 *
 * 합친 토픽 datalink-layer 에서 나온 조각이라 완제품 `physicalLayer` 아래 든다. 완제품은 데이터마다 채움이 늘리는
 * 바이트를 세고, 이웃 `bitsAsSignal` 은 비트의 경계를 말한다. 이쪽의 주장은 **받는 쪽이 표식과 같은 값을 만나도
 * 탈출 뒤라면 닫지 않는다** 하나다. 그래서 definition 은 receiver · escape · restores · does not close 쪽
 * 낱말을 쥐고, 부호 · 전압 · 견줌 · 값(오버헤드)은 쓰지 않는다.
 *
 * 전제 (설명 글 `frameBoundary.md` 가 밝힌 것): PPP(RFC 1662) 의 바이트 채워 넣기를 줄였다 — 주소 · 제어 ·
 * 프로토콜 칸과 FCS 는 없다. 데이터 다섯 바이트는 예로 정한 값. 보내는 쪽의 채워 넣기는 시작 전에 끝나 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const frameBoundaryConcept: FacetConceptSource = {
  id: 'frameBoundary',
  label: 'Frame Boundary: Reading Byte-Stuffed Data',
  canonicalFacet: 'facet:frameBoundary',

  surface: {
    definition:
      'A receiver reading a byte-stuffed frame drops each escape byte and restores the byte after it, so a data byte equal to the end flag is kept as data and does not close the frame.',
    exemplarKeywords: [
      'byte stuffing',
      'escape byte 0x7D',
      'flag byte 0x7E',
      'frame delimiter inside the data',
      'data transparency',
      'PPP framing RFC 1662',
      'XOR 0x20',
      'unstuffing at the receiver',
      'how does the receiver find the end of a frame',
    ],
  },

  briefing: {
    observable: [
      'Four rows: Sent (`48 7E 49 7D 21`), Line (nine bytes `7E 48 7D 5E 49 7D 5D 21 7E`, already stuffed), a Frame state box with Not open · Open · After escape · Closed, and Received. It starts with "Nothing read yet. Bytes on the line: 9."',
      'Each step reads one line byte. Step 1: "7E: flag. The frame opens." Step 2: `48` is kept as is.',
      'Step 3: `7D` is an escape — "Dropped; the next byte is restored" — and the state moves to After escape. Step 4 shows "5E XOR 20 = 7E. Kept as data." followed by "Same value as the flag, yet the frame stays open."',
      'Steps 6 and 7 repeat the pattern for the escape byte itself: `7D` is dropped and `5D` becomes `7D`.',
      'Step 9 reads the final `7E` and closes the frame: "Received bytes: 5. Sent bytes: 5." — the Received row reads `48 7E 49 7D 21`, the same as Sent. Nine line bytes are five data, two flags and two escapes.',
      'The rules are PPP byte stuffing (RFC 1662) cut down to the data field; a real PPP frame also carries address, control and protocol fields and an FCS, stuffed the same way. The five data bytes are example values. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one line byte per step, ten steps including the start, and stops when the frame closes.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 4 holds the restored `7E` in the Received row while the state box still shows the frame open.',
        'The data and the stuffed line are fixed. The line is already stuffed at the start, so every step belongs to the receiver.',
      ],
    },

    useWhen: [
      'The reader asks the obvious objection to flag-delimited frames — what if the data contains the flag? — and needs to watch a restored `7E` pass through without ending the frame.',
      'An article walks through a receiver state machine for PPP or HDLC-style byte framing and wants each byte labelled with the transition it causes.',
    ],

    avoidWhen: [
      'The framing in question uses a length field, a preamble with start-of-frame delimiter, or bit stuffing. Only flag-and-escape byte stuffing appears.',
      'The article is about checksums or corrupted frames. No FCS is carried and nothing goes wrong on the line.',
      'The point is the overhead of stuffing over many payloads. One fixed payload is read; the added bytes are counted once.',
    ],

    contrastWith: [
      {
        concept: 'physicalLayer',
        note: 'The rule for undoing an escape is shared; the claims differ. That a flag-valued byte survives is a claim about correctness, while the bytes that transparency adds are a cost that depends on how often the data imitates the flag.',
      },
      {
        concept: 'bitsAsSignal',
        note: 'A frame edge is marked by a reserved byte value that the data must never imitate; a bit edge is marked by a voltage flip that the code guarantees. One needs an escape rule, the other needs extra signalling.',
      },
    ],
  },
};
