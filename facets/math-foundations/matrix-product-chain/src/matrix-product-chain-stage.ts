/**
 * matrix-product-chain 무대.
 *
 * 왼쪽은 좌표평면 — 점 셋이 두 번 뛰는 길(곧은 선 호)과 곱으로 한 번에 뛰는 길
 * (긴 호)이 남는다. 오른쪽은 행렬 카드 — 두 변환 카드의 기호가 곱 카드로 날아가
 * 붙고, 차례를 바꿀 때는 두 기호가 서로 엇갈려 날아간다.
 *
 * 수학 좌표(위가 +y)를 화면 좌표로 뒤집어 그린다. 좌표 범위는 장면(init)이 준다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, Palette, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { formatNumber, formatPoints } from './algorithm.js';
import type { Bounds, Cells, Pt } from './algorithm.js';
import type { MatrixProductChainScene, Product } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 평면 자리 (상한)
const PLANE_TOP = 14;
const PLANE_BOTTOM = 322;
const PLANE_LEFT = 34;
const PLANE_W_MAX = 262;
const CELL_MAX = 40;

// 카드 자리
const PANEL_GAP = 28;
const PANEL_RIGHT_PAD = 16;
const CARD_GAP = 12;
const TOP_CARD_Y = 14;
const TOP_CARD_H = 104;
const PRODUCT_H = 78;
const PRODUCT_Y: Record<Product['order'], number> = { kept: 134, swapped: 228 };

// 운동 길이
const HOP_MS = 700;
const COMPOSE_MS = 800;
const LEAP_MS = 800;
const FRAME_MS = 16;

type S = { x: number; y: number };
type Motion = { a: number; b: number };

function ease(u: number): number {
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

function round1(n: number): string {
  const r = Math.round(n * 10) / 10;
  return String(r === 0 ? 0 : r);
}

/** 두 화면 점 사이의 뜀 — 위쪽(세로면 왼쪽)으로 부푼 이차 곡선의 조종점. */
function hopControl(a: S, b: S): S {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) throw new Error('matrix-product-chain-stage: 길이 0 인 뜀');
  let nx = dy / len;
  let ny = -dx / len;
  if (ny > 0 || (ny === 0 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  const off = Math.max(0.45 * len, 26);
  return { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off };
}

/** 뜀의 u 까지 — 부분 곡선의 path 와 그 끝점. */
function hopUpTo(a: S, b: S, u: number): { d: string; end: S } {
  const c = hopControl(a, b);
  const q0 = { x: a.x + (c.x - a.x) * u, y: a.y + (c.y - a.y) * u };
  const q1 = { x: c.x + (b.x - c.x) * u, y: c.y + (b.y - c.y) * u };
  const end = { x: q0.x + (q1.x - q0.x) * u, y: q0.y + (q1.y - q0.y) * u };
  const d =
    'M' + round1(a.x) + ' ' + round1(a.y) +
    ' Q' + round1(q0.x) + ' ' + round1(q0.y) + ' ' + round1(end.x) + ' ' + round1(end.y);
  return { d, end };
}

type Plane = {
  cell: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  toScreen(p: Pt): S;
  xs: number[];
  ys: number[];
};

function planeOf(bounds: Bounds): Plane {
  const x0 = bounds.xMin - 1;
  const x1 = bounds.xMax + 1;
  const y0 = bounds.yMin - 1;
  const y1 = bounds.yMax + 1;
  const spanX = x1 - x0;
  const spanY = y1 - y0;
  const cell = Math.min(CELL_MAX, (PLANE_BOTTOM - PLANE_TOP) / spanY, PLANE_W_MAX / spanX);
  const width = spanX * cell;
  const height = spanY * cell;
  const left = PLANE_LEFT + (PLANE_W_MAX - width) / 2;
  const top = PLANE_TOP + (PLANE_BOTTOM - PLANE_TOP - height) / 2;
  const xs: number[] = [];
  for (let x = x0; x <= x1; x += 1) xs.push(x);
  const ys: number[] = [];
  for (let y = y0; y <= y1; y += 1) ys.push(y);
  return {
    cell,
    left,
    top,
    right: left + width,
    bottom: top + height,
    toScreen: (p) => ({ x: left + (p.x - x0) * cell, y: top + (y1 - p.y) * cell }),
    xs,
    ys,
  };
}

const PANEL_X = PLANE_LEFT + PLANE_W_MAX + PANEL_GAP;
const PANEL_W = PIECE_CANVAS_W - PANEL_RIGHT_PAD - PANEL_X;
const TOP_CARD_W = (PANEL_W - CARD_GAP) / 2;

/** 윗줄 카드 — 곱의 글자 차례대로 second 가 왼쪽, first 가 오른쪽. */
function topCardX(role: 'first' | 'second'): number {
  return role === 'second' ? PANEL_X : PANEL_X + TOP_CARD_W + CARD_GAP;
}

function topSymbolAt(role: 'first' | 'second'): S {
  return { x: topCardX(role) + 14, y: TOP_CARD_Y + 30 };
}

function productSymbolAt(order: Product['order'], index: number): S {
  return { x: PANEL_X + 16 + index * 15, y: PRODUCT_Y[order] + 46 };
}

export const matrixProductChainStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(
      parent: Element,
      x: number,
      y: number,
      body: string,
      style: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: number },
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x: round1(x),
        y: round1(y),
        'font-family': style.mono === true ? fonts.mono : fonts.body,
        'font-size': style.size,
        fill: style.fill,
        'text-anchor': style.anchor ?? 'start',
      });
      if (style.weight !== undefined) node.setAttribute('font-weight', String(style.weight));
      node.textContent = body;
      return node;
    }

    function drawMatrix(parent: Element, cx: number, cy: number, cells: Cells): void {
      const colX = [cx - 15, cx + 15];
      const rowY = [cy - 3, cy + 17];
      cells.forEach((v, i) => {
        write(parent, colX[i % 2], rowY[Math.floor(i / 2)], formatNumber(v), {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'middle',
          mono: true,
        });
      });
      const top = cy - 19;
      const bottom = cy + 23;
      const lx = cx - 31;
      const rx = cx + 31;
      const bracket = (x: number, dir: number): void => {
        el(parent, 'path', {
          d:
            'M' + round1(x + dir * 5) + ' ' + top + ' L' + round1(x) + ' ' + top +
            ' L' + round1(x) + ' ' + bottom + ' L' + round1(x + dir * 5) + ' ' + bottom,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.4,
        });
      };
      bracket(lx, 1);
      bracket(rx, -1);
    }

    function card(parent: Element, x: number, y: number, w: number, h: number, active: boolean): void {
      el(parent, 'rect', {
        x,
        y,
        width: round1(w),
        height: h,
        rx: 8,
        fill: colors.bgSubtle,
        stroke: active ? colors.accent : colors.border,
        'stroke-width': active ? 2.5 : 1,
      });
    }

    function marker(parent: Element, order: Product['order'], at: S, color: string): void {
      if (order === 'kept') {
        el(parent, 'circle', {
          cx: round1(at.x),
          cy: round1(at.y),
          r: 10,
          fill: 'none',
          stroke: color,
          'stroke-width': 2,
        });
        return;
      }
      const r = 8;
      el(parent, 'path', {
        d:
          'M' + round1(at.x) + ' ' + round1(at.y - r) + ' L' + round1(at.x + r) + ' ' + round1(at.y) +
          ' L' + round1(at.x) + ' ' + round1(at.y + r) + ' L' + round1(at.x - r) + ' ' + round1(at.y) + ' Z',
        fill: colors.bg,
        stroke: color,
        'stroke-width': 2,
      });
    }

    const DASH: Record<Product['order'], string> = { kept: '6 4', swapped: '1.5 4' };

    function captionLines(scene: MatrixProductChainScene): [string, string | null] {
      const first = scene.matrices.first.symbol;
      const second = scene.matrices.second.symbol;
      const step = scene.step;
      switch (step.kind) {
        case 'start':
          return [
            t('caption.order', 'First {first}, then {second}.', { first, second }),
            scene.plane === null
              ? null
              : t('caption.start', 'Start: {pts}', { pts: formatPoints(scene.plane.start) }),
          ];
        case 'hop': {
          const hop = scene.hops[scene.hops.length - 1];
          if (hop === undefined) throw new Error('matrix-product-chain-stage: hop 걸음에 뛴 길이 없다');
          const m = scene.matrices[hop.by].symbol;
          return [t('caption.hop', 'One jump by {m}: {pts}', { m, pts: formatPoints(hop.to) }), null];
        }
        case 'compose': {
          const kept = scene.products[0];
          if (kept === undefined) throw new Error('matrix-product-chain-stage: compose 걸음에 곱이 없다');
          return [
            t('caption.compose', 'First {first}, then {second} — one matrix: {name}', {
              first,
              second,
              name: kept.name,
            }),
            null,
          ];
        }
        case 'leap':
        case 'swapLeap': {
          const product = scene.products[step.kind === 'leap' ? 0 : 1];
          if (product === undefined || product.landing === null || product.same === null || product.total === null) {
            throw new Error('matrix-product-chain-stage: 한 번에 뛴 걸음에 도착이 없다');
          }
          return [
            t('caption.leap', 'One jump by {name} from the start: {pts}', {
              name: product.name,
              pts: formatPoints(product.landing),
            }),
            t('caption.same', 'Same place as the two jumps: {same} / {total}', {
              same: product.same,
              total: product.total,
            }),
          ];
        }
      }
    }

    function drawPanel(root: Element, scene: MatrixProductChainScene, motion: Motion): void {
      const step = scene.step;
      for (const role of ['second', 'first'] as const) {
        const spec = scene.matrices[role];
        const x = topCardX(role);
        const active = step.kind === 'hop' && step.by === role;
        card(root, x, TOP_CARD_Y, TOP_CARD_W, TOP_CARD_H, active);
        const at = topSymbolAt(role);
        write(root, at.x, at.y, spec.symbol, {
          size: fontSizes.xl,
          fill: colors.text,
          mono: true,
          weight: 600,
        });
        write(
          root,
          x + TOP_CARD_W - 12,
          TOP_CARD_Y + 26,
          role === 'first' ? t('tag.first', 'first') : t('tag.second', 'then'),
          { size: fontSizes.xs, fill: colors.textMuted, anchor: 'end' },
        );
        write(
          root,
          x + 14,
          TOP_CARD_Y + 48,
          role === 'first' ? t('label.first', 'slides sideways') : t('label.second', 'doubles height'),
          { size: fontSizes.xs, fill: colors.textMuted },
        );
        drawMatrix(root, x + TOP_CARD_W / 2, TOP_CARD_Y + 76, spec.cells);
      }

      scene.products.forEach((product, index) => {
        const current =
          (product.order === 'kept' && step.kind === 'compose') ||
          (product.order === 'swapped' && step.kind === 'swapLeap');
        const u = current ? motion.a : 1;
        const active =
          (product.order === 'kept' && (step.kind === 'compose' || step.kind === 'leap')) ||
          (product.order === 'swapped' && step.kind === 'swapLeap');
        const y = PRODUCT_Y[product.order];
        const body = el(root, 'g', {});
        if (u < 1) body.setAttribute('opacity', round1(u));
        card(body, PANEL_X, y, PANEL_W, PRODUCT_H, active);
        write(body, PANEL_X + 54, y + 44, '=', { size: fontSizes.lg, fill: colors.textMuted, anchor: 'middle' });
        drawMatrix(body, PANEL_X + 112, y + 36, product.cells);
        // 이 곱으로 뛴 길의 표지 — 평면의 호 · 도착 표지와 같은 모양
        const sampleY = y + 40;
        el(body, 'path', {
          d: 'M' + round1(PANEL_X + 176) + ' ' + sampleY + ' L' + round1(PANEL_X + 226) + ' ' + sampleY,
          stroke: colors.textMuted,
          'stroke-width': 1.8,
          'stroke-dasharray': DASH[product.order],
          fill: 'none',
        });
        marker(body, product.order, { x: PANEL_X + 246, y: sampleY }, colors.textMuted);
        if (index !== (product.order === 'kept' ? 0 : 1)) {
          throw new Error('matrix-product-chain-stage: 곱의 차례가 어긋났다');
        }

        // 기호 둘 — 윗줄 카드에서 날아와 곱의 글자 차례로 선다
        const letters = product.name.split('');
        letters.forEach((letter, i) => {
          const role =
            letter === scene.matrices.first.symbol
              ? 'first'
              : letter === scene.matrices.second.symbol
                ? 'second'
                : null;
          if (role === null) throw new Error(`matrix-product-chain-stage: 곱 ${product.name} 의 기호 ${letter} 를 모른다`);
          const from = topSymbolAt(role);
          const to = productSymbolAt(product.order, i);
          const at = { x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u };
          write(root, at.x, at.y, letter, { size: fontSizes.xl, fill: colors.text, mono: true, weight: 600 });
        });
      });
    }

    function drawPlane(root: Element, scene: MatrixProductChainScene, motion: Motion): void {
      if (scene.plane === null) return;
      const { start, bounds } = scene.plane;
      const plane = planeOf(bounds);
      const palette = categorical(start.length, 'vivid');
      const colorOf = (i: number): string => {
        const c = palette[i];
        if (c === undefined) throw new Error(`matrix-product-chain-stage: 점 ${i} 의 색이 없다`);
        return c;
      };
      const step = scene.step;

      // 격자와 축
      const grid = el(root, 'g', {});
      for (const x of plane.xs) {
        const sx = plane.toScreen({ x, y: 0 }).x;
        el(grid, 'line', {
          x1: round1(sx),
          y1: round1(plane.top),
          x2: round1(sx),
          y2: round1(plane.bottom),
          stroke: x === 0 ? colors.textMuted : colors.border,
          'stroke-width': x === 0 ? 1.2 : 1,
        });
        write(grid, sx, plane.bottom + 14, formatNumber(x), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'middle',
        });
      }
      for (const y of plane.ys) {
        const sy = plane.toScreen({ x: 0, y }).y;
        el(grid, 'line', {
          x1: round1(plane.left),
          y1: round1(sy),
          x2: round1(plane.right),
          y2: round1(sy),
          stroke: y === 0 ? colors.textMuted : colors.border,
          'stroke-width': y === 0 ? 1.2 : 1,
        });
        write(grid, plane.left - 6, sy + 4, formatNumber(y), {
          size: fontSizes.xs,
          fill: colors.textMuted,
          anchor: 'end',
        });
      }

      const trails = el(root, 'g', { fill: 'none', 'stroke-linecap': 'round' });
      const marks = el(root, 'g', {});
      const labels = el(root, 'g', {});

      // 처음 자리 — 곱으로 한 번에 뛰는 길의 출발점
      start.forEach((p, j) => {
        const s = plane.toScreen(p);
        el(marks, 'circle', {
          cx: round1(s.x),
          cy: round1(s.y),
          r: 4,
          fill: colors.bg,
          stroke: colorOf(j),
          'stroke-width': 1.5,
        });
      });

      // 두 번 뛴 길
      let here: S[] = start.map((p) => plane.toScreen(p));
      let hereDone = true;
      scene.hops.forEach((hop, i) => {
        const isCurrent = step.kind === 'hop' && i === scene.hops.length - 1;
        const u = isCurrent ? motion.a : 1;
        const last = i === scene.hops.length - 1;
        hop.to.forEach((q, j) => {
          const from = hop.from[j];
          if (from === undefined) throw new Error(`matrix-product-chain-stage: 뜀 ${i} 의 출발점 ${j} 가 없다`);
          const a = plane.toScreen(from);
          const b = plane.toScreen(q);
          const part = hopUpTo(a, b, u);
          el(trails, 'path', { d: part.d, stroke: colorOf(j), 'stroke-width': 1.8, opacity: 0.85 });
          if (!last) {
            el(marks, 'circle', { cx: round1(b.x), cy: round1(b.y), r: 3, fill: colorOf(j) });
          }
        });
        if (last) {
          here = hop.to.map((q, j) => {
            const from = hop.from[j];
            if (from === undefined) throw new Error(`matrix-product-chain-stage: 뜀 ${i} 의 출발점 ${j} 가 없다`);
            return hopUpTo(plane.toScreen(from), plane.toScreen(q), u).end;
          });
          hereDone = u === 1;
        }
      });

      // 곱으로 한 번에 뛴 길
      const travelers: { order: Product['order']; at: S; color: string }[] = [];
      let labelPts: readonly Pt[] | null = null;
      for (const product of scene.products) {
        if (product.landing === null) continue;
        const isCurrent =
          (product.order === 'kept' && step.kind === 'leap') ||
          (product.order === 'swapped' && step.kind === 'swapLeap');
        const u = isCurrent ? (product.order === 'kept' ? motion.a : motion.b) : 1;
        product.landing.forEach((q, j) => {
          const from = start[j];
          if (from === undefined) throw new Error(`matrix-product-chain-stage: 처음 자리 ${j} 가 없다`);
          const part = hopUpTo(plane.toScreen(from), plane.toScreen(q), u);
          if (u > 0) {
            el(trails, 'path', {
              d: part.d,
              stroke: colorOf(j),
              'stroke-width': 1.8,
              'stroke-dasharray': DASH[product.order],
            });
          }
          travelers.push({ order: product.order, at: part.end, color: colorOf(j) });
        });
        if (isCurrent && u === 1) labelPts = product.landing;
      }

      // 두 번 뛰는 점
      here.forEach((s, j) => {
        el(marks, 'circle', {
          cx: round1(s.x),
          cy: round1(s.y),
          r: 6,
          fill: colorOf(j),
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
      });
      for (const mover of travelers) marker(marks, mover.order, mover.at, mover.color);

      // 이 걸음에 닿은 자리의 좌표
      if (step.kind === 'start') labelPts = start;
      else if (step.kind === 'hop' && hereDone) {
        const hop = scene.hops[scene.hops.length - 1];
        if (hop === undefined) throw new Error('matrix-product-chain-stage: hop 걸음에 뛴 길이 없다');
        labelPts = hop.to;
      } else if (step.kind === 'compose') {
        const hop = scene.hops[scene.hops.length - 1];
        if (hop === undefined) throw new Error('matrix-product-chain-stage: compose 걸음에 뛴 길이 없다');
        labelPts = hop.to;
      }
      if (labelPts !== null) {
        for (const p of labelPts) {
          const s = plane.toScreen(p);
          write(labels, s.x + 11, s.y + 19, formatPoints([p]), {
            size: fontSizes.xs,
            fill: colors.text,
          });
        }
      }
    }

    function draw(scene: MatrixProductChainScene, motion: Motion): void {
      svg.textContent = '';
      const root = el(svg, 'g', {});
      drawPlane(root, scene, motion);
      drawPanel(root, scene, motion);
      const [line1, line2] = captionLines(scene);
      write(root, PIECE_CANVAS_W / 2, H - 34, line1, {
        size: fontSizes.md,
        fill: colors.text,
        anchor: 'middle',
      });
      if (line2 !== null) {
        write(root, PIECE_CANVAS_W / 2, H - 12, line2, {
          size: fontSizes.md,
          fill: colors.text,
          anchor: 'middle',
          weight: 600,
        });
      }
    }

    const DONE: Motion = { a: 1, b: 1 };

    function tween(ms: number, mine: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const began = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const tick = (): void => {
          if (mine !== gen || destroyed) {
            wake();
            return;
          }
          const u = Math.min(1, (Date.now() - began) / ms);
          frame(ease(u));
          if (u >= 1) {
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

    async function render(
      next: MatrixProductChainScene,
      prev: MatrixProductChainScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      if (!opts.animate || prev === null) {
        draw(next, DONE);
        return;
      }
      const live = (): boolean => mine === gen && !destroyed;
      switch (next.step.kind) {
        case 'start':
          break;
        case 'hop':
          await tween(HOP_MS, mine, (u) => draw(next, { a: u, b: 1 }));
          break;
        case 'compose':
          await tween(COMPOSE_MS, mine, (u) => draw(next, { a: u, b: 1 }));
          break;
        case 'leap':
          await tween(LEAP_MS, mine, (u) => draw(next, { a: u, b: 1 }));
          break;
        case 'swapLeap':
          await tween(COMPOSE_MS, mine, (u) => draw(next, { a: u, b: 0 }));
          if (!live()) return;
          await tween(LEAP_MS, mine, (u) => draw(next, { a: 1, b: u }));
          break;
      }
      if (!live()) return;
      draw(next, DONE);
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
