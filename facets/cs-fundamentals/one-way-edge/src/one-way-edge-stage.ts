/**
 * one-way-edge-stage — 방향 간선 조각의 그림.
 *
 * ── 왜 이 배치인가
 *
 * 동사가 "끊긴다" 이므로 선 하나가 **두 개의 차선**으로 그려진다. 화살이 없을
 * 때는 두 차선이 서로 반대 방향으로 나란히 놓이고 (양쪽으로 통한다), 방향이
 * 붙으면 거스르는 차선이 바깥으로 밀려나 떨어져 나가고 남은 차선이 가운데로
 * 옮겨 온다. 색이 바뀌는 것이 아니라 선이 자리를 옮겨 사라진다.
 *
 * 정점은 고리 위에 놓는다 — 출발점을 왼쪽(180°)에 두고 배열 순서대로 시계
 * 방향. 왼쪽에서 오른쪽으로 읽는 방향이 답사가 나아가는 방향과 맞는다.
 * 닿지 못한 정점은 고리 **밖으로 밀려나며**, 그때도 그 정점에서 나가는 화살은
 * 늘어난 채 고리를 향해 남는다 — 나갈 수는 있고 들어올 수만 없다는 비대칭이
 * 그 한 장면에 다 들어간다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 밀려나는 자리는 캔버스 안으로
 * 물린다.
 *
 * 화면 문자는 캡션 하나뿐이고 그 문안은 projector 가 준다 (C10). 이 파일이
 * 스스로 그리는 글자는 정점 이름 — 데이터가 준 표식 — 뿐이다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캡션 한 줄 + 고리 + 밀려난 정점이 들어갈 만큼. 마운트 뒤 바뀌지 않는다. */
const H = 316;

const SIDE = 30;
const NODE_R = 22;
/** 고리는 남는 폭을 좌우 여백으로 버리지 않고 캔버스를 가로로 채운다. */
const RX = W / 2 - SIDE - NODE_R;
const RY = 86;
const CX = W / 2;
const CY = 152;

const CAPTION_Y = 28;
/** 차선이 중심선에서 벗어나는 거리. 두 차선이 이만큼씩 반대쪽으로 놓인다. */
const LANE = 5;
/** 끊긴 차선이 밀려나며 떨어지는 거리. */
const CUT_SHIFT = 20;
/** 정점 테두리와 선 끝 사이의 숨. */
const GAP = 7;
const HEAD_L = 10;
const HEAD_W = 8;
/** 닿지 못한 정점이 고리 밖으로 밀려나는 거리. */
const PUSH = 68;
const EDGE_MARGIN = 8;

const CUT_MS = 420;
const CUT_STAGGER = 70;
const POP_MS = 170;
const PROBE_OUT_MS = 320;
const PROBE_BACK_MS = 260;
const PUSH_MS = 560;

type EdgeSpec = { u: string; v: string; dir: 'uv' | 'vu' };
type GraphSpec = { nodes: string[]; edges: EdgeSpec[]; source: string };
type NodeState = 'default' | 'source' | 'reached' | 'stranded';
type Point = { x: number; y: number };

type Lane = {
  from: string;
  to: string;
  /** 중심선에서 벗어난 거리. 방향이 붙으면 남는 차선은 0 으로 온다. */
  off: number;
  opacity: number;
  cut: boolean;
  line: SVGLineElement;
  head: SVGPolygonElement;
};

