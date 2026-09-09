/**
 * 보간 탐색 전용 stage view.
 *
 * 화면이 말하는 것은 셋이다.
 *
 *   1. **겨누는 식** — 조각이 자와 낙하로 그린 그 겨눔을 여기서는 **식 그대로**
 *      보인다. 이 완제품이 조각과 다른 지점이 그것이고, 코드 패널의 `mid = …`
 *      한 줄과 화면의 수치가 같은 것을 가리킨다. 틀(template) · 값을 넣은 꼴 ·
 *      줄여 나간 꼴 세 줄이 위에서 아래로 쌓인다.
 *   2. **배열** — 열두 칸. 살아 있는 구간 `[lo..hi]` 만 또렷하고 버린 자리는
 *      흐리다. 겨눈 칸이 물들고, 찾으면 그 칸이 확정된다.
 *   3. **두 트랙** — 겨눈 자리와 반씩 접어 짚은 자리를 같은 열 좌표 위에
 *      나란히 찍는다. 1 과 3 이 같은 가로줄에서 견줘지는 것이 이 화면의 값이다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 자료가 열두 칸으로 고정이고 트랙
 * 마커는 겹치지 않으므로 높이를 다시 잴 일이 없다.
 *
 * 타이머를 쓰지 않는다. 모든 메서드는 상태를 고치고 곧바로 다시 그린다.
 * `destroy()` 는 붙인 노드 하나를 떼는 것이 전부다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 760;
const H = 318;

/** 왼쪽 라벨 자리 · 오른쪽 걸음 수 자리. 배열과 두 트랙이 같은 열 좌표를 쓴다. */
const LANE_X0 = 96;
const LANE_X1 = W - 60;

const FORMULA_Y0 = 30;
const FORMULA_H = 86;

const BAND_Y = 146;
const BAND_H = 52;
const CELL_Y = 150;
const CELL_H = 44;
const CELL_W_MAX = 48;

const TRACK_AIM_Y = 240;
const TRACK_HALVE_Y = 286;
const MARK_R = 11;

/**
 * 두 방법을 갈라 보이는 색.
 *
 * `categorical(2, 'vivid')` 의 두 자리를 쓴다 (S-view 결정 트리 3 — n 개
 * 카테고리 식별). 겨눔에 파랑(1) 을 주는 것은 견줌 상태의 주황
 * (`itemComparing`) 과 한 화면에서 갈려야 하기 때문이다.
 */
const TRACK_TONE = 'vivid' as const;
const AIM_HUE = 1;
const HALVE_HUE = 0;

/** 코드의 변수 이름 그대로 새기는 표식 (C10 판정 2). 번역하지 않는다. */
const MARK_LO = 'lo';
const MARK_HI = 'hi';
const MARK_TARGET = 'target';

/** 겨누는 식의 틀. 코드 패널의 그 한 줄과 같은 표기다 (C10 판정 3 — 수식 표기). */
const FORMULA_TEMPLATE = 'mid = lo + ((target - arr[lo]) * (hi - lo)) // (arr[hi] - arr[lo])';

export type InterpolationCellState = 'probing' | 'found' | null;

/** 겨눔 한 번의 셈. 화면의 수는 전부 알고리즘이 셈해 넘겨준 것이다. */
export type InterpolationProbeFormula = {
  lo: number;
  hi: number;
  target: number;
  loValue: number;
  hiValue: number;
  numer: number;
  denom: number;
  offset: number;
  mid: number;
};

/** 트랙 위의 마커 하나. */
export type InterpolationTrackMark = { index: number; step: number; value: number };

type TrackKind = 'aim' | 'halve';

function attr(node: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
}

function make<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  attr(node, attrs);
  return node;
}

/** mono 글꼴의 글자 폭 근사 — 식을 가운데 맞추고 칩을 붙일 자리를 잡는 데 쓴다. */
function monoWidth(text: string, size: number): number {
  return text.length * size * 0.6;
}

function px(token: string): number {
  return Number.parseFloat(token);
}

