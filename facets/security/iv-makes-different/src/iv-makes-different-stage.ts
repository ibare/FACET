/**
 * iv-makes-different 의 그림.
 *
 * 가운데 줄에 두 쪽이 함께 쓰는 것(열쇠 · 평문 덩어리)을 두고, 위에 쪽 a, 아래에 쪽 b 를
 * 둔다. 첫 칸은 IV 다. 덩어리 하나를 잠그면 가운데 평문 자리에서 두 암호문이 나와 위아래로
 * **갈라져** 제 줄에 선다. 두 암호문이 다른 비트 자리는 두 줄 모두에서 칠해지고, 맨 아래
 * 띠에 그 수가 선다.
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
import type { IvMakesDifferentScene } from './scene.js';

const H = 384;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 16;
/** 한 칸의 비트 16 개를 넷씩 묶을 때 묶음 사이 틈 */
const GROUP_GAP = 4;
const CELL_MAX = 11;
const CELL_H = 14;
/** 갈라지는 운동 길이 */
const SPLIT_MS = 400;

// 세로 자리 — 가운데 줄을 사이에 두고 a 는 위, b 는 아래
const CAP1_Y = 22;
const CAP2_Y = 42;
const CAP3_Y = 60;
const HEAD_Y = 88;
const LABEL_A_Y = 110;
const A_HEX_Y = 132;
const A_BITS_TOP = 142;
const E_A_Y = 180;
const MID_Y = 214;
const MID_SUB_Y = 230;
const E_B_Y = 258;
const B_BITS_TOP = 282;
const B_HEX_Y = 316;
const LABEL_B_Y = 338;
const PILL_Y = 362;

type Side = 'a' | 'b';

function hex(v: number, digits: number): string {
  return v.toString(16).toUpperCase().padStart(digits, '0');
}

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

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  size: string,
  fill: string,
  opts: { mono?: boolean; anchor?: string; weight?: number } = {},
): SVGTextElement {
  const node = el(parent, 'text', {
    x: Math.round(x * 10) / 10,
    y,
    'text-anchor': opts.anchor ?? 'middle',
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'font-size': size,
    'font-weight': opts.weight ?? 400,
    fill,
  });
  node.textContent = text;
  return node;
}

