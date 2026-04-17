import type { BubbleSortState } from './body.js';

export type BarsView = {
  root: HTMLElement;
  svg: SVGSVGElement;
  bars: SVGGElement;
  metrics: HTMLElement;
  phaseLabel: HTMLElement;
  capacity: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_WIDTH = 360;
const SVG_HEIGHT = 180;
const BAR_GAP = 6;
const MAX_BARS = 9;

export function renderBars(mount: HTMLElement): BarsView {
  mount.textContent = '';
  mount.classList.add('facet-body-bars');

  const phaseLabel = document.createElement('div');
  phaseLabel.className = 'facet-body-phase';
  phaseLabel.textContent = '—';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`);
  svg.setAttribute('class', 'facet-body-svg');

  const bars = document.createElementNS(SVG_NS, 'g');
  bars.setAttribute('class', 'facet-body-bars-g');
  svg.appendChild(bars);

  const metrics = document.createElement('div');
  metrics.className = 'facet-body-metrics';

  mount.append(phaseLabel, svg, metrics);

  return { root: mount, svg, bars, metrics, phaseLabel, capacity: 0 };
}

function ensureBars(view: BarsView, n: number): void {
  while (view.bars.childNodes.length < n) {
    const g = document.createElementNS(SVG_NS, 'g');
    const rect = document.createElementNS(SVG_NS, 'rect');
    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'facet-body-bar-label');
    g.appendChild(rect);
    g.appendChild(label);
    view.bars.appendChild(g);
  }
  while (view.bars.childNodes.length > n) {
    view.bars.removeChild(view.bars.lastChild!);
  }
  view.capacity = n;
}

function colorFor(index: number, state: BubbleSortState): string {
  const inComp = state.lastComp && (index === state.lastComp[0] || index === state.lastComp[1]);
  const inSwap = state.lastSwap && (index === state.lastSwap[0] || index === state.lastSwap[1]);
  if (state.microPhase === 'swapping' && inSwap) return '#e06666';
  if (state.microPhase === 'comparing' && inComp) return '#f1c232';
  if (state.bodyState === 'complete') return '#6aa84f';
  return '#8fa0c4';
}

export function updateBars(view: BarsView, state: BubbleSortState): void {
  const n = state.size;
  ensureBars(view, n);

  const slot = (SVG_WIDTH - BAR_GAP * (MAX_BARS + 1)) / MAX_BARS;
  const barW = slot;
  const baseY = SVG_HEIGHT - 20;
  const maxH = baseY - 20;

  const maxVal = Math.max(1, ...state.arr);
  const offset = (MAX_BARS - n) / 2;

  for (let idx = 0; idx < n; idx++) {
    const g = view.bars.childNodes[idx] as SVGGElement;
    const rect = g.childNodes[0] as SVGRectElement;
    const label = g.childNodes[1] as SVGTextElement;
    const value = state.arr[idx] ?? 0;
    const h = Math.max(4, (value / maxVal) * maxH);
    const x = BAR_GAP + (idx + offset) * (barW + BAR_GAP);
    const y = baseY - h;
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(barW));
    rect.setAttribute('height', String(h));
    rect.setAttribute('rx', '3');
    rect.setAttribute('fill', colorFor(idx, state));
    label.setAttribute('x', String(x + barW / 2));
    label.setAttribute('y', String(baseY + 14));
    label.textContent = String(value);
  }

  const phaseText =
    state.bodyState === 'complete'
      ? '완료'
      : state.microPhase === 'swapping'
        ? 'swapping'
        : state.microPhase === 'comparing'
          ? 'comparing'
          : state.bodyState === 'running'
            ? 'outer_loop'
            : 'ready';
  view.phaseLabel.textContent = phaseText;

  view.metrics.textContent = `패스 ${state.pass} · 비교 ${state.comparisons} · 교환 ${state.swaps}`;
}
