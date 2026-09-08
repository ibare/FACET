/**
 * hashSalt 개념 선언.
 *
 * canonical facet 은 `facet:hashSalt` — 한 주장을 말하는 조각(piece) facet.
 * 출처는 해시지만 소속은 하나가 아니다 — 인증 설계, 저장소 스키마, 침해 사고
 * 대응 글에서도 같은 장치가 쓰인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hashSaltConcept: FacetConceptSource = {
  id: 'hashSalt',
  label: 'Salting Stored Passwords',
  domain: 'security',
  canonicalFacet: 'facet:hashSalt',

  surface: {
    definition:
      'A per-account random value prepended before hashing makes two identical passwords store two unrelated values, so one cracked account does not reveal the others.',
    exemplarKeywords: [
      'password salt',
      'salting',
      'rainbow table',
      'password storage',
      'why salt passwords',
      'per-user salt',
      'identical passwords',
      'credential database',
    ],
  },

  briefing: {
    observable: [
      'Two accounts are shown with the same password spelled out in both rows, so the coincidence is visible rather than asserted.',
      'Hashed without a salt, both rows store the exact same value and the column is marked identical — the problem is shown before the fix.',
      'The salt column then appears, outlined, with a different value per account.',
      'The stored column recomputes in place and the two values diverge, so the change happens in the same spot the reader was already looking.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops. Two buttons: Replay, and Step for walking the four moments one at a time. Neither is needed for the screen to finish what it has to say.',
        'A footnote states that the salt is stored in the clear, which is the point most readers get wrong.',
      ],
    },

    useWhen: [
      'The article explains why a leaked password database is not equally bad for every account. Two identical passwords storing two unrelated values is the reason.',
      'The reader needs to see what a precomputed table cannot do once a per-account value is in the way.',
    ],


    avoidWhen: [
      'The article is about how expensive it should be to test one password guess. That is work factor — bcrypt, scrypt, Argon2 — and salting does nothing for it.',
      'The subject is encryption of a password rather than hashing. Storing something you can decrypt is a different design with different failure modes.',
      'The point is peppering or an HMAC key held outside the database. Those are secrets; the salt shown here deliberately is not.',
      'The article is about hash sensitivity in general. That the output changes completely is assumed here, not demonstrated.',
    ],

    contrastWith: [
      {
        concept: 'hashAvalanche',
        note: 'Both end with two unrelated digests, but there the inputs differed by accident and here they were made to differ on purpose.',
      },
      {
        concept: 'hashIntegrityCheck',
        note: 'Both compare stored digests, but one wants a match and the other wants every stored value to be unique.',
      },
    ],
  },
};
