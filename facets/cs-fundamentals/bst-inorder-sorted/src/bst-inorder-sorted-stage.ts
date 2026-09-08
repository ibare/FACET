/**
 * bst-inorder-sorted-stage — 트리 위 노드가 값을 아래 줄로 흘려보내는 그림.
 *
 * 빌트인 tree-layout 의 inorder-projection 은 트리 구조가 바뀔 때마다 전체
 * 중위 줄을 한 번에 다시 그리는 정적 스트립이라 (순회 진행 상태를 모른다),
 * "한 걸음마다 하나씩 흘러나와 쌓인다" 는 진행형 장면을 표현할 수 없다.
 * 그래서 이 조각은 트리(위) + 흘러나오는 줄(아래) 을 한 캔버스에 직접 그린다.
 *
 * 위: 이진 탐색 트리. 서 있는 노드는 강조색으로, 이미 내놓은 노드는 정렬색으로
 *     굳는다.
 * 아래: 아홉 칸의 빈 줄. `flowOut` 이 불릴 때마다 그 노드의 값이 실제로
 *     자기 좌표에서 줄의 다음 빈 칸으로 이동해 내려앉는다 — opacity 전환이
 *     아니라 좌표가 실제로 움직인다 (S-piece).
 */

import { getColors, PIECE_CANVAS_W, fonts, fontSizes, radii, space } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type BstInorderSortedStageNode = {
  value: number;
  left: number | null;
  right: number | null;
};