export const interpolationSearchStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const trackColors = categorical(2, TRACK_TONE);
    const aimColor = trackColors[AIM_HUE] ?? colors.text;
    const halveColor = trackColors[HALVE_HUE] ?? colors.textMuted;

    let values: number[] = [];
    let target = 0;
    let lo = 0;
    let hi = -1;
    let formula: InterpolationProbeFormula | null = null;
    let caption = '';
    let aimMarks: InterpolationTrackMark[] = [];
    let halveMarks: InterpolationTrackMark[] = [];
    let activeTrack: TrackKind | null = 'aim';
    const cellStates = new Map<number, InterpolationCellState>();

    const root = make('g', {});
    svg.appendChild(root);

    const slotW = (): number => (values.length > 0 ? (LANE_X1 - LANE_X0) / values.length : 0);
    const cx = (i: number): number => LANE_X0 + slotW() * (i + 0.5);

    function text(
      value: string,
      x: number,
      y: number,
      opts: {
        size?: string;
        fill?: string;
        anchor?: 'start' | 'middle' | 'end';
        family?: string;
        weight?: number;
      } = {},
    ): SVGTextElement {
      const node = make('text', {
        x,
        y,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? colors.text,
      });
      if (opts.weight !== undefined) node.setAttribute('font-weight', String(opts.weight));
      node.textContent = value;
      return node;
    }

    function drawFormula(g: SVGGElement): void {
      g.appendChild(
        make('rect', {
          x: 24,
          y: FORMULA_Y0,
          width: W - 48,
          height: FORMULA_H,
          rx: px(radii.md),
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const cxMid = W / 2;
      g.appendChild(
        text(FORMULA_TEMPLATE, cxMid, FORMULA_Y0 + 24, {
          family: fonts.mono,
          size: fontSizes.sm,
          fill: colors.textMuted,
        }),
      );

      if (formula === null) return;

      const filled =
        `mid = ${formula.lo} + ((${formula.target} - ${formula.loValue})` +
        ` * (${formula.hi} - ${formula.lo})) // (${formula.hiValue} - ${formula.loValue})`;
      g.appendChild(
        text(filled, cxMid, FORMULA_Y0 + 48, { family: fonts.mono, size: fontSizes.sm }),
      );

      // 줄여 나간 꼴 + 결과 칩. 칩은 겨눈 칸과 같은 강조색이라 눈이 이어진다.
      const reduced = `= ${formula.lo} + ${formula.numer} // ${formula.denom}  =`;
      const size = px(fontSizes.sm);
      const chipLabel = `${formula.mid}`;
      const chipW = Math.max(28, monoWidth(chipLabel, size) + 16);
      const reducedW = monoWidth(reduced, size);
      const totalW = reducedW + 8 + chipW;
      const startX = cxMid - totalW / 2;
      g.appendChild(
        text(reduced, startX, FORMULA_Y0 + 74, {
          family: fonts.mono,
          size: fontSizes.sm,
          anchor: 'start',
        }),
      );
      g.appendChild(
        make('rect', {
          x: startX + reducedW + 8,
          y: FORMULA_Y0 + 60,
          width: chipW,
          height: 20,
          rx: px(radii.sm),
          fill: colors.itemPivot,
        }),
      );
      g.appendChild(
        text(chipLabel, startX + reducedW + 8 + chipW / 2, FORMULA_Y0 + 74, {
          family: fonts.mono,
          size: fontSizes.sm,
          fill: colors.stateInk,
          weight: 600,
        }),
      );
    }

    function drawArray(g: SVGGElement): void {
      if (values.length === 0) return;
      const slot = slotW();
      const cellW = Math.min(CELL_W_MAX, slot - 6);

      // 살아 있는 구간을 띠로 깐다. 버린 자리는 흐려질 뿐 사라지지 않는다.
      if (lo <= hi) {
        g.appendChild(
          make('rect', {
            x: cx(lo) - slot / 2,
            y: BAND_Y,
            width: slot * (hi - lo + 1),
            height: BAND_H,
            rx: px(radii.sm),
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        g.appendChild(
          text(MARK_LO, cx(lo), BAND_Y - 8, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
        g.appendChild(
          text(MARK_HI, cx(hi), BAND_Y - 8, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
      }

      // 찾는 값 — 코드의 변수 이름 그대로 왼쪽 여백에 새긴다.
      g.appendChild(
        text(MARK_TARGET, LANE_X0 - 14, CELL_Y + 16, {
          family: fonts.mono,
          size: fontSizes.xs,
          anchor: 'end',
          fill: colors.textMuted,
        }),
      );
      g.appendChild(
        text(`${target}`, LANE_X0 - 14, CELL_Y + 36, {
          family: fonts.mono,
          size: fontSizes.lg,
          anchor: 'end',
          weight: 600,
        }),
      );

      for (let i = 0; i < values.length; i += 1) {
        const alive = i >= lo && i <= hi;
        const state = cellStates.get(i) ?? null;
        const cell = make('g', { opacity: alive || state !== null ? 1 : 0.32 });

        let fill = colors.itemDefault;
        let ink = colors.text;
        if (state === 'probing') {
          fill = colors.itemComparing;
          ink = colors.stateInk;
        } else if (state === 'found') {
          fill = colors.itemPivot;
          ink = colors.stateInk;
        }

        cell.appendChild(
          make('rect', {
            x: cx(i) - cellW / 2,
            y: CELL_Y,
            width: cellW,
            height: CELL_H,
            rx: px(radii.sm),
            fill,
            stroke: state === null ? colors.border : colors.text,
            'stroke-width': state === null ? 1 : 2,
          }),
        );
        cell.appendChild(
          text(`${values[i]}`, cx(i), CELL_Y + 28, {
            family: fonts.mono,
            size: fontSizes.md,
            fill: ink,
          }),
        );
        cell.appendChild(
          text(`${i}`, cx(i), CELL_Y + CELL_H + 18, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
        g.appendChild(cell);
      }
    }

    function drawTrack(
      g: SVGGElement,
      y: number,
      label: string,
      marks: InterpolationTrackMark[],
      color: string,
      active: boolean,
    ): void {
      g.appendChild(
        make('line', {
          x1: LANE_X0,
          y1: y,
          x2: LANE_X1,
          y2: y,
          stroke: colors.border,
          'stroke-width': active ? 2 : 1,
        }),
      );

      if (values.length > 0) {
        for (let i = 0; i < values.length; i += 1) {
          g.appendChild(
            make('line', {
              x1: cx(i),
              y1: y - 4,
              x2: cx(i),
              y2: y + 4,
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
        }
      }

      g.appendChild(
        text(label, LANE_X0 - 14, y + 4, {
          anchor: 'end',
          size: fontSizes.sm,
          fill: active ? colors.text : colors.textMuted,
          weight: active ? 600 : 400,
        }),
      );

      for (const m of marks) {
        g.appendChild(
          make('circle', {
            cx: cx(m.index),
            cy: y,
            r: MARK_R,
            fill: color,
            stroke: colors.text,
            'stroke-width': 1,
          }),
        );
        g.appendChild(
          text(`${m.step}`, cx(m.index), y + 4, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: colors.stateInk,
            weight: 600,
          }),
        );
        g.appendChild(
          text(`${m.value}`, cx(m.index), y + MARK_R + 13, {
            family: fonts.mono,
            size: fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
      }

      if (marks.length > 0) {
        const chipW = 30;
        g.appendChild(
          make('rect', {
            x: LANE_X1 + 14,
            y: y - 12,
            width: chipW,
            height: 24,
            rx: px(radii.sm),
            fill: color,
          }),
        );
        g.appendChild(
          text(`${marks.length}`, LANE_X1 + 14 + chipW / 2, y + 6, {
            family: fonts.mono,
            size: fontSizes.md,
            fill: colors.stateInk,
            weight: 600,
          }),
        );
      }
    }

    function render(): void {
      root.textContent = '';
      const g = make('g', {});

      if (caption.length > 0) {
        g.appendChild(text(caption, W / 2, 20, { size: fontSizes.md }));
      }
      drawFormula(g);
      drawArray(g);
      drawTrack(
        g,
        TRACK_AIM_Y,
        tr('label.aimTrack', 'Aiming'),
        aimMarks,
        aimColor,
        activeTrack === 'aim',
      );
      drawTrack(
        g,
        TRACK_HALVE_Y,
        tr('label.halveTrack', 'Halving'),
        halveMarks,
        halveColor,
        activeTrack === 'halve',
      );

      root.appendChild(g);
    }

    render();

    return {
      setData(next: number[], nextTarget: number): void {
        values = [...next];
        target = nextTarget;
        lo = 0;
        hi = values.length - 1;
        render();
      },

      setRange(nextLo: number, nextHi: number): void {
        lo = nextLo;
        hi = nextHi;
        render();
      },

      setFormula(next: InterpolationProbeFormula | null): void {
        formula = next;
        render();
      },

      setCellState(index: number, state: InterpolationCellState): void {
        if (state === null) cellStates.delete(index);
        else cellStates.set(index, state);
        render();
      },

      setCaption(next: string): void {
        caption = next;
        render();
      },

      addAimMark(mark: InterpolationTrackMark): void {
        aimMarks = [...aimMarks, mark];
        render();
      },

      addHalveMark(mark: InterpolationTrackMark): void {
        halveMarks = [...halveMarks, mark];
        render();
      },

      setActiveTrack(track: TrackKind | null): void {
        activeTrack = track;
        render();
      },

      reset(): void {
        lo = 0;
        hi = values.length - 1;
        formula = null;
        caption = '';
        aimMarks = [];
        halveMarks = [];
        activeTrack = 'aim';
        cellStates.clear();
        render();
      },

      destroy(): void {
        // 타이머도 옵저버도 없다. 붙인 노드 하나를 떼는 것이 전부다.
        root.remove();
      },
    };
  },
};
