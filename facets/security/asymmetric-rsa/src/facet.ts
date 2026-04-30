/**
 * RSA facet JSON 선언.
 *
 * 진행 모델: 시간 진행형 (mount 직후 (A) 키 생성 → (B) 암호화 → (C) 복호화
 * 가 한 호흡 자동 재생). ReactiveMechanism 위에 auto-demo loop 패턴.
 *
 * 컨트롤바 어휘 (기획 §6 §8 의 컨트롤을 현재 시스템에 맞춰 매핑):
 *   [ next-p ]  [ next-q ]  [ 평문 m value-input ]
 *   [ replay ]  [ speed ]  [ toggle-reverse ]  [ reset ]
 *
 * 슬라이더는 후보가 7개로 제한된 학습용 이산 집합이라 next-p / next-q 버튼으로
 * 후보를 순환한다 (control-bar 위젯 어휘 — button / value-input / speed-slider
 * 만 지원). 거꾸로 시도 토글은 button 으로 표현하고 라벨이 ON/OFF 를 반영한다.
 *
 * 식별자 (C1): `prime:` `product:` `lock:` `key:` `envelope:` `plaintext:`
 *              `factor:` 명시 prefix.
 */

import type { FacetJson } from '@facet/core/runtime';

export const asymmetricRsaFacet: FacetJson = {
  id: 'facet:asymmetricRsa',
  title: { en: 'RSA — Public-Key Cryptography', ko: 'RSA — 공개키 암호' },
  description: {
    en: 'A pair of asymmetric keys born from two primes — one locks, the other unlocks, and the same lock cannot be undone',
    ko: '두 소수에서 태어난 한 짝의 비대칭 키 — 한쪽으로만 잠기고 다른 쪽으로만 풀리며 잠근 쪽으로는 결코 되돌릴 수 없다',
  },
  algorithm: 'module:asymmetricRsa',
  projector: 'module:asymmetricRsaProjector',
  initialData: {
    type: 'asymmetric-rsa',
    primes: [5, 7, 11, 13, 17, 19, 23],
    initialPIndex: 0,
    initialQIndex: 2, // 11
    initialPlaintext: 2,
    initialReverseAttempt: false,
    timings: {
      keyGenStepMs: 600,
      lockMs: 500,
      channelMs: 700,
      unlockMs: 500,
      reverseMs: 400,
      interStageMs: 220,
      factoringBlockMs: 480,
      endHoldMs: 1100,
    },
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'rsa-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'next-p', label: { en: 'Next p', ko: '다음 p' } },
        { widget: 'button', action: 'next-q', label: { en: 'Next q', ko: '다음 q' } },
        {
          widget: 'value-input',
          action: 'input',
          name: 'm',
          label: { en: 'Plaintext m', ko: '평문 m' },
          placeholder: '2',
          default: '2',
        },
        { widget: 'button', action: 'replay', label: { en: 'Replay', ko: '재생' } },
        { widget: 'speed-slider', action: 'speed', default: 1, steps: [0.5, 1, 2] },
        {
          widget: 'button',
          action: 'toggle-reverse',
          label: { en: 'Reverse attempt', ko: '거꾸로 시도' },
        },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
    },
  },
};
