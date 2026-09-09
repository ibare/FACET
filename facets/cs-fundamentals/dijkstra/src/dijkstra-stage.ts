/**
 * dijkstra-stage — 다익스트라 전용 무대 한 폭.
 *
 * 왼쪽은 그림, 오른쪽은 **굳은 차례의 기록** 이다. 이 facet 이 말하려는 것은
 * "아직 확정되지 않은 것 중 가장 가까운 것을 굳히고, 그 이웃을 편다" 이고,
 * 그 주장은 두 자리가 함께 있어야 보인다 —
 *
 *   왼쪽에서 잠정 거리는 계속 흔들린다 (정점 3 은 22 였다가 20 이 된다).
 *   오른쪽에 한 줄이 적히면 그 값은 재생이 끝날 때까지 다시 움직이지 않는다.
 *
 * 잠정과 확정은 칠로 갈린다. 잠정은 테두리만 있는 빈 원, 확정은 속이 찬 원이다.
 * 최단 경로 나무도 같은 규칙을 따른다 — 잠정인 길은 점선, 굳은 길은 실선이다.
 *
 * ── 좌표는 여기서 셈한다 (`initialData` 에는 구조만 있다)
 *
 * 이 그림은 이음이 아홉인데, 가장 이웃이 많은 정점 하나를 가운데 두고 나머지를
 * 둘레의 고리 차례로 늘어놓으면 선이 한 번도 겹치지 않는다. 그래서 배치는
 * 사양이 준 좌표가 아니라 자료에서 나온다 — 차수가 가장 큰 정점을 가운데(hub)
 * 로, 남은 정점들은 그들끼리의 간선을 따라 걸어 얻은 차례로 원 위에 놓는다.
 *
 * ── 세로는 마운트 뒤 바뀌지 않는다 (S-view)
 *
 * 기록 칸이 정점 수만큼 필요한데, 늘리는 대신 줄 간격을 줄여 담는다.
 *
 * ── 뒷일 없음
 *
 * 타이머도 프레임 루프도 리스너도 두지 않는다. `render` 는 받은 것만 그리는
 * 동기 함수이고 `destroy` 는 자기가 만든 그룹 하나를 떼어 낼 뿐이다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fontSizes, fonts, getColors, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 무한대 기호. 수식 표기라 번역하지 않는다 (C10 "표식이냐 문안이냐" 3번). */
const INFINITY_MARK = '∞';
/** 길을 잇는 화살. 도형에 새겨진 표식. */
const PATH_ARROW = '→';

const CANVAS_W = 760;
const CANVAS_H = 386;

/** 왼쪽 그림 판. */
const GRAPH_CX = 246;
const GRAPH_CY = 180;
const GRAPH_R = 132;
const NODE_R = 24;
/** 정점 번호를 원 바깥 어디에 적을지 — 중심에서 이만큼 더 나간 자리. */
const ID_OFFSET = 34;
/** 고리의 첫 자리 각도. 출발점이 왼쪽 위에 오도록 잡았다 (화면 좌표, y 아래로). */
const RING_START_DEG = 198;

/** 오른쪽 기록 판. */
const LEDGER_X = 490;
const LEDGER_W = 254;
const LEDGER_TOP = 46;
const LEDGER_BOTTOM = 290;
const LEDGER_ROW_H = 40;

const LEGEND_Y = 322;
const CAPTION_X = 24;
const CAPTION_Y = 362;

export type DijkstraSnapshot = {
  vertexCount: number;
  source: number;
  /** 잠정 거리. `null` 은 아직 닿은 적이 없다는 뜻. */
  dist: (number | null)[];
  /** 굳었는가. 굳은 자리의 거리는 다시 바뀌지 않는다. */
  settled: boolean[];
  /** 최단 경로 나무의 부모. */
  parent: (number | null)[];
  /** 굳은 차례의 기록. 한 번 적히면 지워지지 않는다. */
  ledger: { node: number; dist: number; path: number[] }[];
  scanNode: number | null;
  bestNode: number | null;
  chosenNode: number | null;
  changedNode: number | null;
  activeEdge: { from: number; to: number; improved: boolean } | null;
  finished: boolean;
  caption: string;
};

type Point = { x: number; y: number };
type Edge = { a: number; b: number; w: number };

function attrs(node: SVGElement, map: Record<string, string | number>): void {
  for (const [k, val] of Object.entries(map)) node.setAttribute(k, String(val));
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  map: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  attrs(node, map);
  return node;
}

