/**
 * bar-chart — 배열을 막대로 시각화. 정렬 알고리즘에 핵심.
 *
 * config: {
 *   type: 'bar-chart',
 *   height?: number,
 *   palette?: 'default',
 *   features?: ('rising-marker' | 'sorted-boundary')[]
 * }
 *
 * 메서드:
 *   setData(values: number[])
 *   setItemState(index, state: BarItemState)
 *   clearItemState(index)
 *   swapItems(i, j)                                  // 즉시 swap
 *   swapItemsAnimated(i, j, duration?: number)       // 호 이동 애니메이션
 *   setRisingMarker(index: number)                   // 'rising-marker' 활성 시
 *   clearRisingMarker()
 *   setSortedBoundary(boundaryIndex: number)         // 'sorted-boundary' 활성 시
 *   clearSortedBoundary()
 *   reset()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, shiftLightness, fonts, radii, space } from './design-tokens.js';
import { createIsoBar, type IsoBarHandle } from './iso-bar.js';

const SORTED_BOUNDARY_LABEL_BY_LOCALE: Record<string, string> = {
  en: 'SORTED',
  ko: '정렬됨',
};

function pickSortedLabel(locale: string | undefined): string {
  if (locale && SORTED_BOUNDARY_LABEL_BY_LOCALE[locale]) {
    return SORTED_BOUNDARY_LABEL_BY_LOCALE[locale];
  }
  return SORTED_BOUNDARY_LABEL_BY_LOCALE.en;
}

export type BarItemState =
  | 'default'
  | 'comparing'
  | 'swapping'
  | 'sorted'
  | 'pivot'
  | 'active';

export type BarChartFeature = 'rising-marker' | 'sorted-boundary';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const barChartView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);
    const cfg = params.config as { height?: number; features?: BarChartFeature[] };
    const initialHeight = cfg.height ?? 200;
    const sortedLabelText = pickSortedLabel(params.locale);
    /** 동적 viewBox 높이. ResizeObserver 가 실제 SVG 픽셀 높이로 업데이트한다. */
    let height = initialHeight;
    const features = new Set<BarChartFeature>(cfg.features ?? []);

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
    root.style.minHeight = `${initialHeight + 32}px`;
    root.style.flex = '1 1 auto';
    root.style.boxSizing = 'border-box';

    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('class', 'facet-bar-chart__svg');
    svg.setAttribute('width', '100%');
    svg.style.display = 'block';
    svg.style.overflow = 'visible';
    svg.style.flex = '1 1 auto';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.minHeight = `${initialHeight}px`;

    // 레이어: boundary(뒤) → bars → marker(앞)
    const boundaryG = document.createElementNS(SVG_NS, 'g');
    boundaryG.setAttribute('class', 'facet-bar-chart__boundary');
    const barsG = document.createElementNS(SVG_NS, 'g');
    barsG.setAttribute('class', 'facet-bar-chart__bars');
    const markerG = document.createElementNS(SVG_NS, 'g');
    markerG.setAttribute('class', 'facet-bar-chart__marker');
    svg.appendChild(boundaryG);
    svg.appendChild(barsG);
    svg.appendChild(markerG);

    root.appendChild(svg);
    container.appendChild(root);

    let values: number[] = [];
    let states: BarItemState[] = [];
    /** 위치별 시각 오프셋(애니메이션 중 사용). 키: 인덱스 → {dx, dy} */
    const overlay = new Map<number, { dx: number; dy: number }>();

    let risingMarker: number | null = null;
    let sortedBoundary: number | null = null;

    const PAD_X = 8;
    const LABEL_H = 22;
    /** isometric base 마름모 세로반경 상한 (= slot/4 의 cap). viewBox 여유에도 반영된다. */
    const ISO_DEPTH_MAX = 12;
    /** isometric cap 의 두께 (옐로우 강조 면 두께). */
    const ISO_CAP_H = 8;
    /** 면 stroke 색 — design tokens 의 text 색을 사용 (light=검정, dark=거의 흰색). */
    const ISO_STROKE = colors.text;
    /** 본체 색은 상태와 무관하게 고정. 상태는 cap 으로 표현하고 본체는 정보
     *  hierarchy 를 깨지 않게 옅은 중성을 유지한다 (design-tokens.isoBody*). */
    const ISO_BODY_MAIN = colors.isoBodyMain;
    const ISO_BODY_SIDE = colors.isoBodySide;
    /**
     * 상태별 cap 색 — top 은 디자인 토큰, side 는 top 의 OKLCH lightness 를
     * 한 단계 낮춘 자동 도출 색. 본체는 그대로 두고 cap 으로 상태를 표현한다.
     */
    const SIDE_DELTA = -0.1;
    const cap = (top: string) => ({ top, side: shiftLightness(top, SIDE_DELTA) });
    const CAP_COLORS_BY_STATE: Record<BarItemState, { top: string; side: string }> = {
      default:   { top: colors.itemDefault, side: colors.itemDefault },
      comparing: cap(colors.itemComparing),
      swapping:  cap(colors.itemSwapping),
      pivot:     cap(colors.itemPivot),
      active:    cap(colors.itemActive),
      sorted:    cap(colors.itemSorted),
    };
    /** 동적 viewBox 폭. ResizeObserver 가 실제 SVG 픽셀 폭으로 업데이트한다. */
    let viewW = 600;

    type BarItem = {
      iso: IsoBarHandle;
      placeholder: SVGRectElement;
      label: SVGTextElement;
    };
    const items: BarItem[] = [];

    function ensureBars(n: number) {
      while (items.length < n) {
        const iso = createIsoBar(barsG, { classPrefix: 'facet-bar-chart__cube' });
        // placeholder rect — 테스트가 .facet-bar-chart rect 로 막대 카운트하므로 유지.
        const placeholder = document.createElementNS(SVG_NS, 'rect');
        placeholder.setAttribute('fill', 'none');
        placeholder.setAttribute('stroke', 'none');
        placeholder.setAttribute('pointer-events', 'none');
        iso.group.insertBefore(placeholder, iso.group.firstChild);
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-family', fonts.mono);
        label.setAttribute('font-size', '11');
        label.setAttribute('fill', colors.text);
        iso.group.appendChild(label);
        items.push({ iso, placeholder, label });
      }
      while (items.length > n) {
        const item = items.pop()!;
        item.iso.group.remove();
      }
    }

    function geometry() {
      const n = values.length;
      const usableW = viewW - PAD_X * 2;
      const gap = 4;
      const slot = n > 0 ? (usableW - gap * (n - 1)) / n : 0;
      // base 마름모 세로반경 = slot/4 (SVG 샘플 비율: 가로반경 2 : 세로반경 1)
      const depth = Math.min(slot / 4, ISO_DEPTH_MAX);
      // baseY: 막대 base 마름모의 중심 y. 라벨 영역 위로 (마름모 아래 반경 + 여유) 만큼 올려둔다.
      const baseY = height - LABEL_H - depth;
      // 위쪽 여유 = top 마름모 반경 + cap 두께 + 8
      const maxH = baseY - depth - ISO_CAP_H - 8;
      const maxVal = Math.max(1, ...values);
      return { n, gap, slot, baseY, maxH, maxVal, depth };
    }

    function barX(i: number, slot: number, gap: number): number {
      return PAD_X + i * (slot + gap);
    }

    function render() {
      const { n, gap, slot, baseY, maxH, maxVal } = geometry();
      ensureBars(n);
      svg.setAttribute('viewBox', `0 0 ${viewW} ${height}`);
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      // sorted boundary (뒤 레이어)
      boundaryG.textContent = '';
      if (features.has('sorted-boundary') && sortedBoundary !== null && sortedBoundary < n) {
        const x0 = barX(sortedBoundary, slot, gap) - gap / 2;
        const w = viewW - PAD_X - x0;
        const tint = document.createElementNS(SVG_NS, 'rect');
        tint.setAttribute('x', String(x0));
        tint.setAttribute('y', '0');
        tint.setAttribute('width', String(Math.max(0, w + PAD_X)));
        tint.setAttribute('height', String(baseY));
        tint.setAttribute('fill', colors.sortedTailBg);
        boundaryG.appendChild(tint);

        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(x0));
        line.setAttribute('y1', '0');
        line.setAttribute('x2', String(x0));
        line.setAttribute('y2', String(baseY));
        line.setAttribute('stroke', colors.sortedTailBorder);
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '4 3');
        boundaryG.appendChild(line);

        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(x0 + 6));
        label.setAttribute('y', '12');
        label.setAttribute('font-family', fonts.mono);
        label.setAttribute('font-size', '9');
        label.setAttribute('letter-spacing', '0.12em');
        label.setAttribute('fill', colors.sortedTailBorder);
        label.textContent = sortedLabelText;
        boundaryG.appendChild(label);
      }

      // bars — iso-bar 헬퍼로 본체 3면 + cap 3면 + placeholder rect + label 을 그린다.
      for (let i = 0; i < n; i++) {
        const item = items[i];
        const v = values[i];
        const h = Math.max(4, (v / maxVal) * maxH);
        const ofs = overlay.get(i) ?? { dx: 0, dy: 0 };
        const x = barX(i, slot, gap) + ofs.dx;
        const cx = x + slot / 2;
        const bY = baseY + ofs.dy;
        const tY = bY - h;
        // 막대 폭만 슬롯의 70% 로 축소 (높이는 그대로). depth 도 폭에 비례하므로 재계산.
        const barW = slot * 0.7;
        const halfW = barW / 2;
        const barDepth = Math.min(barW / 4, ISO_DEPTH_MAX);
        const state = states[i] ?? 'default';
        const cap = CAP_COLORS_BY_STATE[state];

        item.placeholder.setAttribute('x', String(cx - halfW));
        item.placeholder.setAttribute('y', String(tY));
        item.placeholder.setAttribute('width', String(barW));
        item.placeholder.setAttribute('height', String(h));

        item.iso.update(
          { cx, baseY: bY, height: h, barW, depth: barDepth, capH: ISO_CAP_H },
          {
            bodyMain: ISO_BODY_MAIN,
            bodySide: ISO_BODY_SIDE,
            capMain: cap.top,
            capSide: cap.side,
            stroke: ISO_STROKE,
          },
        );

        item.label.setAttribute('x', String(cx));
        item.label.setAttribute('y', String(bY + barDepth + 13));
        item.label.setAttribute('font-size', String(Math.min(13, barW * 0.6)));
        item.label.textContent = String(v);
      }

      // rising marker
      markerG.textContent = '';
      if (features.has('rising-marker') && risingMarker !== null && risingMarker >= 0 && risingMarker < n) {
        const v = values[risingMarker];
        const h = Math.max(4, (v / maxVal) * maxH);
        const ofs = overlay.get(risingMarker) ?? { dx: 0, dy: 0 };
        const x = barX(risingMarker, slot, gap) + slot / 2 + ofs.dx;
        const y = baseY - h - 8 + ofs.dy;
        // 위에서 가리키는 작은 삼각형
        const tri = document.createElementNS(SVG_NS, 'polygon');
        tri.setAttribute('points', `${x - 5},${y - 6} ${x + 5},${y - 6} ${x},${y}`);
        tri.setAttribute('fill', colors.risingMarker);
        markerG.appendChild(tri);
        // 라벨
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(y - 9));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-family', fonts.body);
        label.setAttribute('font-size', '9');
        label.setAttribute('fill', colors.risingMarker);
        label.textContent = '▲';
        markerG.appendChild(label);
      }
    }

    function setData(arr: number[]): void {
      values = [...arr];
      states = values.map(() => 'default');
      overlay.clear();
      risingMarker = null;
      sortedBoundary = null;
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

    function swapItemsAnimated(i: number, j: number, duration = 220): Promise<void> {
      if (i === j) return Promise.resolve();
      const { gap, slot } = geometry();
      const xi = barX(i, slot, gap);
      const xj = barX(j, slot, gap);
      const dx = xj - xi;
      // 호 높이 (작은 막대는 위로, 큰 막대는 아래로)
      const arc = 28;

      // duration 0 또는 음수: 즉시
      if (duration <= 0) {
        swapItems(i, j);
        return Promise.resolve();
      }

      const start = Date.now();
      return new Promise<void>((resolve) => {
        function tick() {
          const t = Math.min(1, (Date.now() - start) / duration);
          // 호 곡선: y = -arc * sin(pi*t)
          const sineY = -arc * Math.sin(Math.PI * t);
          overlay.set(i, { dx: dx * t, dy: sineY });
          overlay.set(j, { dx: -dx * t, dy: -sineY });
          render();
          if (t >= 1) {
            overlay.delete(i);
            overlay.delete(j);
            // 실제 배열/상태 swap (시각적 위치는 원위치 → 다시 render)
            [values[i], values[j]] = [values[j], values[i]];
            [states[i], states[j]] = [states[j], states[i]];
            render();
            resolve();
            return;
          }
          setTimeout(tick, 16);
        }
        tick();
      });
    }

    function setRisingMarker(index: number): void {
      if (!features.has('rising-marker')) return;
      risingMarker = index;
      render();
    }

    function clearRisingMarker(): void {
      if (!features.has('rising-marker')) return;
      risingMarker = null;
      render();
    }

    function setSortedBoundary(boundaryIndex: number): void {
      if (!features.has('sorted-boundary')) return;
      sortedBoundary = boundaryIndex;
      render();
    }

    function clearSortedBoundary(): void {
      if (!features.has('sorted-boundary')) return;
      sortedBoundary = null;
      render();
    }

    function reset(): void {
      values = [];
      states = [];
      overlay.clear();
      risingMarker = null;
      sortedBoundary = null;
      barsG.textContent = '';
      items.length = 0;
      boundaryG.textContent = '';
      markerG.textContent = '';
    }

    // SVG 의 실제 픽셀 크기에 맞춰 viewBox 를 동기화한다. 이렇게 하면
    // 컨테이너가 세로로 늘어날 때 viewBox 도 함께 커져 막대가 빈 공간 없이
    // 채워지고, 가로 비율이 달라져도 좌표 왜곡이 없다.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        const w = svg.clientWidth;
        const h = svg.clientHeight;
        if (w > 0 && h > 0 && (w !== viewW || h !== height)) {
          viewW = w;
          height = h;
          render();
        }
      });
      ro.observe(svg);
    }

    return {
      destroy() {
        ro?.disconnect();
        if (root.parentElement) root.remove();
      },
      setData,
      setItemState,
      clearItemState,
      clearAllStates,
      swapItems,
      swapItemsAnimated,
      setRisingMarker,
      clearRisingMarker,
      setSortedBoundary,
      clearSortedBoundary,
      reset,
    };
  },
};
