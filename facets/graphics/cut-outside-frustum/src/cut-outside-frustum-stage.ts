/**
 * 절두체 클리핑의 무대.
 *
 * 왼쪽은 x/w, y/w 평면 — 틀(−1..1 의 네모)과 삼각형. 면 하나로 자를 때 그 면의 선이 서고 바깥이
 * 옅게 칠해진다. 버려지는 꼭짓점 자리에서 새 꼭짓점 둘이 갈라져 나와 모서리를 따라 미끄러져
 * 경계 위에 선다. 버린 꼭짓점은 × 로 남고, 버린 모서리 토막은 점선이다. 마지막에 꼭짓점 0 에서
 * 대각선이 뻗어 다각형이 삼각형으로 나뉜다.
 *
 * 오른쪽은 다각형 차례 — 꼭짓점마다 클립 좌표 (x, y, z, w) 와 그 걸음의 d(또는 t).
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette } from '@ffacet/core/runtime';
import { toNdc } from './algorithm.js';
import type { PlaneId, Vec4 } from './algorithm.js';
import type { CutOutsideFrustumScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 410;
const PAD = 12;
const PLOT_TOP = 64;
const PANEL_GAP = 22;
/** 왼쪽 판의 한 변 상한 — 오른쪽 차례표가 들어갈 폭을 남긴다. */
const PLOT_MAX = 330;
const MOTION_MS = 1000;
const FRAME_MS = 16;
const MINUS = '−';

type Pt = readonly [number, number];

