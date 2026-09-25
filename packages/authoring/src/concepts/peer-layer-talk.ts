/**
 * peerLayerTalk 개념 선언.
 *
 * canonical facet 은 `facet:peerLayerTalk` — 두 호스트가 선 하나로 이어져 있고, 보낸 쪽이 네 머리를 다 씌운 채
 * 시작한다. 받는 쪽의 층이 아래에서 위로 하나씩 제 머리만 열고(링크 → 네트워크 → 전송 → 응용), 그 머리를 쓴 보낸
 * 쪽의 같은 층과 짝으로 이어진다. 층 k 의 머리를 열지 않고 나른 층은 2k — 2 · 4 · 6 · 8.
 *
 * ── 묶음 안에서의 자리
 *
 * 이웃 `layerWrapsPayload` 는 보내는 쪽에서 씌우는 과정과 크기를, 완제품 `networkLayer` 는 머리 비용과 링크의
 * 겹침을 말한다. 이쪽의 주장은 **머리를 읽는 이는 건너편의 같은 층 하나뿐이고 그 아래는 봉한 채 나른다** 하나다.
 * 그래서 definition 은 receiving · opens only · same layer · sealed 쪽 낱말을 쥐고, 크기 · 바이트 · 쪼갬 · 시간은
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `peerLayerTalk.md` 가 밝힌 것): 가운데 라우터 없음(실제로는 라우터가 링크 머리를 열고 새로 쓴다) ·
 * 머리마다 한 칸만 보인다 · 적힌 것의 뜻은 판정하지 않는다 · 주소는 사설 대역과 로컬 관리 MAC.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const peerLayerTalkConcept: FacetConceptSource = {
  id: 'peerLayerTalk',
  label: 'Peer Layers: Each Header Is Read by Its Counterpart',
  canonicalFacet: 'facet:peerLayerTalk',

  surface: {
    definition:
      'Each receiving layer opens only the header its peer layer wrote on the sender, while every layer beneath carried it sealed, so layers can be designed as if talking directly to their counterpart.',
    exemplarKeywords: [
      'peer-to-peer layer communication',
      'layered protocol design',
      'decapsulation',
      'which layer reads which header',
      'logical communication between layers',
      'layer independence',
      'OSI peer entities',
      'horizontal vs vertical communication in the stack',
    ],
  },

  briefing: {
    observable: [
      'Two stacks, Sender and Receiver, joined by one wire; each has Application, Transport, Network, Link and Physical. Step 0: "Count of headers the sender wrote: 4. They go onto the wire sealed."',
      'As each header is opened its one field appears: Request line `GET /index.html HTTP/1.1` (application), Sequence number `1` (transport), Destination address `10.0.0.2` (network), Destination MAC `02:00:00:00:00:02` (link). The physical layer writes no header.',
      'Steps 1 to 4 climb the receiver from Link to Application. At each, "Receiver Link: opens only its own header. Written by: sender Link." and a pairing line joins the two same-named layers.',
      'The count of layers that carried a header without opening it rises 2, 4, 6, 8 — the layers below it on both hosts plus both physical layers. The application header travelled sealed through eight.',
      'There is no router between the hosts; in a real internet a router opens and rewrites the link header, so link-layer peers are neighbours across one wire. Only one field per header is drawn, the values are not judged, and the addresses are private or locally administered. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one receiving layer per step, five steps including the start, and stops at the application layer.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to step 2 holds the network header opened and paired while the transport and application headers above it are still sealed.',
      ],
    },

    useWhen: [
      'An article explains why a layered stack lets you replace the link without touching the application, and needs to show that no lower layer ever reads an upper header.',
      'The reader is confused by diagrams where layers "talk horizontally" and needs to see that the real path goes down and up, while only the matching layer opens each header.',
    ],

    avoidWhen: [
      'The topic is how headers are added or how large the result is. The sender starts fully wrapped and no sizes appear.',
      'The subject is routers, switches or anything between two endpoints. The hosts are wired directly.',
      'The article is about validating header contents, such as rejecting a wrong address or a bad checksum. Headers are opened, not checked.',
    ],

    contrastWith: [
      {
        concept: 'layerWrapsPayload',
        note: 'Adding headers going down on the sender is about nesting and size; removing them going up on the receiver is about ownership, since each header has exactly one reader.',
      },
      {
        concept: 'networkLayer',
        note: 'That each header belongs to one peer layer explains why a router need open only the lower ones. The delivery trade-off builds on that and asks what those per-packet headers cost when a message is split.',
      },
      {
        concept: 'macIsLocal',
        note: 'Both separate end-to-end information from per-link information. Peer layers put the separation in who reads a header; per-link MAC addressing puts it in the link header being replaced at each router while the network header travels unchanged.',
      },
    ],
  },
};
