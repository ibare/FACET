/**
 * backtracking-stage — 4×4 판 · 찾은 해 · 탐색 자취를 한 캔버스에 그린다.
 *
 * 셋을 함께 두는 이유가 있다.
 *
 *   판     지금 어디를 보고 있고 왜 막혔는지. 막은 퀸에서 후보 칸까지 선을 긋는다.
 *   찾은 해 하나 찾고 끝내지 않으므로 **둘이 나란히 남아 견줄 수 있어야** 한다.
 *   자취   놓음과 물림을 시간 순으로 쌓은 띠. 막대 높이가 그때의 깊이다.
 *          해를 찾은 자리에 표가 붙고 **그 뒤로도 막대가 계속 이어진다** —
 *          "하나 찾고도 계속 물러난다" 를 눈으로 보이는 것이 이 띠의 일이다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 판도 자취도 칸 수가 정해져 있고,
 * 찾은 해는 두 줄까지 미리 자리를 잡아 둔다.
 *
 * 색은 전부 design-tokens 경유 (S-view 결정 트리):
 *   놓인 퀸 = itemPivot · 보는 중 = itemComparing · 막힘 = danger(severity) ·
 *   해 표시 = success(severity) · 그 밖 = structural.
 */

import type { ViewInstance, ViewMountParams, CanvasView, Palette } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, makeTranslator } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = 620;
const H = 348;

const BOARD_X = 44;
const BOARD_Y = 48;
const CELL = 48;

const SOL_X = 268;
const SOL_CELL = 14;
const SOL_GAP = 24;
const SOL_COLS = 4;
const SOL_ROW_Y = [56, 152] as const;

const TRAIL_X = 44;
const TRAIL_RIGHT = 604;
const TRAIL_BASE = 308;
const TRAIL_H = 32;
const TRAIL_SLOT = 16;

const CAPTION_Y = 332;

/** 자취 띠의 한 칸. `depth` 는 그 걸음을 마친 뒤 판에 남은 퀸의 수. */
type TrailMark = { kind: 'place' | 'undo'; depth: number; solution: boolean };

/** 지금 살펴보는 후보 칸과, 그것을 막은 앞선 행의 퀸. */
type Check = {
  row: number;
  col: number;
  safe: boolean;
  blockerRow: number;
  blockerCol: number;
};

/** 입력 hex 를 알파 섞은 rgba 로. 색 리터럴이 아니라 순수 변환이다 (S-view 예외). */
function hexToRgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function svg<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  value: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = svg('text', { 'font-family': fonts.body, ...attrs });
  node.textContent = value;
  return node;
}

/** 왕관 실루엣. 판의 퀸 한 마리. */
function crown(cx: number, cy: number, unit: number, fill: string): SVGPolygonElement {
  const p = (dx: number, dy: number): string => `${cx + dx * unit},${cy + dy * unit}`;
  const points = [
    p(-0.17, 0.16),
    p(0.17, 0.16),
    p(0.15, -0.04),
    p(0.08, 0.04),
    p(0, -0.17),
    p(-0.08, 0.04),
    p(-0.15, -0.04),
  ].join(' ');
  return svg('polygon', { points, fill });
}

