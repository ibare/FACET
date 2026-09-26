/**
 * nonlinear-bends 무대 — 층을 띠로 아래에서 위로 쌓는다.
 *
 * 띠 하나는 그 층 단위들의 출력을 x 에 대해 그린 칸이다. 가로는 입력 x, 세로는 알고리즘이 실은 값의 폭.
 * 층을 쌓을 때는 앞 층의 선 사본이 새 띠로 올라가며 기울기와 높이를 바꾼다 — 보간하는 내내 (a, b) 의 선이라
 * 어느 순간에도 굽지 않는다. 끝에 층 띠들이 입력 바로 위 한 칸으로 접히고, 접은 한 층의 선이 마지막 층의
 * 선 위에 겹쳐 그어진다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { formatNum, lineParts, type Line } from './algorithm.js';
import type { NonlinearBendsBase, NonlinearBendsScene } from './scene.js';

const H = 470;
const MOTION_MS = 700;
const FRAME_MS = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Rect = { top: number; h: number };
type Motion = null | { kind: 'layer'; index: number; e: number } | { kind: 'fold'; e: number };

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, e: number): number {
  return a + (b - a) * e;
}

function r2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

export const nonlinearBendsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const doc = svg.ownerDocument;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);

    // 가로 배치 — 캔버스 폭에서 역산
    const labelX = Math.round(W * 0.02);
    const plotX0 = Math.round(W * 0.12);
    const plotX1 = Math.round(W * 0.58);
    const formulaX = plotX1 + Math.round(W * 0.03);
    const swatchW = Math.round(W * 0.035);
    const captionY = 26;
    const regionTop = 46;
    const regionBottom = H - 28;
    const bandGap = 10;
    const bandPad = 6;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = doc.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function text(str: string, attrs: Record<string, string | number>, parent: Element): void {
      const node = el('text', attrs, parent);
      node.textContent = str;
    }

    function bandRect(base: NonlinearBendsBase, k: number): Rect {
      const n = base.layerCount + 1;
      const h = Math.min(110, (regionBottom - regionTop - bandGap * (n - 1)) / n);
      const bottom = regionBottom - k * (h + bandGap);
      return { top: bottom - h, h };
    }

    function xPx(base: NonlinearBendsBase, x: number): number {
      return r2(plotX0 + ((x - base.xLo) / (base.xHi - base.xLo)) * (plotX1 - plotX0));
    }

    function yPx(base: NonlinearBendsBase, rect: Rect, v: number): number {
      const inner = Math.max(0, rect.h - 2 * bandPad);
      const pad = Math.min(bandPad, rect.h / 2);
      return r2(rect.top + rect.h - pad - ((v - base.vLo) / (base.vHi - base.vLo)) * inner);
    }

    function unitColor(base: NonlinearBendsBase, i: number): string {
      const c = categorical(base.maxUnits, 'vivid')[i];
      if (c === undefined) throw new Error(`nonlinear-bends 무대: 단위 ${i} 의 색이 없다 (maxUnits ${base.maxUnits})`);
      return c;
    }

    function frame(base: NonlinearBendsBase, rect: Rect, g: Element): void {
      if (rect.h <= 0.5) return;
      el('rect', { x: plotX0, y: r2(rect.top), width: plotX1 - plotX0, height: r2(rect.h), fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1, rx: 3 }, g);
      if (base.vLo < 0 && base.vHi > 0) {
        const y0 = yPx(base, rect, 0);
        el('line', { x1: plotX0, x2: plotX1, y1: y0, y2: y0, stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '3 3' }, g);
      }
    }

    function drawLine(base: NonlinearBendsBase, rect: Rect, ln: Line, color: string, width: number, g: Element, xEnd?: number): void {
      const x1 = xEnd ?? base.xHi;
      el('line', {
        x1: xPx(base, base.xLo),
        y1: yPx(base, rect, ln.a * base.xLo + ln.b),
        x2: xPx(base, x1),
        y2: yPx(base, rect, ln.a * x1 + ln.b),
        stroke: color,
        'stroke-width': width,
        'stroke-linecap': 'round',
      }, g);
    }

    function highlight(base: NonlinearBendsBase, rect: Rect, ln: Line, g: Element, xEnd?: number): void {
      const x1 = xEnd ?? base.xHi;
      if (x1 <= base.xLo) return;
      el('line', {
        x1: xPx(base, base.xLo),
        y1: yPx(base, rect, ln.a * base.xLo + ln.b),
        x2: xPx(base, x1),
        y2: yPx(base, rect, ln.a * x1 + ln.b),
        stroke: colors.accent,
        'stroke-width': 10,
        'stroke-opacity': 0.6,
        'stroke-linecap': 'round',
      }, g);
    }

    function formulaText(ln: Line): string {
      const parts = lineParts(ln);
      return parts.sign === 'minus'
        ? t('formula.minus', '{a}·x − {b}', { a: parts.a, b: parts.b })
        : t('formula.plus', '{a}·x + {b}', { a: parts.a, b: parts.b });
    }

    type Row = { swatch: 'line' | 'highlight'; color: string; label: string };

    function formulaRows(rect: Rect, rows: readonly Row[], g: Element): void {
      const rowH = smPx + 8;
      const startY = rect.top + rect.h / 2 - ((rows.length - 1) * rowH) / 2;
      rows.forEach((row, i) => {
        const y = r2(startY + i * rowH);
        const sx0 = formulaX;
        const sx1 = formulaX + swatchW;
        if (row.swatch === 'highlight') {
          el('line', { x1: sx0, x2: sx1, y1: y, y2: y, stroke: colors.accent, 'stroke-width': 10, 'stroke-opacity': 0.6, 'stroke-linecap': 'round' }, g);
        }
        el('line', { x1: sx0, x2: sx1, y1: y, y2: y, stroke: row.color, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, g);
        text(row.label, { x: sx1 + 10, y, 'dominant-baseline': 'middle', fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.sm }, g);
      });
    }

    function bandLabel(rect: Rect, str: string, g: Element): void {
      text(str, { x: labelX, y: r2(rect.top + rect.h / 2), 'dominant-baseline': 'middle', fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm }, g);
    }

    function unitsOf(scene: NonlinearBendsScene, k: number): Line[] {
      const units = scene.layers[k - 1];
      if (units === undefined) throw new Error(`nonlinear-bends 무대: 층 ${k} 이 장면에 없다`);
      return units;
    }

    function caption(scene: NonlinearBendsScene, base: NonlinearBendsBase): string {
      const step = scene.step;
      if (step === null) throw new Error('nonlinear-bends 무대: 바탕은 있는데 걸음이 없다');
      if (step.kind === 'input') {
        return t('caption.input', 'Input x runs from {lo} to {hi}.', { lo: formatNum(base.xLo, 0), hi: formatNum(base.xHi, 0) });
      }
      if (step.kind === 'layer') {
        const units = unitsOf(scene, step.index);
        const slopes = units.map((u) => formatNum(u.a, 2)).join(', ');
        return t('caption.layer', 'Layer {k} stacked · units: {n} · slopes: {slopes}', { k: step.index, n: units.length, slopes });
      }
      const folded = scene.folded;
      if (folded === null) throw new Error('nonlinear-bends 무대: fold 걸음인데 접은 층이 없다');
      const top = unitsOf(scene, base.layerCount)[0];
      if (top === undefined) throw new Error('nonlinear-bends 무대: 마지막 층의 선이 없다');
      return t('caption.fold', 'Folded into one layer: slope {a} · intercept {b}. Layer {k}: slope {ak} · intercept {bk}.', {
        a: formatNum(folded.a, 2),
        b: formatNum(folded.b, 2),
        k: base.layerCount,
        ak: formatNum(top.a, 2),
        bk: formatNum(top.b, 2),
      });
    }

    function draw(scene: NonlinearBendsScene, motion: Motion): void {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return;
      const g = el('g', {}, svg);

      text(caption(scene, base), { x: labelX, y: captionY, fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md }, g);

      // 입력 띠와 x 눈금 — 늘 바닥에 있다
      const r0 = bandRect(base, 0);
      frame(base, r0, g);
      drawLine(base, r0, base.input, colors.text, 2.5, g);
      bandLabel(r0, t('label.input', 'input'), g);
      formulaRows(r0, [{ swatch: 'line', color: colors.text, label: t('formula.input', 'x') }], g);
      const tickY = r0.top + r0.h + 16;
      const ticks = base.xLo < 0 && base.xHi > 0 ? [base.xLo, 0, base.xHi] : [base.xLo, base.xHi];
      for (const x of ticks) {
        text(formatNum(x, 0), { x: xPx(base, x), y: r2(tickY), 'text-anchor': 'middle', fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, g);
      }
      text(t('axis.x', 'x'), { x: plotX1 + 18, y: r2(tickY), fill: colors.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs }, g);

      const n = scene.layers.length;
      const folding = scene.folded !== null;

      if (folding) {
        const folded = scene.folded;
        if (folded === null) throw new Error('nonlinear-bends 무대: 접은 층이 없다');
        const e = motion?.kind === 'fold' ? motion.e : 1;
        const target = bandRect(base, 1);
        const tCenter = target.top + target.h / 2;
        for (let k = 1; k <= n; k += 1) {
          const from = bandRect(base, k);
          const units = unitsOf(scene, k);
          let rect: Rect;
          if (k === n) {
            rect = { top: lerp(from.top, target.top, e), h: from.h };
          } else {
            const c = lerp(from.top + from.h / 2, tCenter, e);
            const h = from.h * (1 - e);
            rect = { top: c - h / 2, h };
          }
          if (rect.h <= 0.5) continue;
          frame(base, rect, g);
          if (k === n) {
            const reach = Math.max(0, Math.min(1, (e - 0.6) / 0.4));
            if (reach > 0) highlight(base, rect, folded, g, lerp(base.xLo, base.xHi, reach));
          }
          units.forEach((u, i) => drawLine(base, rect, u, unitColor(base, i), 2.5, g));
        }
        if (e >= 1) {
          bandLabel(target, t('label.folded', 'one layer'), g);
          const top = unitsOf(scene, n)[0];
          if (top === undefined) throw new Error('nonlinear-bends 무대: 마지막 층의 선이 없다');
          formulaRows(target, [
            { swatch: 'line', color: unitColor(base, 0), label: formulaText(top) },
            { swatch: 'highlight', color: unitColor(base, 0), label: formulaText(folded) },
          ], g);
        }
        return;
      }

      for (let k = 1; k <= n; k += 1) {
        const rect = bandRect(base, k);
        const units = unitsOf(scene, k);
        const rising = motion?.kind === 'layer' && motion.index === k && motion.e < 1;
        frame(base, rect, g);
        bandLabel(rect, t('label.layer', 'layer {k}', { k }), g);
        if (rising && motion?.kind === 'layer') {
          // 앞 층의 선 사본이 올라오며 새 선이 된다 — 모든 앞 단위가 모든 새 단위로 간다
          const sources = k === 1 ? [base.input] : unitsOf(scene, k - 1);
          const below = bandRect(base, k - 1);
          const e = motion.e;
          const moving: Rect = { top: lerp(below.top, rect.top, e), h: rect.h };
          units.forEach((u, i) => {
            for (const s of sources) {
              drawLine(base, moving, { a: lerp(s.a, u.a, e), b: lerp(s.b, u.b, e) }, unitColor(base, i), 2, g);
            }
          });
          continue;
        }
        units.forEach((u, i) => drawLine(base, rect, u, unitColor(base, i), 2.5, g));
        formulaRows(rect, units.map((u, i) => ({ swatch: 'line' as const, color: unitColor(base, i), label: formulaText(u) })), g);
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function play(scene: NonlinearBendsScene, mine: number, make: (e: number) => Motion): Promise<void> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        draw(scene, make(ease(p)));
        if (p >= 1) return;
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: NonlinearBendsScene, _prev: NonlinearBendsScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        if (!opts.animate || step === null || step.kind === 'input') {
          draw(next, null);
          return;
        }
        if (step.kind === 'layer') {
          const index = step.index;
          await play(next, mine, (e) => ({ kind: 'layer', index, e }));
        } else {
          await play(next, mine, (e) => ({ kind: 'fold', e }));
        }
        if (mine !== gen || destroyed) return;
        draw(next, null);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
