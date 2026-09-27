/**
 * 무대 — 위는 곡선 f 와 그 아래 쌓이는 넓이, 아래는 쌓인 넓이가 그리는 새 함수 A.
 *
 * 오른쪽 끝(세로 선)이 두 판을 함께 꿰뚫고 오른쪽으로 밀려 간다. 위 판에서는 그 뒤로
 * 넓이가 칠해지고, 아래 판에서는 A 의 자취가 따라 자란다. 두 판은 세로 한 단위의 길이가
 * 같다 — 그래서 위 판의 높이 막대와 아래 판의 "한 칸 갈 때 A 가 오르는 만큼" 막대를
 * 길이로 견줄 수 있다.
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
  type Translate,
} from '@ffacet/core/runtime';
import { formatNum, formatRaw, SYMBOLS, type APt, type Pt, type Stop } from './algorithm.js';
import type { FundamentalTheoremScene } from './scene.js';

const H = 480;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 한 걸음의 운동 길이 */
const SLIDE_MS = 600;
const ROWS_MS = 600;

/** 세로 한 단위의 상한 (px) */
const UNIT_MAX = 40;

type Motion = { kind: 'slide'; p: number } | { kind: 'rows'; p: number };

type Layout = {
  left: number;
  right: number;
  unit: number;
  sx: (x: number) => number;
  fy: (v: number) => number;
  ay: (v: number) => number;
  topTop: number;
  topBottom: number;
  botTop: number;
  botBottom: number;
  tickY: number;
  rowY: [number, number];
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 곡선 표본을 이어 그린 꺾은선 위의 높이 (그림의 보간 — 새 셈이 아니다) */
function curveAt(curve: Pt[], t: number): number {
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1];
    const b = curve[i];
    if (t >= a.t && t <= b.t) {
      const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return a.y + (b.y - a.y) * k;
    }
  }
  throw new Error(`fundamentalTheoremStage: t = ${t} 가 곡선 표본 밖이다`);
}

/** A 표본을 이은 꺾은선 위의 값 */
function pathAt(path: APt[], x: number): number {
  if (path.length === 1) {
    if (path[0].x !== x) throw new Error(`fundamentalTheoremStage: x = ${x} 가 A 표본 밖이다`);
    return path[0].a;
  }
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (x >= a.x && x <= b.x) {
      const k = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.a + (b.a - a.a) * k;
    }
  }
  throw new Error(`fundamentalTheoremStage: x = ${x} 가 A 표본 밖이다`);
}

/** 0 에서 xm 까지의 곡선 꺾은선 — 0 을 지나는 자리를 끼워 넣는다 */
function curveUpTo(curve: Pt[], xm: number): Pt[] {
  const pts: Pt[] = [];
  for (const p of curve) {
    if (p.t > xm) break;
    pts.push(p);
  }
  if (pts.length === 0) throw new Error('fundamentalTheoremStage: 곡선 표본이 오른쪽 끝보다 뒤에서 시작한다');
  if (pts[pts.length - 1].t < xm) pts.push({ t: xm, y: curveAt(curve, xm) });
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if ((a.y > 0 && b.y < 0) || (a.y < 0 && b.y > 0)) {
      const k = a.y / (a.y - b.y);
      out.push({ t: a.t + (b.t - a.t) * k, y: 0 });
    }
    out.push(b);
  }
  return out;
}

