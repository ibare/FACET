/**
 * bar-chart — 배열을 막대로 시각화. 정렬 알고리즘에 핵심.
 *
 * config: { type: 'bar-chart', height?: number, palette?: 'default' }
 *
 * 메서드:
 *   setData(values: number[])
 *   setItemState(index, state: BarItemState)
 *   clearItemState(index)
 *   swapItems(i, j)
 *   reset()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { colors, fonts, radii, space } from './design-tokens.js';

export type BarItemState =
  | 'default'
  | 'comparing'
  | 'swapping'
  | 'sorted'
  | 'pivot'
  | 'active';

const SVG_NS = 'http://www.w3.org/2000/svg';

const STATE_COLOR: Record<BarItemState, string> = {
  default: colors.itemDefault,
  comparing: colors.itemComparing,
  swapping: colors.itemSwapping,
  sorted: colors.itemSorted,
  pivot: colors.itemPivot,
  active: colors.itemActive,
};

export const barChartView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const cfg = params.config as { height?: number };
    const height = cfg.height ?? 200;

    const root = document.createElement('div');
    root.className = 'facet-bar-chart';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.xs;
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.minHeight = `${height + 32}px`;

    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'facet-bar-chart__svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(height));
    svg.style.display = 'block';
    svg.style.overflow = 'visible';

    const barsG = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(barsG);

    root.appendChild(svg);
    container.appendChild(root);

    let values: number[] = [];
    let states: BarItemState[] = [];
    const VIEW_W = 600;
    const PAD_X = 8;
    const LABEL_H = 18;

    function ensureBars(n: number) {
      while (barsG.childNodes.length < n) {
        const g = document.createElementNS(SVG_NS, 'g');
        const rect = document.createElementNS(SVG_NS, 'rect');
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-family', fonts.body);
        label.setAttribute('font-size', '12');
        label.setAttribute('fill', colors.text);
        g.appendChild(rect);
        g.appendChild(label);
        barsG.appendChild(g);
      }
      while (barsG.childNodes.length > n) {
        barsG.removeChild(barsG.lastChild!);
      }
    }

    function render() {
      const n = values.length;
      ensureBars(n);
      svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${height}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      const usableW = VIEW_W - PAD_X * 2;
      const gap = 4;
      const slot = n > 0 ? (usableW - gap * (n - 1)) / n : 0;
      const baseY = height - LABEL_H;
      const maxH = baseY - 8;
      const maxVal = Math.max(1, ...values);

      for (let i = 0; i < n; i++) {
        const g = barsG.childNodes[i] as SVGGElement;
        const rect = g.childNodes[0] as SVGRectElement;
        const label = g.childNodes[1] as SVGTextElement;
        const v = values[i];
        const h = Math.max(4, (v / maxVal) * maxH);
        const x = PAD_X + i * (slot + gap);
        const y = baseY - h;
        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(slot));
        rect.setAttribute('height', String(h));
        rect.setAttribute('rx', '3');
        rect.setAttribute('fill', STATE_COLOR[states[i] ?? 'default']);
        label.setAttribute('x', String(x + slot / 2));
        label.setAttribute('y', String(baseY + 13));
        label.setAttribute('font-size', String(Math.min(13, slot * 0.6)));
        label.textContent = String(v);
      }
    }

    function setData(arr: number[]): void {
      values = [...arr];
      states = values.map(() => 'default');
      render();
    }

    function setItemState(index: number, state: BarItemState): void {
      if (index < 0 || index >= states.length) return;
      states[index] = state;
      render();
    }

    function clearItemState(index: number): void {
      if (index < 0 || index >= states.length) return;
      states[index] = 'default';
      render();
    }

    function clearAllStates(): void {
      states = states.map(() => 'default');
      render();
    }

    function swapItems(i: number, j: number): void {
      if (i === j) return;
      [values[i], values[j]] = [values[j], values[i]];
      [states[i], states[j]] = [states[j], states[i]];
      render();
    }

    function reset(): void {
      values = [];
      states = [];
      barsG.textContent = '';
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setData,
      setItemState,
      clearItemState,
      clearAllStates,
      swapItems,
      reset,
    };
  },
};
