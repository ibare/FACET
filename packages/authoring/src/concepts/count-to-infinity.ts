/**
 * countToInfinity 개념 선언.
 *
 * canonical facet 은 `facet:countToInfinity` — 라우터 셋 A · B · C 가 한 줄, 망 `10.8.0.0/16` 이 A 에 붙어 수렴한 표
 * A 1 · B 2 · C 3. A–B 가 끊긴 뒤 C 와 B 가 서로의 옛 수 위에 1 을 얹어 라운드마다 둘씩 오르고, 라운드 7 · 알림 14 에
 * 둘 다 16(닿을 수 없음)에 닿는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `hopCountMetric` 은 끊김 없는 배움, 완제품 `rip` 은 방식 넷을 같은 끊김에서 견준다. 이쪽은 **막는 장치가 모두
 * 없을 때 두 라우터가 서로를 떠받치며 세는 장면** 하나다. definition 은 link fails · stale · each other ·
 * point at each other · reaches 16 을 독점한다. 막는 방법의 비교(split horizon · path vector)는 rip 의 몫이라
 * definition 에 넣지 않는다.
 *
 * 전제: 라운드 하나에 C → B 먼저, 그다음 B → C (예로 정한 차례). A 는 끊긴 뒤 주고받지 않는다. 트리거 업데이트 ·
 * 스플릿 호라이즌 · 포이즌 리버스 셋 다 없다. 라운드 하나를 30 초로 보면 약 210 초라는 셈은 설명 글에만 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const countToInfinityConcept: FacetConceptSource = {
  id: 'countToInfinity',
  label: 'Count to Infinity (Distance Vector After a Link Failure)',
  canonicalFacet: 'facet:countToInfinity',

  surface: {
    definition:
      'After a link fails, two distance-vector routers each add one to the other\'s stale count every round, pointing at each other, until the count reaches 16 and the network is finally declared unreachable.',
    exemplarKeywords: [
      'count to infinity problem',
      'distance vector routing loop',
      'RIP infinity 16',
      'slow convergence after link failure',
      'bad news travels slowly',
      'two routers point at each other',
      'maximum hop count 15',
      'why RIP is limited to 15 hops',
    ],
  },

  briefing: {
    observable: [
      'Three routers A, B, C in a line; network `10.8.0.0/16` sits on A. The start is converged — A 1, B 2 (next hop A), C 3 (next hop B) — with a line marked "Unreachable: 16".',
      'Link A–B is cut: "The route of B is gone, and no one is told."',
      'Each round C advertises to B, then B to C. B, with no route, writes C\'s 3 + 1 = 4 and points at C; C\'s next hop is B, so it accepts B\'s larger 4 + 1 = 5. Captions: "Round 1: each writes down the other\'s count plus one." with "Notices sent: 2".',
      'Every count is a cell, and a line from each new cell goes to the cell it was built on, so B and C form a staircase, each stepping onto the other\'s last cell; the foot of the staircase stands on the cut link.',
      'Counts rise by two per round. In round 7 B takes C\'s 15 to reach 16, and C\'s 16 + 1 = 17 is pressed down to 16: "Round 7. Count 16: B · C. Only now is the network unreachable." Notices sent: 14.',
      'Rounds are model time; the order C-then-B within a round is an example choice, and A stays silent after the cut. Triggered updates, split horizon and poison reverse are all absent.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one round per step, and stops at round 7.',
        'A Replay button and a playback strip sit below it. Dragging back to round 1 holds the moment B first trusts C\'s old 3.',
        'Values are fixed, so the 7 rounds and 14 notices can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains the count-to-infinity problem and needs two routers visibly building on each other\'s outdated counts until 16.',
      'A reader asks why RIP caps hop count at 15, and the article wants to show that the cap is what makes the climb stop.',
    ],

    avoidWhen: [
      'The article is about how split horizon, poison reverse or path vectors prevent the loop. None of these mechanisms is present here.',
      'The subject is negative-weight cycles in shortest-path algorithms. The rising values here come from stale information, not from edge weights.',
      'The point is a network that is still intact. The link is cut at the start.',
    ],

    contrastWith: [
      {
        concept: 'hopCountMetric',
        note: 'The same add-one rule converges on an intact network; counting to infinity is that rule meeting counts that were derived from each other.',
      },
      {
        concept: 'bellmanFord',
        note: 'Bellman-Ford with a negative cycle keeps lowering distances because of edge weights; distance-vector routers keep raising counts because each trusts the other\'s outdated value.',
      },
      {
        concept: 'rip',
        note: 'Counting to infinity is the failure with no defences at all; comparing methods asks which exchanges prevent it and at what cost.',
      },
      {
        concept: 'pathVectorPolicy',
        note: 'Carrying the whole path lets a router reject routes containing itself, which is exactly what two routers counting on each other cannot detect from a single number.',
      },
    ],
  },
};
