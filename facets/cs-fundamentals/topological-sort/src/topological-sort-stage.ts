/**
 * 위상 정렬 stage — 위에서 아래로 세 층.
 *
 *   ┌ 그래프 ─────────────────────────────┐  정점마다 "아직 남은 들어오는 화살 수"
 *   │  ⓪ → ② ↘                            │  가 붙어 있다.
 *   │  ① → ③ → ⑤                          │
 *   └─────────────────────────────────────┘
 *   ┌ 줄 (배열 + head · tail) ────────────┐  수가 0 이 된 것이 **떨어져** 여기 놓인다.
 *   ┌ 차례 ───────────────────────────────┐  줄에서 꺼낸 것이 다시 **떨어져** 여기 쌓인다.
 *
 * 동사가 "떨어져 나온다" 이므로 움직임은 언제나 아래쪽 한 방향이다. 정점 하나는
 * 조각(token) 하나를 가지며, 그 조각이 그래프 → 줄 → 차례로 두 번 떨어진다.
 * 새로 만들고 지우는 것이 아니라 **같은 조각이 자리를 옮긴다** — 그래야 "이것이
 * 저기로 갔다" 가 눈에 남는다. 원래 있던 정점 자리에는 빈 테두리가 남는다.
 *
 * 타이머를 쓰지 않는다. 자리 옮김은 CSS `transition` 이 하므로 예약된 콜백이
 * 없고, `destroy()` 는 만든 DOM 을 떼는 것으로 끝난다 (S-view).
 *
 * 세로는 마운트 뒤 바뀌지 않는다 — 정점 수가 달라져도 층의 자리는 그대로이고
 * 칸 폭과 층 간격만 줄어든다 (S-view).
 */

import type { ViewInstance, ViewMountParams, CanvasView } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 700;
const H = 490;

/** 그래프 층 — 정점 원이 놓이는 사각 영역. */
const GRAPH_X0 = 110;
const GRAPH_X1 = 590;
const GRAPH_Y0 = 65;
const GRAPH_Y1 = 225;
const NODE_R = 20;
const CHIP_R = 11;

/** 줄 층 · 차례 층 — 두 층이 같은 칸 격자를 쓴다. */
const SLOT_X0 = 40;
const SLOT_W = 56;
const SLOT_H = 44;
const SLOT_GAP = 10;
const QUEUE_Y = 278;
const ORDER_Y = 394;

const TOKEN_W = 40;
const TOKEN_H = 30;
const MOVE_MS = 220;

const LABEL_GRAPH_Y = 22;
const LABEL_QUEUE_Y = 268;
const LABEL_ORDER_Y = 384;
const MARK_HEAD_Y = 350;
const MARK_TAIL_Y = 366;
const CAPTION_Y = 470;

/**
 * 정점의 처지.
 *   pending  아직 들어오는 화살이 남아 있다
 *   ready    수가 0 이 되었다 — 곧 떨어진다
 *   gone     조각이 떨어져 나갔다. 자리에는 빈 테두리만 남는다
 */
export type TopologicalSortNodeState = 'pending' | 'ready' | 'gone';
export type TopologicalSortEdgeState = 'idle' | 'active' | 'spent';

type StageEdge = { from: number; to: number };
type StageGraph = { vertexCount: number; edges: StageEdge[] };

type NodeParts = {
  circle: SVGCircleElement;
  label: SVGTextElement;
  chip: SVGCircleElement;
  chipText: SVGTextElement;
};

type EdgeParts = { line: SVGLineElement; head: SVGPolygonElement };

type TokenParts = { g: SVGGElement; rect: SVGRectElement; label: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
}

function attrs(node: SVGElement, map: Record<string, string | number>): void {
  for (const [k, val] of Object.entries(map)) node.setAttribute(k, String(val));
}

/**
 * 초기 데이터에서 구조만 꺼낸다 (C9).
 *
 * 좌표는 여기 없다 — 자리는 이 파일이 셈한다.
 */
