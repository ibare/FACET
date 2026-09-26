/**
 * field-grows-with-depth stage — 층 넷을 왼쪽(입력)부터 오른쪽(맨 위 층)으로 한 줄에 세운다.
 *
 * 격자는 모두 같은 가로 중심선에 가운데 맞춘다. 창이 3×3 · 보폭 1 이면 위 층의 칸 (r, c) 은
 * 아래 층 창의 가운데 칸 (r+1, c+1) 과 같은 높이에 선다 — 번짐이 "사방으로 한 칸" 으로 읽힌다.
 *
 * 걸음의 운동: 위 층에서 기대는 범위를 본뜬 판이 왼쪽 아래 층으로 건너가(①) 그 층에서
 * 사방으로 한 칸씩 넓어진다(②). 위 층의 범위는 그대로 남는다 — 원본은 남고 본뜬 판이 움직인다.
 */
import {
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { FieldGrowsWithDepthScene, FieldLayer, FieldRegion } from './scene.js';

const H = 280;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PAD_X = 20;
/** 층 사이 틈 — 칸 몇 개 폭인가 */
const GAP_CELLS = 3;
const CELL_MAX = 30;
const NAME_Y = 16;
/** 층 사이 창 글자의 둘째 줄 — 한 변 글자 줄 아래 */
const WINDOW_LINE = 13;
const GRID_TOP = 32;
const CAPTION_Y1 = H - 22;
const SIZE_GAP = 16;
const MOVE_MS = 700;
/** 운동 가운데 건너가는 몫 — 나머지는 넓어지는 몫 */
const CROSS_SHARE = 0.45;

type Rect = { x: number; y: number; w: number; h: number };

type Layout = {
  cell: number;
  midY: number;
  bottomY: number;
  gridX: number[];
  gridY: number[];
};

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function layout(layers: FieldLayer[]): Layout {
  const sizes = layers.map((l) => l.size);
  const maxSize = Math.max(...sizes);
  const units = sizes.reduce((a, b) => a + b, 0) + GAP_CELLS * (sizes.length - 1);
  const availW = PIECE_CANVAS_W - PAD_X * 2;
  const availH = CAPTION_Y1 - 28 - SIZE_GAP - WINDOW_LINE - GRID_TOP;
  const cell = Math.min(CELL_MAX, availW / units, availH / maxSize);
  const x0 = (PIECE_CANVAS_W - units * cell) / 2;
  const midY = GRID_TOP + (maxSize * cell) / 2;
  const gridX: number[] = [];
  const gridY: number[] = [];
  let acc = 0;
  for (const size of sizes) {
    gridX.push(x0 + acc * cell);
    gridY.push(midY - (size * cell) / 2);
    acc += size + GAP_CELLS;
  }
  return { cell, midY, bottomY: midY + (maxSize * cell) / 2, gridX, gridY };
}

/** 층 번호로 자리를 꺼낸다 — 없는 층은 던진다 */
function at(list: number[], i: number): number {
  const v = list[i];
  if (v === undefined) throw new Error(`field-grows-with-depth stage: 층 ${i} 의 자리가 없다`);
  return v;
}

function regionRect(lay: Layout, layer: number, reg: FieldRegion): Rect {
  const gx = at(lay.gridX, layer);
  const gy = at(lay.gridY, layer);
  return {
    x: gx + reg.c0 * lay.cell,
    y: gy + reg.r0 * lay.cell,
    w: (reg.c1 - reg.c0 + 1) * lay.cell,
    h: (reg.r1 - reg.r0 + 1) * lay.cell,
  };
}

function inRegion(reg: FieldRegion | null, r: number, c: number): boolean {
  return reg !== null && r >= reg.r0 && r <= reg.r1 && c >= reg.c0 && c <= reg.c1;
}

/** 위 범위의 왼쪽 변에서 아래 범위의 오른쪽 변으로 — 기대는 자리가 번져 나간 부채꼴 */
function conePoints(upper: Rect, lower: Rect): string {
  const pts: [number, number][] = [
    [upper.x, upper.y],
    [lower.x + lower.w, lower.y],
    [lower.x + lower.w, lower.y + lower.h],
    [upper.x, upper.y + upper.h],
  ];
  return pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

function lerpRect(a: Rect, b: Rect, u: number): Rect {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), w: lerp(a.w, b.w, u), h: lerp(a.h, b.h, u) };
}

