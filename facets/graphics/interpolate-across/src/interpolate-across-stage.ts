/**
 * 무게중심 보간 stage — 꼭짓점 하나씩 제 색이 삼각형 안으로 번진다.
 *
 * 왼쪽은 픽셀 격자와 삼각형, 오른쪽은 꼭짓점 색 셋과 읽은 칸의 몫.
 * 붓는 걸음에서는 꼭짓점 색 방울이 판에서 꼭짓점으로 옮겨 가고, 그 꼭짓점의 몫이 같은 선(맞은편 모서리와
 * 나란한 선)이 꼭짓점에서 맞은편 모서리로 쓸려 간다. 선이 지나간 칸에 몫만큼 색이 더해진다.
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

import { levelSegment, type Rgb } from './algorithm.js';
import type { InterpolateAcrossScene } from './scene.js';

const H = 420;
const SVG = 'http://www.w3.org/2000/svg';
const PAD = 20;
const TOP = 52;
/** 오른쪽 판의 폭 상한. */
const PANEL_MAX = 190;
const DROP_MS = 350;
const SPREAD_MS = 900;
const PROBE_MS = 700;
const FRAME_MS = 16;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, attrs: Attrs): SVGTextElement {
  const node = el('text', { x: round(x), y: round(y), ...attrs }, parent);
  node.textContent = text;
  return node;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

/** 표시 반올림 — 셈은 반올림하지 않은 값으로 끝까지 하고 여기서만 자른다. `-0.00` 은 `0.00`. */
function fmt(v: number, digits: number): string {
  const s = v.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

/** 선형 0..1 채널 셋(자료)을 SVG 채움 값으로 옮긴다. 감마는 걸지 않는다. */
function fillOf(col: Rgb): string {
  const ch = col.map((v) => {
    if (v < -1e-9 || v > 1 + 1e-9) throw new Error(`interpolate-across-stage: 색 채널 ${v} 가 0..1 밖이다`);
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  return `rgb(${ch[0]}, ${ch[1]}, ${ch[2]})`;
}

/** 칸 위 글자의 먹 — 칸이 밝으면 어두운 먹, 어두우면 밝은 먹. 테마와 상관없이 칸 색이 가른다. */
function inkOn(col: Rgb): string {
  const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
  return lum > 0.35 ? getColors('light').text : getColors('dark').text;
}

type Layout = {
  s: number;
  gx: number;
  gy: number;
  px: number;
  pw: number;
  X: (x: number) => number;
  Y: (y: number) => number;
};

function layoutOf(scene: InterpolateAcrossScene): Layout {
  const s = Math.min((PIECE_CANVAS_W - PANEL_MAX - PAD * 3) / scene.width, (H - TOP - PAD) / scene.height);
  const gx = PAD;
  const gy = TOP;
  const px = gx + scene.width * s + PAD * 1.5;
  const pw = PIECE_CANVAS_W - PAD - px;
  return { s, gx, gy, px, pw, X: (x) => gx + x * s, Y: (y) => gy + y * s };
}

/** 오른쪽 판에서 꼭짓점 k 의 색 칸 가운데. */
function swatchCenter(lay: Layout, k: number): { x: number; y: number } {
  return { x: lay.px + 14, y: TOP + 34 + k * 40 };
}

type Handles = {
  cellRects: SVGRectElement[];
  cellTexts: SVGTextElement[];
  marks: SVGGElement;
  front: SVGLineElement | null;
  drop: SVGCircleElement | null;
  spokes: SVGLineElement[];
  bars: SVGRectElement[];
};

export const interpolateAcrossStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    let gen = 0;

    function drawStatic(scene: InterpolateAcrossScene): Handles {
      svg.textContent = '';
      const lay = layoutOf(scene);
      const { s, X, Y } = lay;
      const handles: Handles = {
        cellRects: [],
        cellTexts: [],
        marks: document.createElementNS(SVG, 'g'),
        front: null,
        drop: null,
        spokes: [],
        bars: [],
      };
      const step = scene.step;

      // 캡션 — 지금 일어나는 일만
      let caption = '';
      if (scene.cells) {
        if (step.kind === 'start') {
          caption = t('caption.start', 'Only the three corners have a color · Inside pixels: {n}', { n: scene.cells.length });
        } else if (step.kind === 'pour') {
          const v = scene.vertices[step.vertex];
          if (!v) throw new Error(`interpolate-across-stage: 꼭짓점 ${step.vertex} 가 없다`);
          caption = t('caption.pour', 'Corner {v} pours its color into every inside pixel, weighted by its share', { v: v.id });
        } else {
          const cell = scene.cells[step.cell];
          if (!cell) throw new Error(`interpolate-across-stage: 칸 ${step.cell} 이 없다`);
          caption = t('caption.probe', 'Reading pixel ({c}, {r}) · center ({x}, {y})', {
            c: cell.c,
            r: cell.r,
            x: fmt(step.x, 1),
            y: fmt(step.y, 1),
          });
        }
      }
      label(svg, PAD, 28, caption, { fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md });

      // 격자 — 바깥 칸은 옅은 바탕, 안쪽 칸은 지금까지 부은 색
      const inside = new Map<string, number>();
      scene.cells?.forEach((cell, i) => inside.set(`${cell.c},${cell.r}`, i));
      const grid = el('g', {}, svg);
      for (let r = 0; r < scene.height; r += 1) {
        for (let c = 0; c < scene.width; c += 1) {
          if (inside.has(`${c},${r}`)) continue;
          el('rect', { x: round(X(c)), y: round(Y(r)), width: round(s), height: round(s), fill: colors.bgSubtle, stroke: colors.border, 'stroke-width': 1 }, grid);
        }
      }
      // 몫 글자는 삼각형 선 위에 얹는다 — 아래 붙이기는 삼각형을 그린 뒤
      const numbers = document.createElementNS(SVG, 'g');
      if (scene.cells && scene.colors) {
        for (const [i, cell] of scene.cells.entries()) {
          const col = scene.colors[i];
          if (!col) throw new Error(`interpolate-across-stage: 칸 ${i} 의 색이 없다`);
          handles.cellRects.push(
            el('rect', { x: round(X(cell.c)), y: round(Y(cell.r)), width: round(s), height: round(s), fill: fillOf(col), stroke: colors.border, 'stroke-width': 1 }, grid),
          );
          if (step.kind === 'pour') {
            const share = step.shares[i];
            if (share === undefined) throw new Error(`interpolate-across-stage: 칸 ${i} 의 몫이 없다`);
            handles.cellTexts.push(
              label(numbers, X(cell.c + 0.5), Y(cell.r + 0.5) + 4, fmt(share, 2), {
                fill: inkOn(col),
                'font-family': fonts.mono,
                'font-size': fontSizes.xs,
                'text-anchor': 'middle',
              }),
            );
          }
        }
      }

      // 삼각형
      const [A, B, C] = scene.vertices;
      if (!A || !B || !C) throw new Error('interpolate-across-stage: 꼭짓점이 셋이 아니다');
      el('polygon', {
        points: [A, B, C].map((v) => `${round(X(v.x))},${round(Y(v.y))}`).join(' '),
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 1.5,
        'stroke-linejoin': 'round',
      }, svg);

      svg.appendChild(numbers);

      // 머무는 강조 — 가장 짙은 칸 · 가장 옅은 칸 · 읽는 칸
      svg.appendChild(handles.marks);
      if (scene.cells && step.kind === 'pour') {
        const hi = scene.cells[step.strongest];
        const lo = scene.cells[step.faintest];
        if (!hi || !lo) throw new Error('interpolate-across-stage: 가장 짙은 · 옅은 칸이 안쪽에 없다');
        el('rect', { x: round(X(hi.c) + 1.5), y: round(Y(hi.r) + 1.5), width: round(s - 3), height: round(s - 3), fill: 'none', stroke: colors.accent, 'stroke-width': 3 }, handles.marks);
        el('rect', { x: round(X(lo.c) + 1.5), y: round(Y(lo.r) + 1.5), width: round(s - 3), height: round(s - 3), fill: 'none', stroke: colors.accent, 'stroke-width': 2.5, 'stroke-dasharray': '4 3' }, handles.marks);
      }
      if (scene.cells && step.kind === 'probe') {
        const cell = scene.cells[step.cell];
        if (!cell) throw new Error(`interpolate-across-stage: 칸 ${step.cell} 이 없다`);
        el('rect', { x: round(X(cell.c) + 1.5), y: round(Y(cell.r) + 1.5), width: round(s - 3), height: round(s - 3), fill: 'none', stroke: colors.accent, 'stroke-width': 3 }, svg);
        for (const v of scene.vertices) {
          handles.spokes.push(
            el('line', { x1: round(X(v.x)), y1: round(Y(v.y)), x2: round(X(step.x)), y2: round(Y(step.y)), stroke: colors.text, 'stroke-width': 1.5, 'stroke-dasharray': '5 3' }, svg),
          );
        }
        el('circle', { cx: round(X(step.x)), cy: round(Y(step.y)), r: 3.5, fill: colors.text, stroke: colors.bg, 'stroke-width': 1.5 }, svg);
      }

      // 꼭짓점 — 제 색의 점과 이름
      const cx = (A.x + B.x + C.x) / 3;
      const cy = (A.y + B.y + C.y) / 3;
      for (const [k, v] of scene.vertices.entries()) {
        const current = step.kind === 'pour' && step.vertex === k;
        el('circle', { cx: round(X(v.x)), cy: round(Y(v.y)), r: current ? 10 : 8, fill: fillOf(v.color), stroke: current ? colors.accent : colors.text, 'stroke-width': current ? 3 : 1.5 }, svg);
        const dx = v.x - cx;
        const dy = v.y - cy;
        const len = Math.hypot(dx, dy);
        if (len === 0) throw new Error('interpolate-across-stage: 꼭짓점이 무게중심과 겹친다');
        label(svg, X(v.x) + (dx / len) * 20, Y(v.y) + (dy / len) * 20 + 5, v.id, {
          fill: colors.text,
          stroke: colors.bg,
          'stroke-width': 3,
          'paint-order': 'stroke',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 700,
          'text-anchor': 'middle',
        });
      }

      // 오른쪽 판 — 꼭짓점 색 셋
      const { px, pw } = lay;
      label(svg, px, TOP + 6, t('label.corners', 'Corner colors'), { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm });
      for (const [k, v] of scene.vertices.entries()) {
        const at = swatchCenter(lay, k);
        const current = step.kind === 'pour' && step.vertex === k;
        el('rect', { x: at.x - 14, y: at.y - 14, width: 28, height: 28, rx: 4, fill: fillOf(v.color), stroke: current ? colors.accent : colors.border, 'stroke-width': current ? 3 : 1 }, svg);
        label(svg, at.x + 24, at.y - 1, v.id, { fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 700 });
        label(svg, at.x + 42, at.y - 1, `(${v.color.map((x) => fmt(x, 2)).join(', ')})`, { fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
        if (k < scene.poured) {
          label(svg, at.x + 24, at.y + 13, t('label.poured', 'poured'), { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
        }
      }

      const infoY = swatchCenter(lay, scene.vertices.length).y;
      if (scene.cells && step.kind === 'pour') {
        const v = scene.vertices[step.vertex];
        const hi = scene.cells[step.strongest];
        const lo = scene.cells[step.faintest];
        const hiShare = step.shares[step.strongest];
        const loShare = step.shares[step.faintest];
        if (!v || !hi || !lo || hiShare === undefined || loShare === undefined) {
          throw new Error('interpolate-across-stage: 붓는 걸음의 칸 · 몫이 없다');
        }
        const text = { fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm };
        label(svg, px, infoY, t('label.shareOf', 'In pixels: share of {v}', { v: v.id }), { ...text, fill: colors.textMuted });
        el('rect', { x: px, y: infoY + 12, width: 14, height: 14, fill: 'none', stroke: colors.accent, 'stroke-width': 3 }, svg);
        label(svg, px + 22, infoY + 24, t('label.strongest', 'Strongest ({c}, {r}): {w}', { c: hi.c, r: hi.r, w: fmt(hiShare, 2) }), text);
        el('rect', { x: px, y: infoY + 36, width: 14, height: 14, fill: 'none', stroke: colors.accent, 'stroke-width': 2.5, 'stroke-dasharray': '4 3' }, svg);
        label(svg, px + 22, infoY + 48, t('label.faintest', 'Faintest ({c}, {r}): {w}', { c: lo.c, r: lo.r, w: fmt(loShare, 2) }), text);
      }

      if (step.kind === 'probe') {
        // 세 몫을 한 막대에 잇는다 — 길이의 합이 1
        const barY = infoY + 16;
        const barW = pw;
        label(svg, px, barY - 8, t('label.weights', 'Shares'), { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.sm });
        let x0 = px;
        for (const [k, v] of scene.vertices.entries()) {
          const w = step.weights[k];
          if (w === undefined) throw new Error(`interpolate-across-stage: 몫 ${k} 가 없다`);
          const width = barW * w;
          handles.bars.push(el('rect', { x: round(x0), y: barY, width: round(width), height: 22, fill: fillOf(v.color), stroke: colors.border, 'stroke-width': 1 }, svg));
          label(svg, x0 + width / 2, barY + 38, v.id, { fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm, 'font-weight': 700, 'text-anchor': 'middle' });
          label(svg, x0 + width / 2, barY + 52, fmt(w, 2), { fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'middle' });
          x0 += width;
        }
        const sumY = barY + 74;
        label(svg, px, sumY, t('label.sum', 'Sum: {v}', { v: fmt(step.sum, 2) }), { fill: colors.text, 'font-family': fonts.body, 'font-size': fontSizes.sm });
        const mixY = sumY + 14;
        el('rect', { x: px, y: mixY, width: 36, height: 36, rx: 4, fill: fillOf(step.color), stroke: colors.accent, 'stroke-width': 3 }, svg);
        label(svg, px + 46, mixY + 14, t('label.mix', 'Mixed color'), { fill: colors.textMuted, 'font-family': fonts.body, 'font-size': fontSizes.xs });
        label(svg, px + 46, mixY + 30, `(${step.color.map((x) => fmt(x, 2)).join(', ')})`, { fill: colors.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs });
      }

      return handles;
    }

    function sleepFrame(): Promise<void> {
      return new Promise((resolve) => {
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
    }

    /** 한 시계로 0 → 1 을 흘린다. 끊기면 거짓. */
    async function tween(ms: number, mine: number, onFrame: (u: number) => void): Promise<boolean> {
      const start = Date.now();
      for (;;) {
        if (mine !== gen || destroyed) return false;
        const u = Math.min(1, (Date.now() - start) / ms);
        onFrame(u);
        if (u >= 1) return true;
        await sleepFrame();
      }
    }

    async function animatePour(scene: InterpolateAcrossScene, handles: Handles, mine: number): Promise<boolean> {
      const step = scene.step;
      if (step.kind !== 'pour' || !scene.cells) throw new Error('interpolate-across-stage: 붓는 걸음이 아니다');
      const cells = scene.cells;
      const lay = layoutOf(scene);
      const v = scene.vertices[step.vertex];
      if (!v) throw new Error(`interpolate-across-stage: 꼭짓점 ${step.vertex} 가 없다`);
      if (handles.cellRects.length !== cells.length || handles.cellTexts.length !== cells.length) {
        throw new Error('interpolate-across-stage: 칸 손잡이 수가 안쪽 칸 수와 다르다');
      }
      // 아직 못 온 만큼 — 붓기 전 색으로 되돌리고 몫 글자와 강조를 감춘다
      const before = step.was;
      handles.cellRects.forEach((rect, i) => {
        const was = before[i];
        if (!was) throw new Error(`interpolate-across-stage: 칸 ${i} 의 붓기 전 색이 없다`);
        rect.setAttribute('fill', fillOf(was));
      });
      for (const text of handles.cellTexts) text.setAttribute('visibility', 'hidden');
      handles.marks.setAttribute('visibility', 'hidden');

      // 방울이 판에서 꼭짓점으로 옮겨 간다
      const from = swatchCenter(lay, step.vertex);
      const to = { x: lay.X(v.x), y: lay.Y(v.y) };
      const drop = el('circle', { cx: from.x, cy: from.y, r: 9, fill: fillOf(v.color), stroke: colors.accent, 'stroke-width': 2 }, svg);
      handles.drop = drop;
      const moved = await tween(DROP_MS, mine, (u) => {
        const e = 1 - (1 - u) * (1 - u);
        drop.setAttribute('cx', String(round(from.x + (to.x - from.x) * e)));
        drop.setAttribute('cy', String(round(from.y + (to.y - from.y) * e)));
      });
      if (!moved) return false;
      drop.remove();
      handles.drop = null;

      // 몫이 같은 선이 꼭짓점(1)에서 맞은편 모서리(0)로 쓸려 간다
      const front = el('line', { stroke: colors.accent, 'stroke-width': 3, 'stroke-linecap': 'round' }, svg);
      handles.front = front;
      const lit = new Array<boolean>(cells.length).fill(false);
      const spread = await tween(SPREAD_MS, mine, (u) => {
        const level = 1 - u;
        const [p, q] = levelSegment(scene.vertices, step.vertex, level);
        front.setAttribute('x1', String(round(lay.X(p.x))));
        front.setAttribute('y1', String(round(lay.Y(p.y))));
        front.setAttribute('x2', String(round(lay.X(q.x))));
        front.setAttribute('y2', String(round(lay.Y(q.y))));
        for (const [i, share] of step.shares.entries()) {
          if (lit[i] || share < level) continue;
          lit[i] = true;
          const col = scene.colors?.[i];
          if (!col) throw new Error(`interpolate-across-stage: 칸 ${i} 의 색이 없다`);
          handles.cellRects[i]!.setAttribute('fill', fillOf(col));
          handles.cellTexts[i]!.removeAttribute('visibility');
        }
      });
      return spread;
    }

    async function animateProbe(scene: InterpolateAcrossScene, handles: Handles, mine: number): Promise<boolean> {
      const step = scene.step;
      if (step.kind !== 'probe') throw new Error('interpolate-across-stage: 읽는 걸음이 아니다');
      if (handles.spokes.length !== scene.vertices.length || handles.bars.length !== scene.vertices.length) {
        throw new Error('interpolate-across-stage: 읽는 걸음의 손잡이가 모자라다');
      }
      const lay = layoutOf(scene);
      return tween(PROBE_MS, mine, (u) => {
        const a = Math.min(1, u / 0.5);
        const b = Math.max(0, (u - 0.5) / 0.5);
        for (const [k, v] of scene.vertices.entries()) {
          // 꼭짓점에서 칸 중심으로 선이 뻗는다
          handles.spokes[k]!.setAttribute('x2', String(round(lay.X(v.x + (step.x - v.x) * a))));
          handles.spokes[k]!.setAttribute('y2', String(round(lay.Y(v.y + (step.y - v.y) * a))));
          // 막대가 몫의 길이만큼 자란다
          handles.bars[k]!.setAttribute('width', String(round(lay.pw * step.weights[k]! * b)));
        }
      });
    }

    async function render(next: InterpolateAcrossScene, prev: InterpolateAcrossScene | null, opts: { animate: boolean }): Promise<void> {
      const mine = (gen += 1);
      if (destroyed) return;
      const handles = drawStatic(next);
      if (!opts.animate || !prev) return;
      const step = next.step;
      let done = true;
      if (step.kind === 'pour' && prev.poured !== next.poured) done = await animatePour(next, handles, mine);
      else if (step.kind === 'probe' && prev.step.kind !== 'probe') done = await animateProbe(next, handles, mine);
      if (!done || mine !== gen || destroyed) return;
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
