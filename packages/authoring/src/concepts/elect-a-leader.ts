/**
 * electALeader 개념 선언.
 *
 * canonical facet 은 `facet:electALeader` — Raft 노드 다섯(`S1` … `S5`), 모두 팔로워 · term 1 · 리더 없음. 선출 타이머
 * `S1` 260 · `S2` 170 · `S3` 300 · `S4` 220 · `S5` 240 ms, 메시지 20 ms. 170 ms 에 `S2` 가 term 2 후보가 되고, 190 ms 에
 * 표 요청을 받은 넷이 표를 주며 제 타이머를 다시 채운다(`S4` 의 220 ms 마감은 밀려 오지 않는다). 210 ms 에 표 3 으로 과반,
 * `S2` 가 리더. 230 ms 첫 하트비트가 타이머를 또 채운다. 일곱 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `raft` 는 노드 수와 멈춘 수를 돌려 과반 문턱이 옮겨 가는 것을 보인다. 이쪽은 **리더가 없을 때 누가 어떻게 리더가
 * 되는가** 한 장면이다. 그래서 definition 은 election timeout · expires first · candidate · votes · resets its timer 를
 * 독점하고, 확정 · 사본 · 로그 · 노드 수 · 멈춤은 쓰지 않는다.
 *
 * 전제 (설명 글 `electALeader.md`): 타이머 값과 지연은 예(실제 Raft 는 일정 범위에서 무작위로 뽑는다). 같은 210 ms 에 닿은
 * 표 넷은 보낸 노드 이름 차례로 센다. 표 갈림 · 재선거 · 로그가 뒤처진 후보의 표 거절은 다루지 않는다. 코드 패널은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const electALeaderConcept: FacetConceptSource = {
  id: 'electALeader',
  label: 'Raft Leader Election (First Timer Out Asks for Votes)',
  canonicalFacet: 'facet:electALeader',

  surface: {
    definition:
      'In Raft the follower whose election timeout expires first becomes a candidate for a new term and requests votes; each vote granted resets the voter\'s timer, and a majority of votes makes the candidate leader.',
    exemplarKeywords: [
      'leader election',
      'election timeout',
      'randomized election timer',
      'RequestVote RPC',
      'candidate state',
      'term number',
      'heartbeat resets the timer',
      'how a new leader is chosen',
      'follower candidate leader states',
    ],
  },

  briefing: {
    observable: [
      'Five nodes S1 to S5 each show a role, a term and an election-timer deadline; a clock reads "Time: 0 ms". "No leader yet. Every follower\'s election timer is running down." All are Follower, Term 1, with deadlines S1 260, S2 170, S3 300, S4 220, S5 240 ms.',
      '"At 170 ms the timer of S2 runs out. It becomes a candidate for term 2 and votes for itself."',
      '"At 190 ms the vote request from S2 arrives. Each receiver votes for it and refills its own timer." The new deadlines are S1 450, S3 490, S4 410, S5 430 ms, so S4\'s original 220 ms deadline never arrives.',
      '"At 210 ms the vote of S1 arrives. Votes: 2. Majority: 3." Then "At 210 ms the vote of S3 arrives. Votes: 3, a majority. Leader of term 2: S2." S2 is marked Leader and sends heartbeats. The remaining votes of S4 and S5 raise the count to 5 without changing anything.',
      '"At 230 ms the first heartbeat from S2 arrives. Every follower refills its timer" — deadlines move again to S1 490, S3 530, S4 450, S5 470 ms. Seven steps including the start.',
      'Timer values and the 20 ms message delay are example values; real Raft draws each timer at random from a range so that two nodes rarely wake together. The four votes arriving at 210 ms are counted in node-name order. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven steps by itself and stops after the first heartbeat.',
        'A Replay button and a playback strip sit below it. Holding the 190 ms step shows every follower\'s deadline jumping later the moment it grants its vote.',
      ],
    },

    useWhen: [
      'The article describes how a Raft cluster without a leader gets one — timeout, candidacy, vote requests, majority — and needs the timers and deadlines visible as numbers.',
      'A reader wonders why other followers do not also become candidates; the vote and the heartbeat each pushing their deadlines later answers that.',
    ],

    avoidWhen: [
      'The article is about split votes, repeated elections, or the rule that rejects candidates with outdated logs. Only one uncontested election is shown.',
      'The subject is committing writes or replicating log entries. No write arrives.',
      'The point is leader election in general-purpose coordination services such as lease-based locks. The mechanism shown is Raft\'s term-and-vote scheme.',
    ],

    contrastWith: [
      {
        concept: 'raft',
        note: 'The election mechanism describes how one leader emerges from timers and votes; the fault-tolerance view asks how many nodes can be down before no candidate can gather a majority.',
      },
      {
        concept: 'majorityDecides',
        note: 'Both stop counting at a majority, but they count different things: votes that make a leader in an election, copies that make a log entry permanent in a commit.',
      },
      {
        concept: 'splitBrain',
        note: 'An election on a connected cluster yields one leader. When the network splits, an election on the larger side can produce a second leader in a higher term, and terms decide which one yields.',
      },
    ],
  },
};
