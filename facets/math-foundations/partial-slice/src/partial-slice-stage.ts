/**
 * partial-slice 무대.
 *
 * 왼쪽은 두 입력의 바탕 — 격자의 점마다 함숫값만큼 부푼 원. 오른쪽은 떨어져 나온 단면이
 * 놓일 자리 둘. 자르는 걸음에서 칼선이 바탕을 가로지르고, 그 줄의 격자 점들이 복제되어
 * 오른쪽 틀로 날아가 제 높이에 앉으며 곡선이 된다. 세로 줄기(x 를 붙든 것)는 날아가며
 * 가로로 눕는다. 두 단면 틀은 가로 축척을 함께 쓰고 세로 축척도 함께 쓴다 — 한 틀 안의 가로 · 세로
 * 축척은 다르지만, 틀끼리는 같아 두 기울기를 그림으로 견줄 수 있다.
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
import { fmt2, plainNum, type Axis } from './algorithm.js';
import type { PartialSliceScene, SliceBase, SliceFrame } from './scene.js';

const H = 400;
const NS = 'http://www.w3.org/2000/svg';

// 자리 (상한 · 여백)
const DOMAIN_LEFT = 44;
const DOMAIN_TOP = 58;
const DOMAIN_MAX_W = 190;
const DOMAIN_MAX_H = 232;
const PLOT_LEFT = 318;
const PLOT_RIGHT_PAD = 24;
const PLOT_TOP = 26;
const PLOT_BOTTOM = 352;
const PLOT_TITLE = 20;
const PLOT_TICKS = 18;
const PLOT_GAP = 18;
const PLOT_MAX_H_UNIT = 110;
const PLOT_MAX_V_UNIT = 30;
const READOUT_Y = 338;
const CAPTION_Y = 386;
const TANGENT_HALF = 58;

// 운동 (ms)
const KNIFE_MS = 350;
const FLY_MS = 700;
const FLY_STAGGER = 0.35;
const CURVE_MS = 300;
const TANGENT_MS = 500;
const READOUT_MS = 700;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type PlotBox = {
  frame: SliceFrame;
  left: number;
  axisY: number;
  top: number;
  width: number;
  toX(a: number): number;
  toY(v: number): number;
};

type Layout = {
  dx(x: number): number;
  dy(y: number): number;
  domainRight: number;
  domainBottom: number;
  unit: number;
  plots: PlotBox[];
};

type Handles = {
  knife?: { line: SVGLineElement; label: SVGTextElement; from: Pt; to: Pt };
  flyers?: Array<{ el: SVGCircleElement; from: Pt; to: Pt }>;
  curve?: { el: SVGPolylineElement; pts: Pt[]; title: SVGTextElement; mark: SVGGElement };
  tangent?: { el: SVGLineElement; label: SVGTextElement; center: Pt; ux: number; uy: number };
  readout?: Array<{ g: SVGGElement; from: Pt; to: Pt }>;
};

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function clamp01(p: number): number {
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, ...attrs });
  node.textContent = text;
  return node;
}

function layoutOf(scene: PartialSliceScene, base: SliceBase): Layout {
  const [x0, x1] = scene.domain.x;
  const [y0, y1] = scene.domain.y;
  const unit = Math.min(DOMAIN_MAX_W / (x1 - x0), DOMAIN_MAX_H / (y1 - y0));
  const domainRight = DOMAIN_LEFT + (x1 - x0) * unit;
  const domainBottom = DOMAIN_TOP + (y1 - y0) * unit;

  // 단면 틀 — 가로 · 세로 축척을 모든 틀이 함께 쓴다
  const avail = PIECE_CANVAS_W - PLOT_RIGHT_PAD - PLOT_LEFT;
  const widest = Math.max(...base.frames.map((f) => f.hi - f.lo));
  const hUnit = Math.min(PLOT_MAX_H_UNIT, avail / widest);
  const totalMax = base.frames.reduce((s, f) => s + f.max, 0);
  const chrome = base.frames.length * (PLOT_TITLE + PLOT_TICKS) + (base.frames.length - 1) * PLOT_GAP;
  const vUnit = Math.min(PLOT_MAX_V_UNIT, (PLOT_BOTTOM - PLOT_TOP - chrome) / totalMax);

  let cursor = PLOT_TOP;
  const plots = base.frames.map((frame): PlotBox => {
    const top = cursor + PLOT_TITLE;
    const axisY = top + frame.max * vUnit;
    cursor = axisY + PLOT_TICKS + PLOT_GAP;
    return {
      frame,
      left: PLOT_LEFT,
      axisY,
      top,
      width: (frame.hi - frame.lo) * hUnit,
      toX: (a) => PLOT_LEFT + (a - frame.lo) * hUnit,
      toY: (v) => axisY - v * vUnit,
    };
  });

  return {
    dx: (x) => DOMAIN_LEFT + (x - x0) * unit,
    dy: (y) => domainBottom - (y - y0) * unit,
    domainRight,
    domainBottom,
    unit,
    plots,
  };
}

function plotFor(lay: Layout, free: Axis): PlotBox {
  const box = lay.plots.find((p) => p.frame.free === free);
  if (box === undefined) throw new Error(`partial-slice-stage: '${free}' 단면의 틀이 없다`);
  return box;
}

/** 붙든 입력 · 남는 입력의 값을 바탕 좌표로. */
function domainPt(lay: Layout, held: Axis, at: number, a: number): Pt {
  return held === 'y' ? { x: lay.dx(a), y: lay.dy(at) } : { x: lay.dx(at), y: lay.dy(a) };
}

