/**
 * heap-binary-stage — 배열 한 줄과 나무를 한 캔버스에 같이 그린다.
 *
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 힙은 **나무처럼 생각하고 배열에
 * 담는다**. 견줌과 맞바꿈은 나무의 부모-자식 사이에서 일어나지만 자리 번호는
 * 배열이 준다. 둘 중 하나만 그리면 학습자가 그 짝을 스스로 이어야 하는데,
 * 그것이 이 자료구조에서 가장 자주 막히는 대목이다. 그 view 는 나무만 알고
 * 배열 쪽 짝을 그릴 자리가 없다 (원칙 6 의 예외 조건).
 *
 * 조각 `arrayAsTree` 가 세운 어휘를 그대로 쓴다 — 배열이 위, 나무가 아래,
 * 같은 자리는 같은 번호. 코드를 공유하지 않고 어휘만 맞춘다 (S-piece PREFER).
 *
 * 정렬로 제자리에 밀려난 값은 배열의 뒤쪽에 남고 나무에서는 빠진다 — 힙이
 * 앞에서 줄어드는 만큼 정렬된 꼬리가 뒤에서 자란다는 것을 자리로 보인다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Theme,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CELL_MAX_W = 54;
const CELL_H = 34;
const SIDE_MIN = 20;
const ARRAY_Y = 26;
const TREE_TOP = ARRAY_Y + CELL_H + 46;
const LEVEL_GAP = 62;
const NODE_R = 17;
const CAPTION_H = 26;
const MOVE_MS = 240;

/**
 * 담을 수 있는 가장 깊은 층. `capacity` 15 면 마지막 자리가 층 3 이다.
 *
 * 높이를 미리 이만큼 잡아 두고 **재생 중에는 바꾸지 않는다.** 내용에 따라
 * viewBox 를 다시 재면 글 안에 박혔을 때 위아래 문단이 밀린다 (S-view).
 */
const RESERVE_DEPTH = 3;
const STAGE_H = TREE_TOP + RESERVE_DEPTH * LEVEL_GAP + NODE_R + CAPTION_H + 18;

/** 자리 하나의 상태. 타일 색과 잉크가 여기서 갈린다. */
type SlotState = 'default' | 'comparing' | 'swapping' | 'settled' | 'sorted';

type Slot = {
  cell: SVGRectElement;
  cellText: SVGTextElement;
  node: SVGCircleElement | null;
  nodeText: SVGTextElement | null;
  edge: SVGLineElement | null;
  x: number;
  y: number;
};

