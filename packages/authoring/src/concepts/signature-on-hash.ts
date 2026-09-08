/**
 * signatureOnHash 개념 선언.
 *
 * canonical facet 은 `facet:signatureOnHash` — 한 주장을 말하는 조각(piece) facet.
 *
 * 출처는 디지털 서명이지만 해시를 재료로 쓴다 — 조각의 출처와 소속이 갈리는
 * 첫 사례다. 해시 글에도 서명 글에도, 패키지 배포나 코드 서명 글에도 등장한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const signatureOnHashConcept: FacetConceptSource = {
  id: 'signatureOnHash',
  label: 'Signing the Digest, Not the Document',
  domain: 'security',
  canonicalFacet: 'facet:signatureOnHash',

  surface: {
    definition:
      'A digital signature is computed over the fixed-size digest of a document rather than the document itself, so the signature size and the signing cost do not grow with the file.',
    exemplarKeywords: [
      'sign the hash',
      'signature size',
      'why hash before signing',
      'digest signing',
      'RSA cannot sign large data',
      'Ed25519 signature 64 bytes',
      'code signing',
      'signature independent of file size',
    ],
  },

  briefing: {
    observable: [
      'A document bar runs the full width of the frame and is cut off at the edge, so "any size at all" is shown rather than claimed.',
      'It folds down into a digest bar that is barely a mark, then into a signature bar only slightly larger.',
      'The byte figures sit beside each bar: 3.7 MB, 32 B, 64 B.',
      'A footnote admits the two small bars were given a minimum width because at true scale they would be invisible, and adds that RSA cannot sign anything larger than its key at all.',
    ],

    screen: {
      affordances: [
        'The screen plays four steps on its own and stops. Two buttons: Replay, and Step for walking the four moments one at a time. Neither is needed for the screen to finish what it has to say.',
        'The bars are drawn to scale apart from the stated minimum, so the proportion carries the argument.',
      ],
    },

    useWhen: [
      'The article says a signature is a fixed size regardless of the document. That only makes sense once the reader sees the digest standing in for the document.',
      'The reader wonders why a document is not signed directly, and the answer is a size and cost that no longer depends on the document.',
    ],


    avoidWhen: [
      'The article is about which key signs and which verifies. That is direction, and it has its own screen.',
      'The subject is hash output length in general. This screen assumes fixed-length digests rather than demonstrating them.',
      'The point is a specific padding scheme — PSS, PKCS#1 v1.5. Nothing here opens what happens inside the signing step.',
      'The article argues a signature proves identity. Binding a key to a person is certificates, not this.',
    ],

    contrastWith: [
      {
        concept: 'hashFixedLength',
        note: 'That screen shows the digest length never grows; this one is why that fact makes signing practical at all.',
      },
      {
        concept: 'signatureKeyDirection',
        note: 'Both are about signing, but one is about which key stands where and this one about what the key is applied to.',
      },
    ],
  },
};
