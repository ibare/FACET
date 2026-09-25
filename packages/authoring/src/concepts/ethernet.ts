/**
 * ethernet 개념 선언.
 *
 * canonical facet 은 `facet:ethernet` — 한 선을 N 스테이션(2 · 4 · 8)이 나눠 쓸 때 충돌마다 물러날 범위를 고정(0..1)으로
 * 두는 것과 두 배로 넓히는 것(1 · 2 · 4 … 1024 에서 멈춤)을 슬롯 단위로 재생한다. 열여섯 번째 충돌에서 프레임을 버린다.
 * 씨앗 셋(1 · 42 · 1234) 모두 N = 8 에서 고정은 여섯에서 여덟을 버리고, 두 배 넓힘은 하나도 버리지 않는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `collisionAndBackoff` 는 둘이 한 번 부딪혀 서로 다른 기다림으로 갈라지는 장면이다(범위 넓힘은 그 조각의 말이
 * 아니다). 이쪽은 **경쟁자 수와 물러나기 규칙을 돌려 버려지는 프레임이 갈리는 것**을 맡는다. 그래서 definition 은
 * fixed range · doubling · number of stations · dropped after 16 쪽 낱말을 쥐고, 조각이 독점한 두 스테이션 ·
 * 한 번의 충돌 · 짧은 쪽이 먼저 · 찬 선을 듣고 미룸은 쓰지 않는다. system-design 의 재시도 물러나기(서버에 몰리는
 * 재시도 · 지터)와는 매체가 다르다 — 이쪽은 공유 매체의 충돌이다.
 *
 * 전제 (설명 글 `ethernet.md` 가 밝힌 것):
 *  - k 는 식이 있는 생성기에서 뽑는다 (`x ← (25173x + 13849) mod 65536`, `k = (x ÷ 64) mod 창`) — 실제는 무작위.
 *  - 슬롯 하나 = 10 Mb/s 에서 512 비트 시간(51.2 µs). 프레임 세 슬롯은 예로 정한 값. 프레임 사이 틈 없음 · 멈춤 신호는
 *    충돌 슬롯 안에 접음 · 전파 지연 0 · 스테이션마다 프레임 하나.
 *  - 오늘의 스위치 이더넷은 전이중이라 충돌이 없다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이라 언어별로 다른 뜻을 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ethernetConcept: FacetConceptSource = {
  id: 'ethernet',
  label: 'CSMA/CD Backoff: Fixed Range vs Binary Exponential',
  canonicalFacet: 'facet:ethernet',

  surface: {
    definition:
      'On shared Ethernet, a backoff range that stays fixed makes the same stations collide repeatedly and drop frames after sixteen attempts as their number grows, while doubling the range per collision lets every frame through.',
    exemplarKeywords: [
      'binary exponential backoff',
      'CSMA/CD',
      'contention window grows',
      'excessive collisions',
      '16 attempts then discard',
      'backoff limit 1024 slots',
      'slot time 51.2 microseconds',
      'half-duplex Ethernet hub',
      'more stations more collisions',
      'Ethernet MAC protocol',
    ],
  },

  briefing: {
    observable: [
      'One row per station (A to H at 8 stations) on a slot axis, a wire row on top, and on the right each station’s current backoff range as cells with the drawn k shaded. Step 0: "Slot 0 · one frame each: A B C D E F G H" and "Backoff range: fixed at 0..1 · seed 42".',
      'Each step is one event — a collision slot or a slot where one station starts sending alone. A collision reads "Slot 0 · collision: A B C D E F G H" then "Listen again at slot: A 1 · B 2 · …"; an × marks the slot, a bar the backoff, a bracket the range, a ring the slot where the station listens again.',
      'With a fixed range of 0..1, eight stations keep landing on the same two slots. Collision counts climb on every row until "Dropped at collision 16: D" appears at slot 17; with seed 42 the round ends with 24 collisions and 6 frames dropped.',
      'With doubling, each station’s range doubles per collision — 2, 4, 8 and up to 64 in these runs — and stations scatter further along the slot axis; with 8 stations and seed 42 the round has 7 collisions and 0 dropped. Across seeds 1, 42 and 1234 at 8 stations, fixed drops 7, 6 and 8 frames, doubling drops none.',
      'At 2 stations both rules need a single collision; at 4 the fixed range collides more but still delivers everything. Doubling is not always faster — at 4 stations with seed 42 it ends at slot 33 against 23 for fixed. What it buys is that no frame is discarded.',
      'Real stations draw k at random; here a written-out generator makes each round repeatable. A slot is 512 bit times (51.2 µs at 10 Mb/s), a frame is three slots by choice, there is no inter-frame gap or propagation delay, and the jam signal is folded into the collision slot. Modern switched Ethernet is full duplex and has no collisions. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus three handles: "Stations" (2, 4, 8; starts at 8), "Backoff" (Fixed, Doubling; starts at Fixed) and "Seed" (1, 42, 1234; starts at 42). Each round plays to its end and waits; the previous round’s wire stays as a faint outline and the end flag moves.',
        'Readouts: Collisions, Frames sent, Frames dropped.',
        'The move that makes the idea land is keeping 8 stations and switching Backoff from Fixed to Doubling: dropped frames go from six to zero while the backoff bars stretch out across the slot axis.',
        'The code panel, labelled "CSMA/CD with backoff", starts empty with a "+ Add language" button and shows the slot loop and generator in Python, JavaScript, TypeScript, Java, C++ or C#, highlighting the line of the current step.',
      ],
    },

    useWhen: [
      'An article explains why Ethernet widens its backoff range after each collision instead of using a small fixed one, and needs a case where the fixed range actually loses frames.',
      'The reader asks how stations that cannot count their competitors still spread out, and should see the range grow toward the number of contenders on its own.',
      'A text on classic shared-medium Ethernet wants the 16-attempt discard and the 1024-slot cap shown in operation rather than stated.',
    ],

    avoidWhen: [
      'The topic is retrying requests against a server, retry storms or jitter in distributed systems. This is a shared wire where simultaneous sends destroy each other.',
      'The subject is switched, full-duplex Ethernet or Wi-Fi’s CSMA/CA. Collisions are detected on a single shared line here.',
      'The article needs throughput or delay figures for real networks. Frame length, timing and the generator are simplified.',
    ],

    contrastWith: [
      {
        concept: 'collisionAndBackoff',
        note: 'Different random waits are what separate two colliding senders at all. Whether the range stays fixed or grows decides whether that still works as contenders multiply; a fixed range fails by discarding frames.',
      },
    ],
  },
};
