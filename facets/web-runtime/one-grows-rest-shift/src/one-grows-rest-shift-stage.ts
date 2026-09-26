/**
 * one-grows-rest-shift 의 stage — 블록 흐름 하나를 세로로 그린다.
 *
 * 동사는 "밀려난다". 바뀐 상자는 바닥이 아래로 자라고, 뒤의 상자는 한 걸음에 하나씩 같은 거리만큼
 * 아래로 내려간다. 앞의 상자는 제자리다. 움직인 것마다 오른쪽에 제 칸을 가진 화살표가 남아,
 * 길이가 모두 같은 화살표가 계단처럼 내려가는 것으로 "같은 거리" 를 보인다.
 *
 * 왼쪽 눈금은 각 블록 위 끝의 y (px), 맨 아래는 담는 상자 높이다.
 * 아직 밀리지 않은 상자와 겹친 자리는 겹침으로 칠해 둔다 — 다음 걸음이 왜 오는지다.
 */
import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { OneGrowsRestShiftScene, OneGrowsRestShiftSceneBlock } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 480;
const MOVE_MS = 500;
const FRAME_MS = 16;
/** 글이 차지하는 위 띠와 그림 사이 */
const TOP = 88;
const BOTTOM_PAD = 20;
/** 축척 상한 — 캔버스에서 역산하되 이보다 크게 부풀리지 않는다 */
const MAX_SCALE = 1.2;
/** 화살표 칸 사이 상한 */
const MAX_LANE_GAP = 48;

type Motion = { p: number };

type Arrow = { from: number; to: number; current: boolean };

function round1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

function signed(d: number): string {
  return d >= 0 ? `+${d}` : String(d);
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, typeof v === 'number' ? String(round1(v)) : v);
  }
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  text: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, 'dominant-baseline': 'central', ...attrs });
  node.textContent = text;
  return node;
}

/** 이번 걸음의 운동을 p 만큼만 반영한 배치. p = 1 이면 장면 그대로다. */
function shown(scene: OneGrowsRestShiftScene, motion: Motion): { blocks: OneGrowsRestShiftSceneBlock[]; total: number } {
  const step = scene.step;
  if (step === null || motion.p >= 1) return { blocks: scene.blocks, total: scene.total };
  if (step.kind === 'container') {
    return { blocks: scene.blocks, total: step.from + (step.to - step.from) * motion.p };
  }
  const blocks = scene.blocks.map((b, i) => {
    if (i !== step.index) return b;
    if (step.kind === 'grow') return { ...b, h: step.fromH + (step.toH - step.fromH) * motion.p };
    return { ...b, y: step.fromY + (step.toY - step.fromY) * motion.p };
  });
  return { blocks, total: scene.total };
}

/** 움직인 것마다 화살표 하나. 바뀐 차례(문서 차례)대로 칸을 받는다. */
function arrowsOf(
  scene: OneGrowsRestShiftScene,
  blocks: OneGrowsRestShiftSceneBlock[],
  total: number,
): Arrow[] {
  const step = scene.step;
  const out: Arrow[] = [];
  scene.before.forEach((a, i) => {
    const b = blocks[i];
    if (b === undefined) return;
    const was = scene.blocks[i];
    if (was.y === a.y && was.h === a.h) return;
    const current = step !== null && step.kind !== 'container' && step.index === i;
    if (was.h !== a.h) out.push({ from: a.y + a.h, to: b.y + b.h, current });
    else out.push({ from: a.y, to: b.y, current });
  });
  if (scene.total !== scene.totalBefore) {
    out.push({ from: scene.totalBefore, to: total, current: step !== null && step.kind === 'container' });
  }
  return out;
}

