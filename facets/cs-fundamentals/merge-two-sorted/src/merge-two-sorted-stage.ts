/**
 * merge-two-sorted-stage — 두 줄이 아래 결과줄로 **내려가는** 무대.
 *
 * ── 형태가 어디서 나왔나
 *
 * 이 조각의 동사는 "내려간다" 다. 그래서 화면은 위아래로 짜였다 — 줄 A 와
 * 줄 B 가 위에 나란히 눕고, 그 아래 빈 결과줄이 처음부터 캔버스 폭을 다 차지한
 * 채 기다린다. 위의 여섯 칸이 아래 여섯 자리로 하나씩 옮겨 앉는 것이 전부이며,
 * 그래서 재생이 끝나면 위는 비고 아래는 찬다.
 *
 * 칸은 복제되지 않는다. 같은 칸이 제 줄에서 떨어져 나와 결과줄로 내려앉고,
 * 떠난 자리에는 미리 깔아 둔 점선 윤곽이 드러난다 ("내려간 자리는 비고").
 *
 * 내려가는 길은 두 마디다. 먼저 제 x 를 지킨 채 줄 밖으로 **곧장 떨어지고**,
 * 그 다음 제 자리를 찾아 미끄러진다. 첫 마디가 수직이어야 "내려간다" 가 색
 * 전환이 아니라 운동으로 읽힌다.
 *
 * 맨 앞은 고리(ring)가 표시하고, 그 줄이 이길 때마다 한 칸씩 **미끄러져**
 * 옮겨 간다 — "그 줄의 다음 값이 맨 앞이 된다" 가 위치 변화로 일어난다.
 * 아직 읽지 않은 뒤쪽 칸은 흐린 글자로 두어, 견줌이 맨 앞 둘 사이에서만
 * 일어난다는 것이 정지 화면에서도 보이게 한다.
 *
 * ── 타이머
 *
 * 있다. 두 마디 이동과 색 전환의 끝을 기다리는 유한 타이머뿐이며 스스로 다음
 * 회차를 예약하지 않는다. `destroy()` 와 `init()` 은 남은 타이머를 모두 걷어
 * 내고 그 대기 promise 를 즉시 풀어 준다 — 풀지 않으면 projector 의 await 가
 * 영영 돌아오지 않아 알고리즘이 매달린다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 마운트 뒤로 바뀌지 않는다 (S-view). */
const STAGE_H = 276;

/** 칸 폭 상한. 실제 폭은 캔버스에서 역산한다 (S-piece "그 폭을 채운다"). */
const CELL_MAX_W = 92;
/** 좌우 최소 여백 — 줄 이름표(A / B / A+B)가 앉을 자리. */
const SIDE_MIN = 46;
/** 이웃 칸 사이 틈. */
const CELL_GAP = 8;
const CELL_H = 44;

const ROW_A_Y = 14;
const ROW_B_Y = 78;
/** 줄에서 떨어져 나온 칸이 잠시 머무는 높이. */
const DROP_Y = 140;
const ROW_OUT_Y = 196;
const CAPTION_Y = 262;

/** 줄 밖으로 곧장 떨어지는 시간. */
const FALL_MS = 170;
/** 제 자리를 찾아 미끄러지는 시간. */
const SETTLE_MS = 260;
/** 고리가 다음 맨 앞으로 옮겨 가는 시간. */
const RING_MS = 200;
/** 색이 갈아입는 시간. */
const TINT_MS = 160;

/** 줄 이름표. 도형에 새긴 표식이라 번역 대상이 아니다 (C10). */
const LABEL_LEFT = 'A';
const LABEL_RIGHT = 'B';
const LABEL_OUT = 'A+B';

export type MergeSide = 'left' | 'right';

export type MergeStageInit = { left: number[]; right: number[] };
export type MergeStageCompare = { leftIndex: number; rightIndex: number };
export type MergeStageTake = { side: MergeSide; index: number; slot: number };

