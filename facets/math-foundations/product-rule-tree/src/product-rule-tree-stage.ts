/**
 * 곱의 법칙 무대 — 왼쪽 뿌리에서 오른쪽으로 갈래가 돋는 나무.
 *
 * 자리 하나를 고르는 걸음마다 지금의 끝(강조) 하나하나에서 그 자리의 선택지 수만큼
 * 새 끝이 부모 곁에서 밀려 나와 제 자리로 뻗는다. 모든 끝이 한 시계로 함께 돋는다.
 *
 * 끝의 세로 자리는 바탕(자리 목록)에서 정해진다 — 끝 하나는 맨 끝 층에서 거느리게 될
 * 끝들의 가운데에 선다. 그래서 한 번 선 끝은 다음 걸음에서 움직이지 않는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';
import { spanBelow, type ProductRuleTreeEnd } from './algorithm.js';
import type { ProductRuleTreeScene } from './scene.js';

const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MOVE_MS = 800;
const FRAME_MS = 16;
const MARGIN_X = 20;
const HEADER_LABEL_Y = 22;
const HEADER_SYMBOL_Y = 42;
const TREE_TOP = 60;
const CAPTION_Y = H - 18;
const TREE_BOTTOM = H - 48;
const ROW_MAX = 26;
const ROOT_R = 5;
const PILL_PAD_X = 6;

type Point = { x: number; y: number };

type Sprout = {
  group: SVGGElement;
  edge: SVGLineElement;
  /** 부모 오른쪽 끝 — 새 끝이 밀려 나오는 자리 */
  from: Point;
  /** 제 자리의 가운데 */
  to: Point;
  halfW: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const productRuleTreeStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const monoPx = parseFloat(fontSizes.sm);
    const charW = monoPx * 0.62;

    let gen = 0;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function placeLabel(index: number): string {
      switch (index) {
        case 0:
          return t('label.place1', 'First place');
        case 1:
          return t('label.place2', 'Second place');
        case 2:
          return t('label.place3', 'Third place');
        default:
          throw new Error(`product-rule-tree stage: 자리 ${index} 의 이름이 messages 에 없다`);
      }
    }

    function pillWidth(name: string): number {
      return name.length * charW + PILL_PAD_X * 2;
    }

    /** 층 d(0 = 뿌리)의 가로 자리 */
    function columnX(scene: ProductRuleTreeScene, d: number): number {
      const n = scene.places.length;
      // 맨 끝 층에서 가장 긴 이름 — 자리마다 가장 긴 기호를 이은 길이
      let lastLen = 0;
      for (const symbols of scene.places) lastLen += Math.max(...symbols.map((s) => s.length));
      const lastHalf = (lastLen * charW + PILL_PAD_X * 2) / 2;
      const x0 = MARGIN_X + ROOT_R;
      const xN = PIECE_CANVAS_W - MARGIN_X - lastHalf;
      return x0 + ((xN - x0) * d) / n;
    }

    function layout(scene: ProductRuleTreeScene): { rowH: number; top: number } {
      const leaves = spanBelow(scene.places, 0);
      const rowH = Math.min(ROW_MAX, (TREE_BOTTOM - TREE_TOP) / leaves);
      const top = TREE_TOP + (TREE_BOTTOM - TREE_TOP - rowH * leaves) / 2;
      return { rowH, top };
    }

    function endPoint(scene: ProductRuleTreeScene, d: number, i: number): Point {
      const { rowH, top } = layout(scene);
      const span = spanBelow(scene.places, d);
      return { x: round(columnX(scene, d)), y: round(top + (i * span + span / 2) * rowH) };
    }

    /** 끝의 오른쪽 가장자리 — 거기서 갈래가 나간다 */
    function rightEdge(scene: ProductRuleTreeScene, d: number, i: number, name: string): Point {
      const c = endPoint(scene, d, i);
      const half = d === 0 ? ROOT_R : pillWidth(name) / 2;
      return { x: round(c.x + half), y: c.y };
    }

    function text(
      parent: SVGElement,
      x: number,
      y: number,
      s: string,
      opts: { size: string; fill: string; family: string; weight?: number; anchor?: string },
    ): SVGTextElement {
      const node = el('text', {
        x: round(x),
        y: round(y),
        'font-size': opts.size,
        'font-family': opts.family,
        fill: opts.fill,
        'text-anchor': opts.anchor ?? 'middle',
        'dominant-baseline': 'central',
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = s;
      parent.appendChild(node);
      return node;
    }

    function drawHeaders(scene: ProductRuleTreeScene): void {
      const current = scene.step?.kind === 'branch' ? scene.step.place : -1;
      scene.places.forEach((symbols, p) => {
        const x = columnX(scene, p + 1);
        const on = p === current;
        text(svg, x, HEADER_LABEL_Y, placeLabel(p), {
          size: fontSizes.sm,
          family: fonts.body,
          fill: on ? colors.text : colors.textMuted,
          weight: on ? 700 : 400,
        });
        const gap = monoPx * 1.4;
        const start = x - ((symbols.length - 1) * gap) / 2;
        symbols.forEach((s, k) => {
          text(svg, start + k * gap, HEADER_SYMBOL_Y, s, {
            size: fontSizes.sm,
            family: fonts.mono,
            fill: on ? colors.text : colors.textMuted,
            weight: on ? 700 : 400,
          });
        });
      });
    }

    function drawEnd(
      scene: ProductRuleTreeScene,
      d: number,
      i: number,
      end: ProductRuleTreeEnd,
      frontier: boolean,
    ): { group: SVGGElement; halfW: number } {
      const c = endPoint(scene, d, i);
      const group = el('g', {});
      if (d === 0) {
        group.appendChild(
          el('circle', {
            cx: c.x,
            cy: c.y,
            r: ROOT_R,
            fill: frontier ? colors.accent : colors.bgSubtle,
            stroke: frontier ? colors.stateInk : colors.border,
            'stroke-width': 1.25,
          }),
        );
        svg.appendChild(group);
        return { group, halfW: ROOT_R };
      }
      const w = pillWidth(end.name);
      const h = Math.min(monoPx + 6, layout(scene).rowH - 2);
      group.appendChild(
        el('rect', {
          x: round(c.x - w / 2),
          y: round(c.y - h / 2),
          width: round(w),
          height: round(h),
          rx: round(h / 2),
          fill: frontier ? colors.accent : colors.bgSubtle,
          stroke: frontier ? colors.stateInk : colors.border,
          'stroke-width': frontier ? 1.25 : 1,
        }),
      );
      text(group, c.x, c.y, end.name, {
        size: fontSizes.sm,
        family: fonts.mono,
        fill: frontier ? colors.stateInk : colors.textMuted,
        weight: frontier ? 700 : 400,
      });
      svg.appendChild(group);
      return { group, halfW: w / 2 };
    }

    function caption(scene: ProductRuleTreeScene): string {
      const step = scene.step;
      if (step === null) return '';
      if (step.kind === 'start') {
        return t('caption.start', 'Nothing chosen yet. Ends: {n}', { n: step.ends });
      }
      return t('caption.branch', '{place}: ends {before} × {choices} = {after}', {
        place: placeLabel(step.place),
        before: step.before,
        choices: step.choices,
        after: step.after,
      });
    }

    /** 장면 전체를 세운다. 마지막 층(지금의 끝)의 손잡이를 돌려준다 */
    function drawStatic(scene: ProductRuleTreeScene): Sprout[] {
      svg.textContent = '';
      drawHeaders(scene);

      const lastDepth = scene.levels.length - 1;
      const edgeLayer = el('g', {});
      svg.appendChild(edgeLayer);
      const sprouts: Sprout[] = [];

      scene.levels.forEach((level, d) => {
        const frontier = d === lastDepth;
        level.forEach((end, i) => {
          let edge: SVGLineElement | null = null;
          let from: Point | null = null;
          if (d > 0) {
            const parentLevel = scene.levels[d - 1];
            const parent = parentLevel?.[end.parent];
            if (parent === undefined) {
              throw new Error(`product-rule-tree stage: 층 ${d} 의 끝 ${i} 의 부모 ${end.parent} 가 없다`);
            }
            from = rightEdge(scene, d - 1, end.parent, parent.name);
            const to = endPoint(scene, d, i);
            const half = pillWidth(end.name) / 2;
            edge = el('line', {
              x1: from.x,
              y1: from.y,
              x2: round(to.x - half),
              y2: to.y,
              stroke: frontier ? colors.text : colors.border,
              'stroke-width': frontier ? 1.5 : 1,
            });
            edgeLayer.appendChild(edge);
          }
          const drawn = drawEnd(scene, d, i, end, frontier);
          if (frontier && edge !== null && from !== null) {
            sprouts.push({
              group: drawn.group,
              edge,
              from,
              to: endPoint(scene, d, i),
              halfW: drawn.halfW,
            });
          }
        });
      });

      const words = caption(scene);
      if (words !== '') {
        text(svg, PIECE_CANVAS_W / 2, CAPTION_Y, words, {
          size: fontSizes.md,
          family: fonts.body,
          fill: colors.text,
        });
      }
      return sprouts;
    }

    /** 새 끝을 부모 곁에서 제 자리까지 p(0..1) 만큼 옮긴다 */
    function place(sprouts: Sprout[], p: number): void {
      const e = ease(p);
      for (const s of sprouts) {
        const startX = s.from.x + s.halfW;
        const cx = startX + (s.to.x - startX) * e;
        const cy = s.from.y + (s.to.y - s.from.y) * e;
        s.group.setAttribute('transform', `translate(${round(cx - s.to.x)} ${round(cy - s.to.y)})`);
        s.edge.setAttribute('x2', String(round(cx - s.halfW)));
        s.edge.setAttribute('y2', String(round(cy)));
      }
    }

    function wait(ms: number): Promise<void> {
      return new Promise((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
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

    async function sprout(next: ProductRuleTreeScene, mine: number): Promise<void> {
      const sprouts = drawStatic(next);
      if (sprouts.length === 0) {
        throw new Error('product-rule-tree stage: 갈래 걸음인데 새 끝이 없다');
      }
      place(sprouts, 0);
      const start = Date.now();
      for (;;) {
        await wait(FRAME_MS);
        if (mine !== gen || destroyed) return;
        const p = Math.min(1, (Date.now() - start) / MOVE_MS);
        place(sprouts, p);
        if (p >= 1) break;
      }
      drawStatic(next);
    }

    return {
      render(
        next: ProductRuleTreeScene,
        prev: ProductRuleTreeScene | null,
        opts: { animate: boolean },
      ): Promise<void> | void {
        const mine = (gen += 1);
        if (destroyed) return;
        const grew =
          opts.animate &&
          next.step?.kind === 'branch' &&
          prev !== null &&
          prev.levels.length === next.levels.length - 1;
        if (!grew) {
          drawStatic(next);
          return;
        }
        return sprout(next, mine);
      },
      destroy(): void {
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
