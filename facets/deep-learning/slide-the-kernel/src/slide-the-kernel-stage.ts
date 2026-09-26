/**
 * slide-the-kernel 무대 — 왼쪽에 입력 격자, 오른쪽 위에 곱 아홉, 오른쪽 아래에 출력(특징 지도).
 *
 * 운동 (동사: 밀려 가며 겹쳐 곱한다)
 *   seat  ① 창이 떠난 자리에서 새 자리로 미끄러진다
 *         ② 겹친 칸마다 곱이 창에서 떨어져 나와 곱 자리로 날아간다
 *   write ① 곱 아홉이 한 점으로 모인다
 *         ② 모인 합이 출력 칸으로 내려간다
 * 정적 그리기가 정본이다. 운동은 그 위에 겹친 복제본으로 "아직 못 온 만큼" 만 그린다.
 */
import {
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
import type { Cell, SlideTheKernelScene } from './scene.js';

const SVG = 'http://www.w3.org/2000/svg';
const H = 420;
const MARGIN_X = 24;
const GAP_X = 64;
const TOP = 36;
const SUM_BAND = 44;
const OUT_LABEL_BAND = 28;
const CAPTION_BAND = 44;
const CELL_MAX = 56;

const SLIDE_MS = 260;
const FLY_MS = 260;
const GATHER_MS = 260;
const DROP_MS = 260;

type Point = { x: number; y: number };

type Layout = {
  cell: number;
  input: Point;
  products: Point;
  output: Point;
  sum: Point;
  rightX: number;
  outLabelY: number;
};

function layoutOf(scene: SlideTheKernelScene): Layout {
  const inRows = scene.input.length;
  const inCols = colsOf(scene.input);
  const kRows = scene.kernel.length;
  const kCols = colsOf(scene.kernel);
  const rightCols = Math.max(kCols, scene.outCols, 1);
  const byWidth = (PIECE_CANVAS_W - 2 * MARGIN_X - GAP_X) / (inCols + rightCols);
  const byHeightLeft = (H - TOP - CAPTION_BAND) / Math.max(inRows, 1);
  const byHeightRight = (H - TOP - CAPTION_BAND - SUM_BAND - OUT_LABEL_BAND) / Math.max(kRows + scene.outRows, 1);
  const cell = Math.floor(Math.min(CELL_MAX, byWidth, byHeightLeft, byHeightRight));

  const input = { x: MARGIN_X, y: TOP };
  const leftEnd = input.x + inCols * cell + GAP_X;
  const rightW = rightCols * cell;
  const rightX = Math.round(leftEnd + (PIECE_CANVAS_W - MARGIN_X - leftEnd - rightW) / 2);
  const products = { x: rightX + Math.round(((rightCols - kCols) * cell) / 2), y: TOP };
  const prodBottom = TOP + kRows * cell;
  const sum = { x: rightX + rightW / 2, y: prodBottom + SUM_BAND / 2 };
  const outLabelY = prodBottom + SUM_BAND + OUT_LABEL_BAND - 10;
  const output = {
    x: rightX + Math.round(((rightCols - scene.outCols) * cell) / 2),
    y: prodBottom + SUM_BAND + OUT_LABEL_BAND,
  };
  return { cell, input, products, output, sum, rightX, outLabelY };
}

/** 격자의 열 수. 빈 격자는 그릴 수 없으니 던진다 — 빈 바탕은 drawStatic 이 먼저 거른다. */
function colsOf(grid: number[][]): number {
  const first = grid[0];
  if (first === undefined) throw new Error('slide-the-kernel 무대: 빈 격자의 열 수를 셀 수 없다');
  return first.length;
}

function num(v: number): string {
  return String(v === 0 ? 0 : v);
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(k: number): number {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

function lerp(a: number, b: number, k: number): number {
  return round(a + (b - a) * k);
}

export const slideTheKernelStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();

    // 정적 그리기가 남기는 손잡이 — 운동이 잠시 숨기거나 옮긴다
    let windowG: SVGGElement | null = null;
    let productsG: SVGGElement | null = null;
    let sumText: SVGTextElement | null = null;
    let targetText: SVGTextElement | null = null;
    let motionG: SVGGElement | null = null;

    function node<K extends keyof SVGElementTagNameMap>(
      parent: Element,
      tag: K,
      attrs: Record<string, string | number>,
      content?: string,
    ): SVGElementTagNameMap[K] {
      const e = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (content !== undefined) e.textContent = content;
      parent.appendChild(e);
      return e;
    }

    function label(parent: Element, x: number, y: number, content: string, anchor = 'start'): void {
      node(
        parent,
        'text',
        {
          x,
          y,
          'text-anchor': anchor,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        },
        content,
      );
    }

    function captionOf(scene: SlideTheKernelScene): string {
      const step = scene.step;
      if (step === null) {
        return t('caption.start', 'Input {ir} × {ic} · window {kr} × {kc} · output {or} × {oc}', {
          ir: scene.input.length,
          ic: colsOf(scene.input),
          kr: scene.kernel.length,
          kc: colsOf(scene.kernel),
          or: scene.outRows,
          oc: scene.outCols,
        });
      }
      if (step.kind === 'seat') {
        return t('caption.seat', 'Window at (row {r}, col {c}) · overlapping pairs multiplied: {n}', {
          r: step.seat.row,
          c: step.seat.col,
          n: step.count,
        });
      }
      return t('caption.write', 'Sum of products: {sum} → output (row {r}, col {c}) · filled: {filled} / {total}', {
        sum: num(step.sum),
        r: step.target.row,
        c: step.target.col,
        filled: step.filled,
        total: step.total,
      });
    }

    function seatPoint(L: Layout, seat: Cell | null): Point {
      if (seat === null) return { x: L.products.x, y: L.products.y };
      return { x: L.input.x + seat.col * L.cell, y: L.input.y + seat.row * L.cell };
    }

    function drawStatic(scene: SlideTheKernelScene): void {
      svg.textContent = '';
      windowG = null;
      productsG = null;
      sumText = null;
      targetText = null;
      motionG = null;
      if (scene.input.length === 0) return;

      const L = layoutOf(scene);
      const c = L.cell;
      const smallPx = parseFloat(fontSizes.xs);
      const parked = scene.seat === null;

      // 입력
      label(svg, L.input.x, TOP - 12, t('label.input', 'Input'));
      const inputG = node(svg, 'g', {});
      scene.input.forEach((row, r) => {
        row.forEach((v, col) => {
          const x = L.input.x + col * c;
          const y = L.input.y + r * c;
          node(inputG, 'rect', { x, y, width: c, height: c, fill: colors.bg, stroke: colors.border, 'stroke-width': 1 });
          node(
            inputG,
            'text',
            {
              x: x + c / 2,
              y: y + c / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.lg,
              fill: colors.text,
            },
            num(v),
          );
        });
      });

      // 오른쪽 위: 창이 앉기 전에는 창이 머무는 자리, 앉은 뒤에는 곱 아홉
      label(svg, L.products.x, TOP - 12, parked ? t('label.window', 'Window') : t('label.products', 'Products'));
      if (scene.products !== null) {
        const gathered = scene.sum !== null;
        const pg = node(svg, 'g', {});
        productsG = pg;
        const kCols = colsOf(scene.kernel);
        scene.products.forEach((p, i) => {
          const x = L.products.x + (i % kCols) * c;
          const y = L.products.y + Math.floor(i / kCols) * c;
          node(pg, 'rect', {
            x,
            y,
            width: c,
            height: c,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          });
          node(
            pg,
            'text',
            {
              x: x + c / 2,
              y: y + c / 2,
              'text-anchor': 'middle',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.lg,
              fill: gathered || p === 0 ? colors.textMuted : colors.text,
            },
            num(p),
          );
        });
      }

      // 합
      if (scene.sum !== null) {
        sumText = node(
          svg,
          'text',
          {
            x: L.sum.x,
            y: L.sum.y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.body,
            'font-size': fontSizes.lg,
            'font-weight': 700,
            fill: colors.text,
          },
          t('label.sum', 'Sum: {v}', { v: num(scene.sum) }),
        );
      }

      // 출력 (특징 지도)
      label(svg, L.output.x, L.outLabelY, t('label.output', 'Output (feature map)'));
      scene.outputs.forEach((row, r) => {
        row.forEach((v, col) => {
          const x = L.output.x + col * c;
          const y = L.output.y + r * c;
          const latest = scene.written !== null && scene.written.row === r && scene.written.col === col;
          const aimed =
            scene.target !== null && scene.written === null && scene.target.row === r && scene.target.col === col;
          node(svg, 'rect', {
            x,
            y,
            width: c,
            height: c,
            fill: latest ? colors.accent : v === null ? colors.bg : colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          });
          if (aimed) {
            node(svg, 'rect', {
              x: x + 3,
              y: y + 3,
              width: c - 6,
              height: c - 6,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 2,
              'stroke-dasharray': '5 4',
            });
          }
          if (v !== null) {
            const txt = node(
              svg,
              'text',
              {
                x: x + c / 2,
                y: y + c / 2,
                'text-anchor': 'middle',
                'dominant-baseline': 'central',
                'font-family': fonts.mono,
                'font-size': fontSizes.lg,
                'font-weight': latest ? 700 : 400,
                fill: latest ? colors.stateInk : colors.text,
              },
              num(v),
            );
            if (latest) targetText = txt;
          }
        });
      });

      // 창 — 앉은 자리에 겹쳐 그린다. 아직 앉지 않았으면 곱 자리에 머문다
      const at = seatPoint(L, scene.seat);
      const kRows = scene.kernel.length;
      const kCols = colsOf(scene.kernel);
      const wg = node(svg, 'g', { transform: `translate(${at.x} ${at.y})` });
      windowG = wg;
      node(wg, 'rect', {
        x: 0,
        y: 0,
        width: kCols * c,
        height: kRows * c,
        fill: colors.accent,
        'fill-opacity': parked ? 0.35 : 0.2,
        stroke: 'none',
      });
      for (let i = 1; i < kRows; i += 1) {
        node(wg, 'line', {
          x1: 0,
          y1: i * c,
          x2: kCols * c,
          y2: i * c,
          stroke: colors.accent,
          'stroke-width': 1,
        });
      }
      for (let j = 1; j < kCols; j += 1) {
        node(wg, 'line', {
          x1: j * c,
          y1: 0,
          x2: j * c,
          y2: kRows * c,
          stroke: colors.accent,
          'stroke-width': 1,
        });
      }
      node(wg, 'rect', {
        x: 0,
        y: 0,
        width: kCols * c,
        height: kRows * c,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 3,
      });
      scene.kernel.forEach((row, i) => {
        row.forEach((w, j) => {
          node(
            wg,
            'text',
            parked
              ? {
                  x: j * c + c / 2,
                  y: i * c + c / 2,
                  'text-anchor': 'middle',
                  'dominant-baseline': 'central',
                  'font-family': fonts.mono,
                  'font-size': fontSizes.lg,
                  'font-weight': 700,
                  fill: colors.text,
                }
              : {
                  x: j * c + c - 4,
                  y: i * c + c - 4 - smallPx / 2,
                  'text-anchor': 'end',
                  'dominant-baseline': 'central',
                  'font-family': fonts.mono,
                  'font-size': fontSizes.xs,
                  'font-weight': 700,
                  fill: colors.textMuted,
                },
            `×${num(w)}`,
          );
        });
      });

      // 캡션
      node(
        svg,
        'text',
        {
          x: PIECE_CANVAS_W / 2,
          y: H - CAPTION_BAND / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        captionOf(scene),
      );

      motionG = node(svg, 'g', {});
    }

    function stopMotion(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    function tween(mine: number, ms: number, draw: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (destroyed || mine !== gen) return finish();
        waiters.add(finish);
        draw(0);
        let start: number | null = null;
        const frame = (now: number): void => {
          frames.delete(id);
          if (destroyed || mine !== gen) return finish();
          if (start === null) start = now;
          const k = Math.min(1, (now - start) / ms);
          draw(ease(k));
          if (k >= 1) return finish();
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        let id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    function cloneText(parent: Element, content: string, at: Point, bold: boolean): SVGTextElement {
      return node(
        parent,
        'text',
        {
          x: at.x,
          y: at.y,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': bold ? 700 : 400,
          fill: colors.text,
        },
        content,
      );
    }

    async function animateSeat(mine: number, scene: SlideTheKernelScene): Promise<void> {
      const step = scene.step;
      if (step === null || step.kind !== 'seat' || scene.products === null) return;
      const L = layoutOf(scene);
      const c = L.cell;
      const from = seatPoint(L, step.from);
      const to = seatPoint(L, step.seat);
      const kCols = colsOf(scene.kernel);

      // ① 창이 미끄러진다 — 곱은 아직 드러나지 않았다
      productsG?.setAttribute('opacity', '0');
      await tween(mine, SLIDE_MS, (k) => {
        windowG?.setAttribute('transform', `translate(${lerp(from.x, to.x, k)} ${lerp(from.y, to.y, k)})`);
      });
      if (!live(mine)) return;
      windowG?.setAttribute('transform', `translate(${to.x} ${to.y})`);

      // ② 겹친 칸마다 곱이 창에서 곱 자리로 날아간다
      const layer = motionG;
      if (layer === null) return;
      const flying = scene.products.map((p, i) => {
        const col = i % kCols;
        const row = Math.floor(i / kCols);
        const start = { x: to.x + col * c + c / 2, y: to.y + row * c + c / 2 };
        const end = { x: L.products.x + col * c + c / 2, y: L.products.y + row * c + c / 2 };
        return { el: cloneText(layer, num(p), start, true), start, end };
      });
      await tween(mine, FLY_MS, (k) => {
        for (const f of flying) {
          f.el.setAttribute('x', String(lerp(f.start.x, f.end.x, k)));
          f.el.setAttribute('y', String(lerp(f.start.y, f.end.y, k)));
        }
      });
    }

    async function animateWrite(mine: number, scene: SlideTheKernelScene): Promise<void> {
      const step = scene.step;
      if (step === null || step.kind !== 'write' || scene.products === null) return;
      const L = layoutOf(scene);
      const c = L.cell;
      const kCols = colsOf(scene.kernel);
      const layer = motionG;
      if (layer === null) return;

      // ① 곱 아홉이 한 점으로 모인다
      sumText?.setAttribute('opacity', '0');
      targetText?.setAttribute('opacity', '0');
      const gathering = scene.products.map((p, i) => {
        const start = {
          x: L.products.x + (i % kCols) * c + c / 2,
          y: L.products.y + Math.floor(i / kCols) * c + c / 2,
        };
        return { el: cloneText(layer, num(p), start, false), start };
      });
      await tween(mine, GATHER_MS, (k) => {
        for (const g of gathering) {
          g.el.setAttribute('x', String(lerp(g.start.x, L.sum.x, k)));
          g.el.setAttribute('y', String(lerp(g.start.y, L.sum.y, k)));
          g.el.setAttribute('opacity', String(round(1 - 0.7 * k)));
        }
      });
      if (!live(mine)) return;
      for (const g of gathering) g.el.remove();
      sumText?.removeAttribute('opacity');

      // ② 모인 합이 출력 칸으로 내려간다
      const end = {
        x: L.output.x + step.target.col * c + c / 2,
        y: L.output.y + step.target.row * c + c / 2,
      };
      const drop = cloneText(layer, num(step.sum), L.sum, true);
      await tween(mine, DROP_MS, (k) => {
        drop.setAttribute('x', String(lerp(L.sum.x, end.x, k)));
        drop.setAttribute('y', String(lerp(L.sum.y, end.y, k)));
      });
    }

    return {
      async render(
        next: SlideTheKernelScene,
        _prev: SlideTheKernelScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        stopMotion();
        const mine = (gen += 1);
        if (destroyed) return;
        drawStatic(next);
        if (!opts.animate || next.step === null) return;
        if (next.step.kind === 'seat') await animateSeat(mine, next);
        else await animateWrite(mine, next);
        if (live(mine)) drawStatic(next);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        stopMotion();
        svg.textContent = '';
      },
    };
  },
};