type Cell = {
  side: MergeSide;
  index: number;
  g: SVGGElement;
  box: SVGRectElement;
  label: SVGTextElement;
  /** 결과줄에 내려앉은 자리. 아직 제 줄에 있으면 null. */
  slot: number | null;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

export const mergeTwoSortedStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);

    let destroyed = false;

    // ── 유한 타이머. 걷어 낼 때 대기 promise 도 함께 풀어 준다.
    type Waiter = { id: ReturnType<typeof setTimeout>; resolve: () => void };
    const waiters = new Set<Waiter>();
    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        const w: Waiter = {
          id: setTimeout(() => {
            waiters.delete(w);
            resolve();
          }, ms),
          resolve,
        };
        waiters.add(w);
      });
    const releaseWaiters = (): void => {
      for (const w of waiters) {
        clearTimeout(w.id);
        w.resolve();
      }
      waiters.clear();
    };

    const root = el('g');
    svg.appendChild(root);

    // ── 무대 상태
    let cellW = CELL_MAX_W;
    let originX = SIDE_MIN;
    let leftLen = 0;
    let rightLen = 0;
    let headLeft = 0;
    let headRight = 0;
    let comparing = false;
    let flying: Cell | null = null;
    let cells: Cell[] = [];
    /** 판을 다시 세울 때마다 오른다. 흘러간 애니메이션이 새 판을 건드리지 못하게. */
    let generation = 0;

    let ringLeft: SVGRectElement | null = null;
    let ringRight: SVGRectElement | null = null;
    let bridge: SVGPolylineElement | null = null;
    let caption: SVGTextElement | null = null;

    const slotX = (n: number): number => originX + n * cellW;
    const rowY = (side: MergeSide): number => (side === 'left' ? ROW_A_Y : ROW_B_Y);
    const headOf = (side: MergeSide): number => (side === 'left' ? headLeft : headRight);
    const lenOf = (side: MergeSide): number => (side === 'left' ? leftLen : rightLen);
    const centerX = (x: number): number => x + cellW / 2;

    const place = (node: SVGElement, x: number, y: number): void => {
      node.setAttribute('transform', `translate(${x}, ${y})`);
    };

    function drawSlotOutline(x: number, y: number): SVGRectElement {
      return el('rect', {
        x: x + CELL_GAP / 2,
        y,
        width: cellW - CELL_GAP,
        height: CELL_H,
        rx: 8,
        fill: 'none',
        stroke: colors.ghostOutline,
        'stroke-width': 1,
        'stroke-dasharray': '4 4',
      });
    }

    function drawRing(): SVGRectElement {
      return el('rect', {
        x: CELL_GAP / 2 - 5,
        y: -5,
        width: cellW - CELL_GAP + 10,
        height: CELL_H + 10,
        rx: 12,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
      });
    }

    function paint(): void {
      for (const c of cells) {
        const landed = c.slot !== null;
        const lit = c === flying || (!landed && comparing && c.index === headOf(c.side));
        const isHead = !landed && c.index === headOf(c.side);

        if (landed) {
          c.box.setAttribute('fill', colors.itemSorted);
          c.box.setAttribute('stroke', colors.itemSorted);
          c.label.setAttribute('fill', colors.textInverse);
        } else if (lit) {
          c.box.setAttribute('fill', colors.itemComparing);
          c.box.setAttribute('stroke', colors.itemComparing);
          c.label.setAttribute('fill', colors.stateInk);
        } else {
          c.box.setAttribute('fill', colors.itemDefault);
          c.box.setAttribute('stroke', colors.border);
          // 맨 앞이 아닌 칸은 아직 아무도 읽지 않았다 — 흐린 글자로 둔다.
          c.label.setAttribute('fill', isHead ? colors.text : colors.textMuted);
        }
      }

      for (const side of ['left', 'right'] as const) {
        const ring = side === 'left' ? ringLeft : ringRight;
        if (!ring) continue;
        const head = headOf(side);
        const alive = head < lenOf(side);
        ring.setAttribute('opacity', alive ? '1' : '0');
        if (alive) place(ring, slotX(head), rowY(side));
      }
    }

    function showBridge(p: MergeStageCompare | null): void {
      if (!bridge) return;
      if (!p) {
        bridge.setAttribute('opacity', '0');
        return;
      }
      const ax = centerX(slotX(p.leftIndex));
      const bx = centerX(slotX(p.rightIndex));
      const top = ROW_A_Y + CELL_H;
      const bottom = ROW_B_Y;
      const mid = (top + bottom) / 2;
      bridge.setAttribute('points', `${ax},${top} ${ax},${mid} ${bx},${mid} ${bx},${bottom}`);
      bridge.setAttribute('opacity', '1');
    }

    function build(data: MergeStageInit): void {
      generation += 1;
      releaseWaiters();
      while (root.firstChild) root.removeChild(root.firstChild);

      leftLen = data.left.length;
      rightLen = data.right.length;
      headLeft = 0;
      headRight = 0;
      comparing = false;
      flying = null;
      cells = [];

      const total = Math.max(1, leftLen + rightLen);
      cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / total));
      originX = Math.round((PIECE_CANVAS_W - total * cellW) / 2);

      // 1) 바탕 — 자리의 윤곽. 칸이 떠나면 이것이 드러난다.
      const back = el('g');
      for (let i = 0; i < leftLen; i += 1) back.appendChild(drawSlotOutline(slotX(i), ROW_A_Y));
      for (let j = 0; j < rightLen; j += 1) back.appendChild(drawSlotOutline(slotX(j), ROW_B_Y));
      for (let k = 0; k < total; k += 1) back.appendChild(drawSlotOutline(slotX(k), ROW_OUT_Y));
      root.appendChild(back);

      // 2) 줄 이름표
      const labels = el('g');
      const rowLabel = (text: string, y: number): SVGTextElement => {
        const node = el('text', {
          x: originX - 12,
          y: y + CELL_H / 2 + 4,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        node.textContent = text;
        return node;
      };
      labels.appendChild(rowLabel(LABEL_LEFT, ROW_A_Y));
      labels.appendChild(rowLabel(LABEL_RIGHT, ROW_B_Y));
      labels.appendChild(rowLabel(LABEL_OUT, ROW_OUT_Y));
      root.appendChild(labels);

      // 3) 견줌 다리 — 맨 앞 둘 사이에만 걸린다.
      bridge = el('polyline', {
        points: '',
        fill: 'none',
        stroke: colors.itemComparing,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
        opacity: '0',
      });
      root.appendChild(bridge);

      // 4) 맨 앞 고리. 첫 자리는 그냥 놓고, 옮겨 다니는 것은 그 뒤부터 —
      //    transition 을 먼저 걸면 마운트 순간 왼쪽 위에서 날아 들어온다.
      ringLeft = drawRing();
      ringRight = drawRing();
      root.appendChild(ringLeft);
      root.appendChild(ringRight);

      // 5) 값이 든 칸 — 이 여섯이 위에서 아래로 옮겨 앉는다.
      const makeCell = (side: MergeSide, index: number, value: number): Cell => {
        const g = el('g');
        const box = el('rect', {
          x: CELL_GAP / 2,
          y: 0,
          width: cellW - CELL_GAP,
          height: CELL_H,
          rx: 8,
          'stroke-width': 1.5,
        });
        box.style.transition = `fill ${TINT_MS}ms linear, stroke ${TINT_MS}ms linear`;
        const label = el('text', {
          x: cellW / 2,
          y: CELL_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': '600',
        });
        label.style.transition = `fill ${TINT_MS}ms linear`;
        label.textContent = String(value);
        g.appendChild(box);
        g.appendChild(label);
        place(g, slotX(index), rowY(side));
        root.appendChild(g);
        return { side, index, g, box, label, slot: null };
      };
      data.left.forEach((v, i) => cells.push(makeCell('left', i, v)));
      data.right.forEach((v, j) => cells.push(makeCell('right', j, v)));

      // 6) 캡션
      caption = el('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      root.appendChild(caption);

      paint();

      for (const ring of [ringLeft, ringRight]) {
        ring.style.transition = `transform ${RING_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1), opacity ${TINT_MS}ms linear`;
      }
    }

    async function takeDown(p: MergeStageTake): Promise<void> {
      const gen = generation;
      const cell = cells.find((c) => c.side === p.side && c.index === p.index && c.slot === null);
      if (!cell || destroyed) return;
      const stale = (): boolean => destroyed || generation !== gen;

      // 견줌은 끝났다. 진 쪽은 제 줄 맨 앞으로 돌아간다.
      comparing = false;
      flying = cell;
      showBridge(null);
      paint();

      // 첫 마디 — 제 x 를 지킨 채 줄 밖으로 곧장 떨어진다.
      cell.g.style.transition = `transform ${FALL_MS}ms cubic-bezier(0.4, 0, 0.7, 0.4)`;
      place(cell.g, slotX(cell.index), DROP_Y);
      await wait(FALL_MS);
      if (stale()) return;

      // 떠난 자리는 비었다 — 그 줄의 다음 값이 맨 앞이 된다.
      if (p.side === 'left') headLeft += 1;
      else headRight += 1;
      paint();

      // 둘째 마디 — 제 자리를 찾아 미끄러진다.
      cell.g.style.transition = `transform ${SETTLE_MS}ms cubic-bezier(0.2, 0.7, 0.3, 1)`;
      place(cell.g, slotX(p.slot), ROW_OUT_Y);
      await wait(SETTLE_MS);
      if (stale()) return;

      cell.slot = p.slot;
      flying = null;
      paint();
    }

    const instance = {
      init(data: MergeStageInit): void {
        if (destroyed) return;
        build(data);
      },

      setCaption(text: string): void {
        if (caption) caption.textContent = text;
      },

      showCompare(p: MergeStageCompare): void {
        if (destroyed) return;
        comparing = true;
        showBridge(p);
        paint();
      },

      takeDown,

      finish(): void {
        if (destroyed) return;
        comparing = false;
        flying = null;
        showBridge(null);
        paint();
      },

      destroy(): void {
        destroyed = true;
        releaseWaiters();
        root.remove();
      },
    };

    return instance;
  },
};
