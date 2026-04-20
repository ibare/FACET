/**
 * snapshot-strip — 각 패스/단계 끝의 배열 상태를 작은 스냅샷으로 누적 표시.
 *
 * config: { type: 'snapshot-strip', maxSnapshots?: number, label?: string }
 *
 * 메서드:
 *   addSnapshot(label: string, data: number[], sortedBoundary?: number)
 *   reset()
 *
 * sortedBoundary 가 주어지면 각 스냅샷 안에서도 정렬된 꼬리 영역을 다른 색으로 구분.
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, fonts, fontSizes, radii, space } from './design-tokens.js';
import { resolveLocale, type LocaleStr } from '../types/locale.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

type SnapshotStripConfig = {
  maxSnapshots?: number;
  label?: LocaleStr;
};

const SNAPSHOT_DEFAULT_LABEL_BY_LOCALE: Record<string, string> = {
  en: 'Pass Snapshots',
  ko: '패스 스냅샷',
};

type Snapshot = {
  label: string;
  data: number[];
  sortedBoundary?: number;
};

export const snapshotStripView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const cfg = params.config as SnapshotStripConfig;
    const maxSnapshots = cfg.maxSnapshots ?? 12;
    const localeKey = params.locale && SNAPSHOT_DEFAULT_LABEL_BY_LOCALE[params.locale]
      ? params.locale
      : 'en';
    const defaultLabel = SNAPSHOT_DEFAULT_LABEL_BY_LOCALE[localeKey];
    const label = resolveLocale(cfg.label, params.locale) || defaultLabel;

    const root = document.createElement('div');
    root.className = 'facet-snapshot-strip';
    root.style.display = 'flex';
    root.style.flexDirection = 'column';
    root.style.gap = space.xs;
    root.style.padding = space.sm;
    root.style.background = colors.bgSubtle;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    const titleEl = document.createElement('div');
    titleEl.textContent = label;
    titleEl.style.fontSize = fontSizes.xs;
    titleEl.style.color = colors.textMuted;
    titleEl.style.fontWeight = '600';
    titleEl.style.letterSpacing = '0.06em';
    titleEl.style.textTransform = 'uppercase';
    root.appendChild(titleEl);

    const stripRow = document.createElement('div');
    stripRow.className = 'facet-snapshot-strip__row';
    stripRow.style.display = 'flex';
    stripRow.style.flexDirection = 'row';
    stripRow.style.alignItems = 'flex-start';
    stripRow.style.gap = space.sm;
    stripRow.style.overflowX = 'auto';
    stripRow.style.minHeight = '70px';
    root.appendChild(stripRow);

    container.appendChild(root);

    const snapshots: Snapshot[] = [];

    function renderSnapshot(snap: Snapshot): HTMLElement {
      const item = document.createElement('div');
      item.className = 'facet-snapshot-strip__item';
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.alignItems = 'center';
      item.style.gap = '2px';
      item.style.flex = '0 0 auto';

      const lbl = document.createElement('div');
      lbl.textContent = snap.label;
      lbl.style.fontSize = '10px';
      lbl.style.color = colors.textMuted;
      lbl.style.fontFamily = fonts.mono;
      item.appendChild(lbl);

      const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
      const SVG_W = 110;
      const SVG_H = 50;
      svg.setAttribute('width', String(SVG_W));
      svg.setAttribute('height', String(SVG_H));
      svg.setAttribute('viewBox', `0 0 ${SVG_W} ${SVG_H}`);
      svg.style.background = colors.bg;
      svg.style.borderRadius = radii.sm;
      svg.style.border = `1px solid ${colors.border}`;

      const n = snap.data.length;
      if (n > 0) {
        const padX = 3;
        const gap = 1;
        const usableW = SVG_W - padX * 2;
        const slot = (usableW - gap * (n - 1)) / n;
        const baseY = SVG_H - 2;
        const maxH = baseY - 2;
        const maxVal = Math.max(1, ...snap.data);

        // sorted tail tint (배경)
        if (typeof snap.sortedBoundary === 'number' && snap.sortedBoundary < n) {
          const x0 = padX + snap.sortedBoundary * (slot + gap) - gap / 2;
          const w = SVG_W - padX - x0;
          const tint = document.createElementNS(SVG_NS, 'rect');
          tint.setAttribute('x', String(x0));
          tint.setAttribute('y', '0');
          tint.setAttribute('width', String(Math.max(0, w + padX)));
          tint.setAttribute('height', String(SVG_H));
          tint.setAttribute('fill', colors.sortedTailBg);
          svg.appendChild(tint);
        }

        for (let i = 0; i < n; i++) {
          const v = snap.data[i];
          const h = Math.max(2, (v / maxVal) * maxH);
          const x = padX + i * (slot + gap);
          const y = baseY - h;
          const rect = document.createElementNS(SVG_NS, 'rect');
          rect.setAttribute('x', String(x));
          rect.setAttribute('y', String(y));
          rect.setAttribute('width', String(slot));
          rect.setAttribute('height', String(h));
          rect.setAttribute('rx', '1');
          const isInTail =
            typeof snap.sortedBoundary === 'number' && i >= snap.sortedBoundary;
          rect.setAttribute('fill', isInTail ? colors.itemSorted : colors.itemDefault);
          rect.setAttribute('stroke', colors.text);
          rect.setAttribute('stroke-width', '0.75');
          svg.appendChild(rect);
        }
      }

      item.appendChild(svg);
      return item;
    }

    function refresh() {
      stripRow.textContent = '';
      for (const s of snapshots) {
        stripRow.appendChild(renderSnapshot(s));
      }
    }

    function addSnapshot(itemLabel: string, data: number[], sortedBoundary?: number): void {
      snapshots.push({ label: itemLabel, data: [...data], sortedBoundary });
      while (snapshots.length > maxSnapshots) snapshots.shift();
      refresh();
    }

    function reset(): void {
      snapshots.length = 0;
      refresh();
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      addSnapshot,
      reset,
    };
  },
};
