/**
 * compress-block-by-block 의 무대.
 *
 * 왼쪽에 상태 칸 하나(덩어리와 같은 폭), 오른쪽에 메시지 바이트 줄. 자르는 걸음에서 바이트가 덩어리 폭으로
 * 벌어지고 패딩 바이트가 끝에 붙는다. 접는 걸음마다 맨 앞 덩어리가 f 를 건너 상태 칸으로 미끄러져 들어가
 * 납작해지며 사라지고, 남은 줄은 한 칸씩 당겨져 짧아진다. 상태 칸은 폭을 그대로 둔 채 값만 바뀐다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { hex2, hex4 } from './algorithm.js';
import type { CompressScene, CutBase } from './scene.js';

const H = 236;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가장자리 */
const EDGE = 24;
/** 상태 칸과 바이트 줄 사이 (f 화살표 자리) */
const ARROW_GAP = 64;
/** 바이트 칸 폭의 상한 */
const CELL_MAX = 44;
/** 덩어리 사이 틈 / 칸 폭 */
const GAP_RATIO = 0.3;

const LABEL_Y = 34;
const CHAR_Y = 68;
const CELL_Y = 78;
const CELL_H = 44;
const PAD_BRACKET_Y = CELL_Y + CELL_H + 10;
const LEN_BRACKET_Y = PAD_BRACKET_Y + 30;
const CAPTION_Y = 216;

const MOVE_MS = 400;
/** 접는 운동에서 미끄러지는 몫 — 나머지는 납작해지는 몫 */
const SLIDE_SHARE = 0.6;

type Layout = {
  cell: number;
  gap: number;
  slot: number;
  boxX: number;
  boxW: number;
  rowX: number;
};

type CellHandle = { g: SVGGElement; index: number; isPadding: boolean; x: number };

type Handles = {
  row: SVGGElement;
  frames: SVGGElement;
  brackets: SVGGElement;
  cells: CellHandle[];
  box: SVGRectElement;
  boxText: SVGTextElement;
  boxLabel: SVGTextElement;
  overlay: SVGGElement;
  layout: Layout;
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
  parent.appendChild(node);
  return node;
}

function layoutOf(paddedLength: number, blockBytes: number): Layout {
  if (paddedLength % blockBytes !== 0) {
    throw new Error(`compress-block-by-block-stage: 채운 바이트 ${paddedLength} 가 덩어리 폭 ${blockBytes} 로 나눠지지 않는다`);
  }
  const blocks = paddedLength / blockBytes;
  const units = blockBytes + paddedLength + (blocks - 1) * GAP_RATIO;
  const cell = Math.min(CELL_MAX, (W - 2 * EDGE - ARROW_GAP) / units);
  const gap = cell * GAP_RATIO;
  const boxW = cell * blockBytes;
  return { cell, gap, slot: boxW + gap, boxX: EDGE, boxW, rowX: EDGE + boxW + ARROW_GAP };
}

/** 메시지 바이트의 글자 — 빈칸은 보이게 */
function glyph(b: number): string {
  return b === 0x20 ? '␣' : String.fromCharCode(b);
}

