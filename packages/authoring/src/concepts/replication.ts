/**
 * replication 개념 선언.
 *
 * canonical facet 은 `facet:replication` — 리더 `n1` 과 팔로워 넷(`n2` 30 · `n3` 60 · `n4` 120 · `n5` 300 ms)이 모두 `x=5` 로
 * 시작하고 0 ms 에 쓰기 `x=8` 이 온다. 손잡이 둘 — 기다릴 팔로워 k(0 ~ 4, 처음 1) · 갈라짐(없음 / `n1 n2 | n3 n4 n5`).
 * k 를 올리면 OK 가 0 → 30 → 60 → 120 → 300 ms 로 늦어지고 답 직후 옛 값 읽기가 4 → 0 으로 준다. 갈라짐에서 k ≥ 2 면
 * 닿는 팔로워가 모자라 쓰기를 거절한다(일관성), k ≤ 1 이면 받되 끊긴 셋은 400 ms 에도 옛 값(가용성).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 이 손잡이의 끝 칸들이다 — 전부 기다림(`copyToFollowers`, 동기) · 안 기다림(`replicationLag`, 비동기) ·
 * 갈라진 쪽의 한 읽기(`partitionForcesChoice`). 이쪽은 **기다리는 수 하나가 지연 · 옛 값 · 거절을 함께 옮긴다**는
 * 맞바꿈을 쥔다. 그래서 definition 은 how many followers · acknowledging · trades · refused 를 쥐고, 조각들이 독점한
 * every follower · stops · lag · error or old value 를 쓰지 않는다.
 *
 * 전제 (설명 글 `replication.md`): 지연 넷과 늦은 읽기 400 ms 는 예로 정한 값. 리더는 닿는 수를 먼저 세고 모자라면 곧바로
 * 거절한다(시간 초과 모형이 아니다 — Kafka `acks=all` + `min.insync.replicas` 꼴). CAP 을 쓰기 하나로 줄였고 끊긴 쪽이
 * 새 리더를 뽑지 않는다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const replicationConcept: FacetConceptSource = {
  id: 'replication',
  label: 'Replication and CAP (How Many Followers to Wait For)',
  canonicalFacet: 'facet:replication',

  surface: {
    definition:
      'How many followers a leader waits for before acknowledging a write trades answer latency against stale reads and loss on leader failure; under a partition the same number decides whether writes are refused or accepted.',
    exemplarKeywords: [
      'write acknowledgement',
      'synchronous vs asynchronous replication',
      'semi-synchronous replication',
      'Kafka acks=all',
      'min.insync.replicas',
      'PostgreSQL synchronous_standby_names',
      'write quorum',
      'tunable consistency',
      'CAP trade-off in replication settings',
      'durability vs latency trade-off',
    ],
  },

  briefing: {
    observable: [
      'A client, a leader `n1` and four followers `n2` to `n5` are drawn with their links; every node starts at `x=5`. On the right, a Reads column shows the value each follower hands back. Below runs one time axis in ms, with ticks where each follower writes the new value: n2 at 30, n3 at 60, n4 at 120, n5 at 300.',
      'At 0 ms the write `x=8` reaches the leader: "0 ms · write x=8 reaches the leader · reachable followers: 4 · to wait for: 1". The new value then crosses to each follower at its own time, and an OK flag goes back to the client once k followers have written.',
      'Reads happen twice: right after the answer and at 400 ms, one per follower. A read that returns `x=5` after the client was told OK is painted as an Old value.',
      'With the default k = 1 the round is nine steps: OK at 30 ms with 2 copies, the read right after it gives 3 old values, and the 400 ms read gives none.',
      'Across k = 0 … 4 with no partition: answer 0 / 30 / 60 / 120 / 300 ms, copies at answer 1 / 2 / 3 / 4 / 5, old values right after the answer 4 / 3 / 2 / 1 / 0, and 0 old values at 400 ms every time. With 1 copy the value exists only on the leader at the moment of OK.',
      'Turning Partition to Split raises a wall between `n1 n2` and `n3 n4 n5`; copies sent toward the cut three vanish at the wall. With k = 0 or 1 the leader still accepts, and the three cut followers return `x=5` even at 400 ms (3 late old values). With k = 2, 3 or 4 only one follower is reachable, so "reachable 1 < wait for k · write refused, not logged": the write bounces back toward the client, and with nothing new committed there are 0 old reads.',
      'Rules of the model: the leader counts reachable followers first and refuses at once when they are fewer than k (no waiting for a timeout); OK comes at the k-th fastest reachable follower; the partition lasts the whole round and the cut side never elects a new leader. Delays and the 400 ms read time are example values, and CAP is reduced to one write and the reads after it. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Followers to wait for" 0 to 4 (starting at 1) and "Partition", None or Split (starting None). Each round plays nine steps (six or five under a partition), then waits.',
        'The move that makes the idea land is stepping k upward: the OK flag slides right along the time axis from one follower tick to the next while the old-value marks after the answer drop one by one; then switching on Split and pushing k past 1 turns the accepted write into a refused one.',
        'Readouts under the controls: Answer (ms), Copies at answer, Old values after answer, Old values, late read, and Refused.',
        'The code panel, labelled "When to answer OK", starts empty with a "+ Add language" button. It shows `answerAt` (count reachable followers, refuse, answer at once, or pick the k-th fastest), `freshAt` and `staleAt`, and carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains a replication setting such as acks, synchronous standbys or a write quorum, and needs to show that one number moves acknowledgement time, stale reads right after OK, and the risk of losing the write together.',
      'A reader has met CAP as an abstract triangle; showing that the same wait-for count accepts writes with stale reads at low values and refuses them at high values under a partition ties the theorem to a knob they can set.',
    ],

    avoidWhen: [
      'The article is about consensus protocols such as Raft or Paxos, leader election or failover. There is one fixed leader and no election happens, even on the cut side.',
      'The subject is multi-leader or leaderless replication, conflict resolution, or quorum reads with R + W > N. Only the leader accepts writes and reads go to single followers.',
      'The point is replication lag measured in production, retries or timeouts. The model has one write, fixed delays and no timeout.',
    ],

    contrastWith: [
      {
        concept: 'copyToFollowers',
        note: 'Waiting for every follower is one end of the setting: each acknowledged write is already on every node. Treating the wait as a number exposes what that end costs in latency and what lower values give up.',
      },
      {
        concept: 'replicationLag',
        note: 'Answering before any follower has the write is the other end, where stale follower reads follow directly; treated as one setting among several, it is weighed against slower but fresher ones.',
      },
      {
        concept: 'partitionForcesChoice',
        note: 'The CAP choice can be framed at a single read on a cut-off node. Framed at the write, the same choice becomes a replication setting fixed in advance: demand more copies than can be reached and the write is refused.',
      },
      {
        concept: 'majorityDecides',
        note: 'A consensus log commits at a fixed majority so that any future leader holds the entry; a leader-follower system lets the operator choose how many copies to wait for, including fewer than a majority.',
      },
      {
        concept: 'durableAfterCommit',
        note: 'Durability on one machine comes from forcing the log to disk before answering; durability across machines comes from copies on other nodes before answering. Both make the OK wait for something.',
      },
    ],
  },
};
