/**
 * asymmetricRsa 개념 선언.
 *
 * canonical facet 은 `facet:asymmetricRsa` — 키 생성 시퀀스 + Alice/Bob 영역 +
 * 채널 + 외부 관찰자 구역 + 거꾸로 시도 토글.
 *
 * reactive 다. 소수를 바꾸거나 평문을 바꾸면 시퀀스가 다시 돈다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const asymmetricRsaConcept: FacetConceptSource = {
  id: 'asymmetricRsa',
  label: 'RSA (Public-Key Cryptography)',
  domain: 'security',
  canonicalFacet: 'facet:asymmetricRsa',

  surface: {
    definition:
      'Encryption with a pair of mathematically linked keys, where the freely published one can only lock and the privately held one is required to unlock.',
    exemplarKeywords: [
      'RSA',
      'public key cryptography',
      'asymmetric encryption',
      'public and private key',
      'key pair',
      'prime factorization',
      'modulus n',
      'one-way function',
      'trapdoor',
      'why you can publish a lock',
    ],
  },

  briefing: {
    observable: [
      'The key pair is born on screen: two primes take their seats, multiply into the composite n, and only then do a padlock and a key appear as a pair on top of it.',
      'Multiplying the primes is shown as cheap while the road back to them is drawn as closed — the asymmetry lives in that gap, not in the keys themselves.',
      'A copy of the padlock crosses the channel out to everyone, so publishing is an event rather than an assumption.',
      'An observer area shows what an outsider actually sees: the published n and nothing more.',
      'Alice seals the envelope with the public padlock and it crosses the channel visibly locked — the plaintext inside is never shown in transit.',
      'Trying the same padlock to open it fails, and the refusal is animated. The wall is the asymmetry, and the reader watches it hold.',
      'Bob\'s private key opens the envelope and the plaintext returns to his desk, completing one full breath with the traces of lock, channel and unlock all still on screen.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet: Next p, Next q, a plaintext field, Replay, a reverse-attempt toggle and Reset, plus a speed slider.',
        'The reverse-attempt toggle is the point of the whole screen — turn it on and the refusal demo steps in, which is what makes "the same lock cannot be undone" something the reader watches rather than reads.',
        'Changing a prime rebuilds the key pair from scratch, which is the way to show that the keys are consequences of the primes rather than independent choices.',
      ],
    },

    useWhen: [
      'The reader keeps collapsing the two keys into "a password". Watching one key lock and the other one open — and neither do the other job — is what separates them.',
      'The article is about why a key can be published at all. That only lands when the published one visibly cannot open anything.',
    ],


    avoidWhen: [
      'The article is about digital signatures. Signing inverts the roles of the two keys, and this screen only shows the encryption direction.',
      'The subject is TLS or certificate chains. Those use this idea but are about establishing trust between parties, which nothing here represents.',
      'The point is a symmetric cipher (AES) or key exchange (Diffie-Hellman). The single-key and shared-secret models are exactly what this contrasts against.',
      'The article needs real key sizes or security margins. The primes here are small enough to display, which would mislead any argument about strength.',
    ],

    contrastWith: [
      {
        concept: 'hashTableChaining',
        note: 'Both compute a value from an input, but a hash function here spreads keys across slots while RSA depends on a computation being hard to reverse.',
      },
    ],
  },
};
