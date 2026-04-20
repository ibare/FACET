/**
 * ordered-list — append 만 지원하는 결과 목록.
 *
 * config: { type: 'ordered-list', label? }
 *
 * 메서드:
 *   append(value)
 *   reset()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fonts, fontSizes, radii, space } from './design-tokens.js';

export const orderedListView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const cfg = params.config as { label?: string };

    const root = document.createElement('div');
    root.className = 'facet-ordered-list';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    if (cfg.label) {
      const lbl = document.createElement('div');
      lbl.style.fontSize = fontSizes.xs;
      lbl.style.color = colors.textMuted;
      lbl.style.marginBottom = space.xs;
      lbl.textContent = cfg.label;
      root.appendChild(lbl);
    }

    const list = document.createElement('ol');
    list.style.margin = '0';
    list.style.paddingLeft = space.lg;
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = space.xs;
    list.style.fontSize = fontSizes.sm;
    list.style.color = colors.text;
    root.appendChild(list);
    container.appendChild(root);

    function append(value: unknown): void {
      const li = document.createElement('li');
      li.textContent = String(value);
      list.appendChild(li);
    }

    function reset(): void {
      list.textContent = '';
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      append,
      reset,
    };
  },
};
