/**
 * relinkInsert 개념 선언.
 *
 * canonical facet 은 `facet:relinkInsert` — 상자 셋의 줄에 넷째를 끼워 넣으면서
 * 화살표 둘만 고쳐 쓰고 상자는 하나도 옮기지 않는 stage view.
 *
 * 스스로 재생하고 멈춘다. mount 즉시 여섯 걸음을 자동으로 밟고, 그 뒤로는 누른
 * 만큼만 나아간다. 누르지 않아도 화면은 할 말을 마친다.
 *
 * 변별어를 붙인 이유: "삽입" 은 어느 자료구조에나 있는 말이다. 여기서 말하는
 * 것은 삽입 일반이 아니라 **재연결로 이루어지는** 삽입 하나이므로 그 동작을
 * id 에 담았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const relinkInsertConcept: FacetConceptSource = {
  id: 'relinkInsert',
  label: 'Inserting by Rewriting Two Arrows',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:relinkInsert',

  surface: {
    definition:
      'Inserting into a linked list writes two references — the new node\'s link and the preceding node\'s link — while every node already in the chain stays exactly where it is.',
    exemplarKeywords: [
      'insert into a linked list',
      'rewiring pointers',
      'relinking',
      'constant time insertion',
      'no shifting',
      'next pointer assignment',
      'insert after a node',
      'splice a node in',
      'nothing moves',
    ],
  },

  briefing: {
    observable: [
      'Three boxes stand in a row and the new box appears on a second row below, holding its value and connected to nothing.',
      'The new box\'s arrow grows out first and reaches the box that will follow it — this happens before anything is taken away from anyone.',
      'The preceding box\'s arrow is then unhooked and left hanging in the air, ringed to mark it, and afterwards the same arrow — tail never moved — comes down onto the new box.',
      'A dot traces the finished chain from the head straight through to the end, so the reader can see it is still one chain after being cut.',
      'A tally appears at the end reading two arrows rewritten and zero boxes moved. The zero is there because no box was ever moved, not because moves were counted and came to nothing.',
      'The new box stays on its own row rather than sliding into the gap, so the finished picture shows the chain reading through a box that never took a place in the line.',
    ],

    screen: {
      affordances: [
        'The screen performs the insertion by itself and stops. It does not need a click to say what it has to say.',
        'Two buttons: Replay, and Step for taking the beats one at a time. The moment worth stepping through is the arrow hanging loose between being unhooked and being set down — at full speed it reads as a single motion.',
        'One insertion, fixed in the declared data. There is no field for choosing a different value or position.',
      ],
    },

    useWhen: [
      'The prose has claimed that an insert here changes nothing but two references, and the reader still pictures the rest of the chain shuffling along to open a gap. Every box visibly staying at its own spot is what removes that picture.',
      'The reader has just been told that the chain is cut open and joined back up, and is uneasy about whether it survives that. Tracing the finished chain end to end from the head is what settles it.',
    ],

    avoidWhen: [
      'The article is about finding the place to insert. The preceding node is already in hand here, and no searching or walking happens.',
      'The point is the danger of doing the two rewrites in the wrong order. The order shown here is the safe one and nothing is lost.',
      'The subject is removal. Only an insertion is shown, and a removal moves a different arrow.',
      'The article is about inserting into an array, a vector, or any structure with positions to open up. Nothing is shifted here because there are no positions to shift.',
    ],

    contrastWith: [
      {
        concept: 'shiftOnInsert',
        note: 'The same request answered two ways: one opens a place by moving everything behind it, the other opens no place at all and rewrites two references.',
      },
      {
        concept: 'lostLink',
        note: 'Same two rewrites, opposite point — one shows what they accomplish, the other what happens when they are done in the wrong order.',
      },
      {
        concept: 'traverseFromHead',
        note: 'The rewiring is cheap, but arriving at the node to rewire is not; the two together are the whole of the bargain.',
      },
    ],
  },
};
