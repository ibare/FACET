/**
 * bst-compare-and-go-stage — 이진 탐색 트리를 실제로 내려가는 조각 전용 캔버스.
 *
 * 동사 "내려간다" 를 그림으로: 커서 링이 노드에서 노드로 실제로 이동한다
 * (opacity 전환이 아니라 좌표 이동). 버린 쪽 서브트리는 지워지지 않고 옅어져
 * 자리에 남는다 — "후보에서 빠짐" 은 색/투명도 상태이지 동사가 아니므로 색
 * 전환으로 표현한다 (S-piece MUST NOT의 예외 조건).
 *
 * 빌트인 tree-layout view 는 fold-collapse/cursor 기능이 있지만 캡션 텍스트를
 * 자체 지원하지 않는다 — 이 조각의 동사는 "비교 결과 문장이 매 걸음 바뀌는 것"이
 * 그림의 일부라 캔버스 안에 캡션 영역을 함께 그린다 (S-facet: 빌트인이 표현
 * 못 하는 조합에 한해 전용 stage).
 */

import { getColors, fonts, fontSizes, radii, space, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const SIDE_MARGIN = 48;
const TOP_Y = 40;
const LEVEL_GAP = 72;
const NODE_R = 21;
const CURSOR_R = NODE_R + 7;
const MOVE_MS = 340;
const FOLD_MS = 320;
const CAPTION_GAP = 18;
const CAPTION_H = 40;
const BOTTOM_PAD = 20;
// 이 조각의 데이터는 정확히 3층 (50 / 30·70 / 20·40·60·80) — 사양에 고정된 값.
const LEVELS = 3;
const H = TOP_Y + (LEVELS - 1) * LEVEL_GAP + NODE_R + BOTTOM_PAD + CAPTION_GAP + CAPTION_H;

export type BstStageNode = {
  id: string;
  value: number;
  left: BstStageNode | null;
  right: BstStageNode | null;
};

type Pos = { x: number; y: number; depth: number };

function layoutPositions(root: BstStageNode, xMin: number, xMax: number): Map<string, Pos> {
  const out = new Map<string, Pos>();
  function place(node: BstStageNode, lo: number, hi: number, depth: number): void {
    const x = (lo + hi) / 2;
    const y = TOP_Y + depth * LEVEL_GAP;
    out.set(node.id, { x, y, depth });
    if (node.left) place(node.left, lo, x, depth + 1);
    if (node.right) place(node.right, x, hi, depth + 1);
  }
  place(root, xMin, xMax, 0);
  return out;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type NodeEntry = {
  node: BstStageNode;
  circle: SVGCircleElement;
  text: SVGTextElement;
  x: number;
  y: number;
};

export const bstCompareAndGoStageView: CanvasView = {
  canvas: { height: H },
  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const svg = params.canvas;

    const wrap = document.createElement('div');
    wrap.style.background = colors.bg;
    wrap.style.border = `1px solid ${colors.border}`;
    wrap.style.borderRadius = radii.md;
    wrap.style.padding = space.sm;
    wrap.style.boxSizing = 'border-box';

    const edgesG = document.createElementNS(SVG_NS, 'g');
    const nodesG = document.createElementNS(SVG_NS, 'g');

    const cursor = document.createElementNS(SVG_NS, 'circle');
    cursor.setAttribute('r', String(CURSOR_R));
    cursor.setAttribute('fill', 'none');
    cursor.setAttribute('stroke', colors.accent);
    cursor.setAttribute('stroke-width', '3');
    cursor.style.opacity = '0';
    cursor.style.transition = `transform ${MOVE_MS}ms ease, opacity 150ms ease`;

    const captionY = H - CAPTION_H;
    const captionBoxH = CAPTION_H - 8;
    const captionBg = document.createElementNS(SVG_NS, 'rect');
    captionBg.setAttribute('x', String(SIDE_MARGIN / 2));
    captionBg.setAttribute('y', String(captionY));
    captionBg.setAttribute('width', String(W - SIDE_MARGIN));
    captionBg.setAttribute('height', String(captionBoxH));
    captionBg.setAttribute('rx', '8');
    captionBg.setAttribute('fill', colors.bgSubtle);
    captionBg.setAttribute('stroke', colors.border);
    captionBg.setAttribute('stroke-width', '1');

    const captionText = document.createElementNS(SVG_NS, 'text');
    captionText.setAttribute('x', String(W / 2));
    captionText.setAttribute('y', String(captionY + captionBoxH / 2 + 5));
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-family', fonts.body);
    captionText.setAttribute('font-size', fontSizes.sm);
    captionText.setAttribute('fill', colors.text);

    svg.append(edgesG, nodesG, cursor, captionBg, captionText);
    wrap.appendChild(svg);
    container.appendChild(wrap);

    const nodeIndex = new Map<string, NodeEntry>();
    const edgeIndex = new Map<string, SVGLineElement>();

    function edgeKey(parentId: string, childId: string): string {
      return `${parentId}->${childId}`;
    }

    function hideCursor(): void {
      cursor.style.opacity = '0';
    }

    function setTree(root: BstStageNode): void {
      nodeIndex.clear();
      edgeIndex.clear();
      edgesG.textContent = '';
      nodesG.textContent = '';
      const positions = layoutPositions(root, SIDE_MARGIN, W - SIDE_MARGIN);

      function walk(node: BstStageNode, parent: BstStageNode | null): void {
        const pos = positions.get(node.id);
        if (!pos) return;
        if (parent) {
          const parentPos = positions.get(parent.id);
          if (parentPos) {
            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', String(parentPos.x));
            line.setAttribute('y1', String(parentPos.y));
            line.setAttribute('x2', String(pos.x));
            line.setAttribute('y2', String(pos.y));
            line.setAttribute('stroke', colors.border);
            line.setAttribute('stroke-width', '2');
            line.style.transition = `opacity ${FOLD_MS}ms ease`;
            edgesG.appendChild(line);
            edgeIndex.set(edgeKey(parent.id, node.id), line);
          }
        }
        const g = document.createElementNS(SVG_NS, 'g');
        const circle = document.createElementNS(SVG_NS, 'circle');
        // 타일과 잉크는 늘 짝으로 바꾼다 (design-tokens 의 결정표).
        //   itemDefault 는 배경과 값이 같아 stateInk 를 얹으면 다크에서 사라진다.
        //   itemPivot 은 두 팔레트에서 고정이라 stateInk 가 맞다.
        circle.setAttribute('cx', String(pos.x));
        circle.setAttribute('cy', String(pos.y));
        circle.setAttribute('r', String(NODE_R));
        circle.setAttribute('fill', colors.itemDefault);
        circle.setAttribute('stroke', colors.border);
        circle.setAttribute('stroke-width', '2');
        circle.style.transformOrigin = `${pos.x}px ${pos.y}px`;
        circle.style.transition = `fill-opacity ${FOLD_MS}ms ease, opacity ${FOLD_MS}ms ease, transform ${FOLD_MS}ms ease`;

        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', String(pos.x));
        text.setAttribute('y', String(pos.y + 4));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-family', fonts.mono);
        text.setAttribute('font-size', fontSizes.sm);
        text.setAttribute('font-weight', '600');
        text.setAttribute('fill', colors.text);
        text.style.transition = `opacity ${FOLD_MS}ms ease`;
        text.textContent = String(node.value);

        g.append(circle, text);
        nodesG.appendChild(g);
        nodeIndex.set(node.id, { node, circle, text, x: pos.x, y: pos.y });

        if (node.left) walk(node.left, node);
        if (node.right) walk(node.right, node);
      }
      walk(root, null);
      hideCursor();
    }

    async function moveCursor(nodeId: string): Promise<void> {
      const entry = nodeIndex.get(nodeId);
      if (!entry) return;
      cursor.style.opacity = '1';
      cursor.style.transform = `translate(${entry.x}px, ${entry.y}px)`;
      await wait(MOVE_MS);
    }

    function dimEdge(parentId: string, childId: string): void {
      const line = edgeIndex.get(edgeKey(parentId, childId));
      if (line) line.style.opacity = '0.25';
    }

    async function foldSide(rootId: string, side: 'L' | 'R', nodeIds: string[]): Promise<void> {
      const rootEntry = nodeIndex.get(rootId);
      if (!rootEntry) return;
      const entryChild = side === 'L' ? rootEntry.node.left : rootEntry.node.right;
      if (entryChild) dimEdge(rootId, entryChild.id);
      const dx = side === 'L' ? -6 : 6;
      for (const id of nodeIds) {
        const entry = nodeIndex.get(id);
        if (!entry) continue;
        entry.circle.style.opacity = '0.3';
        entry.circle.style.transform = `translate(${dx}px, 4px) scale(0.88)`;
        entry.text.style.opacity = '0.3';
        if (entry.node.left) dimEdge(id, entry.node.left.id);
        if (entry.node.right) dimEdge(id, entry.node.right.id);
      }
      await wait(FOLD_MS);
    }

    function setMatched(nodeId: string): void {
      const entry = nodeIndex.get(nodeId);
      if (!entry) return;
      entry.circle.setAttribute('fill', colors.itemPivot);
      entry.text.setAttribute('fill', colors.stateInk);
      entry.circle.style.opacity = '1';
      entry.circle.style.transform = 'scale(1.05)';
      entry.text.style.opacity = '1';
    }

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function reset(): void {
      hideCursor();
      for (const entry of nodeIndex.values()) {
        entry.circle.setAttribute('fill', colors.itemDefault);
        entry.text.setAttribute('fill', colors.text);
        entry.circle.style.opacity = '1';
        entry.circle.style.transform = 'translate(0px, 0px) scale(1)';
        entry.text.style.opacity = '1';
      }
      for (const line of edgeIndex.values()) {
        line.style.opacity = '1';
      }
      captionText.textContent = '';
    }

    return {
      destroy() {
        if (wrap.parentElement) wrap.remove();
      },
      setTree,
      moveCursor,
      foldSide,
      setMatched,
      setCaption,
      reset,
    };
  },
};
