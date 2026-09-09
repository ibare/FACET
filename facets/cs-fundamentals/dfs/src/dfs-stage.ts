/**
 * dfs 전용 stage — 그래프 · 호출 스택 · 방문 차례를 한 폭에 그린다.
 *
 * ── 왜 셋인가
 *
 * 이 알고리즘의 주장은 "파고들고 물러난다" 이고, 그 둘이 서로 다른 사건임을
 * 보이려면 **쌓였다가 빠지는 무엇**이 화면에 있어야 한다. 그래프만 그리면
 * 물러남이 "다음 자리로 넘어감" 과 구별되지 않는다. 그래서 오른쪽에 호출 스택을
 * 세우고, 파고들 때 프레임이 하나 쌓이고 물러날 때 하나 빠지게 했다. 아래의
 * 방문 차례 띠는 지나간 자취라 줄지 않는다 — 스택은 오르내리는데 띠는 늘기만
 * 하는 것이 곧 "본 것은 되돌리지 않는다" 이다.
 *
 * ── 색이 말하는 것 (S-view 결정 트리 1 번, 알고리즘 상태)
 *
 *   노랑 (itemPivot)     스택에 올라 있는 것 — 경로 위의 정점, 파고든 간선
 *   주황 (itemActive)    지금 이 순간의 초점 — 실행 중인 프레임, 살피는 간선
 *   회색 (itemSorted)    끝난 것 — 돌아 나온 정점, 되짚은 자국
 *   빨강 (danger)        이미 본 자리라 들어가지 못한 간선
 *
 * 뿌리에서 지금 정점까지의 노란 사슬이 곧 오른쪽 스택이다. 같은 것을 두 가지로
 * 그린 셈인데, 하나는 그래프 위의 자리이고 하나는 쌓인 높이라 서로 다른 것을
 * 말한다.
 *
 * ── 자리 잡기
 *
 * 정점 자리는 stage 가 셈한다 (`initialData` 에는 구조만 있다). 출발점에서의
 * BFS 거리로 층을 나누고 층 안에서는 발견 차례로 늘어놓는다. BFS 층 나누기는
 * 그리기 기법일 뿐이라 이 view 는 깊이 우선 탐색이 무엇인지 모른다.
 *
 * ── 세로는 마운트 뒤 바뀌지 않는다 (S-view)
 *
 * 프레임 높이와 띠 칸 너비를 정점 수로 나눠 맞추므로, 정점이 몇이든 viewBox 는
 * 그대로다. 타이머와 프레임 예약이 하나도 없다 — 상태 전이는 projector 가 걸음
 * 마다 불러 주는 메서드로만 일어나므로 destroy 가 거둘 뒷일이 없다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 410;

const CAPTION_BASELINE = 21;
const PANEL_TOP = 34;
const PANEL_BOTTOM = 336;

const GRAPH_L = 18;
const GRAPH_R = 474;
const DIVIDER_X = 492;
const STACK_L = 510;
const STACK_R = 742;

const NODE_R = 17;
const GRAPH_TOP_Y = 62;
const GRAPH_BOT_Y = 314;

const FRAME_TOP = 58;
const FRAME_MAX_STRIDE = 34;

const RIBBON_RULE_Y = 344;
const RIBBON_CELL_Y = 354;
const RIBBON_CELL_H = 30;
const RIBBON_CELL_L = 110;
const RIBBON_CELL_R = 480;
const RIBBON_MAX_STRIDE = 39;

/** 정점이 띠는 상태. 노랑 → 회색, 되돌아가지 않는다. */
export type DfsNodeState = 'idle' | 'stack' | 'done';
/** 간선에 남는 자국. */
export type DfsEdgeSettled = 'idle' | 'tree' | 'skip';
/** 지금 이 걸음에서 간선이 하는 일. */
export type DfsEdgeActive = 'look' | 'dive' | 'back';

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', { 'font-family': fonts.body, ...attrs });
  node.textContent = content;
  return node;
}

