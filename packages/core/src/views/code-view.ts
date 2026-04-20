/**
 * code-view — 코드 패널 + phase 동기 하이라이트.
 *
 * IR/Transpiler 통합 지점. 러너가 JSON 의 ir/transpiler 참조를 사전 처리해
 * 결과 라인을 spec._transpiledLines 로 주입하면 자동 표시.
 *
 * config:
 *   {
 *     type: 'code-view',
 *     ir?: 'ir:...', transpiler?: 'transpiler:...',
 *     label?: string,
 *     _transpiledLines?: { code: string; phase: string | null }[]  // 러너 주입
 *   }
 *
 * 메서드:
 *   setSource(lines: { code, phase }[])
 *   highlightPhase(phaseName)
 *   highlightLines(lineIndices: number[])
 *   clearHighlight()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fonts, fontSizes, radii, space } from './design-tokens.js';

export type CodeLine = { code: string; phase: string | null };

const HL_BG_LIGHT = 'rgba(241, 194, 50, 0.25)';
const HL_BG_DARK = 'rgba(245, 207, 63, 0.18)';

export const codeViewView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const HL_BG = params.theme === 'dark' ? HL_BG_DARK : HL_BG_LIGHT;
    const cfg = params.config as {
      label?: string;
      _transpiledLines?: CodeLine[];
    };

    const root = document.createElement('div');
    root.className = 'facet-code-view';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.xs;
    root.style.minWidth = '0';

    if (cfg.label) {
      const lbl = document.createElement('div');
      lbl.style.fontSize = fontSizes.xs;
      lbl.style.color = colors.textMuted;
      lbl.textContent = cfg.label;
      root.appendChild(lbl);
    }

    const block = document.createElement('pre');
    block.style.margin = '0';
    block.style.padding = `${space.sm} ${space.md}`;
    block.style.background = colors.bgSubtle;
    block.style.borderRadius = radii.sm;
    block.style.fontFamily = fonts.mono;
    block.style.fontSize = fontSizes.sm;
    block.style.lineHeight = '1.55';
    block.style.color = colors.text;
    block.style.overflowX = 'auto';
    block.style.whiteSpace = 'pre';
    root.appendChild(block);
    container.appendChild(root);

    let lineEls: { el: HTMLElement; phase: string | null }[] = [];

    function setSource(lines: CodeLine[]): void {
      block.textContent = '';
      lineEls = [];
      for (const { code, phase } of lines) {
        const el = document.createElement('div');
        el.className = 'facet-code-view__line';
        el.style.padding = '0 4px';
        el.style.borderRadius = '2px';
        el.style.transition = 'background-color 120ms';
        el.dataset.phase = phase ?? '';
        el.textContent = code === '' ? '\u00A0' : code;
        block.appendChild(el);
        lineEls.push({ el, phase });
      }
    }

    function clearHighlight(): void {
      for (const { el } of lineEls) {
        el.style.backgroundColor = '';
      }
    }

    function highlightPhase(phaseName: string | null): void {
      clearHighlight();
      if (!phaseName) return;
      for (const { el, phase } of lineEls) {
        if (phase === phaseName) el.style.backgroundColor = HL_BG;
      }
    }

    function highlightLines(indices: number[]): void {
      clearHighlight();
      for (const i of indices) {
        const item = lineEls[i];
        if (item) item.el.style.backgroundColor = HL_BG;
      }
    }

    if (cfg._transpiledLines && Array.isArray(cfg._transpiledLines)) {
      setSource(cfg._transpiledLines);
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setSource,
      highlightPhase,
      highlightLines,
      clearHighlight,
    };
  },
};
