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
 *   widget='value-input', name=<key>, action='input', label?, placeholder?, default?=string
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
import { resolveLocale } from '../types/locale.js';
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

const BTN_LABEL_BY_LOCALE: Record<string, Record<ButtonId, string>> = {
  en: { play: '▶ Play', step: '⏭ Step', pause: '⏸ Pause', reset: '↺ Reset' },
  ko: { play: '▶ 재생', step: '⏭ 단계', pause: '⏸ 정지', reset: '↺ 리셋' },
};

const SPEED_LABEL_BY_LOCALE: Record<string, string> = {
  en: 'Speed',
  ko: '속도',
};

function pickLocaleMap<T>(map: Record<string, T>, locale: string | undefined): T {
  if (locale && map[locale] !== undefined) return map[locale];
  return map.en;
}

export const controlBarView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const cfg = params.config as {
      controls?: ControlSpec[];
      metrics?: MetricSpec[];
    };
    const colors = getColors(params.theme);
    const btnLabels = pickLocaleMap(BTN_LABEL_BY_LOCALE, params.locale);
    const speedText = pickLocaleMap(SPEED_LABEL_BY_LOCALE, params.locale);

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
    const customButtons: Record<string, HTMLButtonElement> = {};

    const controls: ControlSpec[] = cfg.controls ?? [
      { widget: 'button', action: 'play' },
      { widget: 'button', action: 'step' },
      { widget: 'button', action: 'pause' },
      { widget: 'button', action: 'reset' },
    ];
    for (const c of controls) {
      if (c.widget === 'button') {
        const action = c.action;
        if (action === 'play' || action === 'step' || action === 'pause' || action === 'reset') {
          const label = c.label !== undefined ? resolveLocale(c.label, params.locale) : btnLabels[action];
          const btn = makeButton(action, label, colors);
          btn.addEventListener('click', () => {
            for (const h of handlers[action]) h();
          });
          buttons[action] = btn;
          buttonGroup.appendChild(btn);
        } else {
          // facet 고유 button — onAction 채널로 통과. label 누락 시 action 명을 그대로 표시.
          const label = c.label !== undefined ? resolveLocale(c.label, params.locale) : action;
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
        const placeholder = typeof c.placeholder === 'string' ? c.placeholder : '';
        const def = typeof c.default === 'string' ? c.default : '';
        inputState[name] = def;
        const wrap = document.createElement('label');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = space.xs;
        wrap.style.fontSize = fontSizes.xs;
        wrap.style.color = colors.textMuted;
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
      setRunning,
      setComplete,
    };
  },
};