/** p 를 중심으로 d 방향을 가리키는 삼각형 꼭짓점 셋. */
function triangle(p: Pt, d: Pt, size: number): string {
  const px = -d.y;
  const py = d.x;
  const tip = `${p.x + d.x * size},${p.y + d.y * size}`;
  const a = `${p.x - d.x * size * 0.6 + px * size * 0.7},${p.y - d.y * size * 0.6 + py * size * 0.7}`;
  const b = `${p.x - d.x * size * 0.6 - px * size * 0.7},${p.y - d.y * size * 0.6 - py * size * 0.7}`;
  return `${tip} ${a} ${b}`;
}

/**
 * 출발점에서의 BFS 거리로 층을 나누고, 층 안의 차례는 발견 차례로 둔다.
 * 닿지 않는 정점은 맨 아래 층에 모은다. 그리기 기법일 뿐이라 이 view 는
 * 깊이 우선 탐색이 무엇인지 몰라도 된다.
 */
function layerOf(adjacency: number[][], start: number): { depth: number[]; rank: number[] } {
  const n = adjacency.length;
  const depth = new Array<number>(n).fill(-1);
  const rank = new Array<number>(n).fill(n);
  if (n === 0) return { depth, rank };
  const s = start >= 0 && start < n ? start : 0;
  depth[s] = 0;
  const queue = [s];
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head]!;
    rank[v] = head;
    for (const w of adjacency[v] ?? []) {
      if (w < 0 || w >= n || depth[w] !== -1) continue;
      depth[w] = depth[v]! + 1;
      queue.push(w);
    }
  }
  const reached = Math.max(0, ...depth);
  for (let i = 0; i < n; i++) if (depth[i] === -1) depth[i] = reached + 1;
  return { depth, rank };
}

type EdgeParts = {
  line: SVGLineElement;
  head: SVGPolygonElement;
  dive: SVGPolygonElement;
  back: SVGPolygonElement;
  cross: SVGPathElement;
  settled: DfsEdgeSettled;
};

type NodeParts = {
  ring: SVGCircleElement;
  disc: SVGCircleElement;
  label: SVGTextElement;
  state: DfsNodeState;
};

type FrameParts = {
  box: SVGRectElement;
  name: SVGTextElement;
  cursor: SVGTextElement;
};

type CellParts = {
  box: SVGRectElement;
  label: SVGTextElement;
  /** 이 칸이 맡은 정점. 아직 비었으면 -1. */
  node: number;
};

