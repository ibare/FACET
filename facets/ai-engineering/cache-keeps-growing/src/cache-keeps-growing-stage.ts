/**
 * cache-keeps-growing 무대 — 자리 하나가 모든 층에 K 줄 · V 줄을 하나씩 얹고,
 * 자리가 늘면 그 줄들이 켜로 떨어져 캐시 통 안에 쌓인다.
 *
 * - 위: 자리 하나의 줄 (층마다 K 칸 · V 칸). 원본은 늘 그 자리에 남는다
 * - 아래: 캐시 통. 세로가 자리 수에 비례하고 꼭대기가 문맥 한도다
 * - 걸음마다 원본의 복제가 떨어지며 그 걸음이 더한 자리 수만큼 늘어나 켜로 앉는다.
 *   켜는 걷히지 않는다
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
  type SceneRenderer,
  type Translate,
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { CacheBase, CacheLayer, CacheScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const H = 448;

/** 좌우 여백 — 왼쪽은 자리 수, 오른쪽은 바이트 글자가 선다. */
const LEFT = 72;
const RIGHT = 116;

const UNIT_Y = 44;
const UNIT_H = 20;
const TANK_TOP = 128;
const TANK_BOT = 392;
/** 한 자리짜리 켜는 통 축척으로 1 px 에 못 미친다. 보이게만 한다. */
const MIN_LAYER_H = 1.5;
const CAPTION_A_Y = 418;
const CAPTION_B_Y = 436;

const DROP_IN_MS = 700;
const FALL_MS = 800;
const TICK_MS = 16;

