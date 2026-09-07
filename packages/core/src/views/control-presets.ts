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
 * 프리셋은 **구조만** 담고 문안은 담지 않는다. 라벨은 메시지 카탈로그
 * (`messages/*.json` 의 `view.controlBar.*`) 가 정본이고, facet 이 자기 화면에서
 * 달리 부르고 싶으면 `label` 을 직접 적거나 `messages` 로 그 키를 덮어쓴다 (C10).
 * 액션과 라벨이 갈려야 하는 경우 — `replay` 는 액션이 `reset` 이지만 "↻ Replay" 로
 * 불려야 한다 — 는 `labelKey` 로 키를 지정한다.
 */

import type { ControlSpec } from '../types/facet-json.js';

/**
 * 자주 쓰이는 컨트롤 선언.
 *
 * `as const` 로 얼려 두지 않는다 — facet 이 스프레드로 펼쳐 덮어쓸 수 있어야
 * 하고, `ControlSpec` 이 이미 열린 타입이라 얼려도 얻을 것이 없다.
 */
export const CONTROL: Record<string, ControlSpec> = {
  /** 재생. coroutine facet 의 표준 컨트롤. */
  play: { widget: 'button', action: 'play' },

  /** 한 단계씩. coroutine 의 표준 컨트롤이며 조각의 `advance` 와 다르다. */
  step: { widget: 'button', action: 'step' },

  /** 일시정지. coroutine facet 의 표준 컨트롤. */
  pause: { widget: 'button', action: 'pause' },

  /** 처음 상태로 되돌린다. 완결형 facet 의 표준 컨트롤. */
  reset: { widget: 'button', action: 'reset' },

  /**
   * 처음부터 다시 재생한다.
   *
   * 액션은 `reset` 과 같다 — `ReactiveMechanism.reset()` 이 끝에
   * `ensureStarted()` 를 부르므로 되돌리는 일이 곧 다시 재생하는 일이다.
   * 다만 화면에서는 "다시 보기" 로 불려야 하므로 라벨 키를 따로 지정한다.
   */
  replay: { widget: 'button', action: 'reset', labelKey: 'view.controlBar.replay' },

  /**
   * 한 걸음 나아간다.
   *
   * coroutine 의 표준 `step` 과 다르다 — 이쪽은 facet 고유 어휘라
   * `ReactiveMechanism` 이 `dispatch` 로 라우팅하고, algorithm 이
   * `waitForInput` 으로 받아 스스로 한 걸음을 발신한다.
   */
  advance: { widget: 'button', action: 'advance' },

  /** 자동 시연을 다시 돌린다. */
  autoDemo: { widget: 'button', action: 'auto-demo' },

  /** 재생 속도. coroutine facet 의 표준 컨트롤. */
  speed: { widget: 'speed-slider', action: 'speed' },

  // ── 자료구조 연산. 세 facet 이 글자 하나 다르지 않게 같은 말을 써 왔다.
  //    다르게 부르고 싶은 facet 은 label 로 덮는다.

  /** 값을 찾는다. */
  search: { widget: 'button', action: 'search' },

  /** 값을 넣는다. */
  insert: { widget: 'button', action: 'insert' },

  /** 값을 뺀다. */
  remove: { widget: 'button', action: 'remove' },
};

/**
 * 통째로 반복되는 컨트롤 묶음.
 *
 * 같은 다섯이 네 facet 에, 같은 둘이 조각 아홉에 그대로 반복됐다. 낱개 프리셋만
 * 두면 그 배열을 다시 열세 번 적게 되므로 묶음도 함께 둔다.
 *
 * 하나만 다르면 펼쳐서 고친다 — `[...CONTROL_SET.playback, CONTROL.autoDemo]`
 * 처럼 덧붙이거나, 배열을 직접 적어도 된다. 묶음은 흔한 경우를 짧게 쓰기 위한
 * 것이지 다른 조합을 막는 것이 아니다.
 *
 * runner 가 `controls` 를 읽어 새 배열로 옮기므로 (`runner.ts` 의 enrichedBlocks)
 * 여러 facet 이 같은 배열을 참조해도 서로 간섭하지 않는다.
 */
export const CONTROL_SET: Record<string, ControlSpec[]> = {
  /** coroutine facet 의 표준 재생 묶음. */
  playback: [
    CONTROL.play,
    CONTROL.step,
    CONTROL.pause,
    CONTROL.reset,
    { ...CONTROL.speed, default: 1 },
  ],

  /** 조각(piece) facet 의 표준 묶음 — 다시 보기와 한 걸음 (S-piece). */
  piece: [CONTROL.replay, CONTROL.advance],
};