function ease(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

export const fieldGrowsWithDepthStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const fontXs = parseFloat(fontSizes.xs);
    const fontSm = parseFloat(fontSizes.sm);
    const fontMd = parseFloat(fontSizes.md);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      }
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      content: string,
      size: number,
      fill: string,
      weight = 400,
    ): void {
      const node = el(
        'text',
        {
          x,
          y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': size,
          'font-weight': weight,
          fill,
        },
        parent,
      );
      node.textContent = content;
    }

    function layerName(layers: FieldLayer[], i: number): string {
      const id = layers[i]?.id;
      if (id === 'input') return t('label.input', 'Input');
      if (id === 'layer1') return t('label.layer1', 'Layer 1');
      if (id === 'layer2') return t('label.layer2', 'Layer 2');
      if (id === 'layer3') return t('label.layer3', 'Layer 3');
      throw new Error(`field-grows-with-depth stage: 층 식별자 ${String(id)} 의 이름이 없다`);
    }

    /**
     * 장면 전체를 세운다. `hold` 층은 기대는 범위와 그 부채꼴을 비워 둔다 — 운동이 채운다.
     */
    function drawStatic(scene: FieldGrowsWithDepthScene, hold: number | null = null): Layout | null {
      svg.textContent = '';
      const base = scene.base;
      if (base === null) return null;
      const lay = layout(base.layers);
      const step = scene.step;
      const current = step?.layer ?? null;

      // 부채꼴 — 이미 닿은 이웃 두 층 사이
      const cones = el('g', {}, svg);
      for (let i = 0; i + 1 < base.layers.length; i += 1) {
        const lower = scene.regions[i] ?? null;
        const upper = scene.regions[i + 1] ?? null;
        if (lower === null || upper === null || i === hold) continue;
        el(
          'polygon',
          {
            points: conePoints(regionRect(lay, i + 1, upper), regionRect(lay, i, lower)),
            fill: colors.accent,
            'fill-opacity': 0.2,
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-linejoin': 'round',
          },
          cones,
        );
      }

      // 격자
      const grids = el('g', {}, svg);
      base.layers.forEach((layer, i) => {
        const reg = i === hold ? null : (scene.regions[i] ?? null);
        const gx = at(lay.gridX, i);
        const gy = at(lay.gridY, i);
        for (let r = 0; r < layer.size; r += 1) {
          for (let c = 0; c < layer.size; c += 1) {
            const hit = inRegion(reg, r, c);
            el(
              'rect',
              {
                x: gx + c * lay.cell,
                y: gy + r * lay.cell,
                width: lay.cell,
                height: lay.cell,
                fill: hit ? colors.accent : colors.bgSubtle,
                'fill-opacity': hit && i !== current ? 0.45 : 1,
                stroke: colors.textMuted,
                'stroke-width': 0.75,
              },
              grids,
            );
          }
        }
        if (reg !== null) {
          const rr = regionRect(lay, i, reg);
          el(
            'rect',
            {
              x: rr.x,
              y: rr.y,
              width: rr.w,
              height: rr.h,
              fill: 'none',
              stroke: i === current ? colors.text : colors.textMuted,
              'stroke-width': i === current ? 2 : 1.25,
            },
            grids,
          );
        }
      });

      // 글자 — 층 이름 · 한 변 · 층 사이 창
      const labels = el('g', {}, svg);
      base.layers.forEach((layer, i) => {
        const cx = at(lay.gridX, i) + (layer.size * lay.cell) / 2;
        label(labels, cx, NAME_Y, layerName(base.layers, i), fontSm, i === current ? colors.text : colors.textMuted, i === current ? 700 : 400);
        label(labels, cx, lay.bottomY + SIZE_GAP, t('label.size', '{n} × {n}', { n: layer.size }), fontXs, colors.textMuted);
        const next = base.layers[i + 1];
        if (next !== undefined) {
          const gapL = cx + (layer.size * lay.cell) / 2;
          const gapR = at(lay.gridX, i + 1);
          const gx = (gapL + gapR) / 2;
          label(labels, gx, lay.bottomY + SIZE_GAP, t('label.window', 'window'), fontXs, colors.textMuted);
          label(labels, gx, lay.bottomY + SIZE_GAP + WINDOW_LINE, t('label.size', '{n} × {n}', { n: base.kernel }), fontXs, colors.textMuted);
        }
      });

      // 캡션 — 지금 일어나는 일
      if (step !== null) {
        const reg = scene.regions[step.layer] ?? null;
        if (reg === null) throw new Error(`field-grows-with-depth stage: 층 ${step.layer} 에 범위가 없다`);
        const name = layerName(base.layers, step.layer);
        const vars = { layer: name, side: reg.side, n: reg.count };
        if (step.kind === 'start') {
          label(labels, PIECE_CANVAS_W / 2, CAPTION_Y1, t('caption.start', 'Start in {layer}: {side} × {side} = {n}', vars), fontMd, colors.text, 600);
        } else {
          label(labels, PIECE_CANVAS_W / 2, CAPTION_Y1, t('caption.spread', 'Relied on in {layer}: {side} × {side} = {n}', vars), fontMd, colors.text, 600);
        }
      }
      return lay;
    }

    function tween(ms: number, frame: (u: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const begin = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || done) return finish();
          const u = Math.min(1, (Date.now() - begin) / ms);
          frame(u);
          if (u >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    async function render(
      next: FieldGrowsWithDepthScene,
      _prev: FieldGrowsWithDepthScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      if (destroyed) return;
      const mine = (gen += 1);
      const step = next.step;
      if (!opts.animate || step === null || step.kind !== 'spread') {
        drawStatic(next);
        return;
      }
      const upperReg = next.regions[step.from] ?? null;
      const lowerReg = next.regions[step.layer] ?? null;
      const lay = drawStatic(next, step.layer);
      if (lay === null || upperReg === null || lowerReg === null) {
        drawStatic(next);
        return;
      }
      const up = regionRect(lay, step.from, upperReg);
      const low = regionRect(lay, step.layer, lowerReg);
      // 본뜬 판 — 위 범위와 같은 크기로 아래 범위의 가운데에 앉는 자리
      const landed: Rect = { w: up.w, h: up.h, x: low.x + (low.w - up.w) / 2, y: low.y + (low.h - up.h) / 2 };

      const moving = el('g', {}, svg);
      const cone = el(
        'polygon',
        { points: conePoints(up, up), fill: colors.accent, 'fill-opacity': 0.2, stroke: colors.textMuted, 'stroke-width': 1, 'stroke-linejoin': 'round' },
        moving,
      );
      const plate = el(
        'rect',
        { x: up.x, y: up.y, width: up.w, height: up.h, fill: colors.accent, 'fill-opacity': 0.85, stroke: colors.text, 'stroke-width': 2 },
        moving,
      );

      await tween(MOVE_MS, (u) => {
        if (mine !== gen || destroyed) return;
        let r: Rect;
        if (u < CROSS_SHARE) {
          r = lerpRect(up, landed, ease(u / CROSS_SHARE));
        } else {
          r = lerpRect(landed, low, ease((u - CROSS_SHARE) / (1 - CROSS_SHARE)));
        }
        plate.setAttribute('x', String(round(r.x)));
        plate.setAttribute('y', String(round(r.y)));
        plate.setAttribute('width', String(round(r.w)));
        plate.setAttribute('height', String(round(r.h)));
        cone.setAttribute('points', conePoints(up, r));
      });
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
