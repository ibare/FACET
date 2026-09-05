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

import type { FacetJson } from '@ffacet/core/runtime';

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
  messages: {
    'caption.aliceEnvelope': { en: 'Alice put the plaintext m into an envelope.', ko: 'Alice 가 평문 m 을 봉투에 넣었다.' },
    'caption.aliceLocks': { en: 'Alice sealed the envelope with the public padlock.', ko: 'Alice 가 평문을 봉투에 넣고 공개 자물쇠로 잠갔다.' },
    'caption.base': { en: 'RSA locks and unlocks a message with a pair of keys born from two large primes. The public padlock anyone holds can only lock, and only the private key its owner keeps can open it.', ko: 'RSA 는 두 큰 소수에서 태어난 한 짝의 키로 메시지를 잠그고 푼다. 누구나 가진 공개 자물쇠로는 잠그기만 할 수 있고, 주인만 가진 비밀 열쇠로만 풀 수 있다.' },
    'caption.bobUnlocks': { en: 'Bob\'s private key opened the envelope and the plaintext came back.', ko: 'Bob 의 비밀 열쇠가 봉투를 열고 평문이 돌아왔다.' },
    'caption.cycleDone': { en: 'One full breath — the traces of lock, channel and unlock all stay on the same screen.', ko: '한 호흡 완료 — 같은 화면에 잠금 / 채널 / 풀림 잔상이 함께 남는다.' },
    'caption.delivered': { en: 'The plaintext m arrived on Bob\'s desk.', ko: '평문 m 이 Bob 의 책상에 도착했다.' },
    'caption.factoringFails': { en: 'The published n alone does not lead back to the two primes.', ko: '공개된 n 만으로는 두 소수에 닿지 못한다.' },
    'caption.ignoredInput': { en: 'Input ignored — {op}: {raw}', ko: '입력 무시 — {op}: {raw}' },
    'caption.keypair': { en: 'A padlock and a key were born as a pair on top of n.', ko: 'n 위에 자물쇠와 열쇠 한 짝이 태어났다.' },
    'caption.modulus': { en: 'The two primes multiplied and produced the composite n.', ko: '두 소수가 곱해져 합성수 n 을 낳았다.' },
    'caption.plaintextChanged': { en: 'Plaintext updated to m = {m} — rolling the sequence again.', ko: '평문 m = {m} 으로 갱신 — 시퀀스를 다시 굴린다.' },
    'caption.primeChanged': { en: 'Prime {which} changed — the key pair is born again.', ko: '소수 {which} 변경 — 키 짝이 다시 태어난다.' },
    'caption.primesSeated': { en: 'The two primes p and q took their seats.', ko: '두 소수 p, q 가 자리에 앉았다.' },
    'caption.publish': { en: 'A copy of the padlock crossed the channel out to everyone.', ko: '자물쇠 한 벌이 채널을 건너 모두에게 사본되었다.' },
    'caption.reverseOff': { en: 'Reverse attempt OFF — the normal flow.', ko: '거꾸로 시도 OFF — 정상 흐름.' },
    'caption.reverseOn': { en: 'Reverse attempt ON — the refusal demo steps in.', ko: '거꾸로 시도 ON — 거부 시연이 끼어든다.' },
    'caption.transit': { en: 'The locked envelope crosses the channel — the plaintext inside stays hidden.', ko: '잠긴 봉투가 채널을 건넌다 — 안의 평문은 보이지 않는다.' },
    'caption.wrongKey': { en: 'The same padlock will not open it — the asymmetry is the wall.', ko: '같은 자물쇠로는 풀리지 않는다 — 비대칭의 벽.' },
    'concept.line1': { en: 'RSA locks and unlocks a message with a pair of keys', ko: 'RSA 는 두 큰 소수에서 태어난 한 짝의 키로' },
    'concept.line2': { en: 'born from two large primes. The public padlock anyone', ko: '메시지를 잠그고 푼다. 누구나 가진 공개 자물' },
    'concept.line3': { en: 'holds can only lock, and only the private key its', ko: '쇠로는 잠그기만 할 수 있고, 주인만 가진' },
    'concept.line4': { en: 'owner keeps can open it again.', ko: '비밀 열쇠로만 풀 수 있다.' },
    'label.alice': { en: 'Alice (sender)', ko: 'Alice (보내는 사람)' },
    'label.bobRoom': { en: 'Bob — private room', ko: 'Bob — 비밀 방' },
    'label.bobYard': { en: 'Bob — public yard', ko: 'Bob — 공개 마당' },
    'label.channel': { en: 'channel (open path)', ko: '채널 (공개 통로)' },
    'label.factoringHard': { en: 'the road back to p and q is effectively closed', ko: 'p, q 로의 길은 사실상 막혀 있다' },
    'label.keyPrivate': { en: 'key (private)', ko: '열쇠 (비밀)' },
    'label.keygenSeq': { en: 'key generation sequence', ko: '키 생성 시퀀스' },
    'label.lock': { en: 'lock', ko: '잠금' },
    'label.multiplyEasy': { en: '× (cheap)', ko: '× (가벼움)' },
    'label.observerArea': { en: 'observer area — only the published n is visible', ko: '외부 관찰자 영역 — 공개된 n 만 보임' },
    'label.padlockCopy': { en: 'public padlock (copy)', ko: '공개 자물쇠 (사본)' },
    'label.padlockPlusN': { en: 'public padlock + n', ko: '공개 자물쇠 + n' },
    'label.padlockPublic': { en: 'padlock (public)', ko: '자물쇠 (공개)' },
    'label.plaintext': { en: 'plaintext m', ko: '평문 m' },
    'label.primeP': { en: 'p (prime)', ko: 'p (소수)' },
    'label.primeQ': { en: 'q (prime)', ko: 'q (소수)' },
    'label.privateKey': { en: 'private key', ko: '비밀 열쇠' },
    'label.recoveredM': { en: 'recovered m', ko: '복원된 m' },
    'label.reverseOff': { en: 'reverse attempt: OFF', ko: '거꾸로 시도: OFF' },
    'label.reverseOn': { en: 'reverse attempt: ON', ko: '거꾸로 시도: ON' },
    'label.title': { en: 'RSA — one pair of asymmetric keys', ko: 'RSA — 한 짝의 비대칭 키' },
    'label.unlock': { en: 'unlock', ko: '풀림' },
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
          placeholder: { en: '2', ko: '2' },
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
