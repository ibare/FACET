/**
 * fixed-size-block 무대.
 *
 * 위 줄이 평문 바이트, 가운데가 암호 상자 하나, 아래 줄이 암호문 바이트다.
 * 자를 때 바이트 칸이 덩어리 자리로 벌어져 가고, 채울 때 채움 바이트가 오른쪽
 * 밖에서 미끄러져 들어와 끝 덩어리의 빈 자리에 붙는다. 잠글 때 덩어리 하나가 상자로
 * 내려가고 같은 폭의 암호문 덩어리가 상자에서 나와 아래 줄 제자리로 간다.
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
} from '@ffacet/core/runtime';
import { hex16, hex8, narrowFixedSizeBlock } from './algorithm.js';
import type { FixedSizeBlockScene } from './scene.js';

const H = 368;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LEFT = 76;
const RIGHT = 16;
const GAP = 28;
const CELL_MAX = 80;
const CELL_H = 44;
const TOP_Y = 34;
const BOX_Y = 134;
const BOX_H = 58;
const BOX_W = 176;
const BOT_Y = 232;
const CAPTION_Y = 334;
const SUMMARY_Y = 356;
const MOTION_MS = 400;

type Layout = {
  cellW: number;
  blockBytes: number;
  stripX(j: number): number;
  slotX(b: number): number;
  boxCx: number;
};

function layoutOf(scene: FixedSizeBlockScene): Layout {
  const avail = PIECE_CANVAS_W - LEFT - RIGHT;
  if (scene.base === null) {
    const cellW = Math.min(CELL_MAX, avail / scene.bytes.length);
    const span = cellW * scene.bytes.length;
    return {
      cellW,
      blockBytes: 0,
      stripX: (j) => LEFT + j * cellW,
      slotX: () => {
        throw new Error('fixed-size-block-stage: 바탕 없이 덩어리 자리를 물었다');
      },
      boxCx: LEFT + span / 2,
    };
  }
  const { blockBits, blockCount } = scene.base;
  if (blockBits % 8 !== 0) throw new Error(`fixed-size-block-stage: 덩어리 비트 ${blockBits} 가 바이트 단위가 아니다`);
  const blockBytes = blockBits / 8;
  const cellW = Math.min(CELL_MAX, (avail - (blockCount - 1) * GAP) / (blockCount * blockBytes));
  const slotW = blockBytes * cellW;
  const span = blockCount * slotW + (blockCount - 1) * GAP;
  return {
    cellW,
    blockBytes,
    stripX: (j) => LEFT + j * cellW,
    slotX: (b) => LEFT + b * (slotW + GAP),
    boxCx: LEFT + span / 2,
  };
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function printable(b: number): string {
  if (b < 0x20 || b > 0x7e) throw new Error(`fixed-size-block-stage: 평문 바이트 ${b} 가 글자가 아니다`);
  return String.fromCharCode(b);
}

export const fixedSizeBlockStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    // 좁히기만 한다 — 자료가 없으면(전수 검사의 빈 마운트) 장면에서 읽는다
    if (params.initialData !== undefined) narrowFixedSizeBlock(params.initialData);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      text: string,
      opts: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': opts.anchor ?? 'middle',
          'font-family': opts.mono === true ? fonts.mono : fonts.body,
          'font-size': opts.size,
          'font-weight': opts.weight ?? '400',
          fill: opts.fill,
        },
        parent,
      );
      node.textContent = text;
      return node;
    }

    type Tone = 'plain' | 'pad' | 'cipher';

    /** 바이트 칸 하나. 0,0 기준으로 그려 두고 g 의 transform 으로 옮긴다. */
    function byteCell(parent: Element, x: number, y: number, w: number, value: number, tone: Tone): SVGGElement {
      const g = el('g', { transform: `translate(${round(x)},${round(y)})` }, parent);
      const fill = tone === 'plain' ? colors.bgSubtle : tone === 'pad' ? colors.accent : colors.primary;
      const ink = tone === 'plain' ? colors.text : tone === 'pad' ? colors.stateInk : colors.textInverse;
      el('rect', { x: 1, y: 0, width: w - 2, height: CELL_H, rx: 4, fill, stroke: tone === 'plain' ? colors.border : fill, 'stroke-width': 1 }, g);
      const hexY = tone === 'plain' ? 20 : 28;
      label(g, w / 2, hexY, hex8(value), { size: fontSizes.lg, fill: ink, mono: true, weight: '600' });
      if (tone === 'plain') label(g, w / 2, 37, printable(value), { size: fontSizes.xs, fill: colors.textMuted, mono: true });
      return g;
    }

    function bracket(parent: Element, x0: number, x1: number, y: number, bits: number, color: string): void {
      const d = `M${round(x0 + 3)},${round(y)} L${round(x0 + 3)},${round(y + 6)} L${round(x1 - 3)},${round(y + 6)} L${round(x1 - 3)},${round(y)}`;
      el('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.2 }, parent);
      label(parent, (x0 + x1) / 2, y + 21, t('label.bits', '{n}-bit', { n: bits }), {
        size: fontSizes.sm,
        fill: color,
      });
    }

    type Handles = {
      /** 자르기 운동: 평문 칸과 그 칸이 떠나온 자리 */
      plainCells: { g: SVGGElement; from: number; to: number }[];
      padCells: { g: SVGGElement; to: number }[];
      cipher: { g: SVGGElement; slotX: number } | null;
      overlay: SVGGElement;
    };

    function paddedBlock(scene: FixedSizeBlockScene, b: number): { value: number; tone: Tone }[] {
      if (scene.blocks === null) throw new Error('fixed-size-block-stage: 덩어리가 아직 없다');
      const own = b < scene.blocks.length ? scene.blocks[b]!.map((value) => ({ value, tone: 'plain' as Tone })) : [];
      if (scene.pad !== null && scene.pad.block === b) {
        return [...own, ...scene.pad.bytes.map((value) => ({ value, tone: 'pad' as Tone }))];
      }
      return own;
    }

    function drawStatic(scene: FixedSizeBlockScene): Handles {
      svg.textContent = '';
      const L = layoutOf(scene);
      const root = el('g', {}, svg);
      const handles: Handles = { plainCells: [], padCells: [], cipher: null, overlay: root };

      // 줄 이름
      label(root, 16, TOP_Y + 27, t('label.plain', 'Plaintext'), { size: fontSizes.sm, fill: colors.textMuted, anchor: 'start' });
      label(root, 16, BOT_Y + 27, t('label.cipher', 'Ciphertext'), { size: fontSizes.sm, fill: colors.textMuted, anchor: 'start' });

      const step = scene.step;
      const sealing = step.kind === 'seal' ? step.block : -1;

      // 암호 상자 — 하나뿐이다
      const boxX = L.boxCx - BOX_W / 2;
      el(
        'rect',
        {
          x: boxX,
          y: BOX_Y,
          width: BOX_W,
          height: BOX_H,
          rx: 8,
          fill: colors.bg,
          stroke: sealing >= 0 ? colors.itemActive : colors.border,
          'stroke-width': sealing >= 0 ? 2.5 : 1.5,
        },
        root,
      );
      label(root, L.boxCx, BOX_Y + 24, t('label.box', 'Block cipher E'), { size: fontSizes.md, fill: colors.text, weight: '600' });
      label(root, L.boxCx, BOX_Y + 44, t('label.key', 'Key {key}', { key: scene.keyHex }), {
        size: fontSizes.sm,
        fill: colors.textMuted,
        mono: true,
      });

      if (scene.blocks === null) {
        // 자르기 전 — 한 줄로 이어진 메시지
        scene.bytes.forEach((b, j) => byteCell(root, L.stripX(j), TOP_Y, L.cellW, b, 'plain'));
        if (scene.base !== null) {
          bracket(root, L.stripX(0), L.stripX(scene.bytes.length), TOP_Y + CELL_H + 6, scene.base.messageBits, colors.textMuted);
        }
      } else {
        const base = scene.base;
        if (base === null) throw new Error('fixed-size-block-stage: 덩어리는 있는데 바탕이 없다');
        const slotW = L.blockBytes * L.cellW;
        let j = 0;
        for (let b = 0; b < base.blockCount; b += 1) {
          const x = L.slotX(b);
          const cells = paddedBlock(scene, b);
          if (cells.length === 0 && scene.pad === null) continue;
          // 덩어리 틀 — 정해진 크기
          el(
            'rect',
            {
              x: x - 3,
              y: TOP_Y - 4,
              width: slotW + 6,
              height: CELL_H + 8,
              rx: 6,
              fill: 'none',
              stroke: b === sealing ? colors.itemActive : colors.textMuted,
              'stroke-width': b === sealing ? 2.5 : 1,
              'stroke-dasharray': b === sealing ? 'none' : '4 3',
            },
            root,
          );
          cells.forEach((c, k) => {
            const cx = x + k * L.cellW;
            const g = byteCell(root, cx, TOP_Y, L.cellW, c.value, c.tone);
            if (c.tone === 'plain') {
              handles.plainCells.push({ g, from: L.stripX(j), to: cx });
              j += 1;
            } else {
              handles.padCells.push({ g, to: cx });
            }
          });
          const barColor = b === sealing ? colors.itemActive : colors.textMuted;
          bracket(root, x, x + cells.length * L.cellW, TOP_Y + CELL_H + 6, cells.length * 8, barColor);
        }

        // 잠긴 덩어리 — 아래 줄 제자리
        for (const s of scene.sealed) {
          const x = L.slotX(s.block);
          const g = el('g', {}, root);
          byteCell(g, x, BOT_Y, L.cellW, s.output >> 8, 'cipher');
          byteCell(g, x + L.cellW, BOT_Y, L.cellW, s.output & 0xff, 'cipher');
          const barColor = s.block === sealing ? colors.itemActive : colors.textMuted;
          bracket(root, x, x + slotW, BOT_Y + CELL_H + 6, s.bits, barColor);
          if (s.block === sealing) {
            handles.cipher = { g, slotX: x };
            // 지나온 길: 덩어리 → 상자 → 제자리
            const mid = x + slotW / 2;
            const route = `M${round(mid)},${TOP_Y + CELL_H + 34} L${round(L.boxCx)},${BOX_Y} M${round(L.boxCx)},${BOX_Y + BOX_H} L${round(mid)},${BOT_Y - 4}`;
            el('path', { d: route, fill: 'none', stroke: colors.itemActive, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }, root);
          }
        }
      }

      drawCaption(root, scene);
      handles.overlay = el('g', {}, root);
      return handles;
    }

    function drawCaption(root: Element, scene: FixedSizeBlockScene): void {
      const base = scene.base;
      if (base === null) return;
      const step = scene.step;
      const cx = PIECE_CANVAS_W / 2;
      const style = { size: fontSizes.md, fill: colors.text };
      if (step.kind === 'start') {
        label(
          root,
          cx,
          CAPTION_Y,
          t('caption.start', 'Message: {bytes} bytes = {bits} bits · the cipher takes {block} bits at a time', {
            bytes: scene.bytes.length,
            bits: base.messageBits,
            block: base.blockBits,
          }),
          style,
        );
      } else if (step.kind === 'cut') {
        if (scene.blocks === null) throw new Error('fixed-size-block-stage: cut 걸음에 덩어리가 없다');
        label(
          root,
          cx,
          CAPTION_Y,
          t('caption.cut', 'Cut from the front, {block} bits each · blocks: {count} · last block: {last} bits', {
            block: base.blockBits,
            count: scene.blocks.length,
            last: step.lastBits,
          }),
          style,
        );
      } else if (step.kind === 'pad') {
        const pad = scene.pad;
        if (pad === null) throw new Error('fixed-size-block-stage: pad 걸음에 채움이 없다');
        const first = pad.bytes[0];
        if (first === undefined) throw new Error('fixed-size-block-stage: 채움 바이트가 비었다');
        label(
          root,
          cx,
          CAPTION_Y,
          t('caption.pad', 'Missing bytes: {n} · padding byte {v} × {n} → last block: {bits} bits', {
            n: pad.bytes.length,
            v: hex8(first),
            bits: base.blockBits,
          }),
          style,
        );
      } else {
        const s = scene.sealed[step.block];
        if (s === undefined) throw new Error(`fixed-size-block-stage: 덩어리 ${step.block} 의 잠금이 없다`);
        label(
          root,
          cx,
          CAPTION_Y,
          t('caption.seal', 'Block {i}: {input} → {output} · in: {inBits} bits · out: {outBits} bits', {
            i: step.block + 1,
            input: hex16(s.input),
            output: hex16(s.output),
            inBits: base.blockBits,
            outBits: s.bits,
          }),
          style,
        );
        if (scene.sealed.length === base.blockCount) {
          const pad = scene.pad;
          if (pad === null) throw new Error('fixed-size-block-stage: 잠갔는데 채움이 없다');
          label(
            root,
            cx,
            SUMMARY_Y,
            t('caption.total', 'Plaintext {p} bits → padded {q} bits → ciphertext {c} bits', {
              p: base.messageBits,
              q: pad.paddedBits,
              c: scene.cipherBits,
            }),
            { size: fontSizes.md, fill: colors.text, weight: '600' },
          );
        }
      }
    }

    /** 한 시계로 흘린다. 끝나거나 거둬지면 풀린다. */
    function tween(mine: number, ms: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const start = performance.now();
        const frame = (now: number): void => {
          frames.delete(id);
          if (done) return;
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (now - start) / ms);
          draw(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(frame);
          frames.add(id);
        };
        let id = requestAnimationFrame(frame);
        frames.add(id);
      });
    }

    function place(g: SVGGElement, x: number, y: number): void {
      g.setAttribute('transform', `translate(${round(x)},${round(y)})`);
    }

    async function animate(next: FixedSizeBlockScene, h: Handles, mine: number): Promise<void> {
      const step = next.step;
      if (step.kind === 'cut') {
        if (h.plainCells.length === 0) throw new Error('fixed-size-block-stage: 자를 칸이 없다');
        for (const c of h.plainCells) place(c.g, c.from, TOP_Y);
        await tween(mine, MOTION_MS, (p) => {
          for (const c of h.plainCells) place(c.g, c.from + (c.to - c.from) * p, TOP_Y);
        });
      } else if (step.kind === 'pad') {
        if (h.padCells.length === 0) throw new Error('fixed-size-block-stage: 채움 칸이 없다');
        const outside = PIECE_CANVAS_W + 8;
        for (const c of h.padCells) place(c.g, outside, TOP_Y);
        await tween(mine, MOTION_MS, (p) => {
          for (const c of h.padCells) place(c.g, outside + (c.to - outside) * p, TOP_Y);
        });
      } else if (step.kind === 'seal') {
        const cipher = h.cipher;
        if (cipher === null) throw new Error(`fixed-size-block-stage: 덩어리 ${step.block} 의 암호문 손잡이가 없다`);
        const L = layoutOf(next);
        const slotW = L.blockBytes * L.cellW;
        // 평문 덩어리의 사본이 상자로 들어간다 — 원본은 위 줄에 남는다
        const ghost = el('g', {}, h.overlay);
        paddedBlock(next, step.block).forEach((c, k) => byteCell(ghost, k * L.cellW, 0, L.cellW, c.value, c.tone));
        const inX = L.boxCx - slotW / 2;
        const inY = BOX_Y + BOX_H / 2 - CELL_H / 2;
        const outDy = BOX_Y + BOX_H / 2 - CELL_H / 2 - BOT_Y;
        const outDx = L.boxCx - slotW / 2 - cipher.slotX;
        place(ghost, cipher.slotX, TOP_Y);
        place(cipher.g, outDx, outDy);
        cipher.g.setAttribute('opacity', '0');
        await tween(mine, MOTION_MS, (p) => {
          if (p < 0.5) {
            const q = p / 0.5;
            place(ghost, cipher.slotX + (inX - cipher.slotX) * q, TOP_Y + (inY - TOP_Y) * q);
            ghost.setAttribute('opacity', String(round(1 - q * 0.6)));
          } else {
            const q = (p - 0.5) / 0.5;
            ghost.setAttribute('opacity', '0');
            cipher.g.removeAttribute('opacity');
            place(cipher.g, outDx * (1 - q), outDy * (1 - q));
          }
        });
      }
    }

    return {
      render(next: FixedSizeBlockScene, prev: FixedSizeBlockScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const h = drawStatic(next);
        if (!opts.animate || prev === null || next.step.kind === 'start') return;
        return animate(next, h, mine).then(() => {
          if (mine === gen && !destroyed) drawStatic(next);
        });
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
