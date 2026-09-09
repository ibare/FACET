/**
 * prim-mst-stage — 프림 전용 무대.
 *
 * 세 층이 한 폭에 쌓인다.
 *
 *   1. 그래프    나무가 한 자리씩 자라는 곳. 나무에 든 정점을 감싼 **엷은 덩이**가
 *                회마다 커진다 — 이 facet 의 동사가 "자란다" 라서, 커지는 것이
 *                한눈에 보여야 한다.
 *   2. key 줄    정점마다 "나무에서 여기로 건너오는 가장 가벼운 간선 하나" 의
 *                무게. ∞ 는 아직 닿지 못한 자리다.
 *   3. 붙은 차례  나무에 들어온 간선을 들어온 순서대로. 오른쪽에 무게 합.
 *
 * ── 고를 수 있는 것과 아직 아닌 것
 *
 * 이 무대가 말해야 하는 것은 "그림 전체에서 가장 가벼운 간선을 고르는 게
 * 아니다" 이다. 그래서 간선을 세 갈래로 갈라 그린다.
 *
 *   나무 간선          굵은 `itemSorted`. 이미 굳었다.
 *   경계를 넘는 간선    solid `itemComparing`. **지금 고를 수 있는 것.**
 *   그 밖의 간선        흐린 점선 `border`. 안-안(고리)이거나 밖-밖이라 지금은
 *                      후보가 아니다.
 *
 * 회가 바뀔 때마다 주황이 옮겨 다니는 것이 곧 "고를 수 있는 것이 그때마다
 * 달라진다" 이다.
 *
 * ── 좌표는 자료에서 나온다
 *
 * 배치를 손으로 박지 않는다. 출발점에서 너비 우선으로 층을 재어 같은 층을 한
 * 세로줄에 세우고, 세로줄 안에서는 번호 순으로 놓는다. 나무가 왼쪽에서
 * 오른쪽으로 자라는 것으로 읽힌다.
 *
 * ── 세로 (S-view)
 *
 * 마운트 뒤 `viewBox` 를 다시 재지 않는다. 층 셋의 높이가 정점 수와 무관하게
 * 고정이고, 세로줄이 넘치면 층 간격을 줄여 담는다.
 *
 * 타이머도 애니메이션 프레임도 쓰지 않는다 — 한 걸음마다 상태를 통째로 다시
 * 그릴 뿐이라 `destroy()` 가 거둘 뒷일이 없다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** ∞ — 수식 기호라 번역하지 않는다 (C10 표식 판정 3). */
const INFINITY_GLYPH = '∞';
/** 무방향 간선의 두 끝을 잇는 글자. 도형에 새겨진 표식이다. */
const EDGE_DASH = '–';

const CANVAS_W = 660;
const CANVAS_H = 392;
const PAD = 16;

/** 정점 동그라미의 반지름. */
const R = 16;
/** 그래프 층의 가로 여백 — 동그라미가 캔버스 밖으로 나가지 않게 한다. */
const GX0 = PAD + R + 24;
const GX1 = CANVAS_W - PAD - R - 24;
/** 그래프 층의 세로 범위. 세로줄이 아무리 길어도 이 안에서 간격만 줄인다. */
const GY0 = 66;
const GY1 = 222;
const GY_MID = (GY0 + GY1) / 2;

/** 나무 덩이가 정점 바깥으로 번지는 두께. */
const BLOB_PAD = 13;
/** 덩이는 겹쳐도 짙어지면 안 되므로 그룹 하나에 투명도를 준다. */
const BLOB_OPACITY = 0.11;

const CAPTION_Y = 21;
const LEGEND_Y = 252;
const KEY_LABEL_Y = 276;
const KEY_ROW_Y = 284;
const KEY_ROW_H = 42;
const ORDER_LABEL_Y = 348;
const ORDER_ROW_Y = 354;
const ORDER_CHIP_W = 74;
const ORDER_CHIP_H = 30;
const ORDER_CHIP_GAP = 6;

