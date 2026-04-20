/**
 * pass-tracker — 패스 진행을 숫자/막대로 보여주는 패널.
 *
 * config: { type: 'pass-tracker', maxPasses?: number, label?: string }
 *
 * 메서드:
 *   setCurrentPass(passNumber: number)
 *   setPassSwapCount(passNumber: number, count: number)
 *   setTailSize(size: number)
 *   reset()
 *
 * 패스 번호는 1-based 표시. 내부적으론 0-based 도 그대로 받아서 +1 표시.
 * (호출자가 1-based 로 넘기면 +1 변환 없이 그대로 표시되도록 currentPass 그대로 사용.)
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fonts, fontSizes, radii, space } from './design-tokens.js';
import { resolveLocale, type LocaleStr } from '../types/locale.js';

type PassTrackerConfig = {
  maxPasses?: number;
  label?: LocaleStr;
};

const PASS_LABELS_BY_LOCALE: Record<string, { pass: string; sortedTail: string; swapsPerPass: string }> = {
  en: { pass: 'Pass', sortedTail: 'Sorted Tail', swapsPerPass: 'Swaps per Pass' },
  ko: { pass: '패스', sortedTail: '정렬된 꼬리', swapsPerPass: '패스별 교환' },
};

function pickPassLabels(locale: string | undefined) {
  if (locale && PASS_LABELS_BY_LOCALE[locale]) return PASS_LABELS_BY_LOCALE[locale];
  return PASS_LABELS_BY_LOCALE.en;
}

export const passTrackerView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const cfg = params.config as PassTrackerConfig;
    const maxPasses = cfg.maxPasses ?? 0;
    const i18n = pickPassLabels(params.locale);
    const label = resolveLocale(cfg.label, params.locale) || i18n.pass;

    const root = document.createElement('div');
    root.className = 'facet-pass-tracker';
    root.style.display = 'flex';
    root.style.flexDirection = 'row';
    root.style.alignItems = 'center';
    root.style.gap = space.lg;
    root.style.padding = `${space.sm} ${space.md}`;
    root.style.background = colors.bgSubtle;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    // 큰 패스 번호 블록
    const numBlock = document.createElement('div');
    numBlock.className = 'facet-pass-tracker__num';
    numBlock.style.display = 'flex';
    numBlock.style.flexDirection = 'column';
    numBlock.style.alignItems = 'flex-start';
    numBlock.style.minWidth = '80px';
    const numLabel = document.createElement('div');
    numLabel.textContent = label;
    numLabel.style.fontSize = fontSizes.xs;
    numLabel.style.color = colors.textMuted;
    numLabel.style.textTransform = 'uppercase';
    numLabel.style.letterSpacing = '0.06em';
    const numValue = document.createElement('div');
    numValue.className = 'facet-pass-tracker__num-value';
    numValue.style.fontSize = '24px';
    numValue.style.fontWeight = '700';
    numValue.style.color = colors.text;
    numValue.style.lineHeight = '1.1';
    numValue.textContent = maxPasses > 0 ? `0 / ${maxPasses}` : '0';
    numBlock.appendChild(numLabel);
    numBlock.appendChild(numValue);

    // tail size 블록
    const tailBlock = document.createElement('div');
    tailBlock.className = 'facet-pass-tracker__tail';
    tailBlock.style.display = 'flex';
    tailBlock.style.flexDirection = 'column';
    tailBlock.style.alignItems = 'flex-start';
    const tailLabel = document.createElement('div');
    tailLabel.textContent = i18n.sortedTail;
    tailLabel.style.fontSize = fontSizes.xs;
    tailLabel.style.color = colors.textMuted;
    tailLabel.style.textTransform = 'uppercase';
    tailLabel.style.letterSpacing = '0.06em';
    const tailValue = document.createElement('div');
    tailValue.className = 'facet-pass-tracker__tail-value';
    tailValue.style.fontSize = '24px';
    tailValue.style.fontWeight = '700';
    tailValue.style.color = colors.success;
    tailValue.style.lineHeight = '1.1';
    tailValue.textContent = '0';
    tailBlock.appendChild(tailLabel);
    tailBlock.appendChild(tailValue);

    // 패스별 swap 막대
    const barsBlock = document.createElement('div');
    barsBlock.className = 'facet-pass-tracker__bars';
    barsBlock.style.display = 'flex';
    barsBlock.style.flexDirection = 'column';
    barsBlock.style.alignItems = 'stretch';
    barsBlock.style.flex = '1';
    barsBlock.style.minWidth = '0';
    const barsLabel = document.createElement('div');
    barsLabel.textContent = i18n.swapsPerPass;
    barsLabel.style.fontSize = fontSizes.xs;
    barsLabel.style.color = colors.textMuted;
    barsLabel.style.textTransform = 'uppercase';
    barsLabel.style.letterSpacing = '0.06em';
    barsLabel.style.marginBottom = space.xs;
    barsBlock.appendChild(barsLabel);

    const barsRow = document.createElement('div');
    barsRow.className = 'facet-pass-tracker__bars-row';
    barsRow.style.display = 'flex';
    barsRow.style.flexDirection = 'row';
    barsRow.style.alignItems = 'flex-end';
    barsRow.style.gap = '3px';
    barsRow.style.height = '32px';
    barsBlock.appendChild(barsRow);

    root.appendChild(numBlock);
    root.appendChild(tailBlock);
    root.appendChild(barsBlock);
    container.appendChild(root);

    let currentPass = 0;
    const swapsByPass = new Map<number, number>();

    function refreshNum() {
      numValue.textContent = maxPasses > 0 ? `${currentPass} / ${maxPasses}` : String(currentPass);
    }

    function refreshBars() {
      barsRow.textContent = '';
      const passes = [...swapsByPass.entries()].sort((a, b) => a[0] - b[0]);
      const max = Math.max(1, ...passes.map(([, c]) => c));
      for (const [pass, count] of passes) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '2px';
        wrap.style.minWidth = '18px';

        const bar = document.createElement('div');
        const h = Math.max(3, (count / max) * 26);
        bar.style.width = '14px';
        bar.style.height = `${h}px`;
        bar.style.background = pass === currentPass ? colors.itemSwapping : colors.text;
        bar.style.borderRadius = '2px';
        bar.title = `P${pass}: ${count} swaps`;

        const lbl = document.createElement('div');
        lbl.textContent = `P${pass}`;
        lbl.style.fontSize = '9px';
        lbl.style.color = colors.textMuted;
        lbl.style.fontFamily = fonts.mono;

        wrap.appendChild(bar);
        wrap.appendChild(lbl);
        barsRow.appendChild(wrap);
      }
    }

    function setCurrentPass(passNumber: number): void {
      currentPass = passNumber;
      refreshNum();
      refreshBars();
    }

    function setPassSwapCount(passNumber: number, count: number): void {
      swapsByPass.set(passNumber, count);
      refreshBars();
    }

    function setTailSize(size: number): void {
      tailValue.textContent = String(size);
    }

    function reset(): void {
      currentPass = 0;
      swapsByPass.clear();
      tailValue.textContent = '0';
      refreshNum();
      refreshBars();
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setCurrentPass,
      setPassSwapCount,
      setTailSize,
      reset,
    };
  },
};
