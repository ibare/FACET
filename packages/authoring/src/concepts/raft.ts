/**
 * raft 개념 선언.
 *
 * canonical facet 은 `facet:raft` — 노드 `S1` … `S7` 가운데 앞의 몇 개. `S1` 이 먼저 깨어 term 2 후보가 되고 표를 모은 뒤,
 * 리더로서 쓰기 `x=4` 를 로그 칸 1 에 적고 사본을 모은다. 응답은 왕복 시간(`S2` 20 · `S3` 40 · … · `S7` 120 ms)에 돌아온다.
 * 손잡이 둘 — 노드 수(3 · 5 · 7, 처음 5) · 멈춘 노드(0 ~ 3, 처음 1, 번호 큰 것부터). 과반 2 · 3 · 4, 문턱선 20 · 40 · 60 ms,
 * 버티는 멈춤 1 · 2 · 3. 멈춤이 문턱을 넘으면 선출과 쓰기가 함께 끊긴다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 한 장면씩이다 — 타이머가 먼저 바닥난 노드가 표를 모음(`electALeader`) · 사본이 과반에 닿는 순간 확정
 * (`majorityDecides`) · 어긋난 로그를 거슬러 맞춤(`logReplicateInOrder`) · 갈라진 두 리더와 물러남(`splitBrain`). 이쪽은
 * **노드 수와 멈춘 수를 돌려 과반 문턱이 옮겨 가는 것, 그리고 선출과 확정이 한 문턱을 쓴다는 것**을 쥔다. 그래서 definition 은
 * all configured nodes · stopped ones included · tolerate more failures · slower replies · halt both 를 쥐고, 조각들이 독점한
 * timer · candidate · heartbeat · commit the moment · probe backward · two leaders · step down 을 쓰지 않는다.
 *
 * 전제 (설명 글 `raft.md`): 왕복 시간은 예. 느린 노드부터 멈춘다고 정했다. `S1` 이 먼저 깨어난다고 정했고 선거 타이머는 셈하지
 * 않는다. 로그는 한 칸 · 하트비트 · 재선출 · 어긋난 로그 맞추기는 덜었다. 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const raftConcept: FacetConceptSource = {
  id: 'raft',
  label: 'Raft Consensus (Majority Threshold and Fault Tolerance)',
  canonicalFacet: 'facet:raft',

  surface: {
    definition:
      'Raft needs a majority of all configured nodes, stopped ones included, both to elect a leader and to commit a write, so a larger cluster tolerates more failures but waits for slower replies, and too many failures halt both.',
    exemplarKeywords: [
      'Raft consensus algorithm',
      'quorum size',
      'how many nodes can fail',
      '2f+1 nodes',
      'why clusters have an odd number of nodes',
      'cluster of 3, 5 or 7 nodes',
      'etcd cluster size',
      'Consul servers',
      'fault tolerance of consensus',
      'loss of quorum',
    ],
  },

  briefing: {
    observable: [
      'Two lanes share one time axis: "Election · RequestVote" above and "Write · AppendEntries" below. Each follower stands at its round-trip time — S2 20 ms, S3 40 ms, and so on to S7 at 120 ms. A caption states the setting: "Nodes 5 · majority 3 · survives 2 stopped · stopped now 1".',
      '"S1 is candidate, term 2 — votes 1 / 5", counting its own vote first. Votes return at each round-trip time and drop onto the axis while a counter climbs: "20 ms: vote from S2 — votes 2 / 5", then "40 ms: vote from S3 — votes 3 / 5, majority 3 reached · leader S1". Votes after the majority are shown together in one step.',
      'The write lane repeats the same count: "Write x=4 → S1 log slot 1 (term 2) — copies 1 / 5", copies from S2 at 20 ms and S3 at 40 ms reach the majority, and the write is committed. The default round ends "Done — leader S1 · elected 40 ms · committed 40 ms · copies 4 / 5".',
      'A vertical threshold line stands where the majority-th reply lands. Across node counts 3 / 5 / 7 the majority is 2 / 3 / 4, the line moves to 20 / 40 / 60 ms, and the tolerated stops are 1 / 2 / 3.',
      'Stopped nodes, highest-numbered first, never answer. When the node at the threshold is stopped the line turns dashed, all votes arrive yet stay short ("short of majority · no leader · no write"), and the write lane never starts. With three of three stopped there is no node to wake and the round ends at the first step.',
      'Whenever the majority is reached, the commit time does not depend on how many nodes are stopped, because only the fastest majority is waited for. The default round (5 nodes, 1 stopped) is ten steps; others run from 2 to 12.',
      'Round-trip times are example values; stops are chosen from the slowest nodes; S1 is set to wake first without modelling election timers; the log has one slot, and heartbeats, re-election and repairing divergent logs are left out. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Nodes" 3, 5 or 7 (starting at 5) and "Stopped" 0 to 3 (starting at 1). Each round plays the election lane, then the write lane, then waits.',
        'The move that makes the idea land is raising Stopped one at a time at a fixed node count: the commit time stays put until the stop reaches the threshold node, and then the line breaks and both lanes fail together. Changing Nodes then shows the threshold moving to a later reply.',
        'Readouts under the controls: Majority, Live nodes and Committed writes.',
        'The code panel, labelled "Reaching the majority", starts empty with a "+ Add language" button. It shows `reachMajority`, one function that yields both the election time and the commit time, and carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains how many node failures a Raft cluster survives and why the count is taken over all members, not the live ones, and needs the threshold to move as the cluster size and the number of failures change.',
      'A reader asks why adding nodes to a consensus cluster makes writes slower even though it adds safety; the threshold line moving to a later reply as the node count grows answers it.',
    ],

    avoidWhen: [
      'The article walks through how a leader election is triggered by timers or how terms increase over several elections. The candidate is fixed and timers are not modelled.',
      'The subject is log repair, conflicting entries or two leaders during a partition. The log has one slot and no partition is drawn.',
      'The point is Byzantine fault tolerance or nodes that lie. Stopped nodes are simply silent.',
    ],

    contrastWith: [
      {
        concept: 'electALeader',
        note: 'Which node stands for election and how its vote count grows is the election mechanism; how many nodes must be alive for any election to succeed is the fault-tolerance question.',
      },
      {
        concept: 'majorityDecides',
        note: 'Committing as soon as copies reach a majority is the commit rule; the fault-tolerance question is what that rule costs in latency as the cluster grows and where it stops working.',
      },
      {
        concept: 'logReplicateInOrder',
        note: 'Making a follower\'s log match the leader\'s is about correctness entry by entry; the majority threshold is about whether the cluster can make progress at all.',
      },
      {
        concept: 'splitBrain',
        note: 'That a minority cannot reach the threshold is what stops a partitioned side from committing. The same arithmetic, counted against stopped nodes instead of a cut network, decides how many failures are survivable.',
      },
      {
        concept: 'paxos',
        note: 'Both reach agreement through majorities that must overlap. Raft organises it around one elected leader and an ordered log; Paxos settles a single value among competing proposers.',
      },
    ],
  },
};
