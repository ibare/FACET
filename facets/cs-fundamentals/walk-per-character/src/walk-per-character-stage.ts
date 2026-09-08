/**
 * walk-per-character-stage — 트라이를 그리고, 커서가 글자를 따라 실제로 한
 * 칸씩 내려가는 모습을 보여주는 전용 캔버스.
 *
 * 빌트인 `tree-layout` 의 `cursor` 기능은 노드 둘레에 링을 즉시 켜고 끌 뿐
 * 이동하지 않는다(오퍼시티 전환) — 이 조각의 동사 "내려간다" 에는 맞지 않아
 * 새로 그린다(S-piece).
 *
 * 노드 id 규칙: 뿌리는 `'root'`, 그 외는 뿌리부터의 접두사 문자열
 * (`facets/cs-fundamentals/walk-per-character/src/algorithm.ts` 와 동일 규칙,
 * 다만 이 파일은 그 파일을 import 하지 않고 `words` 로부터 동형으로 다시
 * 계산한다 — View 는 Algorithm 을 참조하지 않는다, 원칙 1).
 */

import { getColors, fonts, fontSizes, PIECE_CANVAS_W, type Palette } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const NODE_R = 20;
const RING_R = NODE_R + 6;
const ROW_GAP = 78;
const TOP_PAD = 30;
const SIDE_MARGIN = 34;
const CAPTION_AREA_H = 72;
const MOVE_MS = 320;

type ShapeNode = {
  id: string;
  letter: string | null;
  isEnd: boolean;
  children: ShapeNode[];
};

function buildShape(words: string[]): ShapeNode {
  const root: ShapeNode = { id: 'root', letter: null, isEnd: false, children: [] };
  const byId = new Map<string, ShapeNode>([['root', root]]);
  for (const word of words) {
    let node = root;
    let prefix = '';
    for (const ch of word) {
      prefix += ch;
      let child = byId.get(prefix);
      if (!child) {
        child = { id: prefix, letter: ch, isEnd: false, children: [] };
        byId.set(prefix, child);
        node.children.push(child);
      }
      node = child;
    }
    node.isEnd = true;
  }
  (function sortChildren(n: ShapeNode) {
    n.children.sort((a, b) => (a.letter ?? '').localeCompare(b.letter ?? ''));
    n.children.forEach(sortChildren);
  })(root);
  return root;
}

