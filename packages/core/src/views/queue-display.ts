/**
 * queue-display — FIFO 큐 시각화.
 *
 * config: { type: 'queue-display', label? }
 *
 * 메서드:
 *   enqueue(value)
 *   dequeue() : 맨 앞 제거하고 반환
 *   reset()
 *   size: number 속성
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { colors, fonts, fontSizes, radii, space } from './design-tokens.js';

export const queueDisplayView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const cfg = params.config as { label?: string };

    const root = document.createElement('div');
    root.className = 'facet-queue-display';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.xs;

    if (cfg.label) {
      const lbl = document.createElement('div');
      lbl.style.fontSize = fontSizes.xs;
      lbl.style.color = colors.textMuted;
      lbl.textContent = cfg.label;
      root.appendChild(lbl);
    }

    const queue = document.createElement('div');
    queue.style.display = 'flex';
    queue.style.alignItems = 'center';
    queue.style.gap = space.xs;
    queue.style.minHeight = '32px';
    root.appendChild(queue);
    container.appendChild(root);

    const items: unknown[] = [];

    function render() {
      queue.textContent = '';
      if (items.length === 0) {
        const empty = document.createElement('span');
        empty.style.color = colors.textMuted;
        empty.style.fontSize = fontSizes.sm;
        empty.textContent = '(비어 있음)';
        queue.appendChild(empty);
        return;
      }
      const head = document.createElement('span');
      head.textContent = 'head →';
      head.style.color = colors.textMuted;
      head.style.fontSize = fontSizes.xs;
      queue.appendChild(head);
      for (const v of items) {
        const box = document.createElement('div');
        box.style.padding = `${space.xs} ${space.sm}`;
        box.style.background = colors.itemDefault;
        box.style.color = colors.textInverse;
        box.style.borderRadius = radii.sm;
        box.style.fontSize = fontSizes.sm;
        box.style.fontWeight = '600';
        box.textContent = String(v);
        queue.appendChild(box);
      }
      const tail = document.createElement('span');
      tail.textContent = '← tail';
      tail.style.color = colors.textMuted;
      tail.style.fontSize = fontSizes.xs;
      queue.appendChild(tail);
    }

    function enqueue(value: unknown): void {
      items.push(value);
      render();
    }

    function dequeue(): unknown {
      const v = items.shift();
      render();
      return v;
    }

    function reset(): void {
      items.length = 0;
      render();
    }

    render();

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      enqueue,
      dequeue,
      reset,
      get size() {
        return items.length;
      },
    };
  },
};
