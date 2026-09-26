/**
 * shrink-by-summary stage — 추려 올린다.
 *
 * 특징 지도는 아래에, 줄어든 지도는 그보다 위 오른쪽에, 버린 칸의 줄은 맨 아래에 둔다.
 * 창 안 가장 큰 수는 위로 올라가 줄어든 지도의 한 칸이 되고, 나머지 셋은 아래 줄로
 * 떨어져 작아진다. 특징 지도에는 빈 자리만 남는다 — 끝에는 위에 넷, 아래에 열둘.
 */
import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { ShrinkBase, ShrinkScene } from './scene.js';

const H = 488;
const PAD = 24;
const CELL_MAX = 56;
const TOP = 80;
const TRAY_GAP = 6;
const MOVE_MS = 400;
/** 운동 가운데 창이 뛰는 몫. 나머지는 수가 오르고 떨어지는 몫 */
const JUMP_SHARE = 0.3;
const SVG_NS = 'http://www.w3.org/2000/svg';

type Layout = {
  s: number;
  inLeft: number;
  inTop: number;
  outLeft: number;
  outTop: number;
  trayLeft: number;
  trayTop: number;
  slot: number;
};

type Handles = {
  frame: SVGElement | null;
  outNewest: SVGElement | null;
  trayNewest: SVGElement[];
};

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
}

function el(tag: string, attrs: Record<string, string | number>, parent: Element): SVGElement {
  const node = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, typeof value === 'number' ? String(r2(value)) : value);
  }
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, fill: string, size: string, weight = 400): SVGElement {
  const node = el(
    'text',
    { x, y, fill, 'font-family': fonts.body, 'font-size': size, 'font-weight': weight },
    parent,
  );
  node.textContent = text;
  return node;
}

function layoutOf(base: ShrinkBase): Layout {
  const W = PIECE_CANVAS_W;
  const rows = base.rows;
  const cols = base.cols;
  const outCols = base.outCols;
  const count = base.droppedTotal;
  // 버린 칸 줄 — 폭을 다 쓴다
  const slotByWidth = (W - 2 * PAD - (count - 1) * TRAY_GAP) / count;
  // 가로: 특징 지도 + 줄어든 지도 + 사이 여백 두 칸
  const sByWidth = (W - 2 * PAD) / (cols + outCols + 4);
  const slotGuess = Math.min(CELL_MAX * 0.75, slotByWidth);
  // 세로: 올림 한 칸 + 특징 지도 + 버린 줄
  const sByHeight = (H - TOP - 24 - 44 - slotGuess - 16) / (rows + 1);
  const s = Math.floor(Math.min(CELL_MAX, sByWidth, sByHeight));
  const slot = Math.floor(Math.min(s * 0.75, slotByWidth));
  const inLeft = PAD + 8;
  const inTop = TOP + s + 24;
  const inRight = inLeft + cols * s;
  const outLeft = Math.round((inRight + W - PAD) / 2 - (outCols * s) / 2);
  const trayTop = inTop + rows * s + 44;
  return { s, inLeft, inTop, outLeft, outTop: TOP, trayLeft: PAD, trayTop, slot };
}

/** 한 칸 — 원점에 그리고 자리는 transform 으로 준다. 운동이 이 transform 만 바꾼다. */
function cellGroup(
  parent: Element,
  x: number,
  y: number,
  size: number,
  value: number,
  fill: string,
  stroke: string,
  ink: string,
  weight: number,
): SVGElement {
  const g = el('g', { transform: `translate(${r2(x)},${r2(y)})` }, parent);
  el('rect', { x: 1, y: 1, width: size - 2, height: size - 2, rx: 4, fill, stroke, 'stroke-width': 1.5 }, g);
  const txt = el(
    'text',
    {
      x: size / 2,
      y: size / 2,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      fill: ink,
      'font-family': fonts.mono,
      'font-size': size >= 44 ? fontSizes.xl : fontSizes.md,
      'font-weight': weight,
    },
    g,
  );
  txt.textContent = String(value);
  return g;
}

function emptySlot(parent: Element, x: number, y: number, size: number, stroke: string): void {
  el(
    'rect',
    {
      x: x + 1,
      y: y + 1,
      width: size - 2,
      height: size - 2,
      rx: 4,
      fill: 'none',
      stroke,
      'stroke-width': 1,
      'stroke-dasharray': '4 3',
    },
    parent,
  );
}