export const partialSliceStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const cut = categorical(2, params.theme === 'dark' ? 'vivid' : 'deep');
    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function cutColor(scene: PartialSliceScene, free: Axis): string {
      if (scene.base === null) throw new Error('partial-slice-stage: 바탕 없이 색을 찾는다');
      const i = scene.base.frames.findIndex((f) => f.free === free);
      if (i < 0 || i >= cut.length) throw new Error(`partial-slice-stage: '${free}' 단면의 색이 없다`);
      return cut[i];
    }

    function caption(scene: PartialSliceScene): string {
      const step = scene.step;
      if (step === null) return '';
      const base = scene.base;
      if (base === null) throw new Error('partial-slice-stage: 바탕 없는 걸음');
      const x = plainNum(scene.point.x);
      const y = plainNum(scene.point.y);
      switch (step.kind) {
        case 'init':
          return t('caption.start', 'Point ({x}, {y}) · f {f}', { x, y, f: fmt2(base.f) });
        case 'slice': {
          const s = scene.slices[scene.slices.length - 1];
          return t('caption.slice', 'Hold {held} = {at} → slice {formula}', {
            held: s.held,
            at: plainNum(s.at),
            formula: s.formula,
          });
        }
        case 'slope': {
          const s = scene.slopes[scene.slopes.length - 1];
          return t('caption.slope', 'Slope of the slice at {free} = {at}: {slope} = {sym}', {
            free: s.free,
            at: plainNum(s.a),
            slope: fmt2(s.slope),
            sym: s.symbol,
          });
        }
        case 'both': {
          const pair = scene.both;
          if (pair === null || pair.length !== 2) throw new Error('partial-slice-stage: 나란히 둘 두 수가 없다');
          return t('caption.both', 'Same point ({x}, {y}) · {symA} {va} · {symB} {vb}', {
            x,
            y,
            symA: pair[0].symbol,
            va: fmt2(pair[0].value),
            symB: pair[1].symbol,
            vb: fmt2(pair[1].value),
          });
        }
      }
    }

    function drawStatic(scene: PartialSliceScene): Handles {
      svg.textContent = '';
      const handles: Handles = {};
      const base = scene.base;
      if (base === null) return handles;
      const lay = layoutOf(scene, base);
      const step = scene.step;

      // ── 바탕: 두 입력의 격자 ──
      const dom = el(svg, 'g', {});
      el(dom, 'rect', {
        x: DOMAIN_LEFT,
        y: DOMAIN_TOP,
        width: lay.domainRight - DOMAIN_LEFT,
        height: lay.domainBottom - DOMAIN_TOP,
        fill: 'none',
        stroke: colors.border,
      });
      label(dom, DOMAIN_LEFT, DOMAIN_TOP - 36, base.formula, { fill: colors.text, 'font-size': fontSizes.md });
      for (let x = Math.ceil(scene.domain.x[0]); x <= scene.domain.x[1]; x += 1) {
        label(dom, lay.dx(x), lay.domainBottom + 16, plainNum(x), { fill: colors.textMuted, 'text-anchor': 'middle' });
      }
      for (let y = Math.ceil(scene.domain.y[0]); y <= scene.domain.y[1]; y += 1) {
        label(dom, DOMAIN_LEFT - 10, lay.dy(y) + 4, plainNum(y), { fill: colors.textMuted, 'text-anchor': 'end' });
      }
      label(dom, lay.domainRight + 10, lay.domainBottom + 16, 'x', { fill: colors.textMuted, 'font-style': 'italic' });
      label(dom, DOMAIN_LEFT - 10, DOMAIN_TOP - 14, 'y', {
        fill: colors.textMuted,
        'font-style': 'italic',
        'text-anchor': 'end',
      });

      const spacing = Math.min(
        (base.grid.xs[1] - base.grid.xs[0]) * lay.unit,
        (base.grid.ys[1] - base.grid.ys[0]) * lay.unit,
      );
      const rMax = spacing * 0.44;
      const radius = (v: number): number => {
        // 원의 크기로 함숫값을 보이므로 음의 값은 그릴 수 없다 — 누르지 않고 던진다
        if (v < 0) throw new Error(`partial-slice-stage: 격자 함숫값 ${v} 가 음수다 — 원의 크기로 보일 수 없다`);
        if (!(base.grid.max > 0)) throw new Error('partial-slice-stage: 격자 함숫값의 가장 큰 값이 양수가 아니다');
        return 1.2 + (rMax - 1.2) * Math.sqrt(v / base.grid.max);
      };
      base.grid.values.forEach((row, j) => {
        row.forEach((v, i) => {
          el(dom, 'circle', {
            cx: lay.dx(base.grid.xs[i]),
            cy: lay.dy(base.grid.ys[j]),
            r: radius(v),
            fill: colors.textMuted,
            'fill-opacity': 0.45,
          });
        });
      });

      // 칼선
      scene.slices.forEach((s, idx) => {
        const color = cutColor(scene, s.free);
        const [lo, hi] = scene.domain[s.free];
        const from = domainPt(lay, s.held, s.at, lo);
        const to = domainPt(lay, s.held, s.at, hi);
        const ext = 8;
        const ux = s.held === 'y' ? ext : 0;
        const uy = s.held === 'y' ? 0 : -ext;
        const a = { x: from.x - ux, y: from.y - uy };
        const b = { x: to.x + ux, y: to.y + uy };
        const line = el(dom, 'line', {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: color,
          'stroke-width': 2,
          'stroke-dasharray': '6 4',
        });
        const lx = s.held === 'y' ? b.x + 6 : b.x;
        const ly = s.held === 'y' ? b.y + 4 : b.y - 6;
        const knifeLabel = label(dom, lx, ly, t('label.hold', '{held} = {at}', { held: s.held, at: plainNum(s.at) }), {
          fill: color,
          'text-anchor': s.held === 'y' ? 'start' : 'middle',
          'font-weight': 600,
        });
        if (idx === scene.slices.length - 1) handles.knife = { line, label: knifeLabel, from: a, to: b };
      });

      // 점
      const pp = { x: lay.dx(scene.point.x), y: lay.dy(scene.point.y) };
      el(dom, 'circle', { cx: pp.x, cy: pp.y, r: 6, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 });
      label(dom, pp.x - 9, pp.y - 9, t('label.point', '({x}, {y})', { x: plainNum(scene.point.x), y: plainNum(scene.point.y) }), {
        fill: colors.text,
        'text-anchor': 'end',
        'font-weight': 600,
      });

      // ── 단면 틀 ──
      const plotLayer = el(svg, 'g', {});
      for (const box of lay.plots) {
        const { frame } = box;
        el(plotLayer, 'line', { x1: box.left, y1: box.axisY, x2: box.left + box.width + 12, y2: box.axisY, stroke: colors.border });
        el(plotLayer, 'line', { x1: box.left, y1: box.axisY, x2: box.left, y2: box.top - 6, stroke: colors.border });
        for (let a = Math.ceil(frame.lo); a <= frame.hi; a += 1) {
          label(plotLayer, box.toX(a), box.axisY + 14, plainNum(a), { fill: colors.textMuted, 'text-anchor': 'middle' });
        }
        label(plotLayer, box.left + box.width + 16, box.axisY + 4, frame.free, {
          fill: colors.textMuted,
          'font-style': 'italic',
        });
      }

      // 떨어져 나온 단면
      scene.slices.forEach((s, idx) => {
        const box = plotFor(lay, s.free);
        const color = cutColor(scene, s.free);
        const latest = idx === scene.slices.length - 1;
        const flyers: NonNullable<Handles['flyers']> = [];
        const pts = s.curve.map((c) => ({ x: box.toX(c.a), y: box.toY(c.v) }));
        const curve = el(plotLayer, 'polyline', {
          points: pts.map((p) => `${r2(p.x)},${r2(p.y)}`).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': 2.5,
          'stroke-linejoin': 'round',
        });
        for (const d of s.dots) {
          const to = { x: box.toX(d.a), y: box.toY(d.v) };
          const c = el(plotLayer, 'circle', { cx: to.x, cy: to.y, r: 3.2, fill: color });
          flyers.push({ el: c, from: domainPt(lay, s.held, s.at, d.a), to });
        }
        const title = label(plotLayer, box.left + 8, box.top - 6, s.formula, {
          fill: color,
          'font-size': fontSizes.md,
          'font-weight': 600,
        });
        // 단면 위의 점 (바탕의 점과 같은 자리)
        const onCurve = s.curve.find((c) => c.a === scene.point[s.free]);
        if (onCurve === undefined) throw new Error(`partial-slice-stage: '${s.free}' 단면 표본에 점이 없다`);
        const mark = el(plotLayer, 'g', {});
        el(mark, 'circle', {
          cx: box.toX(onCurve.a),
          cy: box.toY(onCurve.v),
          r: 5.5,
          fill: colors.bg,
          stroke: colors.text,
          'stroke-width': 2,
        });
        if (latest) {
          handles.flyers = flyers;
          handles.curve = { el: curve, pts, title, mark };
        }
      });

      // 기울기
      scene.slopes.forEach((s, idx) => {
        const box = plotFor(lay, s.free);
        const center = { x: box.toX(s.a), y: box.toY(s.v) };
        // 화면 좌표에서 기울기 방향 (위가 + 이므로 y 는 뒤집는다)
        const run = box.toX(s.a + 1) - box.toX(s.a);
        const rise = box.toY(s.v) - box.toY(s.v + s.slope);
        const len = Math.hypot(run, rise);
        const ux = run / len;
        const uy = -rise / len;
        const line = el(plotLayer, 'line', {
          x1: center.x - ux * TANGENT_HALF,
          y1: center.y - uy * TANGENT_HALF,
          x2: center.x + ux * TANGENT_HALF,
          y2: center.y + uy * TANGENT_HALF,
          stroke: colors.text,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        });
        const slopeLabel = label(plotLayer, center.x + 12, center.y + 22, t('label.slope', 'slope {v}', { v: fmt2(s.slope) }), {
          fill: colors.text,
          'font-weight': 600,
        });
        // 기울기 선보다 위에 점을 다시 얹는다
        el(plotLayer, 'circle', { cx: center.x, cy: center.y, r: 5.5, fill: colors.bg, stroke: colors.text, 'stroke-width': 2 });
        if (idx === scene.slopes.length - 1) handles.tangent = { el: line, label: slopeLabel, center, ux, uy };
      });

      // 나란히 둔 두 수
      if (scene.both !== null) {
        const pair = scene.both;
        const boxW = 96;
        const gap = 14;
        const totalW = pair.length * boxW + (pair.length - 1) * gap;
        const startX = (DOMAIN_LEFT + lay.domainRight) / 2 - totalW / 2;
        const readout: NonNullable<Handles['readout']> = [];
        pair.forEach((item, i) => {
          const slope = scene.slopes.find((s) => s.free === item.free);
          if (slope === undefined) throw new Error(`partial-slice-stage: '${item.free}' 기울기를 잰 적이 없다`);
          const box = plotFor(lay, item.free);
          const color = cutColor(scene, item.free);
          const to = { x: startX + i * (boxW + gap), y: READOUT_Y - 16 };
          const from = { x: box.toX(slope.a) + 10, y: box.toY(slope.v) - 30 };
          const g = el(svg, 'g', { transform: `translate(${r2(to.x)},${r2(to.y)})` });
          el(g, 'rect', { x: 0, y: 0, width: boxW, height: 28, rx: 5, fill: colors.bg, stroke: color, 'stroke-width': 2 });
          label(g, boxW / 2, 19, t('label.partial', '{sym} {v}', { sym: item.symbol, v: fmt2(item.value) }), {
            fill: colors.text,
            'text-anchor': 'middle',
            'font-weight': 600,
            'font-size': fontSizes.md,
          });
          readout.push({ g, from, to });
        });
        handles.readout = readout;
      }

      // 캡션 — 지금 일어나는 일
      if (step !== null) {
        label(svg, PIECE_CANVAS_W / 2, CAPTION_Y, caption(scene), {
          fill: colors.text,
          'text-anchor': 'middle',
          'font-size': fontSizes.md,
        });
      }
      return handles;
    }

    function tween(mine: number, ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) return wake();
          const p = clamp01((Date.now() - start) / ms);
          draw(p);
          if (p >= 1) return wake();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function alive(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    async function playSlice(mine: number, h: Handles): Promise<void> {
      const { knife, flyers, curve } = h;
      if (knife === undefined || flyers === undefined || curve === undefined) {
        throw new Error('partial-slice-stage: 자르는 걸음의 손잡이가 없다');
      }
      // 아직 못 온 만큼으로 되돌려 둔다
      const setKnife = (p: number): void => {
        knife.line.setAttribute('x2', String(r2(knife.from.x + (knife.to.x - knife.from.x) * p)));
        knife.line.setAttribute('y2', String(r2(knife.from.y + (knife.to.y - knife.from.y) * p)));
      };
      setKnife(0);
      knife.label.setAttribute('opacity', '0');
      for (const f of flyers) f.el.setAttribute('visibility', 'hidden');
      curve.el.setAttribute('points', '');
      curve.title.setAttribute('opacity', '0');
      curve.mark.setAttribute('opacity', '0');

      await tween(mine, KNIFE_MS, (p) => setKnife(ease(p)));
      if (!alive(mine)) return;
      knife.label.removeAttribute('opacity');

      const n = flyers.length;
      for (const f of flyers) f.el.removeAttribute('visibility');
      await tween(mine, FLY_MS, (p) => {
        flyers.forEach((f, i) => {
          const lag = n > 1 ? (i / (n - 1)) * FLY_STAGGER : 0;
          const q = ease(clamp01((p - lag) / (1 - FLY_STAGGER)));
          f.el.setAttribute('cx', String(r2(f.from.x + (f.to.x - f.from.x) * q)));
          f.el.setAttribute('cy', String(r2(f.from.y + (f.to.y - f.from.y) * q)));
        });
      });
      if (!alive(mine)) return;

      const pts = curve.pts;
      await tween(mine, CURVE_MS, (p) => {
        const upto = Math.max(1, Math.round(p * (pts.length - 1)));
        curve.el.setAttribute('points', pts.slice(0, upto + 1).map((q) => `${r2(q.x)},${r2(q.y)}`).join(' '));
        curve.title.setAttribute('opacity', String(r2(p)));
      });
    }

    async function playSlope(mine: number, h: Handles): Promise<void> {
      const tg = h.tangent;
      if (tg === undefined) throw new Error('partial-slice-stage: 기울기 걸음의 손잡이가 없다');
      const set = (len: number): void => {
        tg.el.setAttribute('x1', String(r2(tg.center.x - tg.ux * len)));
        tg.el.setAttribute('y1', String(r2(tg.center.y - tg.uy * len)));
        tg.el.setAttribute('x2', String(r2(tg.center.x + tg.ux * len)));
        tg.el.setAttribute('y2', String(r2(tg.center.y + tg.uy * len)));
      };
      set(0);
      tg.label.setAttribute('opacity', '0');
      await tween(mine, TANGENT_MS, (p) => {
        set(TANGENT_HALF * ease(p));
        tg.label.setAttribute('opacity', String(r2(clamp01((p - 0.6) / 0.4))));
      });
    }

    async function playBoth(mine: number, h: Handles): Promise<void> {
      const items = h.readout;
      if (items === undefined) throw new Error('partial-slice-stage: 나란히 두는 걸음의 손잡이가 없다');
      const place = (p: number): void => {
        for (const it of items) {
          const x = it.from.x + (it.to.x - it.from.x) * p;
          const y = it.from.y + (it.to.y - it.from.y) * p;
          it.g.setAttribute('transform', `translate(${r2(x)},${r2(y)})`);
        }
      };
      place(0);
      await tween(mine, READOUT_MS, (p) => place(ease(p)));
    }

    return {
      async render(next: PartialSliceScene, _prev: PartialSliceScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        const step = next.step;
        if (!opts.animate || step === null) return;
        switch (step.kind) {
          case 'init':
            return;
          case 'slice':
            await playSlice(mine, h);
            break;
          case 'slope':
            await playSlope(mine, h);
            break;
          case 'both':
            await playBoth(mine, h);
            break;
        }
        if (alive(mine)) drawStatic(next);
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
