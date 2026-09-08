/**
 * SignatureOnHash facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "왜 문서 전체가 아니라 그 해시에 서명하는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 출처는 디지털 서명이지만 해시를 재료로 쓴다 — 조각의 출처와 소속이 갈리는
 * 첫 사례다. 소속으로 치면 해시 글에도 서명 글에도 등장할 수 있다.
 *
 * 각주가 밝히는 전제: 작은 두 막대는 실제 비율이면 보이지 않아 최소 폭을 주었다.
 * 그리고 RSA 는 애초에 키보다 큰 것을 직접 서명할 수 없다 — 크기 문제는 비용만이
 * 아니라 가능 여부의 문제이기도 하다.
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const signatureOnHashFacet: FacetJson = {
  id: 'facet:signatureOnHash',
  title: { en: 'Signing the Digest', ko: '다이제스트 서명' },
  description: {
    en: 'A signature stays 64 bytes however large the document it stands for',
    ko: '문서가 아무리 커도 서명은 64바이트에 머문다',
  },
  algorithm: 'module:signatureOnHash',
  projector: 'module:signatureOnHashProjector',
  initialData: {
    type: 'signature-on-hash',
    hashLabel: 'SHA-256',
    signatureLabel: 'Ed25519',
    documentBytes: 3700000,
    digestBytes: 32,
    signatureBytes: 64,
    // 접힘 운동(FOLD_MS)이 한 걸음 안에서 끝나야 한다.
    stepMs: 1100,
  },
  shuffleOnReset: false,
  messages: {
    'caption.document': {
      en: 'The document can be any size at all.',
      ko: '문서는 얼마든지 커질 수 있다.',
    },
    'caption.hashed': {
      en: 'Hashing folds it into 32 bytes.',
      ko: '해시가 그것을 32바이트로 접는다.',
    },
    'caption.signed': {
      en: 'The private key signs those 32 bytes.',
      ko: '개인키는 그 32바이트에 서명한다.',
    },
    'caption.compare': {
      en: 'The signature stays this size no matter how large the document grows.',
      ko: '문서가 아무리 커져도 서명은 이 크기에 머문다.',
    },
    'label.document': { en: 'document', ko: '문서' },
    'label.digest': { en: 'digest', ko: '해시' },
    'label.signature': { en: 'signature', ko: '서명' },
  },
  blocks: {
    stage: { type: 'sign-hash-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