type NodeShape = { group: SVGGElement; circle: SVGCircleElement; label: SVGTextElement };

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** 한 축에서 `v` 가 `dir` 방향으로 경계에 닿기까지 갈 수 있는 거리. */
function travel(v: number, dir: number, lo: number, hi: number): number {
  if (Math.abs(dir) < 1e-6) return Number.POSITIVE_INFINITY;
  return dir > 0 ? (hi - v) / dir : (lo - v) / dir;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const oneWayEdgeStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);

    const root = el('g');
    const gEdges = el('g');
    const gPulse = el('g');
    const gNodes = el('g');
    const caption = el('text', {
      x: CX,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(gEdges);
    root.appendChild(gPulse);
    root.appendChild(gNodes);
    root.appendChild(caption);
    svg.appendChild(root);

    // ── 시간 축. destroy 는 예약된 프레임·타이머를 모두 거두고, 기다리는
    //    약속도 풀어 준다 (풀지 않으면 알고리즘이 emit 에서 영영 멈춘다).
    let destroyed = false;
    const rafIds = new Set<number>();
    const timerIds = new Set<ReturnType<typeof setTimeout>>();
    const pending = new Set<() => void>();

    function frame(cb: () => void): void {
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          rafIds.delete(id);
          cb();
        });
        rafIds.add(id);
        return;
      }
      const id = setTimeout(() => {
        timerIds.delete(id);
        cb();
      }, 16);
      timerIds.add(id);
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          resolve();
          return;
        }
        pending.add(resolve);
        const id = setTimeout(() => {
          timerIds.delete(id);
          pending.delete(resolve);
          resolve();
        }, ms);
        timerIds.add(id);
      });
    }

    function tween(ms: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          step(1);
          resolve();
          return;
        }
        pending.add(resolve);
        const t0 = Date.now();
        const run = (): void => {
          if (destroyed) {
            pending.delete(resolve);
            resolve();
            return;
          }
          const t = Math.min(1, (Date.now() - t0) / ms);
          step(t);
          if (t >= 1) {
            pending.delete(resolve);
            resolve();
            return;
          }
          frame(run);
        };
        frame(run);
      });
    }

    // ── 그래프 상태.
    let graph: GraphSpec = { nodes: [], edges: [], source: '' };
    const pos = new Map<string, Point>();
    const state = new Map<string, NodeState>();
    const shapes = new Map<string, NodeShape>();
    let lanes: Lane[] = [];

    function ringPos(index: number, count: number, sourceIndex: number): Point {
      // 출발점을 왼쪽에 두고 배열 순서대로 시계 방향.
      const a = Math.PI + ((index - sourceIndex) * 2 * Math.PI) / count;
      return { x: CX + RX * Math.cos(a), y: CY + RY * Math.sin(a) };
    }

    function nodeFill(s: NodeState): string {
      if (s === 'source') return c.accent;
      if (s === 'reached') return c.itemSorted;
      if (s === 'stranded') return c.bg;
      return c.itemDefault;
    }

    function nodeStroke(s: NodeState): string {
      if (s === 'source') return c.accent;
      if (s === 'reached') return c.itemSorted;
      if (s === 'stranded') return c.danger;
      return c.textMuted;
    }

    function nodeInk(s: NodeState): string {
      if (s === 'source') return c.stateInk;
      if (s === 'reached') return c.textInverse;
      if (s === 'stranded') return c.danger;
      return c.text;
    }

    function paint(id: string): void {
      const shape = shapes.get(id);
      const s = state.get(id) ?? 'default';
      if (!shape) return;
      shape.circle.setAttribute('fill', nodeFill(s));
      shape.circle.setAttribute('stroke', nodeStroke(s));
      shape.circle.setAttribute('stroke-width', s === 'default' ? '1.8' : '2');
      if (s === 'stranded') shape.circle.setAttribute('stroke-dasharray', '5 4');
      else shape.circle.removeAttribute('stroke-dasharray');
      shape.label.setAttribute('fill', nodeInk(s));
    }

    function place(id: string): void {
      const p = pos.get(id);
      const shape = shapes.get(id);
      if (!p || !shape) return;
      shape.group.setAttribute('transform', `translate(${p.x} ${p.y})`);
    }

    /** 두 정점 사이의 방향 벡터와 법선. */
    function axis(from: string, to: string): { a: Point; b: Point; ux: number; uy: number; nx: number; ny: number } | null {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) return null;
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      return { a, b, ux, uy, nx: -uy, ny: ux };
    }

    function renderLane(lane: Lane): void {
      const ax = axis(lane.from, lane.to);
      if (!ax) return;
      const { a, b, ux, uy, nx, ny } = ax;
      const sx = a.x + ux * (NODE_R + GAP) + nx * lane.off;
      const sy = a.y + uy * (NODE_R + GAP) + ny * lane.off;
      const ex = b.x - ux * (NODE_R + GAP) + nx * lane.off;
      const ey = b.y - uy * (NODE_R + GAP) + ny * lane.off;
      lane.line.setAttribute('x1', String(sx));
      lane.line.setAttribute('y1', String(sy));
      lane.line.setAttribute('x2', String(ex - ux * HEAD_L));
      lane.line.setAttribute('y2', String(ey - uy * HEAD_L));
      const bx = ex - ux * HEAD_L;
      const by = ey - uy * HEAD_L;
      lane.head.setAttribute(
        'points',
        `${ex},${ey} ${bx + nx * (HEAD_W / 2)},${by + ny * (HEAD_W / 2)} ${bx - nx * (HEAD_W / 2)},${by - ny * (HEAD_W / 2)}`,
      );
      const stroke = lane.cut ? c.danger : c.text;
      lane.line.setAttribute('stroke', stroke);
      lane.head.setAttribute('fill', stroke);
      lane.line.setAttribute('opacity', String(lane.opacity));
      lane.head.setAttribute('opacity', String(lane.opacity));
    }

    function renderLanes(): void {
      for (const lane of lanes) renderLane(lane);
    }

    function makeLane(from: string, to: string): Lane {
      const line = el('line', { 'stroke-width': 1.9, 'stroke-linecap': 'round' });
      const head = el('polygon', {});
      gEdges.appendChild(line);
      gEdges.appendChild(head);
      return { from, to, off: LANE, opacity: 1, cut: false, line, head };
    }

    function build(): void {
      gEdges.textContent = '';
      gNodes.textContent = '';
      gPulse.textContent = '';
      pos.clear();
      state.clear();
      shapes.clear();
      lanes = [];
      caption.textContent = '';

      const count = graph.nodes.length;
      if (count === 0) return;
      const sourceIndex = Math.max(0, graph.nodes.indexOf(graph.source));

      for (const line of graph.edges) {
        lanes.push(makeLane(line.u, line.v));
        lanes.push(makeLane(line.v, line.u));
      }

      graph.nodes.forEach((id, i) => {
        const p = ringPos(i, count, sourceIndex);
        pos.set(id, { ...p });
        state.set(id, 'default');
        const group = el('g');
        const circle = el('circle', { r: NODE_R });
        const label = el('text', {
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
        });
        label.textContent = id;
        group.appendChild(circle);
        group.appendChild(label);
        gNodes.appendChild(group);
        shapes.set(id, { group, circle, label });
        place(id);
        paint(id);
      });

      renderLanes();
    }

    function findLane(from: string, to: string): Lane | undefined {
      return lanes.find((l) => l.from === from && l.to === to && !l.cut);
    }

    /** 정점 하나를 잠깐 부풀렸다 되돌린다 — 여기가 지금 자리라는 표시. */
    function popNode(id: string): Promise<void> {
      const shape = shapes.get(id);
      if (!shape) return Promise.resolve();
      return tween(POP_MS, (t) => {
        const wave = Math.sin(Math.PI * t);
        shape.circle.setAttribute('r', String(NODE_R + wave * 6));
      });
    }

    /** 한 차선을 따라 점이 건너간다. */
    function runPulse(lane: Lane, fill: string): Promise<void> {
      const ax = axis(lane.from, lane.to);
      if (!ax) return Promise.resolve();
      const dot = el('circle', { r: 6, fill });
      gPulse.appendChild(dot);
      const len = Math.hypot(ax.b.x - ax.a.x, ax.b.y - ax.a.y);
      const ms = Math.min(420, 180 + len * 0.6);
      return tween(ms, (t) => {
        const e = easeInOut(t);
        const cur = axis(lane.from, lane.to);
        if (!cur) return;
        const sx = cur.a.x + cur.ux * (NODE_R + GAP) + cur.nx * lane.off;
        const sy = cur.a.y + cur.uy * (NODE_R + GAP) + cur.ny * lane.off;
        const ex = cur.b.x - cur.ux * (NODE_R + GAP) + cur.nx * lane.off;
        const ey = cur.b.y - cur.uy * (NODE_R + GAP) + cur.ny * lane.off;
        dot.setAttribute('cx', String(sx + (ex - sx) * e));
        dot.setAttribute('cy', String(sy + (ey - sy) * e));
      }).then(() => {
        dot.remove();
      });
    }

    /** 한 선에서 거스르는 차선이 밀려나 떨어지고, 남는 차선이 가운데로 온다. */
    function cutEdge(line: EdgeSpec): Promise<void> {
      const from = line.dir === 'uv' ? line.u : line.v;
      const to = line.dir === 'uv' ? line.v : line.u;
      const keep = lanes.find((l) => l.from === from && l.to === to);
      const drop = lanes.find((l) => l.from === to && l.to === from);
      if (!keep || !drop) return Promise.resolve();
      drop.cut = true;
      return tween(CUT_MS, (t) => {
        const e = easeInOut(t);
        keep.off = LANE * (1 - e);
        drop.off = LANE + CUT_SHIFT * e;
        drop.opacity = 1 - e;
        renderLane(keep);
        renderLane(drop);
      }).then(() => {
        drop.line.remove();
        drop.head.remove();
        lanes = lanes.filter((l) => l !== drop);
      });
    }

    /** 들어가려다 되튀는 시도. 화살이 사라진 자리에 막이 선다. */
    function probe(from: string, to: string): Promise<void> {
      const ax = axis(from, to);
      if (!ax) return Promise.resolve();
      const dot = el('circle', { r: 6, fill: c.danger });
      const wall = el('line', { stroke: c.danger, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0 });
      gPulse.appendChild(wall);
      gPulse.appendChild(dot);
      const sx = ax.a.x + ax.ux * (NODE_R + GAP);
      const sy = ax.a.y + ax.uy * (NODE_R + GAP);
      const ex = ax.b.x - ax.ux * (NODE_R + GAP);
      const ey = ax.b.y - ax.uy * (NODE_R + GAP);
      const stopAt = 0.44;
      const wx = sx + (ex - sx) * (stopAt + 0.05);
      const wy = sy + (ey - sy) * (stopAt + 0.05);
      wall.setAttribute('x1', String(wx + ax.nx * 12));
      wall.setAttribute('y1', String(wy + ax.ny * 12));
      wall.setAttribute('x2', String(wx - ax.nx * 12));
      wall.setAttribute('y2', String(wy - ax.ny * 12));
      const at = (t: number): void => {
        dot.setAttribute('cx', String(sx + (ex - sx) * t));
        dot.setAttribute('cy', String(sy + (ey - sy) * t));
      };
      at(0);
      return tween(PROBE_OUT_MS, (t) => {
        at(easeOut(t) * stopAt);
        wall.setAttribute('opacity', String(Math.min(1, Math.max(0, t * 1.4 - 0.4))));
      })
        .then(() => wait(120))
        .then(() =>
          tween(PROBE_BACK_MS, (t) => {
            at((1 - easeInOut(t)) * stopAt);
            wall.setAttribute('opacity', String(1 - t));
          }),
        )
        .then(() => {
          dot.remove();
          wall.remove();
        });
    }

    const api = {
      setGraph(spec: GraphSpec): void {
        graph = { nodes: [...spec.nodes], edges: spec.edges.map((e) => ({ ...e })), source: spec.source };
        build();
      },

      reset(): void {
        build();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      async setMode(mode: 'undirected' | 'directed', source: string): Promise<void> {
        for (const id of graph.nodes) state.set(id, 'default');
        state.set(source, 'source');
        for (const id of graph.nodes) paint(id);
        if (mode === 'undirected') {
          await popNode(source);
          return;
        }
        // 다섯 선이 잇달아 한 방향을 잃는다 — 한꺼번에가 아니라 물결처럼.
        await Promise.all(
          graph.edges.map(async (line, i) => {
            await wait(i * CUT_STAGGER);
            await cutEdge(line);
          }),
        );
      },

      async walk(from: string, to: string): Promise<void> {
        const lane = findLane(from, to);
        if (lane) await runPulse(lane, c.itemActive);
        if (state.get(to) !== 'source') state.set(to, 'reached');
        paint(to);
        await popNode(to);
      },

      async blocked(node: string, from: string[]): Promise<void> {
        await Promise.all(from.map((f) => probe(f, node)));
      },

      async pushOut(node: string): Promise<void> {
        const p = pos.get(node);
        if (!p) return;
        state.set(node, 'stranded');
        paint(node);
        const len = Math.hypot(p.x - CX, p.y - CY) || 1;
        const dx = (p.x - CX) / len;
        const dy = (p.y - CY) / len;
        // 캔버스 밖으로 나가지 않을 만큼만 민다. x·y 를 따로 자르면 방향이
        // 휘므로 갈 수 있는 거리를 먼저 재고 그만큼만 간다.
        const room = Math.min(travel(p.x, dx, NODE_R + EDGE_MARGIN, W - NODE_R - EDGE_MARGIN),
                              travel(p.y, dy, NODE_R + EDGE_MARGIN, H - NODE_R - EDGE_MARGIN));
        const dist = Math.max(0, Math.min(PUSH, room));
        const from: Point = { ...p };
        const to: Point = { x: p.x + dx * dist, y: p.y + dy * dist };
        await tween(PUSH_MS, (t) => {
          const e = easeOut(t);
          pos.set(node, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
          place(node);
          renderLanes();
        });
      },

      destroy(): void {
        destroyed = true;
        for (const id of rafIds) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
        }
        rafIds.clear();
        for (const id of timerIds) clearTimeout(id);
        timerIds.clear();
        for (const resolve of pending) resolve();
        pending.clear();
        root.remove();
      },
    };

    return api;
  },
};
