/**
 * tree-layout — 자동 레이아웃 트리 시각화.
 *
 * config: { type: 'tree-layout', width?, height? }
 *
 * 메서드:
 *   setTree(rootNode, layoutFn?)
 *   setNodeState(nodeId, state)
 *   setEdgeState(parentId, childId, state)
 *   addNode(parentId, childData, position?)
 *   reset()
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { colors, fonts, radii, space } from './design-tokens.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type TreeNodeState = 'default' | 'visited' | 'active' | 'matched';
export type TreeEdgeState = 'default' | 'active' | 'traversed';

export type TreeNode = {
  id: string;
  label?: string;
  children?: TreeNode[];
};

const NODE_COLOR: Record<TreeNodeState, string> = {
  default: colors.itemDefault,
  visited: colors.itemSorted,
  active: colors.itemActive,
  matched: colors.itemPivot,
};
const EDGE_COLOR: Record<TreeEdgeState, string> = {
  default: colors.border,
  active: colors.itemActive,
  traversed: colors.itemSorted,
};

type Positioned = { id: string; label: string; x: number; y: number; children: Positioned[] };

function defaultLayout(root: TreeNode, width: number, height: number): Positioned {
  // 단순 BFS 폭 기반 좌표
  const levels: TreeNode[][] = [];
  function collect(n: TreeNode, depth: number) {
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(n);
    for (const c of n.children ?? []) collect(c, depth + 1);
  }
  collect(root, 0);
  const depth = levels.length;
  const yStep = depth > 1 ? (height - 40) / (depth - 1) : 0;
  const positions = new Map<string, { x: number; y: number }>();
  for (let d = 0; d < depth; d++) {
    const nodes = levels[d];
    const w = width;
    const slot = nodes.length > 0 ? w / (nodes.length + 1) : w / 2;
    for (let i = 0; i < nodes.length; i++) {
      positions.set(nodes[i].id, { x: slot * (i + 1), y: 20 + d * yStep });
    }
  }

  function build(n: TreeNode): Positioned {
    const p = positions.get(n.id) ?? { x: 0, y: 0 };
    return {
      id: n.id,
      label: n.label ?? n.id,
      x: p.x,
      y: p.y,
      children: (n.children ?? []).map(build),
    };
  }
  return build(root);
}

export const treeLayoutView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const cfg = params.config as { width?: number; height?: number };
    const W = cfg.width ?? 480;
    const H = cfg.height ?? 280;

    const root = document.createElement('div');
    root.className = 'facet-tree-layout';
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
    const nodesG = document.createElementNS(SVG_NS, 'g');
    svg.append(edgesG, nodesG);
    root.appendChild(svg);
    container.appendChild(root);

    let tree: TreeNode | null = null;
    const nodeEls = new Map<string, { circle: SVGCircleElement; state: TreeNodeState; parentId: string | null }>();
    const edgeEls = new Map<string, { line: SVGLineElement; state: TreeEdgeState }>();

    function edgeKey(p: string, c: string) {
      return `${p}->${c}`;
    }

    function render() {
      edgesG.textContent = '';
      nodesG.textContent = '';
      nodeEls.clear();
      edgeEls.clear();
      if (!tree) return;
      const positioned = defaultLayout(tree, W, H);

      function walk(p: Positioned, parentPos: Positioned | null, parentId: string | null) {
        if (parentPos) {
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', String(parentPos.x));
          line.setAttribute('y1', String(parentPos.y));
          line.setAttribute('x2', String(p.x));
          line.setAttribute('y2', String(p.y));
          line.setAttribute('stroke', EDGE_COLOR.default);
          line.setAttribute('stroke-width', '2');
          edgesG.appendChild(line);
          edgeEls.set(edgeKey(parentPos.id, p.id), { line, state: 'default' });
        }
        const g = document.createElementNS(SVG_NS, 'g');
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(p.x));
        circle.setAttribute('cy', String(p.y));
        circle.setAttribute('r', '16');
        circle.setAttribute('fill', NODE_COLOR.default);
        circle.setAttribute('stroke', colors.bg);
        circle.setAttribute('stroke-width', '2');
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(p.x));
        label.setAttribute('y', String(p.y + 4));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', colors.textInverse);
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '600');
        label.textContent = p.label;
        g.append(circle, label);
        nodesG.appendChild(g);
        nodeEls.set(p.id, { circle, state: 'default', parentId });
        for (const ch of p.children) walk(ch, p, p.id);
      }
      walk(positioned, null, null);
    }

    function setTree(n: TreeNode): void {
      tree = n;
      render();
    }

    function setNodeState(id: string, state: TreeNodeState): void {
      const e = nodeEls.get(id);
      if (!e) return;
      e.state = state;
      e.circle.setAttribute('fill', NODE_COLOR[state]);
    }

    function setEdgeState(p: string, c: string, state: TreeEdgeState): void {
      const e = edgeEls.get(edgeKey(p, c));
      if (!e) return;
      e.state = state;
      e.line.setAttribute('stroke', EDGE_COLOR[state]);
      e.line.setAttribute('stroke-width', state === 'default' ? '2' : '3');
    }

    function findAndAttach(n: TreeNode, parentId: string, child: TreeNode): boolean {
      if (n.id === parentId) {
        n.children = [...(n.children ?? []), child];
        return true;
      }
      for (const c of n.children ?? []) {
        if (findAndAttach(c, parentId, child)) return true;
      }
      return false;
    }

    function addNode(parentId: string, child: TreeNode): void {
      if (!tree) return;
      findAndAttach(tree, parentId, child);
      render();
    }

    function reset(): void {
      tree = null;
      render();
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setTree,
      setNodeState,
      setEdgeState,
      addNode,
      reset,
    };
  },
};
