/**
 * 되짚어 나오기 무대.
 *
 * 동사가 둘이고, 화면에서 서로 다른 일로 보여야 한다.
 *
 *   파고든다 — 자국(rope)이 부모에서 자식으로 **자라나고**, 표식이 간선을 따라
 *              곧게 내려가며, 깊이 바늘이 아래로 내려간다. 표식의 갈매기는 아래를
 *              가리킨다.
 *   물러난다 — 자국이 자식 쪽에서부터 **줄어들고**, 표식은 간선을 벗어나 바깥으로
 *              부푼 호를 그리며 올라오고, 바늘이 위로 올라간다. 갈매기는 위를
 *              가리키고, 지나온 간선은 점선 자취로 남는다.
 *
 * 두 걸음이 같은 선 위를 반대로 미끄러지기만 하면 "다음 자리로 넘어가는 것" 과
 * 구별되지 않는다. 그래서 물러남만 간선을 벗어나 호를 그린다.
 *
 * 세로는 mount 시 한 번 정하고 그 뒤 바꾸지 않는다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fontSizes,
  fonts,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 300;

/** 깊이 눈금 축의 세로선 x. */
const AXIS_X = 30;
/** 나무가 놓일 수 있는 좌우 경계 — 축 오른쪽부터 캔버스 오른쪽 여백까지. */
const FIELD_L = 60;
const FIELD_R = 596;
/** 뿌리의 y. */
const TOP_Y = 56;
/** 가장 깊은 층이 넘어설 수 없는 y. 넘치면 층 간격을 줄여 담는다 (S-view). */
const BOTTOM_LIMIT = 228;
const LEVEL_GAP_MAX = 86;
/**
 * 잎 한 칸의 **상한**. 폭을 다 나눠 가지면 간선이 눕고, 눕는 순간 "아래로
 * 파고든다" 가 "옆으로 간다" 로 읽힌다. 이 조각은 세로가 본질이라 남는 폭은
 * 버리는 것이 아니라 고르는 것이다 (S-piece).
 */
const SLOT_MAX_W = 152;
const NODE_R_MAX = 28;
/** 현재 자리를 감싸는 고리가 노드 밖으로 나오는 만큼. */
const RING_PAD = 6;
/** 막힘 표시(벽)가 노드 밖으로 나오는 만큼. 고리보다 바깥이어야 겹치지 않는다. */
const WALL_PAD = 13;
const CAPTION_Y = 288;

const DIVE_MS = 300;
const RETREAT_MS = 420;
const ENTER_MS = 260;
const WALL_MS = 180;
/** 물러날 때 표식이 간선 밖으로 부푸는 정도. */
const BOW = 38;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export type DiveThenBacktrackGraph = {
  vertices: string[];
  edges: [string, string][];
  start: string;
};

export type MoveStep = { from: string; to: string; depth: number };

type Point = { x: number; y: number };

type NodeState = 'untouched' | 'current' | 'onPath' | 'exhausted';

type NodeVisual = {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  wall: SVGPathElement | null;
  state: NodeState;
};

type EdgeVisual = {
  base: SVGLineElement;
  trail: SVGLineElement;
  /** 선을 그은 방향. 자국이 어느 끝에서 자라야 하는지가 여기서 갈린다. */
  a: string;
  b: string;
  /** 자국의 길이. dasharray/offset 이 이 값을 쓴다. */
  len: number;
};

type Layout = {
  /** 뿌리(출발점) 이름. 물러남의 호가 어느 쪽으로 부풀지 정할 때 쓴다. */
  root: string;
  pos: Map<string, Point>;
  levelY: number[];
  nodeR: number;
  maxDepth: number;
};

/** 무방향 간선에서 오름차순 인접 목록. */
function adjacencyOf(graph: DiveThenBacktrackGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const v of graph.vertices) adj.set(v, []);
  for (const [a, b] of graph.edges) {
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  for (const list of adj.values()) list.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return adj;
}

/**
 * 출발점을 뿌리로 삼아 자리를 잡는다.
 *
 * 잎을 왼쪽부터 한 칸씩 놓고, 부모는 자식들의 한가운데에 둔다. 깊이가 y 를
 * 정하므로 "몇 칸 아래" 가 화면에서 그대로 높이 차이가 된다.
 */
