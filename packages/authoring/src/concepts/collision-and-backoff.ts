/**
 * collisionAndBackoff 개념 선언.
 *
 * canonical facet 은 `facet:collisionAndBackoff` — 스테이션 A · B 가 슬롯 0 에 함께 보내 부딪히고, 각자 k(A 0 · B 1)
 * 슬롯을 쉰 뒤 다시 듣는다. A 가 슬롯 1 에 빈 선을 듣고 세 슬롯을 보내고, B 는 슬롯 2 에 찬 선을 듣고 미루다
 * 슬롯 4 에 이어 보낸다. 슬롯 일곱, 충돌 한 번.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `ethernet` 은 스테이션 수와 물러나기 규칙(고정 · 두 배)을 돌려 버려지는 프레임을 센다. 이쪽의 주장은
 * **부딪힌 둘이 서로 다른 기다림을 쥐어 다음 순간이 갈린다** 하나다 — 범위가 두 배로 넓어지는 것은 이쪽의 말이
 * 아니다. 그래서 definition 은 two stations · both hear idle · different waits · shorter · defers 쪽 낱말을
 * 쥐고, 범위 넓힘 · 스테이션 수 · 버림 · 열여섯은 쓰지 않는다.
 *
 * 전제 (설명 글 `collisionAndBackoff.md` 가 밝힌 것): k 는 실제로 무작위이나 여기서는 A 0 · B 1 로 예로 정한 값 ·
 * 슬롯 = 512 비트 시간(10 Mb/s 에서 51.2 µs) · 전파 지연은 슬롯 안 · 멈춤 신호는 충돌 슬롯에 접음 · 프레임 사이 틈 없음 ·
 * 프레임 3 슬롯.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const collisionAndBackoffConcept: FacetConceptSource = {
  id: 'collisionAndBackoff',
  label: 'Collide, Back Off, Try Again (Two Stations on One Line)',
  canonicalFacet: 'facet:collisionAndBackoff',

  surface: {
    definition:
      'Two stations that hear an idle line and start together collide, stop, and wait different numbers of slots; the shorter wait takes the line and the other finds it busy and defers.',
    exemplarKeywords: [
      'Ethernet collision',
      'carrier sense multiple access',
      'collision detection',
      'random backoff after a collision',
      'jam signal',
      '1-persistent CSMA',
      'listen before talk',
      'why waiting the same time collides again',
      'shared bus',
    ],
  },

  briefing: {
    observable: [
      'Two rows, Station A and Station B, above a Shared line row, with slots numbered along the bottom. Both have a frame ready at slot 0; a frame holds the line for 3 slots.',
      'Slot 0: "collision. Started together on an idle line: 2", then "Stopped, each backing off to its own mark: 2". Each station shows its draw: A "k = 0 (0–1)", B "k = 1 (0–1)". Collisions: 1.',
      'Slot 1: "Station A hears an idle line and sends." while B has 0 slots of waiting left. Slot 2: A holds the line and "Station B hears a busy line and keeps listening." Slot 3: A sends its last slot and is done; B is still listening.',
      'Slot 4: Station B hears an idle line and sends, finishing at slot 6 ("Collisions: 1"). Seven slots in all, one collision, no second collision.',
      'Real stations draw k at random; A 0 and B 1 are example values chosen so the waits differ. A slot is 512 bit times (51.2 µs at 10 Mb/s) with propagation folded in; the jam signal sits inside the collision slot, there is no inter-frame gap, and a real frame can be longer than 3 slots. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one slot per step, eight steps including the start, and stops when B finishes.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to slot 2 holds B listening to a busy line while A is mid-frame.',
        'The draws are fixed, so the run is the same every time.',
      ],
    },

    useWhen: [
      'The reader asks why two stations that collided do not simply collide again when they retry, and needs to see the two waits come out different.',
      'An article introduces carrier sense and collision detection on a shared line and wants the listen, collide, wait, defer sequence slot by slot for just two senders.',
    ],

    avoidWhen: [
      'The topic is how the backoff range widens after repeated collisions, or what happens with many stations. There is one collision between two stations.',
      'The subject is wireless collision avoidance (CSMA/CA, RTS/CTS). Collisions here are detected on a wire, not avoided in advance.',
      'The article is about retrying failed requests to a server. This is two transmitters sharing one physical line.',
    ],

    contrastWith: [
      {
        concept: 'ethernet',
        note: 'Two different waits are the basic escape from one collision. With more contenders a small fixed range keeps producing equal waits, which is why the range has to grow after each collision.',
      },
    ],
  },
};
