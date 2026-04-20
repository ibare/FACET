/**
 * graph-layout — 노드/엣지 위치 직접 지정으로 그래프 시각화.
 *
 * config: { type: 'graph-layout', width?, height? }
 *
 * 메서드:
 *   setGraph(graphData, positions)
 *   setNodeState(id, state)
 *   setEdgeState(a, b, state)
 *   reset()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, type Palette, fonts, radii, space } from './design-tokens.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type GraphNodeState = 'default' | 'visited' | 'active' | 'goal';
export type GraphEdgeState = 'default' | 'active' | 'traversed';

export type GraphData = {
  nodes: { id: string; label?: string }[];
  edges: { from: string; to: string }[];
};

export type GraphPositions = Record<string, { x: number; y: number }>;

function makeNodeColor(colors: Palette): Record<GraphNodeState, string> {
  return {
    default: colors.itemDefault,
    visited: colors.itemSorted,
    active: colors.itemActive,
    goal: colors.itemPivot,
  };
}

function makeEdgeColor(colors: Palette): Record<GraphEdgeState, string> {
  return {
    default: colors.border,
    active: colors.itemActive,
    traversed: colors.itemSorted,
  };
}

export const graphLayoutView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);
    const NODE_COLOR = makeNodeColor(colors);
    const EDGE_COLOR = makeEdgeColor(colors);
    const cfg = params.config as { width?: number; height?: number };
    const W = cfg.width ?? 480;
    const H = cfg.height ?? 280;

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

    const edgesG = document.createElementNS(SVG_NS, 'g');
    edgesG.setAttribute('class', 'edges');
    const nodesG = document.createElementNS(SVG_NS, 'g');
    nodesG.setAttribute('class', 'nodes');
    svg.append(edgesG, nodesG);
    root.appendChild(svg);
    container.appendChild(root);

    const nodeEls = new Map<string, { circle: SVGCircleElement; label: SVGTextElement; state: GraphNodeState }>();
    const edgeEls = new Map<string, { line: SVGLineElement; state: GraphEdgeState }>();
    let positions: GraphPositions = {};

    function edgeKey(a: string, b: string): string {
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    }

    function setGraph(data: GraphData, pos: GraphPositions): void {
      edgesG.textContent = '';
      nodesG.textContent = '';
      nodeEls.clear();
      edgeEls.clear();
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
        circle.setAttribute('r', '18');
        circle.setAttribute('fill', NODE_COLOR.default);
        circle.setAttribute('stroke', colors.bg);
        circle.setAttribute('stroke-width', '2');
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(p.x));
        label.setAttribute('y', String(p.y + 4));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', colors.textInverse);
        label.setAttribute('font-size', '12');
        label.setAttribute('font-weight', '600');
        label.textContent = n.label ?? n.id;
        g.append(circle, label);
        nodesG.appendChild(g);
        nodeEls.set(n.id, { circle, label, state: 'default' });
      }
    }

    function setNodeState(id: string, state: GraphNodeState): void {
      const e = nodeEls.get(id);
      if (!e) return;
      e.state = state;
      e.circle.setAttribute('fill', NODE_COLOR[state]);
    }

    function setEdgeState(a: string, b: string, state: GraphEdgeState): void {
      const e = edgeEls.get(edgeKey(a, b));
      if (!e) return;
      e.state = state;
      e.line.setAttribute('stroke', EDGE_COLOR[state]);
      e.line.setAttribute('stroke-width', state === 'default' ? '2' : '3');
    }

    function reset(): void {
      for (const [id] of nodeEls) setNodeState(id, 'default');
      for (const [, e] of edgeEls) {
        e.state = 'default';
        e.line.setAttribute('stroke', EDGE_COLOR.default);
        e.line.setAttribute('stroke-width', '2');
      }
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setGraph,
      setNodeState,
      setEdgeState,
      reset,
    };
  },
};
