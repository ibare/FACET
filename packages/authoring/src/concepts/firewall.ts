/**
 * firewall 개념 선언.
 *
 * canonical facet 은 `facet:firewall` — 규칙 넷(R1 443 허용 · R2 `203.0.113.0/24` 차단 · R3 22 허용 · R4 모두 차단)과
 * 패킷 여섯. 손잡이 하나: 차단 줄 R2 의 자리 {1, 2, 3, 4}. 허용 2 → 4 → 5 → 5, 자리 3 · 4 에서 R2 가 한 번도 먼저
 * 맞지 않는 죽은 줄이 된다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * `ruleMatchOrder` 는 패킷 하나가 목록을 한 줄씩 내려가 첫 일치에서 멈추는 장면이다. 이쪽은 **한 줄의 자리를 옮겨
 * 판정이 뒤집히고 줄이 죽는 것**을 쥔다. definition 은 moving one rule · flips verdicts · shadowed · dead rule 을
 * 독점하고, 조각의 동사(compares field by field · stops · rows below never reached)를 쓰지 않는다.
 * 가장 긴 접두 일치와 반대라는 말은 contrastWith 에만 둔다. NAT 의 거르기와 섞지 않는다.
 *
 * 전제 (설명 글 `firewall.md`):
 *  - 상태를 보지 않는 거르개. 연결 추적 · 보낸 포트 · 돌아오는 방향을 다루지 않는다.
 *  - 죽은 줄은 여섯 패킷에 대해서만 센다. 실제 점검은 모든 가능한 패킷에 대해 줄끼리 덮는지 따진다.
 *  - 코드 패널은 주소를 옥텟 넷 배열로 펴서 나눗셈으로 접두를 견준다(32 비트 정수 넘침을 피한 표기).
 *  - 주소는 문서용 · 사설 대역.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const firewallConcept: FacetConceptSource = {
  id: 'firewall',
  label: 'Firewall Rule Position (First Match, Shadowed Rules)',
  canonicalFacet: 'facet:firewall',

  surface: {
    definition:
      'In a first-match packet filter, moving one deny rule up or down the rule list flips the verdicts of the packets it covers and can leave it shadowed as a dead rule that never matches first.',
    exemplarKeywords: [
      'firewall rule order',
      'rule shadowing',
      'shadowed firewall rule',
      'dead rule',
      'access control list order',
      'ACL',
      'iptables rule order',
      'first match wins',
      'stateless packet filter',
      'firewall policy audit',
      'allow before deny',
    ],
  },

  briefing: {
    observable: [
      'On the left is a rule list with fixed position numbers 1–4; each rule has an id and five cells: Action (✓ Allow · ✗ Deny), Proto, Source, Destination, Port, where `any` matches anything. The rule with the thick border is R2, deny `tcp` from `203.0.113.0/24`.',
      'On the right, six packets p1–p6 each get a column headed by source, destination, protocol and port. One step sends one packet down the list: rows that were tried and missed show `–`, and the first row that matches shows ✓ or ✗; cells below it stay empty. A depth bar beside each column shows where it stopped, and a caption reads "p2: stopped at position 2 on R2 → Deny".',
      'Below is the verdict for each packet with the id of the first-matching rule. The last step looks for any rule that was first to match none of the six packets and strikes it through with a "Dead" mark; the caption reads "Rules never matched first: 1 (R2)" or "… : 0".',
      'At the default R2 position 2 (order R1 · R2 · R3 · R4) the verdicts are ✓ ✗ ✓ ✗ ✓ ✓ — 4 allowed, 2 denied, 12 rules checked, no dead rule. p1 and p6 from R2\'s range reach port 443 and are taken first by R1; only p2 on port 22 hits R2.',
      'Across the handle: position 1 gives ✗ ✗ ✓ ✗ ✓ ✗ (2 allowed); position 3 gives ✓ ✓ ✓ ✗ ✓ ✓ (5 allowed, 11 checked) with R2 dead; position 4 gives the same verdicts with 10 checked, R2 still dead because R4 above it takes everything.',
      'When the position changes, R2 slides to its new slot and the rows between step aside; the previous depth bars and verdicts stay as dotted marks until each packet comes down again.',
      'The filter is stateless — no connection tracking, source port, or return traffic — and dead rules are counted over these six packets only. Positions, packet numbers and depths count from 1. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: an "R2 position" slider over 1 · 2 · 3 · 4, starting at 2. Readouts Allowed, Denied, Rules checked and Dead rules update per round.',
        'The move that makes the idea land is stepping R2 upward from 2 to 1 — packets from its range flip from allow to deny — and then downward to 3, where the same rule stops blocking anything and is marked dead.',
        'The code panel, labelled "First-match filter", starts empty with a "+ Add language" button; the chosen language highlights the current line. Addresses are compared octet by octet, and the `order` array is what the handle changes. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article warns that a deny rule placed below a broad allow never takes effect, and needs a rule that is present in the list yet blocks nothing.',
      'A reader asks why firewall rules must be written narrow-first, and the article wants the same four rules producing different verdicts purely from where one of them sits.',
    ],

    avoidWhen: [
      'The subject is stateful inspection, connection tracking or return traffic. Every packet is judged alone here.',
      'The article is about cloud security groups or other rule sets where every rule is evaluated and order does not matter. This filter stops at the first match.',
      'The point is NAT or address translation. Nothing is rewritten here; packets are only allowed or denied.',
    ],

    contrastWith: [
      {
        concept: 'ruleMatchOrder',
        note: 'Stopping at the first matching rule is the evaluation rule itself; its consequence under reordering is that verdicts flip and some rules become unreachable.',
      },
      {
        concept: 'longestPrefixMatch',
        note: 'Routing picks the most specific matching entry regardless of order; a first-match filter ignores specificity, so position alone sets priority.',
      },
      {
        concept: 'nat',
        note: 'NAT admits a packet if a translation entry matches it; a firewall admits it by the first explicit rule that matches.',
      },
    ],
  },
};