function layoutTree(graph: DiveThenBacktrackGraph): Layout {
  const adj = adjacencyOf(graph);
  const depth = new Map<string, number>();
  const children = new Map<string, string[]>();
  const preorder: string[] = [];

  const start = graph.start;
  if (adj.has(start)) {
    const seen = new Set<string>([start]);
    depth.set(start, 0);
    const stack: string[] = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      preorder.push(cur);
      const kids: string[] = [];
      for (const n of adj.get(cur) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        depth.set(n, (depth.get(cur) ?? 0) + 1);
        kids.push(n);
      }
      children.set(cur, kids);
      for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i] ?? '');
    }
  }

  let maxDepth = 0;
  for (const d of depth.values()) if (d > maxDepth) maxDepth = d;

  const leaves = preorder.filter((n) => (children.get(n) ?? []).length === 0);
  const leafCount = Math.max(1, leaves.length);
  const fieldW = FIELD_R - FIELD_L;
  const slotW = Math.min(SLOT_MAX_W, fieldW / leafCount);
  const originX = FIELD_L + (fieldW - slotW * leafCount) / 2;

  const levelGap = maxDepth > 0 ? Math.min(LEVEL_GAP_MAX, (BOTTOM_LIMIT - TOP_Y) / maxDepth) : LEVEL_GAP_MAX;
  const nodeR = Math.min(NODE_R_MAX, slotW * 0.3, levelGap * 0.34);
  const levelY: number[] = [];
  for (let d = 0; d <= maxDepth; d += 1) levelY.push(TOP_Y + levelGap * d);

  const x = new Map<string, number>();
  leaves.forEach((leaf, i) => x.set(leaf, originX + slotW * (i + 0.5)));
  for (let i = preorder.length - 1; i >= 0; i -= 1) {
    const name = preorder[i] ?? '';
    const kids = children.get(name) ?? [];
    if (kids.length === 0) continue;
    const first = x.get(kids[0] ?? '') ?? originX;
    const last = x.get(kids[kids.length - 1] ?? '') ?? originX;
    x.set(name, (first + last) / 2);
  }

  const pos = new Map<string, Point>();
  for (const name of preorder) {
    pos.set(name, { x: x.get(name) ?? originX, y: levelY[depth.get(name) ?? 0] ?? TOP_Y });
  }

  return { root: start, pos, levelY, nodeR, maxDepth };
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function easeInOutCubic(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

export const diveThenBacktrackStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const c: Palette = getColors(params.theme);

    const root = el('g');
    canvas.appendChild(root);

    // ── 애니메이션 살림. destroy 가 남기는 뒷일이 없어야 한다 (S-view).
    let destroyed = false;
    type Handle = { id: number; stop: () => void };
    const running = new Set<Handle>();

    function tween(duration: number, onFrame: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || duration <= 0 || typeof requestAnimationFrame !== 'function') {
          onFrame(1);
          resolve();
          return;
        }
        const handle: Handle = {
          id: 0,
          stop: () => {
            running.delete(handle);
            onFrame(1);
            resolve();
          },
        };
        running.add(handle);
        let startedAt = -1;
        const frame = (ts: number): void => {
          if (destroyed) {
            handle.stop();
            return;
          }
          if (startedAt < 0) startedAt = ts;
          const raw = Math.min(1, (ts - startedAt) / duration);
          if (raw < 1) {
            onFrame(easeInOutCubic(raw));
            handle.id = requestAnimationFrame(frame);
          } else {
            handle.stop();
          }
        };
        handle.id = requestAnimationFrame(frame);
      });
    }

    // ── 무대 요소.
    let layout: Layout | null = null;
    const nodes = new Map<string, NodeVisual>();
    const edges = new Map<string, EdgeVisual>();
    let needle: SVGPathElement | null = null;
    let token: SVGGElement | null = null;
    let tokenRing: SVGCircleElement | null = null;
    let tokenChevron: SVGPathElement | null = null;
    let caption: SVGTextElement | null = null;

    function posOf(name: string): Point {
      return layout?.pos.get(name) ?? { x: W / 2, y: TOP_Y };
    }

    function needleY(depth: number): number {
      const levels = layout?.levelY ?? [];
      return levels[Math.max(0, Math.min(levels.length - 1, depth))] ?? TOP_Y;
    }

    function paint(name: string, state: NodeState): void {
      const v = nodes.get(name);
      if (!v) return;
      v.state = state;
      const fill =
        state === 'current'
          ? c.itemActive
          : state === 'onPath'
            ? c.itemPivot
            : state === 'exhausted'
              ? c.itemSorted
              : c.itemDefault;
      const stroke = state === 'untouched' ? c.border : fill;
      const ink =
        state === 'untouched' ? c.text : state === 'exhausted' ? c.textInverse : c.stateInk;
      v.circle.setAttribute('fill', fill);
      v.circle.setAttribute('stroke', stroke);
      v.label.setAttribute('fill', ink);
    }

    function moveToken(p: Point): void {
      token?.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    }

    function showChevron(dir: 'down' | 'up'): void {
      if (!tokenChevron || !layout) return;
      const r = layout.nodeR + RING_PAD;
      tokenChevron.setAttribute(
        'transform',
        dir === 'down' ? `translate(0 ${r})` : `translate(0 ${-r}) rotate(180)`,
      );
      tokenChevron.setAttribute('display', 'inline');
    }

    function hideChevron(): void {
      tokenChevron?.setAttribute('display', 'none');
    }

    /**
     * 자국을 부모 쪽에 붙여 놓고 `shown` 만큼만 보인다.
     *
     * dasharray 가 "len len" 이므로 offset +d 면 보이는 구간이 [0, len-d] (선을
     * 그은 시작점에 붙는다), -d 면 [d, len] (끝점에 붙는다). 간선을 어느 방향으로
     * 그었는지는 저작 선언이 정하므로 부모가 어느 끝인지 보고 부호를 정한다.
     *
     * 다 줄면 요소를 감춘다 — 길이 0 인 자국도 둥근 마감(linecap) 때문에 점으로
     * 남는다.
     */
    function setTrail(key: string, shown: number, parent: string): void {
      const e = edges.get(key);
      if (!e) return;
      const dir = e.a === parent ? 1 : -1;
      e.trail.setAttribute('stroke-dashoffset', String(dir * e.len * (1 - shown)));
      e.trail.setAttribute('display', shown <= 0.001 ? 'none' : 'inline');
    }

    function setCaptionText(text: string): void {
      if (caption) caption.textContent = text;
    }

    /** 축·눈금·바늘. 그래프가 정해질 때 한 번 그린다. */
    function buildAxis(l: Layout): void {
      const g = el('g');
      const top = TOP_Y - l.nodeR - 14;
      const bottom = (l.levelY[l.maxDepth] ?? TOP_Y) + l.nodeR + 14;
      g.appendChild(
        el('line', { x1: AXIS_X, y1: top, x2: AXIS_X, y2: bottom, stroke: c.border, 'stroke-width': 1.5 }),
      );
      l.levelY.forEach((y, d) => {
        g.appendChild(
          el('line', { x1: AXIS_X - 5, y1: y, x2: AXIS_X + 5, y2: y, stroke: c.border, 'stroke-width': 1.5 }),
        );
        g.appendChild(
          el('line', {
            x1: AXIS_X + 22,
            y1: y,
            x2: W - 16,
            y2: y,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '1 8',
          }),
        );
        // 깊이 숫자는 눈금 표기다 — 번역 대상이 아니다 (C10 표식 판정 3).
        const tick = el('text', {
          x: AXIS_X - 11,
          y: y + 4,
          'text-anchor': 'end',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        tick.textContent = String(d);
        g.appendChild(tick);
      });
      needle = el('path', {
        d: `M 0 -6 L 0 6 L 11 0 Z`,
        fill: c.itemActive,
        transform: `translate(${AXIS_X + 4} ${l.levelY[0] ?? TOP_Y})`,
        display: 'none',
      });
      g.appendChild(needle);
      root.appendChild(g);
    }

    function buildGraph(graph: DiveThenBacktrackGraph): void {
      root.textContent = '';
      nodes.clear();
      edges.clear();
      needle = null;
      token = null;
      tokenRing = null;
      tokenChevron = null;

      const l = layoutTree(graph);
      layout = l;
      buildAxis(l);

      const r = l.nodeR;
      const edgeLayer = el('g');
      const trailLayer = el('g');
      const nodeLayer = el('g');
      root.appendChild(edgeLayer);
      root.appendChild(trailLayer);
      root.appendChild(nodeLayer);

      for (const [a, b] of graph.edges) {
        const pa = l.pos.get(a);
        const pb = l.pos.get(b);
        if (!pa || !pb) continue;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const geom = {
          x1: pa.x + ux * r,
          y1: pa.y + uy * r,
          x2: pb.x - ux * r,
          y2: pb.y - uy * r,
        };
        const len = Math.max(1, d - 2 * r);
        const base = el('line', { ...geom, stroke: c.border, 'stroke-width': 2, 'stroke-linecap': 'round' });
        const trail = el('line', {
          ...geom,
          stroke: c.accent,
          'stroke-width': 6,
          'stroke-linecap': 'round',
          'stroke-dasharray': `${len} ${len}`,
          'stroke-dashoffset': len,
          display: 'none',
        });
        edgeLayer.appendChild(base);
        trailLayer.appendChild(trail);
        edges.set(edgeKey(a, b), { base, trail, a, b, len });
      }

      for (const name of graph.vertices) {
        const p = l.pos.get(name);
        if (!p) continue;
        const group = el('g', { transform: `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})` });
        const circle = el('circle', { cx: 0, cy: 0, r, 'stroke-width': 2 });
        const label = el('text', {
          x: 0,
          y: 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': 600,
        });
        label.textContent = name;
        group.appendChild(circle);
        group.appendChild(label);
        nodeLayer.appendChild(group);
        nodes.set(name, { group, circle, label, wall: null, state: 'untouched' });
        paint(name, 'untouched');
      }

      token = el('g', { display: 'none' });
      tokenRing = el('circle', {
        cx: 0,
        cy: 0,
        r: r + RING_PAD,
        fill: 'none',
        stroke: c.itemActive,
        'stroke-width': 3,
      });
      tokenChevron = el('path', {
        d: 'M -9 -6 L 0 5 L 9 -6',
        fill: 'none',
        stroke: c.itemActive,
        'stroke-width': 3.5,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        display: 'none',
      });
      token.appendChild(tokenRing);
      token.appendChild(tokenChevron);
      root.appendChild(token);

      caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      root.appendChild(caption);
    }

    function clearWalls(): void {
      for (const v of nodes.values()) {
        v.wall?.remove();
        v.wall = null;
      }
    }

    function resetVisuals(): void {
      for (const name of nodes.keys()) paint(name, 'untouched');
      clearWalls();
      for (const [key, e] of edges) {
        e.base.setAttribute('stroke', c.border);
        e.base.removeAttribute('stroke-dasharray');
        e.base.setAttribute('stroke-width', '2');
        setTrail(key, 0, e.a);
      }
      token?.setAttribute('display', 'none');
      hideChevron();
      needle?.setAttribute('display', 'none');
      setCaptionText('');
    }

    return {
      setGraph(graph: DiveThenBacktrackGraph): void {
        buildGraph(graph);
      },

      setCaption(text: string): void {
        setCaptionText(text);
      },

      /** 출발점에 선다. 고리가 밖에서 조여들며 자리를 잡는다. */
      enterRoot(node: string): Promise<void> {
        if (!layout) return Promise.resolve();
        const r = layout.nodeR;
        const p = posOf(node);
        paint(node, 'current');
        moveToken(p);
        token?.setAttribute('display', 'inline');
        hideChevron();
        needle?.setAttribute('display', 'inline');
        needle?.setAttribute('transform', `translate(${AXIS_X + 4} ${needleY(0)})`);
        return tween(ENTER_MS, (p2) => {
          tokenRing?.setAttribute('r', String(r + RING_PAD + (1 - p2) * 16));
        });
      },

      /** 한 칸 파고든다 — 자국이 자라고 표식이 곧게 내려간다. */
      descend(step: MoveStep): Promise<void> {
        if (!layout) return Promise.resolve();
        const key = edgeKey(step.from, step.to);
        const a = posOf(step.from);
        const b = posOf(step.to);
        const fromDepth = Math.max(0, step.depth - 1);
        const y0 = needleY(fromDepth);
        const y1 = needleY(step.depth);
        const target = nodes.get(step.to);
        if (nodes.get(step.from)?.state === 'current') paint(step.from, 'onPath');
        showChevron('down');
        token?.setAttribute('display', 'inline');

        let arrived = false;
        return tween(DIVE_MS, (p) => {
          setTrail(key, p, step.from);
          moveToken({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
          needle?.setAttribute('transform', `translate(${AXIS_X + 4} ${y0 + (y1 - y0) * p})`);
          if (p >= 0.62 && !arrived) {
            arrived = true;
            paint(step.to, 'current');
          }
          if (target) {
            const pop = p < 0.62 ? 1 : 1 + 0.16 * Math.sin(((p - 0.62) / 0.38) * Math.PI);
            target.group.setAttribute(
              'transform',
              `translate(${b.x.toFixed(2)} ${b.y.toFixed(2)}) scale(${pop.toFixed(3)})`,
            );
          }
          if (p >= 1) hideChevron();
        });
      },

      /** 더 갈 곳이 없음이 드러난다 — 노드 아래로 벽이 그어진다. */
      markDeadEnd(node: string): Promise<void> {
        const v = nodes.get(node);
        if (!v || !layout) return Promise.resolve();
        const R = layout.nodeR + WALL_PAD;
        const a0 = (50 * Math.PI) / 180;
        const a1 = (130 * Math.PI) / 180;
        const arc = R * (a1 - a0);
        const wall = el('path', {
          d: `M ${(R * Math.cos(a0)).toFixed(2)} ${(R * Math.sin(a0)).toFixed(2)} A ${R} ${R} 0 0 1 ${(R * Math.cos(a1)).toFixed(2)} ${(R * Math.sin(a1)).toFixed(2)}`,
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 4,
          'stroke-linecap': 'round',
          'stroke-dasharray': `${arc} ${arc}`,
          'stroke-dashoffset': arc,
        });
        v.wall?.remove();
        v.wall = wall;
        v.group.appendChild(wall);
        return tween(WALL_MS, (p) => {
          wall.setAttribute('stroke-dashoffset', String(arc * (1 - p)));
        });
      },

      /**
       * 왔던 길을 되짚어 한 칸 물러난다 — 자국이 줄고, 표식은 간선을 벗어나
       * 바깥으로 부푼 호를 그리며 올라온다.
       */
      retreat(step: MoveStep): Promise<void> {
        if (!layout) return Promise.resolve();
        const key = edgeKey(step.from, step.to);
        const a = posOf(step.from);
        const b = posOf(step.to);
        const rootX = posOf(layout.root).x;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        let nx = -(b.y - a.y);
        let ny = b.x - a.x;
        const nlen = Math.hypot(nx, ny) || 1;
        nx /= nlen;
        ny /= nlen;
        const outward = Math.sign(mx - rootX) || 1;
        if (nx * outward < 0) {
          nx = -nx;
          ny = -ny;
        }
        const cxp = mx + nx * BOW;
        const cyp = my + ny * BOW;

        const y0 = needleY(step.depth + 1);
        const y1 = needleY(step.depth);
        paint(step.from, 'exhausted');
        showChevron('up');
        token?.setAttribute('display', 'inline');

        return tween(RETREAT_MS, (p) => {
          setTrail(key, 1 - p, step.to);
          const q = 1 - p;
          const x = q * q * a.x + 2 * q * p * cxp + p * p * b.x;
          const y = q * q * a.y + 2 * q * p * cyp + p * p * b.y;
          moveToken({ x, y });
          needle?.setAttribute('transform', `translate(${AXIS_X + 4} ${y0 + (y1 - y0) * p})`);
          if (p >= 1) {
            hideChevron();
            paint(step.to, 'current');
            // 벽은 물러남을 부른 그 순간의 신호다. 빠져나오고 나면 거둔다 —
            // 남겨 두면 붉은 표시가 쌓여 "지금 막혔다" 가 아니라 배경이 된다.
            const left = nodes.get(step.from);
            left?.wall?.remove();
            if (left) left.wall = null;
            const e = edges.get(key);
            // 되짚어 나온 간선은 점선 자취로 남는다 — 지나왔고 이제 닫힌 길이다.
            e?.base.setAttribute('stroke', c.ghostOutline);
            e?.base.setAttribute('stroke-dasharray', '3 6');
          }
        });
      },

      /** 답사가 끝났다. 모든 자리가 소진되고 표식을 거둔다. */
      finish(): void {
        for (const name of nodes.keys()) paint(name, 'exhausted');
        // 막힘 표시는 그 순간의 까닭이지 결과가 아니다. 끝 화면에는 밟은 자리와
        // 되짚어 나온 길만 남긴다.
        clearWalls();
        token?.setAttribute('display', 'none');
        hideChevron();
        needle?.setAttribute('display', 'none');
      },

      /** 처음으로 되돌린다. */
      rewind(): void {
        resetVisuals();
      },

      destroy(): void {
        destroyed = true;
        for (const h of [...running]) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h.id);
          h.stop();
        }
        running.clear();
        root.remove();
      },
    };
  },
};
