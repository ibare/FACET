/**
 * signatureKeyDirection 개념 선언.
 *
 * canonical facet 은 `facet:signatureKeyDirection` — 한 주장을 말하는 조각(piece) facet.
 * 출처는 디지털 서명이다. 소속은 하나가 아니다 — 공개키 암호 입문, TLS, 인증서,
 * 코드 서명 글에서도 같은 역전이 쓰인다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const signatureKeyDirectionConcept: FacetConceptSource = {
  id: 'signatureKeyDirection',
  label: 'Encryption vs Signing: Key Roles Reverse',
  domain: 'security',
  canonicalFacet: 'facet:signatureKeyDirection',

  surface: {
    definition:
      'Encryption and signing use the same key pair in opposite directions: the public key seals and the private key opens when encrypting, while the private key produces and the public key checks when signing.',
    exemplarKeywords: [
      'sign vs encrypt',
      'private key signs',
      'public key verifies',
      'key roles reversed',
      'what is a digital signature',
      'why anyone can verify',
      'asymmetric key direction',
      'non-repudiation',
    ],
  },

  briefing: {
    observable: [
      'Two flows sit one above the other with their columns aligned, so the key boxes line up vertically and the swap is visible as position rather than as an explanation.',
      'The encrypting row reads anyone → public key → sealed → the owner; the signing row reads the owner → private key → signature → anyone.',
      'Dashed lines then cross between the two key boxes, marking the exchange directly.',
      'Finally the words "the owner" light up in both rows — at the end in one, at the start in the other, which is the point the flows were arranged to make.',
      'The padlock and key wording matches the RSA screen, so a reader moving between the two is not asked to relearn the vocabulary.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops. A single Replay button is the only control.',
        'Nothing is computed and no values appear — this screen is about arrangement, not about numbers.',
      ],
    },

    avoidWhen: [
      'The article explains how RSA produces a key pair from two primes. That construction has its own screen; this one takes the pair as given.',
      'The subject is what gets signed and why it is small. That is the digest question and a separate screen.',
      'The point is certificate chains or PKI. Those are about who vouches for a public key, which nothing here shows.',
      'The article states that signing is encrypting with the private key. Modern signature schemes are not that, and this screen deliberately shows direction rather than an inverted cipher.',
    ],

    contrastWith: [
      {
        concept: 'asymmetricRsa',
        note: 'That screen shows one direction in depth — how the pair is born and why the road back is closed; this one puts both directions side by side.',
      },
      {
        concept: 'signatureOnHash',
        note: 'Both are about signing, but one is about which key stands where and the other about what the key is applied to.',
      },
    ],
  },
};
