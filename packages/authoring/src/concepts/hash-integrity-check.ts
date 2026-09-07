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
      'Comparing the hash of a received file against a hash the original publisher announced tells you whether the copy was altered in transit.',
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
      'A published hash sits alone at the top, separated by a rule, so it reads as the reference rather than as one more row.',
      'An untouched copy is hashed and its value matches the reference exactly, marked with a check.',
      'An altered copy is hashed next and its value bears no resemblance, marked with a cross.',
      'Only then is the single changed character highlighted, so the cause is shown after the effect rather than before it.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops. A single Replay button is the only control.',
        'The two payloads differ by one digit (Pay 100 / Pay 900), which makes the intent of the alteration legible without explanation.',
      ],
    },

    avoidWhen: [
      'The article is about why the hash changes so completely. That property has its own screen; this one uses it rather than explaining it.',
      'The subject is digital signatures or certificates. Those establish who vouched for the hash, which nothing here shows.',
      'The point is error detection in transmission — CRC, parity. Those are about accidental corruption, not about an adversary.',
      'The article needs the trust model spelled out. This screen states the assumption in a footnote but does not demonstrate what happens when the hash itself is swapped.',
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
