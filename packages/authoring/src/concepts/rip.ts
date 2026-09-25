/**
 * rip 개념 선언.
 *
 * canonical facet 은 `facet:rip` — 라우터 다섯 A–E 가 고리(A–B · B–E · A–C · C–D · D–E)로 이어지고 망
 * `172.20.0.0/16` 이 E 에 붙는다. 손잡이 둘: 방식 {거리 벡터, 스플릿 호라이즌, 경로 벡터, 링크 상태} × 끊는 선
 * {처음부터, B–E, B–E · D–E}. 계기 셋(라운드 · 알림 · 틀린 표 라운드)이 방식마다 값을 치르는 자리가 다르다는 것을
 * 보인다 — E 고립에서 거리 벡터만 14 · 84 · 12, 나머지는 네 라운드 안에 멈춘다. 처음부터 배울 때는 링크 상태가
 * 알림 30 으로 가장 비싸다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 카탈로그 정리에서 ospf · bgp 토픽이 이 완제품에 합쳐졌다. 그래서 OSPF · BGP 로 오는 검색도 여기 닿게
 * exemplarKeywords 가 그 낱말을 품는다. 조각 다섯은 한 장면씩이다 — 수가 하나씩 불어남(`hopCountMetric`) ·
 * 서로 떠받치며 셈(`countToInfinity`) · 알림이 베껴 번짐(`linkStateFlood`) · 뿌리마다 다른 나무(`shortestPathTree`) ·
 * 제 번호 거르기와 선호(`pathVectorPolicy`). 이쪽은 **방식을 돌려 견주는 것**을 쥔다 — definition 은 compare ·
 * same failure · what is exchanged · rounds of wrong routes · adverts spent 를 독점하고, 조각의 동사(adds one ·
 * copied unchanged · rooted at itself · customer over peer)를 쓰지 않는다.
 *
 * 전제 (설명 글 `rip.md` 가 밝힌 것 — 화면은 각주가 없다):
 *  - 동기 라운드. 같은 라운드에 한 라우터로 여럿 닿으면 보낸 이 이름이 앞선 쪽부터 판정한다.
 *  - 즉시 알림(triggered update) · 포이즌 리버스 · 링크 상태의 ack · 나이 · 주기 재전송은 뺐다. 경로 벡터는 BGP 의
 *    선호(정책)를 빼고 고리 거르기만 쓴다.
 *  - "스플릿 호라이즌은 셋 이상 고리에서 실패" 는 이 그래프 · 이 규약에서 일어나지 않는다(틀린 표 두 라운드).
 *  - IR 이 없다 — 방식 넷이 주고받는 것이 달라 코드 패널을 두지 않았다.
 *  - 라우터 이름 · 망 주소는 예로 정한 값(사설 대역).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ripConcept: FacetConceptSource = {
  id: 'rip',
  label: 'Routing Protocols Compared (Distance Vector, Path Vector, Link State)',
  canonicalFacet: 'facet:rip',

  surface: {
    definition:
      'Comparing distance-vector, split-horizon, path-vector and link-state routing under the same link failure: what routers exchange decides how many rounds wrong routes persist and how many adverts are spent.',
    exemplarKeywords: [
      'RIP vs OSPF vs BGP',
      'distance vector vs link state',
      'routing protocol comparison',
      'routing convergence after a link failure',
      'convergence time',
      'OSPF',
      'BGP',
      'RIP',
      'interior gateway protocol',
      'split horizon',
      'hop count limit 16',
      'routing loop after a link goes down',
      'dynamic routing protocols',
    ],
  },

  briefing: {
    observable: [
      'Five routers A–E stand on a ring (links A–B, B–E, A–C, C–D, D–E); network `172.20.0.0/16` sits on E. Beside each router is its current row — a count and a next hop, or "direct" on E — marked ✓ or ✗ against the true value over the links still standing. A router with no row yet also counts as wrong. A bar under each row measures the count against 16, which means unreachable.',
      'One step is one round: every router advertises from its state at the start of the round, and several adverts reaching one router are judged in order of sender name. Each round\'s caption reads like "Round 3 · sent: 6 · taken in: 4 · Wrong tables: 2", and a strip of numbered rounds collects a ✗ for every round that ended with a wrong router.',
      'With a cut chosen, step 0 is the table learned from scratch with those links just removed — for example "Cut B–E · D–E: rows whose next hop lay across it jump to 16". Under distance vector, A, B, C and D then prop up each other\'s old counts, taking turns in pairs that each rise by two (4, then 5, then 6 …) until all read 16 in round 13; the run stops at round 14 ("No table changed in round 14: stop").',
      'Split horizon marks the far end of a link with ⊘ where a route is not advertised back to the neighbor it came from. Path vector advertises whole paths such as `B E` and discards any path containing the receiver\'s own name. Link state forwards (origin, number, neighbor list) adverts and each router recomputes from its own map; the caption counts copies discarded.',
      'Three readouts sit below: Rounds, Adverts and Wrong rounds. Isolating E (B–E · D–E): distance vector 14 · 84 · 12, split horizon 4 · 14 · 2, path vector 4 · 24 · 2, link state 3 · 6 · 2. Cutting only B–E: link state is the only method with 0 wrong rounds. From scratch: link state spends 30 adverts against 12–18 for the others.',
      'In the B–E cut, A first takes B\'s 16 and then, in the same round, C\'s 3 to become 4 via C — the sender-name order actually decides that round.',
      'Rounds are synchronous; one round can be read as one 30-second RIP update. Triggered updates, poison reverse, and link-state acknowledgements, ageing and periodic refresh are left out; path vector uses only loop rejection, not BGP preference. Names and the network address are example values. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: Method (Distance vector · Split horizon · Path vector · Link state, starting at Distance vector) and Cut links (From scratch · B–E · B–E · D–E, starting at B–E · D–E).',
        'The decisive move is holding Cut links at B–E · D–E and stepping Method along: the long staircase of distance vector and its twelve ✗ rounds shrink to two or three rounds under every other method.',
        'Switching Cut links to From scratch with Method on Link state is how to show the other side of the trade — the most adverts spent to converge.',
      ],
    },

    useWhen: [
      'The article compares RIP, OSPF and BGP and needs to show that what each router sends — a number, a full path, or a map piece — is what decides how long bad routes survive a failure.',
      'A reader asks why link-state protocols replaced distance vector inside large networks, and the argument needs both the long recovery of distance vector and the higher flooding cost link state pays up front.',
      'The article claims split horizon fixes routing loops and needs a case where it cuts a fourteen-round recovery to four on the same failure.',
    ],

    avoidWhen: [
      'The subject is BGP policy — local preference, customer and provider relationships, route export rules. Path vector here only rejects paths containing its own name.',
      'The article is about forwarding a single packet by longest-prefix match. No packet is forwarded here; only routing tables are built.',
      'The point is OSPF areas, link costs or equal-cost multipath. Every link counts the same here and there is one flat network.',
      'The reader needs the shortest-path algorithm itself step by step. Tables are shown per round, not per relaxation or per settled vertex.',
    ],

    contrastWith: [
      {
        concept: 'hopCountMetric',
        note: 'How a distance-vector router arrives at its counts is the learning rule itself; setting that rule beside path and link-state exchange is what reveals its cost when a link fails.',
      },
      {
        concept: 'countToInfinity',
        note: 'Two routers counting up on each other is the failure in its smallest form. Comparing methods asks which exchanges prevent it and what each pays instead.',
      },
      {
        concept: 'linkStateFlood',
        note: 'Flooding explains how one advertisement reaches everyone unchanged. Comparing protocols weighs that flooding cost against how quickly each recovers from a cut.',
      },
      {
        concept: 'shortestPathTree',
        note: 'Per-router shortest-path trees are what link-state routers compute once the map is shared; the comparison treats that computation as one method among four.',
      },
      {
        concept: 'pathVectorPolicy',
        note: 'Choosing among AS paths by business relationship is policy; carrying the full path to reject loops is the part that also stops counting to infinity.',
      },
      {
        concept: 'bellmanFord',
        note: 'Bellman-Ford relaxes every edge with full knowledge of the graph in one place. Distance-vector routing spreads that relaxation across routers that only hear their neighbors, which is why stale values can circulate.',
      },
      {
        concept: 'ipRouting',
        note: 'Routing protocols decide what the tables contain; IP forwarding reads a finished table to move one packet.',
      },
    ],
  },
};
