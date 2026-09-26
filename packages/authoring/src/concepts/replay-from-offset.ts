/**
 * replayFromOffset 개념 선언.
 *
 * canonical facet 은 `facet:replayFromOffset` — 오프셋 0..5 의 로그(7 · 3 · 9 · 4 · 6 · 2)를 그룹 하나(`stats` 통계)가
 * 한 번에 둘씩 읽어 끝(6)에 닿은 뒤, 오프셋이 한 걸음에 2 로 되감기고 이어지는 읽기 둘이 9 4 · 6 2 를 같은 차례로
 * 한 번 더 내놓는다. 기록마다 읽힌 횟수가 끝에 1 · 1 · 2 · 2 · 2 · 2. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (`kafkaPattern` 아래 조각 셋 중 하나)
 *
 * 움직이는 것은 **한 읽는 자리의 뒤걸음**이고, 화면 수는 기록마다 읽힌 횟수다. 주장은 "다시 읽으려면 로그가 아니라
 * 오프셋 하나를 뒤로 옮기면 된다" 하나다. 그래서 definition 은 reprocess · move back · same records · same order · again 을
 * 쥐고, append · same key(appendOnlyLog) · two groups · lag(consumerOffset) · retention · deleted(kafkaPattern) 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `replayFromOffset.md` 가 밝힌 것):
 *  - 파티션 하나 · 그룹 하나 · 보존 기간이 끝나지 않는다(실제로는 지워진 자리로 되감을 수 없다).
 *  - 읽은 즉시 커밋한다 · 시각을 셈하지 않는다.
 *  - 읽은 값을 모으지 않는다 — 두 번 처리해도 같은 결과를 내는 일(멱등성)은 다루지 않는다.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const replayFromOffsetConcept: FacetConceptSource = {
  id: 'replayFromOffset',
  label: 'Replay by Rewinding the Consumer Offset',
  canonicalFacet: 'facet:replayFromOffset',

  surface: {
    definition:
      "To reprocess consumed messages, a group moves its offset back to an earlier position, and the unchanged log yields the same records in the same order a second time.",
    exemplarKeywords: [
      'replay messages',
      'rewind offset',
      'seek to offset',
      'reset consumer offset',
      'kafka-consumer-groups --reset-offsets',
      'reprocess events after a bug fix',
      'rebuild a projection from the event log',
      'backfill from history',
      'event replay',
      'read the stream again',
    ],
  },

  briefing: {
    observable: [
      'One log of six records — offsets 0 to 5 holding 7, 3, 9, 4, 6, 2 — with "End 6". Below it the group Stats keeps an "Offset" marker and a "Times read" row, all zeros at the start: "Group Stats starts at offset 0. Log end: 6."',
      'Three reads of two records each carry the offset 0 → 2 → 4 → 6; the values read collect under the group ("Read offsets 2–3: 9 4. Next offset: 4.") and every Times read cell becomes 1.',
      'Step 4 is the rewind: the offset marker moves back from 6 to 2 in one step — "Rewind: offset 6 → 2. Log records: 6." — and the log itself does not change.',
      'The next two reads deliver 9 4 and then 6 2 again, in the same order with the same values as the first time, and the offset returns to 6.',
      'At the end Times read reads 1 · 1 · 2 · 2 · 2 · 2: only the four records after the rewind point were read twice; 7 and 3 were read once. Seven steps in all: five reads and one rewind.',
      'The model has one partition and one group, keeps records forever, and commits offsets as soon as they are read; time is not counted. Real logs delete old records, and an offset cannot be moved back to a deleted position. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one read or rewind per step, and stops after the fifth read.',
        'A Replay button and a playback strip sit below. Scrubbing across step 4 shows the offset jumping backward while every log cell stays exactly as it was.',
        'The log and the sequence of reads and the rewind are fixed, so every value and count can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how a team reprocesses events after fixing a bug in a consumer, and needs to show that the fix is a single offset change, not a change to the stored data.',
      'The reader wonders whether re-reading returns the same data in the same order. The repeated 9 4 6 2 and the Times read counts answer it.',
    ],

    avoidWhen: [
      'The article is about idempotent processing or avoiding double counting when messages are read twice. Values here are only read, never totalled.',
      'The subject is how far back a replay can reach under a retention limit. Retention never ends in this run.',
      'The point is several groups reading at independent positions. Only one group appears.',
    ],

    contrastWith: [
      {
        concept: 'consumerOffset',
        note: 'Offsets normally only advance as a group reads. Replay is the deliberate exception, and it works because the offset belongs to the reader and moving it touches nothing else.',
      },
      {
        concept: 'appendOnlyLog',
        note: 'A log that is never rewritten is what makes a second reading identical to the first; replay is the reader choosing to use that.',
      },
      {
        concept: 'kafkaPattern',
        note: 'Replay assumes the records are still there. Under finite retention the earliest position a rewind can reach is the log start, whatever offset was requested.',
      },
      {
        concept: 'messagingPubsub',
        note: 'Pub/sub without a log hands a message to current subscribers and keeps nothing, so there is nothing to rewind to. Replay needs records that outlive their first delivery.',
      },
    ],
  },
};
