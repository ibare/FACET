/**
 * 무대 — 왼쪽은 규칙이 점을 옮기는 평면, 오른쪽은 빈 칸이 한 열씩 채워지는 행렬.
 *
 * 동사는 "채워진다". 규칙이 기저를 옮긴 자리의 두 수가 평면에서 떨어져 나와
 * 행렬의 빈 열로 내려앉는다 (가로로 적힌 좌표가 세로 한 열로 선다).
 * 다 채운 뒤 시험 점은 두 길로 간다 — 규칙은 평면 위에서 돌고, 행렬은 제 곁에서
 * 결과를 내보내 평면의 같은 자리로 떨어뜨린다.
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import { formatNum, formatPoint, type Vec2 } from './algorithm.js';
import type { ColumnsScene } from './scene.js';

const SVG = 'http://www.w3.org/2000/svg';
const H = 360;
/** 평면이 보여 주는 좌표 범위 (±). 가장 큰 좌표 2 가 틀 안에 들도록 */
const RANGE = 2.5;
const TOP = 46;
const BOTTOM = 66;
const PAD = 20;
/** 행렬 칸 크기의 상한 */
const CELL_W_MAX = 84;
const CELL_H_MAX = 56;
const MOVE_MS = 600;
const FRAME_MS = 16;

type Hold = 'none' | 'rule' | 'fill' | 'testRule' | 'testMatrix';

type Layout = {
  cx: number;
  cy: number;
  unit: number;
  size: number;
  left: number;
  mx: number;
  my: number;
  cellW: number;
  cellH: number;
};

function layout(): Layout {
  const size = H - TOP - BOTTOM;
  const left = PAD;
  const unit = size / (2 * RANGE);
  const regionL = left + size + PAD * 2;
  const regionW = PIECE_CANVAS_W - PAD - regionL;
  const cellW = Math.min(CELL_W_MAX, regionW / 4.5);
  const cellH = Math.min(CELL_H_MAX, size / 5);
  return {
    cx: left + size / 2,
    cy: TOP + size / 2,
    unit,
    size,
    left,
    mx: regionL + regionW / 2 + cellW * 0.4,
    my: TOP + size / 2 - cellH * 0.6,
    cellW,
    cellH,
  };
}

function r2(n: number): number {
  const v = Math.round(n * 100) / 100;
  return v === 0 ? 0 : v;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
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
  const node = el(parent, 'text', {
    x,
    y,
    'font-family': fonts.body,
    'dominant-baseline': 'middle',
    ...attrs,
  });
  node.textContent = text;
  return node;
}

function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`matrix-columns-are-basis-stage: ${what} 이 없다`);
  return v;
}

export const matrixColumnsAreBasisStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const colColors = categorical(2, params.theme === 'dark' ? 'vivid' : 'deep');
    const L = layout();
    const smPx = parseFloat(fontSizes.sm);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const toX = (x: number): number => L.cx + x * L.unit;
    const toY = (y: number): number => L.cy - y * L.unit;

    function colColor(i: number): string {
      return need(colColors[i], `${i} 열의 색`);
    }

    /**
     * 점 이름표 자리 — 원점에서 바깥쪽으로 비켜 선다.
     * 축 위의 점은 눈금 글자(x 축 아래 · y 축 왼쪽)를 피해 위 · 오른쪽에 선다.
     */
    function labelAt(p: Vec2): { x: number; y: number; anchor: string } {
      if (p[1] === 0) return { x: toX(p[0]), y: toY(0) - smPx * 1.4, anchor: 'middle' };
      if (p[0] === 0) return { x: toX(0) + smPx * 1.1, y: toY(p[1]) - smPx * 0.9, anchor: 'start' };
      const len = Math.hypot(p[0], p[1]);
      const dx = len === 0 ? 1 : p[0] / len;
      const dy = len === 0 ? 1 : p[1] / len;
      const off = smPx * 1.8;
      const anchor = dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle';
      return { x: toX(p[0]) + dx * off, y: toY(p[1]) - dy * off, anchor };
    }

    /** 행렬 칸 중심. r = 행, c = 열 */
    function cellAt(r: number, c: number): { x: number; y: number } {
      return { x: L.mx + (c - 0.5) * L.cellW, y: L.my + (r - 0.5) * L.cellH };
    }

    function productY(): number {
      return L.my + L.cellH * 2.3;
    }

    function drawPlane(g: Element): void {
      const lo = -RANGE;
      const hi = RANGE;
      for (let k = Math.ceil(lo); k <= Math.floor(hi); k += 1) {
        if (k === 0) continue;
        el(g, 'line', { x1: toX(k), y1: toY(lo), x2: toX(k), y2: toY(hi), stroke: colors.border, 'stroke-width': 1 });
        el(g, 'line', { x1: toX(lo), y1: toY(k), x2: toX(hi), y2: toY(k), stroke: colors.border, 'stroke-width': 1 });
        label(g, toX(k), toY(0) + smPx * 0.9, formatNum(k), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'middle',
        });
        label(g, toX(0) - smPx * 0.5, toY(k), formatNum(k), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
          'text-anchor': 'end',
        });
      }
      el(g, 'line', { x1: toX(lo), y1: toY(0), x2: toX(hi), y2: toY(0), stroke: colors.textMuted, 'stroke-width': 1.2 });
      el(g, 'line', { x1: toX(0), y1: toY(lo), x2: toX(0), y2: toY(hi), stroke: colors.textMuted, 'stroke-width': 1.2 });
    }

    function basisDot(g: Element, p: Vec2, color: string, hollow: boolean, r: number): SVGCircleElement {
      return el(g, 'circle', {
        cx: toX(p[0]),
        cy: toY(p[1]),
        r,
        fill: hollow ? 'none' : color,
        stroke: color,
        'stroke-width': 2,
        ...(hollow ? { 'stroke-dasharray': '3 2' } : {}),
      });
    }

    function testMark(g: Element, x: number, y: number, hollow: boolean): SVGRectElement {
      const s = smPx * 0.95;
      return el(g, 'rect', {
        x: x - s / 2,
        y: y - s / 2,
        width: s,
        height: s,
        fill: hollow ? colors.bg : colors.accent,
        stroke: colors.text,
        'stroke-width': 1.5,
        ...(hollow ? { 'stroke-dasharray': '3 2' } : {}),
      });
    }

    function pointLabel(g: Element, p: Vec2, color: string): SVGTextElement {
      const at = labelAt(p);
      return label(g, at.x, at.y, formatPoint(p), {
        'font-size': fontSizes.sm,
        'font-weight': 600,
        stroke: colors.bg,
        'stroke-width': 4,
        'stroke-linejoin': 'round',
        'paint-order': 'stroke',
        fill: color,
        'text-anchor': at.anchor,
      });
    }

    function drawMatrix(g: Element, scene: ColumnsScene, hold: Hold): void {
      const top = L.my - L.cellH;
      const bottom = L.my + L.cellH;
      const leftX = L.mx - L.cellW;
      const rightX = L.mx + L.cellW;
      const lip = L.cellW * 0.14;
      el(g, 'path', {
        d: `M ${r2(leftX + lip)} ${r2(top)} H ${r2(leftX)} V ${r2(bottom)} H ${r2(leftX + lip)}`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
      });
      el(g, 'path', {
        d: `M ${r2(rightX - lip)} ${r2(top)} H ${r2(rightX)} V ${r2(bottom)} H ${r2(rightX - lip)}`,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
      });
      label(g, leftX - smPx, L.my, t('label.matrix', 'M ='), {
        'font-size': fontSizes.xl,
        'font-family': fonts.body,
        fill: colors.text,
        'text-anchor': 'end',
      });

      for (let c = 0; c < 2; c += 1) {
        const value = scene.cols[c];
        const showValue = value !== null && value !== undefined && !(hold === 'fill' && scene.step.kind === 'fill' && scene.step.col === c);
        for (let r = 0; r < 2; r += 1) {
          const at = cellAt(r, c);
          if (showValue) {
            label(g, at.x, at.y, formatNum(need(value, '열 값')[r]!), {
              'font-size': fontSizes.xl,
              'font-weight': 700,
              fill: colColor(c),
              'text-anchor': 'middle',
            });
          } else {
            el(g, 'rect', {
              x: at.x - L.cellW * 0.3,
              y: at.y - L.cellH * 0.34,
              width: L.cellW * 0.6,
              height: L.cellH * 0.68,
              rx: 4,
              fill: 'none',
              stroke: colors.border,
              'stroke-width': 1.5,
              'stroke-dasharray': '4 3',
            });
            label(g, at.x, at.y, t('label.empty', '?'), {
              'font-size': fontSizes.lg,
              fill: colors.textMuted,
              'text-anchor': 'middle',
            });
          }
        }
        // 열 발치 — 이 열은 어느 기저가 간 자리인가
        const foot = cellAt(1, c);
        const e: Vec2 = [c === 0 ? 1 : 0, c === 1 ? 1 : 0];
        label(g, foot.x, bottom + smPx * 1.2, t('label.colFrom', 'from {p}', { p: formatPoint(e) }), {
          'font-size': fontSizes.xs,
          fill: colColor(c),
          'text-anchor': 'middle',
        });
      }

      if (scene.byMatrix !== null && hold !== 'testMatrix') {
        label(
          g,
          L.mx,
          productY(),
          t('label.product', 'M {p} = {q}', { p: formatPoint(scene.test), q: formatPoint(scene.byMatrix) }),
          { 'font-size': fontSizes.lg, 'font-weight': 600, fill: colors.text, 'text-anchor': 'middle' },
        );
      }
    }

    function drawBasisTrail(g: Element, scene: ColumnsScene, hold: Hold): void {
      const ghosts = el(g, 'g', {});
      const dots = el(g, 'g', {});
      const names = el(g, 'g', {});
      for (let i = 0; i < scene.sent.length; i += 1) {
        const s = scene.sent[i];
        if (s === null || s === undefined) continue;
        const color = colColor(i);
        const moving = hold === 'rule' && scene.step.kind === 'rule' && scene.step.basis === i;
        const dropping = hold === 'fill' && scene.step.kind === 'fill' && scene.step.col === i;
        // 원본은 제자리에 남는다
        basisDot(ghosts, s.from, color, true, smPx * 0.55);
        if (scene.step.kind === 'rule' && scene.step.basis === i) pointLabel(names, s.from, colors.textMuted);
        if (moving) continue;
        const filled = scene.cols[i] !== null && !dropping;
        basisDot(dots, s.to, color, false, filled ? smPx * 0.4 : smPx * 0.5);
        // 열로 내려앉은 뒤에는 그 두 수가 평면을 떠났다
        if (!filled && !dropping) pointLabel(names, s.to, color);
      }
    }

    function drawTest(g: Element, scene: ColumnsScene, hold: Hold): void {
      if (scene.byRule === null) return;
      const p = scene.test;
      testMark(g, toX(p[0]), toY(p[1]), true);
      pointLabel(g, p, colors.textMuted);
      if (hold === 'testRule') return;
      const q = scene.byRule;
      testMark(g, toX(q[0]), toY(q[1]), false);
      pointLabel(g, q, colors.text);
      if (scene.byMatrix !== null && hold !== 'testMatrix') {
        const m = scene.byMatrix;
        el(g, 'circle', {
          cx: toX(m[0]),
          cy: toY(m[1]),
          r: smPx * 1.25,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 2.5,
        });
      }
    }

    function drawCaption(g: Element, scene: ColumnsScene): void {
      const y1 = H - BOTTOM / 2 - smPx * 0.2;
      const lines: string[] = [];
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          lines.push(t('caption.start', 'Only the rule is known. The matrix is empty.'));
          break;
        case 'rule': {
          const s = need(scene.sent[step.basis], '옮긴 기저');
          lines.push(t('caption.rule', 'By the rule: {p} → {q}', { p: formatPoint(s.from), q: formatPoint(s.to) }));
          break;
        }
        case 'fill': {
          const v = need(scene.cols[step.col], '채운 열');
          lines.push(t('caption.fill', 'Column {c} = {q}', { c: step.col + 1, q: formatPoint(v) }));
          break;
        }
        case 'testRule':
          lines.push(
            t('caption.testRule', 'Test point by the rule: {p} → {q}', {
              p: formatPoint(scene.test),
              q: formatPoint(need(scene.byRule, '규칙으로 옮긴 자리')),
            }),
          );
          break;
        case 'testMatrix': {
          const a = need(scene.byRule, '규칙으로 옮긴 자리');
          const b = need(scene.byMatrix, '행렬로 옮긴 자리');
          lines.push(
            t('caption.testMatrix', 'Same point by the matrix: {p} → {q}', { p: formatPoint(scene.test), q: formatPoint(b) }),
          );
          lines.push(
            t('caption.compare', 'Rule {a} {rel} matrix {b}', {
              a: formatPoint(a),
              b: formatPoint(b),
              rel: need(scene.same, '같음 판정') ? '=' : '≠',
            }),
          );
          break;
        }
      }
      const gap = smPx * 1.7;
      const y0 = y1 - ((lines.length - 1) * gap) / 2;
      lines.forEach((line, k) => {
        label(g, PIECE_CANVAS_W / 2, y0 + k * gap, line, {
          'font-size': fontSizes.md,
          fill: colors.text,
          'text-anchor': 'middle',
        });
      });
    }

    function drawStatic(scene: ColumnsScene, hold: Hold): void {
      svg.textContent = '';
      el(svg, 'rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg });
      const rule = t('rule.rotateQuarterCcw', 'turn a right angle counterclockwise');
      const formula = t('rule.rotateQuarterCcw.formula', '(x, y) → (−y, x)');
      label(svg, PAD, TOP / 2, t('label.rule', 'Rule: {name}   {formula}', { name: rule, formula }), {
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: colors.text,
        'text-anchor': 'start',
      });
      const plane = el(svg, 'g', {});
      drawPlane(plane);
      drawBasisTrail(plane, scene, hold);
      drawTest(plane, scene, hold);
      const matrix = el(svg, 'g', {});
      drawMatrix(matrix, scene, hold);
      const caption = el(svg, 'g', {});
      drawCaption(caption, scene);
    }

    /** 시계 하나로 흘린다. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function tween(mine: number, ms: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const raw = Math.min(1, (Date.now() - start) / ms);
          const u = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
          frame(u);
          if (raw >= 1) {
            wake();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    /** 원점을 돌아 from 에서 to 로 — 규칙의 길 */
    function arcPoint(from: Vec2, to: Vec2, u: number): { x: number; y: number } {
      const r0 = Math.hypot(from[0], from[1]);
      const r1 = Math.hypot(to[0], to[1]);
      if (r0 === 0 || r1 === 0) {
        return { x: toX(from[0] + (to[0] - from[0]) * u), y: toY(from[1] + (to[1] - from[1]) * u) };
      }
      const a0 = Math.atan2(from[1], from[0]);
      let d = Math.atan2(to[1], to[0]) - a0;
      while (d <= -Math.PI) d += 2 * Math.PI;
      while (d > Math.PI) d -= 2 * Math.PI;
      const a = a0 + d * u;
      const r = r0 + (r1 - r0) * u;
      return { x: toX(r * Math.cos(a)), y: toY(r * Math.sin(a)) };
    }

    async function moveBasis(mine: number, scene: ColumnsScene, i: number): Promise<void> {
      const s = need(scene.sent[i], '옮긴 기저');
      const color = colColor(i);
      const layer = el(svg, 'g', {});
      const dot = basisDot(layer, s.from, color, false, smPx * 0.5);
      const start = arcPoint(s.from, s.to, 0);
      dot.setAttribute('cx', String(r2(start.x)));
      dot.setAttribute('cy', String(r2(start.y)));
      await tween(mine, MOVE_MS, (u) => {
        const at = arcPoint(s.from, s.to, u);
        dot.setAttribute('cx', String(r2(at.x)));
        dot.setAttribute('cy', String(r2(at.y)));
      });
    }

    async function dropColumn(mine: number, scene: ColumnsScene, c: number): Promise<void> {
      const v = need(scene.cols[c], '채운 열');
      const color = colColor(c);
      const from = labelAt(v);
      const spread = smPx * 1.1;
      // 가로로 적힌 두 수가 세로 한 열의 두 칸으로 선다
      const starts = [
        { x: from.x + (from.anchor === 'end' ? -spread * 2 : from.anchor === 'start' ? spread : -spread), y: from.y },
        { x: from.x + (from.anchor === 'end' ? -spread : from.anchor === 'start' ? spread * 2 : spread), y: from.y },
      ];
      const layer = el(svg, 'g', {});
      const nums = [0, 1].map((r) =>
        label(layer, need(starts[r], '출발 자리').x, from.y, formatNum(v[r]!), {
          'font-size': fontSizes.sm,
          'font-weight': 700,
          fill: color,
          'text-anchor': 'middle',
        }),
      );
      const smallPx = parseFloat(fontSizes.sm);
      const bigPx = parseFloat(fontSizes.xl);
      await tween(mine, MOVE_MS, (u) => {
        nums.forEach((node, r) => {
          const s0 = need(starts[r], '출발 자리');
          const end = cellAt(r, c);
          node.setAttribute('x', String(r2(s0.x + (end.x - s0.x) * u)));
          node.setAttribute('y', String(r2(s0.y + (end.y - s0.y) * u)));
          node.setAttribute('font-size', `${r2(smallPx + (bigPx - smallPx) * u)}px`);
        });
      });
    }

    async function moveTestByRule(mine: number, scene: ColumnsScene): Promise<void> {
      const q = need(scene.byRule, '규칙으로 옮긴 자리');
      const layer = el(svg, 'g', {});
      const p0 = arcPoint(scene.test, q, 0);
      const s = smPx * 0.95;
      const mark = testMark(layer, p0.x, p0.y, false);
      await tween(mine, MOVE_MS, (u) => {
        const at = arcPoint(scene.test, q, u);
        mark.setAttribute('x', String(r2(at.x - s / 2)));
        mark.setAttribute('y', String(r2(at.y - s / 2)));
      });
    }

    async function dropFromMatrix(mine: number, scene: ColumnsScene): Promise<void> {
      const m = need(scene.byMatrix, '행렬로 옮긴 자리');
      const layer = el(svg, 'g', {});
      const text = label(
        layer,
        L.mx,
        productY(),
        t('label.product', 'M {p} = {q}', { p: formatPoint(scene.test), q: formatPoint(m) }),
        { 'font-size': fontSizes.lg, 'font-weight': 600, fill: colors.text, 'text-anchor': 'middle' },
      );
      text.setAttribute('opacity', '0');
      const fromX = L.mx + L.cellW * 1.3;
      const fromY = productY();
      const endX = toX(m[0]);
      const endY = toY(m[1]);
      const ring = el(layer, 'circle', {
        cx: fromX,
        cy: fromY,
        r: smPx * 1.25,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2.5,
      });
      await tween(mine, MOVE_MS, (u) => {
        text.setAttribute('opacity', String(r2(Math.min(1, u * 3))));
        // 행렬 곁에서 나와 평면의 그 자리로 떨어진다
        const lift = Math.sin(Math.PI * u) * L.unit * 0.8;
        ring.setAttribute('cx', String(r2(fromX + (endX - fromX) * u)));
        ring.setAttribute('cy', String(r2(fromY + (endY - fromY) * u - lift)));
      });
    }

    async function render(next: ColumnsScene, prev: ColumnsScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const moving = opts.animate && prev !== null && step.kind !== 'start';
      if (!moving) {
        drawStatic(next, 'none');
        return;
      }
      switch (step.kind) {
        case 'rule':
          drawStatic(next, 'rule');
          await moveBasis(mine, next, step.basis);
          break;
        case 'fill':
          drawStatic(next, 'fill');
          await dropColumn(mine, next, step.col);
          break;
        case 'testRule':
          drawStatic(next, 'testRule');
          await moveTestByRule(mine, next);
          break;
        case 'testMatrix':
          drawStatic(next, 'testMatrix');
          await dropFromMatrix(mine, next);
          break;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next, 'none');
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
