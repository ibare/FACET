/**
 * control-bar — 재생/단계/정지/리셋 + 속도 슬라이더 + 메트릭 배지 + facet 고유
 * 버튼·값 입력 (reactive 메커니즘용).
 *
 * config:
 *   {
 *     type: 'control-bar',
 *     controls: { widget, action, label?, ... }[],
 *     metrics?: { name, label, initial? }[],
 *   }
 *
 * 어휘:
 *   widget='button', action='play'|'step'|'pause'|'reset'  — 표준 컨트롤. 내부 핸들러 라우팅.
 *   widget='button', action=<facet 고유>                   — onAction(action, payload) 로 통과.
 *                                                            payload 는 같은 control-bar 안의
 *                                                            value-input 들의 현재 값 모음
 *                                                            ({ [name]: value }).
 *   widget='speed-slider', action='speed', default?=number, steps?=number[]
 *   widget='timeline', action='seek'                       — 스크럽 띠. 걸어간 자취를 펼쳐
 *                                                            놓고 임의 걸음으로 끈다. 러너의
 *                                                            Timeline 이 자취를 쥐고 onSeek /
 *                                                            setTimeline* 로 오간다.
 *   widget='value-input', name=<key>, action='input', label?, placeholder?=LocaleStr, default?=string
 *                                                          — 텍스트 입력 박스. 입력 변경 시
 *                                                            params.dispatch({ type: 'input',
 *                                                            payload: { name, value } }) 발신.
 *   widget='segmented-slider', action=<facet 고유>, name?=<key>, label?,
 *      segments=[{ value:number, label:LocaleStr, default?:boolean }]
 *                                                          — 가로 3구간 이상 이산 슬라이더.
 *                                                            구간 클릭 / ←→ 키로 선택.
 *                                                            선택 시 onAction(action,
 *                                                              { value, segmentIndex,
 *                                                                ...inputState }) 발신.
 *                                                            inputState[name] = String(value)
 *                                                            로 다른 button payload 에도 첨부.
 *
 * 외부 메서드:
 *   onPlay/onStep/onPause/onReset(cb)  — 표준 핸들러 등록 (러너가 wire-up)
 *   onAction(cb: (action, payload) => void) — facet 고유 button 통과 채널.
 *   onSpeedChange(cb)
 *   onSeek(cb: (step) => void) — 스크럽 띠 전용 통로. control-bar 액션 어휘와 섞지 않는다.
 *   setTimelineLength(n) / setTimelineCursor(n) / setTimelineSeekable(bool)
 *   updateMetric(name, value)
 *   setRunning(bool), setComplete(bool)
 *   resetMetrics()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import type { ControlSpec, MetricSpec } from '../types/facet-json.js';
import { resolveLocale, type LocaleStr } from '../types/locale.js';
import { makeTranslator, type Translate } from '../runtime/i18n.js';
import { getColors, type Palette, fontSizes, fonts, radii, space } from './design-tokens.js';

type ButtonId = 'play' | 'step' | 'pause' | 'reset';

function makeButton(id: string, label: string, colors: Palette): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `facet-control-bar__btn facet-control-bar__btn--${id}`;
  btn.dataset.controlId = id;
  btn.textContent = label;
  btn.style.padding = `${space.xs} ${space.md}`;
  btn.style.fontSize = fontSizes.sm;
  btn.style.fontFamily = fonts.body;
  btn.style.background = colors.bg;
  btn.style.color = colors.text;
  btn.style.border = `1px solid ${colors.border}`;
  btn.style.borderRadius = radii.sm;
  btn.style.cursor = 'pointer';
  // 라벨은 쪼개지지 않는다. flex 안에서 폭이 모자라면 글자가 한 자씩 세로로
  // 떨어지는데(한국어·중국어처럼 어디서나 끊기는 글에서 특히), 그러면 단추가
  // 세로로 길어져 컨트롤바가 통째로 무너진다.
  btn.style.whiteSpace = 'nowrap';
  btn.style.flexShrink = '0';
  const baseBg = colors.bg;
  const hoverBg = colors.bgSubtle;
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) btn.style.background = hoverBg;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = baseBg;
  });
  return btn;
}

/** 스크럽 띠의 바깥 손잡이. control-bar 가 쥐고 러너가 값을 흘린다. */
type TimelineWidget = {
  root: HTMLElement;
  /** 적어 둔 걸음 수. 첫 재생 동안 이것이 자라며 띠가 채워진다. */
  setLength(n: number): void;
  /** 화면이 실제로 선 걸음. 핸들이 아니라 화면 쪽이다. */
  setCursor(n: number): void;
  /** 자취가 닫혀 끌 수 있게 되었는가. */
  setSeekable(on: boolean): void;
};

