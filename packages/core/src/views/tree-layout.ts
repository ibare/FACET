/**
 * tree-layout — 자동 레이아웃 트리 시각화.
 *
 * config: {
 *   type: 'tree-layout',
 *   width?: number,
 *   height?: number,
 *   layoutMode?: 'bfs-width' | 'binary-ordered',   // default 'bfs-width'
 *   features?: TreeLayoutFeature[],                // default []
 *   inorderStripHeight?: number,                   // inorder-projection 사용 시
 * }
 *
 * 기본 메서드 (회귀 금지 — 시그니처 유지):
 *   setTree(rootNode)
 *   setNodeState(nodeId, state)
 *   setEdgeState(parentId, childId, state)
 *   addNode(parentId, childData)
 *   reset()
 *
 * 확장 메서드 (features 로 활성화되는 기능들, 비활성 시 no-op):
 *   setLayoutMode(mode)
 *   setCursor(id | null)
 *   setAuxCursor(id | null)
 *   foldSubtree(rootId, side, durationMs?) → Promise<void>
 *   unfoldSubtree(rootId, side?, durationMs?) → Promise<void>
 *   unfoldAll()
 *   setGhostProbe(parentId, side, label)
 *   clearGhostProbe()
 *   removeNode(id)
 *   replaceNodeLabel(id, label)
 */

import type { View, ViewInstance, ViewMountParams } from './types.js';
import { getColors, type Palette, fonts, radii, space } from './design-tokens.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_FOLD_MS = 140;

export type TreeNodeState = 'default' | 'visited' | 'active' | 'matched';
export type TreeEdgeState = 'default' | 'active' | 'traversed';

export type TreeNode = {
  id: string;
  label?: string;
  /**
   * 자식 배열. `layoutMode: 'binary-ordered'` 에서는 인덱스가 곧 방향이다 —
   * `children[0]` = 좌, `children[1]` = 우. 한쪽이 비어 있어도 슬롯 의미를
   * 지키기 위해 명시적으로 `null` 을 넣을 수 있다. `bfs-width` 모드에서는
   * `null` 은 단순 스킵된다.
   */
  children?: (TreeNode | null | undefined)[];
};

/**
 * tree-layout 의 선택적 기능 유니온. 기본값은 `[]` — 어떤 것도 켜지 않으면
 * 기존 bfs-width 트리 동작이 그대로 유지된다.
 */
export type TreeLayoutFeature =
  | 'subtree-shade'
  | 'fold-collapse'
  | 'inorder-projection'
  | 'cursor'
  | 'aux-cursor'
  | 'ghost-probe';

/**
 * 레이아웃 모드.
 *   - 'bfs-width'      : 폭 균등 분할 (기존 기본, 임의 arity 트리).
 *   - 'binary-ordered' : 좌/우 자식을 재귀 폭 분할. 한쪽 자식이 없어도
 *                        슬롯을 비워 두어 "좌소우대" 의미를 유지한다.
 *                        children[0] = L, children[1] = R 로 해석.
 */
export type TreeLayoutMode = 'bfs-width' | 'binary-ordered';

export type FoldSide = 'L' | 'R';

function makeNodeColor(colors: Palette): Record<TreeNodeState, string> {
  return {
    default: colors.itemDefault,
    visited: colors.itemSorted,
    active: colors.itemActive,
    matched: colors.itemPivot,
  };
}
function makeEdgeColor(colors: Palette): Record<TreeEdgeState, string> {
  return {
    default: colors.border,
    active: colors.itemActive,
    traversed: colors.itemSorted,
  };
}

type Positioned = {
  id: string;
  label: string;
  x: number;
  y: number;
  depth: number;
  /** binary-ordered 에서는 [L | null, R | null] 슬롯을 유지 */
  children: (Positioned | null)[];
};