function fmt3(v: number): string {
  const s = v.toFixed(3);
  if (s === '-0.000') return '0.000';
  return s.replace('-', MINUS);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

export const cutOutsideFrustumStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);
    const mdPx = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el(name: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function text(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): void {
      const node = el('text', { x, y, 'font-family': fonts.body, ...attrs }, parent);
      node.textContent = s;
    }

    function planeLabel(p: PlaneId): string {
      switch (p) {
        case 'left':
          return t('label.left', 'left');
        case 'right':
          return t('label.right', 'right');
        case 'bottom':
          return t('label.bottom', 'bottom');
        case 'top':
          return t('label.top', 'top');
        case 'near':
          return t('label.near', 'near');
        case 'far':
          return t('label.far', 'far');
        default:
          throw new Error(`모르는 면 ${String(p)}`);
      }
    }

    function planeFormula(p: PlaneId): string {
      switch (p) {
        case 'left':
          return t('formula.left', 'w + x');
        case 'right':
          return t('formula.right', 'w − x');
        case 'bottom':
          return t('formula.bottom', 'w + y');
        case 'top':
          return t('formula.top', 'w − y');
        case 'near':
          return t('formula.near', 'w + z');
        case 'far':
          return t('formula.far', 'w − z');
        default:
          throw new Error(`모르는 면 ${String(p)}`);
      }
    }

    function vertexOf(scene: CutOutsideFrustumScene, id: string): Vec4 {
      const v = scene.vertices[id];
      if (v === undefined) throw new Error(`꼭짓점 ${id} 가 장면에 없다`);
      return v;
    }

    /** x/w, y/w 판의 축척 — 처음 삼각형과 틀을 함께 담는 정사각형. */
    function plotMapper(scene: CutOutsideFrustumScene): { map: (p: Pt) => Pt; side: number; lo: number; hi: number } {
      let minX = -1;
      let maxX = 1;
      let minY = -1;
      let maxY = 1;
      for (const v of scene.original) {
        const [x, y] = toNdc(v.clip);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const span = Math.max(maxX - minX, maxY - minY) * 1.14;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const side = Math.min(PLOT_MAX, H - PLOT_TOP - PAD, W * 0.56);
      const k = side / span;
      const x0 = PAD;
      const y0 = PLOT_TOP;
      const map = (p: Pt): Pt => [x0 + side / 2 + (p[0] - cx) * k, y0 + side / 2 - (p[1] - cy) * k];
      return { map, side, lo: cx - span / 2, hi: cx + span / 2 };
    }

    function ndcOf(scene: CutOutsideFrustumScene, id: string): Pt {
      return toNdc(vertexOf(scene, id));
    }

    function lerp(a: Pt, b: Pt, k: number): Pt {
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }

    function pts(list: readonly Pt[]): string {
      return list.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
    }

    /** 장면 하나를 통째로 세운다. progress 는 이번 걸음 운동의 진행(1 이면 정지 화면). */
    function draw(scene: CutOutsideFrustumScene, progress: number): void {
      svg.textContent = '';
      const step = scene.step;
      const { map, side, lo, hi } = plotMapper(scene);
      const plotLeft = PAD;
      const plotRight = PAD + side;
      const plotBottom = PLOT_TOP + side;

      // 캡션 — 지금 일어나는 일만.
      let line1 = '';
      let line2 = '';
      if (step.kind === 'start') {
        line1 = t('caption.start', 'Triangle {ids} in clip space', { ids: scene.polygon.join('') });
        line2 = t('caption.startRule', 'Inside the frame: −w ≤ x, y, z ≤ w');
      } else if (step.kind === 'cut') {
        line1 = t('caption.cut', 'Cut by the {plane} face: inside where d = {formula} > 0', {
          plane: planeLabel(step.plane),
          formula: planeFormula(step.plane),
        });
        line2 = t('caption.cutResult', 'Dropped: {dropped} · new on the boundary: {added} · vertices {before} → {after}', {
          dropped: step.dropped.join(', '),
          added: step.added.map((a) => a.id).join(', '),
          before: step.before,
          after: scene.polygon.length,
        });
      } else {
        line1 = t('caption.fan', 'Split from vertex 0 into triangles: {count}', { count: step.triangles.length });
        line2 = t('caption.fanArea', 'Area in x/w, y/w: {before} → {after} · frame {frame}', {
          before: fmt3(step.areaBefore),
          after: fmt3(step.areaAfter),
          frame: step.frameArea,
        });
      }
      text(svg, PAD, 24, line1, { 'font-size': fontSizes.md, fill: colors.text, 'font-weight': 600 });
      text(svg, PAD, 24 + mdPx + 8, line2, { 'font-size': fontSizes.sm, fill: colors.textMuted });

      const plot = el('g', {}, svg);
      el('rect', { x: plotLeft, y: PLOT_TOP, width: side, height: side, fill: colors.bgSubtle, stroke: 'none' }, plot);

      // 이번 걸음의 면 — 바깥을 옅게 칠하고 그 선을 세운다 (near · far 는 이 판에 선이 없다).
      if (step.kind === 'cut') {
        const edge = planeEdge(step.plane, map, lo, hi);
        if (edge !== null) {
          el('polygon', { points: pts(edge.outside), fill: colors.danger, 'fill-opacity': 0.08, stroke: 'none' }, plot);
        }
      }

      // 틀
      const [fx0, fy0] = map([-1, 1]);
      const [fx1, fy1] = map([1, -1]);
      el('rect', { x: fx0, y: fy0, width: fx1 - fx0, height: fy1 - fy0, fill: colors.bg, stroke: colors.text, 'stroke-width': 1.5 }, plot);
      text(plot, fx0 + 6, fy0 + xsPx + 4, t('label.frame', 'frame'), { 'font-size': fontSizes.xs, fill: colors.textMuted });
      text(plot, plotLeft + 6, plotBottom - 8, t('label.axes', 'x/w, y/w'), { 'font-size': fontSizes.xs, fill: colors.textMuted });

      // 처음 삼각형 — 줄어든 만큼을 견주는 바탕
      el(
        'polygon',
        {
          points: pts(scene.original.map((v) => map(toNdc(v.clip)))),
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '4 4',
        },
        plot,
      );

      // 새 꼭짓점의 지금 자리 — 운동 중엔 버린 꼭짓점에서 모서리를 따라 경계로 미끄러진다.
      const pos = new Map<string, Pt>();
      for (const id of scene.polygon) pos.set(id, ndcOf(scene, id));
      const outsideEnd = new Map<string, string>();
      if (step.kind === 'cut') {
        for (const a of step.added) {
          const far = step.dropped.includes(a.from) ? a.from : step.dropped.includes(a.to) ? a.to : null;
          if (far === null) throw new Error(`새 꼭짓점 ${a.id} 의 모서리 ${a.from}→${a.to} 에 버린 끝이 없다`);
          outsideEnd.set(a.id, far);
          pos.set(a.id, lerp(ndcOf(scene, far), ndcOf(scene, a.id), ease(progress)));
        }
      }
      const posOf = (id: string): Pt => {
        const p = pos.get(id);
        if (p === undefined) throw new Error(`꼭짓점 ${id} 의 자리가 없다`);
        return p;
      };

      // 버린 모서리 토막 — 새 꼭짓점에서 버린 끝까지 점선
      if (step.kind === 'cut') {
        for (const a of step.added) {
          const far = outsideEnd.get(a.id);
          if (far === undefined) throw new Error(`새 꼭짓점 ${a.id} 의 버린 끝이 없다`);
          const [x1, y1] = map(ndcOf(scene, far));
          const [x2, y2] = map(posOf(a.id));
          el('line', { x1, y1, x2, y2, stroke: colors.danger, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, plot);
        }
      }

      // 지금 다각형
      const polyPts = scene.polygon.map((id) => map(posOf(id)));
      if (step.kind === 'fan') {
        const tones = categorical(step.triangles.length, 'pastel');
        step.triangles.forEach((tri, i) => {
          const tone = tones[i];
          if (tone === undefined) throw new Error(`삼각형 ${i} 의 색이 없다`);
          const corners = tri.map((k) => {
            const p = polyPts[k];
            if (p === undefined) throw new Error(`삼각형 ${i} 의 자리 ${k} 가 다각형에 없다`);
            return p;
          });
          el('polygon', { points: pts(corners), fill: tone, 'fill-opacity': 0.85 * ease(progress), stroke: 'none' }, plot);
        });
      } else {
        el('polygon', { points: pts(polyPts), fill: colors.primary, 'fill-opacity': 0.14, stroke: 'none' }, plot);
      }
      el('polygon', { points: pts(polyPts), fill: 'none', stroke: colors.primary, 'stroke-width': 2, 'stroke-linejoin': 'round' }, plot);

      // 부채꼴 대각선 — 꼭짓점 0 에서 뻗는다
      if (step.kind === 'fan') {
        const apex = polyPts[0];
        if (apex === undefined) throw new Error('다각형에 꼭짓점 0 이 없다');
        const diagonals = new Set<number>();
        for (const tri of step.triangles) {
          for (const k of tri) if (k !== 0 && k !== 1 && k !== scene.polygon.length - 1) diagonals.add(k);
        }
        for (const k of diagonals) {
          const target = polyPts[k];
          if (target === undefined) throw new Error(`대각선 끝 ${k} 가 없다`);
          const [x2, y2] = lerp(apex, target, ease(progress));
          el('line', { x1: apex[0], y1: apex[1], x2, y2, stroke: colors.primary, 'stroke-width': 2 }, plot);
        }
      }

      // 자르는 면의 선 — 틀의 한 변을 판 끝까지 늘인다
      if (step.kind === 'cut') {
        const edge = planeEdge(step.plane, map, lo, hi);
        if (edge !== null) {
          el('line', { x1: edge.line[0][0], y1: edge.line[0][1], x2: edge.line[1][0], y2: edge.line[1][1], stroke: colors.accent, 'stroke-width': 3 }, plot);
        }
      }

      // 꼭짓점 — 버린 것은 ×, 이번에 선 것은 강조, 나머지는 점
      const cen = centroid(scene.original.map((v) => toNdc(v.clip)));
      const labelAt = (p: Pt, id: string, color: string): void => {
        const dx = p[0] - cen[0];
        const dy = p[1] - cen[1];
        const len = Math.hypot(dx, dy);
        if (len === 0) throw new Error(`꼭짓점 ${id} 가 무게중심에 있다`);
        const [sx, sy] = map(p);
        text(plot, sx + (dx / len) * 13, sy - (dy / len) * 13 + smPx / 3, id, {
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
          'font-weight': 600,
          fill: color,
          'text-anchor': 'middle',
        });
      };
      if (step.kind === 'cut') {
        for (const id of step.dropped) {
          const p = ndcOf(scene, id);
          const [sx, sy] = map(p);
          const r = 5;
          el('line', { x1: sx - r, y1: sy - r, x2: sx + r, y2: sy + r, stroke: colors.danger, 'stroke-width': 2 }, plot);
          el('line', { x1: sx - r, y1: sy + r, x2: sx + r, y2: sy - r, stroke: colors.danger, 'stroke-width': 2 }, plot);
          labelAt(p, id, colors.danger);
        }
      }
      const fresh = new Set(step.kind === 'cut' ? step.added.map((a) => a.id) : []);
      for (const id of scene.polygon) {
        const p = posOf(id);
        const [sx, sy] = map(p);
        if (fresh.has(id)) {
          el('circle', { cx: sx, cy: sy, r: 5.5, fill: colors.accent, stroke: colors.text, 'stroke-width': 1.5 }, plot);
        } else {
          el('circle', { cx: sx, cy: sy, r: 4, fill: colors.text }, plot);
        }
        if (!fresh.has(id) || progress >= 1) labelAt(p, id, colors.text);
      }

      drawPanel(scene, plotRight + PANEL_GAP);
    }

    function planeEdge(p: PlaneId, map: (q: Pt) => Pt, lo: number, hi: number): { line: [Pt, Pt]; outside: Pt[] } | null {
      const BIG = 1e3;
      let a: Pt;
      let b: Pt;
      let o1: Pt;
      let o2: Pt;
      switch (p) {
        case 'right':
          [a, b, o1, o2] = [[1, -BIG], [1, BIG], [BIG, BIG], [BIG, -BIG]];
          break;
        case 'left':
          [a, b, o1, o2] = [[-1, -BIG], [-1, BIG], [-BIG, BIG], [-BIG, -BIG]];
          break;
        case 'top':
          [a, b, o1, o2] = [[-BIG, 1], [BIG, 1], [BIG, BIG], [-BIG, BIG]];
          break;
        case 'bottom':
          [a, b, o1, o2] = [[-BIG, -1], [BIG, -1], [BIG, -BIG], [-BIG, -BIG]];
          break;
        case 'near':
        case 'far':
          return null;
        default:
          throw new Error(`모르는 면 ${String(p)}`);
      }
      // 판 안으로 잘라 그린다 — 판 바깥 좌표를 판 경계로 끌어온다.
      const clampPt = (q: Pt): Pt => map([Math.min(hi, Math.max(lo, q[0])), Math.min(hi, Math.max(lo, q[1]))]);
      return { line: [clampPt(a), clampPt(b)], outside: [clampPt(a), clampPt(b), clampPt(o1), clampPt(o2)] };
    }

    function centroid(list: readonly Pt[]): Pt {
      let sx = 0;
      let sy = 0;
      for (const p of list) {
        sx += p[0];
        sy += p[1];
      }
      return [sx / list.length, sy / list.length];
    }

    function drawPanel(scene: CutOutsideFrustumScene, x: number): void {
      const step = scene.step;
      const panel = el('g', {}, svg);
      const bottom = H - PAD;
      const width = W - PAD - x;
      const fresh = new Map(step.kind === 'cut' ? step.added.map((a) => [a.id, a] as const) : []);
      const dist = new Map(step.kind === 'cut' ? step.distances.map((e) => [e.id, e.d] as const) : []);
      const dropped = step.kind === 'cut' ? step.dropped : [];
      const tris = step.kind === 'fan' ? step.triangles : [];

      const headH = smPx + 10;
      const rowsWanted = scene.polygon.length + dropped.length;
      const extraH = (dropped.length > 0 ? headH : 0) + (tris.length > 0 ? headH + tris.length * (smPx + 6) : 0);
      const rowH = Math.min(34, (bottom - PLOT_TOP - headH - extraH) / rowsWanted);
      if (!(rowH > smPx + xsPx)) throw new Error('차례표가 캔버스에 들어가지 않는다');

      let y = PLOT_TOP + smPx;
      text(panel, x, y, t('label.polygon', 'Polygon, in order'), { 'font-size': fontSizes.sm, fill: colors.textMuted, 'font-weight': 600 });
      y += headH - smPx;

      const coord = (v: Vec4): string => `(${v.map(fmt3).join(', ')})`;

      const row = (index: string, id: string, second: string, kind: 'keep' | 'fresh' | 'dropped'): void => {
        const v = vertexOf(scene, id);
        const ink = kind === 'dropped' ? colors.danger : colors.text;
        const base = y + smPx;
        if (kind === 'fresh') {
          el('rect', { x: x - 6, y: y + 1, width: 3, height: rowH - 6, fill: colors.accent }, panel);
        }
        text(panel, x, base, index, { 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: colors.textMuted });
        text(panel, x + 16, base, id, { 'font-size': fontSizes.sm, 'font-family': fonts.mono, fill: ink, 'font-weight': 600 });
        text(panel, x + 32, base, coord(v), {
          'font-size': fontSizes.xs,
          'font-family': fonts.mono,
          fill: ink,
          'text-decoration': kind === 'dropped' ? 'line-through' : 'none',
        });
        text(panel, x + 32, base + xsPx + 3, second, { 'font-size': fontSizes.xs, 'font-family': fonts.mono, fill: kind === 'dropped' ? colors.danger : colors.textMuted });
        y += rowH;
      };

      const secondLine = (id: string): string => {
        if (step.kind === 'cut') {
          const d = dist.get(id);
          if (d === undefined) throw new Error(`꼭짓점 ${id} 의 d 가 없다`);
          const a = fresh.get(id);
          if (a !== undefined) return t('row.new', 'd {d} · t {t} · edge {from}→{to}', { d: fmt3(d), t: fmt3(a.param), from: a.from, to: a.to });
          return t('row.d', 'd {d}', { d: fmt3(d) });
        }
        const [nx, ny] = ndcOf(scene, id);
        return t('row.ndc', 'x/w, y/w ({x}, {y})', { x: fmt3(nx), y: fmt3(ny) });
      };

      scene.polygon.forEach((id, i) => row(String(i), id, secondLine(id), fresh.has(id) ? 'fresh' : 'keep'));

      if (dropped.length > 0) {
        y += 4;
        text(panel, x, y + smPx, t('label.dropped', 'Dropped'), { 'font-size': fontSizes.sm, fill: colors.danger, 'font-weight': 600 });
        y += headH;
        for (const id of dropped) row('', id, secondLine(id), 'dropped');
      }

      if (tris.length > 0) {
        y += 4;
        text(panel, x, y + smPx, t('label.triangles', 'Triangles'), { 'font-size': fontSizes.sm, fill: colors.textMuted, 'font-weight': 600 });
        y += headH;
        const tones = categorical(tris.length, 'pastel');
        tris.forEach((tri, i) => {
          const tone = tones[i];
          if (tone === undefined) throw new Error(`삼각형 ${i} 의 색이 없다`);
          el('rect', { x, y: y + 1, width: 12, height: smPx, fill: tone, stroke: colors.border }, panel);
          const ids = tri.map((k) => {
            const id = scene.polygon[k];
            if (id === undefined) throw new Error(`삼각형 ${i} 의 자리 ${k} 가 없다`);
            return id;
          });
          text(panel, x + 18, y + smPx, `(${tri.join(', ')})  ${ids.join(' ')}`, {
            'font-size': fontSizes.sm,
            'font-family': fonts.mono,
            fill: colors.text,
          });
          y += smPx + 6;
        });
      }
      if (y > bottom + 1 || width <= 0) throw new Error('차례표가 캔버스를 넘는다');
    }

    function drawStatic(scene: CutOutsideFrustumScene): void {
      draw(scene, 1);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function animate(scene: CutOutsideFrustumScene, mine: number): Promise<void> {
      const frames = Math.ceil(MOTION_MS / FRAME_MS);
      for (let f = 0; f <= frames; f += 1) {
        if (mine !== gen || destroyed) return;
        draw(scene, Math.min(0.999, f / frames));
        await wait(FRAME_MS);
      }
    }

    return {
      async render(next: CutOutsideFrustumScene, _prev: CutOutsideFrustumScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step.kind === 'start') {
          drawStatic(next);
          return;
        }
        await animate(next, mine);
        if (mine !== gen || destroyed) return;
        drawStatic(next);
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