export const compressBlockByBlockStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 한 바이트 칸 — 글자(메시지일 때) · 칸 · 16진 */
    function drawCell(parent: Element, x: number, b: number, isPadding: boolean, cell: number): SVGGElement {
      const g = make('g', { transform: `translate(${round(x)} 0)` }, parent);
      make(
        'rect',
        {
          x: 1,
          y: CELL_Y,
          width: cell - 2,
          height: CELL_H,
          rx: 2,
          fill: isPadding ? colors.bg : colors.bgSubtle,
          stroke: isPadding ? colors.textMuted : colors.border,
          'stroke-width': 1,
          ...(isPadding ? { 'stroke-dasharray': '3 2' } : {}),
        },
        g,
      );
      if (!isPadding) {
        const ch = make(
          'text',
          {
            x: cell / 2,
            y: CHAR_Y,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          },
          g,
        );
        ch.textContent = glyph(b);
      }
      const hx = make(
        'text',
        {
          x: cell / 2,
          y: CELL_Y + CELL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: isPadding ? colors.textMuted : colors.text,
        },
        g,
      );
      hx.textContent = hex2(b);
      return g;
    }

    function drawBracket(parent: Element, x1: number, x2: number, y: number, label: string): void {
      make(
        'path',
        {
          d: `M${round(x1)} ${y} L${round(x1)} ${y + 6} L${round(x2)} ${y + 6} L${round(x2)} ${y}`,
          fill: 'none',
          stroke: colors.textMuted,
          'stroke-width': 1,
        },
        parent,
      );
      const tx = make(
        'text',
        {
          x: (x1 + x2) / 2,
          y: y + 20,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        parent,
      );
      tx.textContent = label;
    }

    /** 장면 전체를 세운다. 그릴 것이 없으면 null */
    function drawStatic(scene: CompressScene): Handles | null {
      svg.textContent = '';
      if (scene.bytes === null || scene.state === null) return null;
      if (scene.stateBits === null || scene.blockBytes === null || scene.paddedLength === null) {
        throw new Error('compress-block-by-block-stage: init 바탕이 반쯤 비었다');
      }
      const bytes = scene.bytes;
      const bb = scene.blockBytes;
      const L = layoutOf(scene.paddedLength, bb);
      const cut = scene.cut;
      const total = cut === null ? 0 : cut.blocks.length;
      const finished = cut !== null && scene.folded === total;

      // 상태 칸
      const boxLabel = make(
        'text',
        {
          x: L.boxX + L.boxW / 2,
          y: LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.text,
        },
        svg,
      );
      boxLabel.textContent = finished ? t('label.hash', 'Hash value') : t('label.state', 'State');
      const box = make(
        'rect',
        {
          x: L.boxX,
          y: CELL_Y,
          width: L.boxW,
          height: CELL_H,
          rx: 3,
          fill: finished ? colors.accent : colors.bg,
          stroke: colors.text,
          'stroke-width': 2,
        },
        svg,
      );
      const boxText = make(
        'text',
        {
          x: L.boxX + L.boxW / 2,
          y: CELL_Y + CELL_H / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: finished ? colors.stateInk : colors.text,
        },
        svg,
      );
      boxText.textContent = hex4(scene.state);
      const width = make(
        'text',
        {
          x: L.boxX + L.boxW / 2,
          y: PAD_BRACKET_Y + 20,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        svg,
      );
      width.textContent = t('label.width', 'Width (bits): {bits}', { bits: scene.stateBits });

      // f — 덩어리가 건너 들어가는 길
      const ay = CELL_Y + CELL_H / 2;
      const ax1 = L.boxX + L.boxW + 8;
      const ax2 = L.rowX - 10;
      make('line', { x1: ax1 + 8, y1: ay, x2: ax2, y2: ay, stroke: colors.textMuted, 'stroke-width': 1.5 }, svg);
      make(
        'path',
        { d: `M${round(ax1)} ${ay} L${round(ax1 + 9)} ${ay - 5} L${round(ax1 + 9)} ${ay + 5} Z`, fill: colors.textMuted },
        svg,
      );
      const fl = make(
        'text',
        {
          x: (ax1 + ax2) / 2,
          y: ay - 10,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-style': 'italic',
          fill: colors.text,
        },
        svg,
      );
      fl.textContent = t('label.compress', 'f');

      // 바이트 줄
      const rowLabel = make(
        'text',
        {
          x: L.rowX,
          y: LABEL_Y,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
          fill: colors.text,
        },
        svg,
      );
      rowLabel.textContent =
        cut === null
          ? t('label.message', 'Message bytes: {n}', { n: bytes.length })
          : t('label.left', 'Blocks left: {n}', { n: total - scene.folded });

      const row = make('g', { transform: 'translate(0 0)' }, svg);
      const frames = make('g', {}, row);
      const brackets = make('g', {}, row);
      const cellLayer = make('g', {}, row);
      const cells: CellHandle[] = [];

      if (cut === null) {
        bytes.forEach((b, i) => {
          const x = L.rowX + i * L.cell;
          cells.push({ g: drawCell(cellLayer, x, b, false, L.cell), index: i, isPadding: false, x });
        });
      } else {
        const firstByte = scene.folded * bb;
        const xOf = (k: number): number => L.rowX + (Math.floor(k / bb) - scene.folded) * L.slot + (k % bb) * L.cell;
        for (let j = scene.folded; j < total; j += 1) {
          make(
            'rect',
            {
              x: L.rowX + (j - scene.folded) * L.slot - 2,
              y: CELL_Y - 3,
              width: L.boxW + 4,
              height: CELL_H + 6,
              rx: 4,
              fill: 'none',
              stroke: colors.text,
              'stroke-width': 1.5,
            },
            frames,
          );
        }
        cut.padded.forEach((b, k) => {
          if (k < firstByte) return;
          const isPadding = k >= cut.messageLength;
          const x = xOf(k);
          cells.push({ g: drawCell(cellLayer, x, b, isPadding, L.cell), index: k, isPadding, x });
        });
        const padStart = Math.max(cut.messageLength, firstByte);
        const last = cut.padded.length - 1;
        if (padStart <= last) {
          drawBracket(brackets, xOf(padStart) + 2, xOf(last) + L.cell - 2, PAD_BRACKET_Y, t('label.padding', 'Padding'));
          drawBracket(
            brackets,
            xOf(last - 1) + 2,
            xOf(last) + L.cell - 2,
            LEN_BRACKET_Y,
            t('label.length', 'Length (bits): {bits}', { bits: cut.lengthBits }),
          );
        }
      }

      const overlay = make('g', {}, svg);

      // 캡션 — 지금 일어나는 일
      const cap = make(
        'text',
        {
          x: W / 2,
          y: CAPTION_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: colors.text,
        },
        svg,
      );
      const step = scene.step;
      if (step.kind === 'start') {
        cap.textContent = t('caption.start', 'Message {msg}. Bytes: {n}. State starts at IV {iv}.', {
          msg: scene.message,
          n: bytes.length,
          iv: hex4(scene.state),
        });
      } else if (step.kind === 'cut') {
        if (cut === null) throw new Error('compress-block-by-block-stage: cut 걸음에 자른 바탕이 없다');
        cap.textContent = t('caption.cut', 'Cut. Bytes: message {m} + padding {p} = {total}. Blocks: {k}.', {
          m: cut.messageLength,
          p: cut.padded.length - cut.messageLength,
          total: cut.padded.length,
          k: total,
        });
      } else if (finished) {
        cap.textContent = t(
          'caption.done',
          'Last block {c} folded in: f({from}, {c}) = {to}. Blocks left: {r}. Hash value: {to}.',
          { c: hex4(step.block), from: hex4(step.from), to: hex4(step.to), r: total - scene.folded },
        );
      } else {
        cap.textContent = t('caption.fold', 'Block {c} folded in: f({from}, {c}) = {to}. Blocks left: {r}.', {
          c: hex4(step.block),
          from: hex4(step.from),
          to: hex4(step.to),
          r: total - scene.folded,
        });
      }

      return { row, frames, brackets, cells, box, boxText, boxLabel, overlay, layout: L };
    }

    /** 한 시계 — p 를 0 에서 1 로. 세대가 바뀌거나 거두면 곧바로 풀린다 */
    function run(mine: number, ms: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
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

    async function animateCut(mine: number, hd: Handles): Promise<void> {
      const L = hd.layout;
      await run(mine, MOVE_MS, (p) => {
        const e = ease(p);
        for (const c of hd.cells) {
          // 메시지 바이트는 붙어 있던 자리에서 덩어리 자리로 벌어지고, 패딩은 끝에서 밀려 들어온다
          const from = c.isPadding ? c.x + L.slot : L.rowX + c.index * L.cell;
          c.g.setAttribute('transform', `translate(${round(from + (c.x - from) * e)} 0)`);
          if (c.isPadding) c.g.setAttribute('opacity', String(round(e)));
        }
        hd.frames.setAttribute('opacity', String(round(e)));
        hd.brackets.setAttribute('opacity', String(round(e)));
      });
    }

    async function animateFold(
      mine: number,
      hd: Handles,
      step: { index: number; from: number; to: number },
      cut: CutBase,
      bb: number,
      finished: boolean,
    ): Promise<void> {
      const L = hd.layout;
      // 접혀 들어가는 덩어리 — 줄의 맨 앞 자리에서 출발
      const flying = make('g', {}, hd.overlay);
      make(
        'rect',
        {
          x: L.rowX - 2,
          y: CELL_Y - 3,
          width: L.boxW + 4,
          height: CELL_H + 6,
          rx: 4,
          fill: 'none',
          stroke: colors.text,
          'stroke-width': 1.5,
        },
        flying,
      );
      // 바탕에서 이 덩어리의 바이트를 꺼낸다 — 메시지 바이트는 글자와 함께, 패딩은 점선 칸으로
      for (let k = 0; k < bb; k += 1) {
        const at = step.index * bb + k;
        const b = cut.padded[at];
        if (b === undefined) throw new Error(`compress-block-by-block-stage: padded[${at}] 가 바탕에 없다`);
        drawCell(flying, L.rowX + k * L.cell, b, at >= cut.messageLength, L.cell);
      }
      const cy = CELL_Y + CELL_H / 2;
      const dx = L.boxX - L.rowX;
      if (finished) {
        hd.box.setAttribute('fill', colors.bg);
        hd.boxText.setAttribute('fill', colors.text);
        hd.boxLabel.textContent = t('label.state', 'State');
      }
      await run(mine, MOVE_MS, (p) => {
        const slide = ease(Math.min(1, p / SLIDE_SHARE));
        const squash = p <= SLIDE_SHARE ? 1 : 1 - ease((p - SLIDE_SHARE) / (1 - SLIDE_SHARE));
        flying.setAttribute(
          'transform',
          `translate(${round(dx * slide)} ${round(cy)}) scale(1 ${round(squash)}) translate(0 ${round(-cy)})`,
        );
        hd.row.setAttribute('transform', `translate(${round(L.slot * (1 - ease(p)))} 0)`);
        hd.boxText.textContent = hex4(p < SLIDE_SHARE ? step.from : step.to);
      });
    }

    return {
      render(next: CompressScene, prev: CompressScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return Promise.resolve();
        const hd = drawStatic(next);
        if (!opts.animate || prev === null || hd === null) return Promise.resolve();
        const step = next.step;
        let motion: Promise<void>;
        if (step.kind === 'cut') {
          motion = animateCut(mine, hd);
        } else if (step.kind === 'fold') {
          if (next.cut === null) throw new Error('compress-block-by-block-stage: fold 걸음에 자른 바탕이 없다');
          if (next.blockBytes === null) throw new Error('compress-block-by-block-stage: 덩어리 폭이 바탕에 없다');
          motion = animateFold(mine, hd, step, next.cut, next.blockBytes, next.folded === next.cut.blocks.length);
        } else {
          return Promise.resolve();
        }
        return motion.then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
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