function drawScene(
  svg: SVGSVGElement,
  scene: OneGrowsRestShiftScene,
  motion: Motion,
  c: Palette,
  t: Translate,
): void {
  svg.textContent = '';
  const W = PIECE_CANVAS_W;
  const xs = parseFloat(fontSizes.xs);
  const sm = parseFloat(fontSizes.sm);

  // 글 — 지금 일어나는 일
  const step = scene.step;
  let caption = '';
  if (scene.blocks.length > 0) {
    if (step === null) {
      caption = t('caption.start', 'Before the change. Container height: {h}px', { h: scene.totalBefore });
    } else if (step.kind === 'grow') {
      const b = scene.blocks[step.index];
      caption = t('caption.grow', 'Grows: {id} — lines {from} → {to}, height {h0} → {h1} ({d}). y stays {y}.', {
        id: b.id,
        from: step.fromLines,
        to: step.toLines,
        h0: step.fromH,
        h1: step.toH,
        d: signed(step.toH - step.fromH),
        y: step.y,
      });
    } else if (step.kind === 'shift') {
      const b = scene.blocks[step.index];
      caption = t('caption.shift', 'Pushed down: {id} — y {from} → {to} ({d}). Height stays {h}.', {
        id: b.id,
        from: step.fromY,
        to: step.toY,
        d: signed(step.toY - step.fromY),
        h: step.h,
      });
    } else {
      caption = t('caption.container', 'Container height: {from} → {to} ({d})', {
        from: step.from,
        to: step.to,
        d: signed(step.to - step.from),
      });
    }
  }
  label(svg, W / 2, 22, caption, {
    'text-anchor': 'middle',
    'font-family': fonts.body,
    'font-size': fontSizes.md,
    fill: c.text,
  });
  if (scene.tally !== null) {
    label(
      svg,
      W / 2,
      46,
      t('caption.tally', 'Unchanged: {kept} · Pushed down: {moved}', {
        kept: scene.tally.kept,
        moved: scene.tally.moved,
      }),
      { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 600, fill: c.text },
    );
  }
  if (scene.blocks.length === 0 || scene.extent <= 0) return;

  const s = Math.min(MAX_SCALE, (H - TOP - BOTTOM_PAD) / scene.extent);
  const yOf = (v: number): number => TOP + v * s;
  const x0 = Math.round(W * 0.16);
  const x1 = Math.round(W * 0.62);
  const strip = Math.round((x1 - x0) * 0.24);
  const { blocks, total } = shown(scene, motion);

  // 담는 상자
  const cx0 = x0 - 5;
  const cx1 = x1 + 5;
  const containerOn = step !== null && step.kind === 'container';
  label(svg, cx0, TOP - 12, t('label.container', 'container'), {
    'font-family': fonts.body,
    'font-size': fontSizes.xs,
    fill: containerOn ? c.itemActive : c.textMuted,
  });
  el(svg, 'rect', {
    x: cx0,
    y: TOP,
    width: cx1 - cx0,
    height: total * s,
    fill: 'none',
    stroke: containerOn ? c.itemActive : c.text,
    'stroke-width': containerOn ? 2.5 : 1.5,
  });

  // 블록 — 뒤에서부터 그려 앞의 것이 위에 온다 (밀어내는 쪽이 아직 안 밀린 쪽을 덮는다)
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    const b = blocks[i];
    const on = step !== null && step.kind !== 'container' && step.index === i;
    const top = yOf(b.y);
    const hh = b.h * s;
    const g = el(svg, 'g', {});
    el(g, 'rect', {
      x: x0,
      y: top,
      width: x1 - x0,
      height: hh,
      fill: c.bgSubtle,
      stroke: on ? c.itemActive : c.border,
      'stroke-width': on ? 2 : 1,
    });
    const rowH = (b.lineHeight ?? Math.min(b.h, 24)) * s;
    label(g, x0 + 8, top + Math.min(rowH, hh) / 2, b.id, {
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.text,
    });
    label(g, x0 + 8 + (b.id.length + 1) * xs * 0.62, top + Math.min(rowH, hh) / 2, b.tag, {
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    const bx0 = x0 + strip;
    const bx1 = x1 - 10;
    if (b.lines !== null && b.lineHeight !== null) {
      const lh = b.lineHeight * s;
      const thick = Math.max(4, lh * (b.tag === 'h1' ? 0.42 : 0.3));
      for (let k = 0; k < b.lines; k += 1) {
        // 자라는 중이면 상자 바닥이 닿은 줄까지만 드러난다
        if ((k + 1) * lh > hh + 0.5) break;
        const last = k === b.lines - 1;
        const x2 = last ? bx0 + (bx1 - bx0) * 0.58 : bx1;
        el(g, 'rect', {
          x: bx0,
          y: top + k * lh + (lh - thick) / 2,
          width: x2 - bx0,
          height: thick,
          rx: thick / 2,
          fill: c.textMuted,
          'fill-opacity': 0.45,
        });
      }
    } else {
      const pad = Math.min(6, hh / 6);
      const ix0 = bx0;
      const iy0 = top + pad;
      const ix1 = bx1;
      const iy1 = top + hh - pad;
      el(g, 'rect', { x: ix0, y: iy0, width: ix1 - ix0, height: iy1 - iy0, fill: 'none', stroke: c.textMuted, 'stroke-opacity': 0.6 });
      el(g, 'line', { x1: ix0, y1: iy0, x2: ix1, y2: iy1, stroke: c.textMuted, 'stroke-opacity': 0.4 });
      el(g, 'line', { x1: ix0, y1: iy1, x2: ix1, y2: iy0, stroke: c.textMuted, 'stroke-opacity': 0.4 });
    }
  }

  // 겹침 — 한 흐름 안에서 두 블록이 같은 자리를 쥐고 있다
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const lo = Math.max(blocks[i].y, blocks[j].y);
      const hi = Math.min(blocks[i].y + blocks[i].h, blocks[j].y + blocks[j].h);
      if (hi - lo < 0.5) continue;
      el(svg, 'rect', {
        x: x0,
        y: yOf(lo),
        width: x1 - x0,
        height: (hi - lo) * s,
        fill: c.danger,
        'fill-opacity': 0.16,
        stroke: c.danger,
        'stroke-opacity': 0.5,
        'stroke-dasharray': '4 3',
      });
    }
  }

  // 왼쪽 눈금 — 위 끝의 y 와 담는 상자 높이
  const rx = x0 - 14;
  label(svg, rx, TOP - 12, 'y', {
    'text-anchor': 'end',
    'font-family': fonts.mono,
    'font-size': fontSizes.xs,
    fill: c.textMuted,
  });
  blocks.forEach((b, i) => {
    const on = step !== null && step.kind === 'shift' && step.index === i;
    label(svg, rx, yOf(b.y) + 1, String(Math.round(b.y)), {
      'text-anchor': 'end',
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: on ? c.itemActive : c.textMuted,
      'font-weight': on ? 700 : 400,
    });
  });
  label(svg, rx, yOf(total), String(Math.round(total)), {
    'text-anchor': 'end',
    'font-family': fonts.mono,
    'font-size': fontSizes.sm,
    'font-weight': 700,
    fill: containerOn ? c.itemActive : c.text,
  });

  // 오른쪽 화살표 — 움직인 거리. 칸은 바뀐 차례대로
  const arrows = arrowsOf(scene, blocks, total);
  const lanes = Math.max(1, scene.lanes);
  const labelW = sm * 2.6;
  const laneX0 = cx1 + 18;
  const gap = lanes > 1 ? Math.min(MAX_LANE_GAP, (W - laneX0 - labelW - 8) / (lanes - 1)) : 0;
  arrows.forEach((a, k) => {
    const x = laneX0 + k * gap;
    const col = a.current ? c.itemActive : c.textMuted;
    el(svg, 'line', {
      x1: cx1 + 2,
      y1: yOf(a.from),
      x2: x,
      y2: yOf(a.from),
      stroke: c.textMuted,
      'stroke-opacity': 0.6,
      'stroke-dasharray': '2 3',
    });
    el(svg, 'line', { x1: cx1 + 2, y1: yOf(a.to), x2: x, y2: yOf(a.to), stroke: col, 'stroke-opacity': 0.8 });
    const len = (a.to - a.from) * s;
    if (Math.abs(len) < 4) return;
    const dir = len > 0 ? 1 : -1;
    const head = Math.min(7, Math.abs(len) / 2);
    el(svg, 'line', {
      x1: x,
      y1: yOf(a.from),
      x2: x,
      y2: yOf(a.to) - dir * head,
      stroke: col,
      'stroke-width': a.current ? 2.5 : 1.5,
    });
    el(svg, 'path', {
      d: `M ${round1(x - 4.5)} ${round1(yOf(a.to) - dir * head)} L ${round1(x + 4.5)} ${round1(yOf(a.to) - dir * head)} L ${round1(x)} ${round1(yOf(a.to))} Z`,
      fill: col,
    });
    label(svg, x + 5, (yOf(a.from) + yOf(a.to)) / 2, signed(Math.round(a.to - a.from)), {
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': a.current ? 700 : 400,
      fill: col,
      // 옆 칸의 이음선 위에 놓여도 읽히게 바탕색 테를 두른다
      stroke: c.bg,
      'stroke-width': 3,
      'paint-order': 'stroke',
    });
  });
}

export const oneGrowsRestShiftStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let gen = 0;
    let destroyed = false;

    const draw = (scene: OneGrowsRestShiftScene, p: number): void => {
      drawScene(svg, scene, { p }, c, t);
    };

    const frame = (): Promise<void> =>
      new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, FRAME_MS);
        timers.add(id);
      });

    return {
      async render(next: OneGrowsRestShiftScene, _prev: OneGrowsRestShiftScene | null, opts: { animate: boolean }) {
        const mine = (gen += 1);
        if (destroyed) return;
        if (!opts.animate || next.step === null) {
          draw(next, 1);
          return;
        }
        draw(next, 0);
        const start = Date.now();
        let raw = 0;
        while (raw < 1) {
          await frame();
          if (mine !== gen || destroyed) return;
          raw = Math.min(1, (Date.now() - start) / MOVE_MS);
          draw(next, ease(raw));
        }
        // 운동이 남긴 끝자리를 정본으로 다시 세운다
        draw(next, 1);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
