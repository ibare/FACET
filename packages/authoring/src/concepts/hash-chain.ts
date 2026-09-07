/**
 * hashChain 개념 선언.
 *
 * canonical facet 은 `facet:hashChain` — 한 주장을 말하는 조각(piece) facet.
 * 출처는 해시지만 소속은 하나가 아니다 — 블록체인, 감사 로그, 버전 관리,
 * 변조 방지 기록 글에서도 같은 구조가 쓰인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashChainConcept: FacetConceptSource = {
  id: 'hashChain',
  label: 'Hash Chain (Tamper-Evident Log)',
  domain: 'security',
  canonicalFacet: 'facet:hashChain',

  surface: {
    definition:
      'When each record stores the hash of the record before it, editing an old entry breaks its link to the next one and the mismatch propagates to the end of the log.',
    exemplarKeywords: [
      'hash chain',
      'tamper-evident log',
      'append-only log',
      'blockchain linking',
      'previous hash',
      'audit trail',
      'why you cannot edit history',
      'chained records',
    ],
  },

  briefing: {
    observable: [
      'Four entries sit in a row, each showing the hash it carries from the entry before, its own content, and its own hash.',
      'Curved links run from one entry\'s hash into the next entry\'s carried value, so "holds the previous hash" is drawn rather than stated.',
      'An old entry is edited and marked, but its hash is left alone for one beat, separating cause from effect.',
      'The edited entry\'s hash then changes and the next entry is still carrying the old one — the break is shown at the joint.',
      'The mismatch then runs to the end, with every following entry recoloured.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops. Two buttons: Replay, and Step for walking the four moments one at a time. Neither is needed for the screen to finish what it has to say.',
        'The entries are ledger lines (deposit 50, withdraw 20), so the motive for editing an old one needs no explanation.',
        'A footnote admits that recomputing every following entry restores the chain, and says what still catches it.',
      ],
    },

    avoidWhen: [
      'The article is about consensus or mining. Making recomputation expensive is a separate mechanism layered on top of this one.',
      'The subject is a Merkle tree. Both fold hashes, but a tree localises a change to one path while a chain propagates it forward.',
      'The point is confidentiality. A chain shows that records were altered; it never hides what they say.',
      'The article treats a chain as proof that history cannot change. It only makes silent change impossible, which the footnote states.',
    ],

    contrastWith: [
      {
        concept: 'merkleTree',
        note: 'Same material, opposite shape: a chain preserves order and spreads a change forward, a tree preserves grouping and confines it to one path.',
      },
      {
        concept: 'hashIntegrityCheck',
        note: 'Both detect alteration, but one checks a single artefact against a published value while this one binds a sequence together.',
      },
    ],
  },
};
