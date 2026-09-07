/**
 * SignatureKeyDirection facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "암호화와 서명은 같은 키 한 쌍을 쓰는데 왜 방향이 반대인가?"
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주로 밝힘.
 *
 * 자물쇠·열쇠 어휘는 RSA facet 과 맞춘다 — 공개키는 자물쇠, 개인키는 열쇠.
 * 코드를 공유하지는 않지만 (facet 패키지끼리 import 금지) 어휘가 어긋나면 두
 * 화면을 이어 읽는 학습자가 다른 것으로 읽는다.
 *
 * 이 조각의 출처는 디지털 서명이다. 해시 조각들과 달리 계산할 값이 없어
 * initialData 가 stepMs 하나뿐이다 — 이 화면이 말하는 것은 값이 아니라 배치다.
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const signatureKeyDirectionFacet: FacetJson = {
  id: 'facet:signatureKeyDirection',
  title: { en: 'The Keys Swap Places', ko: '두 키의 자리가 바뀐다' },
  description: {
    en: 'Encrypting and signing use one key pair in opposite directions',
    ko: '암호화와 서명은 같은 키 한 쌍을 반대 방향으로 쓴다',
  },
  algorithm: 'module:signatureKeyDirection',
  projector: 'module:signatureKeyDirectionProjector',
  initialData: {
    type: 'signature-key-direction',
    stepMs: 1000,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.base': {
      en: 'The same key pair, used in opposite directions.',
      ko: '같은 키 한 쌍을, 반대 방향으로 쓴다.',
    },
    'caption.encryption': {
      en: 'Anyone can seal it; only the owner can open it.',
      ko: '누구나 잠글 수 있고, 주인만 열 수 있다.',
    },
    'caption.signature': {
      en: 'Only the owner can sign it; anyone can check it.',
      ko: '주인만 만들 수 있고, 누구나 확인할 수 있다.',
    },
    'caption.crossed': {
      en: 'The two keys have swapped places.',
      ko: '두 키의 자리가 서로 바뀌었다.',
    },
    'caption.who': {
      en: 'And so has the one person — at the end when encrypting, at the start when signing.',
      ko: '"그 한 사람" 의 자리도 바뀌었다 — 암호화에서는 끝에, 서명에서는 앞에 선다.',
    },
    'label.encryption': { en: 'encrypting', ko: '암호화' },
    'label.signature': { en: 'signing', ko: '서명' },
    'label.anyone': { en: 'anyone', ko: '누구나' },
    'label.ownerOnly': { en: 'the owner', ko: '주인만' },
    'label.publicKey': { en: '🔒 public key', ko: '🔒 공개키' },
    'label.privateKey': { en: '🔑 private key', ko: '🔑 개인키' },
    'label.sealed': { en: 'sealed message', ko: '봉인된 메시지' },
    'label.signed': { en: 'signature', ko: '서명' },
    'label.reads': { en: 'reads', ko: '읽는다' },
    'label.verifies': { en: 'verifies', ko: '확인한다' },
    'label.note': {
      en: 'Encryption narrows who can read; signing narrows who could have made it. The private key stands wherever the narrowing happens.',
      ko: '암호화는 읽을 수 있는 사람을 좁히고, 서명은 만들 수 있었던 사람을 좁힌다. 개인키는 좁히는 자리에 선다.',
    },
  },
  blocks: {
    stage: { type: 'key-direction-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'reset', label: { en: 'Replay', ko: '다시 보기' } },
      ],
    },
  },
};