/**
 * 스크럽 띠 — 걸음을 낱낱이 쪼갠 칸이 아니라 **이어진 하나의 띠**로 그린다.
 *
 * 조각은 걸음이 대여섯에서 스무 남짓이라, 칸으로 쪼개면 다섯 칸짜리 조각이
 * 큼직한 블록 다섯이 되어 길이마다 인상이 갈린다. 띠로 두면 길이 차이를 띠가
 * 흡수하고 걸음은 그 위의 옅은 눈금으로만 남는다.
 *
 * 손을 따라가는 것은 **핸들**이고, 화면은 그보다 늦게 온다. 둘 사이를 비워 두면
 * 화면이 굼뜬 것으로 읽히므로 그 간격을 **늘어난 띠**로 그린다 — 화면 쪽이 두껍고
 * 손 쪽으로 갈수록 얇아져, 당긴 만큼 늘어난 고무줄로 보인다. 실제로 그 사이는
 * 걸음의 애니메이션이 차례로 지나가는 구간이다.
 */
function makeTimeline(
  colors: Palette,
  label: string,
  onSeek: (step: number) => void,
): TimelineWidget {
  const TRACK_H = 9;
  /**
   * 손잡이 지름.
   *
   * 처음에 13 이었는데 눈에 띄지도 잡히지도 않았다. 끄는 것이 이 위젯의 전부이므로
   * 손잡이는 손가락이 닿는 크기여야 한다 — 권장 터치 대상(44) 에 가깝게 둔다.
   */
  const HANDLE_D = 38;

  const root = document.createElement('div');
  root.className = 'facet-control-bar__timeline';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.gap = space.sm;
  root.style.flex = '1 1 180px';
  root.style.minWidth = '120px';

  const readout = document.createElement('span');
  readout.style.fontSize = fontSizes.xs;
  readout.style.fontFamily = fonts.mono;
  readout.style.color = colors.textMuted;
  readout.style.whiteSpace = 'nowrap';
  readout.style.flexShrink = '0';
  readout.style.minWidth = '46px';
  readout.style.textAlign = 'right';

  const track = document.createElement('div');
  track.style.position = 'relative';
  track.style.flex = '1 1 auto';
  track.style.height = `${HANDLE_D + 6}px`;
  track.style.cursor = 'default';
  track.style.touchAction = 'none';
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-label', label);

  /**
   * 손잡이가 오가는 자리.
   *
   * 손잡이는 제 중심이 위치를 가리키므로, 양 끝에서 반지름만큼 밖으로 나간다.
   * 그만큼 안쪽으로 들인 레일을 두고 그 안에서 셈하면 끝에서도 온전히 담긴다 —
   * 손잡이를 키우고 나서야 드러난 어긋남이다.
   */
  const rail = document.createElement('div');
  rail.style.position = 'absolute';
  rail.style.left = `${HANDLE_D / 2}px`;
  rail.style.right = `${HANDLE_D / 2}px`;
  rail.style.top = '0';
  rail.style.bottom = '0';

  /** 바탕 홈. */
  const groove = document.createElement('div');
  groove.style.position = 'absolute';
  groove.style.left = '0';
  groove.style.right = '0';
  groove.style.top = '50%';
  groove.style.height = `${TRACK_H}px`;
  groove.style.marginTop = `${-TRACK_H / 2}px`;
  groove.style.borderRadius = `${TRACK_H}px`;
  groove.style.background = colors.border;

  /** 걸음 눈금. 띠 위에 바탕색으로 얇게 새겨 칸을 세지 않고도 길이를 느끼게 한다. */
  const ticks = document.createElement('div');
  ticks.style.position = 'absolute';
  ticks.style.inset = '0';
  ticks.style.borderRadius = `${TRACK_H}px`;
  ticks.style.opacity = '0.5';
  groove.appendChild(ticks);

  /**
   * 화면이 지나온 구간.
   *
   * 첫 재생 동안에는 이 띠가 자라며 걸음을 모은다. 자라는 것만으로는 "무언가 모으는
   * 중" 이 잘 읽히지 않아 신호를 둘 얹는다 — **끝을 흐리게 번지게** 해서 그 자리가
   * 끝이 아님을 말하고, 아주 옅게 **맥동**시켜 살아 있음을 말한다.
   *
   * 둘 다 절제해야 한다. 조각은 글에 여럿 박히고, 그 띠들이 저마다 요란하면 읽는
   * 흐름을 방해한다 (S-piece). 그래서 흐림은 끝 16px 뿐이고 맥동은 opacity 0.72
   * 까지만 내려간다.
   */
  const filled = document.createElement('div');
  filled.style.position = 'absolute';
  filled.style.left = '0';
  filled.style.top = '50%';
  filled.style.height = `${TRACK_H}px`;
  filled.style.marginTop = `${-TRACK_H / 2}px`;
  filled.style.borderRadius = `${TRACK_H}px`;
  filled.style.background = colors.primary;
  filled.style.width = '0%';
  filled.style.transition = 'width 200ms cubic-bezier(0.22, 1, 0.36, 1)';

  /** 화면과 손 사이 — 당긴 만큼 늘어나는 구간. */
  const stretch = document.createElement('div');
  stretch.style.position = 'absolute';
  stretch.style.top = '50%';
  stretch.style.height = `${TRACK_H}px`;
  stretch.style.marginTop = `${-TRACK_H / 2}px`;
  stretch.style.background = colors.textMuted;
  stretch.style.width = '0%';
  stretch.style.left = '0%';
  stretch.style.opacity = '0';
  // 채움과 **같은 곡선으로** 움직여야 한다. 채움에만 전환을 걸고 늘어남은 논리
  // 위치에 곧바로 그리면, 채움이 아직 따라오는 동안 둘 사이가 벌어져 띠가
  // 끊겨 보인다 — 늘어난 고무줄이 아니라 끊어진 고무줄이 된다.
  stretch.style.transition =
    'left 200ms cubic-bezier(0.22, 1, 0.36, 1), width 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms linear';

  const handle = document.createElement('div');
  handle.style.position = 'absolute';
  handle.style.top = '50%';
  handle.style.width = `${HANDLE_D}px`;
  handle.style.height = `${HANDLE_D}px`;
  handle.style.marginTop = `${-HANDLE_D / 2}px`;
  handle.style.marginLeft = `${-HANDLE_D / 2}px`;
  handle.style.borderRadius = '50%';
  handle.style.background = colors.bg;
  handle.style.border = `2px solid ${colors.primary}`;
  handle.style.boxSizing = 'border-box';
  handle.style.left = '0%';
  handle.style.opacity = '0';
  handle.style.transition = 'left 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms linear';

  rail.append(groove, stretch, filled, handle);
  track.appendChild(rail);
  root.append(track, readout);

  let length = 0;
  let cursor = 0;
  let held = 0;
  let seekable = false;
  let dragging = false;
  /** 모으는 동안의 맥동. 다 모으면 거둔다. happy-dom 에는 `animate` 가 없다. */
  let breath: Animation | null = null;

  function startBreath(): void {
    if (breath || typeof filled.animate !== 'function') return;
    breath = filled.animate(
      [{ opacity: '1' }, { opacity: '0.72' }, { opacity: '1' }],
      { duration: 1600, iterations: Infinity, easing: 'ease-in-out' },
    );
  }

  function stopBreath(): void {
    breath?.cancel();
    breath = null;
    filled.style.opacity = '1';
  }

  function pct(step: number): number {
    return length === 0 ? 0 : (step / length) * 100;
  }

  function paint(): void {
    const c = pct(cursor);
    const h = pct(held);
    filled.style.width = `${c}%`;
    // 모으는 동안에는 끝이 번져 사라진다. 다 모으면 또렷한 끝이 선다.
    filled.style.maskImage = seekable
      ? 'none'
      : 'linear-gradient(to right, #000 0, #000 calc(100% - 16px), transparent 100%)';
    filled.style.webkitMaskImage = filled.style.maskImage;
    handle.style.left = `${h}%`;
    handle.style.opacity = seekable ? '1' : '0';

    const lo = Math.min(c, h);
    const hi = Math.max(c, h);
    const gap = hi - lo;
    stretch.style.left = `${lo}%`;
    stretch.style.width = `${gap}%`;
    stretch.style.opacity = gap > 0.5 ? '1' : '0';
    // 화면 쪽이 두껍고 손 쪽이 얇다. 어느 쪽으로 당겼는지에 따라 사다리꼴을 뒤집는다.
    stretch.style.clipPath =
      h >= c
        ? 'polygon(0 0, 100% 30%, 100% 70%, 0 100%)'
        : 'polygon(0 30%, 100% 0, 100% 100%, 0 70%)';

    readout.textContent = length === 0 ? '' : `${held} / ${length}`;
    track.setAttribute('aria-valuemax', String(length));
    track.setAttribute('aria-valuenow', String(held));
    track.style.cursor = seekable ? 'pointer' : 'default';
  }

  function paintTicks(): void {
    if (length <= 1) {
      ticks.style.background = 'none';
      return;
    }
    const step = 100 / length;
    ticks.style.background =
      `repeating-linear-gradient(to right, transparent 0, transparent calc(${step}% - 1px), ` +
      `${colors.bg} calc(${step}% - 1px), ${colors.bg} ${step}%)`;
  }

  /** 포인터 x 를 걸음으로. 띠 밖으로 나가도 양 끝에서 멈춘다. */
  function stepAt(clientX: number): number {
    const box = rail.getBoundingClientRect();
    if (box.width === 0) return held;
    const ratio = (clientX - box.left) / box.width;
    return Math.max(0, Math.min(length, Math.round(ratio * length)));
  }

  function moveTo(step: number, immediate: boolean): void {
    if (step === held) return;
    held = step;
    // 끄는 동안 핸들은 손을 곧바로 따라야 한다. 여기에 전환을 걸면 손보다 늦어
    // 늘어나는 것이 화면이 아니라 핸들로 보인다.
    handle.style.transition = immediate
      ? 'opacity 140ms linear'
      : 'left 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 140ms linear';
    paint();
    onSeek(step);
  }

  track.addEventListener('pointerdown', (ev) => {
    if (!seekable) return;
    dragging = true;
    track.setPointerCapture(ev.pointerId);
    moveTo(stepAt(ev.clientX), true);
  });
  track.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    moveTo(stepAt(ev.clientX), true);
  });
  const endDrag = (ev: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (track.hasPointerCapture(ev.pointerId)) track.releasePointerCapture(ev.pointerId);
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  track.addEventListener('keydown', (ev) => {
    if (!seekable) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') {
      ev.preventDefault();
      moveTo(Math.max(0, held - 1), false);
    } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      moveTo(Math.min(length, held + 1), false);
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      moveTo(0, false);
    } else if (ev.key === 'End') {
      ev.preventDefault();
      moveTo(length, false);
    }
  });

  paint();
  startBreath();

  return {
    root,
    setLength(n: number) {
      length = n;
      paintTicks();
      paint();
    },
    setCursor(n: number) {
      cursor = n;
      // 끌지 않는 동안에는 핸들이 화면을 따라간다 — 자동 재생 중 띠가 채워지는 것도
      // 되돌리기로 처음으로 튀는 것도 이 경로다.
      if (!dragging && !seekable) held = n;
      paint();
    },
    setSeekable(on: boolean) {
      if (seekable === on) return;
      seekable = on;
      if (on) {
        held = cursor;
        track.tabIndex = 0;
        stopBreath();
      } else {
        track.removeAttribute('tabindex');
        startBreath();
      }
      paint();
    },
  };
}

