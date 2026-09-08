/**
 * hashFixedLength 개념 선언.
 *
 * canonical facet 은 `facet:hashFixedLength` — 한 주장을 말하는 조각(piece) facet.
 * 조각은 누구의 하위도 아니므로 `aspects` 를 쓰지 않고 canonicalFacet 은 자기 자신이다.
 *
 * 출처는 해시다. 다만 소속은 하나가 아니다 — 지문·식별자 설계, 중복 제거,
 * 저장 스키마 설계 같은 글에서도 같은 사실이 쓰인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashFixedLengthConcept: FacetConceptSource = {
  id: 'hashFixedLength',
  label: 'Fixed-Length Hash Output',
  domain: 'security',
  canonicalFacet: 'facet:hashFixedLength',

  surface: {
    definition:
      'A hash function maps inputs of any length onto a digest of one fixed length, so an empty string and a multi-megabyte file both produce the same number of bits.',
    exemplarKeywords: [
      'fixed length output',
      'digest size',
      'SHA-256 is 256 bits',
      '64 hex characters',
      'any input length',
      'hash of a file',
      'why hashes are all the same size',
      'fingerprint size',
    ],
  },

  briefing: {
    observable: [
      'Four inputs are laid out with visibly different lengths, from an empty one to a line that runs off the edge of the frame.',
      'The byte count next to each input makes the spread explicit: 0, 1, 11, 92.',
      'Each input then gets a digest box, and the four boxes are identical in width.',
      'Dashed guides drop down the left and right edges of the boxes, showing that all four start and end at the same place.',
      'A footnote states that an empty input still has a digest and that a 3.7 MB file yields the same 64 characters.',
    ],

    screen: {
      affordances: [
        'The screen plays three steps on its own and stops, so it says what it has to say without asking for a click.',
        'Two buttons: Replay, and Step for walking the four moments one at a time. Neither is needed for the screen to finish what it has to say.',
        'All four digests are real SHA-256 values, so the hex shown can be quoted or verified.',
      ],
    },

    useWhen: [
      'The reader has just met hashing and assumes a bigger input means a bigger digest. Feeding wildly different sizes into the same-width output settles that immediately.',
      'The prose is about to argue something that depends on the output being bounded — storage cost, signature size, index width — and that premise needs to be visible first.',
    ],


    avoidWhen: [
      'The article is about compression. A hash is the same size going out but cannot be unpacked, and treating it as compression is exactly the misreading to avoid.',
      'The point is that a hash cannot be reversed. Losing length is related but this screen never shows the one-way direction itself.',
      'The subject is how sensitive the output is to input changes. That is a different property with its own screen.',
      'The article needs the internal construction — padding, block size, Merkle-Damgard. Nothing here opens the function.',
    ],

    contrastWith: [
      {
        concept: 'pigeonholeCollision',
        note: 'This shows the output length never grows; that one counts what follows from it, namely that two inputs must eventually share a value.',
      },
      {
        concept: 'hashAvalanche',
        note: 'Both look at the digest, but one is about its size staying constant and the other about its contents changing violently.',
      },
    ],
  },
};
