/**
 * 보폭과 패딩의 무대 — 두르고 뛴다.
 *
 * 두르기: 둘레의 0 칸들이 바깥에서 안으로 밀려 들어와 입력을 감싼다.
 * 뛰기: 창 테두리가 창 카드에서 떠올라 두른 격자에 앉고, 다음 자리로 보폭만큼 뛰어 앉는다.
 *       앉은 자리(창 왼위 칸)의 모서리에 점이 남아 뛴 자리들의 간격이 보인다. 뛴 거리는 치수선으로 적는다.
 *       창이 두른 0 위에 걸친 칸은 칠해지고, 출력 값이 창에서 출력 칸으로 내려가 적힌다.
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
} from '@ffacet/core/runtime';
import { cellAt, cellRowLength, isPadCell } from './algorithm.js';
import type { StrideAndPaddingScene } from './scene.js';

const H = 400;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 400;
/** 뛰기가 끝나는 몫 — 그 뒤는 출력 값이 내려간다. */
const HOP_END = 0.6;
const CELL_MAX = 44;
const MARGIN_L = 44;
const MARGIN_R = 16;
const TOP = 58;
const BOTTOM_ROOM = 80;
/** 자리 점을 창 왼위 칸의 모서리 안쪽에 둔다 — 칸의 수를 가리지 않게. */
const SEAT_INSET = 7;

type Layout = {
  cell: number;
  rows: number;
  cols: number;
  p: number;
  k: number;
  outRows: number;
  outCols: number;
  gridX: number;
  gridY: number;
  cardX: number;
  cardY: number;
  outX: number;
  outY: number;
};

type Live = {
  ring: { el: SVGGElement; dx: number; dy: number }[];
  win: SVGGElement | null;
  winFrom: { dx: number; dy: number } | null;
  hl: SVGGElement | null;
  outText: { el: SVGTextElement; dx: number; dy: number } | null;
};

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function fmt(v: number): string {
  if (v === 0) return '0';
  return v < 0 ? `−${-v}` : String(v);
}

