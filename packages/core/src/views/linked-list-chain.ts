/**
 * linked-list-chain — 박스 + 화살표 체인.
 *
 * config: { type: 'linked-list-chain', height? }
 *
 * 메서드:
 *   setList(values)
 *   setItemState(index, state)
 *   rewirePointer(fromIdx, toIdx)
 *   insertAt(index, value)
 *   reset()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { colors, fonts, fontSizes, radii, space } from './design-tokens.js';

export type LinkedListItemState = 'default' | 'active' | 'highlighted' | 'inserted';

const STATE_COLOR: Record<LinkedListItemState, string> = {
  default: colors.itemDefault,
  active: colors.itemActive,
  highlighted: colors.itemComparing,
  inserted: colors.itemSorted,
};

export const linkedListChainView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const cfg = params.config as { height?: number };
    const height = cfg.height ?? 80;

    const root = document.createElement('div');
    root.className = 'facet-linked-list';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.minHeight = `${height + 16}px`;

    const chain = document.createElement('div');
    chain.style.display = 'flex';
    chain.style.alignItems = 'center';
    chain.style.flexWrap = 'wrap';
    chain.style.gap = space.xs;
    root.appendChild(chain);
    container.appendChild(root);

    let values: unknown[] = [];
    let states: LinkedListItemState[] = [];
    let pointers: number[] = []; // pointers[i] = next index from box i (-1 if none)

    function render() {
      chain.textContent = '';
      for (let i = 0; i < values.length; i++) {
        const box = document.createElement('div');
        box.className = `facet-linked-list__node facet-linked-list__node--${states[i] ?? 'default'}`;
        box.style.minWidth = '40px';
        box.style.padding = `${space.xs} ${space.sm}`;
        box.style.borderRadius = radii.sm;
        box.style.background = STATE_COLOR[states[i] ?? 'default'];
        box.style.color = colors.textInverse;
        box.style.fontWeight = '600';
        box.style.fontSize = fontSizes.sm;
        box.style.textAlign = 'center';
        box.textContent = String(values[i]);
        chain.appendChild(box);

        const next = pointers[i];
        if (next !== -1 && next !== undefined) {
          const arrow = document.createElement('span');
          arrow.textContent = '→';
          arrow.style.color = colors.textMuted;
          arrow.style.fontSize = fontSizes.md;
          chain.appendChild(arrow);
        }
      }
    }

    function setList(arr: unknown[]): void {
      values = [...arr];
      states = values.map(() => 'default');
      pointers = values.map((_, i) => (i < values.length - 1 ? i + 1 : -1));
      render();
    }

    function setItemState(index: number, state: LinkedListItemState): void {
      if (index < 0 || index >= states.length) return;
      states[index] = state;
      render();
    }

    function rewirePointer(fromIdx: number, toIdx: number): void {
      if (fromIdx < 0 || fromIdx >= pointers.length) return;
      pointers[fromIdx] = toIdx;
      render();
    }

    function insertAt(index: number, value: unknown): void {
      values.splice(index, 0, value);
      states.splice(index, 0, 'inserted');
      pointers.splice(index, 0, index + 1);
      // 이전 노드 포인터 갱신
      pointers = values.map((_, i) => (i < values.length - 1 ? i + 1 : -1));
      render();
    }

    function reset(): void {
      values = [];
      states = [];
      pointers = [];
      render();
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setList,
      setItemState,
      rewirePointer,
      insertAt,
      reset,
    };
  },
};
