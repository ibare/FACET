/**
 * dendrogram-cut-stage — 다 자란 나무 위를 가로선 하나가 미끄러진다.
 *
 * 그림의 중심은 산점도가 아니라 **가로선과 그것이 지나는 세로 가지**다. 선이
 * 어느 높이에 있느냐가 무리 수를 정하므로, 선은 왼쪽 높이 축의 손잡이이자
 * 오른쪽 무리 수 판의 바늘이다. 선을 올리면 지나는 가지가 하나씩 줄고, 아래
 * 이름표 밑의 무리 띠가 그만큼 합쳐진다.
 *
 * 끊는 걸음(`settleAt`)에서는 선 위쪽 — 버려지는 부분 — 이 흐려지고 지나던
 * 가지가 선 자리에서 실제로 끊겨 끝이 캡으로 막힌다.
 *
 * 좌표는 전부 이 파일이 캔버스에서 역산한다 (S-piece). 선언에서 오는 것은
 * 잎 이름표(initialData)와 나무의 구조·높이(payload)뿐이다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정한다. 마운트한 뒤 바뀌지 않는다 (S-view). */
const CANVAS_H = 314;

const PLOT_TOP = 38;
const PLOT_H = 236;
const PLOT_BOTTOM = PLOT_TOP + PLOT_H;
const AXIS_X = 46;
/** 오른쪽에 무리 수 판이 앉을 자리. */
const RIGHT_PAD = 58;
const PLOT_RIGHT = PIECE_CANVAS_W - 12;
const LEAF_LEFT = AXIS_X + 20;
const LEAF_RIGHT = PIECE_CANVAS_W - RIGHT_PAD;
const LEAF_BASE_Y = PLOT_BOTTOM + 16;
const BRACKET_Y = PLOT_BOTTOM + 23;
const BRACKET_H = 4;
const CAPTION_Y = 17;
const HEADER_Y = 30;

/** 눈금 글자가 겹치지 않는 최소 간격. 낮은 합침이 몰려 있으면 눈금만 남긴다. */
const TICK_MIN_GAP = 12;
/** 끊긴 자리에 벌어지는 틈. 가로선이 그 틈에 눕는다. */
const SEVER_GAP = 12;
const TREE_W = 1.7;
const HILITE_W = 3.4;

const SLIDE_MIN_MS = 200;
const SLIDE_SPAN_MS = 430;
const BAND_MS = 380;
const FRAME_MS = 16;

const PILL_CX = (LEAF_RIGHT + PLOT_RIGHT) / 2;
const PILL_W = 40;
const PILL_H = 22;

export type DendrogramStageMerge = {
  id: string;
  left: string;
  right: string;
  height: number;
};

export type DendrogramStageBand = { lo: number; hi: number; clusters: number };

/** `initialData` 에서 이 그림이 쓰는 것 — 잎 이름표뿐이다. */
export type DendrogramScene = { leafIds: string[] };

/**
 * `initialData` 를 좁힌다. mount 가 받는 자리이므로 좁히개도 여기에 둔다
 * (S-piece). projector 가 같은 값을 다시 좁혀 밀어 넣지 않는다.
 */
export function readDendrogramScene(initialData: unknown): DendrogramScene {
  if (typeof initialData !== 'object' || initialData === null) return { leafIds: [] };
  const raw = (initialData as Record<string, unknown>).points;
  const leafIds: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) continue;
      const id = (item as Record<string, unknown>).id;
      if (typeof id === 'string') leafIds.push(id);
    }
  }
  return { leafIds };
}

