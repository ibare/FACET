/**
 * nat 개념 선언.
 *
 * canonical facet 은 `facet:nat` — 안쪽 기기 1~3 대가 모두 보낸 포트 51000 으로 같은 서버
 * `198.51.100.80:443` 에 보낸다. 공인 주소는 `203.0.113.5` 하나. 손잡이 셋: 바꾸는 칸 {주소만, 주소+포트} ×
 * 찾는 열쇠 {받는 포트, 포트+먼 쪽} × 기기 {1, 2, 3}. 주소만이면 나감 1 · 막힘 n−1, 주소+포트면 나감 n · 되돌림 n,
 * 낯선 것(`192.0.2.99:443`)은 열쇠가 받는 포트뿐일 때만 들어온다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `rewriteAddressPort` 는 경계에서 보낸 이 두 칸이 갈리는 장면, `natMappingTable` 은 표에 적고 들어온 답을 되짚는
 * 장면이다. 이쪽은 **손잡이를 돌려 두 결과가 갈리는 것**을 쥔다 — 몇 기기가 답을 받는가, 낯선 패킷이 들어오는가.
 * definition 은 share one public address · only one host · every reply · unsolicited inbound · lookup key 를
 * 독점하고, 조각의 칸 이름(sender port field · destination fields) · 표 동사(records a row)를 쓰지 않는다.
 * 방화벽 규칙 차례(`firewall`)와 섞지 않는다 — 여기는 표의 열쇠만이다.
 *
 * 전제 (설명 글 `nat.md`):
 *  - 공인 주소 하나 · 주소 풀 없음. 새 포트 40001 부터 차례. **막힘**은 바꾼 열쇠가 이미 표에 있어 내보내지 않는
 *    모형의 선택이다(실제 장치는 포트를 다시 고르기도 한다).
 *  - 받는 포트만 보는 열쇠 ≈ full cone, 먼 쪽까지 보는 열쇠 ≈ 그보다 좁은 NAT.
 *  - 체크섬 · 줄 시간 만료 · 들어오는 쪽이 먼저 여는 연결은 없다. 주소는 사설 · 문서용 대역.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const natConcept: FacetConceptSource = {
  id: 'nat',
  label: 'NAT: Sharing One Public Address (Address vs Port Rewriting)',
  canonicalFacet: 'facet:nat',

  surface: {
    definition:
      'Several private hosts sharing one public address through NAT: rewriting only the address lets just one host through, rewriting the port too returns every reply, and the lookup key decides whether unsolicited inbound packets enter.',
    exemplarKeywords: [
      'network address translation',
      'NAT vs PAT',
      'NAPT',
      'port address translation',
      'IP masquerading',
      'full cone NAT',
      'restricted cone NAT',
      'why NAT needs ports',
      'home router public IP shared by many devices',
      'unsolicited inbound traffic through NAT',
      'IPv4 address exhaustion',
    ],
  },

  briefing: {
    observable: [
      'Inside devices on the left (`192.168.0.23`, `192.168.0.42`, `192.168.0.77`, each sending from port 51000) face a NAT device holding `203.0.113.5`; outside sit the Server `198.51.100.80:443` and a Stranger `192.0.2.99:443`. A NAT table below has columns Public port · Remote · Inside, with a Key frame around the columns used for lookup.',
      'One step is one packet. Outgoing cards cross the boundary one device at a time; at the boundary the address field flips, and with Address + port the port field flips too, to 40001, 40002, 40003 in turn. Captions read like "Out 192.168.0.23:51000 → 203.0.113.5:51000 · row #1 written".',
      'With Address only, the second and third devices produce the same key as row 1 and stay at the boundary marked "✗ blocked" ("blocked, same key in row #1"). Widening the key does not help, because all three go to the same server.',
      'Replies then come back row by row ("Reply 198.51.100.80:443 → 203.0.113.5:51000 ⇒ 192.168.0.23:51000 · looked up row #1") and each device\'s "Got" count rises. Last, the Stranger sends one packet to the first row\'s public port: with the key on Port it is let in and the first device\'s Got becomes 2; with Port + remote it is dropped outside.',
      'Four readouts carry the round — Sent out, Blocked, Replies back, Strays let in. Default (Address only, Port, 3 devices): 1 · 2 · 1 · 1. Address + port with 3 devices: 3 · 0 · 3 · 1 on Port, 3 · 0 · 3 · 0 on Port + remote.',
      'When a handle changes, the previous round\'s cards stay faded in place and move to their new places as the new round reaches the same step; the Rewrites window in the NAT header widens from the address cell to the port cell.',
      'One public address, no address pool, new ports counted from 40001, and blocking rather than picking another port are modelling choices; the Port key resembles full-cone NAT and Port + remote a stricter NAT. Checksums, entry timeouts and inbound-initiated connections are not modelled. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus three handles: Rewrite (Address only · Address + port, starting at Address only), Lookup key (Port · Port + remote, starting at Port) and Devices (1 · 2 · 3, starting at 3).',
        'The move that lands the first half is switching Rewrite to Address + port: cards that sat blocked at the boundary cross it, and the public-port column grows from one 51000 row to 40001 · 40002 · 40003.',
        'The second half lands on switching Lookup key to Port + remote: the Key frame widens over the Remote column and the stranger\'s card is pushed back outside.',
        'The code panel, labelled "NAT table", starts empty with a "+ Add language" button; the chosen language highlights the current line. A reply and an admitted stranger pass through the same line, and the code carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a home router must rewrite ports, not just addresses, to let many devices share one IPv4 address, and wants the blocked devices to visibly get through when the port is added.',
      'A reader believes NAT is a security feature and the article needs to show that whether a stranger\'s packet gets in depends only on what the lookup key compares.',
    ],

    avoidWhen: [
      'The article is about NAT traversal — STUN, TURN, hole punching or port forwarding set up by hand. Nothing inbound is initiated deliberately here.',
      'The subject is carrier-grade NAT, NAT64 or IPv6 transition. There is one public IPv4 address and one boundary.',
      'The point is firewall rule order or stateful inspection. Admission here depends only on a table lookup key, not on rules.',
    ],

    contrastWith: [
      {
        concept: 'rewriteAddressPort',
        note: 'Which header fields change at the boundary is the mechanism; whether changing only the address is enough, and for how many hosts, is the question the comparison answers.',
      },
      {
        concept: 'natMappingTable',
        note: 'Recording a row and looking it up is how replies find their way back. Varying the lookup key adds the security consequence: the same table either admits or rejects a stranger.',
      },
      {
        concept: 'firewall',
        note: 'A firewall decides admission by the order of explicit rules; NAT admission falls out of whether a translation entry exists and what its key compares.',
      },
    ],
  },
};
