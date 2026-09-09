/**
 * merge-sort 전용 stage — 재귀의 마디를 배열 위의 **구간**으로 그린다.
 *
 * 가로는 배열의 자리(0..n-1) 고정, 세로는 재귀의 깊이다. 한 번의 호출
 * `merge_sort(arr, lo, hi)` 가 그 깊이 줄에서 lo..hi 칸을 덮는 한 덩이로 나타난다.
 * 쪼개면 아래 줄에 두 덩이가 생기고, 합치면 위 줄의 덩이가 채워진다 —
 * **합침이 쪼갬의 역순으로 일어난다**는 것이 그림의 뼈대다.
 *
 * 합칠 때는 두 아래 덩이의 **맨 앞 칸 둘만** 달아오르고, 이긴 값이 위 덩이의
 * 빈칸으로 올라간다. 그것 말고는 아무 데도 보지 않는다는 것이 두 번째 축이다.
 *
 * 세로는 mount 에서 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view). 깊이는
 * 처음 데이터의 길이로 정해지므로 재생 중에 늘어날 일이 없다.
 *
 * 타이머를 두지 않는다 — 걸음의 속도는 러너가 정하고, 이 view 는 부르는
 * 대로 다시 그릴 뿐이다. destroy 는 붙여 둔 `<g>` 하나만 거둔다.
 */