function readEdges(initial: Record<string, unknown> | undefined): Edge[] {
  const raw = initial?.['edges'];
  if (!Array.isArray(raw)) return [];
  const out: Edge[] = [];
  for (const item of raw) {
    const e = item as { a?: unknown; b?: unknown; w?: unknown };
    if (typeof e.a === 'number' && typeof e.b === 'number' && typeof e.w === 'number') {
      out.push({ a: e.a, b: e.b, w: e.w });
    }
  }
  return out;
}

/**
 * 자료에서 좌표를 셈한다. 차수가 가장 큰 정점을 가운데에 두고, 남은 정점들은
 * 그들끼리의 간선을 따라 걸어 얻은 차례로 원 위에 놓는다. 걷다가 막히면 남은
 * 것을 번호 차례로 잇는다 (고리가 아닌 그림도 자리는 얻는다).
 */
function layout(n: number, edges: Edge[]): Point[] {
  const pts: Point[] = Array.from({ length: n }, () => ({ x: GRAPH_CX, y: GRAPH_CY }));
  if (n === 0) return pts;

  const degree = Array.from({ length: n }, () => 0);
  for (const e of edges) {
    degree[e.a] = (degree[e.a] ?? 0) + 1;
    degree[e.b] = (degree[e.b] ?? 0) + 1;
  }

  // 정점이 넷보다 적으면 가운데를 비워 둘 이유가 없다 — 전부 원 위에 놓는다.
  let hub = -1;
  if (n >= 4) {
    hub = 0;
    for (let i = 1; i < n; i += 1) if ((degree[i] ?? 0) > (degree[hub] ?? 0)) hub = i;
  }

  const ring: number[] = [];
  const remaining = new Set<number>();
  for (let i = 0; i < n; i += 1) if (i !== hub) remaining.add(i);

  const neighbors = Array.from({ length: n }, (): number[] => []);
  for (const e of edges) {
    if (e.a === hub || e.b === hub) continue;
    neighbors[e.a]?.push(e.b);
    neighbors[e.b]?.push(e.a);
  }

  let cursor = -1;
  for (const i of remaining) {
    cursor = i;
    break;
  }
  while (cursor >= 0) {
    ring.push(cursor);
    remaining.delete(cursor);
    let next = -1;
    for (const cand of (neighbors[cursor] ?? []).slice().sort((p, q) => p - q)) {
      if (remaining.has(cand)) {
        next = cand;
        break;
      }
    }
    if (next < 0) {
      next = -1;
      for (const i of remaining) {
        next = i;
        break;
      }
    }
    cursor = next;
  }

  if (hub >= 0) pts[hub] = { x: GRAPH_CX, y: GRAPH_CY };
  const step = ring.length > 0 ? 360 / ring.length : 0;
  ring.forEach((id, j) => {
    const rad = ((RING_START_DEG + step * j) * Math.PI) / 180;
    pts[id] = { x: GRAPH_CX + GRAPH_R * Math.cos(rad), y: GRAPH_CY + GRAPH_R * Math.sin(rad) };
  });
  return pts;
}

