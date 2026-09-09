/**
 * shell-sort-stage — 셸 정렬 완결형의 전용 stage view.
 *
 * 화면이 지고 있는 것은 셋이다.
 *
 *   1. **간격 자** — 자리 0 의 한가운데에서 자리 `gap` 의 한가운데까지 실제
 *      길이로 그린다. 3 에서 1 로 접히면 자가 눈에 띄게 짧아진다.
 *   2. **사슬** — 간격 `gap` 이 가르는 사슬들을 칸 아래 색 띠와 활 모양 선으로
 *      묶는다. 값 일곱 · 간격 3 이면 0·3·6 / 1·4 / 2·5 세 묶음이 서로 떨어져
 *      있는 것이 보인다. 지금 정렬 중인 사슬만 진하다.
 *   3. **구멍과 집은 값** — 삽입 정렬의 운동 그대로다. 값을 집으면 그 칸이
 *      빈 구멍이 되고, 왼쪽 것이 비켜설 때마다 구멍이 `gap` 칸씩 왼쪽으로
 *      옮겨 간다. 집은 값은 그 구멍 위를 따라다니다 자리가 나면 내려앉는다.
 *
 * 그리고 아래에 이동 횟수 두 줄 — 간격을 두고 온 쪽과 처음부터 간격 1 만으로
 * 한 쪽. 둘 다 알고리즘이 센 값이다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 타이머도 이벤트 리스너도 두지
 * 않으므로 `destroy()` 는 붙여 둔 루트 그룹 하나만 걷어 내면 된다.
 */

import type { ViewInstance, ViewMountParams, CanvasView } from '@ffacet/core/runtime';
import {
  getColors,
  categorical,
  fonts,
  fontSizes,
  makeTranslator,
  type Translate,
} from '@ffacet/core/runtime';

/** 칸의 시각 상태. `null` 은 아무 표시 없음. */
export type ShellSortCellState = 'comparing' | 'shifting' | 'sorted' | null;

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 620;
const H = 300;

const PAD_X = 24;

const CAPTION_Y = 21;

const RULER_LABEL_Y = 47;
const RULER_Y = 60;
const RULER_TICK = 5;

const HELD_W = 46;
const HELD_H = 28;
const HELD_Y = 76;

const CELL_W = 52;
const CELL_GAP = 12;
const CELL_PITCH = CELL_W + CELL_GAP;
const CELL_Y = 116;
const CELL_H = 46;

const ARROW_Y = 174;
const INDEX_Y = 190;
const CHAIN_TICK_Y = 197;
const CHAIN_TICK_H = 3;
const CHAIN_ARC_BOTTOM = 224;

const DIVIDER_Y = 236;
// 장부 라벨은 막대 왼쪽에 오른쪽 맞춤으로 놓는다. 가장 긴 문안(es 32자)이
// `PAD_X` 를 침범하지 않도록 라벨 자리를 208px 잡고 글자는 xs 로 둔다.
const BAR_X = 244;
const BAR_MAX_W = 268;
const BAR_H = 14;
const BAR_A_Y = 248;
const BAR_B_Y = 272;

const DIM_OPACITY = '0.26';

type Attrs = Record<string, string | number>;

function node<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function textNode(
  content: string,
  attrs: Attrs,
  size: string,
  fill: string,
  family: string = fonts.body,
): SVGTextElement {
  const t = node('text', {
    'font-family': family,
    'font-size': size,
    fill,
    ...attrs,
  });
  t.textContent = content;
  return t;
}