type Layout = {
  kids: Map<string, [string, string]>;
  height: Map<string, number>;
  parent: Map<string, string>;
  x: Map<string, number>;
  /** 그 마디 아래 잎들이 차지하는 차례 구간. */
  span: Map<string, [number, number]>;
  rootId: string;
  topHeight: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clear(g: SVGGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

function ease(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
}

export const dendrogramCutStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readDendrogramScene(params.initialData);

    // viewBox 는 러너(`layout-builder`)가 이미 같은 값으로 넣어 두었다.
    // 여기서 다시 세우면 세로가 동적인 그림으로 읽힌다 (S-view — 세로는 불변).

    const gBands = el('g', {});
    const gTree = el('g', {});
    const gCut = el('g', {});
    const gChrome = el('g', {});
    canvas.append(gBands, gTree, gCut, gChrome);

    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    const headHeight = el('text', {
      x: AXIS_X,
      y: HEADER_Y,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    headHeight.textContent = tr('label.height', 'height');
    const headClusters = el('text', {
      x: PILL_CX,
      y: HEADER_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: c.textMuted,
    });
    headClusters.textContent = tr('label.clusters', 'clusters');
    gChrome.append(caption, headHeight, headClusters);

    // ── 상태
    let order: string[] = [...scene.leafIds];
    let layout: Layout | null = null;
    let cutHeight: number | null = null;
    let severed = false;
    let bands: DendrogramStageBand[] = [];
    let bandGrow = 0;
    /** 끊어 본 구간들. 두 번째를 끊어도 첫 번째 표시가 남아 후보가 쌓인다. */
    const marked = new Set<number>();
    let clusterCount = 0;

    // ── 기다림 (S-piece)
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    function animate(duration: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const started = Date.now();
        const tick = (): void => {
          if (destroyed) return finish();
          const p = duration <= 0 ? 1 : Math.min(1, (Date.now() - started) / duration);
          onFrame(p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈
    function leafGap(): number {
      return (LEAF_RIGHT - LEAF_LEFT) / Math.max(1, order.length);
    }

    function leafX(index: number): number {
      return LEAF_LEFT + leafGap() * (index + 0.5);
    }

    function yOf(h: number): number {
      const top = layout?.topHeight ?? 1;
      return PLOT_BOTTOM - (Math.max(0, h) / (top || 1)) * PLOT_H;
    }

    function heightOf(id: string): number {
      return layout?.height.get(id) ?? 0;
    }

    /** 그 마디 위쪽 끝 — 부모의 합침 높이. 뿌리는 위가 열려 있다. */
    function upperY(id: string): number {
      const parent = layout?.parent.get(id);
      return parent === undefined ? PLOT_TOP : yOf(heightOf(parent));
    }

    /** 높이 h 의 가로선이 지나는 세로 가지들. 왼쪽부터. */
    function crossedAt(h: number): string[] {
      if (!layout) return [];
      const out: string[] = [];
      for (const id of layout.height.keys()) {
        const parent = layout.parent.get(id);
        const upper = parent === undefined ? Infinity : heightOf(parent);
        if (heightOf(id) < h && h < upper) out.push(id);
      }
      return out.sort((a, b) => (layout!.x.get(a) ?? 0) - (layout!.x.get(b) ?? 0));
    }

    function colorOf(id: string): string {
      const palette = categorical(Math.max(1, order.length), 'vivid');
      const index = layout?.span.get(id)?.[0] ?? 0;
      return palette[index % palette.length] ?? c.text;
    }

    function buildLayout(merges: DendrogramStageMerge[], topHeight: number): Layout | null {
      if (merges.length === 0 || scene.leafIds.length === 0) return null;
      const kids = new Map<string, [string, string]>();
      const height = new Map<string, number>();
      const parent = new Map<string, string>();
      for (const id of scene.leafIds) height.set(id, 0);
      for (const m of merges) {
        kids.set(m.id, [m.left, m.right]);
        height.set(m.id, m.height);
        parent.set(m.left, m.id);
        parent.set(m.right, m.id);
      }
      const rootId = merges[merges.length - 1]!.id;

      // 잎 차례는 나무가 정한다 — 중위로 밟아야 가지가 서로 넘지 않는다.
      const leaves: string[] = [];
      const walk = (id: string): void => {
        const pair = kids.get(id);
        if (pair === undefined) {
          leaves.push(id);
          return;
        }
        walk(pair[0]);
        walk(pair[1]);
      };
      walk(rootId);
      order = leaves;

      const x = new Map<string, number>();
      const span = new Map<string, [number, number]>();
      leaves.forEach((id, i) => {
        x.set(id, leafX(i));
        span.set(id, [i, i]);
      });
      for (const m of merges) {
        const lx = x.get(m.left) ?? 0;
        const rx = x.get(m.right) ?? 0;
        x.set(m.id, (lx + rx) / 2);
        const ls = span.get(m.left) ?? [0, 0];
        const rs = span.get(m.right) ?? [0, 0];
        span.set(m.id, [Math.min(ls[0], rs[0]), Math.max(ls[1], rs[1])]);
      }
      return { kids, height, parent, x, span, rootId, topHeight };
    }

    // ── 그리기
    function stroke(
      g: SVGGElement,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      width: number,
    ): void {
      g.appendChild(
        el('line', {
          x1,
          y1,
          x2,
          y2,
          stroke: color,
          'stroke-width': width,
          'stroke-linecap': 'round',
        }),
      );
    }

    /** 자른 선 위쪽은 버려지는 부분이라 흐려진다. 끊었을 때만. */
    function inkAt(y: number, cutY: number | null): string {
      return cutY !== null && y < cutY ? c.border : c.text;
    }

    function drawStem(x: number, yBottom: number, yTop: number, cutY: number | null): void {
      if (cutY === null || cutY <= yTop || cutY >= yBottom) {
        stroke(gTree, x, yBottom, x, yTop, inkAt((yBottom + yTop) / 2, cutY), TREE_W);
        return;
      }
      stroke(gTree, x, yBottom, x, cutY + SEVER_GAP / 2, c.text, TREE_W);
      stroke(gTree, x, cutY - SEVER_GAP / 2, x, yTop, c.border, TREE_W);
    }

    function renderTree(): void {
      clear(gTree);
      const cutY = severed && cutHeight !== null ? yOf(cutHeight) : null;

      stroke(gTree, AXIS_X, PLOT_BOTTOM, PLOT_RIGHT, PLOT_BOTTOM, c.border, 1);
      order.forEach((id, i) => {
        const label = el('text', {
          x: leafX(i),
          y: LEAF_BASE_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        label.textContent = id;
        gTree.appendChild(label);
      });
      if (!layout) return;

      stroke(gTree, AXIS_X, PLOT_BOTTOM, AXIS_X, PLOT_TOP, c.border, 1);
      let lastLabelY = Infinity;
      const marks = [0, ...[...layout.height.values()].filter((h) => h > 0)].sort((a, b) => a - b);
      for (const h of marks) {
        const y = yOf(h);
        stroke(gTree, AXIS_X - 4, y, AXIS_X + 3, y, c.border, 1);
        if (lastLabelY - y < TICK_MIN_GAP) continue;
        lastLabelY = y;
        const label = el('text', {
          x: AXIS_X - 8,
          y: y + 3.5,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        });
        label.textContent = h.toFixed(2);
        gTree.appendChild(label);
      }

      for (const id of layout.height.keys()) {
        if (id === layout.rootId) continue;
        drawStem(layout.x.get(id) ?? 0, yOf(heightOf(id)), upperY(id), cutY);
      }
      // 뿌리 기둥 — 이 위를 자르면 무리는 하나다.
      drawStem(layout.x.get(layout.rootId) ?? 0, yOf(heightOf(layout.rootId)), PLOT_TOP, cutY);

      for (const [id, pair] of layout.kids) {
        const y = yOf(heightOf(id));
        stroke(
          gTree,
          layout.x.get(pair[0]) ?? 0,
          y,
          layout.x.get(pair[1]) ?? 0,
          y,
          inkAt(y, cutY),
          TREE_W,
        );
      }
    }

    function renderBands(): void {
      clear(gBands);
      if (bandGrow <= 0) return;
      const width = (PLOT_RIGHT - AXIS_X) * bandGrow;
      bands.forEach((band, i) => {
        const yTop = yOf(band.hi);
        const yBot = yOf(band.lo);
        gBands.appendChild(
          el('rect', {
            x: AXIS_X,
            y: yTop,
            width,
            height: Math.max(0, yBot - yTop),
            fill: c.subtreeShadeRight,
          }),
        );
        if (!marked.has(i)) return;
        gBands.appendChild(
          el('rect', {
            x: AXIS_X,
            y: yTop,
            width,
            height: Math.max(0, yBot - yTop),
            fill: 'none',
            stroke: c.accent,
            'stroke-width': 1.5,
            'stroke-dasharray': '5 3',
          }),
        );
      });
    }

    function renderCut(): void {
      clear(gCut);
      if (!layout || cutHeight === null) return;
      const y = yOf(cutHeight);
      const gap = leafGap();

      for (const id of crossedAt(cutHeight)) {
        const x = layout.x.get(id) ?? 0;
        const color = colorOf(id);
        const bottom = yOf(heightOf(id));
        if (severed) {
          const cutEnd = y + SEVER_GAP / 2;
          stroke(gCut, x, bottom, x, cutEnd, color, HILITE_W);
          stroke(gCut, x - 7, cutEnd, x + 7, cutEnd, color, 3);
        } else {
          stroke(gCut, x, bottom, x, upperY(id), color, HILITE_W);
          gCut.appendChild(
            el('circle', {
              cx: x,
              cy: y,
              r: 4.5,
              fill: color,
              stroke: c.bg,
              'stroke-width': 1.4,
            }),
          );
        }
        const [from, to] = layout.span.get(id) ?? [0, 0];
        gCut.appendChild(
          el('rect', {
            x: leafX(from) - gap * 0.36,
            y: BRACKET_Y,
            width: leafX(to) - leafX(from) + gap * 0.72,
            height: BRACKET_H,
            rx: BRACKET_H / 2,
            fill: color,
          }),
        );
      }

      const blade = el('line', {
        x1: AXIS_X - 6,
        y1: y,
        x2: PLOT_RIGHT,
        y2: y,
        stroke: c.itemActive,
        'stroke-width': severed ? 3 : 2.2,
        'stroke-linecap': 'round',
      });
      if (!severed) blade.setAttribute('stroke-dasharray', '7 4');
      gCut.appendChild(blade);

      gCut.appendChild(
        el('polygon', {
          points: `${AXIS_X + 1},${y} ${AXIS_X + 10},${y - 6} ${AXIS_X + 10},${y + 6}`,
          fill: c.itemActive,
        }),
      );
      const readout = el('text', {
        x: AXIS_X + 15,
        y: y - 6,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.itemActive,
      });
      readout.textContent = cutHeight.toFixed(2);
      gCut.appendChild(readout);

      gCut.appendChild(
        el('rect', {
          x: PILL_CX - PILL_W / 2,
          y: y - PILL_H / 2,
          width: PILL_W,
          height: PILL_H,
          rx: 5,
          fill: c.itemActive,
        }),
      );
      const count = el('text', {
        x: PILL_CX,
        y: y + 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: c.stateInk,
      });
      count.textContent = String(clusterCount);
      gCut.appendChild(count);
    }

    function renderAll(): void {
      renderBands();
      renderTree();
      renderCut();
    }

    // ── projector 가 부르는 것
    function showTree(merges: DendrogramStageMerge[], topHeight: number): void {
      layout = buildLayout(merges, topHeight);
      cutHeight = null;
      severed = false;
      renderAll();
    }

    async function slide(height: number, clusters: number, sever: boolean): Promise<void> {
      if (!layout) return;
      const from = cutHeight ?? 0;
      clusterCount = clusters;
      if (severed) {
        severed = false;
        renderTree();
      }
      const travel = Math.abs(yOf(height) - yOf(from));
      const duration = SLIDE_MIN_MS + SLIDE_SPAN_MS * Math.min(1, travel / PLOT_H);
      await animate(duration, (p) => {
        cutHeight = from + (height - from) * ease(p);
        renderCut();
      });
      cutHeight = height;
      if (!sever) {
        renderCut();
        return;
      }
      severed = true;
      const band = bands.findIndex((b) => b.lo <= height && height <= b.hi);
      if (band >= 0) marked.add(band);
      renderAll();
    }

    async function showBands(next: DendrogramStageBand[]): Promise<void> {
      bands = next;
      marked.clear();
      await animate(BAND_MS, (p) => {
        bandGrow = ease(p);
        renderBands();
      });
      bandGrow = 1;
      renderBands();
    }

    function reset(): void {
      layout = null;
      order = [...scene.leafIds];
      cutHeight = null;
      severed = false;
      bands = [];
      bandGrow = 0;
      marked.clear();
      clusterCount = 0;
      caption.textContent = '';
      renderAll();
    }

    renderAll();

    return {
      showTree,
      slideTo: (height: number, clusters: number) => slide(height, clusters, false),
      settleAt: (height: number, clusters: number) => slide(height, clusters, true),
      showBands,
      setCaption(text: string): void {
        caption.textContent = text;
      },
      reset,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of [gBands, gTree, gCut, gChrome]) g.remove();
      },
    };
  },
};
