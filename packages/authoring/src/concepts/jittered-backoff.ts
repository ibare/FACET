/**
 * jitteredBackoff 개념 선언.
 *
 * canonical facet 은 `facet:jitteredBackoff` — 클라이언트 여덟(c1..c8)이 칸 0 에 함께 오고, 서버는 한 칸에 둘까지 받는다.
 * 위 세계(흩지 않음)는 k 번째 실패 뒤 정확히 2^k 칸을 기다려 여섯 · 넷 · 둘이 덩이째 칸 2 · 6 · 14 로 돌아온다.
 * 아래 세계(흩음)는 1..2^k 에서 저마다 뽑아 칸 1 · 2 · 3 · 5 로 갈라지고 칸 5 에 끝난다. 부딪혀 실패 12 ↔ 8. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `retryAndBackoff` 는 장애 · 새 손님 · 다시 오는 법 셋을 손잡이로 견준다. 이쪽은 끊김도 새 손님도 없이 **함께 실패한
 * 무리가 돌아오는 칸이 흩어지는가** 한 질문만 말한다. 이웃 조각 `retryStorm` 은 끊긴 동안 새 요청에 얹혀 불어나는 무더기다.
 * 그래서 definition 은 failed together · same doubled wait · randomize · different slots · collide again 을 독점하고,
 * outage · recovery · backlog · new traffic 은 쓰지 않는다. 이웃 분야 `collisionAndBackoff`(이더넷 두 스테이션)와는
 * 한 서버에 되돌아오는 클라이언트 무리 ↔ 매체를 나눠 쓰는 두 스테이션으로 가른다.
 *
 * 전제: 칸은 예로 정한 단위, 망 지연 0. 기다림 상한 없음(이 자료에서 창은 8 까지). 흩음은 full jitter(0..창)에서 0 을 뺀 1..창.
 * 무작위는 x ← (75·x + 74) mod 65537, 씨앗 42, 칸이 이른 것부터 · 한 칸 안에서는 실패한 차례대로 뽑는다. 다른 씨앗이면 칸은
 * 달라지지만 겹침이 주는 방향은 같다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const jitteredBackoffConcept: FacetConceptSource = {
  id: 'jitteredBackoff',
  label: 'Jitter Splits Clients That Failed Together',
  canonicalFacet: 'facet:jitteredBackoff',

  surface: {
    definition:
      'Clients that failed at the same instant and all wait the same doubled delay come back together and collide again; randomizing each wait within the window splits them across different slots so fewer collide.',
    exemplarKeywords: [
      'jitter',
      'randomized backoff',
      'full jitter',
      'synchronized retries',
      'thundering herd',
      'desynchronize clients',
      'exponential backoff without jitter',
      'retry collisions',
      'why add randomness to retry delay',
    ],
  },

  briefing: {
    observable: [
      'Two worlds are stacked, "No jitter" above and "Jitter" below, sharing a horizontal axis of cells 0 to 14. Each world has one row per client, c1 to c8, and a "Server" row that shows how many clients arrived in each cell. The server accepts two per cell, in client-number order.',
      'Cell 0: "Every client arrives at once — clients: 8." In both worlds c1 and c2 are served and six fail, leaving a ✕ and jumping in an arc to the cell they will return on.',
      'In No jitter, the six all wait 2 cells and return together to cell 2, where four fail again; those wait 4 and return together to cell 6, where two fail; those wait 8 and arrive together at cell 14. The group shrinks 6 → 4 → 2 but never splits, and each return lands further away.',
      'In Jitter, the same six draw their own waits between 1 and 2: two return in cell 1 and are both served, four return in cell 2 where two fail again, and those draw waits between 1 and 4, landing in cells 3 and 5. The last client is served in cell 5.',
      'Jitter does not remove overlap: cell 2 still gets four clients and c6 and c7 fail a second time. The last step reads "Everyone served. Collision failures in all — no jitter: 12, jitter: 8", with "Last cell: 14" and "Last cell: 5" beside the two worlds.',
      'Only cells in which someone arrives in either world are shown as steps; empty cells are skipped. Cells are an example time unit, network delay is zero, there are no new clients and no outage. Jitter uses a wait of 1 to the window instead of 0 to the window, and draws come from a linear congruential generator with seed 42; another seed gives other cells but the same direction. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays itself from the starting state through the last cell and stops. There are no handles; the two worlds always start from the same eight clients.',
        'A Replay button and a playback strip sit below it. Scrubbing to cell 2 sets the two worlds side by side at the moment six clients return as one block above while below they have already split.',
      ],
    },

    useWhen: [
      'The article recommends adding random jitter to retry delays and must show why exponential backoff alone is not enough: the clients that failed together keep returning together.',
      'A reader thinks jitter guarantees no more collisions, and the article wants a case where it lowers them from 12 to 8 while two clients still collide in the same cell.',
    ],

    avoidWhen: [
      'The article is about an outage and the flood of retries on recovery. There is no outage and no new traffic here; eight clients simply arrive at once.',
      'The subject is Ethernet or Wi-Fi medium access between stations. The clients here are calling one server with a fixed per-cell capacity.',
      'The topic is choosing a maximum retry count or a backoff cap. Every client is served before any cap would matter.',
    ],

    contrastWith: [
      {
        concept: 'retryAndBackoff',
        note: 'Jitter splitting a synchronized group is one mechanism; the broader retry policy question sets it beside immediate retry and plain backoff and asks what each does to the peak and the finish time after an outage.',
      },
      {
        concept: 'retryStorm',
        note: 'A synchronized group returning together is a timing problem that exists even with backoff; a retry storm is a volume problem, where immediate retries during an outage keep adding to fresh traffic.',
      },
      {
        concept: 'collisionAndBackoff',
        note: 'Both use different waits to break a tie. Collision backoff settles which of two stations on a shared medium goes first; jittered retry backoff spreads many clients returning to one server over time.',
      },
      {
        concept: 'slidingWindowCount',
        note: 'A sliding-window limiter caps how many requests a server accepts in a period regardless of timing; jitter changes when clients return so fewer of them hit the same moment.',
      },
    ],
  },
};
