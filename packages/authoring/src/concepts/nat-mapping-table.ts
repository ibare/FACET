/**
 * natMappingTable 개념 선언.
 *
 * canonical facet 은 `facet:natMappingTable` — 공인 주소 `203.0.113.9`, 빈 표. `10.0.0.11:50500` 이 나가며 61001 줄,
 * `10.0.0.12:50500` 이 나가며 61002 줄이 적힌다. 답은 나간 차례의 거꾸로 와서 받는 포트로 줄을 찾아 되돌아가고,
 * 줄 없는 61005 로 온 `192.0.2.99:443` 의 패킷은 경계에서 버려진다. 걸음 여섯, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `rewriteAddressPort` 는 나가는 칸이 갈리는 장면, 완제품 `nat` 은 열쇠와 칸을 손잡이로 견준다. 이쪽은
 * **표에 적고 받는 포트로 되짚는 것** 하나다 — definition 은 records a row · keyed by public port · looks up ·
 * restore the inside address · no matching row 를 쥐고, 칸 이름(sender fields)을 쓰지 않는다. 열쇠는 받는 포트
 * 하나뿐이라 "먼 쪽까지 보는 열쇠" 는 이쪽이 말하지 않는다.
 *
 * 전제: 가장 단순한 NAT — 먼 쪽은 적어 두기만 한다. 줄 만료 없음. 61001 부터 차례는 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const natMappingTableConcept: FacetConceptSource = {
  id: 'natMappingTable',
  label: 'NAT Translation Table (Mapping Replies Back)',
  canonicalFacet: 'facet:natMappingTable',

  surface: {
    definition:
      'A NAT device records each outgoing flow as a row keyed by its public port, then looks up an incoming packet\'s destination port to restore the inside address, dropping packets that match no row.',
    exemplarKeywords: [
      'NAT table',
      'NAT translation table',
      'connection mapping',
      'how NAT knows which device gets the reply',
      'reverse translation',
      'unsolicited packet dropped at NAT',
      'NAT session entry',
      'conntrack',
    ],
  },

  briefing: {
    observable: [
      'Outside hosts `198.51.100.7`, `192.0.2.44` and `192.0.2.99` face a NAT holding `203.0.113.9`; inside are `10.0.0.11` and `10.0.0.12`. Between them is a table with columns Public port · Inside · Remote, empty at first ("The table is empty. Public address: 203.0.113.9.").',
      'Two outgoing packets write rows: "Out from 10.0.0.11:50500. Row written for public port 61001." and the same for `10.0.0.12:50500` with 61002. The two inside ports are both 50500; the public ports differ.',
      'Replies return in the reverse order: "In to public port 61002. Row found. Back to: 10.0.0.12:50500." then 61001 back to `10.0.0.11:50500` — matched by port, not by arrival order.',
      'Last, `192.0.2.99:443` sends to `203.0.113.9:61005`: "In to public port 61005. No row. Dropped at the boundary." After six steps the table holds two rows, with two returns and one drop.',
      'The lookup key is the destination port alone; the remote column is recorded but not checked. Rows never expire here. Ports from 61001 in order are example values.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one packet per step, and stops after the dropped packet.',
        'A Replay button and a playback strip sit below it. Dragging back to the first return holds the moment a reply finds its row by port.',
        'Addresses and ports are fixed, so each row and each return can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how a home router knows which device a reply belongs to when all replies arrive at one public address.',
      'A reader asks why an outsider cannot simply send packets into a NAT network, and the article wants a packet dropped because no row exists for its port.',
    ],

    avoidWhen: [
      'The article is about which header fields change on the way out. The rewrite of outgoing packets is not drawn.',
      'The subject is NAT types — full cone, restricted, symmetric — and hole punching. Only a port-only key is shown.',
      'The point is stateful firewall rules. There are no rules here, only table rows.',
    ],

    contrastWith: [
      {
        concept: 'rewriteAddressPort',
        note: 'The outbound rewrite creates the public port; the table is the memory that lets that port be traced back to its owner.',
      },
      {
        concept: 'nat',
        note: 'Looking up by destination port is one key; widening the key to include the remote side changes whether strangers get in.',
      },
      {
        concept: 'portDemultiplex',
        note: 'A host uses the destination port to pick which socket gets a segment; a NAT uses it to pick which inside host gets a packet.',
      },
    ],
  },
};
