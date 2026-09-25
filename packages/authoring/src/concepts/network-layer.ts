/**
 * networkLayer 개념 선언.
 *
 * canonical facet 은 `facet:networkLayer` — 응용 데이터 1200 바이트를 n 조각으로 나눠 링크 L 개를 지나 보낸다.
 * 조각마다 머리 · 꼬리 58 바이트(TCP 20 · IPv4 20 · 이더넷 14 + FCS 4)를 다시 내고, 라우터는 조각 하나를 온전히
 * 받은 뒤에야 넘긴다. 끝 시각 = (L + n − 1) × (1200/n + 58) 바이트 시간. 손잡이 n {1,2,3,4,6,12} × L {1,2,3,5} 에서
 * 가장 빠른 쪼갬이 1 · 4 · 6 · 12 로 옮겨 가고, 응용 몫은 95% → 63% 로 준다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 한 호스트 안에서 층마다 머리가 씌워짐(`layerWrapsPayload`) · 받는 쪽 층이 제 짝의
 * 머리만 엶(`peerLayerTalk`) · 틱마다 이웃에게 한 칸씩 넘김(`hopByHop`) · 메일이 `250` 전까지 맡은 곳에 머묾
 * (`storeAndForward`, 버린 토픽 smtp 에서 옮김). 이쪽은 **머리 비용과 링크의 겹침이 한 식에서 맞서는 것**을 맡는다.
 * 그래서 definition 은 쪼갬 · 머리 비용 · 끝 시각 · 링크 수가 가장 빠른 쪼갬을 정한다는 쪽 낱말을 쥐고, 조각들이
 * 독점한 wraps · peer · each tick · custody 는 쓰지 않는다. 합친 토픽 application-layer 는 버렸고 맨 윗칸(응용 데이터)이
 * 그 자리를 채운다.
 *
 * 전제 (설명 글 `networkLayer.md` 가 밝힌 것):
 *  - 시간은 바이트 시간(예로 정한 단위). 링크 속도는 모두 같다 · 전파 · 처리 지연 0 · 줄 설 자리 넉넉.
 *  - 길은 한 줄 — 라우팅 표 · TTL 없음. IP 조각화와 이더넷 최소 프레임 채움은 세지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이라 언어별로 다른 뜻을 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const networkLayerConcept: FacetConceptSource = {
  id: 'networkLayer',
  label: 'Encapsulation and Hop-by-Hop Delivery (Packet Size Trade-off)',
  canonicalFacet: 'facet:networkLayer',

  surface: {
    definition:
      'Splitting a message into more packets costs a full set of headers per packet but lets successive links carry them at once, so the split with the earliest finish time depends on how many links the path has.',
    exemplarKeywords: [
      'packet switching vs message switching',
      'why split data into packets',
      'end-to-end delay with store-and-forward routers',
      'optimal packet size',
      'header overhead per packet',
      'more packets means more headers',
      '(L + n - 1) transmission times',
      'protocol overhead percentage',
      'TCP/IP layers',
      'encapsulation overhead',
    ],
  },

  briefing: {
    observable: [
      'A band at the top shows the bytes of one packet on one link: link header and trailer, network header, transport header, application data. Below it is a row of nodes — sending host A, routers R1, R2 …, receiving host B — each with its layer labels; routers show only Network, Link and Physical.',
      'Step 0 splits and wraps: "Pieces: 1 · Piece size: 1258 bytes · Links: 3", with "Bytes over one link" and "Application share: 95%". Each piece carries 58 bytes of headers and trailer (20 + 20 + 14 + 4).',
      'Each following step is one tick, the time to put one packet on one link: "Tick 3 · Busy links: 1 · Elapsed: 3774 byte times". On a timeline with one lane per link, packets grow as cells that overlap in a staircase when there are several.',
      'The round ends with "Finish time: … byte times · Fastest split: …". Six bars at the bottom give the finish time for every split at the current link count; with 3 links they read 3774, 2632, 2290, 2148, 2064, 2212, and 6 pieces is fastest.',
      'Across the link handle the fastest split moves: 1 link → 1 piece (1258), 2 → 4 (1790), 3 → 6 (2064), 5 → 12 (2528). The application share falls from 95% unsplit to 63% at 12 pieces. With one link, splitting only adds headers.',
      'Time is in byte times, an example unit; all links run at the same speed, propagation and processing delay are zero and router queues are unlimited. There is one path, so no routing table or TTL is involved, and IP fragmentation and minimum Ethernet frame padding are ignored. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Pieces" (1, 2, 3, 4, 6, 12; starts at 1) and "Links" (1, 2, 3, 5; starts at 3). Each round plays to its finish and waits; the finish-time marker moves from the old position to the new one.',
        'Readouts: Header bytes (58 × pieces), Application share %, Elapsed (byte times).',
        'The move that makes the idea land is stepping Pieces up at 3 links and watching the finish bar fall until 6 pieces, then rise again at 12; then set Links to 1 and see every split lose to the unsplit message.',
        'The code panel, labelled "Finish time", starts empty with a "+ Add language" button and shows the tick-by-tick forwarding loop in Python, JavaScript, TypeScript, Java, C++ or C#, highlighting the line of the current step.',
      ],
    },

    useWhen: [
      'An article argues why networks carry data in packets rather than whole messages, and needs the counter-case too: on a single link, splitting only makes delivery slower.',
      'A textbook exercise asks for the end-to-end delay of n packets over L store-and-forward links, and the reader should see the (L + n − 1) ticks and the per-packet header cost trade off in one table.',
      'The reader wonders what fraction of transmitted bytes is actual data, and how that fraction shrinks as packets get smaller.',
    ],

    avoidWhen: [
      'The topic is route selection, forwarding tables or TTL. The path is a single fixed line.',
      'The article is about queueing delay, congestion or links of different speeds. Every link is identical and queues never fill.',
      'The subject is the content of each header field. Headers are counted by size only.',
    ],

    contrastWith: [
      {
        concept: 'layerWrapsPayload',
        note: 'Wrapping one message layer by layer establishes the header cost once. Repeating that cost for every packet and setting it against the time saved by overlapping links is what turns the header size into a choice about packet count.',
      },
      {
        concept: 'peerLayerTalk',
        note: 'Which layer reads which header is a question of responsibility. The packet-size trade-off only needs to know that routers strip and rewrite the link header while the upper headers ride along, and asks what that costs in bytes and time.',
      },
      {
        concept: 'hopByHop',
        note: 'Forwarding only fully received packets to the next node is the rule; the trade-off takes that rule as given and asks how many packets to cut the message into once each one carries its own headers.',
      },
      {
        concept: 'storeAndForward',
        note: 'Holding a unit until the next node has all of it is shared by both; relaying mail uses it to survive a node being down, while packet delivery uses it to overlap transmission on consecutive links.',
      },
      {
        concept: 'ipRouting',
        note: 'Choosing the next hop from a table decides where a packet goes. The split trade-off assumes the path is fixed and asks only how long the data takes to cross it.',
      },
    ],
  },
};
