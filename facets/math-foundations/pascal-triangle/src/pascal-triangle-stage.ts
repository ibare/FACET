/**
 * pascal-triangle 무대 — 위 줄의 이웃 둘이 내려와 아래 한 칸으로 합쳐진다.
 *
 * 정적 그리기: 지금까지 만든 줄들을 가운데 맞춰 층층이 세운다. 이번 걸음에 만든 줄은
 * 강조색으로 칠하고, 그 줄의 칸마다 위 줄의 어느 칸에서 왔는지 가는 선을 남긴다.
 *
 * 운동: 새 줄의 칸은 빈 자리로 먼저 서 있고, 위 줄의 수가 복제본으로 떨어져 내려온다
 * (원본은 제자리에 남는다). 안쪽 칸에는 둘이 내려와 나란히 선 뒤 `+` 를 사이에 두고
 * 한 칸으로 모이고, 양 끝 칸에는 하나가 그대로 내려온다. 끝나면 정적 그리기로 합의 수가 선다.
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
import type { PascalTriangleScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 420;
const TOP = 22;
const CAPTION_BAND = 76;
const SIDE_MARGIN = 64;
const MAX_DX = 84;
const MAX_DY = 56;
const MOTION_MS = 700;
const FRAME_MS = 16;
/** 운동 안의 마디 — 내려오기 · 나란히 머물기 · 모이기 */
const DESCEND_END = 0.6;
const HOLD_END = 0.8;

type Layout = { dx: number; dy: number; cellW: number; cellH: number };

