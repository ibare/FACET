/**
 * appendOnlyLog 개념 선언.
 *
 * canonical facet 은 `facet:appendOnlyLog` — 빈 로그에 센서 기록 다섯(t-1=21 · t-2=19 · t-1=22 · t-3=18 · t-1=23)이
 * 차례로 끝에 붙는다. 기록마다 붙는 순간의 길이를 오프셋으로 받고(0..4), 끝 표지가 0 에서 5 로 오른다. 같은 키 t-1 의
 * 새 값은 옛 기록을 고쳐 쓰지 않고 또 붙어, t-1 이 오프셋 0 · 2 · 4 에 모두 남는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리 (`kafkaPattern` 아래 조각 셋 중 하나)
 *
 * 움직이는 것은 **로그의 끝**뿐이고 읽는 쪽이 없다. 주장은 "새 기록은 끝에 붙고 앞은 고쳐지지 않는다" 하나다.
 * 그래서 definition 은 append · end · length · never overwritten · same key 를 독점하고, 형제들의 낱말 —
 * consumer group · lag(consumerOffset) · rewind · read again(replayFromOffset) · retention · deleted(kafkaPattern) — 을 쓰지 않는다.
 * 이웃 `logReplicateInOrder` 는 사본들에 같은 차례로 복제되는 로그이고, 이쪽은 복제 없이 한 파티션 끝에 붙는 것만 말한다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `appendOnlyLog.md` 가 밝힌 것):
 *  - 파티션 하나. 보존 기간이 끝나지 않고, 지우기 · 압축(compaction)이 없다.
 *  - 시각을 셈하지 않는다 — 한 걸음이 기록 하나가 붙는 사건 하나.
 *  - 화면에 코드가 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const appendOnlyLogConcept: FacetConceptSource = {
  id: 'appendOnlyLog',
  label: 'Append-Only Log (New Records Go on the End)',
  canonicalFacet: 'facet:appendOnlyLog',

  surface: {
    definition:
      "An append-only log adds each record at its end, numbered by the current length, and never overwrites earlier entries, so a newer value for a key sits beside the old ones.",
    exemplarKeywords: [
      'append-only log',
      'commit log',
      'write-ahead log',
      'event log',
      'immutable log',
      'Kafka partition offset',
      'event sourcing',
      'log-structured storage',
      'why updates do not overwrite in a log',
      'sequence number of a record',
    ],
  },

  briefing: {
    observable: [
      'The run opens on an empty log — "Empty log. End offset: 0" — with the five incoming records waiting in line on the right under "Incoming": `t-1=21`, `t-2=19`, `t-1=22`, `t-3=18`, `t-1=23` (sensor key and temperature).',
      'Each step the front record moves across and settles in the next cell at the end of the log, gaining an offset number above it, and the "End" marker climbs by one: "Appended at the end: t-2=19. Offset 1 · end 2".',
      'Cells already placed never move and never change value; only the end grows. After five steps the log holds offsets 0 to 4 and the marker reads "End 5".',
      'When `t-1=22` arrives it lands at offset 2 while `t-1=21` stays at offset 0, and the caption adds "Key t-1 sits at offsets: 0 · 2". After `t-1=23` it reads "0 · 2 · 4" — all three values 21, 22 and 23 remain.',
      'Six steps in all, counting the empty start. Nothing on the screen reads the log.',
      'The model is one partition with no retention limit, no deletion and no compaction, and time is not counted — one step is one record appended. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one record per step, and stops after the fifth append.',
        'A Replay button and a playback strip sit below. Dragging the strip back to step 3 holds the moment the second `t-1` lands at offset 2 beside the untouched first one.',
        'The records and their order are fixed, so an article can quote every offset and value exactly.',
      ],
    },

    useWhen: [
      'The reader assumes a log updates a key in place the way a table row does. Seeing `t-1` sit at three offsets at once, each with its own value, corrects that.',
      'The article introduces offsets and needs the simplest possible origin for them: the length of the log at the moment a record arrives.',
    ],

    avoidWhen: [
      'The article is about how consumers track or move their reading position. No reader appears here.',
      'The subject is log compaction or retention deleting old records. Nothing is ever removed in this run.',
      'The point is a replicated log kept identical across servers, as in Raft. There is one log on one machine.',
    ],

    contrastWith: [
      {
        concept: 'consumerOffset',
        note: 'An offset assigned at append time names a record\'s place for good; a consumer offset is a reader\'s bookmark into those places, and it moves while the records do not.',
      },
      {
        concept: 'replayFromOffset',
        note: 'Records that are never overwritten are the precondition for reading them again; replay is what a reader does with that permanence.',
      },
      {
        concept: 'kafkaPattern',
        note: 'Appending says how records enter a log. Retention says how they leave, from the front, which an append-only log alone never does.',
      },
      {
        concept: 'logReplicateInOrder',
        note: 'Both logs only grow at the end, but a replicated log must match other copies entry for entry and may truncate a conflicting suffix; a single partition log has no other copy to agree with.',
      },
    ],
  },
};
