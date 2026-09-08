/**
 * lostLink 개념 선언.
 *
 * canonical facet 은 `facet:lostLink` — 같은 삽입을 두 번 보인다. 먼저 틀린 차례로
 * 해서 뒤쪽 세 노드가 경계선 아래로 떨어지는 것을 보이고, 되돌린 뒤 옳은 차례로
 * 다시 해서 아무것도 떨어지지 않는 것을 보이는 stage view.
 *
 * 스스로 재생하고 멈춘다. mount 직후 두 판을 자동으로 끝내고, 그 뒤에는 되짚기
 * 입력을 기다린다. 누르지 않아도 화면은 할 말을 마친다.
 *
 * 변별어를 붙인 이유: "링크" 만으로는 무엇이 어떻게 되는 이야기인지 서지 않는다.
 * 이 개념이 말하는 것은 링크를 옮기는 **차례를 어기면 뒤쪽에 닿을 길이 사라진다**
 * 는 사고 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lostLinkConcept: FacetConceptSource = {
  id: 'lostLink',
  label: 'Losing the Tail by Relinking Out of Order',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:lostLink',

  surface: {
    definition:
      'Moving the preceding node\'s link to a new node before the new node links to the rest leaves nothing pointing at the remaining nodes, which become unreachable.',
    exemplarKeywords: [
      'lost pointer',
      'dangling reference',
      'unreachable nodes',
      'order of pointer assignments',
      'losing the tail',
      'memory leak',
      'temporary variable before relinking',
      'prev curr next',
      'reversing a linked list',
      'broken chain',
    ],
  },

  briefing: {
    observable: [
      'Four boxes stand in a lane with head pointing into the first one, and a dashed line runs across the picture with the area above it labelled as the part reachable from the head.',
      'The wrong order is performed first: the preceding box\'s arrow is moved onto the new box while the new box still points at nothing, and the moment it lands there is no arrow into the rest of the chain.',
      'Three boxes then tilt and fall below the dashed line, where a second label appears saying they are still in memory with no way in. Their arrows to each other are still drawn, so the group is intact and only the door is gone.',
      'The screen then undoes itself — the fallen boxes rise back into the lane and the new box retreats off screen — and runs the same insertion in the other order.',
      'The second time the new box\'s arrow is attached to the rest first, so for one beat two arrows point at the same box; only then is the preceding box\'s arrow moved, and the new box settles into the lane with nothing having fallen.',
    ],

    screen: {
      affordances: [
        'The screen plays both attempts on its own and stops. The failure and the repair are one continuous run, not two things to trigger.',
        'Two buttons: Replay, and Step for taking one beat at a time. The beat worth stopping on is the one where two arrows point at the same box, because that overlap is the entire reason the second order is safe.',
        'One insertion at a fixed position, declared in the data. There is nothing to type in and no other order to try.',
      ],
    },

    useWhen: [
      'The prose has given the two rewrites in a particular order and the reader takes that as a matter of style. Seeing the tail fall out of reach on the wrong order is what turns it into a rule.',
      'The reader has to understand that the loss is unrecoverable rather than temporary: the boxes are still sitting there, intact and linked to one another, and there is no longer any way to reach them.',
    ],

    avoidWhen: [
      'The subject is garbage collection, reference counting, or how a runtime reclaims memory. The screen stops at the nodes being unreachable and says nothing about what happens to them afterwards.',
      'The article is about a null dereference or a crash. Nothing here fails loudly — the chain remains valid and simply becomes shorter.',
      'The point is what an insertion accomplishes or what it costs. The insertion is the setting; the subject is the order the two rewrites are performed in.',
      'The article is about concurrent modification or a race between threads. Both attempts here are performed by a single sequence of steps.',
    ],

    contrastWith: [
      {
        concept: 'relinkInsert',
        note: 'Same two rewrites: one shows that they suffice to insert, this one shows that their order decides whether the rest of the chain survives.',
      },
      {
        concept: 'traverseFromHead',
        note: 'The reason a lost arrow is fatal is that reaching a node has no route except through the arrows leading to it.',
      },
      {
        concept: 'linkedListSingly',
        note: 'A chain built from single forward references is precisely a chain in which one node has exactly one way in, which is what makes this failure possible.',
      },
    ],
  },
};
