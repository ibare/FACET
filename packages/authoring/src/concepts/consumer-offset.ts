/**
 * consumerOffset 개념 선언.
 *
 * canonical facet 은 `facet:consumerOffset` — 오프셋 0..5 의 로그(11 · 24 · 5 · 17 · 30 · 8)를 두 그룹이 읽는다.
 * 청구(`billing`)는 한 번에 셋, 감사(`audit`)는 한 번에 하나. 사건 일곱(읽기 여섯 · 새 기록 13 붙음 하나) 동안
 * 읽는 그룹의 오프셋만 움직이고, 새 기록이 붙으면 두 밀림이 함께 하나씩 는다. 끝에 청구 7(밀림 0) · 감사 3(밀림 4),
 * 벌어짐 4. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (`kafkaPattern` 아래 조각 셋 중 하나)
 *
 * 움직이는 것은 **두 읽는 자리**이고, 앞으로만 간다. 주장은 "어디까지 읽었는지는 그룹마다 따로 든 수 하나가
 * 말한다" 하나다. 그래서 definition 은 each group · its own · advances · leaves the other unchanged · lag 를 쥐고,
 * append at the end · same key(appendOnlyLog) · move back · again(replayFromOffset) · retention(kafkaPattern) 을 쓰지 않는다.
 * 이웃 `replicationLag` 의 lag 는 복제 사본이 늦는 것이고, 이쪽은 읽는 쪽이 늦는 것이다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `consumerOffset.md` 가 밝힌 것):
 *  - 파티션 하나 · 보존 기간이 끝나지 않는다.
 *  - 읽은 즉시 커밋한다(실제로는 커밋한 오프셋과 읽은 자리가 다를 수 있다).
 *  - 시각을 셈하지 않는다 — 빠르기의 차이는 한 번에 읽는 개수와 사건 차례로만 생긴다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const consumerOffsetConcept: FacetConceptSource = {
  id: 'consumerOffset',
  label: 'Consumer Offset (Each Group Tracks Its Own Position)',
  canonicalFacet: 'facet:consumerOffset',

  surface: {
    definition:
      "Consumer groups reading one log each keep their own offset, the next position to read; a read advances only that group's offset, and lag is the log end minus it.",
    exemplarKeywords: [
      'consumer group',
      'consumer offset',
      'committed offset',
      'consumer lag',
      'Kafka consumer groups reading the same topic',
      '__consumer_offsets',
      'independent consumers of one stream',
      'reading does not remove the message',
      'kafka-consumer-groups --describe',
      'bookmark in a stream',
    ],
  },

  briefing: {
    observable: [
      'One log runs across the middle, offsets 0 to 5 holding 11, 24, 5, 17, 30, 8, with "End 6". The Billing group stands above it and the Audit group below, each with a marker between cells showing where it will read next, plus "Per read: 3" and "Per read: 1".',
      'When a group reads, only its marker jumps forward across the cells it read, copies of those values slide out to its side, and the original cells stay in the log. The caption names both groups: "Read by Billing: offsets 0–2. Its offset → 3; Audit stays at 0."',
      'Each group shows "Offset" and "Lag" (end minus offset); a bracket at the bottom shows how far apart the two offsets are, "Apart: 3".',
      'At step 4 record 13 slides in at offset 6 and the end moves to 7: "Record 13 at offset 6, end → 7. Offsets Billing 6 · Audit 1; lag 1 · 6." Both markers stay put and both lags grow by one.',
      'After seven events the log still holds all seven records. Billing sits at offset 7 with lag 0; Audit sits at offset 3 with lag 4; "Apart: 4". Offsets only moved forward.',
      'The model is one partition with no retention limit, and offsets are committed the instant they are read — in real Kafka the committed offset can trail what a consumer has processed. Time is not counted; one group being faster comes only from reading more per turn. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one event per step, and stops after the seventh.',
        'A Replay button and a playback strip sit below. Dragging back to step 4 holds the moment a new record raises both lags while neither offset moves.',
        'The log, the read sizes and the order of events are fixed, so every offset and lag can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader thinks reading a message removes it, or that two services reading the same topic would steal messages from each other. Two groups reading the same seven records at different paces, with nothing removed, answers both.',
      'The article defines consumer lag and needs it to rise when the producer writes, fall when the group reads, and differ between groups on the same log.',
    ],

    avoidWhen: [
      'The article is about several consumers inside one group splitting partitions between them. There is one partition and each group acts as one reader.',
      'The subject is resetting or seeking an offset backward. Offsets here only move forward.',
      'The point is at-least-once versus exactly-once delivery around commits. Reading and committing happen together here.',
    ],

    contrastWith: [
      {
        concept: 'appendOnlyLog',
        note: 'The log\'s offsets are fixed labels given at append time; a consumer offset is a movable pointer each reader keeps into those labels.',
      },
      {
        concept: 'replayFromOffset',
        note: 'Independent forward progress per group is the normal case. Deliberately moving one group\'s offset backward is a separate operation built on the same pointer.',
      },
      {
        concept: 'kafkaPattern',
        note: 'Lag with unlimited retention is only a distance to catch up. Once retention is finite, a large enough lag turns into lost records.',
      },
      {
        concept: 'replicationLag',
        note: 'Replication lag is a follower copy trailing its leader, so readers see old data. Consumer lag is a reader trailing the log it reads, and the data itself is current.',
      },
    ],
  },
};
