/**
 * kafkaPattern 개념 선언.
 *
 * canonical facet 은 `facet:kafkaPattern` — 파티션 하나의 로그에 틱마다 기록 하나가 붙고(24 틱), 보존 길이만큼만
 * 남는다. 빠른 그룹(live)은 틱마다 끝까지 읽고, 느린 그룹(batch)은 간격마다 하나 읽는다. 보존이 차면 로그 앞이 끝을
 * 따라 밀리고, 그 앞에 걸린 batch 오프셋은 로그 앞으로 튕겨 건너뛴 기록을 잃는다. 끝 걸음에 live 가 오프셋 0 으로
 * 되감기를 청하지만 로그 앞에서 멈춘다. 손잡이 둘 — 보존 길이(4 · 8 · 12 · 16 · 끝없음, 처음 8) · 느린 그룹 간격(2 · 3).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 보존이 끝나지 않는 로그의 한 장면이다 — 끝에 붙기(`appendOnlyLog`) · 그룹마다 따로 나아가는 오프셋
 * (`consumerOffset`) · 오프셋을 뒤로 옮겨 다시 읽기(`replayFromOffset`). 이쪽의 새 말은 **보존이 오프셋을 밀어낸다**
 * 는 것 하나이고, 손잡이로 보존을 돌려 잃음과 밀림이 반대로 움직이는 것을 견준다. 그래서 definition 은 retention ·
 * deleted · pushed forward · loses 를 쥐고, 조각들이 독점한 append at the end · same key · each group's own position ·
 * seek back · second time 을 쓰지 않는다. pub/sub(`messagingPubsub`)과는 로그가 있느냐로 갈린다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `kafkaPattern.md` 가 밝힌 것):
 *  - 파티션 하나 · 보존을 기록 수로 셈한다(실제로는 `retention.ms` · `retention.bytes`, 지우는 단위는 세그먼트).
 *  - 틱은 예로 정한 시간 단위이고, 한 틱 안의 차례를 정해 두었다 — 붙음 → 보존 지움 → live 읽기 → batch 튕김 → batch 읽기.
 *  - 읽은 즉시 커밋한다. 지워진 자리를 만난 오프셋은 가장 이른 남은 오프셋으로 간다(`auto.offset.reset=earliest` 꼴).
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const kafkaPatternConcept: FacetConceptSource = {
  id: 'kafkaPattern',
  label: 'Kafka Log Retention vs Slow Consumers',
  canonicalFacet: 'facet:kafkaPattern',

  surface: {
    definition:
      "Kafka retention deletes a topic's oldest records regardless of readers, so a lagging consumer group is pushed forward and loses unread records, and a rewind reaches only what is retained.",
    exemplarKeywords: [
      'Kafka',
      'Kafka retention',
      'retention.ms',
      'retention.bytes',
      'consumer lag',
      'slow consumer loses messages',
      'OffsetOutOfRange',
      'auto.offset.reset earliest',
      'log retention vs consumer speed',
      'event streaming platform',
      'reset offsets to earliest',
    ],
  },

  briefing: {
    observable: [
      'One partition log fills from empty: each tick one record lands in the next cell, 24 ticks in all, offsets 0 to 23. A dashed retention frame holds the kept records; its thick left edge is the log start.',
      'Two consumer-group markers ride the log: "Real-time" (`live`) above reads to the end every tick and stays pinned to the end; "Batch" (`batch`) below reads one record every few ticks, and the unread cells between it and the end are shaded — that width is the lag.',
      'Once the frame is full, every new record pushes the log start one cell along and the cell before it is deleted — its value disappears and the empty cell is struck through. The caption reads "Log start → 9" and the like.',
      'When the batch marker is caught by the log start it jumps forward — "Skip: 7 → 8" — and a red cross is left under the skipped cell in the "Lost" row. With retention 8 and the slow group every 2 ticks, this happens at ticks 16, 18, 20, 22 and 24: five lost, final log 16..23, batch at 17 with lag 7.',
      'The last step is a rewind: the real-time group asks for offset 0, its marker flies back and stops at the log start — "Rewind → 16 · Asked for 0". Only the 8 records still kept can be read again.',
      'Four readouts count the round: "Batch lost", "Real-time lost" (0 at every setting), "Batch lag" and "Records kept" (its final value is how many records a rewind can reach).',
      'Across the Retention handle with the slow group every 2 ticks: 4 loses 9 with lag 3, 8 loses 5 with lag 7, 12 loses 1 with lag 11, 16 and Forever lose 0 with lag 12; the rewind stops at 20, 16, 12, 8 and 0. With every 3 ticks the losses are 13, 9, 5, 1, 0 and the first skip moves earlier.',
      'The model is simplified: one partition, retention counted in records rather than time or bytes, a fixed order of events inside each tick, offsets committed as soon as they are read, and a deleted offset resetting to the earliest kept one (like `auto.offset.reset=earliest`; with `latest` the group would jump to the end and lose more). The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Retention" with positions 4, 8, 12, 16 and Forever (starting at 8), and "Slow group every" with 2 or 3 ticks (starting at 2). Each round plays 24 ticks and the rewind, about 20 seconds, then waits for a handle.',
        'The move that makes the idea land is stepping retention up: the batch losses fall to 0 while its lag grows, the real-time group loses nothing at any setting, and the rewind stop slides back toward 0. Raising the slow-group interval to 3 makes the skips start earlier.',
        'The code panel, labelled "Offsets under retention", starts empty with a "+ Add language" button. The function `kafkaRun(ticks, retention, every, result)` computes the same integers as the screen and writes batch lost, real-time lost, records a rewind can reach, and batch lag into `result`; it carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article has to explain why a consumer that falls too far behind silently misses messages in Kafka, and wants the loss to appear exactly when the retention boundary overtakes that consumer\'s offset.',
      'A reader thinks a small consumer lag is always healthy. Turning retention down shows lag shrinking only because unread records were deleted underneath the slow group.',
      'The piece argues that replaying history depends on retention settings, and needs the rewind to stop at the oldest kept record rather than at the offset asked for.',
    ],

    avoidWhen: [
      'The article is about partitions, keys and how records are spread across brokers. There is a single partition and records carry no key.',
      'The subject is log compaction that keeps the last value per key. Deletion here is purely by position at the front.',
      'The point is exactly-once processing, commit intervals or duplicate delivery after a crash. Offsets are committed the instant they are read.',
      'The subject is replicating a log across servers for fault tolerance. Nothing here is copied to another machine.',
    ],

    contrastWith: [
      {
        concept: 'appendOnlyLog',
        note: 'Appending at the end with fixed offsets is how the log grows; retention is the other end of the same log, where records leave by position no matter who still needs them.',
      },
      {
        concept: 'consumerOffset',
        note: 'Separate offsets per group explain how two readers can be at different places. Retention adds the case where a group\'s place is no longer in the log at all, and the offset is moved for it.',
      },
      {
        concept: 'replayFromOffset',
        note: 'Moving an offset back re-reads records only if they still exist. With finite retention, how far back a replay can go is set by the log start, not by the request.',
      },
      {
        concept: 'messagingPubsub',
        note: 'Pub/sub delivers to whoever is subscribed at publish time and keeps nothing. A retained log keeps records for a while so readers pull at their own pace, and the limit of that while is what decides loss.',
      },
      {
        concept: 'backpressure',
        note: 'Backpressure slows the producer when a consumer cannot keep up. A retained log never slows the producer; the slow consumer pays instead, by losing what was deleted before it got there.',
      },
    ],
  },
};