export type PrimStageGraph = {
  n: number;
  start: number;
  edges: { a: number; b: number; w: number }[];
};

export type PrimStageSnapshot = {
  /** 정점마다 나무까지의 가장 가벼운 간선 무게. null 이면 아직 닿지 못했다. */
  keys: (number | null)[];
  /** 그 간선의 반대쪽 끝. null 이면 없다. */
  parent: (number | null)[];
  inTree: boolean[];
  /** 지금 훑고 있는 자리. */
  scanAt: number | null;
  /** 훑는 도중 지금까지 가장 가벼운 후보. */
  bestAt: number | null;
  /** 이번 회에 붙이기로 정해진 자리. */
  chosen: number | null;
  /** 지금 견주고 있는 간선. */
  offer: { a: number; b: number } | null;
  /** 붙은 차례. 출발점은 간선이 없으므로 들어가지 않는다. */
  order: { from: number; to: number; weight: number }[];
  total: number;
  done: boolean;
};

type Point = { x: number; y: number };

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = svg('text', { 'font-family': fonts.body, ...attrs });
  node.textContent = content;
  return node;
}

/**
 * 출발점에서 너비 우선으로 층을 재고, 층을 세로줄로 세운다.
 *
 * 닿지 못하는 정점(끊긴 그래프)은 가장 먼 층 하나 뒤에 모아 세운다 — 그것도
 * "나무가 닿지 못한다" 는 사실의 표현이다.
 */
function layout(graph: PrimStageGraph): Point[] {
  const { n, start } = graph;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of graph.edges) {
    if (e.a < 0 || e.a >= n || e.b < 0 || e.b >= n) continue;
    adj[e.a]!.push(e.b);
    adj[e.b]!.push(e.a);
  }

  const depth = new Array<number>(n).fill(-1);
  if (start >= 0 && start < n) {
    depth[start] = 0;
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      const u = queue[head]!;
      for (const v of adj[u]!) {
        if (depth[v] !== -1) continue;
        depth[v] = depth[u]! + 1;
        queue.push(v);
      }
    }
  }
  const reached = depth.filter((d) => d >= 0);
  const far = reached.length > 0 ? Math.max(...reached) + 1 : 0;
  for (let i = 0; i < n; i += 1) if (depth[i] === -1) depth[i] = far;

  const columns: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const d = depth[i]!;
    while (columns.length <= d) columns.push([]);
    columns[d]!.push(i);
  }
  const used = columns.filter((c) => c.length > 0);
  const tallest = used.reduce((m, c) => Math.max(m, c.length), 1);
  // 세로줄이 길어지면 간격이 줄어든다. 캔버스가 커지지는 않는다 (S-view).
  const pitch = tallest > 1 ? (GY1 - GY0) / (tallest - 1) : 0;
  const spanX = used.length > 1 ? (GX1 - GX0) / (used.length - 1) : 0;

  const pos: Point[] = Array.from({ length: n }, () => ({ x: GX0, y: GY_MID }));
  used.forEach((col, ci) => {
    const x = used.length > 1 ? GX0 + spanX * ci : (GX0 + GX1) / 2;
    const top = GY_MID - (pitch * (col.length - 1)) / 2;
    col.forEach((vertex, ri) => {
      pos[vertex] = { x, y: top + pitch * ri };
    });
  });
  return pos;
}