export type BstInorderSortedStageInstance = ViewInstance & {
  setTree(nodes: BstInorderSortedStageNode[], rootValue: number): void;
  standAt(value: number): void;
  leave(value: number): void;
  settle(value: number): void;
  flowOut(value: number): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

const W = PIECE_CANVAS_W;

// ── 세로 배치 상수. 캔버스 높이는 이 값들에서 그대로 계산해 export 하므로
//    아래 상수를 고치면 `canvas.height` 도 같이 맞는다.
const CAPTION_H = 26;
const TREE_TOP = CAPTION_H + 14; // depth 0 노드 중심 y
const LEVEL_GAP = 54; // 층간 간격 (4층 트리 = 간격 3개)
const DEPTH_GAPS = 3;
const NODE_R = 16;
const TREE_BOTTOM = TREE_TOP + DEPTH_GAPS * LEVEL_GAP + NODE_R;
const FALL_GAP = 22; // 트리 바닥과 출력 줄 사이 여백
const OUTPUT_TOP = TREE_BOTTOM + FALL_GAP;
const OUTPUT_CELL_H = 34;
const BOTTOM_PAD = 14;
const H = OUTPUT_TOP + OUTPUT_CELL_H + BOTTOM_PAD;

const SIDE_MARGIN = 44; // 트리 좌우 여백 — 가장자리 노드 반지름이 잘리지 않을 정도
const CELL_MAX_W = 56;
const CELL_SIDE_MIN = 24;

const ANIM_MS = 380;

type PositionedNode = {
  value: number;
  x: number;
  y: number;
};

type NodeEntry = {
  group: SVGGElement;
  circle: SVGCircleElement;
  label: SVGTextElement;
  x: number;
  y: number;
  standing: boolean;
  filled: 'default' | 'settled';
};

export const bstInorderSortedStageView: CanvasView = {
  canvas: { height: H },
  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): BstInorderSortedStageInstance {
    container.textContent = '';
    const colors = getColors(params.theme);

    const root = document.createElement('div');
    root.className = 'facet-bst-inorder-sorted';
    root.style.padding = space.md;
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.fontFamily = fonts.body;

    const svg = params.canvas;
    const captionG = document.createElementNS(SVG_NS, 'g');
    const edgesG = document.createElementNS(SVG_NS, 'g');
    const nodesG = document.createElementNS(SVG_NS, 'g');
    const outputG = document.createElementNS(SVG_NS, 'g');
    svg.append(captionG, edgesG, nodesG, outputG);
    root.appendChild(svg);
    container.appendChild(root);

    const captionText = document.createElementNS(SVG_NS, 'text');
    captionText.setAttribute('x', String(W / 2));
    captionText.setAttribute('y', String(16));
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('fill', colors.textMuted);
    captionText.setAttribute('font-size', fontSizes.sm);
    captionText.setAttribute('font-family', fonts.body);
    captionG.appendChild(captionText);

    const nodeEls = new Map<number, NodeEntry>();
    let outCount = 0;
    let n = 0;
    let originX = 0;
    let cellW = CELL_MAX_W;

    function repaint(entry: NodeEntry): void {
      const fill = entry.standing
        ? colors.itemActive
        : entry.filled === 'settled'
          ? colors.itemSorted
          : colors.itemDefault;
      // 타일마다 잉크가 다르다 (design-tokens 의 결정표).
      //   itemActive  두 팔레트에서 고정   → stateInk
      //   itemSorted  테마를 따라 뒤집힘   → textInverse
      //   itemDefault 배경과 값이 같다     → text. 여기에 textInverse 를 쓰면
      //               흰 바탕에 흰 글자, 검은 바탕에 검은 글자가 되어 두 테마
      //               모두에서 아직 서지 않은 노드의 라벨이 사라진다.
      const ink = entry.standing
        ? colors.stateInk
        : entry.filled === 'settled'
          ? colors.textInverse
          : colors.text;
      entry.circle.setAttribute('fill', fill);
      entry.label.setAttribute('fill', ink);
    }

    function place(
      byValue: Map<number, BstInorderSortedStageNode>,
      value: number | null,
      xMin: number,
      xMax: number,
      depth: number,
    ): PositionedNode | null {
      if (value === null) return null;
      const node = byValue.get(value);
      if (!node) return null;
      const x = (xMin + xMax) / 2;
      const y = TREE_TOP + depth * LEVEL_GAP;
      const leftPos = place(byValue, node.left, xMin, x, depth + 1);
      const rightPos = place(byValue, node.right, x, xMax, depth + 1);
      if (leftPos) drawEdge(x, y, leftPos.x, leftPos.y);
      if (rightPos) drawEdge(x, y, rightPos.x, rightPos.y);
      drawNode(value, x, y);
      return { value, x, y };
    }

    function drawEdge(px: number, py: number, cx: number, cy: number): void {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(px));
      line.setAttribute('y1', String(py));
      line.setAttribute('x2', String(cx));
      line.setAttribute('y2', String(cy));
      line.setAttribute('stroke', colors.border);
      line.setAttribute('stroke-width', '2');
      edgesG.appendChild(line);
    }

    function drawNode(value: number, x: number, y: number): void {
      const g = document.createElementNS(SVG_NS, 'g');
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y));
      circle.setAttribute('r', String(NODE_R));
      circle.setAttribute('stroke', colors.bg);
      circle.setAttribute('stroke-width', '2');
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', String(y + 4));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', fontSizes.sm);
      label.setAttribute('font-weight', '600');
      label.setAttribute('font-family', fonts.mono);
      label.textContent = String(value);
      g.append(circle, label);
      nodesG.appendChild(g);
      const entry: NodeEntry = { group: g, circle, label, x, y, standing: false, filled: 'default' };
      nodeEls.set(value, entry);
      repaint(entry);
    }

    function drawOutputSlots(): void {
      outputG.textContent = '';
      cellW = Math.min(CELL_MAX_W, Math.floor((W - CELL_SIDE_MIN * 2) / Math.max(1, n)));
      const rowW = cellW * n;
      originX = Math.round((W - rowW) / 2);
      const shelf = document.createElementNS(SVG_NS, 'rect');
      shelf.setAttribute('x', String(originX - 4));
      shelf.setAttribute('y', String(OUTPUT_TOP - 4));
      shelf.setAttribute('width', String(rowW + 8));
      shelf.setAttribute('height', String(OUTPUT_CELL_H + 8));
      shelf.setAttribute('rx', radii.md);
      shelf.setAttribute('fill', colors.bgSubtle);
      outputG.appendChild(shelf);
      for (let i = 0; i < n; i++) {
        const slot = document.createElementNS(SVG_NS, 'rect');
        slot.setAttribute('x', String(originX + i * cellW + 3));
        slot.setAttribute('y', String(OUTPUT_TOP + 3));
        slot.setAttribute('width', String(cellW - 6));
        slot.setAttribute('height', String(OUTPUT_CELL_H - 6));
        slot.setAttribute('rx', radii.sm);
        slot.setAttribute('fill', 'none');
        slot.setAttribute('stroke', colors.border);
        slot.setAttribute('stroke-width', '1');
        slot.setAttribute('stroke-dasharray', '3 3');
        outputG.appendChild(slot);
      }
    }

    function setTree(nodes: BstInorderSortedStageNode[], rootValue: number): void {
      edgesG.textContent = '';
      nodesG.textContent = '';
      nodeEls.clear();
      const byValue = new Map(nodes.map((nd) => [nd.value, nd] as const));
      n = nodes.length;
      place(byValue, rootValue, SIDE_MARGIN, W - SIDE_MARGIN, 0);
      outCount = 0;
      drawOutputSlots();
      captionText.textContent = '';
    }

    function standAt(value: number): void {
      const entry = nodeEls.get(value);
      if (!entry) return;
      entry.standing = true;
      repaint(entry);
    }

    function leave(value: number): void {
      const entry = nodeEls.get(value);
      if (!entry) return;
      entry.standing = false;
      repaint(entry);
    }

    function settle(value: number): void {
      const entry = nodeEls.get(value);
      if (!entry) return;
      entry.filled = 'settled';
      repaint(entry);
    }

    async function flowOut(value: number): Promise<void> {
      const src = nodeEls.get(value);
      if (!src || outCount >= n) return;
      const index = outCount;
      outCount += 1;
      const slotCx = originX + index * cellW + cellW / 2;
      const slotCy = OUTPUT_TOP + OUTPUT_CELL_H / 2;
      const dx = src.x - slotCx;
      const dy = src.y - slotCy;

      const g = document.createElementNS(SVG_NS, 'g');
      const rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(slotCx - cellW / 2 + 4));
      rect.setAttribute('y', String(slotCy - (OUTPUT_CELL_H - 6) / 2));
      rect.setAttribute('width', String(cellW - 8));
      rect.setAttribute('height', String(OUTPUT_CELL_H - 6));
      rect.setAttribute('rx', radii.sm);
      rect.setAttribute('fill', colors.itemSorted);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', String(slotCx));
      text.setAttribute('y', String(slotCy + 4));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', fontSizes.sm);
      text.setAttribute('font-weight', '600');
      text.setAttribute('font-family', fonts.mono);
      // itemSorted 는 테마를 따라 뒤집히므로 textInverse.
      text.setAttribute('fill', colors.textInverse);
      text.textContent = String(value);
      g.append(rect, text);
      g.style.transformOrigin = `${slotCx}px ${slotCy}px`;
      g.style.transform = `translate(${dx}px, ${dy}px)`;
      g.style.opacity = '0';
      outputG.appendChild(g);
      // 강제 리플로우 후 트랜지션을 걸어야 시작 위치에서 실제로 움직인다.
      void g.getBoundingClientRect();
      g.style.transition = `transform ${ANIM_MS}ms ease-out, opacity ${Math.min(ANIM_MS, 160)}ms ease-out`;
      g.style.opacity = '1';
      g.style.transform = 'translate(0px, 0px)';
      await new Promise<void>((resolve) => setTimeout(resolve, ANIM_MS));
    }

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function reset(): void {
      for (const entry of nodeEls.values()) {
        entry.standing = false;
        entry.filled = 'default';
        repaint(entry);
      }
      outCount = 0;
      drawOutputSlots();
      captionText.textContent = '';
    }

    return {
      destroy() {
        if (root.parentElement) root.remove();
      },
      setTree,
      standAt,
      leave,
      settle,
      flowOut,
      setCaption,
      reset,
    };
  },
};
