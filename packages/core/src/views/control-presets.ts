/**
 * 컨트롤 선언 프리셋.
 *
 * `FacetJson.blocks.controls` 는 저작 선언이므로 facet 이 자기 컨트롤을 직접
 * 적는 것이 원칙이다 (원칙 2). 다만 같은 컨트롤이 여러 facet 에 반복되면 문안이
 * 갈라진다 — 실제로 `reset` 은 29곳에 쓰이는데 라벨이 세 갈래로 어긋나 있었다
 * ("Reset" 11 · "↺ Reset" 4 · "Replay" 9).
 *
 * 그래서 반복되는 것만 여기 모은다. facet 은 그대로 가져다 쓰거나, 다르게
 * 하고 싶으면 펼쳐서 덮어쓴다.
 *
 * ```ts
 * controls: [CONTROL.replay, CONTROL.advance]
 * controls: [{ ...CONTROL.reset, label: { en: 'Clear', ko: '비우기' } }]
 * ```
 *
 * 여기 없는 것 — `insert` · `push` · `toggle-pk` 처럼 한두 facet 에만 있는
 * 어휘 — 은 그 facet 이 직접 적는다. 프리셋은 반복을 없애는 장치이지 어휘를
 * 통제하는 장치가 아니다.
 *
 * 문안이 코드에 있는 것은 C10 의 예외가 아니라 그 규약대로다. 이것은 특정
 * facet 의 문안이 아니라 **프레임워크 공통 문안**이며, facet 이 자기 화면에서
 * 달리 부르고 싶으면 `messages` 의 `view.controlBar.*` 키로 덮어쓸 수 있다.
 */

import type { ControlSpec } from '../types/facet-json.js';

/**
 * 자주 쓰이는 컨트롤 선언.
 *
 * `as const` 로 얼려 두지 않는다 — facet 이 스프레드로 펼쳐 덮어쓸 수 있어야
 * 하고, `ControlSpec` 이 이미 열린 타입이라 얼려도 얻을 것이 없다.
 */
export const CONTROL: Record<string, ControlSpec> = {
  /** 처음 상태로 되돌린다. 완결형 facet 의 표준 컨트롤. */
  reset: {
    widget: 'button',
    action: 'reset',
    label: {
      en: 'Reset',
      ko: '초기화',
      ja: 'リセット',
      zh: '重置',
      ar: 'إعادة',
      es: 'Reiniciar',
      fr: 'Réinit.',
      hi: 'रीसेट',
      id: 'Atur ulang',
      pt: 'Reiniciar',
    },
  },

  /**
   * 처음부터 다시 재생한다.
   *
   * 액션은 `reset` 과 같다 — `ReactiveMechanism.reset()` 이 끝에
   * `ensureStarted()` 를 부르므로 되돌리는 일이 곧 다시 재생하는 일이다.
   * 조각(piece) facet 처럼 되돌림이 재생으로 읽히는 화면이 이것을 쓴다.
   */
  replay: {
    widget: 'button',
    action: 'reset',
    label: {
      en: 'Replay',
      ko: '다시 보기',
      ja: '再生',
      zh: '重播',
      ar: 'إعادة العرض',
      es: 'Repetir',
      fr: 'Rejouer',
      hi: 'फिर देखें',
      id: 'Putar ulang',
      pt: 'Repetir',
    },
  },

  /**
   * 한 걸음 나아간다.
   *
   * coroutine 의 표준 `step` 과 다르다 — 이쪽은 facet 고유 어휘라
   * `ReactiveMechanism` 이 `dispatch` 로 라우팅하고, algorithm 이
   * `waitForInput` 으로 받아 스스로 한 걸음을 발신한다.
   */
  advance: {
    widget: 'button',
    action: 'advance',
    label: {
      en: 'Step',
      ko: '한 걸음',
      ja: '一歩',
      zh: '单步',
      ar: 'خطوة',
      es: 'Paso',
      fr: 'Pas',
      hi: 'एक कदम',
      id: 'Selangkah',
      pt: 'Passo',
    },
  },

  /** 자동 시연을 다시 돌린다. */
  autoDemo: {
    widget: 'button',
    action: 'auto-demo',
    label: {
      en: 'Auto demo',
      ko: '자동 시연',
      ja: '自動デモ',
      zh: '自动演示',
      ar: 'عرض تلقائي',
      es: 'Demo automática',
      fr: 'Démo auto',
      hi: 'स्वतः डेमो',
      id: 'Demo otomatis',
      pt: 'Demo automática',
    },
  },

  /** 재생 속도. coroutine facet 의 표준 컨트롤. */
  speed: {
    widget: 'speed-slider',
    action: 'speed',
    label: {
      en: 'Speed',
      ko: '속도',
      ja: '速度',
      zh: '速度',
      ar: 'السرعة',
      es: 'Velocidad',
      fr: 'Vitesse',
      hi: 'गति',
      id: 'Kecepatan',
      pt: 'Velocidade',
    },
  },
};
