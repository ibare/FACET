/**
 * 집합 연산 무대 — 위에 A · B 가 제자리에 있고, 아래 결과 자리 셋으로 원소의 사본이 떠나 모인다.
 *
 * 연산마다 사본이 A · B 에서 날아와 결과 모음의 칸에 앉는다. 양쪽에서 온 같은 원소는
 * 한 칸에 나란히 내려앉았다가 하나로 포개진다(두 빛깔 반쪽 원소가 된다). 차집합에서는
 * A 의 사본이 다섯 칸에 다 앉은 뒤, B 에도 있는 원소가 B 의 같은 원소 쪽으로 빨려 나가고
 * 닫는 괄호가 당겨진다.
 */
import {
  categorical,
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
import type { SetOperation } from './algorithm.js';
import type { SetOperationsBase, SetOperationsScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 352;
const MARGIN = 16;
const LABEL_W = 112;
const SIZE_W = 84;
const BRACE = 16;
const PITCH_MAX = 42;
const TOP_Y = 58;
const ROW_Y0 = 140;
const ROW_GAP = 64;
const CAPTION_Y = 318;
const CAPTION_GAP = 20;
const MOTION_MS = 800;
/** 날아와 앉는 몫 — 나머지가 포개지기(또는 덜어 내기)다 */
const LAND_SHARE = 0.62;
const FRAME_MS = 16;

type Pt = { x: number; y: number };

type Layout = {
  pitch: number;
  r: number;
  /** 위 줄 원소 자리 */
  aX: number[];
  bX: number[];
  aName: { x: number; brace0: number; brace1: number };
  bName: { x: number; brace0: number; brace1: number };
  /** 결과 줄 */
  rowY: (i: number) => number;
  trayX0: number;
  slotX: (k: number) => number;
  closeX: (n: number) => number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function formatSet(values: readonly number[]): string {
  if (values.length === 0) return '∅';
  return `{${values.join(', ')}}`;
}

function layoutFor(base: SetOperationsBase): Layout {
  const W = PIECE_CANVAS_W;
  const nA = base.a.items.length;
  const nB = base.b.items.length;
  const nameW = parseFloat(fontSizes.lg) * 2.2;
  const topGap = 36;
  // 결과 줄은 가장 많아야 |A| + |B| 칸 — 합집합 · 차집합의 들어온 사본이 그보다 많을 수 없다
  const rowPitch = (W - 2 * MARGIN - LABEL_W - SIZE_W - 2 * BRACE) / (nA + nB);
  const topPitch = (W - 2 * MARGIN - topGap - 2 * (nameW + 2 * BRACE)) / (nA + nB);
  const pitch = Math.min(PITCH_MAX, rowPitch, topPitch);
  if (!(pitch > 0)) throw new Error('set-operations-stage: 원소 자리 폭이 0 이하다');
  const r = pitch * 0.4;

  const groupW = (n: number): number => nameW + BRACE + n * pitch + BRACE;
  const total = groupW(nA) + topGap + groupW(nB);
  const startA = (W - total) / 2;
  const startB = startA + groupW(nA) + topGap;
  const group = (x0: number, n: number): { x: number; brace0: number; brace1: number; xs: number[] } => {
    const brace0 = x0 + nameW;
    const xs = Array.from({ length: n }, (_, k) => round(brace0 + BRACE + pitch / 2 + k * pitch));
    return { x: round(x0), brace0: round(brace0 + BRACE / 2), brace1: round(brace0 + BRACE + n * pitch + BRACE / 2), xs };
  };
  const ga = group(startA, nA);
  const gb = group(startB, nB);
  const trayX0 = MARGIN + LABEL_W;
  return {
    pitch,
    r,
    aX: ga.xs,
    bX: gb.xs,
    aName: { x: ga.x, brace0: ga.brace0, brace1: ga.brace1 },
    bName: { x: gb.x, brace0: gb.brace0, brace1: gb.brace1 },
    rowY: (i) => ROW_Y0 + i * ROW_GAP,
    trayX0,
    slotX: (k) => round(trayX0 + BRACE + pitch / 2 + k * pitch),
    closeX: (n) => round(trayX0 + BRACE + Math.max(n, 1) * pitch + BRACE / 2),
  };
}

/** 여는(dir 1) · 닫는(dir −1) 중괄호 */
function bracePath(x: number, yc: number, h: number, dir: 1 | -1): string {
  const w = 5 * dir;
  const y0 = yc - h / 2;
  const y1 = yc + h / 2;
  const q = Math.abs(w);
  const pts = [
    `M ${round(x + w)} ${round(y0)}`,
    `Q ${round(x)} ${round(y0)} ${round(x)} ${round(y0 + q)}`,
    `L ${round(x)} ${round(yc - q)}`,
    `Q ${round(x)} ${round(yc)} ${round(x - w)} ${round(yc)}`,
    `Q ${round(x)} ${round(yc)} ${round(x)} ${round(yc + q)}`,
    `L ${round(x)} ${round(y1 - q)}`,
    `Q ${round(x)} ${round(y1)} ${round(x + w)} ${round(y1)}`,
  ];
  return pts.join(' ');
}

export const setOperationsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const [colorA, colorB] = categorical(2, 'vivid');
    if (colorA === undefined || colorB === undefined) throw new Error('set-operations-stage: 두 모음의 색을 얻지 못했다');
    const mono = fonts.mono;
    const body = fonts.body;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    const opName = (op: SetOperation): string => {
      if (op === 'intersection') return t('label.intersection', 'Intersection');
      if (op === 'union') return t('label.union', 'Union');
      return t('label.difference', 'Difference');
    };
    const exprOf = (base: SetOperationsBase, op: SetOperation): string =>
      t('label.expr', '{a} {op} {b}', { a: base.a.name, op: base.symbols[op], b: base.b.name });

    /** 원소 하나 — 가운데 (0, 0) 에 그린 묶음. 위치는 transform 으로 */
    function chip(parent: Element, value: number, from: 'a' | 'b' | 'both', r: number): SVGGElement {
      const g = el('g', {}, parent);
      if (from === 'both') {
        el('path', { d: `M 0 ${round(-r)} A ${round(r)} ${round(r)} 0 0 0 0 ${round(r)} Z`, fill: colorA }, g);
        el('path', { d: `M 0 ${round(-r)} A ${round(r)} ${round(r)} 0 0 1 0 ${round(r)} Z`, fill: colorB }, g);
        el('circle', { cx: 0, cy: 0, r: round(r), fill: 'none', stroke: colors.bg, 'stroke-width': 1.5 }, g);
      } else {
        el('circle', { cx: 0, cy: 0, r: round(r), fill: from === 'a' ? colorA : colorB, stroke: colors.bg, 'stroke-width': 1.5 }, g);
      }
      const label = el(
        'text',
        {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': mono,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.stateInk,
        },
        g,
      );
      label.textContent = String(value);
      return g;
    }

    function place(g: SVGGElement, p: Pt, scale = 1): void {
      const s = round(scale);
      g.setAttribute('transform', s === 1 ? `translate(${round(p.x)} ${round(p.y)})` : `translate(${round(p.x)} ${round(p.y)}) scale(${s})`);
    }

    function brace(parent: Element, x: number, yc: number, h: number, dir: 1 | -1): SVGPathElement {
      return el(
        'path',
        { d: bracePath(x, yc, h, dir), fill: 'none', stroke: colors.textMuted, 'stroke-width': 1.6, 'stroke-linecap': 'round' },
        parent,
      );
    }

    function text(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x: round(x), y: round(y), ...attrs }, parent);
      node.textContent = s;
      return node;
    }

    /**
     * 장면 전체를 세운다. pending 이 있으면 그 연산 줄의 원소 · 닫는 괄호 · 크기는
     * 운동이 채우므로 비워 둔다.
     */
    function drawStatic(scene: SetOperationsScene, pending: SetOperation | null): void {
      svg.textContent = '';
      const { base, results, step } = scene;
      const L = layoutFor(base);
      const braceH = L.r * 2 + 10;
      const root = el('g', {}, svg);

      // 위 줄 — A · B 는 제자리에 남는다
      const ringB = new Set(step.kind === 'gather' ? step.removed : []);
      const drawSource = (
        name: string,
        items: number[],
        xs: number[],
        meta: { x: number; brace0: number; brace1: number },
        from: 'a' | 'b',
      ): void => {
        text(root, meta.x, TOP_Y, name, {
          'dominant-baseline': 'central',
          'font-family': mono,
          'font-size': fontSizes.xl,
          'font-weight': 600,
          fill: colors.text,
        });
        text(root, meta.x + parseFloat(fontSizes.xl) * 0.9, TOP_Y, '=', {
          'dominant-baseline': 'central',
          'font-family': mono,
          'font-size': fontSizes.lg,
          fill: colors.textMuted,
        });
        brace(root, meta.brace0, TOP_Y, braceH, 1);
        brace(root, meta.brace1, TOP_Y, braceH, -1);
        items.forEach((v, k) => {
          const x = xs[k];
          if (x === undefined) throw new Error(`set-operations-stage: ${from}[${k}] 자리가 없다`);
          if (from === 'b' && ringB.has(v)) {
            el('circle', { cx: x, cy: TOP_Y, r: round(L.r + 4), fill: 'none', stroke: colors.accent, 'stroke-width': 3 }, root);
          }
          place(chip(root, v, from, L.r), { x, y: TOP_Y });
        });
      };
      drawSource(base.a.name, base.a.items, L.aX, L.aName, 'a');
      drawSource(base.b.name, base.b.items, L.bX, L.bName, 'b');

      // 결과 줄 셋 — 연산 차례대로
      base.operations.forEach((op, i) => {
        const y = L.rowY(i);
        const done = results.find((r) => r.op === op);
        const muted = done === undefined;
        text(root, MARGIN, y - 8, opName(op), {
          'dominant-baseline': 'central',
          'font-family': body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        text(root, MARGIN, y + 10, exprOf(base, op), {
          'dominant-baseline': 'central',
          'font-family': mono,
          'font-size': fontSizes.lg,
          'font-weight': 600,
          fill: muted ? colors.textMuted : colors.text,
        });
        if (done === undefined) return;
        brace(root, L.trayX0 + BRACE / 2, y, braceH, 1);
        if (pending === op) return;
        done.items.forEach((item, k) => place(chip(root, item.value, item.from, L.r), { x: L.slotX(k), y }));
        const close = L.closeX(done.items.length);
        brace(root, close, y, braceH, -1);
        text(
          root,
          close + 14,
          y,
          t('label.size', '|{expr}| = {n}', { expr: exprOf(base, op), n: done.items.length }),
          { 'dominant-baseline': 'central', 'font-family': mono, 'font-size': fontSizes.sm, fill: colors.textMuted },
        );
      });

      // 캡션 — 지금 일어나는 일만
      const lines: string[] = [];
      if (step.kind === 'start') {
        lines.push(t('caption.start', 'Each operation gathers copies of elements from {a} and {b}', { a: base.a.name, b: base.b.name }));
      } else if (step.op === 'intersection') {
        lines.push(
          t('caption.intersection', 'Only elements in both come out, one copy from each side, and merge: {both}', {
            both: formatSet(step.merged),
          }),
        );
      } else if (step.op === 'union') {
        lines.push(
          t('caption.union', 'Every element comes in; copies from both sides merge into one: {both}', {
            both: formatSet(step.merged),
          }),
        );
      } else {
        lines.push(
          t('caption.difference', 'All of {a} comes in; those also in {b} are taken out: {removed}', {
            a: base.a.name,
            b: base.b.name,
            removed: formatSet(step.removed),
          }),
        );
        lines.push(t('caption.idle', 'Only in {b}, nothing to take out: {idle}', { b: base.b.name, idle: formatSet(step.idle) }));
      }
      lines.forEach((line, k) => {
        text(root, PIECE_CANVAS_W / 2, CAPTION_Y + k * CAPTION_GAP, line, {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': body,
          'font-size': k === 0 ? fontSizes.md : fontSizes.sm,
          fill: k === 0 ? colors.text : colors.textMuted,
        });
      });
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

    /** 한 시계 — p 를 0 → 1 로 흘린다. 멈추면 거짓 */
    async function run(mine: number, frame: (p: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const p = Math.min(1, (Date.now() - start) / MOTION_MS);
        frame(p);
        if (p >= 1) return true;
        await wait(FRAME_MS);
      }
    }

    async function animateGather(scene: SetOperationsScene, mine: number): Promise<void> {
      const { base, results, step } = scene;
      if (step.kind !== 'gather') throw new Error('set-operations-stage: 운동할 걸음이 아니다');
      const row = base.operations.indexOf(step.op);
      if (row < 0) throw new Error(`set-operations-stage: 연산 ${step.op} 의 줄이 없다`);
      const done = results.find((r) => r.op === step.op);
      if (done === undefined) throw new Error(`set-operations-stage: 연산 ${step.op} 의 결과가 장면에 없다`);

      drawStatic(scene, step.op);
      const L = layoutFor(base);
      const y = L.rowY(row);
      const braceH = L.r * 2 + 10;
      const layer = el('g', {}, svg);
      const provisional = step.op === 'difference';
      const merged = new Set(step.merged);
      const removed = new Set(step.removed);

      const flights = step.taken.map((c, i) => {
        const home = c.from === 'a' ? base.a.items : base.b.items;
        const xs = c.from === 'a' ? L.aX : L.bX;
        const k = home.indexOf(c.value);
        const sx = xs[k];
        if (k < 0 || sx === undefined) throw new Error(`set-operations-stage: taken[${i}] 의 원소 자리가 없다`);
        const slot = provisional ? i : done.items.findIndex((it) => it.value === c.value);
        if (slot < 0) throw new Error(`set-operations-stage: taken[${i}] 이 앉을 칸이 결과에 없다`);
        const tx = L.slotX(slot);
        const side = merged.has(c.value) ? (c.from === 'a' ? -1 : 1) * L.r * 0.7 : 0;
        let exit: Pt | null = null;
        if (removed.has(c.value)) {
          const kb = base.b.items.indexOf(c.value);
          const bx = L.bX[kb];
          if (kb < 0 || bx === undefined) throw new Error(`set-operations-stage: 덜어질 원소 ${c.value} 가 B 에 없다`);
          exit = { x: bx, y: TOP_Y };
        }
        return { g: chip(layer, c.value, c.from, L.r), from: { x: sx, y: TOP_Y }, land: { x: tx + side, y }, to: { x: tx, y }, exit };
      });
      const n0 = provisional ? step.taken.length : done.items.length;
      const closing = brace(layer, L.closeX(n0), y, braceH, -1);

      const ok = await run(mine, (p) => {
        const a = ease(Math.min(1, p / LAND_SHARE));
        const b = ease(Math.max(0, (p - LAND_SHARE) / (1 - LAND_SHARE)));
        for (const f of flights) {
          if (p <= LAND_SHARE) {
            place(f.g, { x: lerp(f.from.x, f.land.x, a), y: lerp(f.from.y, f.land.y, a) });
          } else if (f.exit !== null) {
            place(f.g, { x: lerp(f.to.x, f.exit.x, b), y: lerp(f.to.y, f.exit.y, b) }, lerp(1, 0.35, b));
            f.g.setAttribute('opacity', String(round(1 - b)));
          } else {
            place(f.g, { x: lerp(f.land.x, f.to.x, b), y: f.to.y });
          }
        }
        if (provisional) {
          const x = lerp(L.closeX(n0), L.closeX(done.items.length), b);
          closing.setAttribute('d', bracePath(x, y, braceH, -1));
        } else {
          closing.setAttribute('opacity', String(round(a)));
        }
      });
      if (!ok) return;
      drawStatic(scene, null);
    }

    return {
      render(next: SetOperationsScene, prev: SetOperationsScene | null, opts: { animate: boolean }): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const moves = opts.animate && next.step.kind === 'gather' && prev !== null && prev.step !== next.step;
        if (!moves) {
          drawStatic(next, null);
          return;
        }
        return animateGather(next, mine);
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
