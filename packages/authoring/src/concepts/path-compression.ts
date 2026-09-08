/**
 * pathCompression 개념 선언.
 *
 * canonical facet 은 `facet:pathCompression` — 자리 다섯이 한 줄로 이어진 최악의
 * 모양에서 가장 깊은 자리를 물어 뿌리까지 오르고, 지나온 자리 전부를 뿌리에
 * 곧장 다시 붙인 뒤 그 자리들을 하나씩 다시 물어 값을 재는 조각이다.
 *
 * 스스로 재생하고 멈춘다. 오름 · 접힘 · 재질문 · 총계까지 자동으로 마친 뒤,
 * 한 걸음 단추를 누르면 처음으로 되감아 걸음마다 다시 짚는다.
 *
 * 변별어를 붙이지 않은 이유: `pathCompression` 은 이미 한 연산을 가리키는 고유
 * 이름이다. 다만 같은 이름을 쓰는 트라이 쪽 기법이 있어 avoidWhen 이 그것을 짚는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pathCompressionConcept: FacetConceptSource = {
  id: 'pathCompression',
  label: 'Path Compression',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:pathCompression',

  surface: {
    definition:
      'After a lookup climbs from an element to its representative, every element on the walked path is re-pointed straight at that representative, so later lookups from any of them take one step.',
    exemplarKeywords: [
      'path compression',
      'find with path compression',
      'flatten the tree',
      'point straight at the root',
      'repeated lookups get cheaper',
      'amortized cost of find',
      'shortcut to the representative',
      'near constant time find',
    ],
  },

  briefing: {
    observable: [
      'Five slots sit in a row already chained one behind another — the worst arrangement — with each slot naming the slot it points at underneath and the root outlined differently.',
      'The lookup starts at the deepest slot and a cursor rides the pointers one at a time while a running tally counts the hops, so the four-step climb is paid for in front of the reader.',
      'When the root is reached the arcs are not redrawn from scratch: each one is pulled over until it lands on the root, and the pointer text under every slot on the path changes to name the root.',
      'The rewiring happens for the whole path at once, not only for the slot that was asked about — which is what makes the single expensive climb worth its price.',
      'Each slot from the path is then asked again in the order it was walked, and every answer is written on its own line stating the one hop it now takes against the number it used to take.',
      'A total closes it: the ten hops those four slots would have cost become four.',
    ],

    screen: {
      affordances: [
        'The screen plays the climb, the rewiring, the four re-queries and the total on its own and then stops.',
        'Two buttons: Replay, and Step for taking the moments one at a time. The first Step after the automatic run returns the pointers to the original chain and starts over.',
        'The chain and the slot to ask about are fixed; the reader chooses neither, so the before-and-after numbers are the same on every viewing.',
      ],
    },

    useWhen: [
      'The prose says a lookup also tidies up on its way out and the reader takes it as housekeeping for the element that was asked about; asking every element of the path afterwards is what shows each of them got cheaper.',
      'The recursive line that reassigns a parent while returning from a lookup is about to appear in pseudocode, and the reader needs to see exactly which pointers that line moves and at what moment.',
    ],

    avoidWhen: [
      'The article is about compressing data — gzip, Huffman coding, image or video codecs. Nothing here makes anything smaller in storage; the compression is of a route between elements.',
      'The subject is path compression in a trie or radix tree, where chains of single-child nodes are merged into one edge. That technique shares the name and works on a different structure for a different reason.',
      'The article is about filesystem paths, URL paths, or normalising them. The word matches and nothing else does.',
      'The point is the proof of the near-constant amortized bound, the inverse Ackermann function. This counts hops on one small example and never argues the general bound.',
    ],

    contrastWith: [
      {
        concept: 'unionByRank',
        note: 'Two different moments: one settles which root goes underneath while two groups are being merged, this one rewires a path after a lookup has already climbed it.',
      },
      {
        concept: 'findRoot',
        note: 'The same climb, but here what matters is not the answer it returns — it is that the pointers are left changed afterwards.',
      },
      {
        concept: 'unionFind',
        note: 'One optimisation in isolation on the arrangement that flatters it most, against the structure where it can be switched off and measured against the other rule.',
      },
    ],
  },
};
