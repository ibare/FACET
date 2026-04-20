/**
 * control-bar — 재생/단계/정지/리셋 + 속도 슬라이더 + 메트릭 배지.
 *
 * config:
 *   {
 *     type: 'control-bar',
 *     controls: ('play'|'step'|'pause'|'reset' | { type: 'speed-slider', ... })[],
 *     metrics?: { name, label, initial? }[],
 *   }
 *
 * 외부 메서드:
 *   onPlay/onStep/onPause/onReset(cb)  — 핸들러 등록 (러너가 wire-up)
 *   onSpeedChange(cb)
 *   updateMetric(name, value)
 *   setRunning(bool), setComplete(bool)
 *   resetMetrics()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import type { ControlSpec, MetricSpec } from '../types/facet-json.js';
import { resolveLocale } from '../types/locale.js';
import { colors, fontSizes, fonts, radii, space } from './design-tokens.js';

type ButtonId = 'play' | 'step' | 'pause' | 'reset';

function makeButton(id: ButtonId, label: string): HTMLButtonElement {
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
  btn.addEventListener('mouseenter', () => {
    if (!btn.disabled) btn.style.background = colors.bgSubtle;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = colors.bg;
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
    const speedState = { min: 0.25, max: 4, current: 1 };
    let speedInput: HTMLInputElement | null = null;
    let speedLabel: HTMLSpanElement | null = null;
    const speedHandlers: Array<(mul: number) => void> = [];
    const handlers: Record<ButtonId, Array<() => void>> = {
      play: [],
      step: [],
      pause: [],
      reset: [],
    };

    const controls = cfg.controls ?? ['play', 'step', 'pause', 'reset'];
    for (const c of controls) {
      if (typeof c === 'string') {
        if (c === 'play' || c === 'step' || c === 'pause' || c === 'reset') {
          const btn = makeButton(c, btnLabels[c]);
          btn.addEventListener('click', () => {
            for (const h of handlers[c]) h();
          });
          buttons[c] = btn;
          buttonGroup.appendChild(btn);
        }
      } else if (c.type === 'speed-slider') {
        speedState.min = c.min ?? 0.25;
        speedState.max = c.max ?? 4;
        speedState.current = c.default ?? 1;
        const wrap = document.createElement('label');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = space.xs;
        wrap.style.fontSize = fontSizes.xs;
        wrap.style.color = colors.textMuted;
        wrap.textContent = speedText;
        speedInput = document.createElement('input');
        speedInput.type = 'range';
        speedInput.min = String(speedState.min);
        speedInput.max = String(speedState.max);
        speedInput.step = '0.25';
        speedInput.value = String(speedState.current);
        speedInput.style.width = '120px';
        speedLabel = document.createElement('span');
        speedLabel.style.minWidth = '32px';
        speedLabel.style.textAlign = 'right';
        speedLabel.textContent = `${speedState.current}x`;
        speedInput.addEventListener('input', () => {
          if (!speedInput || !speedLabel) return;
          const mul = Number(speedInput.value);
          speedState.current = mul;
          speedLabel.textContent = `${mul}x`;
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
      onSpeedChange(cb: (mul: number) => void) {
        speedHandlers.push(cb);
      },
      getSpeed(): number {
        return speedState.current;
      },
      setSpeed(mul: number) {
        if (!speedInput || !speedLabel) return;
        const clamped = Math.min(speedState.max, Math.max(speedState.min, mul));
        speedState.current = clamped;
        speedInput.value = String(clamped);
        speedLabel.textContent = `${clamped}x`;
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
