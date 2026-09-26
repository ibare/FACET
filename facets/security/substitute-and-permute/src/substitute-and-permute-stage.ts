/**
 * 바꾸기와 섞기의 무대.
 *
 * 두 평문 A · B 가 위아래 두 줄로 놓이고, 네 칸(니블)이 두 줄을 세로로 묶는다.
 * A 와 B 가 다른 비트는 칠하고, 다른 비트가 든 칸은 띠째 밝힌다.
 *
 * - 바꾸기: 칸마다 네 비트가 칸 가운데로 모였다가 새 값으로 다시 벌어진다 — 칸 밖으로 나가지 않는다
 * - 섞기: 비트 하나하나가 π 가 정한 자리로 호를 그리며 건너간다 — 칸의 경계를 넘는다
 * - 아래 자취 줄에 층마다 다른 칸이 쌓인다
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
} from '@ffacet/core/runtime';
import { BLOCK_BITS, CELL_BITS, ROUNDS, bitsToHex } from './algorithm.js';
import type { SubstituteAndPermuteScene, TraceEntry } from './scene.js';

const H = 270;
const SVG_NS = 'http://www.w3.org/2000/svg';
/** 운동 시간 */
const MOVE_MS = 400;
const FRAME_MS = 16;

const CELLS = BLOCK_BITS / CELL_BITS;
const MARGIN = 16;
/** 줄 이름 칸 · 16 진 값 칸 */
const ROW_LABEL_W = 28;
const HEX_W = 64;
const CELL_GAP = 3;
const NIBBLE_GAP = 16;
const CELL_MAX = 30;

const ROW_A_Y = 94;
const ROW_H = 28;
const ROW_SPACING = 16;
const ROW_B_Y = ROW_A_Y + ROW_H + ROW_SPACING;
const TRACE_Y = 220;
const TRACE_SQ = 10;

type Row = 'a' | 'b';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

