/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각의 동사는 "셈이 잎에서 위로
 * 올라온다" 인데, 그 view 는 노드 하나에 라벨 하나를 얹을 뿐 자식 자리에서
 * 부모 자리로 값이 이동하는 운동을 표현할 수단이 없다. 유령 자리(없는 자식)를
 * 그려 거기서도 0 이 올라오게 하는 것도 마찬가지다 (원칙 6 의 예외 조건).
 *
 * height-balance-check-stage — 균형 인수가 잎에서 뿌리로 올라오는 것을 그린다.
 *
 * 노드 원 + 간선을 골격으로 두고, 없는 자식 자리는 점선 유령 자리(0)로 표시한다.
 * 한 노드가 settle 되면 좌/우 높이 값이 (실제 자식이 남긴 자리 또는 유령 자리
 * 에서) 실제로 그 노드를 향해 위로 이동해 와서 맞대어 빼지고, 그 차와 자기
 * 높이가 자리에 남는다 — 이동은 위치(transform)가 바뀌는 것이지 opacity 전환이
 * 아니다 (S-piece MUST NOT).
 *
 * 메서드:
 *   init(root)          — 트리 골격을 그린다.
 *   settleNode(step)     — Promise<void>. 높이 토큰이 올라와 값을 적는다.
 *   rewind()             — 적힌 값과 이동 중인 토큰을 모두 지우고 골격만 남긴다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const MARGIN_X = 30;
const MARGIN_TOP = 30;
const LEVEL_GAP = 88;
const NODE_R = 17;
const GHOST_R = 8;
const GHOST_DX = 34;
const GHOST_DY = 54;
/**
 * 마지막 층 아래로 남기는 자리.
 *
 * 노드 반지름만으로는 모자란다 — 잎 아래에도 유령 자리(없는 자식)가
 * `GHOST_DY` 만큼 내려가 붙고 거기서 높이 0 이 올라오기 때문이다. 그 자리와
 * 배지까지 담아야 한다.
 */
const BOTTOM_PAD = 90;
const RISE_MS = 420;
const MERGE_MS = 180;

/** 이 view 만 아는 트리 노드 형태. Algorithm 의 타입을 참조하지 않는다 (S-view). */
type StageTreeNode = {
  value: number;
  left?: StageTreeNode;
  right?: StageTreeNode;
};

/** 한 노드가 settle 될 때 넘어오는 값. */
type StageSettleStep = {
  value: number;
  leftHeight: number;
  rightHeight: number;
  height: number;
  balance: number;
  outOfRange: boolean;
};

type Point = { x: number; y: number };

type NodeLayout = Point & {
  depth: number;
  leftValue?: number;
  rightValue?: number;
};

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  }
  return el;
}

