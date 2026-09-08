/**
 * shiftOnInsert 개념 선언.
 *
 * canonical facet 은 `facet:shiftOnInsert` — 여섯 개의 고정된 칸, 그 위에 얹혀 실제로
 * 오른쪽으로 옮겨 가는 값 타일, 목표 칸 위에서 기다리는 새 값, 이동 횟수 표시.
 *
 * 한 주장만 말하는 조각(piece) facet 이라 canonicalFacet 은 자기 자신이고 `aspects`
 * 를 쓰지 않는다.
 *
 * mount 즉시 스스로 재생해 삽입 한 번을 끝까지 보이고 멈춘다. 다시 보기와 한 걸음이
 * 있으나 아무것도 누르지 않아도 화면은 할 말을 마친다.
 *
 * 변별어를 붙인 이유: `insert` 만으로는 연결 리스트 · 트리 · 해시 테이블의 삽입이
 * 모두 같은 이름을 자칭한다. 이 개념의 주장은 밀림 자체이므로 그것을 id 에 담는다
 * (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shiftOnInsertConcept: FacetConceptSource = {
  id: 'shiftOnInsert',
  label: 'Making Room by Shifting Right',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:shiftOnInsert',

  surface: {
    definition:
      'Inserting a value at a position inside an array by moving every later element one slot toward the end, working from the back, before writing the value in.',
    exemplarKeywords: [
      'insert into array',
      'shifting elements',
      'make room',
      'insert at index',
      'O(n) insertion',
      'copy backwards',
      'overwrite',
      'memmove',
      'why arrays are slow to insert',
    ],
  },

  briefing: {
    observable: [
      'The slots are fixed outlines and the values are separate tiles resting on them, so when a value moves it is the tile that slides right while the slot stays where it is.',
      'A slot goes to a dashed empty outline the instant its value leaves it, which is what makes the destination of every move visibly free beforehand.',
      'The new value 99 waits above the target slot, drops once against it while it is still occupied, and springs back up — it cannot go in yet.',
      'The moving starts with the last value and works toward the front, and the caption names why: moving back to front overwrites nothing.',
      'A counter reads "moved: n" and climbs with each move, ending at 3 for a single insertion, and the closing line ties the number to the position: the closer to the front, the more get pushed.',
    ],

    screen: {
      affordances: [
        'The whole insertion plays through by itself and stops with the array settled.',
        'Two buttons — Replay, and one that advances the moves one at a time so a single slide can be held still and read.',
        'The array is five values in six slots, so there is one spare slot to shift into and the insertion never has to ask for more room.',
      ],
    },

    useWhen: [
      'The article says room has to be made before a value can go in, and the reader pictures the array politely opening a gap. Here the gap is produced by moving values one at a time, and the new value is held above the slot until it is genuinely free.',
      'The prose is about to justify running a copy loop backwards. The reason only convinces once you have seen that going front to back would land on a value that has not moved yet.',
    ],

    avoidWhen: [
      'The article is about inserting into a linked structure, where the whole point is that nothing moves and only references are rewired.',
      'The subject is finding where a value belongs — binary search for the position, keeping a list sorted. The position is given here and nothing searches for it.',
      'The point is appending to the end, or the amortized cost of doing so. The array here has a spare slot and never runs out.',
      'The subject is inserting into a tree, a heap, or a hash table. Those rearrange by comparison or by a computed slot, not by pushing neighbours along.',
    ],

    contrastWith: [
      {
        concept: 'shiftOnRemove',
        note: 'The two halves of the same constraint: one pushes later values back to open a slot, the other pulls them forward to close one, and the safe direction of the loop reverses between them.',
      },
      {
        concept: 'relinkInsert',
        note: 'Both put a value into the middle of a sequence. One pays by moving every later element; the other pays nothing to move but must first reach the place.',
      },
      {
        concept: 'growAndCopy',
        note: 'Shifting assumes a spare slot exists. When it does not, the insertion cannot even begin until a larger block has been taken and everything copied into it.',
      },
    ],
  },
};