function round2(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

/** 비트 자리 · 칸 자리 — 캔버스 폭에서 역산한다 */
function geometry(): { cellW: number; xOf: (i: number) => number; nibbleX: (j: number) => number; nibbleW: number } {
  const left = MARGIN + ROW_LABEL_W;
  const right = PIECE_CANVAS_W - MARGIN - HEX_W;
  const room = right - left - (CELLS - 1) * NIBBLE_GAP - (BLOCK_BITS - CELLS) * CELL_GAP;
  const cellW = Math.min(CELL_MAX, room / BLOCK_BITS);
  const nibbleW = CELL_BITS * cellW + (CELL_BITS - 1) * CELL_GAP;
  const used = CELLS * nibbleW + (CELLS - 1) * NIBBLE_GAP;
  const start = left + (right - left - used) / 2;
  const nibbleX = (j: number): number => start + j * (nibbleW + NIBBLE_GAP);
  const xOf = (i: number): number => {
    const j = Math.floor(i / CELL_BITS);
    const k = i % CELL_BITS;
    return nibbleX(j) + k * (cellW + CELL_GAP);
  };
  return { cellW, xOf, nibbleX, nibbleW };
}

export const substituteAndPermuteStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params) {
    const canvas = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const geo = geometry();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 한 칸의 비트 — 자리 x, 세로 어긋남 dy, 값, 다른가 */
    function bitCell(parent: SVGGElement, x: number, rowY: number, v: number, diff: boolean): void {
      parent.appendChild(
        el('rect', {
          x: round2(x),
          y: round2(rowY),
          width: round2(geo.cellW),
          height: ROW_H,
          rx: 3,
          fill: diff ? colors.itemComparing : colors.bgSubtle,
          stroke: diff ? colors.itemComparing : colors.border,
        }),
      );
      parent.appendChild(
        el(
          'text',
          {
            x: round2(x + geo.cellW / 2),
            y: round2(rowY + ROW_H / 2),
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: diff ? colors.stateInk : colors.text,
          },
          String(v),
        ),
      );
    }

    /** diffBits · diffCells — 운동 도중이면 층 앞의 값 (띠 · 칸과 같은 시점) */
    function drawCaption(scene: SubstituteAndPermuteScene, diffBits: readonly number[], diffCells: readonly number[]): void {
      const step = scene.step;
      if (!step) throw new Error('substitute-and-permute-stage: init 뒤의 장면에 step 이 없다');
      let line: string;
      if (step.kind === 'start') {
        line = t('caption.start', 'Start: B is A with only bit {pos} flipped.', { pos: step.flipPos });
      } else if (step.kind === 's') {
        line =
          step.round === ROUNDS
            ? t('caption.subLast', 'Round {r} · substitute: each nibble goes through the S-box on its own. No permute follows.', {
                r: step.round,
              })
            : t('caption.sub', 'Round {r} · substitute: each nibble goes through the S-box on its own.', { r: step.round });
      } else {
        line = t('caption.perm', 'Round {r} · permute: bits move to new positions, across nibbles.', { r: step.round });
      }
      canvas.appendChild(
        el(
          'text',
          { x: MARGIN, y: 24, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text },
          line,
        ),
      );
      // 세는 수와 칠한 표시를 같은 줄에 묶는다
      const y = 50;
      canvas.appendChild(el('rect', { x: MARGIN, y: y - 9, width: 12, height: 12, rx: 2, fill: colors.itemComparing }));
      canvas.appendChild(
        el(
          'text',
          { x: MARGIN + 18, y: y + 1, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
          t('count.bits', 'Different bits: {n}', { n: diffBits.length }),
        ),
      );
      // 계기 셋이 한 줄을 삼등분한다
      const colW = (PIECE_CANVAS_W - 2 * MARGIN) / 3;
      const x2 = MARGIN + colW;
      canvas.appendChild(
        el('rect', {
          x: x2,
          y: y - 9,
          width: 12,
          height: 12,
          rx: 2,
          fill: colors.accent,
          'fill-opacity': 0.35,
          stroke: colors.accent,
        }),
      );
      canvas.appendChild(
        el(
          'text',
          { x: x2 + 18, y: y + 1, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text },
          t('count.cells', 'Different nibbles: {n} / {total}', { n: diffCells.length, total: CELLS }),
        ),
      );
      if (step.kind === 'p') {
        // 섞기에서 제자리에 남는 비트가 있다 — 옮기는 비트 수를 셈한 값으로 보인다
        if (!scene.base) throw new Error('substitute-and-permute-stage: 섞기 장면에 바탕이 없다');
        canvas.appendChild(
          el(
            'text',
            { x: round2(MARGIN + 2 * colW), y: y + 1, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.textMuted },
            t('count.moved', 'Bits that move: {moved} / {total}', { moved: scene.base.movedBits, total: BLOCK_BITS }),
          ),
        );
      }
    }

    function drawNibbles(diffCells: readonly number[]): void {
      const layer = el('g', {});
      for (let j = 0; j < CELLS; j++) {
        const on = diffCells.includes(j + 1);
        layer.appendChild(
          el('rect', {
            x: round2(geo.nibbleX(j) - 5),
            y: ROW_A_Y - 5,
            width: round2(geo.nibbleW + 10),
            height: ROW_B_Y + ROW_H - ROW_A_Y + 10,
            rx: 6,
            fill: on ? colors.accent : colors.bg,
            'fill-opacity': on ? 0.35 : 1,
            stroke: on ? colors.accent : colors.border,
            'stroke-width': on ? 2 : 1,
          }),
        );
        layer.appendChild(
          el(
            'text',
            {
              x: round2(geo.nibbleX(j) + geo.nibbleW / 2),
              y: ROW_A_Y - 14,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: on ? colors.text : colors.textMuted,
              'font-weight': on ? 600 : 400,
            },
            t('label.nibble', 'Nibble {n}', { n: j + 1 }),
          ),
        );
      }
      canvas.appendChild(layer);
    }

    function drawRowLabels(a: readonly number[], b: readonly number[]): void {
      const rows: Array<[Row, number, readonly number[]]> = [
        ['a', ROW_A_Y, a],
        ['b', ROW_B_Y, b],
      ];
      for (const [row, y, bits] of rows) {
        canvas.appendChild(
          el(
            'text',
            {
              x: MARGIN + 4,
              y: y + ROW_H / 2,
              'dominant-baseline': 'central',
              'font-family': fonts.body,
              'font-size': fontSizes.lg,
              'font-weight': 600,
              fill: colors.text,
            },
            row === 'a' ? t('label.rowA', 'A') : t('label.rowB', 'B'),
          ),
        );
        canvas.appendChild(
          el(
            'text',
            {
              x: PIECE_CANVAS_W - MARGIN,
              y: y + ROW_H / 2,
              'text-anchor': 'end',
              'dominant-baseline': 'central',
              'font-family': fonts.mono,
              'font-size': fontSizes.lg,
              fill: colors.text,
            },
            bitsToHex(bits),
          ),
        );
      }
    }

    function drawTrace(trace: readonly TraceEntry[]): void {
      const layer = el('g', {});
      layer.appendChild(
        el(
          'text',
          {
            x: MARGIN,
            y: TRACE_Y - 8,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          t('label.trace', 'Different nibbles'),
        ),
      );
      // 처음 하나 + 라운드마다 바꾸기 · 섞기 + 마지막 라운드의 바꾸기
      const slots = 1 + 2 * (ROUNDS - 1) + 1;
      const colW = (PIECE_CANVAS_W - 2 * MARGIN) / slots;
      trace.forEach((entry, idx) => {
        const cx = MARGIN + colW * idx + colW / 2;
        const current = idx === trace.length - 1;
        const label =
          entry.kind === 'start'
            ? t('label.layerStart', 'Start')
            : entry.kind === 's'
              ? t('label.layerS', 'S {r}', { r: entry.round })
              : t('label.layerP', 'P {r}', { r: entry.round });
        layer.appendChild(
          el(
            'text',
            {
              x: round2(cx),
              y: TRACE_Y + 10,
              'text-anchor': 'middle',
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              'font-weight': current ? 600 : 400,
              fill: current ? colors.text : colors.textMuted,
            },
            label,
          ),
        );
        const rowW = CELLS * TRACE_SQ + (CELLS - 1) * 2;
        const x0 = cx - rowW / 2;
        if (current) {
          layer.appendChild(
            el('rect', {
              x: round2(x0 - 5),
              y: TRACE_Y + 19,
              width: round2(rowW + 10),
              height: TRACE_SQ + 10,
              rx: 4,
              fill: 'none',
              stroke: colors.text,
            }),
          );
        }
        for (let j = 0; j < CELLS; j++) {
          const on = entry.diffCells.includes(j + 1);
          layer.appendChild(
            el('rect', {
              x: round2(x0 + j * (TRACE_SQ + 2)),
              y: TRACE_Y + 24,
              width: TRACE_SQ,
              height: TRACE_SQ,
              rx: 2,
              fill: on ? colors.accent : colors.bgSubtle,
              stroke: on ? colors.accent : colors.border,
            }),
          );
        }
      });
      canvas.appendChild(layer);
    }

    /** 장면 전체를 세운다. p < 1 이면 이번 층의 운동 도중 */
    function draw(scene: SubstituteAndPermuteScene, p: number): void {
      canvas.textContent = '';
      if (!scene.base) return; // init 앞의 장면은 빈 캔버스다
      const step = scene.step;
      if (!step) throw new Error('substitute-and-permute-stage: init 뒤의 장면에 step 이 없다');
      const moving = p < 1 && step.kind !== 'start';

      canvas.appendChild(el('rect', { x: 0, y: 0, width: PIECE_CANVAS_W, height: H, fill: colors.bg }));
      // 운동 도중에는 칸 · 띠 · 16 진 값 · 계기 · 자취가 모두 층 앞의 시점을 보인다
      const shown = moving
        ? { a: step.fromA, b: step.fromB, bits: step.fromDiffBits, cells: step.fromDiffCells, trace: scene.trace.slice(0, -1) }
        : { a: scene.a, b: scene.b, bits: scene.diffBits, cells: scene.diffCells, trace: scene.trace };
      drawCaption(scene, shown.bits, shown.cells);
      drawNibbles(shown.cells);
      drawRowLabels(shown.a, shown.b);

      const bitsLayer = el('g', {});
      if (!moving) {
        for (let i = 0; i < BLOCK_BITS; i++) {
          const diff = scene.diffBits.includes(i + 1);
          bitCell(bitsLayer, geo.xOf(i), ROW_A_Y, scene.a[i]!, diff);
          bitCell(bitsLayer, geo.xOf(i), ROW_B_Y, scene.b[i]!, diff);
        }
      } else if (step.kind === 's') {
        // 칸 가운데로 모였다가 새 값으로 벌어진다 — 칸 안에서만 움직인다
        const e = ease(p);
        const squeeze = 1 - 0.75 * (1 - Math.abs(2 * e - 1));
        const after = e >= 0.5;
        for (let i = 0; i < BLOCK_BITS; i++) {
          const j = Math.floor(i / CELL_BITS);
          const cx = geo.nibbleX(j) + geo.nibbleW / 2 - geo.cellW / 2;
          const x = cx + (geo.xOf(i) - cx) * squeeze;
          const diff = after ? scene.diffBits.includes(i + 1) : step.fromDiffBits.includes(i + 1);
          bitCell(bitsLayer, x, ROW_A_Y, after ? scene.a[i]! : step.fromA[i]!, diff);
          bitCell(bitsLayer, x, ROW_B_Y, after ? scene.b[i]! : step.fromB[i]!, diff);
        }
      } else {
        // 비트마다 π 가 정한 자리로 호를 그리며 건너간다 — A 는 위로, B 는 아래로
        const e = ease(p);
        const span = geo.xOf(BLOCK_BITS - 1) - geo.xOf(0);
        const perm = scene.base.perm;
        for (let i = 0; i < BLOCK_BITS; i++) {
          const dest = perm[i];
          if (dest === undefined) throw new Error(`substitute-and-permute-stage: base.perm[${i}] 가 없다`);
          const x0 = geo.xOf(i);
          const x1 = geo.xOf(dest - 1);
          const x = x0 + (x1 - x0) * e;
          const lift = (6 + (22 * Math.abs(x1 - x0)) / span) * Math.sin(Math.PI * e);
          const diff = step.fromDiffBits.includes(i + 1);
          bitCell(bitsLayer, x, ROW_A_Y - lift, step.fromA[i]!, diff);
          bitCell(bitsLayer, x, ROW_B_Y + lift, step.fromB[i]!, diff);
        }
      }
      canvas.appendChild(bitsLayer);
      drawTrace(shown.trace);
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    async function render(
      next: SubstituteAndPermuteScene,
      _prev: SubstituteAndPermuteScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const step = next.step;
      if (!opts.animate || !step || step.kind === 'start') {
        draw(next, 1);
        return;
      }
      draw(next, 0);
      const t0 = Date.now();
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - t0) / MOVE_MS);
        if (p >= 1) break;
        draw(next, p);
      }
      draw(next, 1);
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
        canvas.textContent = '';
      },
    };
  },
};