function drawStatic(svg: SVGSVGElement, scene: ShrinkScene, c: Palette, t: Translate): Handles {
  svg.textContent = '';
  const handles: Handles = { frame: null, outNewest: null, trayNewest: [] };
  const step = scene.step;
  const latest = scene.windows[scene.windows.length - 1];
  const base = scene.base;
  if (!base) return handles;

  // 캡션 — 지금 일어나는 일만
  if (step.kind === 'start') {
    label(
      svg,
      PAD,
      24,
      t('caption.start', 'Each {k}×{k} window keeps only its largest value. Stride: {s}.', {
        k: base.k,
        s: base.stride,
      }),
      c.text,
      fontSizes.md,
      600,
    );
  } else if (latest) {
    label(
      svg,
      PAD,
      24,
      t('caption.pool', 'Window at ({r}, {c}): largest is {m}, at ({mr}, {mc}).', {
        r: latest.top,
        c: latest.left,
        m: latest.max,
        mr: latest.maxRow,
        mc: latest.maxCol,
      }),
      c.text,
      fontSizes.md,
      600,
    );
    label(svg, PAD, 46, t('caption.pick', 'Only it goes up; the other cells fall away.'), c.textMuted, fontSizes.sm);
  }

  const L = layoutOf(base);
  const { s } = L;

  // 특징 지도
  label(
    svg,
    L.inLeft,
    L.inTop - 10,
    t('label.input', 'Feature map {rows}×{cols}', { rows: base.rows, cols: base.cols }),
    c.textMuted,
    fontSizes.sm,
  );
  const consumed = new Set<string>();
  for (const w of scene.windows) {
    for (let i = 0; i < base.k; i += 1) for (let j = 0; j < base.k; j += 1) consumed.add(`${w.top + i},${w.left + j}`);
  }
  for (let r = 0; r < base.rows; r += 1) {
    for (let col = 0; col < base.cols; col += 1) {
      const x = L.inLeft + col * s;
      const y = L.inTop + r * s;
      if (consumed.has(`${r},${col}`)) {
        emptySlot(svg, x, y, s, c.border);
      } else {
        cellGroup(svg, x, y, s, base.grid[r]![col]!, c.bgSubtle, c.border, c.text, 500);
      }
    }
  }

  // 줄어든 지도
  label(
    svg,
    L.outLeft,
    L.outTop - 10,
    t('label.output', 'Pooled map {rows}×{cols}', { rows: base.outRows, cols: base.outCols }),
    c.textMuted,
    fontSizes.sm,
  );
  for (let r = 0; r < base.outRows; r += 1) {
    for (let col = 0; col < base.outCols; col += 1) {
      emptySlot(svg, L.outLeft + col * s, L.outTop + r * s, s, c.border);
    }
  }
  for (const w of scene.windows) {
    const isNew = step.kind === 'pool' && w === latest;
    const g = cellGroup(
      svg,
      L.outLeft + w.outCol * s,
      L.outTop + w.outRow * s,
      s,
      w.max,
      isNew ? c.accent : c.bg,
      isNew ? c.accent : c.text,
      isNew ? c.stateInk : c.text,
      700,
    );
    if (isNew) handles.outNewest = g;
  }
  const keptY = L.outTop + base.outRows * s + 22;
  label(svg, L.outLeft, keptY, t('label.kept', 'Kept: {n}', { n: scene.kept }), c.text, fontSizes.md, 600);
  if (step.kind === 'pool' && step.last) {
    label(
      svg,
      L.outLeft,
      keptY + 24,
      t('caption.done', 'Cells: {from} → {to}', { from: scene.kept + scene.dropped, to: scene.kept }),
      c.text,
      fontSizes.md,
      600,
    );
  }

  // 버린 칸의 줄
  label(
    svg,
    L.trayLeft,
    L.trayTop - 10,
    t('label.dropped', 'Dropped: {n}', { n: scene.dropped }),
    c.textMuted,
    fontSizes.sm,
    600,
  );
  for (let i = 0; i < base.droppedTotal; i += 1) {
    emptySlot(svg, L.trayLeft + i * (L.slot + TRAY_GAP), L.trayTop, L.slot, c.border);
  }
  let idx = 0;
  for (const w of scene.windows) {
    const isNew = step.kind === 'pool' && w === latest;
    for (const cell of w.dropped) {
      const g = cellGroup(
        svg,
        L.trayLeft + idx * (L.slot + TRAY_GAP),
        L.trayTop,
        L.slot,
        cell.value,
        c.bgSubtle,
        isNew ? c.textMuted : c.border,
        isNew ? c.text : c.textMuted,
        400,
      );
      if (isNew) handles.trayNewest.push(g);
      idx += 1;
    }
  }

  // 창 — 마지막에 앉은 자리
  if (latest) {
    handles.frame = el(
      'rect',
      {
        x: L.inLeft + latest.left * s - 3,
        y: L.inTop + latest.top * s - 3,
        width: base.k * s + 6,
        height: base.k * s + 6,
        rx: 6,
        fill: 'none',
        stroke: c.accent,
        'stroke-width': 3,
      },
      svg,
    );
  }
  return handles;
}

