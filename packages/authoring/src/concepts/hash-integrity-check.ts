/**
 * hashIntegrityCheck 개념 선언.
 *
 * canonical facet 은 `facet:hashIntegrityCheck` — 한 주장을 말하는 조각(piece) facet.
 * 출처는 해시지만 소속은 하나가 아니다 — 파일 배포, 패키지 검증, 백업 확인,
 * 디지털 서명 글에서도 같은 대조가 쓰인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashIntegrityCheckConcept: FacetConceptSource = {
  id: 'hashIntegrityCheck',
  label: 'Verifying a File With Its Hash',
  domain: 'security',
  canonicalFacet: 'facet:hashIntegrityCheck',

  surface: {
    definition:
      'A file and its hash travel by separate routes, so whoever alters the file in transit cannot alter the hash to match, and the mismatch reveals the change.',
    exemplarKeywords: [
      'checksum',
      'verify download',
      'file integrity',
      'sha256sum',
      'hash comparison',
      'detect tampering',
      'published hash',
      'corrupted file',
    ],
  },

  briefing: {
    observable: [
      'Two routes fan out from the origin: the file above on a dashed line marked "any route", the hash below on a solid line marked "a route you trust".',
      'Both cross the frame as tokens and meet at the receiving end, where the two digests agree.',
      'The file is sent again and is edited halfway across — the cut happens mid-route, so it reads as interception rather than as a change made after arrival.',
      'The lower route does nothing at all during that, and its stillness is the argument: the attacker could not reach it.',
      'The two digests then disagree at the receiving end.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops. Two buttons: Replay, and Step for walking the four moments one at a time. Neither is needed for the screen to finish what it has to say.',
        'The two payloads differ by one digit (Pay 100 / Pay 900), which makes the intent of the alteration legible without explanation.',
      'A footnote states what breaks the whole thing: if both came down the same route, the hash could have been swapped too.',
      ],
    },

    useWhen: [
      'The article tells the reader to verify a download and the reader does not see what verifying protects against. The two separate routes are the answer.',
      'The prose needs to establish that publishing the hash on the same channel as the file protects nothing.',
    ],


    avoidWhen: [
      'The article is about why the hash changes so completely. That property has its own screen; this one uses it rather than explaining it.',
      'The subject is digital signatures or certificates. Those establish who vouched for the hash, which nothing here shows.',
      'The point is error detection in transmission — CRC, parity. Those are about accidental corruption, not about an adversary.',
      'The article needs the case where the hash itself is swapped. This screen shows why separate routes matter but never plays out an attack on the trusted route.',
    ],

    contrastWith: [
      {
        concept: 'hashAvalanche',
        note: 'That one shows why a single edit destroys the digest; this one puts that fact to work as a check.',
      },
      {
        concept: 'asymmetricRsa',
        note: 'Both are about trusting something you received, but a hash only tells you it changed, never who sent it.',
      },
    ],
  },
};
