/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 꼭대기를 빼내 옆으로 물리고, 맨 끝
 * 값이 대각선으로 올라오고, 두 노드가 자리를 맞바꾸며 내려가는 세 운동이 모두
 * 좌표 이동이다. 그 view 는 상태 색만 바꿀 뿐 이동 어휘가 없다
 * (원칙 6 의 예외 조건).
 *
 * sift-down-stage — 최소 힙을 트리로 그리고, 꼭대기 추출 → 맨 끝 값 승격 →
 * 두 자식 중 더 작은 쪽과 맞바꾸며 내려가는 하향 재배치를 애니메이션으로
 * 보인다.
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 아래 값 모양은 이 파일
 * 안에서만 쓰이는 동형 선언이다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const W = PIECE_CANVAS_W;
const H = 340;
const TOP_Y = 54;
const LEVEL_H = 92;
const SIDE_MARGIN_MIN = 34;
const NODE_R_MAX = 28;
const EXTRACT_X = W - SIDE_MARGIN_MIN - 6;
const EXTRACT_Y = 24;
const EXTRACT_R = 18;
const CAPTION_Y = H - 24;
const MOVE_MS = 420;
const PAINT_MS = 200;

type Slot = {
  group: SVGGElement;
  circle: SVGCircleElement;
  text: SVGTextElement;
  value: number;
  x: number;
  y: number;
};