export const dfsStageView: CanvasView = {
  canvas: { width: W, height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 캔버스는 러너가 이미 container 에 붙여 두었다. container 를 비우면 그것이
    // 떨어져 나간다 (S-view) — 여기서는 캔버스 안쪽에만 그린다.
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const root = el('g', {});
    svg.appendChild(root);

    // ── 고정 골격 ──────────────────────────────────────────────────────────
    const caption = text('', {
      x: GRAPH_L,
      y: CAPTION_BASELINE,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    root.appendChild(caption);

    root.appendChild(
      el('line', {
        x1: DIVIDER_X,
        y1: PANEL_TOP,
        x2: DIVIDER_X,
        y2: PANEL_BOTTOM,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    root.appendChild(
      el('line', {
        x1: GRAPH_L,
        y1: RIBBON_RULE_Y,
        x2: STACK_R,
        y2: RIBBON_RULE_Y,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );
    root.appendChild(
      text(tr('label.stack', 'Call stack'), {
        x: STACK_L,
        y: PANEL_TOP + 14,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }),
    );
    root.appendChild(
      text(tr('label.order', 'Visit order'), {
        x: GRAPH_L,
        y: RIBBON_CELL_Y + RIBBON_CELL_H / 2 + 4,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }),
    );

    // 범례 — 두 사건이 서로 다른 일임을 글자로도 한 번 못박는다.
    const legendY = RIBBON_CELL_Y + 8;
    root.appendChild(
      el('polygon', {
        points: triangle({ x: STACK_L + 6, y: legendY }, { x: 0, y: 1 }, 6),
        fill: colors.itemPivot,
        stroke: colors.stateInk,
        'stroke-width': 0.75,
      }),
    );
    root.appendChild(
      text(tr('legend.dive', 'dive into a branch'), {
        x: STACK_L + 20,
        y: legendY + 4,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }),
    );
    root.appendChild(
      el('polygon', {
        points: triangle({ x: STACK_L + 6, y: legendY + 22 }, { x: 0, y: -1 }, 6),
        fill: colors.itemSorted,
      }),
    );
    root.appendChild(
      text(tr('legend.back', 'come back out'), {
        x: STACK_L + 20,
        y: legendY + 26,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      }),
    );

    // ── 내용에 따라 정해지는 부분 ──────────────────────────────────────────
    const edgeLayer = el('g', {});
    const nodeLayer = el('g', {});
    const frameLayer = el('g', {});
    const cellLayer = el('g', {});
    root.appendChild(edgeLayer);
    root.appendChild(nodeLayer);
    root.appendChild(frameLayer);
    root.appendChild(cellLayer);

    let center: Pt[] = [];
    let nodes: NodeParts[] = [];
    let edges = new Map<string, EdgeParts>();
    let frames: FrameParts[] = [];
    let cells: CellParts[] = [];
    /** 스택에 올라 있는 정점 (아래로 갈수록 깊다). */
    let stack: number[] = [];
    let active: { key: string; kind: DfsEdgeActive } | null = null;

    const keyOf = (from: number, to: number): string => `${from}>${to}`;

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    function paintNode(i: number): void {
      const parts = nodes[i];
      if (!parts) return;
      const fill =
        parts.state === 'stack'
          ? colors.itemPivot
          : parts.state === 'done'
            ? colors.itemSorted
            : colors.itemDefault;
      const stroke =
        parts.state === 'idle' ? colors.border : fill;
      const ink =
        parts.state === 'stack'
          ? colors.stateInk
          : parts.state === 'done'
            ? colors.textInverse
            : colors.text;
      parts.disc.setAttribute('fill', fill);
      parts.disc.setAttribute('stroke', stroke);
      parts.label.setAttribute('fill', ink);
      const top = stack.length > 0 && stack[stack.length - 1] === i;
      parts.ring.setAttribute('opacity', top ? '1' : '0');
    }

    function paintCell(slot: number): void {
      const parts = cells[slot];
      if (!parts) return;
      const node = parts.node;
      if (node < 0) {
        parts.box.setAttribute('fill', 'none');
        parts.box.setAttribute('stroke', colors.border);
        parts.box.setAttribute('stroke-dasharray', '3 3');
        parts.label.textContent = '';
        return;
      }
      const state = nodes[node]?.state ?? 'idle';
      const fill = state === 'done' ? colors.itemSorted : colors.itemPivot;
      parts.box.setAttribute('fill', fill);
      parts.box.setAttribute('stroke', fill);
      parts.box.setAttribute('stroke-dasharray', 'none');
      parts.label.setAttribute(
        'fill',
        state === 'done' ? colors.textInverse : colors.stateInk,
      );
    }

    /** 정점 상태가 바뀌면 그래프와 띠를 같이 고친다 — 둘은 같은 사실을 말한다. */
    function setNodeState(node: number, state: DfsNodeState): void {
      const parts = nodes[node];
      if (!parts) return;
      parts.state = state;
      paintNode(node);
      for (let s = 0; s < cells.length; s++) {
        if (cells[s]!.node === node) paintCell(s);
      }
    }

    function paintEdge(key: string): void {
      const e = edges.get(key);
      if (!e) return;
      const kind = active?.key === key ? active.kind : null;
      let stroke = colors.border;
      let width = 1.5;
      let dash = 'none';
      if (e.settled === 'tree') {
        stroke = colors.primary;
        width = 2;
      } else if (e.settled === 'skip') {
        stroke = colors.danger;
        width = 2;
        dash = '4 3';
      }
      if (kind === 'look') {
        stroke = colors.itemComparing;
        width = 3.5;
        dash = '5 3';
      } else if (kind === 'dive') {
        stroke = colors.itemPivot;
        width = 4.5;
        dash = 'none';
      } else if (kind === 'back') {
        stroke = colors.itemSorted;
        width = 4.5;
        dash = 'none';
      }
      e.line.setAttribute('stroke', stroke);
      e.line.setAttribute('stroke-width', String(width));
      e.line.setAttribute('stroke-dasharray', dash);
      e.head.setAttribute('fill', stroke);
      e.cross.setAttribute('opacity', e.settled === 'skip' ? '1' : '0');
    }

    function setGraph(adjacency: number[][], start: number): void {
      clearLayer(edgeLayer);
      clearLayer(nodeLayer);
      clearLayer(frameLayer);
      clearLayer(cellLayer);
      center = [];
      nodes = [];
      edges = new Map();
      frames = [];
      cells = [];
      stack = [];
      active = null;

      const n = adjacency.length;
      if (n === 0) return;

      // 층 나누기 → 층 안 차례 → 좌표.
      const { depth, rank } = layerOf(adjacency, start);
      const layerCount = Math.max(...depth) + 1;
      const perLayer: number[][] = Array.from({ length: layerCount }, () => []);
      for (let i = 0; i < n; i++) perLayer[depth[i]!]!.push(i);
      for (const row of perLayer) row.sort((a, b) => rank[a]! - rank[b]! || a - b);
      const gap = layerCount > 1 ? (GRAPH_BOT_Y - GRAPH_TOP_Y) / (layerCount - 1) : 0;
      const span = GRAPH_R - GRAPH_L;
      for (let d = 0; d < layerCount; d++) {
        const row = perLayer[d]!;
        for (let k = 0; k < row.length; k++) {
          center[row[k]!] = {
            x: GRAPH_L + ((k + 1) / (row.length + 1)) * span,
            y: GRAPH_TOP_Y + gap * d,
          };
        }
      }

      // 간선 — 원 둘레에서 원 둘레까지. 자국 셋을 미리 만들어 두고 켜고 끈다.
      for (let v = 0; v < n; v++) {
        for (const w of adjacency[v] ?? []) {
          if (w < 0 || w >= n || w === v) continue;
          const key = keyOf(v, w);
          if (edges.has(key)) continue;
          const a = center[v]!;
          const b = center[w]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const u = { x: dx / len, y: dy / len };
          const p1 = { x: a.x + u.x * NODE_R, y: a.y + u.y * NODE_R };
          const p2 = { x: b.x - u.x * (NODE_R + 7), y: b.y - u.y * (NODE_R + 7) };
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          // 들어가는 자국과 나오는 자국을 간선 양옆 차선에 나눠 둔다. 앞뒤로
          // 늘어놓으면 짧은 간선(층 사이가 좁을 때)에서 둘이 겹쳐 붙는다.
          const perp = { x: -u.y, y: u.x };
          const lane = (side: number): Pt => ({
            x: mid.x + perp.x * 7 * side,
            y: mid.y + perp.y * 7 * side,
          });

          const g = el('g', {});
          const line = el('line', {
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            stroke: colors.border,
            'stroke-width': 1.5,
            'stroke-linecap': 'round',
          });
          const head = el('polygon', {
            points: triangle({ x: p2.x + u.x * 3, y: p2.y + u.y * 3 }, u, 4.5),
            fill: colors.border,
          });
          const dive = el('polygon', {
            points: triangle(lane(1), u, 6),
            fill: colors.itemPivot,
            stroke: colors.stateInk,
            'stroke-width': 0.75,
            opacity: 0,
          });
          const back = el('polygon', {
            points: triangle(lane(-1), { x: -u.x, y: -u.y }, 6),
            fill: colors.itemSorted,
            opacity: 0,
          });
          const cross = el('path', {
            d: `M ${mid.x - 5} ${mid.y - 5} L ${mid.x + 5} ${mid.y + 5} M ${mid.x + 5} ${mid.y - 5} L ${mid.x - 5} ${mid.y + 5}`,
            stroke: colors.danger,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            opacity: 0,
          });
          g.appendChild(line);
          g.appendChild(head);
          g.appendChild(back);
          g.appendChild(dive);
          g.appendChild(cross);
          edgeLayer.appendChild(g);
          edges.set(key, { line, head, dive, back, cross, settled: 'idle' });
        }
      }

      // 정점.
      for (let i = 0; i < n; i++) {
        const c = center[i]!;
        const g = el('g', {});
        const ring = el('circle', {
          cx: c.x,
          cy: c.y,
          r: NODE_R + 4,
          fill: 'none',
          stroke: colors.itemActive,
          'stroke-width': 3,
          opacity: 0,
        });
        const disc = el('circle', {
          cx: c.x,
          cy: c.y,
          r: NODE_R,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        const label = text(String(i), {
          x: c.x,
          y: c.y + 5,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
          fill: colors.text,
        });
        g.appendChild(ring);
        g.appendChild(disc);
        g.appendChild(label);
        nodeLayer.appendChild(g);
        nodes[i] = { ring, disc, label, state: 'idle' };
      }

      // 호출 스택 자리 — 정점 수만큼 미리 잡는다. 세로가 뒤에 바뀌지 않도록
      // 프레임 높이를 여기서 한 번 정한다 (S-view).
      const stride = Math.min(FRAME_MAX_STRIDE, Math.floor((PANEL_BOTTOM - FRAME_TOP) / n));
      const frameH = Math.max(12, stride - 6);
      for (let i = 0; i < n; i++) {
        const y = FRAME_TOP + stride * i;
        const g = el('g', {});
        const box = el('rect', {
          x: STACK_L,
          y,
          width: STACK_R - STACK_L,
          height: frameH,
          rx: 4,
          fill: colors.itemPivot,
          stroke: colors.itemPivot,
          'stroke-width': 1,
        });
        const name = text('', {
          x: STACK_L + 12,
          y: y + frameH / 2 + 4,
          'font-size': fontSizes.md,
          fill: colors.stateInk,
        });
        const cursor = text('', {
          x: STACK_R - 12,
          y: y + frameH / 2 + 4,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
          fill: colors.stateInk,
        });
        g.appendChild(box);
        g.appendChild(name);
        g.appendChild(cursor);
        frameLayer.appendChild(g);
        frames[i] = { box, name, cursor };
      }

      // 방문 차례 띠.
      const cellStride = Math.min(
        RIBBON_MAX_STRIDE,
        Math.floor((RIBBON_CELL_R - RIBBON_CELL_L) / n),
      );
      const cellW = Math.max(10, cellStride - 5);
      for (let i = 0; i < n; i++) {
        const x = RIBBON_CELL_L + cellStride * i;
        const g = el('g', {});
        const box = el('rect', {
          x,
          y: RIBBON_CELL_Y,
          width: cellW,
          height: RIBBON_CELL_H,
          rx: 4,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        const label = text('', {
          x: x + cellW / 2,
          y: RIBBON_CELL_Y + RIBBON_CELL_H / 2 + 5,
          'font-size': fontSizes.md,
          'text-anchor': 'middle',
          fill: colors.text,
        });
        g.appendChild(box);
        g.appendChild(label);
        cellLayer.appendChild(g);
        cells[i] = { box, label, node: -1 };
      }

      // 빈 프레임 자리를 점선 눈금으로 세워 둔다.
      paintFrames();
    }

    /**
     * 빈 자리는 감추지 않고 점선 틀로 남긴다 — 눈금이 있어야 "쌓였다" 와
     * "빠졌다" 가 높이로 읽힌다.
     */
    function paintFrames(): void {
      for (let i = 0; i < frames.length; i++) {
        const parts = frames[i]!;
        const node = stack[i];
        if (node === undefined) {
          parts.box.setAttribute('fill', 'none');
          parts.box.setAttribute('stroke', colors.border);
          parts.box.setAttribute('stroke-width', '1');
          parts.box.setAttribute('stroke-dasharray', '3 3');
          parts.name.textContent = '';
          parts.cursor.textContent = '';
          continue;
        }
        parts.name.textContent = String(node);
        const top = i === stack.length - 1;
        parts.box.setAttribute('fill', colors.itemPivot);
        parts.box.setAttribute('stroke', top ? colors.itemActive : colors.itemPivot);
        parts.box.setAttribute('stroke-width', top ? '2.5' : '1');
        parts.box.setAttribute('stroke-dasharray', 'none');
      }
    }

    /** 정점에 들어섰다 — 프레임이 하나 쌓이고 띠에 자국이 하나 는다. */
    function pushFrame(node: number, seq: number, neighborCount: number): void {
      if (!nodes[node]) return;
      const previousTop = stack[stack.length - 1];
      stack.push(node);
      setNodeState(node, 'stack');
      if (previousTop !== undefined) paintNode(previousTop);
      const slot = cells[seq - 1];
      if (slot) {
        slot.node = node;
        slot.label.textContent = String(node);
        paintCell(seq - 1);
      }
      paintFrames();
      const parts = frames[stack.length - 1];
      if (parts) parts.cursor.textContent = `0/${neighborCount}`;
    }

    /** 꼭대기 프레임이 몇 번째 이웃까지 보았는지. */
    function setFrameCursor(index: number, total: number): void {
      const parts = frames[stack.length - 1];
      if (parts) parts.cursor.textContent = `${index + 1}/${total}`;
    }

    /** 프레임이 빠진다 — 정점은 굳고, 그 아래 프레임이 다시 꼭대기가 된다. */
    function popFrame(node: number): void {
      if (stack[stack.length - 1] === node) stack.pop();
      setNodeState(node, 'done');
      const top = stack[stack.length - 1];
      if (top !== undefined) paintNode(top);
      paintFrames();
    }

    /**
     * 지금 이 걸음에서 간선이 하는 일. 앞 걸음의 표시는 자동으로 걷힌다.
     * `'back'` 은 되짚은 자국(▲)을 영구로 남긴다 — 들어간 만큼 나왔다는 기록이다.
     */
    function setActiveEdge(from: number, to: number, kind: DfsEdgeActive): void {
      const previous = active?.key;
      active = { key: keyOf(from, to), kind };
      if (previous !== undefined && previous !== active.key) paintEdge(previous);
      const e = edges.get(active.key);
      if (e && kind === 'back') e.back.setAttribute('opacity', '1');
      paintEdge(active.key);
    }

    function clearActiveEdge(): void {
      const previous = active?.key;
      active = null;
      if (previous !== undefined) paintEdge(previous);
    }

    /** 간선에 자국을 남긴다. `'tree'` 는 파고든 자국(▼)을 함께 켠다. */
    function settleEdge(from: number, to: number, kind: DfsEdgeSettled): void {
      const key = keyOf(from, to);
      const e = edges.get(key);
      if (!e) return;
      e.settled = kind;
      if (kind === 'tree') e.dive.setAttribute('opacity', '1');
      paintEdge(key);
    }

    function setCaption(value: string): void {
      caption.textContent = value;
    }

    function reset(): void {
      stack = [];
      active = null;
      for (let i = 0; i < nodes.length; i++) {
        nodes[i]!.state = 'idle';
        paintNode(i);
      }
      for (const [key, e] of edges) {
        e.settled = 'idle';
        e.dive.setAttribute('opacity', '0');
        e.back.setAttribute('opacity', '0');
        paintEdge(key);
      }
      for (let i = 0; i < cells.length; i++) {
        cells[i]!.node = -1;
        paintCell(i);
      }
      paintFrames();
      caption.textContent = '';
    }

    // 러너가 initialData 를 넘겨 주면 마운트 시점에 그래프가 이미 서 있다.
    const initial = params.initialData as
      | { adjacency?: unknown; start?: unknown }
      | undefined;
    if (Array.isArray(initial?.adjacency)) {
      const rows = (initial.adjacency as unknown[]).map((row) =>
        Array.isArray(row) ? row.filter((x): x is number => typeof x === 'number') : [],
      );
      setGraph(rows, typeof initial.start === 'number' ? initial.start : 0);
    }

    return {
      setGraph,
      pushFrame,
      setFrameCursor,
      popFrame,
      setActiveEdge,
      clearActiveEdge,
      settleEdge,
      setCaption,
      reset,
      destroy(): void {
        // 타이머도 프레임 예약도 애초에 없다 — 상태 전이는 projector 가 걸음마다
        // 불러 주는 메서드로만 일어난다. 그린 것만 거두면 뒷일이 남지 않는다.
        root.remove();
      },
    };
  },
};