export const shellSortStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback 만 makeTranslator (C10).
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const root = node('g', {});
    svg.appendChild(root);

    // ── 상태 ──────────────────────────────────────────────────────────────
    let values: number[] = [];
    let n = 0;
    let originX = PAD_X;

    let gap = 0;
    let chains: number[][] = [];
    let activeChain: number | null = null;
    /** 사슬 색은 가장 큰 간격의 사슬 수만큼 뽑아 라운드가 바뀌어도 유지한다. */
    let chainPalette: readonly string[] = [];

    let holeIndex: number | null = null;
    let heldValue: number | null = null;
    let cellStates: ShellSortCellState[] = [];
    let shiftFrom: number | null = null;
    let shiftTo: number | null = null;

    let baselineShifts = 0;
    let roundShifts: number[] = [];
    let caption = '';

    const cellX = (i: number): number => originX + i * CELL_PITCH;
    const cellCx = (i: number): number => cellX(i) + CELL_W / 2;

    // ── 그리기 ────────────────────────────────────────────────────────────

    function drawCaption(): void {
      if (caption === '') return;
      root.appendChild(
        textNode(
          caption,
          { x: W / 2, y: CAPTION_Y, 'text-anchor': 'middle' },
          fontSizes.sm,
          c.text,
        ),
      );
    }

    function drawRuler(): void {
      if (gap <= 0 || n === 0) return;
      const x1 = cellCx(0);
      const x2 = cellCx(Math.min(gap, n - 1));
      root.appendChild(
        node('line', { x1, y1: RULER_Y, x2, y2: RULER_Y, stroke: c.textMuted, 'stroke-width': 1.5 }),
      );
      for (const x of [x1, x2]) {
        root.appendChild(
          node('line', {
            x1: x,
            y1: RULER_Y - RULER_TICK,
            x2: x,
            y2: RULER_Y + RULER_TICK,
            stroke: c.textMuted,
            'stroke-width': 1.5,
          }),
        );
      }
      root.appendChild(
        textNode(
          tr('label.gapSpan', 'gap {gap}', { gap }),
          { x: (x1 + x2) / 2, y: RULER_LABEL_Y, 'text-anchor': 'middle' },
          fontSizes.sm,
          c.textMuted,
        ),
      );
    }

    function drawHeld(): void {
      if (heldValue === null || holeIndex === null) return;
      const cx = cellCx(holeIndex);
      root.appendChild(
        node('rect', {
          x: cx - HELD_W / 2,
          y: HELD_Y,
          width: HELD_W,
          height: HELD_H,
          rx: 6,
          fill: c.itemPivot,
          stroke: c.stateInk,
          'stroke-width': 1,
        }),
      );
      root.appendChild(
        textNode(
          String(heldValue),
          {
            x: cx,
            y: HELD_Y + HELD_H / 2,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-weight': 600,
          },
          fontSizes.md,
          c.stateInk,
          fonts.mono,
        ),
      );
      root.appendChild(
        node('line', {
          x1: cx,
          y1: HELD_Y + HELD_H,
          x2: cx,
          y2: CELL_Y,
          stroke: c.itemPivot,
          'stroke-width': 2,
        }),
      );
    }

    function cellFill(i: number): string {
      switch (cellStates[i]) {
        case 'comparing':
          return c.itemComparing;
        case 'shifting':
          return c.itemSwapping;
        case 'sorted':
          return c.itemSorted;
        default:
          return c.itemDefault;
      }
    }

    function cellInk(i: number): string {
      switch (cellStates[i]) {
        case 'comparing':
        case 'shifting':
          return c.stateInk;
        case 'sorted':
          return c.textInverse;
        default:
          return c.text;
      }
    }

    function drawCells(): void {
      for (let i = 0; i < n; i++) {
        const isHole = holeIndex === i;
        root.appendChild(
          node('rect', {
            x: cellX(i),
            y: CELL_Y,
            width: CELL_W,
            height: CELL_H,
            rx: 5,
            fill: isHole ? c.bg : cellFill(i),
            stroke: isHole ? c.ghostOutline : c.border,
            'stroke-width': isHole ? 1.5 : 1,
            ...(isHole ? { 'stroke-dasharray': '4 3' } : {}),
          }),
        );
        if (!isHole) {
          root.appendChild(
            textNode(
              String(values[i]),
              {
                x: cellCx(i),
                y: CELL_Y + CELL_H / 2,
                'text-anchor': 'middle',
                'dominant-baseline': 'central',
              },
              fontSizes.lg,
              cellInk(i),
              fonts.mono,
            ),
          );
        }
        root.appendChild(
          textNode(
            String(i),
            { x: cellCx(i), y: INDEX_Y, 'text-anchor': 'middle' },
            fontSizes.xs,
            c.textMuted,
            fonts.mono,
          ),
        );
      }
    }

    function drawShiftArrow(): void {
      if (shiftFrom === null || shiftTo === null) return;
      const x1 = cellCx(shiftFrom);
      const x2 = cellCx(shiftTo);
      const dir = x2 >= x1 ? 1 : -1;
      const tip = x2 - dir * 3;
      root.appendChild(
        node('line', {
          x1,
          y1: ARROW_Y,
          x2: tip,
          y2: ARROW_Y,
          stroke: c.itemSwapping,
          'stroke-width': 2,
        }),
      );
      root.appendChild(
        node('path', {
          d: `M ${x2} ${ARROW_Y} L ${tip - dir * 5} ${ARROW_Y - 4} L ${tip - dir * 5} ${ARROW_Y + 4} Z`,
          fill: c.itemSwapping,
        }),
      );
    }

    function drawChains(): void {
      if (chains.length === 0) return;
      for (let ci = 0; ci < chains.length; ci++) {
        const chain = chains[ci];
        const color = chainPalette[ci % Math.max(chainPalette.length, 1)] ?? c.textMuted;
        const dim = activeChain !== null && activeChain !== ci;
        const opacity = dim ? DIM_OPACITY : '1';

        for (const i of chain) {
          root.appendChild(
            node('rect', {
              x: cellX(i),
              y: CHAIN_TICK_Y,
              width: CELL_W,
              height: CHAIN_TICK_H,
              rx: 1.5,
              fill: color,
              opacity,
            }),
          );
        }
        for (let k = 0; k + 1 < chain.length; k++) {
          const xa = cellCx(chain[k]);
          const xb = cellCx(chain[k + 1]);
          const top = CHAIN_TICK_Y + CHAIN_TICK_H;
          root.appendChild(
            node('path', {
              d: `M ${xa} ${top} Q ${(xa + xb) / 2} ${CHAIN_ARC_BOTTOM * 2 - top} ${xb} ${top}`,
              fill: 'none',
              stroke: color,
              'stroke-width': dim ? 1 : 1.8,
              opacity,
            }),
          );
        }
      }
    }

    function drawBar(
      y: number,
      label: string,
      segments: number[],
      total: number,
      fill: string,
    ): void {
      root.appendChild(
        textNode(
          label,
          { x: BAR_X - 12, y: y + BAR_H / 2, 'text-anchor': 'end', 'dominant-baseline': 'central' },
          fontSizes.xs,
          c.textMuted,
        ),
      );
      const unit = BAR_MAX_W / Math.max(baselineShifts, total, 1);
      let x = BAR_X;
      for (const seg of segments) {
        const w = seg * unit;
        if (w <= 0) continue;
        root.appendChild(node('rect', { x, y, width: w, height: BAR_H, rx: 2, fill }));
        // 라운드 사이를 2px 띄워 어느 라운드가 얼마를 냈는지 덩이로 읽히게 한다.
        x += w + 2;
      }
      root.appendChild(
        textNode(
          String(total),
          { x: x + 6, y: y + BAR_H / 2, 'dominant-baseline': 'central', 'font-weight': 600 },
          fontSizes.md,
          fill,
          fonts.mono,
        ),
      );
    }

    function drawLedger(): void {
      root.appendChild(
        node('line', {
          x1: PAD_X,
          y1: DIVIDER_Y,
          x2: W - PAD_X,
          y2: DIVIDER_Y,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      const shellTotal = roundShifts.reduce((a, b) => a + b, 0);
      drawBar(
        BAR_A_Y,
        tr('label.shiftsWithGaps', 'Shifts, with gaps'),
        roundShifts,
        shellTotal,
        c.text,
      );
      drawBar(
        BAR_B_Y,
        tr('label.shiftsNeighbourOnly', 'Shifts, gap 1 only'),
        [baselineShifts],
        baselineShifts,
        c.textMuted,
      );
    }

    function render(): void {
      while (root.firstChild !== null) root.removeChild(root.firstChild);
      drawCaption();
      drawRuler();
      drawHeld();
      drawCells();
      drawShiftArrow();
      drawChains();
      drawLedger();
    }

    render();

    return {
      setData(next: number[]): void {
        values = [...next];
        n = values.length;
        cellStates = new Array<ShellSortCellState>(n).fill(null);
        const rowW = n > 0 ? n * CELL_W + (n - 1) * CELL_GAP : 0;
        originX = Math.max(PAD_X, (W - rowW) / 2);
        chainPalette = categorical(Math.max(1, Math.floor(n / 2)), 'vivid');
        render();
      },

      setCaption(text: string): void {
        caption = text;
        render();
      },

      setBaseline(shifts: number): void {
        baselineShifts = shifts;
        render();
      },

      setGap(nextGap: number, nextChains: number[][]): void {
        gap = nextGap;
        chains = nextChains.map((chain) => [...chain]);
        activeChain = null;
        roundShifts = [...roundShifts, 0];
        render();
      },

      setActiveChain(chainIndex: number | null): void {
        activeChain = chainIndex;
        render();
      },

      setHold(index: number | null, value: number | null): void {
        holeIndex = index;
        heldValue = value;
        render();
      },

      setHole(index: number | null): void {
        holeIndex = index;
        render();
      },

      setValue(index: number, value: number): void {
        if (index >= 0 && index < n) values[index] = value;
        render();
      },

      setCellState(index: number, state: ShellSortCellState): void {
        if (index >= 0 && index < n) cellStates[index] = state;
        render();
      },

      clearCellStates(): void {
        cellStates = cellStates.map(() => null);
        render();
      },

      setShiftArrow(from: number | null, to: number | null): void {
        shiftFrom = from;
        shiftTo = to;
        render();
      },

      addShift(): void {
        if (roundShifts.length === 0) roundShifts = [0];
        roundShifts[roundShifts.length - 1] += 1;
        render();
      },

      /** 집은 값 · 구멍 · 이동 화살표 · 활성 사슬을 한꺼번에 거둔다. */
      clearFocus(): void {
        holeIndex = null;
        heldValue = null;
        shiftFrom = null;
        shiftTo = null;
        activeChain = null;
        render();
      },

      reset(): void {
        gap = 0;
        chains = [];
        activeChain = null;
        holeIndex = null;
        heldValue = null;
        cellStates = cellStates.map(() => null);
        shiftFrom = null;
        shiftTo = null;
        baselineShifts = 0;
        roundShifts = [];
        caption = '';
        render();
      },

      destroy(): void {
        root.remove();
      },
    };
  },
};
