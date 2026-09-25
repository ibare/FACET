/**
 * swap-in-out 무대 — 위에 메모리 자리들과 막 도착한 자리, 아래에 디스크의 스왑 자리.
 *
 * 동사는 "내려갔다 올라온다". 프로세스 블록 하나가 통째로 자리에서 디스크로 내려가고,
 * 기다림이 끝나면 디스크에서 다른 자리로 올라온다. 내려간 자리에는 자취 글자가 남아
 * 돌아온 자리와 견줄 수 있다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { SwapScene } from './scene.js';
import type { ProcState } from './algorithm.js';

const H = 318;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN = 20;
const GAP = 16;
const BLOCK_W_MAX = 120;
const BLOCK_H = 58;
const SLOT_TOP = 66;
const SLOT_H = 88;
const RANGE_Y = 172;
const LEFT_Y = 189;
const DISK_TOP = 204;
const DISK_H = 104;

const MOVE_MS = 760;
const ARRIVE_MS = 620;
const EXIT_MS = 620;

type Point = { x: number; y: number };

type Layout = {
  colW: number;
  blockW: number;
  memW: number;
  slotX: (i: number) => number;
  slotBlock: (i: number) => Point;
  arrivalBlock: (i: number) => Point;
  diskBlock: (i: number, count: number) => Point;
};

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

function layoutFor(slotCount: number): Layout {
  const colW = (W - 2 * MARGIN - GAP) / (slotCount + 1);
  const blockW = Math.min(BLOCK_W_MAX, colW - 24);
  const memW = colW * slotCount;
  const slotX = (i: number): number => MARGIN + colW * i;
  const blockTopInSlot = SLOT_TOP + (SLOT_H - BLOCK_H) / 2;
  const arrivalX = MARGIN + memW + GAP + (colW - blockW) / 2;
  const diskCenter = MARGIN + memW / 2;
  const diskY = DISK_TOP + 30 + (DISK_H - 30 - BLOCK_H) / 2;
  return {
    colW,
    blockW,
    memW,
    slotX,
    slotBlock: (i) => ({ x: slotX(i) + (colW - blockW) / 2, y: blockTopInSlot }),
    arrivalBlock: (i) => ({ x: arrivalX + i * 8, y: blockTopInSlot + i * 8 }),
    diskBlock: (i, count) => ({ x: diskCenter + (i - (count - 1) / 2) * colW - blockW / 2, y: diskY }),
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(typeof v === 'number' ? r2(v) : v));
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
  extra: Record<string, string | number> = {},
): SVGTextElement {
  const node = el(parent, 'text', { x, y, 'font-family': fonts.body, 'font-size': size, fill, ...extra });
  node.textContent = text;
  return node;
}

function place(g: SVGGElement, p: Point): void {
  g.setAttribute('transform', `translate(${r2(p.x)},${r2(p.y)})`);
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function lerp(a: Point, b: Point, k: number): Point {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

export const swapInOutStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;
    let blocks = new Map<string, SVGGElement>();

    function stateLabel(state: ProcState): string {
      if (state === 'running') return t('state.running', 'running');
      if (state === 'ready') return t('state.ready', 'ready');
      return t('state.waiting', 'waiting');
    }

    function rangeText(scene: SwapScene, slot: number): string {
      return t('label.range', 'Slot {slot}: {from}–{to} KiB', {
        slot,
        from: slot * scene.slotKiB,
        to: (slot + 1) * scene.slotKiB,
      });
    }

    function leftSlot(scene: SwapScene, pid: string): number {
      const found = scene.left.find(([p]) => p === pid);
      if (found === undefined) throw new Error(`swap-in-out-stage: ${pid} 가 내려간 자리가 장면에 없다`);
      return found[1];
    }

    function captionText(scene: SwapScene): string {
      const s = scene.step;
      if (s.kind === 'start') {
        const used = scene.slots.filter((p) => p !== null).length;
        return t('caption.start', 'Memory slots in use: {used} / {n}', { used, n: scene.slots.length });
      }
      const pid = s.pid.toUpperCase();
      if (s.kind === 'arrive') {
        return t('caption.arrive', '{pid} arrives, ready to run. Free slots: {free}', { pid, free: s.free });
      }
      if (s.kind === 'swapOut') {
        return t('caption.swapOut', '{pid} is waiting, so it goes down to disk whole. Freed: slot {slot}', {
          pid,
          slot: s.slot,
        });
      }
      if (s.kind === 'swapIn') {
        if (s.from === 'arrival') {
          return t('caption.swapInNew', '{pid} comes up into slot {slot}', { pid, slot: s.slot });
        }
        return t('caption.swapInDisk', '{pid} comes back up from disk into slot {slot}. It went down from slot {left}', {
          pid,
          slot: s.slot,
          left: leftSlot(scene, s.pid),
        });
      }
      if (s.kind === 'ioDone') {
        if (s.where === 'disk') {
          return t('caption.ioDoneDisk', '{pid} finishes its I/O and is ready, but it is still on disk', { pid });
        }
        return t('caption.ioDoneMem', '{pid} finishes its I/O and is ready', { pid });
      }
      return t('caption.exit', '{pid} finishes and leaves. Freed: slot {slot}', { pid, slot: s.slot });
    }

    function drawBlock(
      parent: Element,
      pid: string,
      state: ProcState,
      at: Point,
      blockW: number,
      marked: boolean,
    ): SVGGElement {
      const g = el(parent, 'g', {});
      place(g, at);
      const fill = state === 'running' ? colors.itemActive : colors.itemDefault;
      const ink = state === 'running' ? colors.stateInk : state === 'waiting' ? colors.textMuted : colors.text;
      const stroke = marked ? colors.accent : state === 'waiting' ? colors.ghostOutline : colors.text;
      const rect = el(g, 'rect', {
        x: 0,
        y: 0,
        width: blockW,
        height: BLOCK_H,
        rx: 6,
        fill,
        stroke,
        'stroke-width': marked ? 3 : 1.5,
      });
      if (state === 'waiting') rect.setAttribute('stroke-dasharray', '5 4');
      label(g, blockW / 2, 25, pid.toUpperCase(), fontSizes.lg, ink, {
        'text-anchor': 'middle',
        'font-weight': 700,
      });
      label(g, blockW / 2, 45, stateLabel(state), fontSizes.xs, ink, { 'text-anchor': 'middle' });
      return g;
    }

    function drawStatic(scene: SwapScene): void {
      svg.textContent = '';
      blocks = new Map();
      const L = layoutFor(scene.slots.length);
      const states = new Map(scene.states);
      const marked = scene.step.kind === 'start' ? null : scene.step.pid;
      const stateOf = (pid: string): ProcState => {
        const s = states.get(pid);
        if (s === undefined) throw new Error(`swap-in-out-stage: ${pid} 의 상태가 장면에 없다`);
        return s;
      };

      el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg });
      label(svg, MARGIN, 28, captionText(scene), fontSizes.md, colors.text, { 'font-weight': 600 });

      // 메모리
      label(svg, MARGIN, 58, t('label.memory', 'Memory'), fontSizes.sm, colors.textMuted);
      scene.slots.forEach((_, i) => {
        el(svg, 'rect', {
          x: L.slotX(i) + 4,
          y: SLOT_TOP,
          width: L.colW - 8,
          height: SLOT_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        });
        label(svg, L.slotX(i) + L.colW / 2, RANGE_Y, rangeText(scene, i), fontSizes.xs, colors.textMuted, {
          'text-anchor': 'middle',
        });
      });
      for (const [pid, slot] of scene.left) {
        label(svg, L.slotX(slot) + L.colW / 2, LEFT_Y, t('label.left', 'Went down: {pid}', { pid: pid.toUpperCase() }), fontSizes.xs, colors.ghostOutline, {
          'text-anchor': 'middle',
        });
      }

      // 막 도착한 자리
      const arrivalX = MARGIN + L.memW + GAP;
      label(svg, arrivalX + L.colW / 2, 58, t('label.new', 'New'), fontSizes.sm, colors.textMuted, {
        'text-anchor': 'middle',
      });
      el(svg, 'rect', {
        x: arrivalX + 4,
        y: SLOT_TOP,
        width: L.colW - 8,
        height: SLOT_H,
        rx: 4,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });

      // 디스크
      el(svg, 'rect', {
        x: MARGIN,
        y: DISK_TOP,
        width: L.memW,
        height: DISK_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.textMuted,
        'stroke-width': 1,
      });
      label(svg, MARGIN + 10, DISK_TOP + 20, t('label.disk', 'Disk — swap area'), fontSizes.sm, colors.textMuted);

      // 블록 — 메모리, 디스크, 도착 줄
      scene.slots.forEach((pid, i) => {
        if (pid === null) return;
        blocks.set(pid, drawBlock(svg, pid, stateOf(pid), L.slotBlock(i), L.blockW, pid === marked));
      });
      scene.disk.forEach((pid, i) => {
        blocks.set(pid, drawBlock(svg, pid, stateOf(pid), L.diskBlock(i, scene.disk.length), L.blockW, pid === marked));
      });
      scene.arrival.forEach((pid, i) => {
        blocks.set(pid, drawBlock(svg, pid, stateOf(pid), L.arrivalBlock(i), L.blockW, pid === marked));
      });
    }

    function tween(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const begin = Date.now();
        let finished = false;
        const done = (): void => {
          if (finished) return;
          finished = true;
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (): void => {
          if (destroyed || mine !== gen) return done();
          const k = Math.min(1, (Date.now() - begin) / ms);
          frame(ease(k));
          if (k >= 1) return done();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(next: SwapScene, _prev: SwapScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      drawStatic(next);
      if (!opts.animate) return;
      const s = next.step;
      const L = layoutFor(next.slots.length);

      if (s.kind === 'arrive') {
        const g = blocks.get(s.pid);
        const index = next.arrival.indexOf(s.pid);
        if (g === undefined || index < 0) return;
        const to = L.arrivalBlock(index);
        const from = { x: W + 8, y: to.y };
        place(g, from);
        await tween(ARRIVE_MS, mine, (k) => place(g, lerp(from, to, k)));
      } else if (s.kind === 'swapOut') {
        const g = blocks.get(s.pid);
        if (g === undefined) return;
        const from = L.slotBlock(s.slot);
        const to = L.diskBlock(s.diskIndex, next.disk.length);
        place(g, from);
        await tween(MOVE_MS, mine, (k) => place(g, lerp(from, to, k)));
      } else if (s.kind === 'swapIn') {
        const g = blocks.get(s.pid);
        if (g === undefined) return;
        const from =
          s.from === 'disk' ? L.diskBlock(s.fromIndex, next.disk.length + 1) : L.arrivalBlock(s.fromIndex);
        const to = L.slotBlock(s.slot);
        place(g, from);
        await tween(MOVE_MS, mine, (k) => place(g, lerp(from, to, k)));
      } else if (s.kind === 'exit') {
        // 끝난 프로세스는 장면에 없다 — 떠나는 모습만 잠시 그린다.
        const from = L.slotBlock(s.slot);
        const g = drawBlock(svg, s.pid, s.was, from, L.blockW, true);
        await tween(EXIT_MS, mine, (k) => {
          place(g, { x: from.x, y: from.y - 44 * k });
          g.setAttribute('opacity', String(r2(1 - k)));
        });
      } else {
        return;
      }
      if (mine !== gen || destroyed) return;
      drawStatic(next);
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