export const fundamentalTheoremStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [posFill, negFill] = categorical(2, 'vivid');
    if (posFill === undefined || negFill === undefined) throw new Error('fundamentalTheoremStage: 넓이 색 둘을 얻지 못했다');

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element = svg,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      opts: { size?: string; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: string; family?: string },
      parent: Element = svg,
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.family ?? fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
          ...(opts.weight ? { 'font-weight': opts.weight } : {}),
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function layoutOf(scene: FundamentalTheoremScene): Layout {
      const base = scene.base;
      if (base === null) throw new Error('fundamentalTheoremStage: 바탕 없이 배치를 셈했다');
      const left = 76;
      const right = W - 96;
      const [d0, d1] = base.domain;
      const [fLo, fHi] = base.fRange;
      const [aLo, aHi] = base.aRange;
      const topTop = 84;
      const gap = 26;
      const bottomReserve = 74;
      const avail = H - bottomReserve - topTop - gap;
      const unit = Math.min(UNIT_MAX, avail / (fHi - fLo + (aHi - aLo)));
      const topBottom = topTop + (fHi - fLo) * unit;
      const botTop = topBottom + gap;
      const botBottom = botTop + (aHi - aLo) * unit;
      const sx = (x: number): number => left + ((x - d0) / (d1 - d0)) * (right - left);
      const fy = (v: number): number => topTop + (fHi - v) * unit;
      const ay = (v: number): number => botTop + (aHi - v) * unit;
      const tickY = botBottom + 14;
      return { left, right, unit, sx, fy, ay, topTop, topBottom, botTop, botBottom, tickY, rowY: [tickY + 24, tickY + 46] };
    }

    function poly(pts: [number, number][]): string {
      return pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
    }

    function drawCaption(scene: FundamentalTheoremScene, cur: Stop): void {
      const step = scene.step;
      if (step === null) throw new Error('fundamentalTheoremStage: 바탕은 있는데 걸음이 없다');
      let head: string;
      if (step.kind === 'start') {
        head = t('caption.start', 'The right edge starts at the left end. Nothing is piled up yet.');
      } else if (step.kind === 'edge') {
        const vars = { was: formatNum(cur.was), a: formatNum(cur.area) };
        if (cur.area > cur.was) head = t('caption.grew', 'Edge pushed right — A grew: {was} → {a}', vars);
        else if (cur.area < cur.was) head = t('caption.gaveBack', 'Edge pushed right — A gave back: {was} → {a}', vars);
        else head = t('caption.held', 'Edge pushed right — A held: {was} → {a}', vars);
      } else {
        head = t('caption.compare', 'Rate and height at every edge, side by side.');
      }
      label(head, W / 2, 22, { size: fontSizes.md, anchor: 'middle', weight: '600' });

      let sub: string;
      if (step.kind === 'compare') {
        sub = step.match
          ? t('caption.within', 'Every pair differs by at most {tol}.', { tol: formatRaw(step.tolerance) })
          : t('caption.beyond', 'Some pair differs by more than {tol}.', { tol: formatRaw(step.tolerance) });
      } else {
        sub = t('caption.values', 'Edge x: {x} · Rate A grows: {rate} · Height f(x): {h}', {
          x: formatRaw(cur.x),
          rate: formatNum(cur.rate),
          h: formatNum(cur.height),
        });
      }
      label(sub, W / 2, 46, { size: fontSizes.sm, anchor: 'middle', fill: colors.textMuted });
    }

    function draw(scene: FundamentalTheoremScene, motion: Motion | null): void {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return;
      const cur = scene.stops[scene.stops.length - 1];
      if (cur === undefined) throw new Error('fundamentalTheoremStage: 밟은 자리가 없다');
      const L = layoutOf(scene);
      const sliding = motion?.kind === 'slide';
      const xm = sliding ? cur.from + (cur.x - cur.from) * ease(motion.p) : cur.x;
      const hm = sliding ? curveAt(base.curve, xm) : cur.height;
      const am = sliding ? pathAt(cur.path, xm) : cur.area;
      const [d0, d1] = base.domain;

      drawCaption(scene, cur);

      // ── 위 판: 곡선과 그 아래 쌓이는 넓이
      const area = curveUpTo(base.curve, xm);
      const posPts: [number, number][] = [[L.sx(area[0].t), L.fy(0)]];
      const negPts: [number, number][] = [[L.sx(area[0].t), L.fy(0)]];
      for (const p of area) {
        posPts.push([L.sx(p.t), L.fy(Math.max(p.y, 0))]);
        negPts.push([L.sx(p.t), L.fy(Math.min(p.y, 0))]);
      }
      posPts.push([L.sx(xm), L.fy(0)]);
      negPts.push([L.sx(xm), L.fy(0)]);
      el('polygon', { points: poly(posPts), fill: posFill, 'fill-opacity': '0.35', stroke: 'none' });
      el('polygon', { points: poly(negPts), fill: negFill, 'fill-opacity': '0.35', stroke: 'none' });

      // ── 오른쪽 끝 — 두 판을 함께 꿰뚫는다 (막대 · 점이 그 위에 얹히게 먼저 긋는다)
      el('line', {
        x1: L.sx(xm), y1: L.topTop - 6, x2: L.sx(xm), y2: L.botBottom + 4,
        stroke: colors.text, 'stroke-width': 1, 'stroke-dasharray': '2 3',
      });

      el('line', { x1: L.sx(d0), y1: L.fy(0), x2: L.sx(d1), y2: L.fy(0), stroke: colors.border, 'stroke-width': 1 });
      el('line', { x1: L.sx(d0), y1: L.topTop, x2: L.sx(d0), y2: L.topBottom, stroke: colors.border, 'stroke-width': 1 });
      label(SYMBOLS.curve, L.sx(d0) - 8, L.topTop + 2, { anchor: 'end', fill: colors.textMuted, family: fonts.mono });
      label(SYMBOLS.t, L.sx(d1) + 8, L.fy(0), { fill: colors.textMuted, family: fonts.mono });
      el('polyline', {
        points: poly(base.curve.map((p) => [L.sx(p.t), L.fy(p.y)])),
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
      });

      // 높이 막대 — 오른쪽 끝에서 곡선까지
      el('line', {
        x1: L.sx(xm), y1: L.fy(0), x2: L.sx(xm), y2: L.fy(hm),
        stroke: colors.itemComparing, 'stroke-width': 4,
      });
      if (!sliding) {
        // 막대 발치의 가로축 건너편에 — 곡선과 겹치지 않게
        label(t('label.height', 'height'), L.sx(xm) + 6, L.fy(0) + (hm > 0 ? 10 : -10), {
          size: fontSizes.xs, fill: colors.itemComparing, weight: '600',
        });
      }

      // ── 아래 판: 쌓인 넓이 A 가 그리는 새 함수
      el('line', { x1: L.sx(d0), y1: L.ay(0), x2: L.sx(d1), y2: L.ay(0), stroke: colors.border, 'stroke-width': 1 });
      el('line', { x1: L.sx(d0), y1: L.botTop, x2: L.sx(d0), y2: L.botBottom, stroke: colors.border, 'stroke-width': 1 });
      label(SYMBOLS.area, L.sx(d0) - 8, L.botTop + 2, { anchor: 'end', fill: colors.textMuted, family: fonts.mono });
      label(SYMBOLS.x, L.sx(d1) + 8, L.ay(0), { fill: colors.textMuted, family: fonts.mono });

      const trace: [number, number][] = [];
      scene.stops.forEach((s, i) => {
        const last = i === scene.stops.length - 1;
        for (const p of s.path) {
          if (last && p.x > xm) break;
          trace.push([L.sx(p.x), L.ay(p.a)]);
        }
      });
      trace.push([L.sx(xm), L.ay(am)]);
      el('polyline', { points: poly(trace), fill: 'none', stroke: colors.text, 'stroke-width': 2, 'stroke-linejoin': 'round' });
      for (const s of scene.stops.slice(0, -1)) {
        el('circle', { cx: L.sx(s.x), cy: L.ay(s.area), r: 3, fill: colors.textMuted });
      }

      if (!sliding) {
        // 빠르기 — 한 칸 갈 때 A 가 오르는 만큼
        const x0 = L.sx(cur.x);
        const x1 = L.sx(cur.rise.x);
        el('line', {
          x1: x0, y1: L.ay(cur.area), x2: x1, y2: L.ay(cur.rise.a),
          stroke: colors.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
        });
        el('line', { x1: x0, y1: L.ay(cur.area), x2: x1, y2: L.ay(cur.area), stroke: colors.textMuted, 'stroke-width': 1 });
        label(formatRaw(round(cur.rise.x - cur.x)), (x0 + x1) / 2, L.ay(cur.area) + (cur.rate >= 0 ? 10 : -10), {
          size: fontSizes.xs, anchor: 'middle', fill: colors.textMuted, family: fonts.mono,
        });
        el('line', {
          x1, y1: L.ay(cur.area), x2: x1, y2: L.ay(cur.rise.a),
          stroke: colors.itemComparing, 'stroke-width': 4,
        });
        label(t('label.rate', 'rate'), x1 + 8, (L.ay(cur.area) + L.ay(cur.rise.a)) / 2, {
          size: fontSizes.xs, fill: colors.itemComparing, weight: '600',
        });
      }
      el('circle', { cx: L.sx(xm), cy: L.ay(am), r: 5, fill: colors.primary, stroke: colors.bg, 'stroke-width': 1.5 });

      // 눈금
      for (let k = Math.ceil(d0); k <= Math.floor(d1); k += 1) {
        el('line', { x1: L.sx(k), y1: L.botBottom, x2: L.sx(k), y2: L.botBottom + 4, stroke: colors.border, 'stroke-width': 1 });
        label(formatRaw(k), L.sx(k), L.tickY, { size: fontSizes.xs, anchor: 'middle', fill: colors.textMuted, family: fonts.mono });
      }

      // ── 마지막 걸음: 빠르기 차례와 높이 차례를 나란히
      const step = scene.step;
      if (step?.kind === 'compare') {
        const rowsP = motion?.kind === 'rows' ? motion.p : 1;
        const n = step.rates.length;
        const colW = (L.sx(d0 + 1) - L.sx(d0)) * 0.8;
        // 줄 이름은 마지막 칸의 오른쪽에 — 첫 칸이 왼쪽 끝(x 0)에 서기 때문이다
        const lastX = L.sx(scene.stops[scene.stops.length - 1].x) + colW / 2 + 10;
        label(t('label.rate', 'rate'), lastX, L.rowY[0], { fill: colors.itemComparing, weight: '600' });
        label(t('label.height', 'height'), lastX, L.rowY[1], { fill: colors.itemComparing, weight: '600' });
        scene.stops.forEach((s, i) => {
          // 칸마다 차례로 제자리로 올라선다
          const start = n <= 1 ? 0 : (i / n) * 0.5;
          const local = Math.max(0, Math.min(1, (rowsP - start) / 0.5));
          const dy = (1 - ease(local)) * 18;
          if (local <= 0) return;
          const cx = L.sx(s.x);
          el('rect', {
            x: cx - colW / 2, y: L.rowY[0] - 10 + dy, width: colW, height: L.rowY[1] - L.rowY[0] + 20,
            rx: 4, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1,
          });
          label(formatNum(step.rates[i]), cx, L.rowY[0] + dy, { anchor: 'middle', family: fonts.mono });
          label(formatNum(step.heights[i]), cx, L.rowY[1] + dy, { anchor: 'middle', family: fonts.mono });
        });
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const begin = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - begin) / ms);
          frame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: FundamentalTheoremScene, prev: FundamentalTheoremScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const kind = next.step?.kind;
        const slides =
          opts.animate && kind === 'edge' && prev !== null && prev.stops.length === next.stops.length - 1;
        const rows = opts.animate && kind === 'compare' && prev !== null && prev.step?.kind !== 'compare';
        if (!slides && !rows) {
          draw(next, null);
          return;
        }
        if (slides) await tween(SLIDE_MS, mine, (p) => draw(next, { kind: 'slide', p }));
        else await tween(ROWS_MS, mine, (p) => draw(next, { kind: 'rows', p }));
        if (destroyed || mine !== gen) return;
        draw(next, null);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
