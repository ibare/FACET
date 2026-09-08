/**
 * shiftOnRemove 개념 선언.
 *
 * canonical facet 은 `facet:shiftOnRemove` — 고정된 칸 다섯, 위로 떠올라 사라지는 값,
 * 왼쪽으로 걸어오는 값들과 오른쪽으로 걸어가는 빈 칸, 그리고 한 칸 줄어드는 사용 구간
 * 표시와 꼬리에 남는 "안 씀" 칸.
 *
 * 한 주장만 말하는 조각(piece) facet 이라 canonicalFacet 은 자기 자신이고 `aspects`
 * 를 쓰지 않는다.
 *
 * mount 즉시 스스로 삭제 한 번을 끝까지 재생하고 멈춘다. 다시 보기와 한 걸음이 있으나
 * 눌러야 완성되는 화면이 아니다.
 *
 * 변별어를 붙인 이유: `remove` 만으로는 연결 리스트 · 트리 · 큐의 삭제가 같은 이름을
 * 자칭한다. 이 개념의 주장은 당김이므로 그것을 id 에 담는다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shiftOnRemoveConcept: FacetConceptSource = {
  id: 'shiftOnRemove',
  label: 'Closing the Gap After a Removal',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:shiftOnRemove',

  surface: {
    definition:
      'Deleting a value from a position inside an array by moving every later element one slot toward the front, so the remaining values stay in a row with no gap.',
    exemplarKeywords: [
      'remove from array',
      'delete at index',
      'close the gap',
      'shift left',
      'O(n) deletion',
      'length versus capacity',
      'leftover value',
      'compaction',
      'why deletion is expensive',
    ],
  },

  briefing: {
    observable: [
      'Removing index 1 lifts its value up out of the row and fades it away, and the slot it occupied turns into a dashed empty outline immediately.',
      'The later values then walk left one at a time, starting with the one directly behind the hole, so the empty outline travels right while the values travel left.',
      'The order is stated as a rule rather than left to chance: pull from the front, or a value would be overwritten.',
      'When the pulling ends the row still has five slots. What changes is the bracket underneath, which retreats from "in use: 5" to "in use: 4", and the trailing slot stays drawn, dimmed and tagged "unused".',
      'The closing line counts the price of one deletion: three values shifted one slot left.',
    ],

    screen: {
      affordances: [
        'The removal plays through unprompted and comes to rest on the shortened range.',
        'Two buttons — Replay, and one that takes the pulls a single step at a time so the travelling gap can be watched rather than inferred.',
        'The array is five values with the deletion at index 1, chosen so there are three pulls to watch rather than one.',
      ],
    },

    useWhen: [
      'The article treats deletion as freeing a slot, and the reader expects the array to become one slot shorter. On screen the block keeps every slot and only the marked in-use range retreats, leaving a trailing slot that is simply no longer read.',
      'The prose leaves unsaid why the hole cannot just be left where it is. Watching the values walk forward into it is the argument that positions are what indexing depends on, so a sequence with a hole in it is not an array any more.',
    ],

    avoidWhen: [
      'The subject is removing from a linked structure, where a deletion is a rewiring and nothing behind it moves.',
      'The article is about freeing memory, reference counting, or garbage collection. Nothing is released here; the same block is kept and a slot is retired within it.',
      'The point is taking from the front of a queue cheaply by advancing a head pointer instead of moving anything.',
      'The subject is lazy deletion or tombstones in a hash table, where a removed entry is marked in place precisely so that nothing has to be moved.',
    ],

    contrastWith: [
      {
        concept: 'shiftOnInsert',
        note: 'The mirror case: one opens a slot by pushing later values back, this one closes a slot by pulling them forward, and the direction that avoids overwriting flips accordingly.',
      },
      {
        concept: 'linkedListSingly',
        note: 'A list removes by unlinking one node and leaves every other node where it is; an array has no links to cut and must move the values themselves.',
      },
      {
        concept: 'array',
        note: 'The array concept holds removal alongside reading, writing and growing; this one takes removal alone and follows what happens to the slot left behind.',
      },
    ],
  },
};
