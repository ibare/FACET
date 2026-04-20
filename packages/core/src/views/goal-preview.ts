/**
 * goal-preview — 작은 정적 막대 그래프. 시작/목표 상태를 메인 stage 옆에 보여준다.
 *
 * config: {
 *   type: 'goal-preview',
 *   title: string,
 *   computeFrom: 'initial' | 'sorted' | 'custom',
 *   customData?: number[]
 * }
 *
 * 마운트 동작:
 *   computeFrom === 'initial' : params.initialData.values 를 자동으로 그린다.
 *   computeFrom === 'sorted'  : 빈 상태로 마운트. 러너가 computedFinal 을 setData 로 주입.
 *   computeFrom === 'custom'  : config.customData 를 자동으로 그린다.
 *
 * 메서드:
 *   setData(values: number[])
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fonts, fontSizes, radii, space } from './design-tokens.js';
import { resolveLocale, type LocaleStr } from '../types/locale.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

type GoalPreviewConfig = {
  title?: LocaleStr;
  computeFrom?: 'initial' | 'sorted' | 'custom';
  customData?: number[];
  height?: number;
  width?: number;
};

export const goalPreviewView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);
    const cfg = params.config as GoalPreviewConfig;
    const title = resolveLocale(cfg.title, params.locale);
    const height = cfg.height ?? 90;
    const width = cfg.width ?? 140;

    const root = document.createElement('div');
    root.className = 'facet-goal-preview';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.xs;
    root.style.padding = space.sm;
    root.style.background = colors.bgSubtle;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.minWidth = `${width}px`;
    root.style.alignItems = 'stretch';

    const titleEl = document.createElement('div');
    titleEl.className = 'facet-goal-preview__title';
    titleEl.textContent = title;
    titleEl.style.fontSize = fontSizes.xs;
    titleEl.style.color = colors.textMuted;
    titleEl.style.fontWeight = '600';
    titleEl.style.letterSpacing = '0.04em';
    titleEl.style.textTransform = 'uppercase';
    root.appendChild(titleEl);

    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'facet-goal-preview__svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(height));
    svg.style.display = 'block';
    root.appendChild(svg);

    container.appendChild(root);

    let values: number[] = [];

    function render() {
      svg.textContent = '';
      const n = values.length;
      const VIEW_W = 200;
      svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${height}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      if (n === 0) return;
      const padX = 4;
      const gap = 2;
      const usableW = VIEW_W - padX * 2;
      const slot = (usableW - gap * (n - 1)) / n;
      const baseY = height - 4;
      const maxH = baseY - 4;
      const maxVal = Math.max(1, ...values);

      for (let i = 0; i < n; i++) {
        const v = values[i];
        const h = Math.max(2, (v / maxVal) * maxH);
        const x = padX + i * (slot + gap);
        const y = baseY - h;
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(slot));
        rect.setAttribute('height', String(h));
        rect.setAttribute('rx', '1.5');
        rect.setAttribute('fill', colors.itemDefault);
        rect.setAttribute('stroke', colors.text);
        rect.setAttribute('stroke-width', '1');
        svg.appendChild(rect);
      }
    }

    function setData(arr: number[]): void {
      values = [...arr];
      render();
    }

    // 자동 초기 데이터
    const computeFrom = cfg.computeFrom ?? 'initial';
    if (computeFrom === 'initial') {
      const init = params.initialData as { values?: number[] } | undefined;
      if (init?.values && Array.isArray(init.values)) setData(init.values);
    } else if (computeFrom === 'custom') {
      if (Array.isArray(cfg.customData)) setData(cfg.customData);
    }
    // 'sorted' 는 러너가 setData 로 주입 — 마운트 시점엔 빈 상태

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setData,
    };
  },
};
