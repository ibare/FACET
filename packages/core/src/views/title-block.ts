/**
 * title-block — facet 의 제목/설명을 표시.
 *
 * config: { type: 'title-block', title?: string, description?: string }
 * initialData/JSON 의 title/description 을 자동으로 사용 (config 우선).
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fontSizes, fonts, space } from './design-tokens.js';

export const titleBlockView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);

    const root = document.createElement('div');
    root.className = 'facet-title-block';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.xs;
    root.style.padding = `${space.sm} ${space.md}`;
    root.style.fontFamily = fonts.body;

    const titleEl = document.createElement('div');
    titleEl.className = 'facet-title-block__title';
    titleEl.style.fontSize = fontSizes.lg;
    titleEl.style.fontWeight = '600';
    titleEl.style.color = colors.text;

    const descEl = document.createElement('div');
    descEl.className = 'facet-title-block__desc';
    descEl.style.fontSize = fontSizes.sm;
    descEl.style.color = colors.textMuted;

    const cfg = params.config as { title?: string; description?: string };
    titleEl.textContent = cfg.title ?? '';
    descEl.textContent = cfg.description ?? '';
    if (!descEl.textContent) descEl.style.display = 'none';

    root.append(titleEl, descEl);
    container.appendChild(root);

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setTitle(text: string) {
        titleEl.textContent = text;
      },
      setDescription(text: string) {
        descEl.textContent = text;
        descEl.style.display = text ? '' : 'none';
      },
    };
  },
};
