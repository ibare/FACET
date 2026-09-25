/**
 * layerWrapsPayload 개념 선언.
 *
 * canonical facet 은 `facet:layerWrapsPayload` — 한 호스트 안에서 응용 데이터 100 바이트가 층을 하나씩 내려가며
 * 전송 머리 20 → 120, 네트워크 머리 20 → 140, 링크 머리 14 · 꼬리 4 → 158 이 된다. 덧붙은 것 58 · 응용 몫 0.63.
 * 걸음 다섯 (응용 · 전송 · 네트워크 · 링크 · 선).
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `networkLayer` 는 이 머리 비용을 조각마다 되풀이하며 링크의 겹침과 맞세운다. 이웃 `peerLayerTalk` 는
 * 받는 쪽에서 누가 어느 머리를 여는지를 말한다. 이쪽의 주장은 **보내는 쪽에서 층마다 바깥에 머리가 씌워지고 안은
 * 손대지 않는다** 하나다. 그래서 definition 은 sending host · going down · wraps outside · untouched · grows 쪽
 * 낱말을 쥐고, 받는 쪽 · 짝 · 라우터 · 쪼갬 · 시간은 쓰지 않는다.
 *
 * 전제 (설명 글 `layerWrapsPayload.md` 가 밝힌 것): TCP/IP 층으로 세고 물리 층은 바이트를 덧붙이지 않아 층으로
 * 세우지 않는다 · 프리앰블과 프레임 사이 틈은 세지 않는다 · TCP · IPv4 는 선택 항목 없음 · 100 바이트는 예로 정한 크기
 * (158 ≥ 64 라 채움 없음) · 받는 쪽은 그리지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const layerWrapsPayloadConcept: FacetConceptSource = {
  id: 'layerWrapsPayload',
  label: 'Encapsulation: Each Layer Wraps the Payload',
  canonicalFacet: 'facet:layerWrapsPayload',

  surface: {
    definition:
      'On the sending host, data passing down the protocol stack gets each layer’s header added outside it, and the link layer adds a trailer too, while the inner contents stay untouched and the total grows.',
    exemplarKeywords: [
      'encapsulation',
      'protocol data unit',
      'segment packet frame',
      'TCP header 20 bytes',
      'IPv4 header 20 bytes',
      'Ethernet header and FCS',
      'headers added going down the stack',
      'how big is the frame on the wire',
      'payload inside a packet inside a frame',
    ],
  },

  briefing: {
    observable: [
      'Rows for Application, Transport, Network, Link and Wire. Step 0 shows only the application data: "Application hands its data down." with Size: 100.',
      'Transport wraps a header around the outside: "Header: 20. Size: 120". Network adds its own: "Header: 20. Size: 140".',
      'Link wraps a header in front and a trailer behind: "Header: 14. Trailer: 4. Size: 158".',
      'The last step puts the whole frame on the wire: "Total: 158. Added: 58. Application data share: 0.63".',
      'The application data box never moves sideways; each new header attaches to the outside left, the trailer to the outside right, and dashed outlines left on earlier rows show the size growing layer by layer.',
      'Layers follow the TCP/IP model; the physical layer adds no bytes and is not a row. TCP and IPv4 headers carry no options, the trailer is the Ethernet FCS, the preamble and inter-frame gap are not counted, and 100 bytes is an example size (158 is above the 64-byte minimum, so no padding). The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one layer per step, five steps, and stops when the frame reaches the wire.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to the network step holds the 140-byte packet before the link layer wraps it.',
        'The sizes are fixed, so every number can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'An article introduces the terms segment, packet and frame and needs to show that each is the previous one plus a header, not a new object.',
      'The reader is surprised that 100 bytes of data take 158 bytes on an Ethernet link and wants to see where every added byte comes from.',
    ],

    avoidWhen: [
      'The topic is decapsulation, or what a receiver or router does with the headers. Only the sending host is drawn.',
      'The article concerns the fields inside the headers (ports, addresses, flags, checksums). Headers appear as sized blocks.',
      'The subject is the seven-layer OSI model with session and presentation layers. Four TCP/IP layers are shown.',
    ],

    contrastWith: [
      {
        concept: 'networkLayer',
        note: 'Wrapping one message fixes the header cost once. Splitting a message pays that cost again per packet, and whether that pays off depends on how many links the packets cross.',
      },
      {
        concept: 'peerLayerTalk',
        note: 'Headers are added top-down on the sender; each is later removed by exactly one layer on the other side. Adding is about size and nesting, removing is about who is entitled to read what.',
      },
    ],
  },
};