function layoutFor(lastRow: number): Layout {
  const dx = Math.min(MAX_DX, (PIECE_CANVAS_W - 2 * SIDE_MARGIN) / (lastRow + 1));
  const cellW = dx * 0.8;
  const cellH = Math.min(30, cellW * 0.5);
  const dy = Math.min(MAX_DY, (H - TOP - CAPTION_BAND - cellH) / lastRow);
  return { dx, dy, cellW, cellH };
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function cellX(L: Layout, n: number, k: number): number {
  return PIECE_CANVAS_W / 2 + (k - n / 2) * L.dx;
}

function cellY(L: Layout, n: number): number {
  return TOP + L.cellH / 2 + n * L.dy;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const pascalTriangleStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const cellPx = parseFloat(fontSizes.md);
    const ghostPx = parseFloat(fontSizes.sm);
    const labelPx = parseFloat(fontSizes.xs);
    const captionPx = parseFloat(fontSizes.md);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el(name: string, attrs: Record<string, string | number>): SVGElement {
      const node = document.createElementNS(SVG_NS, name);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? round(v) : v));
      return node;
    }

    function label(parent: SVGElement, x: number, y: number, s: string, px: number, fill: string, anchor: string, weight: string): void {
      const node = el('text', {
        x,
        y,
        'text-anchor': anchor,
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': px,
        'font-weight': weight,
        fill,
      });
      node.textContent = s;
      parent.appendChild(node);
    }

    function box(parent: SVGElement, cx: number, cy: number, w: number, h: number, fill: string, stroke: string, strokeW: number, dashed: boolean): void {
      const attrs: Record<string, string | number> = {
        x: cx - w / 2,
        y: cy - h / 2,
        width: w,
        height: h,
        rx: 6,
        fill,
        stroke,
        'stroke-width': strokeW,
      };
      if (dashed) attrs['stroke-dasharray'] = '4 3';
      parent.appendChild(el('rect', attrs));
    }

    /** 장면 하나를 통째로 세운다. motion 이 있으면 이번 줄을 그 진행률의 운동 화면으로. */
    function draw(scene: PascalTriangleScene, motion: number | null): void {
      svg.textContent = '';
      const L = layoutFor(scene.lastRow);
      const root = el('g', {});
      svg.appendChild(root);
      const step = scene.step;
      const current = step.kind === 'row' ? step.n : -1;
      const moving = motion !== null && step.kind === 'row';

      // 이번 줄이 어디서 왔는지 — 위 칸에서 아래 칸으로 가는 가는 선 (운동이 끝난 뒤에 남는다)
      if (step.kind === 'row' && !moving) {
        const n = step.n;
        for (let k = 0; k <= n; k += 1) {
          for (const pk of [k - 1, k]) {
            if (pk < 0 || pk > n - 1) continue;
            root.appendChild(
              el('line', {
                x1: cellX(L, n - 1, pk),
                y1: cellY(L, n - 1) + L.cellH / 2,
                x2: cellX(L, n, k),
                y2: cellY(L, n) - L.cellH / 2,
                stroke: colors.textMuted,
                'stroke-width': 1.5,
              }),
            );
          }
        }
      }

      scene.rows.forEach((row, n) => {
        const y = cellY(L, n);
        label(root, 12, y, t('label.row', 'Row {n}', { n }), labelPx, colors.textMuted, 'start', '400');
        const isCurrent = n === current;
        row.forEach((v, k) => {
          const x = cellX(L, n, k);
          if (isCurrent && moving) {
            box(root, x, y, L.cellW, L.cellH, colors.bg, colors.border, 1.5, true);
            return;
          }
          const isTop = isCurrent && step.kind === 'row' && step.top === k;
          box(
            root,
            x,
            y,
            L.cellW,
            L.cellH,
            isCurrent ? colors.accent : colors.bgSubtle,
            isTop ? colors.primary : colors.border,
            isTop ? 2.5 : 1,
            false,
          );
          label(root, x, y, String(v), cellPx, isCurrent ? colors.stateInk : colors.text, 'middle', isCurrent ? '600' : '400');
        });
      });

      if (moving && step.kind === 'row' && motion !== null) drawGhosts(root, scene, L, step.n, motion);

      // 캡션 — 지금 걸음에서 일어난 일
      const lastIdx = scene.rows.length - 1;
      const lastRowValues = scene.rows[lastIdx];
      if (lastRowValues !== undefined) {
        const capY = H - 44;
        label(
          root,
          PIECE_CANVAS_W / 2,
          capY,
          t('caption.head', 'Row {n} · Cells: {cells}', { n: lastIdx, cells: lastRowValues.length }),
          captionPx,
          colors.text,
          'middle',
          '600',
        );
        if (step.kind === 'row') {
          if (step.top === null) {
            label(
              root,
              PIECE_CANVAS_W / 2,
              capY + 22,
              t('caption.ends', 'Ends only: the single number above comes down'),
              captionPx,
              colors.textMuted,
              'middle',
              '400',
            );
          } else {
            const topK = step.top;
            const s = step.sums.find((x) => x.k === topK);
            if (s === undefined) throw new Error(`pascal-triangle 무대: 가장 큰 칸 ${topK} 의 덧셈이 없다`);
            label(
              root,
              PIECE_CANVAS_W / 2,
              capY + 22,
              t('caption.sums', 'Inner sums: {inner} · Largest: {a} + {b} = {sum}', {
                inner: step.sums.length,
                a: s.a,
                b: s.b,
                sum: s.a + s.b,
              }),
              captionPx,
              colors.textMuted,
              'middle',
              '400',
            );
          }
        }
      }
    }

    /** 위 줄의 복제본이 내려와 합쳐지는 운동 한 프레임 */
    function drawGhosts(root: SVGElement, scene: PascalTriangleScene, L: Layout, n: number, motion: number): void {
      const above = scene.rows[n - 1];
      if (above === undefined) throw new Error(`pascal-triangle 무대: 줄 ${n - 1} 이 없다`);
      const gw = L.cellW * 0.42;
      const gh = L.cellH * 0.78;
      const side = (L.cellW - gw) / 2;
      const descend = ease(clamp01(motion / DESCEND_END));
      const gather = ease(clamp01((motion - HOLD_END) / (1 - HOLD_END)));
      const ty = cellY(L, n);
      const fy = cellY(L, n - 1);

      for (let k = 0; k <= n; k += 1) {
        const tx = cellX(L, n, k);
        const parents = [k - 1, k].filter((pk) => pk >= 0 && pk <= n - 1);
        const inner = parents.length === 2;
        if (inner && motion >= DESCEND_END && gather < 0.5) {
          label(root, tx, ty, '+', ghostPx, colors.text, 'middle', '600');
        }
        parents.forEach((pk, i) => {
          const v = above[pk];
          if (v === undefined) throw new Error(`pascal-triangle 무대: 줄 ${n - 1} 의 ${pk} 번째 칸이 없다`);
          const slot = inner ? (i === 0 ? -side : side) * (1 - gather) : 0;
          const fx = cellX(L, n - 1, pk);
          const x = fx + (tx + slot - fx) * descend;
          const y = fy + (ty - fy) * descend;
          box(root, x, y, gw, gh, colors.primary, colors.primary, 1, false);
          label(root, x, y, String(v), ghostPx, colors.textInverse, 'middle', '600');
        });
      }
    }

    function tween(ms: number, alive: () => boolean, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive()) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const first = setTimeout(() => {
          timers.delete(first);
          tick();
        }, FRAME_MS);
        timers.add(first);
      });
    }

    async function render(next: PascalTriangleScene, prev: PascalTriangleScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      const flows = opts.animate && prev !== null && step.kind === 'row' && prev.rows.length === step.n;
      if (!flows) {
        draw(next, null);
        return;
      }
      const alive = (): boolean => mine === gen && !destroyed;
      draw(next, 0);
      await tween(MOTION_MS, alive, (p) => draw(next, p));
      if (!alive()) return;
      draw(next, null);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
      svg.textContent = '';
    }

    return { render, destroy };
  },
};
