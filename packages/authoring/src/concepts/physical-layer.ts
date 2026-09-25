/**
 * physicalLayer 개념 선언.
 *
 * canonical facet 은 `facet:physicalLayer` — 같은 다섯 바이트를 PPP 식 바이트 채워 넣기로 틀에 담고, 부호(NRZ ·
 * NRZI · 맨체스터)로 전압 선에 실은 뒤, 받는 쪽이 선 위 바이트를 하나씩 읽어 되찾는다. 손잡이 둘 — 부호 셋 ×
 * 데이터 넷(`48…42` · `00…00` · `FF…FF` · `7E…7E`) — 을 돌리면 가장 긴 평평(42 · 43 · 40 · 2 · 1 비트)과
 * 신호 칸(56 ↔ 112), 선 위 바이트(7 ↔ 12)가 갈린다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `bitsAsSignal` 은 맨체스터 하나로 문자 한 바이트를 싣는 장면(가운데 뒤집힘의 방향이 비트)이고,
 * `frameBoundary` 는 받는 쪽이 탈출 바이트를 풀며 틀의 끝을 알아보는 장면이다. 이쪽은 두 경계를 한 판에 놓고
 * **부호와 데이터를 바꿔 가며 값을 견주는 것**을 맡는다. 그래서 definition 은 세 부호의 이름 · 가장 나쁜 데이터 ·
 * 치르는 값(신호 칸 두 배 · 늘어난 바이트) 쪽 낱말을 쥐고, 조각들이 독점한 mid-bit direction · XOR 되돌림 ·
 * 받는 쪽 상태 이름은 쓰지 않는다. 합친 토픽 datalink-layer(틀 나누기)는 exemplarKeywords 가 품는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `physicalLayer.md` 가 밝힌 것):
 *  - 비트는 높은 자리 먼저(실제 이더넷은 바이트의 낮은 자리 먼저). 전압은 높음 · 낮음 두 값. 받는 쪽 시계 맞추기는 그리지 않는다.
 *  - 틀은 PPP 의 바이트 채워 넣기를 빌렸고 주소 · 제어 · 프로토콜 칸과 FCS 는 뺐다. NRZI 와 짝을 이루는 비트 채워 넣기는 없다.
 *  - 실제 맨체스터 10BASE-T 는 채워 넣기가 아니라 프리앰블과 길이로 틀을 가른다 — 두 경계를 한 화면에 놓으려 한 선에 얹은 것.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이라 언어별로 다른 뜻을 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const physicalLayerConcept: FacetConceptSource = {
  id: 'physicalLayer',
  label: 'Line Codes and Framing (NRZ, NRZI, Manchester, Byte Stuffing)',
  canonicalFacet: 'facet:physicalLayer',

  surface: {
    definition:
      'Comparing NRZ, NRZI and Manchester line codes together with flag-based byte stuffing across worst-case payloads: each keeps the receiver aligned at a price, twice the signal cells or extra bytes on the wire.',
    exemplarKeywords: [
      'line coding',
      'NRZ vs NRZI vs Manchester',
      'long runs of zeros',
      'clock recovery',
      'transition density',
      'Manchester doubles the bandwidth',
      'framing overhead',
      'PPP byte stuffing overhead',
      'data link layer framing',
      'physical layer',
    ],
  },

  briefing: {
    observable: [
      'Top to bottom the stage holds the sent data (five bytes), the bytes on the wire with the two `7E` flags marked, a voltage line drawn between high and low, and a receiver with three states — before frame, open, after escape — and a Recovered row.',
      'Step 0 frames the data: "Framed — wire bytes: 7 · escapes added: 0" for ordinary payloads. Step 1 lays the line: "NRZ on the line — signal cells: 56 · transitions: 4 · longest flat: 42 bits", and a band marks the longest stretch where the voltage stays put.',
      'From step 2 the receiver reads one wire byte per step — the opening flag, each data byte kept or restored, the closing flag — until "recovered bytes: 5" matches the sent data. A round is the wire bytes plus two steps.',
      'Longest flat by code and payload: all zeros NRZ 42 · NRZI 43 · Manchester 1; all ones NRZ 40 · NRZI 2 · Manchester 1. Manchester never exceeds 1 bit, but it uses 112 signal cells where the other two use 56.',
      'The payload `7E 7E 7E 7E 7E` is all flag bytes; each is sent as two bytes, so the wire grows from 7 to 12 bytes with 5 escapes added. The other three payloads need no escapes.',
      'Bits go high-order first (real Ethernet sends each byte low-order first), and voltage has only two levels. The framing borrows PPP byte stuffing without its address, control, protocol and FCS fields; NRZI here has no bit stuffing, and real 10BASE-T Manchester Ethernet delimits frames with a preamble and length rather than stuffing. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Line code" (NRZ, NRZI, Manchester; starts at NRZ) and "Payload" (48…42, 00…00, FF…FF, 7E…7E; starts at 00…00). Each round plays to the end and waits; a new round starts from the previous line, which folds or unfolds in place.',
        'Readouts: Wire bytes, Signal cells, Transitions, Longest flat (bits), Recovered bytes.',
        'The move that makes the idea land is holding the all-zeros payload and stepping the line code: the flat band shrinks from 42 bits to 1 while signal cells jump from 56 to 112. Then switch the payload to 7E…7E to watch the wire row stretch.',
        'The code panel, labelled "Stuff, encode, receive", starts empty with a "+ Add language" button; it shows the same functions in Python, JavaScript, TypeScript, Java, C++ or C# and highlights the line of the current step.',
      ],
    },

    useWhen: [
      'An article surveys line codes and has to justify why Manchester spends twice the signalling rate, by showing a payload of zeros that leaves an NRZ line flat for 42 bits.',
      'The reader needs to see that NRZI fixes runs of ones but not runs of zeros, and that the worst case for each code depends on the data.',
      'A text on framing wants the cost of transparency in numbers: the same five bytes take 7 wire bytes normally and 12 when every byte collides with the flag.',
    ],

    avoidWhen: [
      'The subject is bit stuffing as in HDLC or USB, 4B/5B, 8B/10B or scrambling. Only byte stuffing and three plain codes appear.',
      'The article is about signal levels, attenuation, noise, modulation or bandwidth in hertz. Voltage is drawn with two levels and no physical units.',
      'The topic is error detection (CRC, FCS, parity). No check field is carried or verified.',
    ],

    contrastWith: [
      {
        concept: 'bitsAsSignal',
        note: 'How one code turns each bit into a transition is the mechanism. Weighing codes against each other on hostile data asks what that guaranteed transition costs and when a cheaper code fails.',
      },
      {
        concept: 'frameBoundary',
        note: 'Reading an escaped byte back is how a receiver keeps the frame intact. The comparison across payloads is about the bytes that transparency adds, which depend entirely on how often the data imitates the flag.',
      },
    ],
  },
};
