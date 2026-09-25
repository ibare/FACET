/**
 * longestPrefixMatch 개념 선언.
 *
 * canonical facet 은 `facet:longestPrefixMatch` — 목적지 `10.1.37.5` 를 표 다섯 줄(/8 · /21 · /0 · /19 · /16)에 비트로
 * 겹쳐 맞춘다. /21 은 21 번째 비트에서 갈려 안 맞고, 맞은 넷(8 · 0 · 19 · 16) 가운데 가장 긴 /19 의 줄 4 가 `eth3`
 * 으로 이긴다. 걸음 일곱, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `ipRouting` 은 여러 라우터를 건너는 여정 전체(TTL · 기본 경로 · 한 표씩)를 쥔다. 형제 `forwardingTable` 은
 * 줄이 겹치지 않는 표로 "망 → 문 · 넘길 곳" 을 보인다. 이쪽은 **여러 줄이 동시에 맞을 때 가장 긴 것** 하나다 —
 * definition 은 several prefixes match · compares bits up to each prefix length · longest · regardless of table order
 * 를 쥐고, 여정 · hop · TTL 을 쓰지 않는다.
 *
 * 전제: 라우터 하나 · 패킷 하나 · 표 한 장. 실제 라우터는 트라이 · TCAM 으로 한 번에 찾는다. 같은 길이 동률 없음.
 * 주소는 사설 대역.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const longestPrefixMatchConcept: FacetConceptSource = {
  id: 'longestPrefixMatch',
  label: 'Longest Prefix Match',
  canonicalFacet: 'facet:longestPrefixMatch',

  surface: {
    definition:
      'When several routing-table prefixes match one destination address, the router compares bits up to each prefix length and forwards by the matching entry with the longest prefix, regardless of table order.',
    exemplarKeywords: [
      'longest prefix match',
      'LPM',
      'most specific route wins',
      'CIDR route lookup',
      'overlapping routes',
      'subnet mask bits comparison',
      'route selection /24 vs /16',
      'default route 0.0.0.0/0 matches everything',
    ],
  },

  briefing: {
    observable: [
      'The destination `10.1.37.5` is spelled out as 32 bits at the top ("Destination 10.1.37.5. Rows to check: 5."). Below, five rows each show a prefix, an outgoing port and its own 32 bits, with bits beyond the prefix length shown as dots.',
      'One step checks one row: a copy of the destination bits settles onto the row and a bar grows from the left over the agreeing bits. If every bit up to the prefix agrees, the bar stays; if one differs, it breaks off there.',
      'Row 1 `10.0.0.0/8` (eth1): "every bit up to /8 agrees. Match, length 8." Row 2 `10.1.40.0/21` (eth2): "equal through bit 20, differs at bit 21. No match." Row 3 `0.0.0.0/0` (eth0): "no bits to compare. Match, length 0." Row 4 `10.1.32.0/19` (eth3): match, length 19. Row 5 `10.1.0.0/16` (eth4): match, length 16.',
      'The final step reads "Matched lengths: 8 · 0 · 19 · 16. Longest: /19, row 4, out eth3." and row 4 rises under the destination into the Chosen slot.',
      'The longest prefix in the table, /21, does not match; the rule is the longest among the matches. Table order plays no part — stopping at the first match would have sent the packet out eth1.',
      'One router, one packet, one table, with example private addresses. Real routers find the longest match in a single lookup with tries or TCAM; the rows are checked one per step to show what the decision means. No two matching rows share a length.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one row per step, and stops after the choice.',
        'A Replay button and a playback strip sit below it. Dragging back to row 2 holds the moment the longest prefix in the table breaks off at bit 21.',
        'The address and table are fixed, so every bit position and length can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains longest prefix match and needs one destination matched by several overlapping prefixes, with the bits that decide it visible.',
      'A reader thinks a router picks the first matching row or the longest row in the table, and the article wants a /21 that fails and a first row that loses.',
    ],

    avoidWhen: [
      'The article follows a packet across several routers, TTL, or hop-by-hop decisions. One router and one lookup appear here.',
      'The subject is how routes get into the table through routing protocols. The table is given.',
      'The point is subnetting arithmetic — host counts, broadcast addresses, subnet design. Only matching against a destination is shown.',
    ],

    contrastWith: [
      {
        concept: 'forwardingTable',
        note: 'A forwarding table maps networks to exits; longest prefix match is the tie-break that applies once more than one of those networks contains the destination.',
      },
      {
        concept: 'ruleMatchOrder',
        note: 'A firewall rule list honours the first matching row; a route lookup ignores order and keeps the most specific match.',
      },
      {
        concept: 'ipRouting',
        note: 'Longest prefix match is one router\'s decision; IP routing chains that decision across routers that each see only their own table.',
      },
    ],
  },
};