/** View 자체 고정 라벨. 키 + en 원본 (i18n.ts). */
const K = {
  play: 'view.controlBar.play',
  step: 'view.controlBar.step',
  pause: 'view.controlBar.pause',
  reset: 'view.controlBar.reset',
  speed: 'view.controlBar.speed',
  replay: 'view.controlBar.replay',
  advance: 'view.controlBar.advance',
  autoDemo: 'view.controlBar.auto-demo',
  search: 'view.controlBar.search',
  insert: 'view.controlBar.insert',
  remove: 'view.controlBar.remove',
  timeline: 'view.controlBar.timeline',
} as const;

function buttonLabels(tr: Translate): Record<ButtonId, string> {
  return {
    play: tr(K.play, '▶ Play'),
    step: tr(K.step, '⏭ Step'),
    pause: tr(K.pause, '⏸ Pause'),
    reset: tr(K.reset, '↺ Reset'),
  };
}

/**
 * 표준 넷 밖의 컨트롤 라벨. 액션명으로 색인한다.
 *
 * en 원본이 여기 있어야 하는 이유: `makeTranslator` 는 SOURCE_LOCALE('en') 이면
 * 번들을 보지 않는다 — en 의 정본은 코드이고 `messages/en.json` 은 그것을
 * `gen-messages` 로 추출한 산출물이다. 원본 없이 키만 두면 en 에서 fallback
 * (액션명)이 그대로 화면에 찍힌다.
 */
