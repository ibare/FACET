/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각의 동사는 두 노드가 자리를
 * 맞바꾸며 한 칸 오르는 것이다. 그 view 에는 노드 둘의 위치를 맞교환하는
 * 어휘가 없고, 상태를 바꾸면 즉시 다시 그려 이동이 보이지 않는다
 * (원칙 6 의 예외 조건).
 *
 * sift-up-stage — 상향 재배치 조각의 전용 SVG 캔버스.
 *
 * 최소 힙을 트리로 그린다. 새 값이 맨 끝자리에 나타나고, 부모와 견주어 앞서면
 * 그 두 원이 실제로 자리를 맞바꾸며 (위/아래로 옮겨가며) 오른다. 더 앞서지
 * 못하는 부모를 만나면 거기서 멈추고, 멈춘 자리가 색으로 표시된다 — 꼭대기까지
 * 가는 것이 아니라 멈추는 지점이 요점이다 (S-piece).
 *
 * 좌표는 완전 이진 트리의 인덱스 규칙 (i 의 부모는 ⌊(i-1)/2⌋) 을 그대로 화면
 * 격자에 옮긴 것이다 — 깊이 d 는 2^d 개의 균등한 칸으로 나뉘고, 이 나눔을
 * 재귀적으로 반씩 쪼갠 것과 수학적으로 같아 부모 자리 바로 아래 자식이 온다.
 */

import type { CanvasView } from '@ffacet/core/runtime';
import { getColors, PIECE_CANVAS_W, fonts, fontSizes } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const SIDE_MARGIN = 26;
const TOP_Y = 44;
const ROW_H = 78;
const RADIUS = 22;
const CAPTION_GAP = 40;
const CAPTION_H = 28;
/** 이 조각의 데이터가 채우는 깊이 (0~3) — 일곱 칸 + 삽입 한 칸 고정. */
const DEPTH_COUNT = 4;
const SWAP_MS = 520;
const ENTER_MS = 200;

export const SIFT_UP_STAGE_HEIGHT =
  TOP_Y + (DEPTH_COUNT - 1) * ROW_H + RADIUS + CAPTION_GAP + CAPTION_H;

/** 구조적 부모-자식 짝 (0~6 인덱스). 인덱스 7 은 삽입 시 동적으로 붙는다. */
const BASE_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 4],
  [2, 5],
  [2, 6],
];
const INSERT_EDGE: readonly [number, number] = [3, 7];

function depthOf(index: number): number {
  return Math.floor(Math.log2(index + 1));
}

function slotInfo(index: number): { depth: number; slot: number; slotsAtDepth: number } {
  const depth = depthOf(index);
  const slotsAtDepth = 2 ** depth;
  return { depth, slot: index - (slotsAtDepth - 1), slotsAtDepth };
}

function xFor(index: number, usableW: number): number {
  const { slot, slotsAtDepth } = slotInfo(index);
  const colW = usableW / slotsAtDepth;
  return SIDE_MARGIN + (slot + 0.5) * colW;
}

function yFor(index: number): number {
  return TOP_Y + slotInfo(index).depth * ROW_H;
}

type NodeVisual = {
  slot: number;
  group: SVGGElement;
  circle: SVGCircleElement;
  text: SVGTextElement;
};

type NodeRole = 'default' | 'active' | 'comparing' | 'swapping' | 'settled';