import type { CanvasView, Theme, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  PIECE_CANVAS_W,
  depthVeil,
  fontSizes,
  fonts,
  getColors,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 깊이 표식(d0 · d1 …) 이 앉는 왼쪽 여백. */
const GUTTER = 30;
const PAD_R = 10;
const TOP = 16;
/** 한 깊이 줄의 높이. */
const ROW_H = 46;
const CELL_H = 28;
/** 아래쪽 한 줄 서사. */
const CAPTION_H = 34;
/** 자리 일곱(대표 데이터) 의 재귀 깊이. viewBox 초기값에만 쓴다. */
const DEFAULT_ROWS = 4;

/** 깊이 표식. 도형에 새긴 글자라 문안이 아니다 (C10 판정 1). */
const DEPTH_MARK = 'd';

type CellState = 'empty' | 'idle' | 'front' | 'consumed' | 'sorted';
type NodeState = 'idle' | 'active' | 'split' | 'feeding' | 'merging' | 'spent' | 'sorted';

type Cell = { value: number | null; state: CellState };

type SpanNode = {
  lo: number;
  hi: number;
  depth: number;
  cells: Cell[];
  state: NodeState;
};

type Arrow = { from: number; to: number; fromDepth: number; toDepth: number; drain: boolean };

/** projector 가 부르는 메서드 집합. */
export type MergeSortStage = {
  init(values: number[]): void;
  split(lo: number, hi: number, mid: number, depth: number): void;
  descend(lo: number, depth: number): void;
  markBase(lo: number, depth: number): void;
  mergeBegin(lo: number, mid: number, depth: number): void;
  copyOut(left: number[], right: number[]): void;
  showFronts(leftAbs: number, rightAbs: number): void;
  take(side: 'left' | 'right', from: number, to: number, value: number, drain: boolean): void;
  mergeEnd(values: number[]): void;
  finish(): void;
  setCaption(text: string): void;
};

/** merge sort 가 길이 n 에서 닿는 가장 깊은 자리. 줄 수는 그보다 하나 많다. */
function deepestOf(n: number): number {
  if (n <= 1) return 0;
  const walk = (lo: number, hi: number, d: number): number => {
    if (lo >= hi) return d;
    const mid = Math.floor((lo + hi) / 2);
    return Math.max(walk(lo, mid, d + 1), walk(mid + 1, hi, d + 1));
  };
  return walk(0, n - 1, 0);
}

export const mergeSortStageView: CanvasView = {
  canvas: { height: TOP + DEFAULT_ROWS * ROW_H + CAPTION_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 캔버스 안쪽만 다룬다 — 컨테이너를 비우면 러너가 먼저 붙여 둔 이 캔버스가
    // 떨어져 나가고, 예외 없이 화면만 빈다 (S-view).
    const svg = params.canvas;
    const theme: Theme | undefined = params.theme;
    const colors = getColors(theme);

    const seed = (params.initialData as { values?: number[] } | undefined)?.values;
    const n = Array.isArray(seed) && seed.length > 0 ? seed.length : 1;
    const rows = deepestOf(n) + 1;
    const height = TOP + rows * ROW_H + CAPTION_H;
    svg.setAttribute('viewBox', `0 0 ${W} ${height}`);

    const colW = (W - GUTTER - PAD_R) / n;
    const colX = (i: number): number => GUTTER + i * colW;
    const rowY = (d: number): number => TOP + d * ROW_H;

    const root = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(root);

    const nodes = new Map<string, SpanNode>();
    let active: { lo: number; mid: number; depth: number } | null = null;
    let arrow: Arrow | null = null;
    let caption = '';

    const key = (depth: number, lo: number): string => `${depth}:${lo}`;
    const nodeAt = (depth: number, lo: number): SpanNode | undefined => nodes.get(key(depth, lo));

    // ── 그리기 도구 ───────────────────────────────────────────────
    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    function label(x: number, y: number, text: string, fill: string, size: string): SVGTextElement {
      const t = el('text', {
        x,
        y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill,
        'font-family': fonts.body,
        'font-size': size,
      });
      t.textContent = text;
      return t;
    }

    function cellPaint(state: CellState): { fill: string; stroke: string; ink: string; dash: string } {
      switch (state) {
        case 'empty':
          return { fill: 'none', stroke: colors.ghostOutline, ink: colors.textMuted, dash: '3 3' };
        case 'front':
          return { fill: colors.itemComparing, stroke: colors.itemComparing, ink: colors.stateInk, dash: '' };
        case 'consumed':
          return { fill: colors.bgSubtle, stroke: colors.border, ink: colors.textMuted, dash: '' };
        case 'sorted':
          return { fill: colors.itemSorted, stroke: colors.itemSorted, ink: colors.textInverse, dash: '' };
        default:
          return { fill: colors.itemDefault, stroke: colors.border, ink: colors.text, dash: '' };
      }
    }

    function spanStroke(state: NodeState): { stroke: string; width: number; opacity: number } {
      switch (state) {
        case 'active':
        case 'merging':
          return { stroke: colors.accent, width: 2, opacity: 1 };
        case 'feeding':
          return { stroke: colors.itemComparing, width: 1.5, opacity: 1 };
        case 'sorted':
          return { stroke: colors.sortedTailBorder, width: 1.5, opacity: 1 };
        case 'spent':
          return { stroke: colors.border, width: 1, opacity: 0.45 };
        default:
          return { stroke: colors.border, width: 1, opacity: 1 };
      }
    }

    function drawNode(node: SpanNode): void {
      const g = el('g', { opacity: node.state === 'spent' ? 0.5 : 1 });
      const veil = depthVeil(node.depth, theme);
      const x0 = colX(node.lo) + 1;
      const x1 = colX(node.hi + 1) - 1;
      const y = rowY(node.depth) - 5;
      const h = CELL_H + 10;

      g.appendChild(
        el('rect', {
          x: x0,
          y,
          width: Math.max(0, x1 - x0),
          height: h,
          rx: 7,
          fill: veil.fill,
          'fill-opacity': veil.alpha,
        }),
      );
      const ss = spanStroke(node.state);
      g.appendChild(
        el('rect', {
          x: x0,
          y,
          width: Math.max(0, x1 - x0),
          height: h,
          rx: 7,
          fill: 'none',
          stroke: ss.stroke,
          'stroke-width': ss.width,
          'stroke-opacity': ss.opacity,
        }),
      );

      node.cells.forEach((cell, offset) => {
        const paint = cellPaint(cell.state);
        const cx = colX(node.lo + offset) + 4;
        const cw = Math.max(0, colW - 8);
        const rect = el('rect', {
          x: cx,
          y: rowY(node.depth),
          width: cw,
          height: CELL_H,
          rx: 4,
          fill: paint.fill,
          stroke: paint.stroke,
          'stroke-width': 1,
        });
        if (paint.dash) rect.setAttribute('stroke-dasharray', paint.dash);
        g.appendChild(rect);
        if (cell.value !== null) {
          g.appendChild(
            label(
              cx + cw / 2,
              rowY(node.depth) + CELL_H / 2,
              String(cell.value),
              paint.ink,
              fontSizes.sm,
            ),
          );
        }
      });

      root.appendChild(g);
    }

    function drawArrow(a: Arrow): void {
      const sx = colX(a.from) + colW / 2;
      const sy = rowY(a.fromDepth) - 6;
      const dx = colX(a.to) + colW / 2;
      const dy = rowY(a.toDepth) + CELL_H + 6;
      const midY = (sy + dy) / 2;
      const path = el('path', {
        d: `M ${sx} ${sy} C ${sx} ${midY}, ${dx} ${midY}, ${dx} ${dy}`,
        fill: 'none',
        stroke: colors.accent,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      if (a.drain) path.setAttribute('stroke-dasharray', '4 3');
      root.appendChild(path);
      root.appendChild(
        el('path', {
          d: `M ${dx - 4} ${dy + 5} L ${dx} ${dy} L ${dx + 4} ${dy + 5}`,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
    }

    function render(): void {
      root.textContent = '';

      for (let d = 0; d < rows; d++) {
        root.appendChild(
          label(GUTTER / 2, rowY(d) + CELL_H / 2, `${DEPTH_MARK}${d}`, colors.textMuted, fontSizes.xs),
        );
      }

      const ordered = [...nodes.values()].sort((a, b) => a.depth - b.depth || a.lo - b.lo);
      for (const node of ordered) drawNode(node);
      if (arrow) drawArrow(arrow);

      if (caption) {
        root.appendChild(
          label(W / 2, TOP + rows * ROW_H + CAPTION_H / 2, caption, colors.textMuted, fontSizes.sm),
        );
      }
    }

    // ── projector 계약 ────────────────────────────────────────────
    function clearFronts(): void {
      for (const node of nodes.values()) {
        for (const cell of node.cells) if (cell.state === 'front') cell.state = 'idle';
      }
    }

    const api: MergeSortStage = {
      init(values) {
        nodes.clear();
        active = null;
        arrow = null;
        caption = '';
        if (values.length > 0) {
          nodes.set(key(0, 0), {
            lo: 0,
            hi: values.length - 1,
            depth: 0,
            cells: values.map((value) => ({ value, state: 'idle' as CellState })),
            state: 'active',
          });
        }
        render();
      },

      split(lo, hi, mid, depth) {
        const parent = nodeAt(depth, lo);
        if (!parent) return;
        parent.state = 'split';
        const slice = (from: number, to: number): Cell[] =>
          parent.cells
            .slice(from - parent.lo, to - parent.lo + 1)
            .map((c) => ({ value: c.value, state: 'idle' as CellState }));
        nodes.set(key(depth + 1, lo), {
          lo,
          hi: mid,
          depth: depth + 1,
          cells: slice(lo, mid),
          state: 'idle',
        });
        nodes.set(key(depth + 1, mid + 1), {
          lo: mid + 1,
          hi,
          depth: depth + 1,
          cells: slice(mid + 1, hi),
          state: 'idle',
        });
        arrow = null;
        render();
      },

      descend(lo, depth) {
        const node = nodeAt(depth, lo);
        if (node) node.state = 'active';
        render();
      },

      markBase(lo, depth) {
        const node = nodeAt(depth, lo);
        if (node) {
          node.state = 'sorted';
          for (const cell of node.cells) cell.state = 'sorted';
        }
        render();
      },

      mergeBegin(lo, mid, depth) {
        active = { lo, mid, depth };
        const parent = nodeAt(depth, lo);
        if (parent) {
          parent.state = 'merging';
          parent.cells = parent.cells.map(() => ({ value: null, state: 'empty' as CellState }));
        }
        for (const childLo of [lo, mid + 1]) {
          const child = nodeAt(depth + 1, childLo);
          if (child) child.state = 'feeding';
        }
        arrow = null;
        render();
      },

      copyOut(left, right) {
        if (!active) return;
        const l = nodeAt(active.depth + 1, active.lo);
        const r = nodeAt(active.depth + 1, active.mid + 1);
        if (l) l.cells = left.map((value) => ({ value, state: 'idle' as CellState }));
        if (r) r.cells = right.map((value) => ({ value, state: 'idle' as CellState }));
        render();
      },

      showFronts(leftAbs, rightAbs) {
        if (!active) return;
        clearFronts();
        const l = nodeAt(active.depth + 1, active.lo);
        const r = nodeAt(active.depth + 1, active.mid + 1);
        const lc = l?.cells[leftAbs - l.lo];
        const rc = r?.cells[rightAbs - r.lo];
        if (lc) lc.state = 'front';
        if (rc) rc.state = 'front';
        arrow = null;
        render();
      },

      take(side, from, to, value, drain) {
        if (!active) return;
        clearFronts();
        const srcLo = side === 'left' ? active.lo : active.mid + 1;
        const src = nodeAt(active.depth + 1, srcLo);
        const srcCell = src?.cells[from - src.lo];
        if (srcCell) srcCell.state = 'consumed';
        const parent = nodeAt(active.depth, active.lo);
        const dstCell = parent?.cells[to - parent.lo];
        if (dstCell) {
          dstCell.value = value;
          dstCell.state = 'sorted';
        }
        arrow = { from, to, fromDepth: active.depth + 1, toDepth: active.depth, drain };
        render();
      },

      mergeEnd(values) {
        if (!active) return;
        const parent = nodeAt(active.depth, active.lo);
        if (parent) {
          parent.state = 'sorted';
          parent.cells = values.map((value) => ({ value, state: 'sorted' as CellState }));
        }
        for (const childLo of [active.lo, active.mid + 1]) {
          const child = nodeAt(active.depth + 1, childLo);
          if (child) {
            child.state = 'spent';
            for (const cell of child.cells) cell.state = 'consumed';
          }
        }
        active = null;
        arrow = null;
        render();
      },

      finish() {
        const rootNode = nodeAt(0, 0);
        if (rootNode) rootNode.state = 'sorted';
        active = null;
        arrow = null;
        render();
      },

      setCaption(text) {
        caption = text;
        render();
      },
    };

    render();

    return {
      destroy() {
        // 걸어 둔 타이머도 구독도 없다. 붙인 것은 이 `<g>` 하나뿐이라 그것만 거둔다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },
      ...api,
    } satisfies ViewInstance;
  },
};