function easeOut(u: number): number {
  return 1 - (1 - u) * (1 - u);
}

function easeIn(u: number): number {
  return u * u;
}

export const shrinkBySummaryStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function stopAll(): void {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
    }

    function run(mine: number, onFrame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let start: number | null = null;
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number): void => {
          if (destroyed || mine !== gen) {
            done();
            return;
          }
          if (start === null) start = now;
          const u = Math.min(1, (now - start) / MOVE_MS);
          onFrame(u);
          if (u >= 1) {
            done();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const first = requestAnimationFrame((n) => {
          frames.delete(first);
          tick(n);
        });
        frames.add(first);
      });
    }

    async function render(next: ShrinkScene, _prev: ShrinkScene | null, opts: { animate: boolean }): Promise<void> {
      stopAll();
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(svg, next, c, t);
      const step = next.step;
      const latest = next.windows[next.windows.length - 1];
      if (!opts.animate || step.kind !== 'pool' || !latest || !next.base) return;

      const L = layoutOf(next.base);
      const { s } = L;
      // 창이 뛴 거리 — 아직 못 온 만큼
      const jump = step.from
        ? { dx: (step.from.left - latest.left) * s, dy: (step.from.top - latest.top) * s }
        : { dx: 0, dy: 0 };
      // 오를 수 — 줄어든 지도의 칸에서 특징 지도의 제 자리까지
      const upFrom = {
        dx: L.inLeft + latest.maxCol * s - (L.outLeft + latest.outCol * s),
        dy: L.inTop + latest.maxRow * s - (L.outTop + latest.outRow * s),
      };
      const baseIndex = next.dropped - latest.dropped.length;
      const falls = latest.dropped.map((cell, i) => ({
        endX: L.trayLeft + (baseIndex + i) * (L.slot + TRAY_GAP),
        startX: L.inLeft + cell.col * s,
        startY: L.inTop + cell.row * s,
      }));
      const outX = L.outLeft + latest.outCol * s;
      const outY = L.outTop + latest.outRow * s;
      const scaleFrom = s / L.slot;

      const apply = (u: number): void => {
        const a = Math.min(1, u / JUMP_SHARE);
        const b = Math.max(0, (u - JUMP_SHARE) / (1 - JUMP_SHARE));
        const ea = easeOut(a);
        if (handles.frame) {
          handles.frame.setAttribute(
            'transform',
            `translate(${r2(jump.dx * (1 - ea))},${r2(jump.dy * (1 - ea))})`,
          );
        }
        const up = easeOut(b);
        if (handles.outNewest) {
          handles.outNewest.setAttribute(
            'transform',
            `translate(${r2(outX + upFrom.dx * (1 - up))},${r2(outY + upFrom.dy * (1 - up))})`,
          );
        }
        const down = easeIn(b);
        handles.trayNewest.forEach((g, i) => {
          const f = falls[i];
          if (!f) return;
          const x = f.startX + (f.endX - f.startX) * down;
          const y = f.startY + (L.trayTop - f.startY) * down;
          const k = scaleFrom + (1 - scaleFrom) * down;
          g.setAttribute('transform', `translate(${r2(x)},${r2(y)}) scale(${r2(k)})`);
        });
      };
      apply(0);
      await run(mine, apply);
      if (mine !== gen || destroyed) return;
      drawStatic(svg, next, c, t);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        stopAll();
        svg.textContent = '';
      },
    };
  },
};
