/**
 * same-weights-each-step 의 무대.
 *
 * 동사는 "되쓰인다" — 위에 무게 한 벌(칸 여덟)이 하나만 있고, 걸음마다 그 한 벌이 통째로
 * 그 걸음의 셀까지 내려가 셈을 하고 제자리로 돌아온다. 무게 칸마다 쓰인 눈금이 하나씩
 * 늘지만 칸 수는 그대로다. 셀에서 무게 자리로 이어진 끈이 걸음마다 하나씩 늘어 한 벌로 모인다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SameWeightsScene } from './scene.js';

const H = 316;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 14;
const CHIP_W_MAX = 44;
const CHIP_H = 32;
const IN_GAP = 6;
const GROUP_GAP = 16;
const BANK_TOP = 36;
const H0_W = 50;
const SLOT_GAP = 12;
const CELL_W_MAX = 120;
const CELL_GAP_BELOW_BANK = 60;
const MOTION_MS = 800;
const FRAME_MS = 16;
const LAND_AT = 0.42;
const LEAVE_AT = 0.58;

type Attrs = Record<string, string | number>;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function fmt2(v: number): string {
  const s = v.toFixed(2);
  return s === '-0.00' ? '0.00' : s;
}

function ease(u: number): number {
  return u * u * (3 - 2 * u);
}

type Geometry = {
  n: number;
  chipW: number;
  bankW: number;
  bankX: number;
  chipsH: number;
  frameTop: number;
  frameBottom: number;
  colX: number[];
  cellsTop: number;
  cellH: number;
  cellW: number;
  slotX: number[];
};

function geometry(scene: SameWeightsScene): Geometry {
  const n = scene.h0.length;
  const cols = n + 2;
  const avail = PIECE_CANVAS_W * 0.4;
  const chipW = Math.min(CHIP_W_MAX, (avail - (n - 1) * IN_GAP - 2 * GROUP_GAP) / Math.max(1, cols));
  const bankW = cols * chipW + Math.max(0, n - 1) * IN_GAP + 2 * GROUP_GAP;
  const bankX = (PIECE_CANVAS_W - bankW) / 2;
  const colX: number[] = [bankX];
  let x = bankX + chipW + GROUP_GAP;
  for (let j = 0; j < n; j += 1) {
    colX.push(x);
    x += chipW + (j < n - 1 ? IN_GAP : GROUP_GAP);
  }
  colX.push(x);
  const chipsH = n * CHIP_H + Math.max(0, n - 1) * IN_GAP;
  const frameTop = BANK_TOP - 22;
  const frameBottom = BANK_TOP + chipsH + 10;
  const cellsTop = frameBottom + CELL_GAP_BELOW_BANK;
  const cellH = 40 + n * 20;
  const count = scene.inputs.length;
  const cellW = Math.min(
    CELL_W_MAX,
    (PIECE_CANVAS_W - 2 * MARGIN - H0_W - count * SLOT_GAP) / Math.max(1, count),
  );
  const rowW = H0_W + count * (SLOT_GAP + cellW);
  const left = (PIECE_CANVAS_W - rowW) / 2;
  const slotX: number[] = [];
  for (let k = 1; k <= count; k += 1) slotX.push(left + H0_W + SLOT_GAP * k + cellW * (k - 1));
  return { n, chipW, bankW, bankX, chipsH, frameTop, frameBottom, colX, cellsTop, cellH, cellW, slotX: [left, ...slotX] };
}

type Handles = {
  chips: SVGGElement | null;
  reveal: SVGElement[];
};

export const sameWeightsEachStepStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Attrs,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, v] of Object.entries(attrs)) {
        node.setAttribute(key, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; weight?: string; mono?: boolean },
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': opts.mono === true ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        fill: opts.fill ?? c.text,
        'text-anchor': opts.anchor ?? 'middle',
        'font-weight': opts.weight ?? 'normal',
      }, parent);
      node.textContent = content;
      return node;
    }

    /** 기호 + 아래 첨자 (h 와 걸음 번호) */
    function subscripted(parent: Element, x: number, y: number, sym: string, sub: number, fill: string): void {
      const node = el('text', {
        x, y, 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill, 'text-anchor': 'middle',
      }, parent);
      const base = document.createElementNS(SVG_NS, 'tspan');
      base.textContent = sym;
      node.appendChild(base);
      const low = document.createElementNS(SVG_NS, 'tspan');
      low.setAttribute('font-size', fontSizes.xs);
      low.setAttribute('dy', '3');
      low.textContent = String(sub);
      node.appendChild(low);
    }

    function drawStatic(scene: SameWeightsScene): Handles {
      svg.textContent = '';
      const handles: Handles = { chips: null, reveal: [] };
      const sym = scene.symbols;
      const g = geometry(scene);
      const current = scene.step?.k ?? 0;
      const bankCx = PIECE_CANVAS_W / 2;

      // 끈 — 셈을 마친 셀마다 무게 한 벌의 자리로 이어진다
      const tethers = el('g', {}, svg);
      for (const mark of scene.trail) {
        const sx = g.slotX[mark.k];
        if (sx === undefined) throw new Error(`same-weights-each-step stage: 걸음 ${mark.k} 의 자리가 없다`);
        const isNow = mark.k === current;
        const line = el('line', {
          x1: bankCx,
          y1: g.frameBottom,
          x2: sx + g.cellW / 2,
          y2: g.cellsTop,
          stroke: isNow ? c.primary : c.textMuted,
          'stroke-width': isNow ? 2 : 1,
        }, tethers);
        if (isNow) handles.reveal.push(line);
      }

      // 무게 한 벌의 자리
      el('rect', {
        x: g.bankX - 12,
        y: g.frameTop,
        width: g.bankW + 24,
        height: g.frameBottom - g.frameTop,
        rx: 8,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1.5,
      }, svg);
      label(svg, g.bankX - 22, BANK_TOP + g.chipsH / 2 + 4, t('label.bank', 'One set of weights'), {
        anchor: 'end', fill: c.textMuted,
      });
      const headerY = BANK_TOP - 8;
      const whLeft = g.colX[1] ?? g.bankX;
      const whRight = (g.colX[g.n] ?? g.bankX) + g.chipW;
      label(svg, g.bankX + g.chipW / 2, headerY, sym.wx, { mono: true, fill: c.textMuted });
      label(svg, (whLeft + whRight) / 2, headerY, sym.wh, { mono: true, fill: c.textMuted });
      label(svg, (g.colX[g.n + 1] ?? g.bankX) + g.chipW / 2, headerY, sym.b, { mono: true, fill: c.textMuted });

      // 무게 칸 여덟 — 이 묶음이 통째로 걸음마다 불려 간다
      const chips = el('g', {}, svg);
      handles.chips = chips;
      const justUsed = scene.step !== null;
      const tickGap = Math.min(5, (g.chipW - 12) / Math.max(1, scene.inputs.length - 1));
      for (let i = 0; i < g.n; i += 1) {
        const rowVals = [scene.wx[i], ...(scene.wh[i] ?? []), scene.b[i]];
        const y = BANK_TOP + i * (CHIP_H + IN_GAP);
        rowVals.forEach((v, j) => {
          const x = g.colX[j];
          if (v === undefined || x === undefined) throw new Error(`same-weights-each-step stage: 무게 칸 (${i}, ${j}) 가 없다`);
          el('rect', {
            x, y, width: g.chipW, height: CHIP_H, rx: 4,
            fill: justUsed ? c.accent : c.bgSubtle,
            stroke: c.primary,
            'stroke-width': 1.2,
          }, chips);
          label(chips, x + g.chipW / 2, y + 15, String(v), {
            mono: true, weight: 'bold', fill: justUsed ? c.stateInk : c.text,
          });
          // 쓰인 눈금 — 걸음 하나에 하나
          const ticksW = (scene.uses - 1) * tickGap;
          for (let u = 1; u <= scene.uses; u += 1) {
            const tx = x + g.chipW / 2 - ticksW / 2 + (u - 1) * tickGap;
            const tick = el('line', {
              x1: tx, y1: y + CHIP_H - 10, x2: tx, y2: y + CHIP_H - 4,
              stroke: justUsed ? c.stateInk : c.primary,
              'stroke-width': 1.5,
            }, chips);
            if (u === current) handles.reveal.push(tick);
          }
        });
      }

      // 셈 세 수
      const infoX = g.bankX + g.bankW + 24;
      label(svg, infoX, g.frameTop + 16, t('label.count', 'Weights: {n}', { n: scene.count }), {
        anchor: 'start', weight: 'bold',
      });
      label(svg, infoX, g.frameTop + 36, t('label.uses', 'Uses: {n}', { n: scene.uses }), {
        anchor: 'start',
      });
      label(svg, infoX, g.frameTop + 56, t('label.separate', 'If each step had its own: {n}', { n: scene.separate }), {
        anchor: 'start', fill: c.textMuted,
      });

      // h0 과 셀 다섯
      const midY = g.cellsTop + g.cellH / 2;
      const h0x = g.slotX[0] ?? MARGIN;
      el('rect', {
        x: h0x, y: g.cellsTop, width: H0_W, height: g.cellH, rx: 6,
        fill: 'none', stroke: c.border, 'stroke-width': 1.2,
      }, svg);
      scene.h0.forEach((v, i) => {
        label(svg, h0x + H0_W / 2, g.cellsTop + 52 + i * 20, fmt2(v), { mono: true });
      });
      subscripted(svg, h0x + H0_W / 2, g.cellsTop + g.cellH + 18, sym.h, 0, c.textMuted);

      const done = new Map(scene.trail.map((m) => [m.k, m]));
      scene.inputs.forEach((x, idx) => {
        const k = idx + 1;
        const sx = g.slotX[k];
        if (sx === undefined) throw new Error(`same-weights-each-step stage: 걸음 ${k} 의 자리가 없다`);
        const mark = done.get(k);
        const isNow = k === current;
        const prevRight = k === 1 ? h0x + H0_W : sx - SLOT_GAP;
        el('line', {
          x1: prevRight + 2, y1: midY, x2: sx - 3, y2: midY,
          stroke: mark === undefined ? c.border : c.textMuted,
          'stroke-width': 1.5,
        }, svg);
        el('path', {
          d: `M ${round(sx - 7)} ${round(midY - 3.5)} L ${round(sx - 2)} ${round(midY)} L ${round(sx - 7)} ${round(midY + 3.5)}`,
          fill: 'none',
          stroke: mark === undefined ? c.border : c.textMuted,
          'stroke-width': 1.5,
        }, svg);
        const box = el('rect', {
          x: sx, y: g.cellsTop, width: g.cellW, height: g.cellH, rx: 6,
          fill: c.bg,
          stroke: isNow ? c.primary : c.border,
          'stroke-width': isNow ? 2 : 1.2,
        }, svg);
        if (mark === undefined) box.setAttribute('stroke-dasharray', '4 3');
        const cx = sx + g.cellW / 2;
        const xLine = el('text', {
          x: cx, y: g.cellsTop + 18, 'font-family': fonts.mono, 'font-size': fontSizes.sm,
          fill: c.text, 'text-anchor': 'middle',
        }, svg);
        const xs = document.createElementNS(SVG_NS, 'tspan');
        xs.setAttribute('fill', c.textMuted);
        xs.textContent = `${sym.x} = `;
        xLine.appendChild(xs);
        const xv = document.createElementNS(SVG_NS, 'tspan');
        xv.setAttribute('font-weight', 'bold');
        xv.textContent = String(x);
        xLine.appendChild(xv);
        if (mark === undefined) return;
        const vals = el('g', {}, svg);
        if (isNow) handles.reveal.push(vals);
        label(vals, sx + 8, g.cellsTop + 36, sym.a, { anchor: 'start', size: fontSizes.xs, fill: c.textMuted, mono: true });
        label(vals, sx + g.cellW - 8, g.cellsTop + 36, sym.h, { anchor: 'end', size: fontSizes.xs, fill: c.textMuted, mono: true });
        mark.h.forEach((hv, i) => {
          const y = g.cellsTop + 52 + i * 20;
          const av = mark.a[i];
          if (av === undefined) throw new Error(`same-weights-each-step stage: 걸음 ${k} 의 a[${i}] 가 없다`);
          label(vals, sx + 8, y, fmt2(av), {
            anchor: 'start', size: fontSizes.xs, fill: c.textMuted, mono: true,
          });
          label(vals, sx + g.cellW - 8, y, fmt2(hv), { anchor: 'end', mono: true, weight: 'bold' });
        });
        subscripted(vals, cx, g.cellsTop + g.cellH + 18, sym.h, k, c.text);
      });

      // 캡션 — 지금 일어나는 일
      const caption = current === 0
        ? t('caption.start', 'Step 0 · no step has used the weight set yet')
        : t('caption.step', 'Step {k} · the weight set is called up', { k: current });
      label(svg, PIECE_CANVAS_W / 2, H - 12, caption, { size: fontSizes.md });
      return handles;
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
        waiters.add(wake);
      });
    }

    async function summon(scene: SameWeightsScene, handles: Handles, mine: number): Promise<void> {
      const chips = handles.chips;
      const step = scene.step;
      if (chips === null || step === null) return;
      const g = geometry(scene);
      const sx = g.slotX[step.k];
      if (sx === undefined) return;
      const bankCx = PIECE_CANVAS_W / 2;
      const cellCx = sx + g.cellW / 2;
      const s = Math.min(0.6, (g.cellW - 8) / g.bankW);
      const targetTop = g.cellsTop - s * g.chipsH + 8;

      const place = (u: number): void => {
        const sc = 1 + (s - 1) * u;
        const cx = bankCx + (cellCx - bankCx) * u;
        const top = BANK_TOP + (targetTop - BANK_TOP) * u;
        chips.setAttribute(
          'transform',
          `translate(${round(cx - sc * bankCx)} ${round(top - sc * BANK_TOP)}) scale(${round(sc * 1000) / 1000})`,
        );
      };
      const show = (on: boolean): void => {
        for (const node of handles.reveal) {
          if (on) node.removeAttribute('opacity');
          else node.setAttribute('opacity', '0');
        }
      };

      show(false);
      place(0);
      const frames = Math.round(MOTION_MS / FRAME_MS);
      for (let f = 1; f <= frames; f += 1) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const p = f / frames;
        if (p < LAND_AT) {
          place(ease(p / LAND_AT));
        } else if (p < LEAVE_AT) {
          place(1);
          show(true);
        } else {
          place(1 - ease((p - LEAVE_AT) / (1 - LEAVE_AT)));
        }
      }
    }

    const instance: ViewInstance & SceneRenderer<SameWeightsScene> = {
      async render(next, prev, opts): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const handles = drawStatic(next);
        const oneForward = prev !== null && next.step !== null && prev.trail.length === next.trail.length - 1;
        if (!opts.animate || !oneForward) return;
        await summon(next, handles, mine);
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
    return instance;
  },
};