// BFS 폭 기반 좌표 (arity 제한 없음) — 기존 동작 유지.
function bfsWidthLayout(root: TreeNode, width: number, height: number): Positioned {
  const levels: TreeNode[][] = [];
  function collect(n: TreeNode, depth: number) {
    if (!levels[depth]) levels[depth] = [];
    levels[depth].push(n);
    for (const c of n.children ?? []) {
      if (!c) continue;
      collect(c, depth + 1);
    }
  }
  collect(root, 0);
  const depth = levels.length;
  const yStep = depth > 1 ? (height - 40) / (depth - 1) : 0;
  const positions = new Map<string, { x: number; y: number; depth: number }>();
  for (let d = 0; d < depth; d++) {
    const nodes = levels[d];
    const w = width;
    const slot = nodes.length > 0 ? w / (nodes.length + 1) : w / 2;
    for (let i = 0; i < nodes.length; i++) {
      positions.set(nodes[i].id, { x: slot * (i + 1), y: 20 + d * yStep, depth: d });
    }
  }

  function build(n: TreeNode): Positioned {
    const p = positions.get(n.id) ?? { x: 0, y: 0, depth: 0 };
    return {
      id: n.id,
      label: n.label ?? n.id,
      x: p.x,
      y: p.y,
      depth: p.depth,
      children: (n.children ?? []).map((c) => (c ? build(c) : null)),
    };
  }
  return build(root);
}

// 좌/우 재귀 폭 분할 (이진 고정). children[0]=L, children[1]=R.
function binaryOrderedLayout(root: TreeNode, width: number, height: number): Positioned {
  let maxDepth = 0;
  (function depthWalk(n: TreeNode, d: number) {
    maxDepth = Math.max(maxDepth, d);
    for (const c of n.children ?? []) {
      if (c) depthWalk(c, d + 1);
    }
  })(root, 0);
  const yStep = maxDepth > 0 ? (height - 40) / maxDepth : 0;

  function place(n: TreeNode, xMin: number, xMax: number, depth: number): Positioned {
    const x = (xMin + xMax) / 2;
    const y = 20 + depth * yStep;
    const kids = n.children ?? [];
    const built: (Positioned | null)[] = [null, null];
    if (kids[0]) built[0] = place(kids[0], xMin, x, depth + 1);
    if (kids[1]) built[1] = place(kids[1], x, xMax, depth + 1);
    return {
      id: n.id,
      label: n.label ?? n.id,
      x,
      y,
      depth,
      children: built,
    };
  }
  return place(root, 0, width, 0);
}

function layoutRoot(root: TreeNode, mode: TreeLayoutMode, w: number, h: number): Positioned {
  return mode === 'binary-ordered' ? binaryOrderedLayout(root, w, h) : bfsWidthLayout(root, w, h);
}

// 트리에서 id 로 노드를 찾아 그 자식 서브트리에 속한 id 집합을 반환.
function collectSubtreeIds(root: TreeNode, targetId: string, side: FoldSide): string[] {
  function findNode(n: TreeNode): TreeNode | null {
    if (n.id === targetId) return n;
    for (const c of n.children ?? []) {
      if (!c) continue;
      const f = findNode(c);
      if (f) return f;
    }
    return null;
  }
  const pivot = findNode(root);
  if (!pivot) return [];
  const kids = pivot.children ?? [];
  const subRoot = side === 'L' ? kids[0] : kids[1];
  if (!subRoot) return [];
  const ids: string[] = [];
  (function walk(n: TreeNode) {
    ids.push(n.id);
    for (const c of n.children ?? []) {
      if (!c) continue;
      walk(c);
    }
  })(subRoot);
  return ids;
}

type NodeEntry = {
  group: SVGGElement;
  circle: SVGCircleElement;
  /** cursor 또는 aux-cursor feature 가 켜진 경우에만 존재 */
  cursor: SVGCircleElement | null;
  state: TreeNodeState;
  parentId: string | null;
  x: number;
  y: number;
  /** 루트로부터의 방향 경로. 'L'/'R' 만, 루트는 빈 문자열 */
  pathFromRoot: string;
};

type EdgeEntry = { line: SVGLineElement; state: TreeEdgeState; parentId: string; childId: string };