export const heightBalanceCheckStageView: CanvasView = {
  // mount 에서 나무의 실제 깊이로 viewBox 를 다시 잰다. 이 값은 그 전까지의
  // 자리표일 뿐이지만, 다시 잰 값보다 짧으면 첫 프레임이 눌려 보인다.
  canvas: { height: 450 },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    svg.textContent = '';

    const colors = getColors(params.theme);

    const edgeLayer = svgEl('g');
    const ghostLayer = svgEl('g');
    const nodeLayer = svgEl('g');
    const tileLayer = svgEl('g');
    const travelLayer = svgEl('g');
    svg.appendChild(edgeLayer);
    svg.appendChild(ghostLayer);
    svg.appendChild(nodeLayer);
    svg.appendChild(tileLayer);
    svg.appendChild(travelLayer);

    const layout = new Map<number, NodeLayout>();
    let maxDepth = 0;

    function requirePos(value: number): NodeLayout {
      const p = layout.get(value);
      if (!p) throw new Error(`height-balance-check-stage: 트리에 없는 노드 ${value}`);
      return p;
    }

    function countNodes(node: StageTreeNode | undefined): number {
      if (!node) return 0;
      return 1 + countNodes(node.left) + countNodes(node.right);
    }

    function ghostPoint(x: number, y: number, side: 'left' | 'right'): Point {
      const dx = side === 'left' ? -GHOST_DX : GHOST_DX;
      return { x: x + dx, y: y + GHOST_DY };
    }

    function drawGhost(x: number, y: number, side: 'left' | 'right'): void {
      const { x: gx, y: gy } = ghostPoint(x, y, side);
      ghostLayer.appendChild(
        svgEl('line', {
          x1: x,
          y1: y + NODE_R,
          x2: gx,
          y2: gy,
          stroke: colors.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '3,3',
        }),
      );
      ghostLayer.appendChild(
        svgEl('circle', {
          cx: gx,
          cy: gy,
          r: GHOST_R,
          fill: colors.bg,
          stroke: colors.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '2,2',
        }),
      );
      const label = svgEl('text', {
        x: gx,
        y: gy + 3,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.ghostOutline,
      });
      label.textContent = '0';
      ghostLayer.appendChild(label);
    }

    function place(
      node: StageTreeNode | undefined,
      depth: number,
      rankBox: { next: number },
      slotW: number,
    ): void {
      if (!node) return;
      place(node.left, depth + 1, rankBox, slotW);
      const x = MARGIN_X + slotW * (rankBox.next + 0.5);
      const y = MARGIN_TOP + depth * LEVEL_GAP;
      rankBox.next += 1;
      layout.set(node.value, {
        x,
        y,
        depth,
        leftValue: node.left?.value,
        rightValue: node.right?.value,
      });
      maxDepth = Math.max(maxDepth, depth);
      place(node.right, depth + 1, rankBox, slotW);
    }

    function drawSkeleton(node: StageTreeNode | undefined): void {
      if (!node) return;
      const self = requirePos(node.value);

      if (node.left) {
        const child = requirePos(node.left.value);
        edgeLayer.appendChild(
          svgEl('line', {
            x1: self.x,
            y1: self.y + NODE_R,
            x2: child.x,
            y2: child.y - NODE_R,
            stroke: colors.border,
            'stroke-width': 1.5,
          }),
        );
      } else {
        drawGhost(self.x, self.y, 'left');
      }

      if (node.right) {
        const child = requirePos(node.right.value);
        edgeLayer.appendChild(
          svgEl('line', {
            x1: self.x,
            y1: self.y + NODE_R,
            x2: child.x,
            y2: child.y - NODE_R,
            stroke: colors.border,
            'stroke-width': 1.5,
          }),
        );
      } else {
        drawGhost(self.x, self.y, 'right');
      }

      nodeLayer.appendChild(
        svgEl('circle', {
          cx: self.x,
          cy: self.y,
          r: NODE_R,
          fill: colors.bg,
          stroke: colors.text,
          'stroke-width': 1.5,
        }),
      );
      const label = svgEl('text', {
        x: self.x,
        y: self.y + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      label.textContent = String(node.value);
      nodeLayer.appendChild(label);

      drawSkeleton(node.left);
      drawSkeleton(node.right);
    }

    function clearTiles(): void {
      tileLayer.textContent = '';
    }

    function clearTravel(): void {
      travelLayer.textContent = '';
    }

    /** 토큰이 실제로 위치를 옮겨 올라간다 — opacity 전환이 아니다. */
    function riseToken(from: Point, to: Point, text: string): Promise<void> {
      const g = svgEl('g');
      g.style.transform = `translate(${from.x}px, ${from.y}px)`;
      const dot = svgEl('circle', {
        r: 10,
        fill: colors.bgSubtle,
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      const t = svgEl('text', {
        'text-anchor': 'middle',
        y: 3.5,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.text,
      });
      t.textContent = text;
      g.appendChild(dot);
      g.appendChild(t);
      travelLayer.appendChild(g);

      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          g.style.transition = `transform ${RISE_MS}ms ease-in-out`;
          g.style.transform = `translate(${to.x}px, ${to.y}px)`;
          setTimeout(() => {
            g.remove();
            resolve();
          }, RISE_MS);
        });
      });
    }

    function writeTiles(self: NodeLayout, step: StageSettleStep): void {
      const heightLabel = svgEl('text', {
        x: self.x,
        y: self.y + NODE_R + 15,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      heightLabel.textContent = `h ${step.height}`;
      tileLayer.appendChild(heightLabel);

      const balY = self.y + NODE_R + 33;
      const balBg = step.outOfRange ? colors.danger : colors.bgSubtle;
      const balBorder = step.outOfRange ? colors.danger : colors.border;
      const balInk = step.outOfRange ? colors.stateInk : colors.text;

      const rect = svgEl('rect', {
        x: self.x - 20,
        y: balY - 9,
        width: 40,
        height: 18,
        fill: balBg,
        stroke: balBorder,
        'stroke-width': 1,
      });
      const text = svgEl('text', {
        x: self.x,
        y: balY + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: balInk,
      });
      text.textContent = `Δ ${step.balance > 0 ? '+' : ''}${step.balance}`;
      tileLayer.appendChild(rect);
      tileLayer.appendChild(text);
    }

    function init(root: StageTreeNode): void {
      layout.clear();
      maxDepth = 0;
      edgeLayer.textContent = '';
      ghostLayer.textContent = '';
      nodeLayer.textContent = '';
      clearTiles();
      clearTravel();

      const w = PIECE_CANVAS_W;
      const total = Math.max(1, countNodes(root));
      const slotW = (w - MARGIN_X * 2) / total;
      place(root, 0, { next: 0 }, slotW);
      drawSkeleton(root);

      const h = MARGIN_TOP + maxDepth * LEVEL_GAP + NODE_R + BOTTOM_PAD;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }

    async function settleNode(step: StageSettleStep): Promise<void> {
      const self = requirePos(step.value);

      const leftFrom =
        self.leftValue !== undefined ? requirePos(self.leftValue) : ghostPoint(self.x, self.y, 'left');
      const rightFrom =
        self.rightValue !== undefined
          ? requirePos(self.rightValue)
          : ghostPoint(self.x, self.y, 'right');

      const leftTo: Point = { x: self.x - 14, y: self.y - NODE_R - 12 };
      const rightTo: Point = { x: self.x + 14, y: self.y - NODE_R - 12 };

      await Promise.all([
        riseToken(leftFrom, leftTo, String(step.leftHeight)),
        riseToken(rightFrom, rightTo, String(step.rightHeight)),
      ]);

      await new Promise<void>((resolve) => setTimeout(resolve, MERGE_MS));

      writeTiles(self, step);
    }

    function rewind(): void {
      clearTravel();
      clearTiles();
    }

    return {
      init,
      settleNode,
      rewind,
      destroy() {
        svg.textContent = '';
      },
    };
  },
};