function layoutOf(s: StrideAndPaddingScene): Layout | null {
  // 출력 크기는 알고리즘이 셈해 silent size 이벤트로 보낸다. 오기 전이면 그리지 않는다.
  if (s.outRows === 0 || s.outCols === 0) return null;
  const rows = s.input.length;
  const cols = cellRowLength(s.input);
  const p = s.padding;
  const k = s.kernel.length;
  const { outRows, outCols } = s;
  const pr = rows + 2 * p;
  const pc = cols + 2 * p;
  // 폭을 채운다 — 두른 격자 · 창 카드 · 출력 · 틈 둘을 가로에 담는 칸 크기를 역산하고, 세로에도 맞춘다.
  const byW = (PIECE_CANVAS_W - MARGIN_L - MARGIN_R) / (pc + k + outCols + 1.6);
  const byH = (H - TOP - BOTTOM_ROOM) / pr;
  const cell = Math.floor(Math.min(CELL_MAX, byW, byH));
  const gap = cell * 0.8;
  const gridX = MARGIN_L;
  const gridY = TOP;
  const cardX = gridX + pc * cell + gap;
  const cardY = gridY + p * cell;
  const outX = cardX + k * cell + gap;
  const outY = cardY;
  return { cell, rows, cols, p, k, outRows, outCols, gridX, gridY, cardX, cardY, outX, outY };
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export const strideAndPaddingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let live: Live = { ring: [], win: null, winFrom: null, hl: null, outText: null };

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, v] of Object.entries(attrs)) node.setAttribute(key, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      text: string,
      x: number,
      y: number,
      parent: Element,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? colors.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'central',
          'font-weight': opts.weight ?? 'normal',
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    function drawStatic(s: StrideAndPaddingScene): void {
      svg.textContent = '';
      live = { ring: [], win: null, winFrom: null, hl: null, outText: null };
      const L = layoutOf(s);
      if (!L) return;
      const { cell, rows, cols, p, k } = L;
      const root = el('g', {}, svg);
      const current = s.step.kind === 'seat' ? s.step.seat : null;
      const cx = (c: number): number => L.gridX + c * cell;
      const cy = (r: number): number => L.gridY + r * cell;

      // 두른 격자 (두르기 전이면 입력 칸만).
      const gridLayer = el('g', {}, root);
      const pr = rows + 2 * p;
      const pc = cols + 2 * p;
      for (let r = 0; r < pr; r += 1) {
        for (let c = 0; c < pc; c += 1) {
          const pad = isPadCell(r, c, rows, cols, p);
          if (pad && !s.padded) continue;
          const v = s.padded ? cellAt(s.padded, r, c) : cellAt(s.input, r - p, c - p);
          const g = el('g', {}, gridLayer);
          el(
            'rect',
            {
              x: cx(c) + 1,
              y: cy(r) + 1,
              width: cell - 2,
              height: cell - 2,
              rx: 3,
              fill: pad ? colors.bg : colors.bgSubtle,
              stroke: colors.border,
              'stroke-width': 1,
              ...(pad ? { 'stroke-dasharray': '3 3' } : {}),
            },
            g,
          );
          label(fmt(v), cx(c) + cell / 2, cy(r) + cell / 2, g, {
            size: fontSizes.md,
            mono: true,
            anchor: 'middle',
            fill: pad ? colors.textMuted : colors.text,
          });
          if (pad) {
            const dy = r < p ? -1 : r >= rows + p ? 1 : 0;
            const dx = c < p ? -1 : c >= cols + p ? 1 : 0;
            live.ring.push({ el: g, dx: dx * cell * 0.9, dy: dy * cell * 0.9 });
          }
        }
      }
      label(
        s.padded
          ? t('label.padded', 'Padded: {rows}×{cols}', { rows: pr, cols: pc })
          : t('label.input', 'Input: {rows}×{cols}', { rows, cols }),
        L.gridX,
        cy(pr) + 18,
        root,
        { fill: colors.textMuted },
      );

      // 창이 두른 0 위에 걸친 칸.
      if (current) {
        const hl = el('g', {}, root);
        for (let i = 0; i < k; i += 1) {
          for (let j = 0; j < k; j += 1) {
            const r = current.r + i;
            const c = current.c + j;
            if (!isPadCell(r, c, rows, cols, p)) continue;
            el('rect', { x: cx(c) + 1, y: cy(r) + 1, width: cell - 2, height: cell - 2, rx: 3, fill: colors.accent }, hl);
            label('0', cx(c) + cell / 2, cy(r) + cell / 2, hl, {
              size: fontSizes.md,
              mono: true,
              anchor: 'middle',
              fill: colors.stateInk,
              weight: 'bold',
            });
          }
        }
        live.hl = hl;
      }

      // 앉았던 자리(창 왼위 칸)의 모서리 점 — 뛴 간격이 격자 위에 남는다.
      const dots = el('g', {}, root);
      for (const seat of s.seats) {
        if (seat === current) continue;
        el('circle', { cx: cx(seat.c) + SEAT_INSET, cy: cy(seat.r) + SEAT_INSET, r: 3.5, fill: colors.textMuted }, dots);
      }

      // 뛴 거리의 치수선.
      if (s.step.kind === 'seat' && s.step.from && current) {
        const from = s.step.from;
        const m = el('g', {}, root);
        const stroke = { stroke: colors.textMuted, 'stroke-width': 1.5, fill: 'none' };
        if (from.r !== current.r) {
          const x = L.gridX - 14;
          const y0 = cy(from.r);
          const y1 = cy(current.r);
          el('line', { x1: x, y1: y0, x2: x, y2: y1, ...stroke }, m);
          el('line', { x1: x - 5, y1: y0, x2: x + 5, y2: y0, ...stroke }, m);
          el('polyline', { points: `${r2(x - 5)},${r2(y1 - 7)} ${r2(x)},${r2(y1)} ${r2(x + 5)},${r2(y1 - 7)}`, ...stroke }, m);
          label(String(current.r - from.r), x - 8, (y0 + y1) / 2, m, { anchor: 'end', mono: true, weight: 'bold' });
        } else {
          const y = L.gridY - 14;
          const x0 = cx(from.c);
          const x1 = cx(current.c);
          el('line', { x1: x0, y1: y, x2: x1, y2: y, ...stroke }, m);
          el('line', { x1: x0, y1: y - 5, x2: x0, y2: y + 5, ...stroke }, m);
          el('polyline', { points: `${r2(x1 - 7)},${r2(y - 5)} ${r2(x1)},${r2(y)} ${r2(x1 - 7)},${r2(y + 5)}`, ...stroke }, m);
          label(String(current.c - from.c), (x0 + x1) / 2, y - 12, m, { anchor: 'middle', mono: true, weight: 'bold' });
        }
      }

      // 창 카드 — 무게 한 벌. 창이 여기서 떠올라 격자로 간다.
      label(t('label.window', 'Window'), L.cardX, L.cardY - 14, root, { fill: colors.textMuted });
      const card = el('g', {}, root);
      for (let i = 0; i < k; i += 1) {
        for (let j = 0; j < k; j += 1) {
          const x = L.cardX + j * cell;
          const y = L.cardY + i * cell;
          el('rect', { x, y, width: cell, height: cell, fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 }, card);
          label(fmt(cellAt(s.kernel, i, j)), x + cell / 2, y + cell / 2, card, { size: fontSizes.md, mono: true, anchor: 'middle' });
        }
      }

      // 창 테두리 — 앉은 자리 또는 카드 위.
      const winX = current ? cx(current.c) : L.cardX;
      const winY = current ? cy(current.r) : L.cardY;
      const win = el('g', {}, root);
      el(
        'rect',
        {
          x: winX,
          y: winY,
          width: k * cell,
          height: k * cell,
          rx: 4,
          fill: colors.primary,
          'fill-opacity': current ? 0.08 : 0,
          stroke: colors.primary,
          'stroke-width': 3,
        },
        win,
      );
      if (current) {
        el('circle', { cx: winX + SEAT_INSET, cy: winY + SEAT_INSET, r: 4.5, fill: colors.primary }, win);
        live.win = win;
        const from = s.step.kind === 'seat' ? s.step.from : null;
        const fx = from ? cx(from.c) : L.cardX;
        const fy = from ? cy(from.r) : L.cardY;
        live.winFrom = { dx: fx - winX, dy: fy - winY };
      }

      // 출력 — 크기는 두른 뒤에 선다.
      if (s.padded) {
        label(t('label.output', 'Output: {rows}×{cols}', { rows: L.outRows, cols: L.outCols }), L.outX, L.outY - 14, root, {
          fill: colors.textMuted,
        });
        const out = el('g', {}, root);
        for (let i = 0; i < L.outRows; i += 1) {
          for (let j = 0; j < L.outCols; j += 1) {
            const isCur = current !== null && current.or === i && current.oc === j;
            el(
              'rect',
              {
                x: L.outX + j * cell + 1,
                y: L.outY + i * cell + 1,
                width: cell - 2,
                height: cell - 2,
                rx: 3,
                fill: colors.bg,
                stroke: isCur ? colors.primary : colors.border,
                'stroke-width': isCur ? 2.5 : 1,
              },
              out,
            );
          }
        }
        for (const seat of s.seats) {
          const ox = L.outX + seat.oc * cell + cell / 2;
          const oy = L.outY + seat.or * cell + cell / 2;
          const node = label(fmt(seat.value), ox, oy, out, { size: fontSizes.md, mono: true, anchor: 'middle', weight: 'bold' });
          if (seat === current) {
            live.outText = { el: node, dx: winX + (k * cell) / 2 - ox, dy: winY + (k * cell) / 2 - oy };
          }
        }
        // 식은 창 카드 아래에서 시작해 출력 아래까지 걸친다 — 출력 폭만으로는 모자라다.
        const fy = L.outY + Math.max(k, L.outRows) * cell + 22;
        label(
          t('label.formula', '⌊({n} + 2·{p} − {k}) / {s}⌋ + 1 = {out}', { n: rows, p, k, s: s.stride, out: L.outRows }),
          L.cardX,
          fy,
          root,
          { mono: true },
        );
        if (cols !== rows) {
          label(
            t('label.formula', '⌊({n} + 2·{p} − {k}) / {s}⌋ + 1 = {out}', { n: cols, p, k, s: s.stride, out: L.outCols }),
            L.cardX,
            fy + 20,
            root,
            { mono: true },
          );
        }
      }

      // 캡션 — 지금 일어나는 일만.
      const y1 = H - 34;
      const y2 = H - 12;
      const cap = { size: fontSizes.md };
      const step = s.step;
      if (step.kind === 'start') {
        label(t('caption.start', 'Padding: {p} · Stride: {s}', { p, s: s.stride }), L.gridX, y1, root, cap);
      } else if (step.kind === 'pad') {
        label(t('caption.pad', 'Zeros added around the input: {n}', { n: step.added }), L.gridX, y1, root, cap);
      } else {
        const seat = step.seat;
        label(
          t('caption.seat', 'Window at ({r}, {c}) · zeros under it: {n}', { r: seat.r, c: seat.c, n: seat.padCells }),
          L.gridX,
          y1,
          root,
          cap,
        );
        label(
          t('caption.value', 'Output ({r}, {c}): {v} · seats: {n} / {total}', {
            r: seat.or,
            c: seat.oc,
            v: fmt(seat.value),
            n: s.seats.length,
            total: L.outRows * L.outCols,
          }),
          L.gridX,
          y2,
          root,
          { ...cap, fill: colors.textMuted },
        );
      }
    }

    function clock(ms: number, mine: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          const u = clamp01((performance.now() - start) / ms);
          frame(u);
          if (u >= 1) {
            done();
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

    async function render(next: StrideAndPaddingScene, _prev: StrideAndPaddingScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate) return;
      const step = next.step;
      if (step.kind === 'pad' && live.ring.length > 0) {
        const ring = live.ring;
        await clock(MOVE_MS, mine, (u) => {
          const left = 1 - ease(u);
          for (const cellEl of ring) {
            cellEl.el.setAttribute('transform', `translate(${r2(cellEl.dx * left)} ${r2(cellEl.dy * left)})`);
            cellEl.el.setAttribute('opacity', String(r2(1 - left)));
          }
        });
      } else if (step.kind === 'seat' && live.win && live.winFrom) {
        const win = live.win;
        const from = live.winFrom;
        const hl = live.hl;
        const outText = live.outText;
        const hop = Math.min(60, Math.hypot(from.dx, from.dy) * 0.35 + 18);
        await clock(MOVE_MS, mine, (u) => {
          const h = clamp01(u / HOP_END);
          const left = 1 - ease(h);
          const lift = Math.sin(Math.PI * h) * hop;
          win.setAttribute('transform', `translate(${r2(from.dx * left)} ${r2(from.dy * left - lift)})`);
          if (hl) hl.setAttribute('opacity', h < 1 ? '0' : '1');
          if (outText) {
            const v = clamp01((u - HOP_END) / (1 - HOP_END));
            const rest = 1 - ease(v);
            outText.el.setAttribute('transform', `translate(${r2(outText.dx * rest)} ${r2(outText.dy * rest)})`);
            outText.el.setAttribute('opacity', v > 0 ? '1' : '0');
          }
        });
      }
      if (mine === gen && !destroyed) drawStatic(next);
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
