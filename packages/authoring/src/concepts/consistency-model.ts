/**
 * consistencyModel 개념 선언.
 *
 * canonical facet 은 `facet:consistencyModel` — 리더 없는 사본 열둘(`s1`..`s12`)이 키 `likes:9` 를 들고, 라운드 0 에
 * 손님 `u1` 이 `s1` 에 42 를 쓴다(버전 2). 여덟 라운드 동안 새 값을 가진 사본이 짝에게 민다(가십). 손잡이 둘 —
 * 퍼뜨림 수(1~4, 처음 1)를 올리면 같아진 라운드가 6 · 3 · 3 · 2 로 당겨지고 통은 55 · 142 · 222 · 312 로 곧게 는다.
 * 읽기 규칙(아무 사본 / 번호 확인, 처음 아무 사본)을 번호 확인으로 돌리면 옛값 읽기가 0 이 되고 돌려보냄을 치른다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 번호를 들고 다니는 한 사람의 읽기(`readYourWrite`) · 따로 받은 쓰기가 도장으로
 * 덮이며 모임(`eventuallyAgrees`) · 한번 정해진 값이 바뀌지 않음(`agreeOnOneValue`, 대비로 잇는다). 이쪽은
 * **돌리면 무엇이 갈리는가**를 쥔다 — 퍼뜨림 수 ↔ 통 · 같아지는 라운드, 읽기 규칙 ↔ 옛값 읽기 · 돌려보냄.
 * 그래서 definition 은 fanout · message cost · rounds · trade 쪽 낱말을 쥐고, 조각들이 독점한 last-writer-wins ·
 * timestamp · decided · majority · turned away 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `consistencyModel.md` 가 밝힌 것):
 *  - 라운드는 예로 정한 단위다. 밀기(push)만 · 쓰기 하나 · 지연 · 통 크기 · 잃는 통 없음.
 *  - 짝은 씨앗 42 의 선형 합동 생성기로 판 머리에서 한 번 뽑는다 — 모든 손잡이 값이 같은 표를 쓴다.
 *  - 번호 확인은 read-your-writes 의 한 구현이다. 돌려보냄의 수는 고리 차례에 기댄다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const consistencyModelConcept: FacetConceptSource = {
  id: 'consistencyModel',
  label: 'Consistency Model (Gossip Fanout vs Messages, Stale vs Checked Reads)',
  canonicalFacet: 'facet:consistencyModel',

  surface: {
    definition:
      'Leaderless replicas spreading a write by gossip converge in fewer rounds as each pushes to more peers, at a message cost that grows linearly; until then, unchecked reads return stale values.',
    exemplarKeywords: [
      'eventual consistency trade-off',
      'gossip protocol fanout',
      'epidemic protocol',
      'anti-entropy message overhead',
      'Cassandra gossip',
      'Dynamo-style leaderless replication',
      'convergence time vs network traffic',
      'strong vs eventual consistency',
      'session guarantees',
      'how fast do replicas converge',
    ],
  },

  briefing: {
    observable: [
      'Twelve copies `s1`..`s12` stand on a ring, each holding `likes:9` = 41 at version 1; there is no leader. In the first step the client `u1` writes 42 to `s1` ("u1 writes 42 to s1 · version 2") and keeps version 2 as its own number.',
      'Each of the eight rounds has two steps, a push and a read. In the push ("Round 1 · push · newly reached: 1") every copy that held the new value at the start of the round sends it to its partners, and a newly reached copy turns to 42. A message that lands on a copy that already has 42 bounces off into a heap counted as "Wasted messages: n".',
      'A curve at the top right plots "Old copies" per round, and a dashed mark reads "Converged: round r" once all twelve hold 42. Below it the "Client reads" row keeps one value per round, old values in red.',
      'With Fanout 1 and Any copy, the reads of rounds 1–4 go to `s5`, `s4`, `s4`, `s8` and each gets 41 ("Round 1 · s5 answers 41 · old value"); from round 5 the client reads 42, and the copies converge in round 6. The run ends with 55 messages, 44 of them wasted, and 4 stale reads.',
      'With Version check, a copy below version 2 sends the read on to the next copy around the ring until one holding 42 answers ("Round 1 · sent back 8 times · s1 answers 42" at Fanout 1, `s5` through `s12`). Stale reads drop to 0 and "Sent back" counts what the reader paid instead: 11 at Fanout 1, 4 at Fanout 2–4.',
      'Across the Fanout handle 1 · 2 · 3 · 4: converged round 6 · 3 · 3 · 2, old copy × rounds 30 · 14 · 11 · 7, messages 55 · 142 · 222 · 312, wasted 44 · 131 · 211 · 301, stale reads under Any copy 4 · 1 · 1 · 1. What is gained shrinks with each step while what is paid grows in a straight line.',
      'Only 11 messages are ever useful (there are eleven old copies); the rest are wasted, either overlapping before convergence or sent after it, because copies do not know that others are already current and keep pushing through round 8. At Fanout 1 that is 20 before and 24 after.',
      'The model is simplified and the screen does not footnote it: rounds are an example unit, copies only push, there is a single write, and messages have no delay, size or loss. Partners are drawn once per run from a linear congruential generator with seed 42 (x ← (75·x + 74) mod 65537), so every handle value uses the same table and a higher fanout only adds targets. Version check is one way to give read-your-writes; real systems also pin a session to the copy it wrote or read from a leader, and the number of sends-back depends on ring order.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Fanout" with four positions 1–4, starting at 1, and "Read rule" with two positions, "Any copy" (start) and "Version check". A run is 17 steps — the write, then a push step and a read step for each of eight rounds — and waits for the handles at the end.',
        'Five readouts carry the run: "Old copies", "Old copy × rounds", "Messages", "Stale reads", "Sent back".',
        'The move that makes the idea land is raising Fanout one notch at a time while watching the Converged mark move left and the wasted heap grow, then switching Read rule to Version check to see the red reads disappear and the sent-back count appear in their place.',
        'The code panel, labelled "One gossip run", starts empty with a "+ Add language" button; the chosen language shows `gossipRun`, which takes the partner and read tables and writes converged round, old copy × rounds, messages, wasted messages, stale reads and sends-back into `result`, matching the readouts. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues that eventual consistency is a dial with a price, and needs numbers showing that pushing to more peers per round buys earlier convergence while the message count climbs steadily and most messages end up redundant.',
      'A reader wants to see why reading from any replica in a gossip-replicated store returns old data for a while, and what it costs the reader to avoid that by carrying the version of its own write.',
    ],

    avoidWhen: [
      'The subject is resolving concurrent conflicting writes, last-writer-wins or CRDTs. There is exactly one write here, so nothing competes.',
      'The article is about leader-based replication, quorum acknowledgements or synchronous commits. There is no leader and no write waits for anyone.',
      'The topic is consensus or linearizability. Nothing here decides a value or gives a single-copy view; the copies only drift together.',
    ],

    contrastWith: [
      {
        concept: 'eventuallyAgrees',
        note: 'Convergence of replicas that took different writes depends on a rule for which value wins. The fanout trade assumes a single write and asks how quickly and at what message price it reaches everyone.',
      },
      {
        concept: 'readYourWrite',
        note: 'Carrying a write version guarantees one client its own write. Placed against gossip speed, the same rule becomes a cost that falls as copies converge faster.',
      },
      {
        concept: 'agreeOnOneValue',
        note: 'Consensus decides: a value chosen by a majority is final and no two nodes settle on different ones. Gossip decides nothing; copies merely come together, and until they do an unchecked read can be stale.',
      },
      {
        concept: 'replication',
        note: 'Leader-based replication makes the writer pay by waiting for followers before acknowledging. Leaderless gossip acknowledges nothing and pays in extra messages and in stale or redirected reads.',
      },
      {
        concept: 'cacheCoherence',
        note: 'Coherence keeps copies correct by invalidating or updating them when the source changes. Gossip lets copies be wrong for a while and relies on repeated exchange to bring them in line.',
      },
    ],
  },
};
