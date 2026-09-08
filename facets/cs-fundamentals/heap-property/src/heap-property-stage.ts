/**
 * heap-property-stage — "짝지어 견준다" 를 그리는 SVG 캔버스.
 *
 * 빌트인 `tree-layout` 을 쓰지 않는다. 이 조각은 두 가지가 필요한데 둘 다
 * `tree-layout` 어휘 밖이다:
 *   1. 부모→자식으로 실제로 이동하는 비교 표식 (트리의 간선을 짚어 가는 움직임).
 *   2. 트리 간선이 아닌 형제 사이의 임시 연결(견주지 않는다는 것 자체를 그려야
 *      하는데, 형제끼리는 애초에 간선이 없다) — `setEdgeState` 는 부모-자식
 *      간선만 알고 형제 쌍은 모른다.
 *
 * 값·좌표는 모두 `nodes[]` 에서 계산한다 (완전 이진트리, 배열 인덱스 = 힙 인덱스).
 * View 는 algorithm 의 타입을 모른다 — 여기 선언된 타입은 이벤트 payload 와
 * 동형일 뿐 import 가 아니다.
 */

import type { CanvasView, Theme, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 380;
const TOP_MARGIN = 56;
const LEVEL_GAP = 108;
const SIDE_MARGIN = 40;
const NODE_R_MAX = 34;

const POINTER_MS = 260;
const ARC_MS = 300;
const SETTLE_MS = 260;
const CONFIRM_MS = 420;

type StageNode = { id: string; value: number };
type LaidOutNode = StageNode & { x: number; y: number; level: number };

function layoutNodes(nodes: StageNode[]): LaidOutNode[] {
  const n = nodes.length;
  const usableW = W - SIDE_MARGIN * 2;
  return nodes.map((node, i) => {
    const level = Math.floor(Math.log2(i + 1));
    const levelStart = 2 ** level - 1;
    const countAtLevel = Math.min(2 ** level, n - levelStart);
    const posInLevel = i - levelStart;
    const slot = usableW / countAtLevel;
    return {
      ...node,
      x: SIDE_MARGIN + slot * (posInLevel + 0.5),
      y: TOP_MARGIN + level * LEVEL_GAP,
      level,
    };
  });
}

function parentIndexOf(i: number): number {
  return Math.floor((i - 1) / 2);
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 시간 기반 tick 애니메이션 (bar-chart.ts 의 swap-arc 와 같은 방식).
 *
 * 스스로 다음 회차를 예약하는 루프이므로 `alive` 로 멈출 수 있어야 한다 —
 * destroy 뒤에도 16ms 마다 깨어나 떨어져 나간 노드를 건드리면, 유한하더라도
 * "관찰 가능한 뒷일" 이 남는다 (S-view).
 */
function animate(ms: number, onTick: (t: number) => void, alive: () => boolean): Promise<void> {
  if (ms <= 0) {
    if (alive()) onTick(1);
    return Promise.resolve();
  }
  const start = Date.now();
  return new Promise<void>((resolve) => {
    function tick() {
      if (!alive()) {
        resolve();
        return;
      }
      const t = Math.min(1, (Date.now() - start) / ms);
      onTick(t);
      if (t >= 1) {
        resolve();
        return;
      }
      setTimeout(tick, 16);
    }
    tick();
  });
}

function edgeKey(parentId: string, childId: string): string {
  return `${parentId}>${childId}`;
}

export const heapPropertyStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    let destroyed = false;
    svg.textContent = '';
    const theme: Theme | undefined = params.theme;
    const colors = getColors(theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const markLayer = el('g'); // 확인 표식 — reset 전까지 남는다.
    const pointerLayer = el('g'); // 이동 중인 표식 — 걸음마다 지워진다.
    const captionLayer = el('g');
    svg.append(edgeLayer, nodeLayer, markLayer, pointerLayer, captionLayer);

    const captionText = el('text', {
      x: W / 2,
      y: H - 20,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    captionLayer.appendChild(captionText);

    let laidOut: LaidOutNode[] = [];
    const nodeById = new Map<string, LaidOutNode>();
    const circleById = new Map<string, SVGCircleElement>();
    const textById = new Map<string, SVGTextElement>();
    const edgeByKey = new Map<string, SVGLineElement>();
    let nodeR = NODE_R_MAX;

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function paintNode(id: string, fill: string, textFill: string): void {
      const c = circleById.get(id);
      if (c) c.setAttribute('fill', fill);
      const t = textById.get(id);
      if (t) t.setAttribute('fill', textFill);
    }

    function drawTree(nodes: StageNode[]): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      markLayer.textContent = '';
      pointerLayer.textContent = '';
      circleById.clear();
      textById.clear();
      edgeByKey.clear();
      nodeById.clear();

      laidOut = layoutNodes(nodes);
      for (const n of laidOut) nodeById.set(n.id, n);

      let deepestCount = 1;
      for (const n of laidOut) deepestCount = Math.max(deepestCount, 2 ** n.level);
      const usableW = W - SIDE_MARGIN * 2;
      nodeR = Math.max(14, Math.min(NODE_R_MAX, Math.floor(usableW / deepestCount / 2) - 6));

      for (let i = 1; i < laidOut.length; i += 1) {
        const child = laidOut[i];
        const parent = laidOut[parentIndexOf(i)];
        if (!parent || !child) continue;
        const line = el('line', {
          x1: parent.x,
          y1: parent.y,
          x2: child.x,
          y2: child.y,
          stroke: colors.border,
          'stroke-width': 2,
        });
        edgeLayer.appendChild(line);
        edgeByKey.set(edgeKey(parent.id, child.id), line);
      }

      for (const n of laidOut) {
        const circle = el('circle', {
          cx: n.x,
          cy: n.y,
          r: nodeR,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 2,
        });
        const text = el('text', {
          x: n.x,
          y: n.y + 5,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: colors.text,
        });
        text.textContent = String(n.value);
        nodeLayer.append(circle, text);
        circleById.set(n.id, circle);
        textById.set(n.id, text);
      }
      setCaption('');
    }

    function init(nodes: StageNode[]): void {
      drawTree(nodes);
    }

    function reset(): void {
      for (const n of laidOut) paintNode(n.id, colors.itemDefault, colors.text);
      for (const line of edgeByKey.values()) {
        line.setAttribute('stroke', colors.border);
        line.setAttribute('stroke-width', '2');
      }
      markLayer.textContent = '';
      pointerLayer.textContent = '';
      setCaption('');
    }

    /** 부모→자식으로 실제로 이동하는 비교 표식. */
    async function movePointerAlongEdge(x1: number, y1: number, x2: number, y2: number): Promise<void> {
      const pointer = el('circle', { cx: x1, cy: y1, r: 6, fill: colors.itemComparing });
      pointerLayer.appendChild(pointer);
      await animate(POINTER_MS, (t) => {
        pointer.setAttribute('cx', String(x1 + (x2 - x1) * t));
        pointer.setAttribute('cy', String(y1 + (y2 - y1) * t));
      }, () => !destroyed);
      pointer.remove();
    }

    /** 형제 사이엔 간선이 없다 — 위로 살짝 뜬 호를 그려 "짚어 봤지만 견주지 않는다" 를 보인다. */
    async function movePointerAlongArc(x1: number, y1: number, x2: number, y2: number): Promise<void> {
      const midX = (x1 + x2) / 2;
      const arcY = Math.min(y1, y2) - 34;
      const pointer = el('circle', { cx: x1, cy: y1, r: 6, fill: colors.ghostOutline });
      pointerLayer.appendChild(pointer);
      await animate(ARC_MS, (t) => {
        const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * midX + t ** 2 * x2;
        const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * arcY + t ** 2 * y2;
        pointer.setAttribute('cx', String(x));
        pointer.setAttribute('cy', String(y));
      }, () => !destroyed);
      pointer.remove();
    }

    function drawCheckBadge(x: number, y: number, holds: boolean): void {
      const tone = holds ? colors.accent : colors.danger;
      const badge = el('g', { transform: `translate(${x}, ${y})` });
      const bg = el('circle', { cx: 0, cy: 0, r: 12, fill: tone });
      badge.appendChild(bg);
      if (holds) {
        const check = el('path', {
          d: 'M -6 0 L -2 5 L 7 -6',
          stroke: colors.stateInk,
          'stroke-width': 2.5,
          fill: 'none',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        });
        badge.appendChild(check);
      } else {
        const l1 = el('line', { x1: -5, y1: -5, x2: 5, y2: 5, stroke: colors.stateInk, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
        const l2 = el('line', { x1: 5, y1: -5, x2: -5, y2: 5, stroke: colors.stateInk, 'stroke-width': 2.5, 'stroke-linecap': 'round' });
        badge.append(l1, l2);
      }
      markLayer.appendChild(badge);
    }

    function drawSkipBadge(x: number, y: number): void {
      const badge = el('g', { transform: `translate(${x}, ${y})` });
      const bg = el('circle', { cx: 0, cy: 0, r: 11, fill: 'none', stroke: colors.ghostOutline, 'stroke-width': 2, 'stroke-dasharray': '3 3' });
      const l1 = el('line', { x1: -4, y1: -4, x2: 4, y2: 4, stroke: colors.textMuted, 'stroke-width': 2, 'stroke-linecap': 'round' });
      const l2 = el('line', { x1: 4, y1: -4, x2: -4, y2: 4, stroke: colors.textMuted, 'stroke-width': 2, 'stroke-linecap': 'round' });
      badge.append(bg, l1, l2);
      markLayer.appendChild(badge);
    }

    async function showPairCheck(payload: {
      parentId: string;
      childId: string;
      parentValue: number;
      childValue: number;
      holds: boolean;
    }): Promise<void> {
      const parent = nodeById.get(payload.parentId);
      const child = nodeById.get(payload.childId);
      if (!parent || !child) return;

      paintNode(parent.id, colors.itemComparing, colors.stateInk);
      paintNode(child.id, colors.itemComparing, colors.stateInk);
      setCaption(
        tr('caption.pairCheck', 'Parent {p} must come before child {c}.', {
          p: payload.parentValue,
          c: payload.childValue,
        }),
      );

      await movePointerAlongEdge(parent.x, parent.y, child.x, child.y);

      const midX = (parent.x + child.x) / 2;
      const midY = (parent.y + child.y) / 2;
      drawCheckBadge(midX, midY, payload.holds);

      const edge = edgeByKey.get(edgeKey(parent.id, child.id));
      if (edge) {
        edge.setAttribute('stroke', payload.holds ? colors.accent : colors.danger);
        edge.setAttribute('stroke-width', '3');
      }

      await wait(SETTLE_MS);
      paintNode(parent.id, colors.itemDefault, colors.text);
      paintNode(child.id, colors.itemDefault, colors.text);
    }

    async function showSiblingSkip(payload: { aId: string; bId: string; aValue: number; bValue: number }): Promise<void> {
      const a = nodeById.get(payload.aId);
      const b = nodeById.get(payload.bId);
      if (!a || !b) return;

      paintNode(a.id, colors.bgSubtle, colors.textMuted);
      paintNode(b.id, colors.bgSubtle, colors.textMuted);
      setCaption(
        tr('caption.siblingSkip', '{a} and {b} are siblings — never compared.', {
          a: payload.aValue,
          b: payload.bValue,
        }),
      );

      await movePointerAlongArc(a.x, a.y, b.x, b.y);

      const midX = (a.x + b.x) / 2;
      const midY = Math.min(a.y, b.y) - 34;
      drawSkipBadge(midX, midY);

      await wait(SETTLE_MS);
      paintNode(a.id, colors.itemDefault, colors.text);
      paintNode(b.id, colors.itemDefault, colors.text);
    }

    async function showConfirmed(payload: { rootId: string; rootValue: number }): Promise<void> {
      const root = nodeById.get(payload.rootId);
      if (!root) return;
      const circle = circleById.get(root.id);
      setCaption(
        tr('caption.confirmed', 'The smallest value, {v}, sits at the top.', { v: payload.rootValue }),
      );
      if (!circle) return;

      const ring = el('circle', {
        cx: root.x,
        cy: root.y,
        r: nodeR + 4,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 3,
      });
      markLayer.appendChild(ring);

      await animate(CONFIRM_MS, (t) => {
        const scale = 1 + 0.16 * Math.sin(t * Math.PI);
        circle.setAttribute('r', String(nodeR * scale));
      }, () => !destroyed);
      circle.setAttribute('r', String(nodeR));
      circle.setAttribute('fill', colors.itemPivot);
      const text = textById.get(root.id);
      if (text) text.setAttribute('fill', colors.stateInk);
    }

    return {
      destroy() {
        destroyed = true;
        svg.textContent = '';
      },
      init,
      reset,
      showPairCheck,
      showSiblingSkip,
      showConfirmed,
    };
  },
};