export const treeLayoutView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);
    const NODE_COLOR = makeNodeColor(colors);
    const EDGE_COLOR = makeEdgeColor(colors);
    const cfg = params.config as {
      width?: number;
      height?: number;
      layoutMode?: TreeLayoutMode;
      features?: TreeLayoutFeature[];
      inorderStripHeight?: number;
    };
    const W = cfg.width ?? 480;
    const H = cfg.height ?? 280;
    const STRIP_H = cfg.inorderStripHeight ?? 36;

    const features = new Set<TreeLayoutFeature>(cfg.features ?? []);
    let layoutMode: TreeLayoutMode = cfg.layoutMode ?? 'bfs-width';
    const useInorder = features.has('inorder-projection');
    const totalH = useInorder ? H + STRIP_H : H;

    const root = document.createElement('div');
    root.className = 'facet-tree-layout';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    const svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    svg.setAttribute('viewBox', `0 0 ${W} ${totalH}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(totalH));
    svg.style.display = 'block';

    // 해치 패턴 정의 — fold 상태 오버레이.
    const defs = document.createElementNS(SVG_NS, 'defs');
    const hatch = document.createElementNS(SVG_NS, 'pattern');
    hatch.setAttribute('id', 'tree-fold-hatch');
    hatch.setAttribute('patternUnits', 'userSpaceOnUse');
    hatch.setAttribute('width', '6');
    hatch.setAttribute('height', '6');
    hatch.setAttribute('patternTransform', 'rotate(45)');
    const hatchLine = document.createElementNS(SVG_NS, 'line');
    hatchLine.setAttribute('x1', '0');
    hatchLine.setAttribute('y1', '0');
    hatchLine.setAttribute('x2', '0');
    hatchLine.setAttribute('y2', '6');
    hatchLine.setAttribute('stroke', colors.textMuted);
    hatchLine.setAttribute('stroke-width', '1.5');
    hatch.appendChild(hatchLine);
    defs.appendChild(hatch);
    svg.appendChild(defs);

    // 렌더 레이어 순서 (뒤 → 앞): shadeG · edgesG · nodesG · guidesG · inorderG · overlayG · ghostG
    const shadeG = document.createElementNS(SVG_NS, 'g');
    const edgesG = document.createElementNS(SVG_NS, 'g');
    const nodesG = document.createElementNS(SVG_NS, 'g');
    const guidesG = document.createElementNS(SVG_NS, 'g');
    const inorderG = document.createElementNS(SVG_NS, 'g');
    const overlayG = document.createElementNS(SVG_NS, 'g');
    const ghostG = document.createElementNS(SVG_NS, 'g');
    svg.append(shadeG, edgesG, nodesG, guidesG, inorderG, overlayG, ghostG);
    root.appendChild(svg);
    container.appendChild(root);

    let tree: TreeNode | null = null;
    const nodeEls = new Map<string, NodeEntry>();
    const edgeEls = new Map<string, EdgeEntry>();
    // 현재 접힌 서브트리 — key=rootId, value=접힌 side 집합
    const folded = new Map<string, Set<FoldSide>>();
    // 현재 폴드된 노드 id 전체 집합 (렌더 가중 시 빠른 조회)
    const foldedNodeIds = new Set<string>();
    let cursorId: string | null = null;
    let auxCursorId: string | null = null;
    let ghostProbe: { parentId: string; side: FoldSide; label: string } | null = null;

    function edgeKey(p: string, c: string) {
      return `${p}->${c}`;
    }

    function findAndAttach(n: TreeNode, parentId: string, child: TreeNode): boolean {
      if (n.id === parentId) {
        n.children = [...(n.children ?? []), child];
        return true;
      }
      for (const c of n.children ?? []) {
        if (!c) continue;
        if (findAndAttach(c, parentId, child)) return true;
      }
      return false;
    }

    function findAndRemove(n: TreeNode, id: string): boolean {
      if (!n.children) return false;
      const idx = n.children.findIndex((c) => c && c.id === id);
      if (idx >= 0) {
        // 슬롯 의미 (L/R) 를 지키기 위해 제거 대신 null 로 비운다.
        n.children = n.children.map((c, i) => (i === idx ? null : c));
        return true;
      }
      for (const c of n.children) {
        if (!c) continue;
        if (findAndRemove(c, id)) return true;
      }
      return false;
    }

    function findNode(n: TreeNode, id: string): TreeNode | null {
      if (n.id === id) return n;
      for (const c of n.children ?? []) {
        if (!c) continue;
        const f = findNode(c, id);
        if (f) return f;
      }
      return null;
    }

    function recomputeFoldedNodeIds() {
      foldedNodeIds.clear();
      if (!tree) return;
      for (const [rootId, sides] of folded) {
        for (const side of sides) {
          for (const id of collectSubtreeIds(tree, rootId, side)) foldedNodeIds.add(id);
        }
      }
    }

    // 서브트리 음영 rect 를 positioned tree 에서 계산. 좌/우 서브트리 각각
    // bounding box 로 근사. (기획 부록 (a) — 첫 구현은 bbox 근사)
    function renderShades(pos: Positioned) {
      shadeG.textContent = '';
      if (!features.has('subtree-shade')) return;
      if (layoutMode !== 'binary-ordered') return;
      const leftKid = pos.children[0];
      const rightKid = pos.children[1];
      const PAD = 8;

      function bbox(n: Positioned): { xMin: number; xMax: number; yMin: number; yMax: number } {
        let xMin = n.x;
        let xMax = n.x;
        let yMin = n.y;
        let yMax = n.y;
        (function walk(m: Positioned) {
          xMin = Math.min(xMin, m.x);
          xMax = Math.max(xMax, m.x);
          yMin = Math.min(yMin, m.y);
          yMax = Math.max(yMax, m.y);
          for (const c of m.children) {
            if (c) walk(c);
          }
        })(n);
        return { xMin, xMax, yMin, yMax };
      }

      function paint(n: Positioned, fill: string) {
        const b = bbox(n);
        const rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', String(b.xMin - PAD));
        rect.setAttribute('y', String(b.yMin - PAD));
        rect.setAttribute('width', String(b.xMax - b.xMin + PAD * 2));
        rect.setAttribute('height', String(b.yMax - b.yMin + PAD * 2));
        rect.setAttribute('fill', fill);
        rect.setAttribute('rx', '10');
        shadeG.appendChild(rect);
      }

      if (leftKid) paint(leftKid, colors.subtreeShadeLeft);
      if (rightKid) paint(rightKid, colors.subtreeShadeRight);
    }

    function renderInorderStrip(pos: Positioned) {
      inorderG.textContent = '';
      guidesG.textContent = '';
      if (!useInorder) return;
      const seq: Positioned[] = [];
      (function walk(n: Positioned) {
        const left = n.children[0] ?? null;
        const right = n.children[1] ?? null;
        if (left) walk(left);
        seq.push(n);
        if (right) walk(right);
      })(pos);
      if (seq.length === 0) return;
      const yStripTop = H;
      const stripBg = document.createElementNS(SVG_NS, 'rect');
      stripBg.setAttribute('x', '0');
      stripBg.setAttribute('y', String(yStripTop));
      stripBg.setAttribute('width', String(W));
      stripBg.setAttribute('height', String(STRIP_H));
      stripBg.setAttribute('fill', colors.bgSubtle);
      inorderG.appendChild(stripBg);
      const cellSlot = W / (seq.length + 1);
      const cellY = yStripTop + STRIP_H / 2;
      for (let i = 0; i < seq.length; i++) {
        const p = seq[i];
        const cx = cellSlot * (i + 1);
        // 수직 가이드 — 트리 노드 → 바닥선 셀
        const guide = document.createElementNS(SVG_NS, 'line');
        guide.setAttribute('x1', String(p.x));
        guide.setAttribute('y1', String(p.y + 18));
        guide.setAttribute('x2', String(cx));
        guide.setAttribute('y2', String(cellY - 10));
        guide.setAttribute('stroke', colors.border);
        guide.setAttribute('stroke-width', '1');
        guide.setAttribute('stroke-dasharray', '2 2');
        guidesG.appendChild(guide);
        // 바닥선 셀
        const cell = document.createElementNS(SVG_NS, 'rect');
        cell.setAttribute('x', String(cx - 11));
        cell.setAttribute('y', String(cellY - 10));
        cell.setAttribute('width', '22');
        cell.setAttribute('height', '20');
        cell.setAttribute('rx', '4');
        cell.setAttribute('fill', colors.itemDefault);
        cell.setAttribute('stroke', colors.border);
        cell.setAttribute('stroke-width', '1');
        if (foldedNodeIds.has(p.id)) {
          const overlay = document.createElementNS(SVG_NS, 'rect');
          overlay.setAttribute('x', String(cx - 11));
          overlay.setAttribute('y', String(cellY - 10));
          overlay.setAttribute('width', '22');
          overlay.setAttribute('height', '20');
          overlay.setAttribute('rx', '4');
          overlay.setAttribute('fill', 'url(#tree-fold-hatch)');
          overlay.setAttribute('opacity', '0.5');
          inorderG.append(cell, overlay);
        } else {
          inorderG.appendChild(cell);
        }
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('x', String(cx));
        label.setAttribute('y', String(cellY + 4));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', colors.text);
        label.setAttribute('font-size', '10');
        label.setAttribute('font-family', fonts.mono);
        label.textContent = p.label;
        inorderG.appendChild(label);
      }
    }

    function applyFoldVisuals() {
      if (!features.has('fold-collapse')) return;
      overlayG.textContent = '';
      if (!tree) return;
      for (const [rootId, sides] of folded) {
        for (const side of sides) {
          const ids = collectSubtreeIds(tree, rootId, side);
          // 각 노드에 transform + saturation 을 적용한 overlay rect 덮기
          const xs: number[] = [];
          const ys: number[] = [];
          for (const id of ids) {
            const e = nodeEls.get(id);
            if (!e) continue;
            xs.push(e.x);
            ys.push(e.y);
            e.circle.setAttribute('fill-opacity', '0.35');
            e.circle.setAttribute('filter', 'saturate(0.3)');
          }
          if (xs.length === 0) continue;
          const PAD = 14;
          const xMin = Math.min(...xs) - PAD;
          const xMax = Math.max(...xs) + PAD;
          const yMin = Math.min(...ys) - PAD;
          const yMax = Math.max(...ys) + PAD;
          const over = document.createElementNS(SVG_NS, 'rect');
          over.setAttribute('x', String(xMin));
          over.setAttribute('y', String(yMin));
          over.setAttribute('width', String(xMax - xMin));
          over.setAttribute('height', String(yMax - yMin));
          over.setAttribute('rx', '10');
          over.setAttribute('fill', 'url(#tree-fold-hatch)');
          over.setAttribute('opacity', '0.4');
          overlayG.appendChild(over);
        }
      }
    }

    function applyCursor() {
      for (const e of nodeEls.values()) e.cursor?.setAttribute('opacity', '0');
      if (features.has('cursor') && cursorId) {
        const e = nodeEls.get(cursorId);
        if (e?.cursor) {
          e.cursor.setAttribute('stroke', colors.accent);
          e.cursor.removeAttribute('stroke-dasharray');
          e.cursor.setAttribute('opacity', '1');
        }
      }
      if (features.has('aux-cursor') && auxCursorId) {
        const e = nodeEls.get(auxCursorId);
        if (e?.cursor) {
          e.cursor.setAttribute('stroke', colors.auxCursor);
          e.cursor.setAttribute('stroke-dasharray', '3 2');
          e.cursor.setAttribute('opacity', '1');
        }
      }
    }

    function applyGhost(pos: Positioned) {
      ghostG.textContent = '';
      if (!features.has('ghost-probe') || !ghostProbe) return;
      const parent = (function find(p: Positioned): Positioned | null {
        if (p.id === ghostProbe!.parentId) return p;
        for (const c of p.children) {
          if (!c) continue;
          const f = find(c);
          if (f) return f;
        }
        return null;
      })(pos);
      if (!parent) return;
      // 자식 슬롯 좌표 추정 — binary-ordered 기준 좌/우 폭 절반.
      const depth = parent.depth + 1;
      const firstChild = pos.children[0] ?? pos.children[1] ?? null;
      const yStep = firstChild ? Math.abs(pos.y - firstChild.y) : 40;
      const xHalfRange = W / Math.pow(2, depth + 1);
      const cx = ghostProbe.side === 'L' ? parent.x - xHalfRange : parent.x + xHalfRange;
      const cy = parent.y + yStep;
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('cx', String(cx));
      ring.setAttribute('cy', String(cy));
      ring.setAttribute('r', '16');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', colors.ghostOutline);
      ring.setAttribute('stroke-width', '1.5');
      ring.setAttribute('stroke-dasharray', '3 3');
      ghostG.appendChild(ring);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(cx));
      label.setAttribute('y', String(cy + 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', colors.textMuted);
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '600');
      label.textContent = ghostProbe.label;
      ghostG.appendChild(label);
      // 부모→ghost 간선 점선
      const edge = document.createElementNS(SVG_NS, 'line');
      edge.setAttribute('x1', String(parent.x));
      edge.setAttribute('y1', String(parent.y));
      edge.setAttribute('x2', String(cx));
      edge.setAttribute('y2', String(cy));
      edge.setAttribute('stroke', colors.ghostOutline);
      edge.setAttribute('stroke-width', '1.5');
      edge.setAttribute('stroke-dasharray', '3 3');
      ghostG.appendChild(edge);
    }

    function render() {
      edgesG.textContent = '';
      nodesG.textContent = '';
      shadeG.textContent = '';
      overlayG.textContent = '';
      nodeEls.clear();
      edgeEls.clear();
      if (!tree) {
        inorderG.textContent = '';
        guidesG.textContent = '';
        ghostG.textContent = '';
        return;
      }
      const positioned = layoutRoot(tree, layoutMode, W, H);
      renderShades(positioned);

      function walk(p: Positioned, parentPos: Positioned | null, parentId: string | null, pathFromRoot: string) {
        if (parentPos) {
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', String(parentPos.x));
          line.setAttribute('y1', String(parentPos.y));
          line.setAttribute('x2', String(p.x));
          line.setAttribute('y2', String(p.y));
          line.setAttribute('stroke', EDGE_COLOR.default);
          line.setAttribute('stroke-width', '2');
          edgesG.appendChild(line);
          edgeEls.set(edgeKey(parentPos.id, p.id), {
            line,
            state: 'default',
            parentId: parentPos.id,
            childId: p.id,
          });
        }
        const g = document.createElementNS(SVG_NS, 'g');
        // 커서 외곽 링 — features 에 'cursor' 또는 'aux-cursor' 가 있을 때만
        // DOM 에 추가한다. 기본값(features=[]) 에서는 circle 이 노드당 1개로
        // 기존 tree-layout 동작과 호환.
        let cursor: SVGCircleElement | null = null;
        if (features.has('cursor') || features.has('aux-cursor')) {
          cursor = document.createElementNS(SVG_NS, 'circle');
          cursor.setAttribute('cx', String(p.x));
          cursor.setAttribute('cy', String(p.y));
          cursor.setAttribute('r', '20');
          cursor.setAttribute('fill', 'none');
          cursor.setAttribute('stroke', colors.accent);
          cursor.setAttribute('stroke-width', '2');
          cursor.setAttribute('opacity', '0');
          g.appendChild(cursor);
        }
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
        nodeEls.set(p.id, {
          group: g,
          circle,
          cursor,
          state: 'default',
          parentId,
          x: p.x,
          y: p.y,
          pathFromRoot,
        });
        const kids = p.children;
        for (let i = 0; i < kids.length; i++) {
          const kid = kids[i];
          if (!kid) continue;
          const side = layoutMode === 'binary-ordered' ? (i === 0 ? 'L' : 'R') : '';
          walk(kid, p, p.id, pathFromRoot + side);
        }
      }
      walk(positioned, null, null, '');
      recomputeFoldedNodeIds();
      applyFoldVisuals();
      applyCursor();
      renderInorderStrip(positioned);
      applyGhost(positioned);
    }

    function setTree(n: TreeNode): void {
      tree = n;
      folded.clear();
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

    function addNode(parentId: string, child: TreeNode): void {
      if (!tree) return;
      findAndAttach(tree, parentId, child);
      render();
    }

    function removeNode(id: string): void {
      if (!tree) return;
      if (tree.id === id) {
        tree = null;
        folded.clear();
        render();
        return;
      }
      findAndRemove(tree, id);
      render();
    }

    function replaceNodeLabel(id: string, label: string): void {
      if (!tree) return;
      const n = findNode(tree, id);
      if (n) n.label = label;
      // 경량 갱신 — 해당 노드 text 만 바꿈
      const entry = nodeEls.get(id);
      if (entry) {
        const txt = entry.group.querySelector('text');
        if (txt) txt.textContent = label;
      }
    }

    function setLayoutMode(mode: TreeLayoutMode): void {
      if (mode === layoutMode) return;
      layoutMode = mode;
      render();
    }

    function setCursor(id: string | null): void {
      cursorId = id;
      applyCursor();
    }

    function setAuxCursor(id: string | null): void {
      auxCursorId = id;
      applyCursor();
    }

    async function foldSubtree(rootId: string, side: FoldSide, durationMs?: number): Promise<void> {
      if (!features.has('fold-collapse') || !tree) return;
      let sides = folded.get(rootId);
      if (!sides) {
        sides = new Set();
        folded.set(rootId, sides);
      }
      sides.add(side);
      const ids = collectSubtreeIds(tree, rootId, side);
      const ms = durationMs ?? DEFAULT_FOLD_MS;
      for (const id of ids) {
        const e = nodeEls.get(id);
        if (!e) continue;
        e.group.style.transition = `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out`;
        const dx = side === 'L' ? 6 : -6;
        e.group.style.transformOrigin = `${e.x}px ${e.y}px`;
        e.group.style.transform = `translate(${dx}px, 0px) scale(0.92)`;
        e.group.style.opacity = '0.45';
        foldedNodeIds.add(id);
      }
      applyFoldVisuals();
      renderInorderStripFromCurrent();
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    async function unfoldSubtree(rootId: string, side?: FoldSide, durationMs?: number): Promise<void> {
      if (!features.has('fold-collapse') || !tree) return;
      const sides = folded.get(rootId);
      if (!sides) return;
      const ms = durationMs ?? DEFAULT_FOLD_MS;
      const targets: FoldSide[] = side ? [side] : Array.from(sides);
      for (const s of targets) {
        const ids = collectSubtreeIds(tree, rootId, s);
        for (const id of ids) {
          const e = nodeEls.get(id);
          if (!e) continue;
          e.group.style.transition = `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out`;
          e.group.style.transform = '';
          e.group.style.opacity = '';
          e.circle.removeAttribute('fill-opacity');
          e.circle.removeAttribute('filter');
        }
        sides.delete(s);
      }
      if (sides.size === 0) folded.delete(rootId);
      recomputeFoldedNodeIds();
      overlayG.textContent = '';
      applyFoldVisuals();
      renderInorderStripFromCurrent();
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
    }

    function unfoldAll(): void {
      if (!tree) return;
      for (const [rootId, sides] of folded) {
        for (const side of sides) {
          for (const id of collectSubtreeIds(tree, rootId, side)) {
            const e = nodeEls.get(id);
            if (!e) continue;
            e.group.style.transform = '';
            e.group.style.opacity = '';
            e.circle.removeAttribute('fill-opacity');
            e.circle.removeAttribute('filter');
          }
        }
      }
      folded.clear();
      foldedNodeIds.clear();
      overlayG.textContent = '';
      renderInorderStripFromCurrent();
    }

    function renderInorderStripFromCurrent(): void {
      if (!tree || !useInorder) return;
      const positioned = layoutRoot(tree, layoutMode, W, H);
      renderInorderStrip(positioned);
    }

    function setGhostProbe(parentId: string, side: FoldSide, label: string): void {
      if (!features.has('ghost-probe') || !tree) return;
      ghostProbe = { parentId, side, label };
      const positioned = layoutRoot(tree, layoutMode, W, H);
      applyGhost(positioned);
    }

    function clearGhostProbe(): void {
      ghostProbe = null;
      ghostG.textContent = '';
    }

    function reset(): void {
      tree = null;
      folded.clear();
      foldedNodeIds.clear();
      cursorId = null;
      auxCursorId = null;
      ghostProbe = null;
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
      removeNode,
      replaceNodeLabel,
      setLayoutMode,
      setCursor,
      setAuxCursor,
      foldSubtree,
      unfoldSubtree,
      unfoldAll,
      setGhostProbe,
      clearGhostProbe,
      reset,
    };
  },
};
