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
      setRunning,
      setComplete,
    };
  },
};
