/**
 * merkleTree 개념 선언.
 *
 * canonical facet 은 `facet:merkleTree` — 한 주장을 말하는 조각(piece) facet.
 * 출처는 해시지만 소속은 하나가 아니다 — Git, 분산 저장, 블록체인, 동기화
 * 프로토콜 글에서도 같은 구조가 쓰인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const merkleTreeConcept: FacetConceptSource = {
  id: 'merkleTree',
  label: 'Merkle Tree',
  domain: 'security',
  canonicalFacet: 'facet:merkleTree',

  surface: {
    definition:
      'Hashing pairs of hashes upward leaves a single value at the top, so one changed leaf alters only the path from that leaf to the root while every other branch stays identical.',
    exemplarKeywords: [
      'Merkle tree',
      'hash tree',
      'root hash',
      'Merkle proof',
      'which file changed',
      'Git object model',
      'comparing replicas',
      'block of transactions',
    ],
  },

  briefing: {
    observable: [
      'Four files each get a hash, then the hashes fold in pairs upward until one value is left at the top.',
      'The folding is shown bottom to top in order, so the top value is seen to come from everything below it.',
      'One file is then changed and marked, with the tree above still holding the old values for one beat.',
      'Only the leaf, its pair node and the root recolour. The other branch keeps its original colour, which is the whole point.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops. A single Replay button is the only control.',
        'A footnote gives the scale that matters: a thousand files means about ten steps from a leaf to the top, not a thousand.',
      ],
    },

    avoidWhen: [
      'The article is about a hash chain or an append-only log. That shape spreads a change forward instead of confining it to a path.',
      'The subject is a binary search tree or any ordered structure. Nothing here is sorted and no lookup by key happens.',
      'The point is how a Merkle proof is verified by a light client. This shows why the path is short but never walks a proof.',
      'The article needs trees with an odd number of leaves and the duplication rule. The screen uses exactly four leaves.',
    ],

    contrastWith: [
      {
        concept: 'hashChain',
        note: 'Same material, opposite shape: a chain preserves order and spreads a change forward, a tree preserves grouping and confines it to one path.',
      },
      {
        concept: 'bst',
        note: 'Both are trees, but one arranges keys for lookup while this one folds hashes upward and never searches.',
      },
    ],
  },
};