export const primMstStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const c = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback 은 이 형태만 허용한다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    const initial = (params.initialData ?? {}) as {
      vertexCount?: number;
      start?: number;
      edges?: { a: number; b: number; w: number }[];
    };
    let graph: PrimStageGraph = {
      n: typeof initial.vertexCount === 'number' ? initial.vertexCount : 0,
      start: typeof initial.start === 'number' ? initial.start : 0,
      edges: Array.isArray(initial.edges) ? initial.edges : [],
    };
    let pos = layout(graph);

    const root = svg('g', {});
    canvas.appendChild(root);

    const captionNode = text('', {
      x: PAD,
      y: CAPTION_Y,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(captionNode);

    // ── 고정 층: 범례와 두 이름표. 재생 중에 바뀌지 않는다.
    const chrome = svg('g', {});
    root.appendChild(chrome);

    const legendMark = (x: number, dashed: boolean, stroke: string): void => {
      const line = svg('line', {
        x1: x,
        y1: LEGEND_Y - 4,
        x2: x + 22,
        y2: LEGEND_Y - 4,
        stroke,
        'stroke-width': dashed ? 1.2 : 2.4,
        'stroke-linecap': 'round',
      });
      if (dashed) line.setAttribute('stroke-dasharray', '4 3');
      chrome.appendChild(line);
    };
    legendMark(PAD, false, c.itemComparing);
    chrome.appendChild(
      text(tr('label.choosable', 'choosable — leaves the tree'), {
        x: PAD + 28,
        y: LEGEND_Y,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    );
    legendMark(PAD + 250, true, c.border);
    chrome.appendChild(
      text(tr('label.notYet', 'not yet — both ends on the same side'), {
        x: PAD + 278,
        y: LEGEND_Y,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    );
    chrome.appendChild(
      text(tr('label.key', 'cheapest edge from the tree to each vertex'), {
        x: PAD,
        y: KEY_LABEL_Y,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    );
    chrome.appendChild(
      text(tr('label.order', 'edges taken, in order'), {
        x: PAD,
        y: ORDER_LABEL_Y,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      }),
    );
    chrome.appendChild(
      text(tr('label.total', 'total weight'), {
        x: CANVAS_W - PAD,
        y: ORDER_LABEL_Y,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
        'text-anchor': 'end',
      }),
    );

    const layerBlob = svg('g', { opacity: BLOB_OPACITY });
    const layerEdges = svg('g', {});
    const layerNodes = svg('g', {});
    const layerLedger = svg('g', {});
    root.appendChild(layerBlob);
    root.appendChild(layerEdges);
    root.appendChild(layerNodes);
    root.appendChild(layerLedger);

    const clear = (g: SVGGElement): void => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    const key = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

    function drawBlob(s: PrimStageSnapshot): void {
      clear(layerBlob);
      for (let i = 0; i < graph.n; i += 1) {
        if (!s.inTree[i]) continue;
        layerBlob.appendChild(
          svg('circle', {
            cx: pos[i]!.x,
            cy: pos[i]!.y,
            r: R + BLOB_PAD,
            fill: c.sortedTailBorder,
          }),
        );
      }
      for (const e of s.order) {
        layerBlob.appendChild(
          svg('line', {
            x1: pos[e.from]!.x,
            y1: pos[e.from]!.y,
            x2: pos[e.to]!.x,
            y2: pos[e.to]!.y,
            stroke: c.sortedTailBorder,
            'stroke-width': (R + BLOB_PAD) * 2,
            'stroke-linecap': 'round',
          }),
        );
      }
    }

    function drawEdges(s: PrimStageSnapshot): void {
      clear(layerEdges);
      const treeSet = new Set(s.order.map((e) => key(e.from, e.to)));
      const live = s.offer ? key(s.offer.a, s.offer.b) : null;
      const picked =
        s.chosen !== null && s.parent[s.chosen] !== null && s.parent[s.chosen] !== undefined
          ? key(s.parent[s.chosen]!, s.chosen)
          : null;

      for (const e of graph.edges) {
        if (e.a < 0 || e.a >= graph.n || e.b < 0 || e.b >= graph.n) continue;
        const id = key(e.a, e.b);
        const inA = s.inTree[e.a] === true;
        const inB = s.inTree[e.b] === true;
        const crosses = inA !== inB;

        let stroke = c.border;
        let width = 1.2;
        let dashed = true;
        if (treeSet.has(id)) {
          stroke = c.itemSorted;
          width = 4.5;
          dashed = false;
        } else if (crosses) {
          stroke = c.itemComparing;
          width = 2.4;
          dashed = false;
        }
        // 고른 간선은 아직 나무에 들지 않은 한 순간만 노랗다. 붙고 나면 나무
        // 간선의 색이 이긴다 — 노랑은 "지금 정해진 것" 이지 "굳은 것" 이 아니다.
        if (id === live || (id === picked && !treeSet.has(id))) {
          stroke = c.itemPivot;
          width = 5;
          dashed = false;
        }

        const line = svg('line', {
          x1: pos[e.a]!.x,
          y1: pos[e.a]!.y,
          x2: pos[e.b]!.x,
          y2: pos[e.b]!.y,
          stroke,
          'stroke-width': width,
          'stroke-linecap': 'round',
        });
        if (dashed) line.setAttribute('stroke-dasharray', '4 3');
        layerEdges.appendChild(line);

        // 무게는 간선 한가운데. 선 위에 얹히지 않도록 배경을 깔아 준다.
        const mx = (pos[e.a]!.x + pos[e.b]!.x) / 2;
        const my = (pos[e.a]!.y + pos[e.b]!.y) / 2;
        const label = String(e.w);
        const halfW = 7 + label.length * 3.5;
        layerEdges.appendChild(
          svg('rect', {
            x: mx - halfW,
            y: my - 9,
            width: halfW * 2,
            height: 18,
            rx: 4,
            fill: c.bg,
          }),
        );
        layerEdges.appendChild(
          text(label, {
            x: mx,
            y: my + 4,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: dashed ? c.textMuted : c.text,
            'text-anchor': 'middle',
          }),
        );
      }
    }

    function drawNodes(s: PrimStageSnapshot): void {
      clear(layerNodes);
      for (let i = 0; i < graph.n; i += 1) {
        const inTree = s.inTree[i] === true;
        const reached = s.keys[i] !== null && s.keys[i] !== undefined;

        let fill = c.itemDefault;
        let ink = c.text;
        let stroke = reached ? c.text : c.border;
        let strokeWidth = 1.5;
        let dashed = !reached;
        if (inTree) {
          fill = c.itemSorted;
          ink = c.textInverse;
          stroke = c.itemSorted;
          dashed = false;
        }
        if (s.chosen === i) {
          fill = c.itemPivot;
          ink = c.stateInk;
          stroke = c.itemPivot;
          dashed = false;
        }
        if (s.scanAt === i) {
          stroke = c.itemComparing;
          strokeWidth = 3;
          dashed = false;
        }

        const circle = svg('circle', {
          cx: pos[i]!.x,
          cy: pos[i]!.y,
          r: R,
          fill,
          stroke,
          'stroke-width': strokeWidth,
        });
        if (dashed) circle.setAttribute('stroke-dasharray', '3 3');
        layerNodes.appendChild(circle);
        layerNodes.appendChild(
          text(String(i), {
            x: pos[i]!.x,
            y: pos[i]!.y + 5,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            fill: ink,
            'text-anchor': 'middle',
          }),
        );
        if (i === graph.start) {
          layerNodes.appendChild(
            text(tr('label.start', 'start'), {
              x: pos[i]!.x,
              y: pos[i]!.y - R - 7,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
              'text-anchor': 'middle',
            }),
          );
        }
      }
    }

    function drawLedger(s: PrimStageSnapshot): void {
      clear(layerLedger);
      const n = Math.max(graph.n, 1);
      const gap = 8;
      const cellW = (CANVAS_W - PAD * 2 - gap * (n - 1)) / n;

      for (let i = 0; i < graph.n; i += 1) {
        const x = PAD + (cellW + gap) * i;
        const inTree = s.inTree[i] === true;
        const value = s.keys[i];
        const reached = value !== null && value !== undefined;

        let fill = reached ? c.itemDefault : c.bgSubtle;
        let ink = reached ? c.text : c.textMuted;
        let stroke = reached ? c.text : c.border;
        let strokeWidth = 1.2;
        let dashed = !reached;
        if (inTree) {
          fill = c.itemSorted;
          ink = c.textInverse;
          stroke = c.itemSorted;
          dashed = false;
        }
        if (s.chosen === i) {
          fill = c.itemPivot;
          ink = c.stateInk;
          stroke = c.itemPivot;
          dashed = false;
        }
        if (s.scanAt === i) {
          stroke = c.itemComparing;
          strokeWidth = 2.6;
          dashed = false;
        }

        const cell = svg('rect', {
          x,
          y: KEY_ROW_Y,
          width: cellW,
          height: KEY_ROW_H,
          rx: 5,
          fill,
          stroke,
          'stroke-width': strokeWidth,
        });
        if (dashed) cell.setAttribute('stroke-dasharray', '3 3');
        layerLedger.appendChild(cell);
        layerLedger.appendChild(
          text(String(i), {
            x: x + 6,
            y: KEY_ROW_Y + 13,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: ink,
            opacity: 0.7,
          }),
        );
        layerLedger.appendChild(
          text(reached ? String(value) : INFINITY_GLYPH, {
            x: x + cellW / 2,
            y: KEY_ROW_Y + 32,
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            fill: ink,
            'text-anchor': 'middle',
          }),
        );
        // 훑는 도중 지금까지 가장 가벼운 후보를 아래에서 가리킨다.
        if (s.bestAt === i && !inTree) {
          layerLedger.appendChild(
            svg('path', {
              d: `M ${x + cellW / 2 - 6} ${KEY_ROW_Y + KEY_ROW_H + 8} L ${x + cellW / 2 + 6} ${
                KEY_ROW_Y + KEY_ROW_H + 8
              } L ${x + cellW / 2} ${KEY_ROW_Y + KEY_ROW_H + 1} Z`,
              fill: c.itemComparing,
            }),
          );
        }
      }

      s.order.forEach((e, i) => {
        const x = PAD + (ORDER_CHIP_W + ORDER_CHIP_GAP) * i;
        layerLedger.appendChild(
          svg('rect', {
            x,
            y: ORDER_ROW_Y,
            width: ORDER_CHIP_W,
            height: ORDER_CHIP_H,
            rx: 5,
            fill: c.itemSorted,
          }),
        );
        layerLedger.appendChild(
          text(`${e.from}${EDGE_DASH}${e.to}`, {
            x: x + ORDER_CHIP_W / 2,
            y: ORDER_ROW_Y + 13,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: c.textInverse,
            'text-anchor': 'middle',
            opacity: 0.75,
          }),
        );
        layerLedger.appendChild(
          text(String(e.weight), {
            x: x + ORDER_CHIP_W / 2,
            y: ORDER_ROW_Y + 25,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.textInverse,
            'text-anchor': 'middle',
          }),
        );
      });

      layerLedger.appendChild(
        text(String(s.total), {
          x: CANVAS_W - PAD,
          y: ORDER_ROW_Y + 25,
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: s.done ? c.itemPivot : c.text,
          'text-anchor': 'end',
        }),
      );
    }

    return {
      /** 자료가 바뀌면 배치를 다시 잰다. 캔버스 크기는 그대로다. */
      setGraph(next: PrimStageGraph): void {
        graph = next;
        pos = layout(next);
      },

      update(snapshot: PrimStageSnapshot): void {
        drawBlob(snapshot);
        drawEdges(snapshot);
        drawNodes(snapshot);
        drawLedger(snapshot);
      },

      setCaption(value: string): void {
        captionNode.textContent = value;
      },

      destroy(): void {
        // 타이머도 프레임도 옵서버도 쓰지 않는다. 붙인 노드만 거두면 끝이다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
