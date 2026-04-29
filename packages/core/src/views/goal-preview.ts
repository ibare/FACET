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
import { createIsoBar } from './iso-bar.js';

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

    const ISO_BODY_MAIN = colors.isoBodyMain;
    const ISO_BODY_SIDE = colors.isoBodySide;
    const ISO_DEPTH_MAX = 8;

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
      const depth = Math.min(slot / 4, ISO_DEPTH_MAX);
      const baseY = height - 4 - depth;
      const maxH = baseY - depth - 2;
      const maxVal = Math.max(1, ...values);

      for (let i = 0; i < n; i++) {
        const v = values[i];
        const h = Math.max(2, (v / maxVal) * maxH);
        const x = padX + i * (slot + gap);
        const cx = x + slot / 2;
        const barW = slot * 0.7;
        const halfW = barW / 2;
        const barDepth = Math.min(barW / 4, ISO_DEPTH_MAX);

        const iso = createIsoBar(svg, {
          strokeWidth: 1,
          classPrefix: 'facet-goal-preview__cube',
        });
        const placeholder = document.createElementNS(SVG_NS, 'rect');
        placeholder.setAttribute('x', String(cx - halfW));
        placeholder.setAttribute('y', String(baseY - h));
        placeholder.setAttribute('width', String(barW));
        placeholder.setAttribute('height', String(h));
        placeholder.setAttribute('fill', 'none');
        placeholder.setAttribute('stroke', 'none');
        placeholder.setAttribute('pointer-events', 'none');
        iso.group.insertBefore(placeholder, iso.group.firstChild);

        iso.update(
          { cx, baseY, height: h, barW, depth: barDepth, capH: 0 },
          {
            bodyMain: ISO_BODY_MAIN,
            bodySide: ISO_BODY_SIDE,
            capMain: ISO_BODY_MAIN,
            capSide: ISO_BODY_SIDE,
            stroke: colors.text,
          },
        );
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
