/**
 * findRoot 개념 선언.
 *
 * canonical facet 은 `facet:findRoot` — 자리 일곱을 한 줄에 늘어놓고 가리킴을
 * 활 모양 곡선으로 얹은 뒤, 세 자리에서 올라가 어느 이름에 닿는지 보이는 조각이다.
 *
 * 스스로 재생하고 멈춘다. 세 번의 오름과 두 번의 견줌을 자동으로 마친 뒤,
 * 한 걸음 단추를 누르면 처음으로 되감아 걸음마다 다시 짚는다.
 *
 * 변별어를 붙인 이유: `root` 만으로는 이진 탐색 나무나 힙의 꼭대기와 구별되지
 * 않는다. 여기서 뿌리는 무리의 이름이고, 그것에 닿는 방법이 이 개념이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const findRootConcept: FacetConceptSource = {
  id: 'findRoot',
  label: 'Finding the Representative',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:findRoot',

  surface: {
    definition:
      'Membership in a disjoint-set structure is decided by the representative reached from an element by following parent pointers upward until one points at itself.',
    exemplarKeywords: [
      'find operation',
      'representative element',
      'root of a set',
      'same group or not',
      'parent pointer',
      'self-pointing root',
      'set identity',
      'follow the pointer up',
    ],
  },

  briefing: {
    observable: [
      'Seven slots sit in one row, each with the slot it points at written underneath, and the pointers are drawn as arcs above the row.',
      'A marker rides along the arc from one slot to the next, so a climb is a movement over the pointer rather than a jump between two pictures.',
      'Three climbs run in turn — from slot 3, then 6, then 2 — and each ends on a slot that points at itself, which the caption names as the root and as the name of the group.',
      'Every finished climb leaves the whole route written out, 3 to 1 to 0 and so on, coloured by which name it landed on, so slots reaching the same name end up sharing a colour.',
      'Neighbouring slots in the row are not thereby in one group: 3 and 4 sit side by side and reach different names, which is the point of climbing rather than looking.',
      'The last two moments compare the finished climbs — 3 against 6 lands on different names, 3 against 2 lands on the same one, and both slots pulse as the comparison is stated.',
    ],

    screen: {
      affordances: [
        'The screen plays the three climbs and the two comparisons on its own and then stops, so it makes its point without needing a click.',
        'Two buttons: Replay, and Step for taking the moments one at a time. The first Step after the automatic run rewinds and starts the walk again from the first slot.',
        'The pointers are fixed for this screen — the reader chooses nothing about which slot points where, and the same three climbs run every time.',
      ],
    },

    useWhen: [
      'The prose says two elements are in the same set and the reader looks for them being stored together or adjacent; climbing from each one and landing on the same name is what settles which slots belong together.',
      'Before merging or its cost can be discussed at all, the reader has to accept that a group is identified by one element and that the way to get it is to follow the pointer up until it points at itself.',
    ],

    avoidWhen: [
      'The article is about the root of a binary search tree or a heap — the topmost node of a stored tree. That root is where a structure begins; this one is the name a group answers to.',
      'The subject is searching for a value in a collection. What is being found here is which group an element belongs to, and the element itself was already in hand.',
      'The point is a root directory, a root domain, or root cause analysis. The word matches and nothing else does.',
      'The article is about how the pointers came to be arranged this way, or what it costs when the climb is long. The arrangement here is given and the same short climbs run every time.',
    ],

    contrastWith: [
      {
        concept: 'unionFind',
        note: 'The query on its own against the structure it belongs to, where merging and the cost of repeated queries are also in play.',
      },
      {
        concept: 'unionByRank',
        note: 'One asks what the pointers already say about who belongs together; the other is about arranging those pointers so the answer stays cheap to reach.',
      },
      {
        concept: 'traverseFromHead',
        note: 'Both follow one pointer at a time, but a list walk visits every element in order while this one climbs to a single answer and the elements passed on the way are incidental.',
      },
    ],
  },
};