export const ivMakesDifferentStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    /** 한 칸의 가운데 x. 칸 0 은 IV · 열쇠, 칸 c (1..) 는 덩어리 c */
    function geometry(cols: number) {
      const colW = (PIECE_CANVAS_W - 2 * MARGIN) / cols;
      const cell = Math.min(CELL_MAX, (colW - 14 - 3 * GROUP_GAP) / 16);
      const cx = (c: number) => MARGIN + colW * (c + 0.5);
      const bitsW = cell * 16 + 3 * GROUP_GAP;
      return { colW, cell, cx, bitsW };
    }

    /** 16 비트 한 줄. `mask` 의 1 인 자리를 칠한다. `value` 가 없으면 빈 자리 */
    function drawBits(
      parent: Element,
      cx: number,
      top: number,
      cell: number,
      bitsW: number,
      width: number,
      value: number | null,
      mask: number | null,
    ): void {
      const left = cx - bitsW / 2;
      if (value === null) {
        el(parent, 'rect', {
          x: Math.round(left * 10) / 10,
          y: top,
          width: Math.round(bitsW * 10) / 10,
          height: CELL_H,
          rx: 2,
          fill: 'none',
          stroke: colors.border,
          'stroke-dasharray': '3 3',
        });
        return;
      }
      for (let k = 0; k < width; k += 1) {
        const shift = width - 1 - k;
        const bit = (value >>> shift) & 1;
        const differs = mask !== null && ((mask >>> shift) & 1) === 1;
        const x = left + k * cell + Math.floor(k / 4) * GROUP_GAP;
        el(parent, 'rect', {
          x: Math.round(x * 10) / 10,
          y: top,
          width: Math.round((cell - 1) * 10) / 10,
          height: CELL_H,
          rx: 1.5,
          fill: differs ? colors.accent : colors.bgSubtle,
          stroke: differs ? colors.accent : colors.border,
          'stroke-width': 0.8,
        });
        label(parent, x + (cell - 1) / 2, top + CELL_H - 3.5, String(bit), fontSizes.xs, differs ? colors.stateInk : colors.text, {
          mono: true,
          weight: differs ? 700 : 400,
        });
      }
    }

    /** 한 쪽의 한 칸 — 16 진 값과 비트 줄. 운동이 옮길 수 있게 묶음으로 돌려준다 */
    function drawSideCell(
      parent: Element,
      side: Side,
      cx: number,
      g: ReturnType<typeof geometry>,
      width: number,
      value: number | null,
      mask: number | null,
    ): SVGGElement {
      const group = el(parent, 'g', { 'data-side': side });
      const hexY = side === 'a' ? A_HEX_Y : B_HEX_Y;
      const bitsTop = side === 'a' ? A_BITS_TOP : B_BITS_TOP;
      if (value !== null) {
        label(group, cx, hexY, hex(value, width / 4), fontSizes.lg, colors.text, { mono: true, weight: 600 });
      }
      drawBits(group, cx, bitsTop, g.cell, g.bitsW, width, value, mask);
      return group;
    }

    function eBox(parent: Element, cx: number, cy: number): void {
      el(parent, 'rect', {
        x: cx - 11,
        y: cy - 8,
        width: 22,
        height: 16,
        rx: 3,
        fill: colors.bg,
        stroke: colors.text,
        'stroke-width': 1,
      });
      label(parent, cx, cy + 4, t('label.box', 'E'), fontSizes.sm, colors.text, { mono: true, weight: 700 });
    }

    function pill(parent: Element, cx: number, text: string, strong: boolean): SVGGElement {
      const group = el(parent, 'g', {});
      const w = Math.max(56, text.length * 6.4 + 14);
      el(group, 'rect', {
        x: Math.round((cx - w / 2) * 10) / 10,
        y: PILL_Y - 10,
        width: Math.round(w * 10) / 10,
        height: 20,
        rx: 10,
        fill: strong ? colors.accent : colors.bgSubtle,
        stroke: strong ? colors.accent : colors.border,
      });
      label(group, cx, PILL_Y + 4, text, fontSizes.xs, strong ? colors.stateInk : colors.text, { weight: 600 });
      return group;
    }

    type Moving = { a: SVGGElement; b: SVGGElement; pill: SVGGElement } | null;

    /** 장면 전체를 세운다. 이번 걸음에 잠근 칸의 손잡이를 돌려준다 */
    function drawStatic(scene: IvMakesDifferentScene): Moving {
      svg.textContent = '';
      const base = scene.base;
      if (base === null || scene.step === null) return null;
      const step = scene.step;
      const cols = base.blocks.length + 1;
      const g = geometry(cols);
      const current = step.kind === 'start' ? 0 : step.index;
      const width = base.width;
      let moving: Moving = null;

      // 캡션 — 지금 일어나는 일만
      if (step.kind === 'start') {
        label(svg, PIECE_CANVAS_W / 2, CAP1_Y, t('caption.start', 'Same message, same key on both sides. Only the IV differs.'), fontSizes.md, colors.text, { weight: 600 });
        label(svg, PIECE_CANVAS_W / 2, CAP2_Y, t('caption.ivDiff', 'Differing bits between the two IVs: {bits} / {total}', { bits: base.ivDiff, total: width }), fontSizes.sm, colors.textMuted);
      } else {
        label(svg, PIECE_CANVAS_W / 2, CAP1_Y, t('caption.block', 'Block {i}: each side XORs in its previous value and locks with the same key.', { i: step.index }), fontSizes.md, colors.text, { weight: 600 });
        const pair = scene.done[step.index - 1];
        if (!pair) throw new Error(`iv-makes-different stage: 덩어리 ${step.index} 의 자취가 없다`);
        label(svg, PIECE_CANVAS_W / 2, CAP2_Y, t('caption.blockDiff', 'Differing bits between the two ciphertexts: {bits} / {total}', { bits: pair.diff, total: width }), fontSizes.sm, colors.textMuted);
        if (step.index === base.blocks.length) {
          label(svg, PIECE_CANVAS_W / 2, CAP3_Y, t('caption.total', 'Blocks that differ: {blocks} / {n} · differing bits in all: {sum} / {all}', {
            blocks: step.diffBlocks,
            n: base.blocks.length,
            sum: step.sumBits,
            all: width * base.blocks.length,
          }), fontSizes.sm, colors.text, { weight: 600 });
        }
      }

      // 쪽 이름 — 칸 0 위아래에 한 번씩
      label(svg, g.cx(0), LABEL_A_Y, t('label.side.a', 'Sent first'), fontSizes.xs, colors.textMuted);
      label(svg, g.cx(0), LABEL_B_Y, t('label.side.b', 'Sent second'), fontSizes.xs, colors.textMuted);

      for (let c = 0; c < cols; c += 1) {
        const cx = g.cx(c);
        const isCurrent = c === current;
        const headFill = isCurrent ? colors.text : colors.textMuted;
        const headWeight = isCurrent ? 700 : 400;
        if (c === 0) {
          label(svg, cx, HEAD_Y, t('label.iv', 'IV'), fontSizes.sm, headFill, { weight: headWeight });
          // 가운데: 두 쪽이 함께 쓰는 열쇠
          label(svg, cx, MID_Y - 16, t('label.key', 'Key (both sides)'), fontSizes.xs, colors.textMuted);
          label(svg, cx, MID_Y + 2, hex(base.key, 8), fontSizes.md, colors.text, { mono: true, weight: 600 });
          drawSideCell(svg, 'a', cx, g, width, base.ivA, base.ivMask);
          drawSideCell(svg, 'b', cx, g, width, base.ivB, base.ivMask);
          pill(svg, cx, t('label.diff', 'Differ: {bits} / {total}', { bits: base.ivDiff, total: width }), isCurrent);
          continue;
        }

        label(svg, cx, HEAD_Y, t('label.block', 'Block {i}', { i: c }), fontSizes.sm, headFill, { weight: headWeight });
        const p = base.blocks[c - 1];
        const chars = base.chars[c - 1];
        if (p === undefined || chars === undefined) throw new Error(`iv-makes-different stage: 덩어리 ${c} 가 바탕에 없다`);
        const pair = scene.done[c - 1] ?? null;

        // 갈라지는 길 — 평문에서 위(a) · 아래(b) 로. 잠근 칸에만
        if (pair !== null) {
          el(svg, 'line', { x1: cx, y1: MID_Y - 16, x2: cx, y2: A_BITS_TOP + CELL_H + 2, stroke: colors.textMuted, 'stroke-width': 1.2 });
          el(svg, 'line', { x1: cx, y1: MID_SUB_Y + 6, x2: cx, y2: B_BITS_TOP - 2, stroke: colors.textMuted, 'stroke-width': 1.2 });
          eBox(svg, cx, E_A_Y);
          eBox(svg, cx, E_B_Y);
        }

        // 가운데: 두 쪽이 같이 받는 평문 덩어리
        label(svg, cx, MID_Y, hex(p, width / 4), fontSizes.lg, colors.text, { mono: true, weight: 600 });
        label(svg, cx, MID_SUB_Y, chars, fontSizes.xs, colors.textMuted, { mono: true });

        const ga = drawSideCell(svg, 'a', cx, g, width, pair ? pair.a : null, pair ? pair.mask : null);
        const gb = drawSideCell(svg, 'b', cx, g, width, pair ? pair.b : null, pair ? pair.mask : null);
        if (pair !== null) {
          const gp = pill(svg, cx, t('label.diff', 'Differ: {bits} / {total}', { bits: pair.diff, total: width }), isCurrent);
          if (isCurrent) moving = { a: ga, b: gb, pill: gp };
        }
      }
      return moving;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = () => {
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

    /** 가운데 평문 자리에서 두 암호문이 위아래로 갈라져 제 줄에 선다 */
    async function split(handles: NonNullable<Moving>, mine: number): Promise<void> {
      // 정적 그리기가 이미 끝 자리에 세웠다 — 아직 못 온 만큼 되돌려 둔다
      const fromA = MID_Y - 6 - (A_BITS_TOP + CELL_H / 2);
      const fromB = MID_Y - 6 - (B_BITS_TOP + CELL_H / 2);
      const apply = (e: number) => {
        const k = 1 - e;
        handles.a.setAttribute('transform', `translate(0 ${Math.round(fromA * k * 10) / 10})`);
        handles.b.setAttribute('transform', `translate(0 ${Math.round(fromB * k * 10) / 10})`);
        handles.a.setAttribute('opacity', String(Math.round((0.25 + 0.75 * e) * 100) / 100));
        handles.b.setAttribute('opacity', String(Math.round((0.25 + 0.75 * e) * 100) / 100));
        handles.pill.setAttribute('opacity', String(Math.round(e * 100) / 100));
      };
      apply(0);
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return;
        const f = Math.min(1, (Date.now() - start) / SPLIT_MS);
        const e = 1 - (1 - f) ** 3;
        apply(e);
        if (f >= 1) return;
        await wait(16);
      }
    }

    return {
      async render(next: IvMakesDifferentScene, prev: IvMakesDifferentScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moving = drawStatic(next);
        if (!opts.animate || moving === null) return;
        // 새 덩어리를 잠근 걸음에서만 흐른다
        if (prev !== null && prev.done.length === next.done.length) return;
        await split(moving, mine);
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
