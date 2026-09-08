/**
 * traverseFromHead 개념 선언.
 *
 * canonical facet 은 `facet:traverseFromHead` — 다섯 노드 중 인덱스 3 에 닿기 위해
 * 곧장 건너뛰어 보다 실패하고, 링크를 세 번 따라가는 stage view.
 *
 * 스스로 재생하고 멈춘다. mount 즉시 여섯 걸음을 밟고 나면 되짚기 입력을 기다린다.
 * 누르지 않고 지나가도 화면은 할 말을 마친다.
 *
 * 변별어를 붙인 이유: "순회" 는 트리·그래프에서 방문 순서를 뜻하는 말로 더 자주
 * 쓰인다. 여기서 말하는 것은 방문 순서가 아니라 **출발점이 head 하나뿐이라는
 * 제약** 이므로 그 출발점을 id 에 담았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const traverseFromHeadConcept: FacetConceptSource = {
  id: 'traverseFromHead',
  label: 'Why You Must Walk From the Head',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:traverseFromHead',

  surface: {
    definition:
      'Reaching a node in a linked list means following links from the head one at a time, because no arithmetic turns an index into that node\'s address.',
    exemplarKeywords: [
      'sequential access',
      'no random access',
      'traversal',
      'walking the list',
      'linear scan',
      'O(n) lookup',
      'index into a linked list',
      'head pointer',
      'number of hops',
      'skip list',
    ],
  },

  briefing: {
    observable: [
      'Five nodes sit in a row with their index numbers written underneath and head marking the leftmost one, and the wanted node is ringed with a label before anything moves.',
      'A jump is attempted first: a ray shoots out from the head towards the wanted index, stops partway with nothing to land on, and retracts. The attempt is part of the argument, not an error state.',
      'Each link is then followed one at a time, the cursor sliding to the next node while a trail fills in behind it and a dotted line ties the cursor to whichever node it is standing on.',
      'A moves counter on screen rises 1, 2, 3 as the links are followed, and hardens when the walk arrives — three moves through four nodes to reach index 3.',
    ],

    screen: {
      affordances: [
        'The screen runs its six beats by itself and then stops, so it makes its point without being clicked.',
        'Two buttons: Replay, and Step for taking one beat at a time. Stepping is what makes the failed jump readable — at full speed the ray goes out and comes back quickly enough to be mistaken for a successful move.',
        'The counter and the trail are left standing at the end, so the finished screen still shows how many links were crossed.',
      ],
    },

    useWhen: [
      'The prose has said you cannot index into a linked list and the reader takes that to mean it is merely slower. The claim is stronger — there is no address to compute, so the jump is attempted and comes back with nowhere to land.',
      'The head has just been introduced as a label on the first node, and the reader needs to see that it is the only door in: every lookup starts there, whichever node is wanted.',
    ],

    avoidWhen: [
      'The subject is searching for a value rather than reaching a position. Nothing is compared here; the target is picked by index before the walk begins.',
      'The article is about a doubly linked list or a circular one, where a walk can start elsewhere or turn around. The walk here only ever goes forward from the head.',
      'The point is that a linked list inserts cheaply. Nothing is inserted or removed here — the chain is untouched from beginning to end.',
      'The article is about cache behaviour or memory locality. The nodes are drawn evenly spaced for legibility, which would misrepresent that argument.',
    ],

    contrastWith: [
      {
        concept: 'indexAddressCalc',
        note: 'The exact counterpart: one reaches any position by computing an address once, the other has no address to compute and must ask each node for the next.',
      },
      {
        concept: 'nodePointsNext',
        note: 'One is about a node holding the address of its successor; this is about what that arrangement forces on anyone who wants the fourth node.',
      },
      {
        concept: 'linkedListSingly',
        note: 'The walk is one half of the linked list trade — the half that is paid, against the cheap rewiring that is bought.',
      },
    ],
  },
};
