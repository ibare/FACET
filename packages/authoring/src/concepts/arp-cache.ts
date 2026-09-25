/**
 * arpCache 개념 선언.
 *
 * canonical facet 은 `facet:arpCache` — 한 세그먼트의 호스트 넷(A · B · C · D)이 프레임 여섯을 보낸다. 처음 보는
 * 상대에게만 묻고, 물음 하나로 묻는 쪽과 답하는 쪽 두 표에 한 줄씩 적힌다. 물음은 둘(A→B 처음 · A→C 처음), 표에서 바로
 * 넷 — 그중 B→A · C→A 는 답했던 쪽이 적어 둔 줄을 쓴다. 표가 없었다면 물음 여섯. 끝 줄 수 A 2 · B 1 · C 1 · D 0.
 *
 * ── 묶음 안에서의 자리
 *
 * 이웃 `askWhoHas` 는 물음이 퍼지고 주인이 답하는 한 번의 주고받음을, 완제품 `arp` 는 여러 링크에서 캐시 유무로
 * 물음의 수를 견준다. 이쪽의 주장은 **한 번 물으면 두 표에 적히고 그 뒤로는 양쪽 모두 묻지 않는다** 하나다. 그래서
 * definition 은 table · row · both · reverse direction · skips 쪽 낱말을 쥐고, 방송 · 버림 · 게이트웨이 · 링크 ·
 * 라우터는 쓰지 않는다.
 *
 * 전제 (설명 글 `arpCache.md` 가 밝힌 것): 보냄 여섯은 예로 든 흐름 · 줄의 수명(만료)은 없다 · 물음이 퍼지는 모습은
 * 그리지 않는다 · 구경꾼 B 가 두 번째 물음 때 같은 값으로 고치는 일은 보이는 변화가 없어 그리지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const arpCacheConcept: FacetConceptSource = {
  id: 'arpCache',
  label: 'ARP Cache: Ask Once, Both Sides Remember',
  canonicalFacet: 'facet:arpCache',

  surface: {
    definition:
      'ARP answers are cached: a lookup happens only on a table miss, and one exchange records the pairing in the tables at both ends, so later frames in either direction go out without asking.',
    exemplarKeywords: [
      'ARP cache',
      'ARP table',
      'neighbor table entry',
      'does ARP run for every packet',
      'arp -a output',
      'reply side learns the sender',
      'cache hit vs miss',
      'RFC 826 merge rule',
      'fewer broadcasts after the first frame',
    ],
  },

  briefing: {
    observable: [
      'Four hosts A to D, each with an ARP table that starts empty ("Every ARP table starts empty."), a list of frames sent and a list of ARP requests, and counters Frames sent, ARP requests and Requests without a table.',
      'Send #1, A → 10.1.0.7: "No row for 10.1.0.7 in the table, so it asks. The reply writes one row into the asker’s table and one into the owner’s." A’s table gains 10.1.0.7 and B’s gains 10.1.0.2. The next step: "It leaves with the MAC it just wrote down."',
      'Send #2, A → 10.1.0.7 again: "The MAC comes out of the table — no request." Send #3, B → 10.1.0.2: B never asked, but it uses the row written when A asked.',
      'Send #4, A → 10.1.0.9 is new, so A asks again; A’s and C’s tables each gain a row. Sends #5 (A → B) and #6 (C → A) both come from tables.',
      'At the end: Frames sent 6, ARP requests 2, Requests without a table 6. Table rows: A 2, B 1, C 1, D 0 — D neither sends nor receives and its table stays empty. Nine steps in all, since an asked send takes two steps (ask, then send).',
      'The six sends are an example sequence. Entries here never expire, though real ARP entries are removed after a while. The broadcast itself is not drawn, only which tables gain a row, and a bystander refreshing an existing row with the same value (B during the second question) shows no visible change. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, nine steps including the start, and stops after the sixth send.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to send #3 holds B sending from a row it never asked for.',
        'The hosts, addresses and send order are fixed, so every row can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader assumes ARP runs before every frame and needs to see six frames go out on two questions.',
      'An article explains why the host that answered an ARP request can reply without asking, and wants to show the row appearing in the owner’s table at the moment of the question.',
    ],

    avoidWhen: [
      'The topic is cache expiry, stale entries or ARP poisoning. Entries never expire and are always correct.',
      'The subject is how the request travels or who hears it. The question is a single event here, not a broadcast drawn across the segment.',
      'The article involves routers or other networks. All four hosts share one segment.',
    ],

    contrastWith: [
      {
        concept: 'askWhoHas',
        note: 'The request and reply are how a mapping is discovered; the table is what makes discovery a one-time cost, and it fills on both ends of the exchange rather than only the asker’s.',
      },
      {
        concept: 'arp',
        note: 'Remembering answers cuts repeated questions to one per pair. Across routers, every link is a separate pair, so even a perfect cache still pays one question per link.',
      },
    ],
  },
};
