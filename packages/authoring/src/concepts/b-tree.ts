/**
 * bTree 개념 선언.
 *
 * canonical facet 은 `facet:bTree` — 자리마다 키를 여럿 담는 나무 무대 + 층수 /
 * 담긴 것 두 표시 + 키 입력과 넣기·찾기·빼기 + 코드 패널.
 *
 * 독자가 값을 넣고 연산을 몰아 보는 화면이다. mount 직후 여덟 키를 넣는 시연
 * (분할 두 번 포함)을 스스로 재생한 뒤 멈추고 입력을 기다린다. 시연은 넣는
 * 쪽만 보이므로, 차용·병합·층 줄어듦은 독자가 빼야 나온다.
 *
 * 변별어를 붙이지 않았다. "B-tree" 는 그 자체로 특정 자료구조를 가리키고,
 * 리프만 키를 담고 리프끼리 이어지는 변종은 이 화면에 없다 — 그 오검출은
 * avoidWhen 이 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bTreeConcept: FacetConceptSource = {
  id: 'bTree',
  label: 'B-Tree',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bTree',

  surface: {
    definition:
      'A tree that stores several ordered keys in each node and one child between every adjacent pair, splitting a full node upward so all leaves stay at the same depth.',
    exemplarKeywords: [
      'B-tree',
      'database index',
      'index lookup',
      'disk page',
      'block read',
      'multiway search tree',
      'minimum degree',
      'node split and merge',
      'keys per node',
      'filesystem directory index',
    ],
  },

  briefing: {
    observable: [
      'Every seat is drawn as a box with several key cells inside it, and the lines to the children leave from the gaps between those cells rather than from the box as a whole.',
      'A search reads the keys inside one seat left to right, and the caption names each comparison — bigger than this key so keep scanning, smaller so go down the gap before it.',
      'On insertion a full seat is split before the walk passes through it: the middle key rises into the parent and the keys left behind become two boxes side by side.',
      'Taking a key out of a seat that is down to its minimum brings a key down from the parent while a sibling key climbs into the emptied parent slot — the key never travels sideways from one sibling to the other.',
      'When neither neighbour has a spare key, a parent key drops down and the two boxes become one.',
      'The number of levels falls only when merging leaves the root with nothing in it, and the caption announces the new level count at that moment.',
      'Two readouts sit above the controls: the current height in levels, and the current count of keys against the count of seats holding them. Both refresh at the end of every operation.',
      'Four counters run along — keys, splits, merges, compares — and the compare counter moves only while searching, since inserting and removing are narrated on the tree instead.',
    ],

    screen: {
      affordances: [
        'The reader drives this. It plays an opening demonstration that inserts eight keys, two of which force a split, then stops and waits.',
        'The controls are one key field plus Insert, Search and Remove, and a Reset that plays the opening demonstration again. A seat here holds three keys at most.',
        'Removing keys is the only way to reach the borrow, the merge and the fall in height — the opening demonstration adds and never takes away.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks one, with at most two side by side; the highlighted line then follows the search only.',
      ],
    },

    useWhen: [
      'The article treats adding and removing as mirror images, and the reader has to handle the harder half themselves — take keys out until a seat runs short and watch what has to be arranged before the key can go.',
      'The reader needs a number for what one lookup costs here: type keys, search for them, and read the compare count against how few levels the tree actually has.',
    ],

    avoidWhen: [
      'The article is about B+Tree — keys kept only in the bottom row, those leaves chained together, range scans that walk the chain. Nothing links the bottom row here, and a search can end at any level.',
      'The subject is reading a run of keys in order — range queries, ordered scans, cursors. Every operation here answers for one key at a time.',
      'The point is how a node maps onto storage: page size in bytes, fill factor, how many entries fit in a block. A seat here holds three keys so the splitting stays visible, and no size is shown.',
      'The article is about concurrent access to an index — latching, locking, readers meeting a writer mid-descent. One walk happens at a time here.',
    ],

    contrastWith: [
      {
        concept: 'bst',
        note: 'Both descend by comparison and keep their keys ordered, but one weighs a single key per node and this one weighs a row of keys before choosing a gap.',
      },
      {
        concept: 'avlTree',
        note: 'Both refuse to let the tree grow tall, one by rotating a lopsided node back into shape and this one by widening every node so few levels are ever needed.',
      },
      {
        concept: 'splitWhenFull',
        note: 'The split is one moment inside this structure; taken alone it explains the growing side, while here it appears beside the borrowing and merging that removal forces.',
      },
    ],
  },
};
