/**
 * ruleMatchOrder 개념 선언.
 *
 * canonical facet 은 `facet:ruleMatchOrder` — 규칙 넷(1 허용 443 · 2 차단 `203.0.113.0/24` · 3 허용 22 · 4 모두 차단)
 * 과 패킷 넷. 패킷 띠가 한 걸음에 한 줄씩 내려가며 칸을 프로토콜부터 맞춰 보고, 처음 어긋난 칸에서 한 줄 내려가고,
 * 네 칸이 다 맞는 줄에서 멈춘다. 깊이 1 · 2 · 3 · 4 의 계단이 남는다. 걸음 열, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `firewall` 은 차단 줄의 자리를 옮겨 판정이 뒤집히고 줄이 죽는 것을 견준다(조각이 "순서를 바꾸는 손잡이는
 * 완제품의 일" 이라 미뤘다). 이쪽은 **한 패킷이 위에서부터 내려가 첫 일치에서 멈추는 것** 하나 — definition 은
 * from the top · field by field · stops at the first · rows below never reached 를 쥐고, move · shadowed · dead 를
 * 쓰지 않는다.
 *
 * 전제: 상태 없는 패킷 거르개. 주소는 문서용 · 사설 대역.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ruleMatchOrderConcept: FacetConceptSource = {
  id: 'ruleMatchOrder',
  label: 'Firewall First-Match Evaluation',
  canonicalFacet: 'facet:ruleMatchOrder',

  surface: {
    definition:
      'A packet filter compares a packet against its rules from the top, field by field, and stops at the first rule whose fields all match; that rule\'s action applies and rows below are never reached.',
    exemplarKeywords: [
      'first match firewall',
      'how a firewall evaluates rules',
      'top-down rule processing',
      'ACL evaluation',
      'implicit deny at the bottom',
      'packet filter matching',
      'protocol source destination port match',
      'CIDR match in firewall rule',
    ],
  },

  briefing: {
    observable: [
      'A rule table with four rows, each an action and four cells — protocol, source, destination, port: 1 allow `tcp` any → `10.0.0.0/24` 443; 2 deny `tcp` `203.0.113.0/24` → any any; 3 allow `tcp` any → `10.0.0.5/32` 22; 4 deny any any any any. "Rules: 4 · Packets: 4".',
      'The current packet is a band of the same cell widths standing just above the row being checked. Lines join the cells that matched, and the first mismatching cell is highlighted on both band and row; cells after it are not checked. Caption: "Rule 1 × p2: Port differs — down one row."',
      'When all four cells match the band stops and rows below fade: "Rule 1 × p1: all fields match → allow. Rows below are not reached."',
      'p1 (`203.0.113.9` → `10.0.0.5`:443) stops at rule 1, allow; p2 (same source, port 22) at rule 2, deny; p3 (`198.51.100.4` → `10.0.0.5`:22) at rule 3, allow; p4 (`198.51.100.4` → `10.0.0.9`:25) at rule 4, deny.',
      'Four vertical tracks at the right show each packet\'s depth — hollow dots for rows passed, a filled dot for the stopping row and its action — ending in a staircase of depths 1, 2, 3, 4. Rule 2 was written to block `203.0.113.0/24`, yet p1 from that range was allowed before reaching it.',
      'The filter is stateless: no connection tracking, source port or return traffic. Addresses are example values from documentation and private ranges. Ten steps after the start.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one rule check per step, and stops when p4 hits the bottom rule.',
        'A Replay button and a playback strip sit below it. Dragging back to p1 at rule 1 holds the moment a packet from the blocked range is allowed and rule 2 is never consulted.',
        'Rules and packets are fixed, so every caption and depth can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how a firewall reads its rule list and needs a packet visibly stopping at the first match while rows below go unread.',
      'A reader expects the firewall to pick the most fitting rule, and the article wants a packet from a blocked range allowed because an allow rule sits above the block.',
    ],

    avoidWhen: [
      'The article is about reordering rules and finding rules that never take effect. The order is fixed here.',
      'The subject is stateful firewalls or connection tracking. Each packet is judged alone.',
      'The point is routing table lookup. A router chooses the longest matching prefix, not the first row.',
    ],

    contrastWith: [
      {
        concept: 'longestPrefixMatch',
        note: 'Route lookup checks every entry and keeps the most specific match; a first-match filter stops at the first hit however general it is.',
      },
      {
        concept: 'firewall',
        note: 'First-match evaluation is the rule; moving a rule within the list is where its consequences — flipped verdicts, dead rules — arise.',
      },
      {
        concept: 'multiwayBranch',
        note: 'An else-if chain is the same first-true-wins order in code; a rule list applies it to packets matched field by field.',
      },
    ],
  },
};