function r(v: number): number {
  const out = Math.round(v * 100) / 100;
  return out === 0 ? 0 : out;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

/** 떨어지는 것 — 끝으로 갈수록 빨라진다. */
function easeIn(p: number): number {
  return p * p;
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

type Geometry = {
  x0: number;
  x1: number;
  pairW: number;
  yOf(n: number): number;
};

function geometry(base: CacheBase): Geometry {
  const x0 = LEFT;
  const x1 = PIECE_CANVAS_W - RIGHT;
  const pairW = (x1 - x0) / base.layers;
  const tankH = TANK_BOT - TANK_TOP;
  return {
    x0,
    x1,
    pairW,
    yOf: (n) => TANK_BOT - (n / base.limit) * tankH,
  };
}

/** 켜 하나의 세로 자리. 너무 얇으면 바닥에 붙여 최소 두께를 준다. */
function layerBox(g: Geometry, layer: CacheLayer): { top: number; h: number } {
  const bottom = g.yOf(layer.from);
  const h = Math.max(bottom - g.yOf(layer.to), MIN_LAYER_H);
  return { top: bottom - h, h };
}

export const cacheKeepsGrowingStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance & SceneRenderer<CacheScene> {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const [colorK, colorV] = categorical(2, 'vivid');

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function unitName(k: number): string {
      if (k === 3) return t('unit.GiB', 'GiB');
      if (k === 2) return t('unit.MiB', 'MiB');
      if (k === 1) return t('unit.KiB', 'KiB');
      return t('unit.B', 'B');
    }

    /** 1024 진법. 값이 1 이상인 가장 큰 단위, 소수 한 자리, 끝의 .0 은 뗀다. */
    function sizeText(bytes: number): string {
      let k = 0;
      while (k < 3 && bytes >= 1024 ** (k + 1)) k += 1;
      const rounded = Math.round((bytes / 1024 ** k) * 10) / 10;
      const value = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
      return t('size', '{value} {unit}', { value, unit: unitName(k) });
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      str: string,
      opts: { anchor?: string; fill?: string; size?: string; mono?: boolean; weight?: string } = {},
    ): SVGTextElement {
      const node = el(parent, 'text', {
        x: r(x),
        y: r(y),
        'text-anchor': opts.anchor ?? 'start',
        'dominant-baseline': 'middle',
        fill: opts.fill ?? colors.text,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
      });
      if (opts.weight) node.setAttribute('font-weight', opts.weight);
      node.textContent = str;
      return node;
    }

    /** 층마다 K 칸 · V 칸. 높이 1 짜리로 그려 두고 바깥 변환으로 늘린다. */
    function laneCells(parent: Element, g: Geometry, layers: number): void {
      const half = g.pairW / 2;
      for (let l = 0; l < layers; l += 1) {
        const x = g.x0 + l * g.pairW;
        el(parent, 'rect', { x: r(x + 0.5), y: 0, width: r(half - 0.5), height: 1, fill: colorK });
        el(parent, 'rect', { x: r(x + half), y: 0, width: r(half - 0.5), height: 1, fill: colorV });
      }
    }

    type Handles = {
      unitCells: SVGGElement[];
      newest: { body: SVGGElement; outline: SVGRectElement; labels: SVGTextElement[] } | null;
      g: Geometry;
    };

    function drawStatic(scene: CacheScene): Handles | null {
      svg.textContent = '';
      const base = scene.base;
      if (!base) return null;
      const g = geometry(base);

      // 자리 하나의 줄 — 원본. 층마다 K 칸 · V 칸.
      text(svg, g.x0, UNIT_Y - 10, t('label.layerFirst', 'layer 1'), { fill: colors.textMuted });
      text(svg, g.x1, UNIT_Y - 10, t('label.layerLast', 'layer {n}', { n: base.layers }), {
        anchor: 'end',
        fill: colors.textMuted,
      });
      // 줄 위 가운데 — 왼쪽 여백에 두면 긴 언어가 캔버스 밖으로 잘린다.
      text(svg, (g.x0 + g.x1) / 2, UNIT_Y - 10, t('label.onePosition', 'one position'), {
        anchor: 'middle',
      });
      text(svg, g.x1 + 8, UNIT_Y + UNIT_H / 2, sizeText(base.perPosition), {
        mono: true,
        weight: '600',
      });
      const unitCells: SVGGElement[] = [];
      const half = g.pairW / 2;
      for (let l = 0; l < base.layers; l += 1) {
        const cell = el(svg, 'g', {});
        const x = g.x0 + l * g.pairW;
        el(cell, 'rect', { x: r(x + 0.5), y: UNIT_Y, width: r(half - 0.5), height: UNIT_H, fill: colorK });
        el(cell, 'rect', { x: r(x + half), y: UNIT_Y, width: r(half - 0.5), height: UNIT_H, fill: colorV });
        unitCells.push(cell);
      }
      // 범례
      const legendY = UNIT_Y + UNIT_H + 14;
      el(svg, 'rect', { x: g.x0, y: legendY - 5, width: 10, height: 10, fill: colorK });
      text(svg, g.x0 + 14, legendY, t('label.k', 'K'), { fill: colors.textMuted });
      el(svg, 'rect', { x: g.x0 + 34, y: legendY - 5, width: 10, height: 10, fill: colorV });
      text(svg, g.x0 + 48, legendY, t('label.v', 'V'), { fill: colors.textMuted });

      // 캐시 통
      text(svg, g.x0 - 8, TANK_TOP - 20, t('label.positions', 'positions'), {
        anchor: 'end',
        fill: colors.textMuted,
      });
      text(svg, g.x1 + 8, TANK_TOP - 20, t('label.cache', 'cache'), { fill: colors.textMuted });
      el(svg, 'rect', {
        x: g.x0,
        y: TANK_TOP,
        width: r(g.x1 - g.x0),
        height: TANK_BOT - TANK_TOP,
        fill: colors.bgSubtle,
        stroke: colors.border,
      });
      el(svg, 'line', {
        x1: g.x0,
        y1: TANK_TOP,
        x2: g.x1,
        y2: TANK_TOP,
        stroke: colors.textMuted,
        'stroke-dasharray': '4 3',
      });
      text(svg, (g.x0 + g.x1) / 2, TANK_TOP - 8, t('label.limit', 'context limit {n}', { n: base.limit }), {
        anchor: 'middle',
        fill: colors.textMuted,
      });

      // 켜 — 앞의 것이 위에 오도록 뒤에서부터 붙인다 (한 자리 켜가 가려지지 않게).
      let newest: Handles['newest'] = null;
      const lastIdx = scene.stack.length - 1;
      for (let i = lastIdx; i >= 0; i -= 1) {
        const layer = scene.stack[i]!;
        const box = layerBox(g, layer);
        const body = el(svg, 'g', { transform: `translate(0,${r(box.top)}) scale(1,${r(box.h)})` });
        laneCells(body, g, base.layers);
        const outline = el(svg, 'rect', {
          x: g.x0,
          y: r(box.top),
          width: r(g.x1 - g.x0),
          height: r(box.h),
          fill: 'none',
          stroke: i === lastIdx ? colors.accent : colors.border,
          'stroke-width': i === lastIdx ? 2 : 1,
        });
        if (i === lastIdx) newest = { body, outline, labels: [] };
      }
      // 켜의 윗면마다 자리 수와 누적 바이트
      for (let i = 0; i <= lastIdx; i += 1) {
        const layer = scene.stack[i]!;
        const y = layerBox(g, layer).top;
        const isNew = i === lastIdx;
        const a = text(svg, g.x0 - 8, y, String(layer.to), {
          anchor: 'end',
          mono: true,
          weight: isNew ? '600' : undefined,
        });
        const b = text(svg, g.x1 + 8, y, sizeText(layer.bytes), {
          mono: true,
          weight: isNew ? '600' : undefined,
        });
        if (isNew && newest) newest.labels.push(a, b);
      }

      // 캡션 — 이번 걸음이 한 일
      const last = scene.stack[lastIdx];
      if (last) {
        if (last.from === 0) {
          text(
            svg,
            PIECE_CANVAS_W / 2,
            CAPTION_A_Y,
            t('caption.unitFormula', 'K and V 2 × {layers} layers × {heads} heads × {dim} dims × {bytes} bytes each', {
              layers: base.layers,
              heads: base.kvHeads,
              dim: base.headDim,
              bytes: base.valueBytes,
            }),
            { anchor: 'middle', size: fontSizes.sm },
          );
          text(
            svg,
            PIECE_CANVAS_W / 2,
            CAPTION_B_Y,
            t('caption.unitTotal', '= {total} bytes for one position, {size}', {
              total: last.bytes,
              size: sizeText(last.bytes),
            }),
            { anchor: 'middle', size: fontSizes.sm, weight: '600' },
          );
        } else {
          const vars = { from: last.from, to: last.to, added: last.to - last.from };
          const lineA =
            last.to >= base.limit
              ? t('caption.growFull', 'Positions {from} → {to}, the context limit. Every layer gains {added} more K and V rows.', vars)
              : t('caption.grow', 'Positions {from} → {to}. Every layer gains {added} more K and V rows.', vars);
          text(svg, PIECE_CANVAS_W / 2, CAPTION_A_Y, lineA, { anchor: 'middle', size: fontSizes.sm });
          text(
            svg,
            PIECE_CANVAS_W / 2,
            CAPTION_B_Y,
            t('caption.cache', 'Cache {size} ({total} bytes), still {per} per position', {
              size: sizeText(last.bytes),
              total: last.bytes,
              per: sizeText(last.perPosition),
            }),
            { anchor: 'middle', size: fontSizes.sm, weight: '600' },
          );
        }
      }
      return { unitCells, newest, g };
    }

    /** 한 시계. 끝나거나 거둬지면 풀린다. */
    function clock(ms: number, mine: number, frame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) return finish();
          const p = clamp01((Date.now() - start) / ms);
          frame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, TICK_MS);
          timers.add(id);
        };
        tick();
      });
    }

    function placeNewest(h: Handles, top: number, height: number): void {
      if (!h.newest) return;
      h.newest.body.setAttribute('transform', `translate(0,${r(top)}) scale(1,${r(height)})`);
      h.newest.outline.setAttribute('y', String(r(top)));
      h.newest.outline.setAttribute('height', String(r(height)));
    }

    async function animateGrow(scene: CacheScene, h: Handles, mine: number): Promise<void> {
      const base = scene.base!;
      const layer = scene.stack[scene.stack.length - 1]!;
      const box = layerBox(h.g, layer);
      const newest = h.newest;
      if (!newest) return;
      for (const lab of newest.labels) lab.setAttribute('opacity', '0');

      // 첫 걸음: 자리 하나의 줄이 층마다 위에서 내려와 앉는다 (K 한 줄 · V 한 줄).
      if (layer.from === 0) {
        newest.body.setAttribute('visibility', 'hidden');
        newest.outline.setAttribute('visibility', 'hidden');
        const stagger = 0.6 / base.layers;
        const fall = UNIT_Y + UNIT_H;
        await clock(DROP_IN_MS, mine, (p) => {
          h.unitCells.forEach((cell, l) => {
            const q = easeOut(clamp01((p - l * stagger) / 0.4));
            cell.setAttribute('transform', `translate(0,${r(-(1 - q) * fall)})`);
          });
        });
        if (destroyed || mine !== gen) return;
        for (const cell of h.unitCells) cell.removeAttribute('transform');
        newest.body.removeAttribute('visibility');
        newest.outline.removeAttribute('visibility');
      }

      // 복제가 원본 자리에서 떨어져 통 안에 켜로 앉는다. 떨어지며 더한 자리만큼 두꺼워진다.
      await clock(FALL_MS, mine, (p) => {
        const q = easeIn(p);
        const top = UNIT_Y + (box.top - UNIT_Y) * q;
        const height = UNIT_H + (box.h - UNIT_H) * q;
        placeNewest(h, top, height);
      });
    }

    const renderer: ViewInstance & SceneRenderer<CacheScene> = {
      async render(next, prev, opts) {
        const mine = (gen += 1);
        const handles = drawStatic(next);
        if (!opts.animate || !handles || !next.step) return;
        if (prev && prev.stack.length === next.stack.length) return;
        await animateGrow(next, handles, mine);
        if (destroyed || mine !== gen) return;
        drawStatic(next);
      },
      destroy() {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return renderer;
  },
};