function countLeaves(n: ShapeNode): number {
  if (n.children.length === 0) return 1;
  return n.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

function maxDepth(n: ShapeNode, depth = 0): number {
  if (n.children.length === 0) return depth;
  return Math.max(...n.children.map((c) => maxDepth(c, depth + 1)));
}

type Pos = { id: string; letter: string | null; isEnd: boolean; x: number; y: number; depth: number; parentId: string | null };

/** leaf 열 균등 분할 + 내부 노드는 자식 x 의 평균 — 트리 폭을 그대로 채운다. */
function layoutShape(root: ShapeNode, innerLeft: number, innerW: number): Map<string, Pos> {
  const positions = new Map<string, Pos>();
  const leafCount = Math.max(1, countLeaves(root));
  const colW = innerW / leafCount;
  let leafCursor = 0;

  function place(n: ShapeNode, depth: number, parentId: string | null): number {
    const y = TOP_PAD + depth * ROW_GAP;
    let x: number;
    if (n.children.length === 0) {
      x = innerLeft + (leafCursor + 0.5) * colW;
      leafCursor += 1;
    } else {
      const childXs = n.children.map((c) => place(c, depth + 1, n.id));
      x = childXs.reduce((s, v) => s + v, 0) / childXs.length;
    }
    positions.set(n.id, { id: n.id, letter: n.letter, isEnd: n.isEnd, x, y, depth, parentId });
    return x;
  }
  place(root, 0, null);
  return positions;
}

function computeHeight(root: ShapeNode): number {
  return TOP_PAD + maxDepth(root) * ROW_GAP + NODE_R + CAPTION_AREA_H;
}

type NodeVisual = 'default' | 'onPath' | 'active' | 'found' | 'noWord' | 'blocked';

function nodeFill(colors: Palette, v: NodeVisual): string {
  switch (v) {
    case 'default':
      return colors.bg;
    case 'onPath':
      return colors.itemSorted;
    case 'active':
      return colors.itemActive;
    case 'found':
      return colors.accent;
    case 'noWord':
      return colors.itemActive;
    case 'blocked':
      return colors.danger;
  }
}

function nodeInk(colors: Palette, v: NodeVisual): string {
  switch (v) {
    case 'default':
      return colors.text;
    case 'onPath':
      return colors.textInverse;
    default:
      return colors.stateInk;
  }
}

type NodeEntry = { pos: Pos; circle: SVGCircleElement; letterText: SVGTextElement | null; endMark: SVGCircleElement | null };
type EdgeEntry = { line: SVGLineElement; parentId: string; childId: string };

export type WalkPerCharacterStageInstance = ViewInstance & {
  /** 담긴 말들로부터 뼈대(뿌리 포함 아홉 자리)를 그린다. */
  init(words: string[]): void;
  /** 새 찾기를 시작 — 이전 강조를 지우고 커서를 뿌리로 되돌린다(즉시, 비-동작). */
  beginSearch(caption: string): void;
  /** 한 글자를 따라 한 칸 내려간다 — 커서가 실제로 이동한다. */
  stepDown(fromId: string, toId: string, caption: string, descended: number): Promise<void>;
  /** 글자를 다 썼거나 가지가 없어 답이 난 자리를 표시한다. */
  finish(nodeId: string, verdict: 'found' | 'no-word' | 'blocked', caption: string, blockedChar?: string): void;
};

export const walkPerCharacterStageView: CanvasView = {
  canvas: { height: 360 },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): WalkPerCharacterStageInstance {
    const svg = params.canvas;
    const W = PIECE_CANVAS_W;
    let colors = getColors(params.theme);

    const root = document.createElementNS(SVG_NS, 'g');
    root.setAttribute('font-family', fonts.body);
    svg.appendChild(root);

    const edgesG = document.createElementNS(SVG_NS, 'g');
    const nodesG = document.createElementNS(SVG_NS, 'g');
    const cursorG = document.createElementNS(SVG_NS, 'g');
    const badgeG = document.createElementNS(SVG_NS, 'g');
    const textG = document.createElementNS(SVG_NS, 'g');
    root.append(edgesG, nodesG, cursorG, badgeG, textG);

    const nodeEls = new Map<string, NodeEntry>();
    const edgeEls: EdgeEntry[] = [];
    let positions = new Map<string, Pos>();

    const ring = document.createElementNS(SVG_NS, 'circle');
    ring.setAttribute('r', String(RING_R));
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke-width', '2.5');
    ring.setAttribute('opacity', '0');
    ring.style.transition = `cx ${MOVE_MS}ms ease-in-out, cy ${MOVE_MS}ms ease-in-out`;
    cursorG.appendChild(ring);

    const captionText = document.createElementNS(SVG_NS, 'text');
    captionText.setAttribute('x', String(W / 2));
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-size', String(fontSizes.md));
    captionText.setAttribute('fill', colors.text);
    const counterText = document.createElementNS(SVG_NS, 'text');
    counterText.setAttribute('x', String(W / 2));
    counterText.setAttribute('text-anchor', 'middle');
    counterText.setAttribute('font-size', String(fontSizes.sm));
    counterText.setAttribute('fill', colors.textMuted);
    textG.append(captionText, counterText);

    function edgeLabelId(parentId: string, childId: string): string {
      return `${parentId}->${childId}`;
    }

    function render(shapeRoot: ShapeNode): void {
      const innerLeft = SIDE_MARGIN;
      const innerW = W - SIDE_MARGIN * 2;
      positions = layoutShape(shapeRoot, innerLeft, innerW);
      const H = computeHeight(shapeRoot);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('height', String(H));
      captionText.setAttribute('y', String(H - CAPTION_AREA_H + 30));
      counterText.setAttribute('y', String(H - CAPTION_AREA_H + 52));

      edgesG.textContent = '';
      nodesG.textContent = '';
      nodeEls.clear();
      edgeEls.length = 0;

      // 간선 — 부모→자식.
      (function walkEdges(n: ShapeNode) {
        const p = positions.get(n.id)!;
        for (const c of n.children) {
          const cp = positions.get(c.id)!;
          const line = document.createElementNS(SVG_NS, 'line');
          line.setAttribute('x1', String(p.x));
          line.setAttribute('y1', String(p.y));
          line.setAttribute('x2', String(cp.x));
          line.setAttribute('y2', String(cp.y));
          line.setAttribute('stroke', colors.border);
          line.setAttribute('stroke-width', '2');
          line.dataset.edge = edgeLabelId(n.id, c.id);
          edgesG.appendChild(line);
          edgeEls.push({ line, parentId: n.id, childId: c.id });

          const mx = (p.x + cp.x) / 2;
          const my = (p.y + cp.y) / 2;
          const label = document.createElementNS(SVG_NS, 'text');
          label.setAttribute('x', String(mx));
          label.setAttribute('y', String(my - 6));
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('font-size', String(fontSizes.sm));
          label.setAttribute('font-family', fonts.mono ?? fonts.body);
          label.setAttribute('fill', colors.textMuted);
          label.setAttribute('paint-order', 'stroke');
          label.setAttribute('stroke', colors.bg);
          label.setAttribute('stroke-width', '4');
          label.textContent = c.letter ?? '';
          edgesG.appendChild(label);

          walkEdges(c);
        }
      })(shapeRoot);

      // 노드.
      for (const pos of positions.values()) {
        const circle = document.createElementNS(SVG_NS, 'circle');
        circle.setAttribute('cx', String(pos.x));
        circle.setAttribute('cy', String(pos.y));
        circle.setAttribute('r', String(pos.id === 'root' ? NODE_R * 0.55 : NODE_R));
        circle.setAttribute('fill', colors.bg);
        circle.setAttribute('stroke', colors.border);
        circle.setAttribute('stroke-width', '2');
        nodesG.appendChild(circle);

        let letterText: SVGTextElement | null = null;
        if (pos.letter) {
          letterText = document.createElementNS(SVG_NS, 'text');
          letterText.setAttribute('x', String(pos.x));
          letterText.setAttribute('y', String(pos.y + 5));
          letterText.setAttribute('text-anchor', 'middle');
          letterText.setAttribute('font-size', String(fontSizes.md));
          letterText.setAttribute('font-family', fonts.mono ?? fonts.body);
          letterText.setAttribute('fill', colors.text);
          letterText.textContent = pos.letter;
          nodesG.appendChild(letterText);
        }

        let endMark: SVGCircleElement | null = null;
        if (pos.isEnd) {
          endMark = document.createElementNS(SVG_NS, 'circle');
          endMark.setAttribute('cx', String(pos.x));
          endMark.setAttribute('cy', String(pos.y + NODE_R + 8));
          endMark.setAttribute('r', '3');
          endMark.setAttribute('fill', colors.textMuted);
          nodesG.appendChild(endMark);
        }

        nodeEls.set(pos.id, { pos, circle, letterText, endMark });
      }

      ring.setAttribute('opacity', '0');
      badgeG.textContent = '';
      captionText.textContent = '';
      counterText.textContent = '';
    }

    function setNodeVisual(id: string, v: NodeVisual): void {
      const e = nodeEls.get(id);
      if (!e) return;
      e.circle.setAttribute('fill', nodeFill(colors, v));
      if (e.letterText) e.letterText.setAttribute('fill', nodeInk(colors, v));
    }

    function setEdgeVisual(parentId: string, childId: string, on: boolean): void {
      const e = edgeEls.find((x) => x.parentId === parentId && x.childId === childId);
      if (!e) return;
      e.line.setAttribute('stroke', on ? colors.itemSorted : colors.border);
    }

    function resetVisuals(): void {
      for (const id of nodeEls.keys()) setNodeVisual(id, 'default');
      for (const e of edgeEls) e.line.setAttribute('stroke', colors.border);
      badgeG.textContent = '';
    }

    function placeRingAt(id: string): void {
      const pos = positions.get(id);
      if (!pos) return;
      ring.setAttribute('stroke', colors.itemActive);
      ring.setAttribute('cx', String(pos.x));
      ring.setAttribute('cy', String(pos.y));
      ring.setAttribute('opacity', '1');
    }

    function init(words: string[]): void {
      colors = getColors(params.theme);
      const shape = buildShape(words);
      render(shape);
    }

    function beginSearch(caption: string): void {
      resetVisuals();
      // 뿌리로 되돌리는 것은 "내려간다" 의 동사가 아니므로 즉시 이동(스냅).
      ring.style.transition = 'none';
      placeRingAt('root');
      // 다음 stepDown 부터는 다시 애니메이션 이동.
      requestAnimationFrame(() => {
        ring.style.transition = `cx ${MOVE_MS}ms ease-in-out, cy ${MOVE_MS}ms ease-in-out`;
      });
      captionText.textContent = caption;
      counterText.textContent = '';
    }

    async function stepDown(fromId: string, toId: string, caption: string, descended: number): Promise<void> {
      if (fromId !== 'root') setNodeVisual(fromId, 'onPath');
      setEdgeVisual(fromId, toId, true);
      placeRingAt(toId);
      setNodeVisual(toId, 'active');
      captionText.textContent = caption;
      counterText.textContent = `${descended}`;
      await new Promise<void>((resolve) => setTimeout(resolve, MOVE_MS));
    }

    function finish(nodeId: string, verdict: 'found' | 'no-word' | 'blocked', caption: string, blockedChar?: string): void {
      ring.setAttribute('opacity', '0');
      const visual: NodeVisual = verdict === 'found' ? 'found' : verdict === 'no-word' ? 'noWord' : 'blocked';
      setNodeVisual(nodeId, visual);
      captionText.textContent = caption;
      if (verdict === 'blocked' && blockedChar) {
        const pos = positions.get(nodeId);
        if (pos) {
          const bx = pos.x + NODE_R * 0.85;
          const by = pos.y - NODE_R * 0.85;
          const badge = document.createElementNS(SVG_NS, 'circle');
          badge.setAttribute('cx', String(bx));
          badge.setAttribute('cy', String(by));
          badge.setAttribute('r', '11');
          badge.setAttribute('fill', colors.danger);
          badgeG.appendChild(badge);
          const badgeText = document.createElementNS(SVG_NS, 'text');
          badgeText.setAttribute('x', String(bx));
          badgeText.setAttribute('y', String(by + 4));
          badgeText.setAttribute('text-anchor', 'middle');
          badgeText.setAttribute('font-size', String(fontSizes.sm));
          badgeText.setAttribute('font-family', fonts.mono ?? fonts.body);
          badgeText.setAttribute('fill', colors.stateInk);
          badgeText.textContent = `×${blockedChar}`;
          badgeG.appendChild(badgeText);
        }
      }
    }

    return {
      destroy() {
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      init,
      beginSearch,
      stepDown,
      finish,
    };
  },
};
