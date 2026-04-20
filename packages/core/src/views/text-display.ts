/**
 * text-display — 단순 텍스트 영역. 검증/디버그용.
 *
 * config: { type: 'text-display', label?: string }
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fontSizes, fonts, radii, space } from './design-tokens.js';

export const textDisplayView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);

    const root = document.createElement('div');
    root.className = 'facet-text-display';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.gap = space.sm;
    root.style.padding = space.lg;
    root.style.background = colors.bgSubtle;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    const cfg = params.config as { label?: string };
    if (cfg.label) {
      const label = document.createElement('div');
      label.className = 'facet-text-display__label';
      label.style.fontSize = fontSizes.sm;
      label.style.color = colors.textMuted;
      label.textContent = cfg.label;
      root.appendChild(label);
    }

    const valueEl = document.createElement('div');
    valueEl.className = 'facet-text-display__value';
    valueEl.style.fontSize = fontSizes.xl;
    valueEl.style.fontWeight = '600';
    valueEl.style.color = colors.text;
    valueEl.style.fontFamily = fonts.mono;
    valueEl.textContent = '—';
    root.appendChild(valueEl);

    container.appendChild(root);

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setText(text: string) {
        valueEl.textContent = text;
      },
      append(text: string) {
        valueEl.textContent = (valueEl.textContent ?? '') + text;
      },
      reset() {
        valueEl.textContent = '—';
      },
    };
  },
};