function readGraph(raw: Record<string, unknown> | undefined): StageGraph {
  const d = raw as { vertexCount?: unknown; edges?: unknown } | undefined;
  const vertexCount = typeof d?.vertexCount === 'number' ? d.vertexCount : 0;
  const edges: StageEdge[] = [];
  if (Array.isArray(d?.edges)) {
    for (const item of d.edges) {
      const e = item as { from?: unknown; to?: unknown };
      if (typeof e?.from !== 'number' || typeof e?.to !== 'number') continue;
      if (e.from < 0 || e.from >= vertexCount || e.to < 0 || e.to >= vertexCount) continue;
      edges.push({ from: e.from, to: e.to });
    }
  }
  return { vertexCount, edges };
}

/**
 * 층 번호 — 들어오는 화살을 따라 오른쪽으로 민다.
 *
 * 간선마다 `layer[to] = max(layer[to], layer[from] + 1)` 을 정점 수만큼 되풀이한다.
 * 고리가 있어도 정점 수에서 멈추므로 돌지 않는다 (그림이 층으로 갈리지 않을 뿐이다).
 */
function layerOf(graph: StageGraph): number[] {
  const layer = new Array<number>(graph.vertexCount).fill(0);
  const cap = Math.max(0, graph.vertexCount - 1);
  for (let round = 0; round < graph.vertexCount; round += 1) {
    let moved = false;
    for (const e of graph.edges) {
      const want = Math.min(cap, layer[e.from] + 1);
      if (want > layer[e.to]) {
        layer[e.to] = want;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return layer;
}

/** 정점 자리 — 층은 가로, 층 안의 차례는 세로. */
function positionsOf(graph: StageGraph): { x: number; y: number }[] {
  const layer = layerOf(graph);
  const maxLayer = layer.reduce((a, b) => Math.max(a, b), 0);
  const buckets: number[][] = [];
  for (let l = 0; l <= maxLayer; l += 1) buckets.push([]);
  for (let v = 0; v < graph.vertexCount; v += 1) buckets[layer[v]].push(v);

  const out: { x: number; y: number }[] = Array.from({ length: graph.vertexCount }, () => ({
    x: (GRAPH_X0 + GRAPH_X1) / 2,
    y: (GRAPH_Y0 + GRAPH_Y1) / 2,
  }));
  for (let l = 0; l <= maxLayer; l += 1) {
    const x = maxLayer === 0 ? (GRAPH_X0 + GRAPH_X1) / 2 : GRAPH_X0 + (l * (GRAPH_X1 - GRAPH_X0)) / maxLayer;
    const row = buckets[l];
    for (let i = 0; i < row.length; i += 1) {
      const y =
        row.length === 1
          ? (GRAPH_Y0 + GRAPH_Y1) / 2
          : GRAPH_Y0 + (i * (GRAPH_Y1 - GRAPH_Y0)) / (row.length - 1);
      out[row[i]] = { x, y };
    }
  }
  return out;
}

/** 칸 격자 — 정점이 많아지면 폭이 줄어든다. 세로는 건드리지 않는다. */
function slotGeometry(count: number): { w: number; gap: number } {
  if (count <= 0) return { w: SLOT_W, gap: SLOT_GAP };
  const full = count * SLOT_W + (count - 1) * SLOT_GAP;
  const room = W - SLOT_X0 * 2 - 220;
  if (full <= room) return { w: SLOT_W, gap: SLOT_GAP };
  const gap = Math.max(4, SLOT_GAP - 4);
  return { w: Math.max(18, (room - gap * (count - 1)) / count), gap };
}

export const topologicalSortStageView: CanvasView = {
  canvas: { width: W, height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙였으므로 지우면 그림이
    // 통째로 사라진다 (S-view).
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const root = el('g');
    svg.appendChild(root);

    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const slotLayer = el('g');
    const markLayer = el('g');
    const tokenLayer = el('g');
    const textLayer = el('g');
    for (const l of [edgeLayer, nodeLayer, slotLayer, markLayer, tokenLayer, textLayer]) {
      root.appendChild(l);
    }

    let graph: StageGraph = readGraph(params.initialData);
    let pos = positionsOf(graph);
    let geo = slotGeometry(graph.vertexCount);
    const nodes = new Map<number, NodeParts>();
    const edges = new Map<string, EdgeParts>();
    const tokens = new Map<number, TokenParts>();
    const queueSlots: SVGRectElement[] = [];
    const orderSlots: SVGRectElement[] = [];
    /** 정점마다 지금 붙어 있는 수. 칩을 다시 칠할 때 읽는다. */
    const chipValue = new Map<number, number>();
    /** 방금 바뀐 칩. 다음 것이 바뀌면 식는다 — 주황은 "지금" 이라는 뜻이다. */
    let hotChip: number | undefined;

    const slotCx = (i: number): number => SLOT_X0 + i * (geo.w + geo.gap) + geo.w / 2;

    // ── 층 이름과 아래 캡션. 문안은 저작 선언에서 온다 (C10).
    const mkText = (
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      weight = '400',
    ): SVGTextElement => {
      const t = el('text');
      attrs(t, { x, y, 'text-anchor': anchor, fill });
      t.style.font = `${weight} ${size} ${fonts.body}`;
      return t;
    };

    const graphLabel = mkText(SLOT_X0, LABEL_GRAPH_Y, fontSizes.sm, c.textMuted, 'start');
    const queueLabel = mkText(SLOT_X0, LABEL_QUEUE_Y, fontSizes.sm, c.textMuted, 'start');
    const orderLabel = mkText(SLOT_X0, LABEL_ORDER_Y, fontSizes.sm, c.textMuted, 'start');
    const tallyText = mkText(W - SLOT_X0 / 2, ORDER_Y + SLOT_H / 2 + 5, fontSizes.md, c.textMuted, 'end', '600');
    const caption = mkText(SLOT_X0, CAPTION_Y, fontSizes.md, c.text, 'start');
    graphLabel.textContent = tr(
      'label.graph',
      'Graph — the number on a vertex is how many arrows still point at it',
    );
    queueLabel.textContent = tr('label.queue', 'Queue — one array with a head and a tail');
    orderLabel.textContent = tr('label.order', 'Order — what comes out, left to right');
    for (const t of [graphLabel, queueLabel, orderLabel, tallyText, caption]) textLayer.appendChild(t);

    // head / tail 은 그 분야에서 원어 그대로 쓰는 말이라 표식으로 둔다 (C10).
    const headMark = el('polygon');
    const tailMark = el('polygon');
    const headText = mkText(0, MARK_HEAD_Y, fontSizes.sm, c.auxCursor, 'middle', '600');
    const tailText = mkText(0, MARK_TAIL_Y, fontSizes.sm, c.auxCursor, 'middle', '600');
    for (const m of [headMark, tailMark]) {
      attrs(m, { fill: c.auxCursor });
      markLayer.appendChild(m);
    }
    markLayer.appendChild(headText);
    markLayer.appendChild(tailText);

    /**
     * 들어오는 화살 수 칩.
     *
     * 0 이면 노랑 — 앞을 막는 것이 없다는 뜻이다. 마운트 직후에는 아직 세지
     * 않았으므로 모두 0 이고 모두 노랗다가, 세는 동안 하나씩 식는다. 다 세고
     * 나서 노랗게 남아 있는 것이 곧 먼저 갈 수 있는 것이다.
     */
    function paintChip(v: number, hot: boolean): void {
      const parts = nodes.get(v);
      if (!parts) return;
      const zero = (chipValue.get(v) ?? 0) === 0;
      attrs(parts.chip, {
        fill: zero ? c.itemPivot : hot ? c.itemComparing : c.bgSubtle,
        stroke: zero ? c.text : c.border,
      });
      attrs(parts.chipText, { fill: zero ? c.text : hot ? c.textInverse : c.textMuted });
    }

    function paintNode(v: number, state: TopologicalSortNodeState): void {
      const parts = nodes.get(v);
      if (!parts) return;
      if (state === 'gone') {
        attrs(parts.circle, { fill: c.bg, stroke: c.ghostOutline, 'stroke-dasharray': '3 3' });
        attrs(parts.label, { fill: c.textMuted });
      } else if (state === 'ready') {
        attrs(parts.circle, { fill: c.itemPivot, stroke: c.text, 'stroke-dasharray': 'none' });
        attrs(parts.label, { fill: c.text });
      } else {
        // 아직 막혀 있는 것. 떨어져 나간 것(ghostOutline 점선)보다 진해야
        // "남아 있다" 로 읽힌다.
        attrs(parts.circle, { fill: c.itemDefault, stroke: c.textMuted, 'stroke-dasharray': 'none' });
        attrs(parts.label, { fill: c.text });
      }
    }

    function drawEdge(from: number, to: number): void {
      const a = pos[from];
      const b = pos[to];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const sx = a.x + ux * (NODE_R + 2);
      const sy = a.y + uy * (NODE_R + 2);
      const ex = b.x - ux * (NODE_R + 10);
      const ey = b.y - uy * (NODE_R + 10);
      const line = el('line');
      attrs(line, { x1: sx, y1: sy, x2: ex, y2: ey, stroke: c.textMuted, 'stroke-width': 2 });
      const head = el('polygon');
      const px = -uy;
      const py = ux;
      attrs(head, {
        points: [
          `${ex + ux * 9},${ey + uy * 9}`,
          `${ex + px * 4.5},${ey + py * 4.5}`,
          `${ex - px * 4.5},${ey - py * 4.5}`,
        ].join(' '),
        fill: c.textMuted,
      });
      edgeLayer.appendChild(line);
      edgeLayer.appendChild(head);
      edges.set(`${from}-${to}`, { line, head });
    }

    function build(): void {
      for (const layer of [edgeLayer, nodeLayer, slotLayer, tokenLayer]) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
      }
      nodes.clear();
      edges.clear();
      tokens.clear();
      chipValue.clear();
      hotChip = undefined;
      queueSlots.length = 0;
      orderSlots.length = 0;

      pos = positionsOf(graph);
      geo = slotGeometry(graph.vertexCount);

      for (const e of graph.edges) drawEdge(e.from, e.to);

      for (let v = 0; v < graph.vertexCount; v += 1) {
        const g = el('g');
        const circle = el('circle');
        attrs(circle, { cx: pos[v].x, cy: pos[v].y, r: NODE_R, 'stroke-width': 2 });
        const label = mkText(pos[v].x, pos[v].y + 6, fontSizes.lg, c.text, 'middle', '600');
        label.textContent = String(v);
        const chip = el('circle');
        attrs(chip, {
          cx: pos[v].x + NODE_R - 2,
          cy: pos[v].y - NODE_R + 2,
          r: CHIP_R,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        });
        const chipText = mkText(
          pos[v].x + NODE_R - 2,
          pos[v].y - NODE_R + 6,
          fontSizes.xs,
          c.textMuted,
          'middle',
          '600',
        );
        chipText.textContent = '0';
        g.appendChild(circle);
        g.appendChild(label);
        g.appendChild(chip);
        g.appendChild(chipText);
        nodeLayer.appendChild(g);
        nodes.set(v, { circle, label, chip, chipText });
        chipValue.set(v, 0);
        paintNode(v, 'pending');
        paintChip(v, false);
      }

      for (let i = 0; i < graph.vertexCount; i += 1) {
        for (const [y, bucket] of [
          [QUEUE_Y, queueSlots] as const,
          [ORDER_Y, orderSlots] as const,
        ]) {
          const r = el('rect');
          attrs(r, {
            x: SLOT_X0 + i * (geo.w + geo.gap),
            y,
            width: geo.w,
            height: SLOT_H,
            rx: 4,
            fill: c.bgSubtle,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '4 3',
          });
          slotLayer.appendChild(r);
          bucket.push(r);
        }
      }

      moveMark(headMark, headText, 0, 'head');
      moveMark(tailMark, tailText, 0, 'tail');
    }

    function moveMark(
      poly: SVGPolygonElement,
      text: SVGTextElement,
      index: number,
      glyph: 'head' | 'tail',
    ): void {
      const clamped = Math.min(index, Math.max(0, graph.vertexCount - 1));
      const cx = graph.vertexCount === 0 ? SLOT_X0 : slotCx(clamped);
      const past = index >= graph.vertexCount ? geo.w / 2 + geo.gap : 0;
      const x = cx + past;
      const top = QUEUE_Y + SLOT_H + 4;
      attrs(poly, { points: `${x},${top} ${x - 6},${top + 9} ${x + 6},${top + 9}` });
      attrs(text, { x });
      text.textContent = `${glyph} ${index}`;
    }

    function tokenOf(v: number): TokenParts {
      const found = tokens.get(v);
      if (found) return found;
      const g = el('g');
      const rect = el('rect');
      attrs(rect, {
        x: -TOKEN_W / 2,
        y: -TOKEN_H / 2,
        width: TOKEN_W,
        height: TOKEN_H,
        rx: 6,
        fill: c.itemPivot,
        stroke: c.text,
        'stroke-width': 1.5,
      });
      const label = mkText(0, 5, fontSizes.md, c.text, 'middle', '700');
      label.textContent = String(v);
      g.appendChild(rect);
      g.appendChild(label);
      g.style.transform = `translate(${pos[v].x}px, ${pos[v].y}px)`;
      tokenLayer.appendChild(g);
      // 시작 자리를 브라우저가 확정해야 다음 대입이 전이(transition)가 된다.
      // 값을 쓰지 않고 읽기만 한다 — 이 한 줄이 없으면 조각이 순간이동한다.
      void g.getBoundingClientRect();
      g.style.transition = `transform ${MOVE_MS}ms ease-out`;
      const parts: TokenParts = { g, rect, label };
      tokens.set(v, parts);
      return parts;
    }

    build();

    const instance: ViewInstance = {
      /** 초기 구조를 갈아 끼운다 (러너의 reset 경로). */
      setGraph(next: unknown): void {
        graph = readGraph(next as Record<string, unknown> | undefined);
        build();
        caption.textContent = '';
        tallyText.textContent = '';
      },

      setIndegree(vertex: number, value: number): void {
        const parts = nodes.get(vertex);
        if (!parts) return;
        if (hotChip !== undefined && hotChip !== vertex) paintChip(hotChip, false);
        hotChip = vertex;
        chipValue.set(vertex, value);
        parts.chipText.textContent = String(value);
        paintChip(vertex, true);
      },

      setNodeState(vertex: number, state: TopologicalSortNodeState): void {
        paintNode(vertex, state);
      },

      setEdgeState(from: number, to: number, state: TopologicalSortEdgeState): void {
        const parts = edges.get(`${from}-${to}`);
        if (!parts) return;
        // 다 쓴 화살은 흐려진다 — 이 알고리즘에서 화살 하나는 딱 한 번 쓰인다.
        const stroke =
          state === 'active' ? c.itemComparing : state === 'spent' ? c.border : c.textMuted;
        attrs(parts.line, { stroke, 'stroke-width': state === 'active' ? 3 : 2 });
        attrs(parts.head, { fill: stroke });
      },

      /** 정점이 그래프에서 떨어져 줄의 tail 칸에 놓인다. */
      enqueueVertex(vertex: number, tail: number): void {
        const token = tokenOf(vertex);
        token.g.style.transform = `translate(${slotCx(tail)}px, ${QUEUE_Y + SLOT_H / 2}px)`;
        const slot = queueSlots[tail];
        if (slot) attrs(slot, { 'stroke-dasharray': 'none', stroke: c.text });
        moveMark(tailMark, tailText, tail + 1, 'tail');
      },

      /** 줄의 head 칸이 비고 머리 색인이 한 칸 나아간다. */
      dequeueVertex(_vertex: number, head: number): void {
        const slot = queueSlots[head];
        if (slot) attrs(slot, { 'stroke-dasharray': '4 3', stroke: c.ghostOutline, fill: c.bg });
        moveMark(headMark, headText, head + 1, 'head');
      },

      /** 꺼낸 정점이 다시 떨어져 차례의 자리에 앉는다. */
      placeInOrder(vertex: number, slot: number): void {
        const token = tokenOf(vertex);
        token.g.style.transform = `translate(${slotCx(slot)}px, ${ORDER_Y + SLOT_H / 2}px)`;
        attrs(token.rect, { fill: c.itemSorted, stroke: c.itemSorted });
        attrs(token.label, { fill: c.textInverse });
        const cell = orderSlots[slot];
        if (cell) attrs(cell, { 'stroke-dasharray': 'none', stroke: c.text });
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /** 꺼낸 수와 정점 수의 대조 — 고리 판정이 화면에 남는 자리. */
      setTally(text: string, tone: 'neutral' | 'good' | 'bad'): void {
        tallyText.textContent = text;
        attrs(tallyText, {
          fill: tone === 'bad' ? c.danger : tone === 'good' ? c.success : c.textMuted,
        });
      },

      destroy(): void {
        // 타이머도 리스너도 없다. 자리 옮김은 CSS transition 이 하고,
        // 노드를 떼면 그것도 함께 사라진다.
        if (root.parentNode) root.parentNode.removeChild(root);
        nodes.clear();
        edges.clear();
        tokens.clear();
        chipValue.clear();
      },
    };

    return instance;
  },
};