function extraLabels(tr: Translate): Record<string, string> {
  return {
    replay: tr(K.replay, '↻ Replay'),
    advance: tr(K.advance, '⏭ Step'),
    'auto-demo': tr(K.autoDemo, '▶ Auto demo'),
    search: tr(K.search, 'Search'),
    insert: tr(K.insert, 'Insert'),
    remove: tr(K.remove, 'Remove'),
  };
}

export const controlBarView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const cfg = params.config as {
      controls?: ControlSpec[];
      metrics?: MetricSpec[];
    };
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const btnLabels = buttonLabels(tr);
    const extra = extraLabels(tr);
    const speedText = tr(K.speed, 'Speed');

    const root = document.createElement('div');
    root.className = 'facet-control-bar';
    root.style.display = 'flex';
    root.style.flexWrap = 'wrap';
    root.style.alignItems = 'center';
    root.style.gap = space.md;
    root.style.padding = `${space.sm} ${space.md}`;
    root.style.background = colors.bgSubtle;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = space.xs;
    // 좁으면 다음 줄로 넘긴다. 줄이 넘어가는 것은 읽을 수 있고, 글자가
    // 쪼개지는 것은 읽을 수 없다.
    buttonGroup.style.flexWrap = 'wrap';
    buttonGroup.style.alignItems = 'center';

    const buttons: Partial<Record<ButtonId, HTMLButtonElement>> = {};
    const DEFAULT_SPEED_STEPS = [0.25, 0.5, 1, 2, 4, 8];
    const speedState: { steps: number[]; index: number } = {
      steps: DEFAULT_SPEED_STEPS,
      index: DEFAULT_SPEED_STEPS.indexOf(1),
    };
    let speedInput: HTMLInputElement | null = null;
    let speedLabel: HTMLSpanElement | null = null;
    let timelineWidget: TimelineWidget | null = null;
    const seekHandlers: Array<(step: number) => void> = [];

    function nearestSpeedIndex(steps: number[], target: number): number {
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < steps.length; i++) {
        const d = Math.abs(steps[i] - target);
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }
    function fmtSpeed(mul: number): string {
      return Number.isInteger(mul) ? `${mul}x` : `${mul}x`;
    }
    const speedHandlers: Array<(mul: number) => void> = [];
    const handlers: Record<ButtonId, Array<() => void>> = {
      play: [],
      step: [],
      pause: [],
      reset: [],
    };
    const actionHandlers: Array<(action: string, payload?: unknown) => void> = [];
    /** value-input 위젯들의 현재 값 — facet 고유 button 클릭 시 payload 로 첨부. */
    const inputState: Record<string, string> = {};
    /**
     * 되감기 때 위젯을 처음 자리로 돌리는 함수들.
     *
     * 없던 동안 되감기가 알고리즘만 되돌리고 위젯은 그대로 두어, **슬라이더는
     * 15 를 가리키는데 화면은 3 의 결과**를 보이는 어긋남이 났다. 조작이 논증을
     * 지는 완제품에서는 그 어긋남 자체가 거짓말이 된다.
     *
     * 되돌리는 것은 **알고리즘이 읽는 값**을 지닌 위젯뿐이다 — `value-input` 과
     * `segmented-slider`. `speed-slider` 는 되돌리지 않는다: 재생 속도는 자료가
     * 아니라 **읽는 사람의 취향**이고, 되감을 때마다 기본 속도로 튕기면 느리게
     * 보려던 사람이 매번 다시 맞춰야 한다. `button` 은 지닐 상태가 없다.
     */
    const inputResetters: Array<() => void> = [];
    const customButtons: Record<string, HTMLButtonElement> = {};

    const controls: ControlSpec[] = cfg.controls ?? [
      { widget: 'button', action: 'play' },
      { widget: 'button', action: 'step' },
      { widget: 'button', action: 'pause' },
      { widget: 'button', action: 'reset' },
    ];
    /**
     * 컨트롤 하나의 라벨을 정한다.
     *
     * facet 이 적은 `label` 이 언제나 이긴다 (저작자가 쓴 것이 이긴다는 C10 의
     * 조회 순서). 없으면 `labelKey` 로 카탈로그를 찾고, 그것도 없으면 호출부가
     * 준 기본값이다.
     */
    function labelFor(c: ControlSpec, fallback: string): string {
      if (c.label !== undefined) return resolveLocale(c.label, params.locale);
      if (typeof c.labelKey === 'string') {
        const seg = c.labelKey.slice(c.labelKey.lastIndexOf('.') + 1);
        return extra[seg] ?? tr(c.labelKey, fallback);
      }
      return fallback;
    }

    for (const c of controls) {
      if (c.widget === 'button') {
        const action = c.action;
        if (action === 'play' || action === 'step' || action === 'pause' || action === 'reset') {
          const label = labelFor(c, btnLabels[action] ?? action);
          const btn = makeButton(action, label, colors);
          btn.addEventListener('click', () => {
            for (const h of handlers[action]) h();
          });
          buttons[action] = btn;
          buttonGroup.appendChild(btn);
        } else {
          // facet 고유 button — onAction 채널로 통과. 라벨은 label → labelKey →
          // view.controlBar.<action> → action 명 순으로 정해진다.
          const label = labelFor(c, extra[action] ?? tr(`view.controlBar.${action}`, action));
          const btn = makeButton(action, label, colors);
          btn.addEventListener('click', () => {
            const payload = { ...inputState };
            for (const h of actionHandlers) h(action, payload);
          });
          customButtons[action] = btn;
          buttonGroup.appendChild(btn);
        }
      } else if (c.widget === 'value-input') {
        const name = typeof c.name === 'string' ? c.name : c.action;
        // placeholder 는 화면에 보이는 문자열이므로 label 과 같이 LocaleStr 을 받는다.
        // bare string 도 그대로 통과한다 (resolveLocale 이 단일 언어 형태를 지원).
        const placeholder =
          c.placeholder !== undefined ? resolveLocale(c.placeholder as LocaleStr, params.locale) : '';
        const def = typeof c.default === 'string' ? c.default : '';
        inputState[name] = def;
        const wrap = document.createElement('label');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = space.xs;
        wrap.style.fontSize = fontSizes.xs;
        wrap.style.color = colors.textMuted;
        wrap.style.whiteSpace = 'nowrap';
        wrap.style.flexShrink = '0';
        if (c.label !== undefined) wrap.textContent = resolveLocale(c.label, params.locale);
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.value = def;
        inputEl.placeholder = placeholder;
        inputEl.style.padding = `${space.xs} ${space.sm}`;
        inputEl.style.fontSize = fontSizes.sm;
        inputEl.style.fontFamily = fonts.mono;
        inputEl.style.background = colors.bg;
        inputEl.style.color = colors.text;
        inputEl.style.border = `1px solid ${colors.border}`;
        inputEl.style.borderRadius = radii.sm;
        inputEl.style.width = '72px';
        inputEl.dataset.inputName = name;
        inputEl.addEventListener('input', () => {
          inputState[name] = inputEl.value;
          params.dispatch?.({ type: 'input', payload: { name, value: inputEl.value } });
        });
        // 되감기는 값만 돌린다 — dispatch 하지 않는다. 알고리즘은 이미 처음으로
        // 돌아가는 중이라, 여기서 또 보내면 그 걸음이 두 번 세어진다.
        inputResetters.push(() => {
          inputEl.value = def;
          inputState[name] = def;
        });
        wrap.appendChild(inputEl);
        buttonGroup.appendChild(wrap);
      } else if (c.widget === 'segmented-slider') {
        const action = c.action;
        const name = typeof c.name === 'string' ? c.name : action;
        const segs = Array.isArray(c.segments)
          ? (c.segments as Array<{ value: number; label: unknown; default?: boolean }>)
          : [];
        if (segs.length >= 2) {
          let activeIdx = segs.findIndex((s) => s.default === true);
          if (activeIdx < 0) activeIdx = 0;
          inputState[name] = String(segs[activeIdx].value);

          const wrap = document.createElement('label');
          wrap.style.display = 'flex';
          wrap.style.alignItems = 'center';
          wrap.style.gap = space.xs;
          wrap.style.fontSize = fontSizes.xs;
          wrap.style.color = colors.textMuted;
          wrap.style.whiteSpace = 'nowrap';
          wrap.style.flexShrink = '0';
          if (c.label !== undefined) {
            wrap.textContent = resolveLocale(c.label as never, params.locale);
          }

          const track = document.createElement('div');
          track.setAttribute('role', 'slider');
          track.setAttribute('aria-valuemin', '0');
          track.setAttribute('aria-valuemax', String(segs.length - 1));
          track.setAttribute('aria-valuenow', String(activeIdx));
          track.tabIndex = 0;
          track.style.display = 'flex';
          track.style.alignItems = 'stretch';
          track.style.height = '28px';
          track.style.minWidth = '240px';
          track.style.border = `1px solid ${colors.border}`;
          track.style.borderRadius = radii.sm;
          track.style.overflow = 'hidden';
          track.style.userSelect = 'none';
          track.style.outline = 'none';
          track.style.cursor = 'pointer';

          const segEls: HTMLDivElement[] = [];
          for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            const cell = document.createElement('div');
            cell.style.flex = '1 1 0';
            cell.style.display = 'flex';
            cell.style.alignItems = 'center';
            cell.style.justifyContent = 'center';
            cell.style.fontSize = fontSizes.xs;
            cell.style.fontFamily = fonts.body;
            cell.style.padding = `0 ${space.xs}`;
            if (i > 0) cell.style.borderLeft = `1px solid ${colors.border}`;
            cell.textContent = resolveLocale(seg.label as never, params.locale);
            cell.dataset.segIndex = String(i);
            cell.addEventListener('click', () => {
              setActive(i, true);
            });
            track.appendChild(cell);
            segEls.push(cell);
          }

          function paint(idx: number) {
            for (let i = 0; i < segEls.length; i++) {
              const isActive = i === idx;
              const cell = segEls[i];
              cell.style.background = isActive ? colors.accent : colors.bgSubtle;
              cell.style.color = isActive ? colors.bg : colors.textMuted;
              cell.style.fontWeight = isActive ? '600' : '400';
            }
          }
          const initialIdx = activeIdx;
          // 되감기는 값만 돌리고 dispatch 하지 않는다 — 알고리즘은 이미 처음으로
          // 돌아가는 중이라, 여기서 또 보내면 그 걸음이 두 번 세어진다.
          inputResetters.push(() => setActive(initialIdx, false));

          function setActive(idx: number, fire: boolean) {
            if (idx < 0 || idx >= segs.length) return;
            activeIdx = idx;
            track.setAttribute('aria-valuenow', String(idx));
            paint(idx);
            const seg = segs[idx];
            inputState[name] = String(seg.value);
            if (fire) {
              const payload = {
                value: seg.value,
                segmentIndex: idx,
                ...inputState,
              };
              for (const h of actionHandlers) h(action, payload);
            }
          }
          track.addEventListener('keydown', (ev) => {
            if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') {
              ev.preventDefault();
              setActive(Math.max(0, activeIdx - 1), true);
            } else if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') {
              ev.preventDefault();
              setActive(Math.min(segs.length - 1, activeIdx + 1), true);
            } else if (ev.key === 'Home') {
              ev.preventDefault();
              setActive(0, true);
            } else if (ev.key === 'End') {
              ev.preventDefault();
              setActive(segs.length - 1, true);
            }
          });
          paint(activeIdx);

          wrap.appendChild(track);
          buttonGroup.appendChild(wrap);
        }
      } else if (c.widget === 'timeline') {
        // 저작자가 적은 label 이 언제나 이긴다 (C10 의 조회 순서). 띠에는 글자가
        // 서지 않으므로 그 값은 aria-label 로 간다.
        const label = labelFor(c, tr(K.timeline, 'Playback position'));
        timelineWidget = makeTimeline(colors, label, (step) => {
          for (const h of seekHandlers) h(step);
        });
      } else if (c.widget === 'speed-slider' && c.action === 'speed') {
        const customSteps = Array.isArray(c.steps) ? (c.steps as number[]) : null;
        const def = typeof c.default === 'number' ? c.default : 1;
        const steps =
          customSteps && customSteps.length > 0
            ? [...customSteps].sort((a, b) => a - b)
            : DEFAULT_SPEED_STEPS;
        speedState.steps = steps;
        speedState.index = nearestSpeedIndex(steps, def);
        const current = steps[speedState.index];
        const wrap = document.createElement('label');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = space.xs;
        wrap.style.fontSize = fontSizes.xs;
        wrap.style.color = colors.textMuted;
        wrap.style.whiteSpace = 'nowrap';
        wrap.style.flexShrink = '0';
        wrap.textContent = speedText;
        speedInput = document.createElement('input');
        speedInput.type = 'range';
        speedInput.min = '0';
        speedInput.max = String(steps.length - 1);
        speedInput.step = '1';
        speedInput.value = String(speedState.index);
        speedInput.style.width = '120px';
        speedLabel = document.createElement('span');
        speedLabel.style.minWidth = '40px';
        speedLabel.style.textAlign = 'right';
        speedLabel.textContent = fmtSpeed(current);
        speedInput.addEventListener('input', () => {
          if (!speedInput || !speedLabel) return;
          const idx = Number(speedInput.value);
          speedState.index = idx;
          const mul = speedState.steps[idx];
          speedLabel.textContent = fmtSpeed(mul);
          for (const h of speedHandlers) h(mul);
        });
        wrap.append(speedInput, speedLabel);
        buttonGroup.appendChild(wrap);
      }
    }

    root.appendChild(buttonGroup);
    // 띠는 남는 가로를 다 쓴다. 단추 묶음 뒤, 메트릭 앞이 그 자리다.
    if (timelineWidget) root.appendChild(timelineWidget.root);

    const metricsWrap = document.createElement('div');
    metricsWrap.style.display = 'flex';
    metricsWrap.style.flexWrap = 'wrap';
    metricsWrap.style.gap = space.sm;
    metricsWrap.style.marginLeft = 'auto';

    const metricEls = new Map<string, { value: HTMLElement; initial: number }>();
    for (const m of cfg.metrics ?? []) {
      const badge = document.createElement('div');
      badge.className = `facet-control-bar__metric facet-control-bar__metric--${m.name}`;
      badge.style.display = 'inline-flex';
      badge.style.alignItems = 'baseline';
      badge.style.gap = space.xs;
      badge.style.padding = `${space.xs} ${space.sm}`;
      badge.style.background = colors.bg;
      badge.style.border = `1px solid ${colors.border}`;
      badge.style.borderRadius = radii.sm;
      badge.style.fontSize = fontSizes.sm;
      const labelEl = document.createElement('span');
      labelEl.style.color = colors.textMuted;
      labelEl.textContent = resolveLocale(m.label, params.locale);
      const valueEl = document.createElement('span');
      valueEl.style.fontWeight = '600';
      valueEl.style.color = colors.text;
      valueEl.style.fontFamily = fonts.mono;
      const initial = m.initial ?? 0;
      valueEl.textContent = String(initial);
      badge.append(labelEl, valueEl);
      metricsWrap.appendChild(badge);
      metricEls.set(m.name, { value: valueEl, initial });
    }
    root.appendChild(metricsWrap);

    container.appendChild(root);

    function setEnabled(id: ButtonId, enabled: boolean) {
      const btn = buttons[id];
      if (!btn) return;
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.45';
      btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
    }

    function setRunning(running: boolean) {
      setEnabled('play', !running);
      setEnabled('step', !running);
      setEnabled('pause', running);
    }
    function setComplete(complete: boolean) {
      if (complete) {
        setEnabled('play', false);
        setEnabled('step', false);
        setEnabled('pause', false);
        setEnabled('reset', true);
      } else {
        setEnabled('reset', true);
      }
    }

    setRunning(false);

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      onPlay(cb: () => void) {
        handlers.play.push(cb);
      },
      onStep(cb: () => void) {
        handlers.step.push(cb);
      },
      onPause(cb: () => void) {
        handlers.pause.push(cb);
      },
      onReset(cb: () => void) {
        handlers.reset.push(cb);
      },
      onAction(cb: (action: string, payload?: unknown) => void) {
        actionHandlers.push(cb);
      },
      onSpeedChange(cb: (mul: number) => void) {
        speedHandlers.push(cb);
      },
      getSpeed(): number {
        return speedState.steps[speedState.index];
      },
      setSpeed(mul: number) {
        if (!speedInput || !speedLabel) return;
        const idx = nearestSpeedIndex(speedState.steps, mul);
        speedState.index = idx;
        const snapped = speedState.steps[idx];
        speedInput.value = String(idx);
        speedLabel.textContent = fmtSpeed(snapped);
      },
      updateMetric(name: string, value: number) {
        const m = metricEls.get(name);
        if (m) m.value.textContent = String(value);
      },
      resetMetrics() {
        for (const [, m] of metricEls) m.value.textContent = String(m.initial);
      },
      resetInputs() {
        for (const back of inputResetters) back();
      },
      onSeek(cb: (step: number) => void) {
        seekHandlers.push(cb);
      },
      setTimelineLength(n: number) {
        timelineWidget?.setLength(n);
      },
      setTimelineCursor(n: number) {
        timelineWidget?.setCursor(n);
      },
      setTimelineSeekable(on: boolean) {
        timelineWidget?.setSeekable(on);
      },
      setRunning,
      setComplete,
    };
  },
};
