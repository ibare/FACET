/**
 * graph-layout — 노드/엣지 위치 직접 지정으로 그래프 시각화.
 *
 * config: {
 *   type: 'graph-layout',
 *   width?: number,
 *   height?: number,
 *   features?: ('concentric-rings')[],
 * }
 *
 * 메서드:
 *   setGraph(graphData, positions)
 *   setNodeState(id, state)
 *   setEdgeState(a, b, state)
 *   setNodeBadge(id, text)         // 노드 오른쪽 위 배지 (거리/깊이/순서 라벨)
 *   clearNodeBadge(id)
 *   pulseNodes(ids, options?)      // 여러 노드를 동시에 ring-pulse (Promise)
 *   pulseEdge(a, b, options?)      // 엣지 흐름 입자 트레일 (Promise)
 *   setConcentricRings(centerId, radii)  // features: ['concentric-rings'] 활성 시 배경 등고선
 *   pulseRing(index, options?)     // 해당 레이어 등고선을 현재 파면으로 점등 (Promise)
 *   setRingMuted(index)            // 지나간 파면을 저채도 fill 로 남김 (잔향)
 *   clearConcentricRings()
 *   reset()
 *
 * 신규 메서드는 전부 추가일 뿐 기존 setGraph / setNodeState / setEdgeState /
 * reset 의 시그니처와 동작은 변경 없음.
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, type Palette, fonts, fontSizes, radii, space } from './design-tokens.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type GraphNodeState = 'default' | 'visited' | 'active' | 'goal' | 'source';
export type GraphEdgeState = 'default' | 'active' | 'traversed';

export type GraphLayoutFeature = 'concentric-rings';

export type GraphData = {
  nodes: { id: string; label?: string }[];
  edges: { from: string; to: string }[];
};

export type GraphPositions = Record<string, { x: number; y: number }>;

type NodeStyle = { fill: string; stroke: string; strokeWidth: string };

function makeNodeStyle(colors: Palette): Record<GraphNodeState, NodeStyle> {
  return {
    default: { fill: colors.itemDefault, stroke: colors.bg, strokeWidth: '2' },
    visited: { fill: colors.itemSorted, stroke: colors.bg, strokeWidth: '2' },
    active: { fill: colors.itemActive, stroke: colors.bg, strokeWidth: '2' },
    goal: { fill: colors.itemPivot, stroke: colors.bg, strokeWidth: '2' },
    // source: 발원지. 두꺼운 외곽 + accent 채움으로 "돌" 느낌.
    source: { fill: colors.itemPivot, stroke: colors.primary, strokeWidth: '3' },
  };
}

function makeEdgeColor(colors: Palette): Record<GraphEdgeState, string> {
  return {
    default: colors.border,
    active: colors.itemActive,
    traversed: colors.itemSorted,
  };
}

function raf(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((res) => requestAnimationFrame(() => res()));
  }
  return new Promise((res) => setTimeout(res, 16));
}

export const graphLayoutView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);
    const NODE_STYLE = makeNodeStyle(colors);
    const EDGE_COLOR = makeEdgeColor(colors);
    const cfg = params.config as {
      width?: number;
      height?: number;
      features?: GraphLayoutFeature[];
    };
    const W = cfg.width ?? 480;
    const H = cfg.height ?? 280;
    const featureSet = new Set<GraphLayoutFeature>(cfg.features ?? []);

    const root = document.createElement('div');
    root.className = 'facet-graph-layout';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(H));
    svg.style.display = 'block';

    // 레이어 순서: rings(배경) → edges → nodes → badges
    const ringsG = document.createElementNS(SVG_NS, 'g');
    ringsG.setAttribute('class', 'rings');
    const edgesG = document.createElementNS(SVG_NS, 'g');
    edgesG.setAttribute('class', 'edges');
    const nodesG = document.createElementNS(SVG_NS, 'g');
    nodesG.setAttribute('class', 'nodes');
    const badgesG = document.createElementNS(SVG_NS, 'g');
    badgesG.setAttribute('class', 'badges');
    svg.append(ringsG, edgesG, nodesG, badgesG);
    root.appendChild(svg);
    container.appendChild(root);

    type NodeEntry = {
      g: SVGGElement;
      circle: SVGCircleElement;
      label: SVGTextElement;
      state: GraphNodeState;
      baseRadius: number;
    };
    const nodeEls = new Map<string, NodeEntry>();
    const edgeEls = new Map<string, { line: SVGLineElement; state: GraphEdgeState }>();
    const badgeEls = new Map<string, SVGGElement>();
    let positions: GraphPositions = {};
    const BASE_RADIUS = 18;

    type RingState = 'default' | 'active' | 'muted';
    type RingEntry = {
      g: SVGGElement;
      disk: SVGCircleElement;
      line: SVGCircleElement;
      radius: number;
      state: RingState;
    };
    const ringEls: RingEntry[] = [];

    function edgeKey(a: string, b: string): string {
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    function applyNodeStyle(entry: NodeEntry, state: GraphNodeState): void {
      const s = NODE_STYLE[state];
      entry.circle.setAttribute('fill', s.fill);
      entry.circle.setAttribute('stroke', s.stroke);
      entry.circle.setAttribute('stroke-width', s.strokeWidth);
      // source / active / goal 에는 텍스트를 가독성 높은 반전색으로.
      const textFill =
        state === 'default' ? colors.text : colors.textInverse;
      entry.label.setAttribute('fill', textFill);
    }

    function setGraph(data: GraphData, pos: GraphPositions): void {
      ringsG.textContent = '';
      edgesG.textContent = '';
      nodesG.textContent = '';
      badgesG.textContent = '';
      nodeEls.clear();
      edgeEls.clear();
      badgeEls.clear();
      positions = pos;

      for (const e of data.edges) {
        const p1 = positions[e.from];
        const p2 = positions[e.to];
        if (!p1 || !p2) continue;
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(p1.x));
        line.setAttribute('y1', String(p1.y));
        line.setAttribute('x2', String(p2.x));
        line.setAttribute('y2', String(p2.y));
        line.setAttribute('stroke', EDGE_COLOR.default);
        line.setAttribute('stroke-width', '2');
        edgesG.appendChild(line);
        edgeEls.set(edgeKey(e.from, e.to), { line, state: 'default' });
      }

      for (const n of data.nodes) {
        const p = positions[n.id];
        if (!p) continue;
        const g = document.createElementNS(SVG_NS, 'g');
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(p.x));
        circle.setAttribute('cy', String(p.y));
        circle.setAttribute('r', String(BASE_RADIUS));
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(p.x));
        label.setAttribute('y', String(p.y + 4));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', '600');
        label.textContent = n.label ?? n.id;
        g.append(circle, label);
        nodesG.appendChild(g);
        const entry: NodeEntry = { g, circle, label, state: 'default', baseRadius: BASE_RADIUS };
        applyNodeStyle(entry, 'default');
        nodeEls.set(n.id, entry);
      }
    }

    function setNodeState(id: string, state: GraphNodeState): void {
      const e = nodeEls.get(id);
      if (!e) return;
      e.state = state;
      applyNodeStyle(e, state);
    }

    function setEdgeState(a: string, b: string, state: GraphEdgeState): void {
      const e = edgeEls.get(edgeKey(a, b));
      if (!e) return;
      e.state = state;
      e.line.setAttribute('stroke', EDGE_COLOR[state]);
      e.line.setAttribute('stroke-width', state === 'default' ? '2' : '3');
    }

    function setNodeBadge(id: string, text: string): void {
      const node = nodeEls.get(id);
      if (!node) return;
      const p = positions[id];
      if (!p) return;
      const existing = badgeEls.get(id);
      if (existing) existing.remove();
      const bx = p.x + node.baseRadius * 0.72;
      const by = p.y - node.baseRadius * 0.72;
      const g = document.createElementNS(SVG_NS, 'g');
      const bg = document.createElementNS(SVG_NS, 'circle');
      bg.setAttribute('cx', String(bx));
      bg.setAttribute('cy', String(by));
      bg.setAttribute('r', '9');
      bg.setAttribute('fill', colors.bg);
      bg.setAttribute('stroke', colors.border);
      bg.setAttribute('stroke-width', '1');
      const txt = document.createElementNS(SVG_NS, 'text');
      txt.setAttribute('x', String(bx));
      txt.setAttribute('y', String(by + 3));
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('fill', colors.text);
      txt.setAttribute('font-size', fontSizes.xs);
      txt.setAttribute('font-weight', '600');
      txt.textContent = text;
      g.append(bg, txt);
      badgesG.appendChild(g);
      badgeEls.set(id, g);
    }

    function clearNodeBadge(id: string): void {
      const existing = badgeEls.get(id);
      if (existing) existing.remove();
      badgeEls.delete(id);
    }

    function pulseNodes(ids: string[], options?: { duration?: number }): Promise<void> {
      const duration = Math.max(20, options?.duration ?? 120);
      const half = duration / 2;
      const targets: NodeEntry[] = [];
      for (const id of ids) {
        const e = nodeEls.get(id);
        if (e) targets.push(e);
      }
      if (targets.length === 0) return Promise.resolve();
      // 한 프레임에 동시에 확대 → 다음 구간에 동시에 복귀. 순차 트윈 금지.
      for (const e of targets) e.circle.setAttribute('r', String(e.baseRadius * 1.35));
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          for (const e of targets) e.circle.setAttribute('r', String(e.baseRadius));
          setTimeout(resolve, half);
        }, half);
      });
    }

    function pulseEdge(a: string, b: string, options?: { duration?: number }): Promise<void> {
      const e = edgeEls.get(edgeKey(a, b));
      if (!e) return Promise.resolve();
      const duration = Math.max(40, options?.duration ?? 160);
      // 흐름 입자: 짧은 점선 패턴이 엣지를 따라 흘러가도록 dashoffset 을 0 → -length.
      const line = e.line;
      const x1 = Number(line.getAttribute('x1'));
      const y1 = Number(line.getAttribute('y1'));
      const x2 = Number(line.getAttribute('x2'));
      const y2 = Number(line.getAttribute('y2'));
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      const prevStroke = line.getAttribute('stroke') ?? EDGE_COLOR.active;
      const prevWidth = line.getAttribute('stroke-width') ?? '2';
      line.setAttribute('stroke', EDGE_COLOR.active);
      line.setAttribute('stroke-width', '3');
      line.setAttribute('stroke-dasharray', '6 10');
      line.setAttribute('stroke-dashoffset', String(length));
      return new Promise<void>((resolve) => {
        void raf().then(() => {
          line.style.transition = `stroke-dashoffset ${duration}ms linear`;
          line.setAttribute('stroke-dashoffset', '0');
          setTimeout(() => {
            line.style.transition = '';
            line.removeAttribute('stroke-dasharray');
            line.removeAttribute('stroke-dashoffset');
            // 엣지 현재 state 색상으로 복원
            line.setAttribute('stroke', prevStroke);
            line.setAttribute('stroke-width', prevWidth);
            resolve();
          }, duration);
        });
      });
    }

    function applyRingStyle(entry: RingEntry): void {
      const { disk, line, state } = entry;
      // disk: 파면이 지나간 저채도 잔향. default/active 에서는 투명.
      if (state === 'muted') {
        disk.setAttribute('fill', colors.primary);
        disk.setAttribute('opacity', '0.06');
      } else {
        disk.setAttribute('fill', 'none');
        disk.setAttribute('opacity', '0');
      }
      // line: 경계 점선. active 에서만 accent + 굵게. muted 는 반투명.
      if (state === 'active') {
        line.setAttribute('stroke', colors.accent);
        line.setAttribute('stroke-width', '2.5');
        line.setAttribute('stroke-opacity', '1');
        line.removeAttribute('stroke-dasharray');
      } else {
        line.setAttribute('stroke', colors.border);
        line.setAttribute('stroke-width', '1');
        line.setAttribute('stroke-opacity', state === 'muted' ? '0.4' : '1');
        line.setAttribute('stroke-dasharray', '4 4');
      }
    }

    function setConcentricRings(centerId: string, radiiList: number[]): void {
      ringsG.textContent = '';
      ringEls.length = 0;
      if (!featureSet.has('concentric-rings')) return;
      const p = positions[centerId];
      if (!p) return;
      for (const r of radiiList) {
        const g = document.createElementNS(SVG_NS, 'g');
        // disk: 면. 초기엔 투명. muted 로 전환될 때 채움.
        const disk = document.createElementNS(SVG_NS, 'circle');
        disk.setAttribute('cx', String(p.x));
        disk.setAttribute('cy', String(p.y));
        disk.setAttribute('r', String(r));
        // line: 경계. 같은 <circle> 로 별도 레이어.
        const line = document.createElementNS(SVG_NS, 'circle');
        line.setAttribute('cx', String(p.x));
        line.setAttribute('cy', String(p.y));
        line.setAttribute('r', String(r));
        line.setAttribute('fill', 'none');
        g.append(disk, line);
        ringsG.appendChild(g);
        const entry: RingEntry = { g, disk, line, radius: r, state: 'default' };
        applyRingStyle(entry);
        ringEls.push(entry);
      }
    }

    function pulseRing(index: number, options?: { duration?: number }): Promise<void> {
      const entry = ringEls[index];
      if (!entry) return Promise.resolve();
      const duration = Math.max(40, options?.duration ?? 240);
      const half = duration / 2;
      // active 로 전환 (두꺼운 accent 경계). 반환 상태는 호출자가 결정.
      // 이후 pulseNodes 와 동시에 묶이도록 Promise 만 제공.
      entry.state = 'active';
      applyRingStyle(entry);
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          // 펄스 종료 — default 로 복귀. muted 로의 전환은 별도 setRingMuted 가 담당.
          if (entry.state === 'active') {
            entry.state = 'default';
            applyRingStyle(entry);
          }
          setTimeout(resolve, half);
        }, half);
      });
    }

    function setRingMuted(index: number): void {
      const entry = ringEls[index];
      if (!entry) return;
      entry.state = 'muted';
      applyRingStyle(entry);
    }

    function clearConcentricRings(): void {
      ringsG.textContent = '';
      ringEls.length = 0;
    }

    function reset(): void {
      for (const [id] of nodeEls) setNodeState(id, 'default');
      for (const [, e] of edgeEls) {
        e.state = 'default';
        e.line.setAttribute('stroke', EDGE_COLOR.default);
        e.line.setAttribute('stroke-width', '2');
        e.line.removeAttribute('stroke-dasharray');
        e.line.removeAttribute('stroke-dashoffset');
        e.line.style.transition = '';
      }
      badgesG.textContent = '';
      badgeEls.clear();
      ringsG.textContent = '';
      ringEls.length = 0;
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setGraph,
      setNodeState,
      setEdgeState,
      setNodeBadge,
      clearNodeBadge,
      pulseNodes,
      pulseEdge,
      setConcentricRings,
      pulseRing,
      setRingMuted,
      clearConcentricRings,
      reset,
    };
  },
};