export const siftDownStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    const tr = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const edgesLayer = el('g', {});
    const nodesLayer = el('g', {});
    const captionText = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    svg.append(edgesLayer, nodesLayer, captionText);

    // ── 기하 — 완전이진트리 좌표. 자식 자리 인덱스 산식(2i+1, 2i+2) 그대로
    //    "잎 자리 개수" 를 기준으로 등간격 배치해 부모가 두 자식의 가운데
    //    오게 한다. leafSlots 는 실측 초기 배열 길이에서 계산한다.
    let maxDepth = 0;
    let unit = 0;
    let nodeR = NODE_R_MAX;

    function configureGeometry(n0: number): void {
      maxDepth = n0 <= 1 ? 0 : Math.floor(Math.log2(n0));
      const leafSlots = 2 ** maxDepth;
      const usableW = W - SIDE_MARGIN_MIN * 2;
      unit = usableW / leafSlots;
      nodeR = Math.min(NODE_R_MAX, Math.floor(unit / 2) - 8);
    }

    function depthOf(i: number): number {
      return Math.floor(Math.log2(i + 1));
    }
    function nodeCenterX(i: number): number {
      const depth = depthOf(i);
      const posInLevel = i - (2 ** depth - 1);
      const span = 2 ** (maxDepth - depth);
      const leafUnits = posInLevel * span + span / 2;
      return SIDE_MARGIN_MIN + leafUnits * unit;
    }
    function nodeCenterY(i: number): number {
      return TOP_Y + depthOf(i) * LEVEL_H;
    }

    // ── 상태
    let originalValues: number[] = [];
    const slots = new Map<number, Slot>();
    const edges = new Map<number, SVGLineElement>(); // key: 자식 자리 인덱스
    const ghosts = new Map<number, SVGCircleElement>(); // key: 빈 자리 인덱스

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    function paintDefault(slot: Slot): void {
      slot.circle.setAttribute('fill', c.itemDefault);
      slot.text.setAttribute('fill', c.text);
    }
    function paintActive(slot: Slot): void {
      slot.circle.setAttribute('fill', c.itemComparing);
      slot.text.setAttribute('fill', c.stateInk);
    }
    function paintWinner(slot: Slot): void {
      slot.circle.setAttribute('fill', c.itemPivot);
      slot.text.setAttribute('fill', c.stateInk);
    }
    function paintSettled(slot: Slot): void {
      slot.circle.setAttribute('fill', c.itemSorted);
      slot.text.setAttribute('fill', c.textInverse);
    }

    /** 실제 자리 이동 — transform 속성을 애니메이션한다 (opacity 전환이 아니다). */
    function moveTo(slot: Slot, x: number, y: number, ms: number): Promise<void> {
      slot.group.style.transition = `transform ${ms}ms ease`;
      slot.group.setAttribute('transform', `translate(${x} ${y})`);
      slot.x = x;
      slot.y = y;
      return wait(ms);
    }

    function makeSlot(i: number, value: number): Slot {
      const x = nodeCenterX(i);
      const y = nodeCenterY(i);
      const group = el('g', { transform: `translate(${x} ${y})` });
      const circle = el('circle', { r: nodeR, fill: c.itemDefault, stroke: c.border, 'stroke-width': 2 });
      const text = el('text', {
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: c.text,
      });
      text.textContent = String(value);
      group.append(circle, text);
      nodesLayer.appendChild(group);
      return { group, circle, text, value, x, y };
    }

    function clearAll(): void {
      edgesLayer.replaceChildren();
      nodesLayer.replaceChildren();
      slots.clear();
      edges.clear();
      ghosts.clear();
    }

    function drawEdges(n0: number): void {
      for (let i = 0; i < n0; i++) {
        for (const child of [2 * i + 1, 2 * i + 2]) {
          if (child >= n0) continue;
          const line = el('line', {
            x1: nodeCenterX(i),
            y1: nodeCenterY(i),
            x2: nodeCenterX(child),
            y2: nodeCenterY(child),
            stroke: c.border,
            'stroke-width': 2,
          });
          edgesLayer.appendChild(line);
          edges.set(child, line);
        }
      }
    }

    function renderInitial(values: number[]): void {
      clearAll();
      originalValues = values.slice();
      configureGeometry(originalValues.length);
      drawEdges(originalValues.length);
      for (let i = 0; i < originalValues.length; i++) {
        const slot = makeSlot(i, originalValues[i]);
        paintDefault(slot);
        slots.set(i, slot);
      }
      setCaption('');
    }

    function init(values: number[]): void {
      renderInitial(values);
    }

    async function extract(index: number): Promise<void> {
      const slot = slots.get(index);
      if (!slot) return;
      paintActive(slot);
      await wait(PAINT_MS);

      const ghost = el('circle', {
        cx: slot.x,
        cy: slot.y,
        r: nodeR,
        fill: 'none',
        stroke: c.ghostOutline,
        'stroke-width': 2,
        'stroke-dasharray': '4 4',
      });
      nodesLayer.appendChild(ghost);
      ghosts.set(index, ghost);

      slots.delete(index);
      const removedValue = slot.value;
      await moveTo(slot, EXTRACT_X, EXTRACT_Y, MOVE_MS);
      slot.circle.setAttribute('r', String(EXTRACT_R));
      slot.circle.setAttribute('opacity', '0.55');
      slot.text.setAttribute('font-size', fontSizes.sm);

      setCaption(tr('caption.extract', 'Remove the top value {v}', { v: removedValue }));
    }

    async function fill(from: number, to: number): Promise<void> {
      const ghost = ghosts.get(to);
      if (ghost) {
        ghost.remove();
        ghosts.delete(to);
      }
      const edge = edges.get(from);
      if (edge) {
        edge.remove();
        edges.delete(from);
      }
      const slot = slots.get(from);
      if (!slot) return;
      slots.delete(from);
      paintDefault(slot);
      await moveTo(slot, nodeCenterX(to), nodeCenterY(to), MOVE_MS);
      slots.set(to, slot);

      setCaption(tr('caption.fill', 'Move the last value {v} into the empty top', { v: slot.value }));
    }

    async function compare(parent: number, left: number, right: number | null, winner: number): Promise<void> {
      const p = slots.get(parent);
      const l = slots.get(left);
      const r = right !== null ? slots.get(right) : undefined;
      if (p) paintActive(p);
      if (l) (left === winner ? paintWinner(l) : paintActive(l));
      if (r) (right === winner ? paintWinner(r) : paintActive(r));
      await wait(PAINT_MS);

      const winnerSlot = slots.get(winner);
      const winnerValue = winnerSlot?.value ?? 0;
      if (r) {
        setCaption(
          tr('caption.compareTwo', 'Compare children {l} and {r} — {w} is smaller', {
            l: l?.value ?? 0,
            r: r.value,
            w: winnerValue,
          }),
        );
      } else {
        setCaption(tr('caption.compareOne', 'Only one child, {l} — compare with it', { l: l?.value ?? 0 }));
      }
    }

    async function swap(a: number, b: number): Promise<void> {
      const sa = slots.get(a);
      const sb = slots.get(b);
      if (!sa || !sb) return;
      const [xa, ya] = [sa.x, sa.y];
      const [xb, yb] = [sb.x, sb.y];
      await Promise.all([moveTo(sa, xb, yb, MOVE_MS), moveTo(sb, xa, ya, MOVE_MS)]);
      slots.set(a, sb);
      slots.set(b, sa);
      paintDefault(sa);
      paintDefault(sb);

      setCaption(tr('caption.swap', 'Swap places and sink down', {}));
    }

    async function settle(index: number): Promise<void> {
      const slot = slots.get(index);
      if (!slot) return;
      paintSettled(slot);
      setCaption(
        tr('caption.settle', 'Smaller than both children (or none left) — stop here', {}),
      );
    }

    async function rewind(): Promise<void> {
      renderInitial(originalValues);
    }

    return {
      init,
      extract,
      fill,
      compare,
      swap,
      settle,
      rewind,
      destroy() {
        clearAll();
      },
    };
  },
};