export const siftUpStageView: CanvasView = {
  canvas: { height: SIFT_UP_STAGE_HEIGHT },
  mount(_container, params) {
    const svg = params.canvas;
    svg.textContent = '';

    const palette = getColors(params.theme);
    const usableW = PIECE_CANVAS_W - SIDE_MARGIN * 2;

    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(edgeLayer);
    svg.appendChild(nodeLayer);

    const captionText = document.createElementNS(SVG_NS, 'text');
    captionText.setAttribute('x', String(PIECE_CANVAS_W / 2));
    captionText.setAttribute(
      'y',
      String(TOP_Y + (DEPTH_COUNT - 1) * ROW_H + RADIUS + CAPTION_GAP),
    );
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-family', fonts.body);
    captionText.setAttribute('font-size', fontSizes.md);
    captionText.setAttribute('fill', palette.text);
    svg.appendChild(captionText);

    const nodesBySlot = new Map<number, NodeVisual>();
    let initialValues: number[] = [];

    function roleFill(role: NodeRole): string {
      switch (role) {
        case 'active':
          return palette.itemActive;
        case 'comparing':
          return palette.itemComparing;
        case 'swapping':
          return palette.itemSwapping;
        case 'settled':
          return palette.itemSorted;
        default:
          return palette.itemDefault;
      }
    }

    function roleInk(role: NodeRole): string {
      switch (role) {
        case 'active':
        case 'comparing':
        case 'swapping':
          return palette.stateInk;
        case 'settled':
          return palette.textInverse;
        default:
          return palette.text;
      }
    }

    function setRole(node: NodeVisual, role: NodeRole): void {
      node.circle.setAttribute('fill', roleFill(role));
      node.text.setAttribute('fill', roleInk(role));
    }

    function makeNode(index: number, value: number): NodeVisual {
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('transform', `translate(${xFor(index, usableW)}, ${yFor(index)})`);

      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('r', String(RADIUS));
      circle.setAttribute('fill', palette.itemDefault);
      circle.setAttribute('stroke', palette.border);
      circle.setAttribute('stroke-width', '2');

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('font-family', fonts.mono);
      text.setAttribute('font-size', fontSizes.md);
      text.setAttribute('fill', palette.text);
      text.textContent = String(value);

      group.appendChild(circle);
      group.appendChild(text);
      nodeLayer.appendChild(group);
      return { slot: index, group, circle, text };
    }

    function makeEdge(a: number, b: number): void {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(xFor(a, usableW)));
      line.setAttribute('y1', String(yFor(a)));
      line.setAttribute('x2', String(xFor(b, usableW)));
      line.setAttribute('y2', String(yFor(b)));
      line.setAttribute('stroke', palette.border);
      line.setAttribute('stroke-width', '2');
      edgeLayer.appendChild(line);
    }

    function drawInitial(values: number[]): void {
      nodeLayer.textContent = '';
      edgeLayer.textContent = '';
      nodesBySlot.clear();
      captionText.textContent = '';
      values.forEach((value, index) => {
        const node = makeNode(index, value);
        setRole(node, 'default');
        nodesBySlot.set(index, node);
      });
      for (const [a, b] of BASE_EDGES) makeEdge(a, b);
    }

    function moveNode(node: NodeVisual, toSlot: number): Promise<void> {
      node.group.style.transition = `transform ${SWAP_MS}ms ease-in-out`;
      node.group.setAttribute(
        'transform',
        `translate(${xFor(toSlot, usableW)}, ${yFor(toSlot)})`,
      );
      node.slot = toSlot;
      return new Promise((resolve) => setTimeout(resolve, SWAP_MS));
    }

    return {
      destroy() {
        svg.textContent = '';
      },

      init(values: unknown) {
        if (!Array.isArray(values)) return;
        initialValues = values.filter((v): v is number => typeof v === 'number');
        drawInitial(initialValues);
      },

      async insertNode(index: number, value: number, caption: string) {
        const node = makeNode(index, value);
        setRole(node, 'active');
        nodesBySlot.set(index, node);
        makeEdge(...INSERT_EDGE);
        captionText.textContent = caption;

        node.group.style.opacity = '0';
        node.group.style.transition = `opacity ${ENTER_MS}ms ease-out`;
        // 리플로우를 강제해 opacity:0 → transition → 1 이 실제로 걸리게 한다.
        void node.group.getBoundingClientRect();
        node.group.style.opacity = '1';
        await new Promise<void>((resolve) => setTimeout(resolve, ENTER_MS));
      },

      compare(childIndex: number, parentIndex: number, caption: string) {
        const child = nodesBySlot.get(childIndex);
        const parent = nodesBySlot.get(parentIndex);
        if (child) setRole(child, 'comparing');
        if (parent) setRole(parent, 'comparing');
        captionText.textContent = caption;
      },

      async swapUp(childIndex: number, parentIndex: number) {
        const child = nodesBySlot.get(childIndex);
        const parent = nodesBySlot.get(parentIndex);
        if (!child || !parent) return;
        setRole(child, 'swapping');
        setRole(parent, 'swapping');
        await Promise.all([moveNode(child, parentIndex), moveNode(parent, childIndex)]);
        nodesBySlot.set(parentIndex, child);
        nodesBySlot.set(childIndex, parent);
        setRole(child, 'active');
        setRole(parent, 'default');
      },

      settle(index: number, caption: string) {
        const node = nodesBySlot.get(index);
        if (node) setRole(node, 'settled');
        captionText.textContent = caption;
      },

      rewind() {
        drawInitial(initialValues);
      },
    };
  },
};