/** 해를 찾은 자리에 붙는 표. */
function star(cx: number, cy: number, r: number, fill: string): SVGPolygonElement {
  const pts: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.44;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`);
  }
  return svg('polygon', { points: pts.join(' '), fill });
}

export const backtrackingStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    const colors: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // 러너가 붙여 준 캔버스는 그대로 두고 **안쪽만** 비운다 (S-view).
    canvas.textContent = '';
    canvas.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const root = svg('g', {});
    canvas.appendChild(root);

    let n = 4;
    let board: number[] = [];
    let currentRow: number | null = null;
    let check: Check | null = null;
    let solutions: number[][] = [];
    let trail: TrailMark[] = [];
    let caption = '';

    const labelSolutions = tr('label.solutions', 'Solutions found');
    const labelTrail = tr('label.trail', 'Search trail');

    function boardCellX(col: number): number {
      return BOARD_X + col * CELL;
    }
    function boardCellY(row: number): number {
      return BOARD_Y + row * CELL;
    }

    /** 앞선 행의 퀸이 아래로 내리누르는 칸인가 — `is_safe` 가 보는 그 조건. */
    function attacked(row: number, col: number): boolean {
      for (let r = 0; r < row; r += 1) {
        const c = board[r];
        if (c === undefined || c < 0) continue;
        if (c === col) return true;
        if (c - col === row - r || col - c === row - r) return true;
      }
      return false;
    }

    function drawBoard(g: SVGGElement): void {
      const size = n * CELL;

      if (currentRow !== null && currentRow < n) {
        g.appendChild(
          svg('rect', {
            x: BOARD_X - 8,
            y: boardCellY(currentRow),
            width: size + 16,
            height: CELL,
            fill: hexToRgba(colors.accent, 0.12),
            rx: 3,
          }),
        );
      }

      for (let col = 0; col < n; col += 1) {
        g.appendChild(
          text(String(col), {
            x: boardCellX(col) + CELL / 2,
            y: BOARD_Y - 10,
            'text-anchor': 'middle',
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
      }

      for (let row = 0; row < n; row += 1) {
        g.appendChild(
          text(String(row), {
            x: BOARD_X - 14,
            y: boardCellY(row) + CELL / 2 + 4,
            'text-anchor': 'end',
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );

        for (let col = 0; col < n; col += 1) {
          const x = boardCellX(col);
          const y = boardCellY(row);
          const hasQueen = board[row] === col;
          const isCheck = check !== null && check.row === row && check.col === col;
          const isBlocker = check !== null && check.blockerRow === row && check.blockerCol === col;

          let fill = colors.itemDefault;
          if (hasQueen) fill = colors.itemPivot;
          else if (isCheck) fill = check!.safe ? colors.itemComparing : colors.danger;

          g.appendChild(
            svg('rect', {
              x,
              y,
              width: CELL,
              height: CELL,
              fill,
              stroke: isBlocker ? colors.danger : colors.border,
              'stroke-width': isBlocker ? 2.5 : 1,
            }),
          );

          if (!hasQueen && !isCheck && attacked(row, col)) {
            g.appendChild(
              svg('rect', {
                x: x + 1,
                y: y + 1,
                width: CELL - 2,
                height: CELL - 2,
                fill: hexToRgba(colors.textMuted, 0.14),
              }),
            );
          }

          if (hasQueen) g.appendChild(crown(x + CELL / 2, y + CELL / 2, CELL, colors.stateInk));

          if (isCheck && !check!.safe) {
            const m = CELL * 0.26;
            const cx = x + CELL / 2;
            const cy = y + CELL / 2;
            g.appendChild(
              svg('path', {
                d: `M ${cx - m} ${cy - m} L ${cx + m} ${cy + m} M ${cx + m} ${cy - m} L ${cx - m} ${cy + m}`,
                stroke: colors.stateInk,
                'stroke-width': 2.5,
                'stroke-linecap': 'round',
              }),
            );
          }
        }
      }

      // 막은 퀸에서 후보 칸까지 그은 선 — 판이 왜 막혔는지가 여기에 있다.
      if (check !== null && check.blockerRow >= 0 && check.blockerCol >= 0) {
        g.appendChild(
          svg('line', {
            x1: boardCellX(check.blockerCol) + CELL / 2,
            y1: boardCellY(check.blockerRow) + CELL / 2,
            x2: boardCellX(check.col) + CELL / 2,
            y2: boardCellY(check.row) + CELL / 2,
            stroke: colors.danger,
            'stroke-width': 3,
            'stroke-linecap': 'round',
          }),
        );
      }
    }

    function drawSolutions(g: SVGGElement): void {
      g.appendChild(
        text(labelSolutions, {
          x: SOL_X,
          y: 44,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      const slot = n * SOL_CELL;
      solutions.forEach((sol, i) => {
        const rowIdx = Math.floor(i / SOL_COLS);
        if (rowIdx >= SOL_ROW_Y.length) return;
        const ox = SOL_X + (i % SOL_COLS) * (slot + SOL_GAP);
        const oy = SOL_ROW_Y[rowIdx]!;

        for (let r = 0; r < n; r += 1) {
          for (let c = 0; c < n; c += 1) {
            g.appendChild(
              svg('rect', {
                x: ox + c * SOL_CELL,
                y: oy + r * SOL_CELL,
                width: SOL_CELL,
                height: SOL_CELL,
                fill: colors.itemDefault,
                stroke: colors.border,
                'stroke-width': 1,
              }),
            );
            if (sol[r] === c) {
              g.appendChild(
                svg('circle', {
                  cx: ox + c * SOL_CELL + SOL_CELL / 2,
                  cy: oy + r * SOL_CELL + SOL_CELL / 2,
                  r: SOL_CELL * 0.28,
                  fill: colors.itemPivot,
                  stroke: colors.stateInk,
                  'stroke-width': 1,
                }),
              );
            }
          }
        }

        // `[1, 3, 0, 2]` 는 각 행의 열 번호를 적은 수식 표기다 (C10 표식).
        g.appendChild(
          text(`[${sol.join(', ')}]`, {
            x: ox + slot / 2,
            y: oy + slot + 15,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.text,
          }),
        );
      });
    }

    function drawTrail(g: SVGGElement): void {
      g.appendChild(
        text(labelTrail, {
          x: TRAIL_X,
          y: 260,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      g.appendChild(
        svg('line', {
          x1: TRAIL_X,
          y1: TRAIL_BASE,
          x2: TRAIL_RIGHT,
          y2: TRAIL_BASE,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const capacity = Math.floor((TRAIL_RIGHT - TRAIL_X) / TRAIL_SLOT);
      const shown = trail.slice(Math.max(0, trail.length - capacity));
      shown.forEach((mark, i) => {
        const x = TRAIL_X + i * TRAIL_SLOT + 2;
        const h = Math.max(3, (mark.depth / n) * (TRAIL_H - 4) + 3);
        const y = TRAIL_BASE - h;
        g.appendChild(
          svg('rect', {
            x,
            y,
            width: TRAIL_SLOT - 5,
            height: h,
            fill: mark.kind === 'place' ? colors.itemPivot : colors.bg,
            stroke: mark.kind === 'place' ? colors.stateInk : colors.textMuted,
            'stroke-width': 1,
          }),
        );
        if (mark.solution) {
          g.appendChild(star(x + (TRAIL_SLOT - 5) / 2, y - 8, 5.5, colors.success));
        }
      });
    }

    function render(): void {
      root.textContent = '';
      root.appendChild(
        svg('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }),
      );

      const g = svg('g', {});
      drawBoard(g);
      drawSolutions(g);
      drawTrail(g);
      g.appendChild(
        text(caption, {
          x: 20,
          y: CAPTION_Y,
          'font-size': fontSizes.sm,
          fill: colors.text,
        }),
      );
      root.appendChild(g);
    }

    render();

    return {
      destroy() {
        // 타이머도 옵저버도 없다. 캔버스는 러너가 거둔다.
        root.textContent = '';
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      setBoardSize(size: number) {
        n = size;
        board = new Array<number>(size).fill(-1);
        render();
      },

      setCurrentRow(row: number | null) {
        currentRow = row;
        render();
      },

      showCheck(row: number, col: number, safe: boolean, blockerRow: number, blockerCol: number) {
        check = { row, col, safe, blockerRow, blockerCol };
        render();
      },

      clearCheck() {
        check = null;
        render();
      },

      placeQueen(row: number, col: number) {
        board[row] = col;
        check = null;
        render();
      },

      removeQueen(row: number) {
        board[row] = -1;
        check = null;
        render();
      },

      addSolution(cols: number[]) {
        solutions = [...solutions, [...cols]];
        render();
      },

      pushTrail(kind: 'place' | 'undo', depth: number) {
        trail = [...trail, { kind, depth, solution: false }];
        render();
      },

      markTrailSolution() {
        if (trail.length === 0) return;
        const last = trail[trail.length - 1]!;
        trail = [...trail.slice(0, -1), { ...last, solution: true }];
        render();
      },

      setCaption(value: string) {
        caption = value;
        render();
      },

      reset() {
        board = new Array<number>(n).fill(-1);
        currentRow = null;
        check = null;
        solutions = [];
        trail = [];
        caption = '';
        render();
      },
    };
  },
};
