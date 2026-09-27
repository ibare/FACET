/**
 * secant-to-tangent 무대 — 왼쪽은 곡선과 두 점과 그 사이의 직선, 오른쪽은 기울기 눈금.
 *
 * 둘째 점이 곡선의 표본 자리(알고리즘이 실은 path)를 따라 미끄러져 오면, 직선은 첫째 점을
 * 축으로 돌고 눈금의 표지는 그 기울기를 따라 내려간다. 지나간 기울기는 눈금에 자국으로 남아
 * 자국 사이가 좁아지는 것이 "다가간다" 를 말한다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { formatTerms, type PathSample } from './algorithm.js';
import type { SecantBase, SecantToTangentScene } from './scene.js';

const H = 400;
/** 한 걸음의 운동 */
const MOVE_MS = 600;
const TICK_MS = 16;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 소수 둘째 자리 · 음의 영 금지 · 빼기는 − */
function fmt(v: number): string {
  const s = v.toFixed(2);
  if (Number(s) === 0) return '0.00';
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

/** 1차 데이터의 수는 적힌 그대로 */
function raw(v: number): string {
  return v < 0 ? `−${String(-v)}` : String(v);
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

/** 운동 중 한 프레임의 덮어쓰기 — 정적 그림의 끝 자리 대신 아직 못 온 자리 */
type Live = {
  q: PathSample | null;
  grow: number;
  /** 둘째 점이 겹쳐 드는 동안의 고리 반지름 비율 */
  ring: number;
};

function samplePath(path: readonly PathSample[], p: number): PathSample {
  if (path.length === 1) return path[0];
  const f = p * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const k = f - i;
  const s0 = path[i];
  const s1 = path[i + 1];
  return {
    x: s0.x + (s1.x - s0.x) * k,
    y: s0.y + (s1.y - s0.y) * k,
    slope: s0.slope + (s1.slope - s0.slope) * k,
  };
}

export const secantToTangentStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const W = PIECE_CANVAS_W;
    const fsSm = fontSizes.sm;
    const fsMd = fontSizes.md;
    const fsXs = fontSizes.xs;

    // 틀 — 캔버스에서 역산한다
    const PL = Math.round(W * 0.07);
    const PR = Math.round(W * 0.63);
    const PT = 78;
    const PB = H - 58;
    const MX = Math.round(PR + (W - PR) * 0.55);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(tag: string, attrs: Record<string, string | number>, parent: Element = svg): SVGElement {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function label(x: number, y: number, s: string, attrs: Record<string, string | number>): SVGElement {
      const node = el('text', { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, 'font-family': fonts.body, ...attrs });
      node.textContent = s;
      return node;
    }

    function frame(base: SecantBase) {
      const yLo = Math.min(0, ...base.curve.map((p) => p.y));
      const xHi = base.xMax * 1.08;
      const yHi = base.yMax * 1.06;
      const X = (x: number) => PL + (x / xHi) * (PR - PL);
      const Y = (y: number) => PB - ((y - yLo) / (yHi - yLo)) * (PB - PT);
      const span = base.slopeHi - base.slopeLo;
      if (!(span > 0)) throw new Error('secant-to-tangent stage: 기울기 범위가 비었다');
      const sLo = base.slopeLo - span * 0.1;
      const sHi = base.slopeHi + span * 0.1;
      const S = (s: number) => PB - ((s - sLo) / (sHi - sLo)) * (PB - PT);
      /** 첫째 점을 지나는 기울기 s 의 직선을 틀 안으로 잘라 낸 두 끝 (자료 좌표) */
      const clip = (s: number): [number, number, number, number] => {
        let xa = 0;
        let xb = xHi;
        if (s !== 0) {
          const x0 = base.a + (yLo - base.fa) / s;
          const x1 = base.a + (yHi - base.fa) / s;
          xa = Math.max(xa, Math.min(x0, x1));
          xb = Math.min(xb, Math.max(x0, x1));
        }
        return [xa, base.fa + s * (xa - base.a), xb, base.fa + s * (xb - base.a)];
      };
      return { X, Y, S, clip, yLo };
    }

    function draw(scene: SecantToTangentScene, live: Live | null): void {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return; // 알고리즘의 init 전 — 그릴 바탕이 아직 없다
      const { X, Y, S, clip, yLo } = frame(base);
      const line = scene.line;

      // 캡션 — 지금 일어나는 일
      let caption: string;
      let readout: string | null = null;
      if (line === null) {
        caption = t('caption.start', 'First point: ({x}, {y})', { x: raw(base.a), y: fmt(base.fa) });
      } else if (line.kind === 'secant') {
        caption =
          scene.trail.length === 1
            ? t('caption.place', 'A second point to the right, joined by a secant')
            : t('caption.slide', 'The second point slides closer along the curve');
        readout = t('readout.secant', 'h = {h} · secant slope {s} · gap to the tangent {d}', {
          h: raw(line.h),
          s: fmt(line.slope),
          d: fmt(line.gap),
        });
      } else {
        caption = t('caption.touch', 'The two points meet');
        readout = t('readout.tangent', 'tangent slope f′(a) = {s}', { s: fmt(line.slope) });
      }
      label(PL, 26, caption, { 'font-size': fsMd, 'font-weight': 600, fill: colors.text });
      if (readout !== null) label(PL, 48, readout, { 'font-size': fsSm, fill: colors.text });

      // 축
      const axisY = Y(0);
      el('line', { x1: PL, y1: axisY, x2: PR, y2: axisY, stroke: colors.border, 'stroke-width': 1 });
      el('line', { x1: X(0), y1: PT, x2: X(0), y2: Y(yLo), stroke: colors.border, 'stroke-width': 1 });
      label(PR + 6, axisY + 4, t('label.axisX', 'x'), { 'font-size': fsSm, fill: colors.textMuted, 'font-style': 'italic' });
      label(X(0) - 4, PT - 6, t('label.axisY', 'y'), {
        'font-size': fsSm,
        fill: colors.textMuted,
        'font-style': 'italic',
        'text-anchor': 'end',
      });

      // 곡선
      el('polyline', {
        points: base.curve.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' '),
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 2,
      });
      const tag = base.curve[Math.round((base.curve.length - 1) * 0.3)];
      label(X(tag.x) - 8, Y(tag.y) - 10, t('label.curve', 'f(x) = {expr}', { expr: formatTerms(base.terms) }), {
        'font-size': fsSm,
        fill: colors.textMuted,
        'text-anchor': 'end',
      });

      // 첫째 점의 발
      const ax = X(base.a);
      const ay = Y(base.fa);
      el('line', { x1: ax, y1: ay, x2: ax, y2: axisY, stroke: colors.border, 'stroke-dasharray': '3 3' });
      label(ax, axisY + 16, t('label.a', 'a'), { 'font-size': fsSm, fill: colors.text, 'text-anchor': 'middle', 'font-style': 'italic' });

      // 둘째 점 — 할선일 때만. 운동 중이면 지나는 자리
      const q =
        live?.q ?? (line !== null && line.kind === 'secant' ? { x: line.qx, y: line.qy, slope: line.slope } : null);
      const slope = live?.q?.slope ?? (line === null ? null : line.slope);
      const isTangent = line !== null && line.kind === 'tangent' && live === null;
      const grow = live?.grow ?? 1;

      if (q !== null && !isTangent) {
        const qx = X(q.x);
        const qy = Y(q.y);
        // 오른 만큼 · 간 만큼
        el('path', {
          d: `M${ax.toFixed(1)},${ay.toFixed(1)} H${qx.toFixed(1)} V${qy.toFixed(1)}`,
          fill: 'none',
          stroke: colors.itemActive,
          'stroke-width': 1,
          'stroke-dasharray': '4 3',
          opacity: 0.7,
        });
        el('line', { x1: qx, y1: qy, x2: qx, y2: axisY, stroke: colors.border, 'stroke-dasharray': '3 3' });
        // 거리 h 의 괄호
        const by = axisY + 28;
        el('path', {
          d: `M${ax.toFixed(1)},${(by - 5).toFixed(1)} V${by.toFixed(1)} H${qx.toFixed(1)} V${(by - 5).toFixed(1)}`,
          fill: 'none',
          stroke: colors.itemActive,
          'stroke-width': 1.5,
        });
        if (live === null && line !== null && line.kind === 'secant') {
          label((ax + qx) / 2 + (qx - ax < 40 ? 20 : 0), by + 16, t('label.h', 'h = {h}', { h: raw(line.h) }), {
            'font-size': fsSm,
            fill: colors.text,
            'text-anchor': qx - ax < 40 ? 'start' : 'middle',
          });
        }
      }

      // 직선 — 첫째 점을 축으로
      if (slope !== null) {
        const [x0, y0, x1, y1] = clip(slope);
        const ex0 = ax + (X(x0) - ax) * grow;
        const ey0 = ay + (Y(y0) - ay) * grow;
        const ex1 = ax + (X(x1) - ax) * grow;
        const ey1 = ay + (Y(y1) - ay) * grow;
        el('line', {
          x1: ex0.toFixed(1),
          y1: ey0.toFixed(1),
          x2: ex1.toFixed(1),
          y2: ey1.toFixed(1),
          stroke: isTangent ? colors.primary : colors.itemActive,
          'stroke-width': isTangent ? 3 : 2,
          'stroke-linecap': 'round',
        });
        if (live === null) {
          label(
            ex1 + 6,
            ey1 + (ey1 < PT + 8 ? 14 : 4),
            isTangent ? t('label.tangent', 'tangent') : t('label.secant', 'secant'),
            { 'font-size': fsSm, fill: isTangent ? colors.primary : colors.itemActive, 'font-weight': 600 },
          );
        }
      }

      // 점 — 둘째 점은 첫째 점 위에 겹쳐 들 수 있어 고리로
      el('circle', { cx: ax, cy: ay, r: 5, fill: colors.text });
      if (q !== null && !isTangent) {
        const r = 8 * grow * (live?.ring ?? 1);
        el('circle', { cx: X(q.x), cy: Y(q.y), r: r.toFixed(2), fill: 'none', stroke: colors.itemActive, 'stroke-width': 2.5 });
      }
      if (isTangent) {
        el('circle', { cx: ax, cy: ay, r: 9, fill: 'none', stroke: colors.primary, 'stroke-width': 2 });
      }

      // 기울기 눈금
      el('line', { x1: MX, y1: PT, x2: MX, y2: PB, stroke: colors.border, 'stroke-width': 2 });
      label(MX, PT - 12, t('label.slope', 'Slope'), {
        'font-size': fsSm,
        fill: colors.text,
        'font-weight': 600,
        'text-anchor': 'middle',
      });
      if (line !== null) {
        // 접선 기울기 — 할선이 다가가는 자리
        const ty = S(base.tangent);
        el('line', {
          x1: MX - 22,
          y1: ty,
          x2: MX,
          y2: ty,
          stroke: colors.primary,
          'stroke-width': 2,
          'stroke-dasharray': isTangent ? 'none' : '4 3',
        });
        label(MX - 28, ty + 4, t('label.target', 'tangent {s}', { s: fmt(base.tangent) }), {
          'font-size': fsXs,
          fill: colors.primary,
          'text-anchor': 'end',
        });
      }
      // 지나간 할선 기울기 — 자국
      const current = line !== null && line.kind === 'secant' ? scene.trail.length - 1 : scene.trail.length;
      scene.trail.forEach((s, i) => {
        if (i === current) return;
        const sy = S(s);
        el('line', { x1: MX - 8, y1: sy, x2: MX + 8, y2: sy, stroke: colors.textMuted, 'stroke-width': 2 });
        label(MX + 14, sy + 4, fmt(s), { 'font-size': fsXs, fill: colors.textMuted });
      });
      // 지금의 표지
      if (slope !== null && !isTangent) {
        const my = S(slope);
        const r = 6 * grow;
        el('path', {
          d: `M${(MX + 2).toFixed(1)},${my.toFixed(1)} l${(r * 1.6).toFixed(2)},${(-r).toFixed(2)} v${(2 * r).toFixed(2)} z`,
          fill: colors.itemActive,
        });
        if (live === null) {
          label(MX + 18, my + 4, fmt(slope), { 'font-size': fsSm, fill: colors.itemActive, 'font-weight': 700 });
        }
      }
    }

    function tween(ms: number, mine: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const done = () => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = () => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          onFrame(ease(p));
          if (p >= 1) {
            done();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: SecantToTangentScene,
      _prev: SecantToTangentScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || step === null || next.base === null) {
        draw(next, null);
        return;
      }
      if (step.kind === 'place') {
        await tween(MOVE_MS, mine, (p) => draw(next, { q: null, grow: p, ring: 1 }));
      } else if (step.kind === 'slide') {
        await tween(MOVE_MS, mine, (p) => draw(next, { q: samplePath(step.path, p), grow: 1, ring: 1 }));
      } else {
        // 마지막 걸음 — 둘째 점이 첫째 점으로 겹쳐 들고 고리가 줄어든다. 선은 도착할 때까지 할선의 빛깔
        const touch = step.path;
        await tween(MOVE_MS, mine, (p) => draw(next, { q: samplePath(touch, p), grow: 1, ring: 1 - 0.4 * p }));
      }
      if (destroyed || mine !== gen) return;
      draw(next, null);
    }

    return {
      render,
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
