/**
 * hashAvalanche 개념 선언.
 *
 * canonical facet 은 `facet:hashAvalanche` — 한 주장을 말하는 조각(piece) facet 이다.
 * 완결형 facet 과 달리 컨트롤도 제목도 없고, 여섯 걸음을 재생하고 정지한다.
 *
 * 조각은 누구의 하위도 아니다. `aspects` 를 쓰지 않으며 canonicalFacet 은
 * 자기 자신이다 — 이 개념이 답하는 질문이 하나이고 그 답이 이 화면 하나다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashAvalancheConcept: FacetConceptSource = {
  id: 'hashAvalanche',
  label: 'Hash Avalanche Effect',
  domain: 'security',
  canonicalFacet: 'facet:hashAvalanche',

  surface: {
    definition:
      'A cryptographic hash changes about half of its output bits when a single input character changes, so nearly identical inputs produce entirely unrelated digests.',
    exemplarKeywords: [
      'avalanche effect',
      'hash sensitivity',
      'one character change',
      'SHA-256',
      'why hashes look unrelated',
      'checksum mismatch',
      'bit flip',
      'tamper evidence',
      'small change big difference',
    ],
  },

  briefing: {
    observable: [
      'Two inputs sit side by side differing in exactly one character, and only that character is coloured — the difference is located before it is measured.',
      'A badge counts the input difference in bits (5), which is the number the rest of the screen is compared against.',
      'The two hashes appear as hex prefixes that bear no resemblance to each other, so "unrelated" is seen before it is quantified.',
      'A single grid of 256 cells paints only the flipped bits, sweeping top to bottom, and roughly half of it lights up.',
      'The final count reads 131 / 256 — the screen ends on the asymmetry between 5 input bits and 131 output bits.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops, so it says what it has to say without asking for a click.',
        'A single Replay button is the only control. The bits filling in is part of the message, so a reader who arrived late can watch it again.',
        'The inputs are fixed (hello / hellp) and the hashes are real SHA-256 values, so the numbers quoted in the text can be quoted exactly.',
      ],
    },

    avoidWhen: [
      'The article is about hash collisions or the pigeonhole argument. That is about two inputs sharing one output, which this screen never shows.',
      'The subject is the internal construction of a hash function — rounds, compression, Merkle-Damgard. Nothing here opens the box.',
      'The point is password hashing, salting or key derivation. Those are about cost and uniqueness per user, not about output sensitivity.',
      'The article argues that a hash cannot be reversed. Being irreversible and being sensitive are separate properties, and only the second is shown.',
    ],

    contrastWith: [
      {
        concept: 'hashTableChaining',
        note: 'Both feed an input through a hash, but a hash table cares where keys land among a few slots while this cares how violently the output changes.',
      },
      {
        concept: 'asymmetricRsa',
        note: 'Both are one-way in feel, but RSA is hard to reverse because factoring is expensive, whereas this is about the output carrying no trace of input similarity.',
      },
    ],
  },
};