export const dijkstraStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const initial = params.initialData;
    const vertexCount =
      typeof initial?.['vertexCount'] === 'number' ? (initial['vertexCount'] as number) : 0;
    const edges = readEdges(initial);
    const pts = layout(vertexCount, edges);

    // 기록 칸은 정점 수만큼 필요하다. 세로를 늘리는 대신 줄 간격을 줄여 담는다.
    const rowH =
      vertexCount > 0
        ? Math.min(LEDGER_ROW_H, (LEDGER_BOTTOM - LEDGER_TOP) / vertexCount)
        : LEDGER_ROW_H;

    const root = make('g', {});
    svg.appendChild(root);

    function text(
      value: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: string,
      weight = 'normal',
      family: string = fonts.body,
    ): SVGTextElement {
      const node = make('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        'font-weight': weight,
        fill,
        'text-anchor': anchor,
        'dominant-baseline': 'middle',
      });
      node.textContent = value;
      return node;
    }

    /** 정점 원의 칠과 잉크. 굳은 것이 이기고, 그 다음이 이번에 고른 것이다. */
    function nodeSkin(
      s: DijkstraSnapshot,
      id: number,
    ): { fill: string; stroke: string; width: number; ink: string; dashed: boolean } {
      if (s.settled[id] === true) {
        return { fill: c.itemSorted, stroke: c.itemSorted, width: 2, ink: c.textInverse, dashed: false };
      }
      if (s.chosenNode === id) {
        return { fill: c.itemPivot, stroke: c.itemPivot, width: 2, ink: c.stateInk, dashed: false };
      }
      if (s.changedNode === id) {
        return { fill: c.itemSwapping, stroke: c.itemSwapping, width: 2, ink: c.stateInk, dashed: false };
      }
      if (s.bestNode === id) {
        return { fill: c.bg, stroke: c.accent, width: 4, ink: c.text, dashed: false };
      }
      if (s.scanNode === id) {
        return { fill: c.itemComparing, stroke: c.itemComparing, width: 2, ink: c.stateInk, dashed: false };
      }
      if (s.dist[id] === null || s.dist[id] === undefined) {
        return { fill: c.bg, stroke: c.border, width: 2, ink: c.textMuted, dashed: true };
      }
      return { fill: c.bg, stroke: c.text, width: 2, ink: c.text, dashed: false };
    }

    /** 이 간선이 최단 경로 나무의 가지인가. 그렇다면 그 아래쪽 정점은 누구인가. */
    function treeChild(s: DijkstraSnapshot, e: Edge): number | null {
      if (s.parent[e.b] === e.a) return e.b;
      if (s.parent[e.a] === e.b) return e.a;
      return null;
    }

    function drawEdges(s: DijkstraSnapshot): void {
      const active = s.activeEdge;
      for (const e of edges) {
        const p = pts[e.a];
        const q = pts[e.b];
        if (!p || !q) continue;

        const isActive =
          active !== null &&
          ((active.from === e.a && active.to === e.b) || (active.from === e.b && active.to === e.a));
        const child = treeChild(s, e);
        const childSettled = child !== null && s.settled[child] === true;

        let stroke = c.border;
        let width = 2;
        let dash = '';
        if (child !== null) {
          stroke = c.text;
          width = childSettled ? 4 : 3;
          dash = childSettled ? '' : '5 4';
        }
        if (isActive) {
          stroke = active.improved ? c.itemSwapping : c.itemComparing;
          width = 5;
          dash = '';
        }

        const line = make('line', {
          x1: p.x,
          y1: p.y,
          x2: q.x,
          y2: q.y,
          stroke,
          'stroke-width': width,
          'stroke-linecap': 'round',
        });
        if (dash) line.setAttribute('stroke-dasharray', dash);
        root.appendChild(line);

        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        root.appendChild(
          make('rect', {
            x: mx - 12,
            y: my - 9,
            width: 24,
            height: 18,
            rx: 5,
            fill: c.bg,
            stroke: isActive ? stroke : c.border,
            'stroke-width': 1,
          }),
        );
        root.appendChild(
          text(
            String(e.w),
            mx,
            my,
            fontSizes.xs,
            isActive ? c.text : c.textMuted,
            'middle',
            isActive ? '700' : '400',
            fonts.mono,
          ),
        );
      }
    }

    function drawNodes(s: DijkstraSnapshot): void {
      for (let id = 0; id < vertexCount; id += 1) {
        const p = pts[id];
        if (!p) continue;
        const skin = nodeSkin(s, id);

        const circle = make('circle', {
          cx: p.x,
          cy: p.y,
          r: NODE_R,
          fill: skin.fill,
          stroke: skin.stroke,
          'stroke-width': skin.width,
        });
        if (skin.dashed) circle.setAttribute('stroke-dasharray', '4 4');
        root.appendChild(circle);

        const at = s.dist[id];
        root.appendChild(
          text(
            at === null || at === undefined ? INFINITY_MARK : String(at),
            p.x,
            p.y,
            fontSizes.md,
            skin.ink,
            'middle',
            '700',
            fonts.mono,
          ),
        );

        // 정점 번호는 원 바깥, 그림 중심에서 멀어지는 쪽에 적는다.
        const dx = p.x - GRAPH_CX;
        const dy = p.y - GRAPH_CY;
        const norm = Math.hypot(dx, dy);
        const ux = norm > 0.5 ? dx / norm : Math.cos((54 * Math.PI) / 180);
        const uy = norm > 0.5 ? dy / norm : Math.sin((54 * Math.PI) / 180);
        root.appendChild(
          text(
            String(id),
            p.x + ux * ID_OFFSET,
            p.y + uy * ID_OFFSET,
            fontSizes.sm,
            c.textMuted,
            'middle',
            '600',
            fonts.mono,
          ),
        );

        if (id === s.source) {
          // 번호 아래에 한 줄 더. 원 바깥쪽으로 밀어 두지 않으면 간선과 겹친다.
          const anchor = ux < -0.2 ? 'end' : ux > 0.2 ? 'start' : 'middle';
          const nudge = anchor === 'end' ? 6 : anchor === 'start' ? -6 : 0;
          root.appendChild(
            text(
              tr('label.source', 'source'),
              p.x + ux * ID_OFFSET + nudge,
              p.y + uy * ID_OFFSET + 15,
              fontSizes.xs,
              c.textMuted,
              anchor,
            ),
          );
        }
      }
    }

    function drawLedger(s: DijkstraSnapshot): void {
      root.appendChild(
        text(
          tr('label.ledger', 'Settled, in order'),
          LEDGER_X,
          30,
          fontSizes.sm,
          c.textMuted,
          'start',
          '600',
        ),
      );

      for (let slot = 0; slot < vertexCount; slot += 1) {
        const y = LEDGER_TOP + rowH * slot;
        const h = Math.max(rowH - 6, 14);
        const row = s.ledger[slot];

        if (!row) {
          const empty = make('rect', {
            x: LEDGER_X,
            y,
            width: LEDGER_W,
            height: h,
            rx: 6,
            fill: 'none',
            stroke: c.border,
            'stroke-width': 1,
          });
          empty.setAttribute('stroke-dasharray', '4 4');
          root.appendChild(empty);
          continue;
        }

        root.appendChild(
          make('rect', {
            x: LEDGER_X,
            y,
            width: LEDGER_W,
            height: h,
            rx: 6,
            fill: c.itemSorted,
          }),
        );
        const midY = y + h / 2;
        // 정점 번호는 그림의 원과 같은 꼴로 찍는다 — 옆의 거리와 헷갈리지 않게.
        root.appendChild(
          make('circle', { cx: LEDGER_X + 21, cy: midY, r: 12, fill: c.bg }),
        );
        root.appendChild(
          text(String(row.node), LEDGER_X + 21, midY, fontSizes.sm, c.text, 'middle', '700', fonts.mono),
        );
        root.appendChild(
          text(String(row.dist), LEDGER_X + 84, midY, fontSizes.md, c.textInverse, 'end', '700', fonts.mono),
        );
        root.appendChild(
          text(
            row.path.join(` ${PATH_ARROW} `),
            LEDGER_X + 100,
            midY,
            fontSizes.xs,
            c.textInverse,
            'start',
            '400',
            fonts.mono,
          ),
        );
      }
    }

    function drawLegend(): void {
      const items: { fill: string; stroke: string; dashed: boolean; label: string }[] = [
        {
          fill: c.bg,
          stroke: c.text,
          dashed: false,
          label: tr('label.tentative', 'tentative — may still drop'),
        },
        {
          fill: c.itemSorted,
          stroke: c.itemSorted,
          dashed: false,
          label: tr('label.settled', 'settled — never moves again'),
        },
      ];
      items.forEach((item, i) => {
        const y = LEGEND_Y + i * 24;
        const dot = make('circle', {
          cx: LEDGER_X + 9,
          cy: y,
          r: 9,
          fill: item.fill,
          stroke: item.stroke,
          'stroke-width': 2,
        });
        if (item.dashed) dot.setAttribute('stroke-dasharray', '4 4');
        root.appendChild(dot);
        root.appendChild(text(item.label, LEDGER_X + 26, y, fontSizes.xs, c.textMuted, 'start'));
      });
    }

    function render(s: DijkstraSnapshot): void {
      root.textContent = '';
      drawEdges(s);
      drawNodes(s);
      drawLedger(s);
      drawLegend();
      if (s.caption) {
        root.appendChild(
          text(
            s.caption,
            CAPTION_X,
            CAPTION_Y,
            fontSizes.md,
            s.finished ? c.text : c.textMuted,
            'start',
            s.finished ? '600' : '400',
          ),
        );
      }
    }

    render({
      vertexCount,
      source: typeof initial?.['source'] === 'number' ? (initial['source'] as number) : 0,
      dist: Array.from({ length: vertexCount }, () => null),
      settled: Array.from({ length: vertexCount }, () => false),
      parent: Array.from({ length: vertexCount }, () => null),
      ledger: [],
      scanNode: null,
      bestNode: null,
      chosenNode: null,
      changedNode: null,
      activeEdge: null,
      finished: false,
      caption: '',
    });

    return {
      render,
      destroy(): void {
        // 타이머도 리스너도 만들지 않았다. 거둘 것은 자기 그룹 하나뿐이다.
        root.remove();
      },
    };
  },
};