/** 러너가 mount 에 넘기는 폭. 캔버스 계약이다. */
type Geometry = { w: number; cellW: number; originX: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 타일 위에 얹는 글자색.
 *
 * `design-tokens` 의 결정표를 따른다 — 고정 타일 위는 `stateInk`, 테마를 따라
 * 뒤집는 타일 위는 `textInverse`, 배경과 값이 같은 `itemDefault` 위는 `text`.
 */
function inkFor(state: SlotState, c: Palette): string {
  switch (state) {
    case 'comparing':
    case 'swapping':
      return c.stateInk;
    case 'settled':
    case 'sorted':
      return c.textInverse;
    default:
      return c.text;
  }
}

function tileFor(state: SlotState, c: Palette): string {
  switch (state) {
    case 'comparing':
      return c.itemComparing;
    case 'swapping':
      return c.itemSwapping;
    case 'settled':
      return c.itemPivot;
    case 'sorted':
      return c.itemSorted;
    default:
      return c.itemDefault;
  }
}

export const heapBinaryStageView: CanvasView = {
  // 세로는 고정이다. 재생 중에 바꾸지 않는다 (S-view).
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 러너가 이미 컨테이너에 캔버스를
    // 붙여 놓았으므로 컨테이너를 비우면 그것이 떨어져 나간다 (S-view).
    svg.textContent = '';

    const theme: Theme = params.theme ?? 'light';
    const colors: Palette = getColors(theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const edgeLayer = el('g');
    const nodeLayer = el('g');
    const arrayLayer = el('g');
    const captionText = el('text', {
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    svg.append(edgeLayer, nodeLayer, arrayLayer, captionText);

    let geo: Geometry = { w: PIECE_CANVAS_W, cellW: CELL_MAX_W, originX: SIDE_MIN };
    // 높이는 여기서 한 번만 정한다. 러너가 만든 viewBox 와 같은 값이라
    // 사실상 확인이지만, 이 stage 가 세로를 어디서 정하는지 한 자리에 둔다.
    svg.setAttribute('viewBox', `0 0 ${geo.w} ${STAGE_H}`);
    let slots: Slot[] = [];
    let states: SlotState[] = [];
    let heapSize = 0;
    /** 층 사이 간격. 깊이가 잡아 둔 자리를 넘을 때만 줄어든다. */
    let levelGap = LEVEL_GAP;
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    /** destroy 뒤 깨어나지 않는 지연 (S-view). */
    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.add(id);
    };

    const parentOf = (i: number): number => Math.floor((i - 1) / 2);
    const depthOf = (i: number): number => Math.floor(Math.log2(i + 1));

    /** 나무에서 자리 i 가 앉을 좌표. 층 안에서 고르게 나눈다. */
    function treePos(i: number, total: number): { x: number; y: number } {
      const d = depthOf(i);
      const first = 2 ** d - 1;
      const inRow = i - first;
      const rowCount = Math.min(2 ** d, Math.max(1, total - first));
      const band = (geo.w - SIDE_MIN * 2) / rowCount;
      return {
        x: SIDE_MIN + band * (inRow + 0.5),
        y: TREE_TOP + d * levelGap,
      };
    }

    function clear(): void {
      edgeLayer.textContent = '';
      nodeLayer.textContent = '';
      arrayLayer.textContent = '';
      slots = [];
      states = [];
    }

    /**
     * 배열과 나무를 통째로 다시 그린다.
     *
     * 걸음마다 다시 그리지 않는다 — 견줌·맞바꿈은 이미 있는 요소의 색과 자리만
     * 바꾼다. 여기는 값의 개수가 바뀔 때(넣기·빼기·heapify)만 부른다.
     */
    function render(values: number[], sorted: number[]): void {
      clear();
      const all = [...values, ...sorted];
      heapSize = values.length;
      const count = Math.max(1, all.length);

      const cellW = Math.min(CELL_MAX_W, Math.floor((geo.w - SIDE_MIN * 2) / count));
      const originX = Math.round((geo.w - count * cellW) / 2);
      geo = { ...geo, cellW, originX };

      // 깊이가 잡아 둔 자리를 넘으면 층 간격을 줄여 담는다 — 높이를 늘리지
      // 않는다. viewBox 는 mount 때 정해진 그대로다.
      const maxDepth = all.length > 0 ? depthOf(Math.max(0, heapSize - 1)) : 0;
      levelGap = maxDepth > RESERVE_DEPTH
        ? (RESERVE_DEPTH * LEVEL_GAP) / maxDepth
        : LEVEL_GAP;
      captionText.setAttribute('x', String(geo.w / 2));
      captionText.setAttribute('y', String(STAGE_H - 10));
      if (all.length === 0) {
        captionText.textContent = t('caption.empty', 'The heap is empty.');
      }

      all.forEach((value, i) => {
        const inHeap = i < heapSize;
        const x = originX + i * cellW;

        const cell = el('rect', {
          x,
          y: ARRAY_Y,
          width: cellW,
          height: CELL_H,
          rx: 4,
          fill: inHeap ? colors.itemDefault : colors.itemSorted,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const cellText = el('text', {
          x: x + cellW / 2,
          y: ARRAY_Y + CELL_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: inHeap ? colors.text : colors.textInverse,
        });
        cellText.textContent = String(value);

        const idxText = el('text', {
          x: x + cellW / 2,
          y: ARRAY_Y - 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        idxText.textContent = String(i);
        arrayLayer.append(cell, cellText, idxText);

        let node: SVGCircleElement | null = null;
        let nodeText: SVGTextElement | null = null;
        let edge: SVGLineElement | null = null;
        let px = x + cellW / 2;
        let py = ARRAY_Y + CELL_H / 2;

        if (inHeap) {
          const pos = treePos(i, heapSize);
          px = pos.x;
          py = pos.y;
          if (i > 0) {
            const pp = treePos(parentOf(i), heapSize);
            edge = el('line', {
              x1: pp.x,
              y1: pp.y,
              x2: pos.x,
              y2: pos.y,
              stroke: colors.border,
              'stroke-width': 1.5,
            });
            edgeLayer.appendChild(edge);
          }
          node = el('circle', {
            cx: pos.x,
            cy: pos.y,
            r: NODE_R,
            fill: colors.itemDefault,
            stroke: colors.border,
            'stroke-width': 1.5,
          });
          nodeText = el('text', {
            x: pos.x,
            y: pos.y + 4,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          });
          nodeText.textContent = String(value);
          node.style.transition = `fill ${MOVE_MS}ms ease`;
          nodeLayer.append(node, nodeText);
        }

        slots.push({ cell, cellText, node, nodeText, edge, x: px, y: py });
        states.push(inHeap ? 'default' : 'sorted');
      });
    }

    function paint(i: number, state: SlotState): void {
      const s = slots[i];
      if (!s) return;
      states[i] = state;
      const tile = tileFor(state, colors);
      const ink = inkFor(state, colors);
      s.cell.setAttribute('fill', tile);
      s.cellText.setAttribute('fill', ink);
      if (s.node && s.nodeText) {
        s.node.setAttribute('fill', tile);
        s.nodeText.setAttribute('fill', ink);
      }
    }

    function setValue(i: number, value: number): void {
      const s = slots[i];
      if (!s) return;
      s.cellText.textContent = String(value);
      if (s.nodeText) s.nodeText.textContent = String(value);
    }

    function setCaption(text: string): void {
      captionText.textContent = text;
    }

    return {
      /** 값의 개수가 바뀌었다 — 통째로 다시 그린다. */
      setValues(values: number[], sorted: number[]): void {
        if (destroyed) return;
        render(values, sorted);
      },

      /** 두 자리를 견준다. 앞선 쪽만 잠시 다르게 칠한다. */
      compare(a: number, b: number, aheadIsA: boolean, caption: string): void {
        if (destroyed) return;
        paint(a, 'comparing');
        paint(b, 'comparing');
        setCaption(caption);
        const ahead = aheadIsA ? a : b;
        paint(ahead, 'swapping');
        later(() => {
          if (states[a] === 'comparing' || states[a] === 'swapping') paint(a, 'default');
          if (states[b] === 'comparing' || states[b] === 'swapping') paint(b, 'default');
        }, MOVE_MS * 2);
      },

      /** 두 자리가 값을 맞바꾼다. 자리는 그대로고 값이 건너간다. */
      swap(a: number, b: number, values: number[], caption: string): void {
        if (destroyed) return;
        const va = values[a];
        const vb = values[b];
        if (va !== undefined) setValue(a, va);
        if (vb !== undefined) setValue(b, vb);
        paint(a, 'swapping');
        paint(b, 'swapping');
        setCaption(caption);
        later(() => {
          if (states[a] === 'swapping') paint(a, 'default');
          if (states[b] === 'swapping') paint(b, 'default');
        }, MOVE_MS * 2);
      },

      /** 그 자리에 자리 잡았다. */
      settle(i: number, caption: string): void {
        if (destroyed) return;
        paint(i, 'settled');
        setCaption(caption);
        later(() => {
          if (states[i] === 'settled') paint(i, 'default');
        }, MOVE_MS * 3);
      },

      caption(text: string): void {
        if (destroyed) return;
        setCaption(text);
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    } satisfies ViewInstance & Record<string, unknown>;
  },
};

/** projector 가 부르는 메서드 묶음. */
export type HeapBinaryStage = {
  setValues(values: number[], sorted: number[]): void;
  compare(a: number, b: number, aheadIsA: boolean, caption: string): void;
  swap(a: number, b: number, values: number[], caption: string): void;
  settle(i: number, caption: string): void;
  caption(text: string): void;
};
