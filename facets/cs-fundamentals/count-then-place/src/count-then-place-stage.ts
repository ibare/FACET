/**
 * count-then-place stage — 눈금이 쌓였다가 자리로 바뀌는 화면.
 *
 * 세로로 읽는다.
 *
 * ```
 *          ▼                                  읽는 자리 (커서)
 *   [2][0][1][2][0][2]                        입력
 *          ▏  ▏  ▏                            눈금이 값의 열로 떨어져 쌓인다
 *      ═   ═   ═
 *      0   1   2                              값의 종류
 *    ┌ 0 ┐   ┌ 2 ┐ ┌ 3 ┐                      굳은 시작 자리 (칩)
 *   ══════ ══ ════════                        눈금이 누워 구역이 된다
 *   [ ][ ][ ][ ][ ][ ]                        결과
 *    0  1  2  3  4  5                          자리 번호
 * ```
 *
 * 눈금 하나의 가로 폭은 결과 칸의 폭과 같다. 눈금 하나가 자리 하나라는 것이
 * 크기로 드러나야, 세로로 쌓인 더미가 가로로 누워 구역이 되는 장면이 셈이 아니라
 * 같은 것의 방향만 바뀐 것으로 읽힌다.
 *
 * 화면 어디에도 두 값을 나란히 놓고 견주는 장면이 없다. 그것이 이 조각의 주장이다.
 *
 * ── 타이머
 *
 * 이동은 CSS transition 이고, 끝나는 시점을 알기 위해 유한 `setTimeout` 을 건다.
 * 스스로 다음 회차를 예약하는 루프는 없다. 걸어 둔 타이머는 `timers` 에 모아
 * `destroy()` 에서 전부 거둔다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
} from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 이 stage 가 그리는 모델. projector 가 좁혀서 넘긴다. */
export type CountThenPlaceModel = {
  values: number[];
  range: number;
};

export type CountTickStep = { index: number; value: number; height: number };
export type BucketSettleStep = { value: number; start: number; count: number };
export type PlaceStep = { index: number; value: number; slot: number; bucketFull: boolean };

// ── 세로 좌표. 마운트 뒤 바뀌지 않는다 (S-view).
const CURSOR_Y = 12;
const CURSOR_W = 14;
const CURSOR_H = 11;
const INPUT_Y = 26;
const CELL_H = 38;
const TICK_BIRTH_Y = 68;
const TALLY_TOP = 76;
const TALLY_BASE = 156;
const KIND_LABEL_Y = 174;
const CHIP_Y = 186;
const CHIP_H = 20;
const CHIP_W = 30;
const BAND_Y = 212;
const RESULT_Y = 228;
const SLOT_LABEL_Y = 281;
const CAPTION_Y = 305;
const STAGE_H = 320;

// ── 가로. 상수는 상한만 두고 실제 크기는 캔버스에서 역산한다 (S-piece).
const CELL_MAX_W = 84;
const SIDE_MIN = 30;
const CELL_INSET = 2;

// ── 이동 시간.
const MOVE_MS = 300;
const CHIP_MS = 180;
const CURSOR_MS = 200;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function readModel(source: unknown): CountThenPlaceModel | null {
  const raw = source as { values?: unknown; range?: unknown } | undefined;
  if (!Array.isArray(raw?.values)) return null;
  const values = raw.values.filter((v): v is number => typeof v === 'number');
  if (values.length !== raw.values.length || values.length === 0) return null;
  const range = typeof raw.range === 'number' && raw.range > 0
    ? raw.range
    : Math.max(...values) + 1;
  return { values, range };
}

export const countThenPlaceStageView: CanvasView = {
  canvas: { height: STAGE_H },

  // 러너가 붙여 준 캔버스는 컨테이너에 이미 달려 있다. 컨테이너를 비우지 않는다 (S-view).
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const colors = getColors(params.theme);
    const svg = params.canvas;

    const root = svgEl('g', {});
    svg.appendChild(root);

    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          resolve();
          return;
        }
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });

    /** ms 가 0 이면 전환을 끄고 그 자리로 튄다 (되감기·초기 배치용). */
    const setTransition = (node: SVGGraphicsElement, ms: number): void => {
      node.style.transition = ms > 0
        ? `transform ${ms}ms cubic-bezier(0.4, 0, 0.2, 1), opacity ${ms}ms ease`
        : 'none';
      if (ms <= 0) node.getBoundingClientRect();
    };

    const moveTo = (node: SVGGraphicsElement, x: number, y: number, ms: number): void => {
      setTransition(node, ms);
      node.style.transform = `translate(${x}px, ${y}px)`;
    };

    const fade = (node: SVGGraphicsElement, opacity: number, ms: number): void => {
      setTransition(node, ms);
      node.style.opacity = String(opacity);
    };

    // ── 현재 모델과 그에 딸린 요소들.
    let model: CountThenPlaceModel = { values: [], range: 0 };
    let captionText = '';

    let cellW = CELL_MAX_W;
    let tileW = CELL_MAX_W - CELL_INSET * 2;
    let originX = 0;
    let tickPitch = 13;
    let tickH = 10;

    let cursor: SVGPolygonElement | null = null;
    let caption: SVGTextElement | null = null;
    let tiles: SVGGElement[] = [];
    let ticks: SVGRectElement[] = [];
    let chips: SVGGElement[] = [];
    let chipLabels: SVGTextElement[] = [];
    /** 값별로 쌓인 눈금 — 쌓인 순서가 곧 그 값 구역 안의 자리 순서다. */
    let ticksByValue: SVGRectElement[][] = [];

    const cellX = (index: number): number => originX + index * cellW + CELL_INSET;
    const cellCenter = (index: number): number => originX + index * cellW + cellW / 2;
    const kindCenter = (value: number): number =>
      Math.round((PIECE_CANVAS_W * (2 * value + 1)) / (2 * Math.max(1, model.range)));
    const kindX = (value: number): number => Math.round(kindCenter(value) - tileW / 2);
    const tickY = (height: number): number => TALLY_BASE - tickH - height * tickPitch;

    const build = (): void => {
      while (root.firstChild) root.removeChild(root.firstChild);
      tiles = [];
      ticks = [];
      chips = [];
      chipLabels = [];
      ticksByValue = Array.from({ length: model.range }, () => []);

      const n = model.values.length;
      if (n === 0) return;

      cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - SIDE_MIN * 2) / n));
      tileW = cellW - CELL_INSET * 2;
      originX = Math.round((PIECE_CANVAS_W - cellW * n) / 2);
      // 한 값에 전부 몰려도 더미가 위로 넘치지 않게 간격을 역산한다. 세로는
      // 마운트 뒤 바뀌지 않으므로 넘치면 간격을 줄이는 쪽이다 (S-view).
      tickPitch = Math.min(16, Math.floor((TALLY_BASE - TALLY_TOP) / n));
      tickH = Math.max(6, tickPitch - 3);

      const tints = categorical(model.range, 'pastel');
      const inks = categorical(model.range, 'vivid');

      // 결과 칸 — 아직 비어 있는 자리.
      for (let i = 0; i < n; i += 1) {
        root.appendChild(
          svgEl('rect', {
            x: cellX(i),
            y: RESULT_Y,
            width: tileW,
            height: CELL_H,
            rx: 5,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1.5,
            'stroke-dasharray': '4 4',
          }),
        );
        const slotLabel = svgEl('text', {
          x: cellCenter(i),
          y: SLOT_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        slotLabel.textContent = String(i);
        root.appendChild(slotLabel);
      }

      // 값의 종류 — 눈금이 쌓일 열.
      for (let v = 0; v < model.range; v += 1) {
        const base = svgEl('rect', {
          x: kindX(v),
          y: TALLY_BASE,
          width: tileW,
          height: 2,
          fill: colors.border,
        });
        root.appendChild(base);
        const label = svgEl('text', {
          x: kindCenter(v),
          y: KIND_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
        });
        label.textContent = String(v);
        root.appendChild(label);
      }

      // 눈금 — 입력 하나에 하나씩. 처음에는 제 입력 칸 아래에 숨어 있다.
      for (let i = 0; i < n; i += 1) {
        const tick = svgEl('rect', {
          x: 0,
          y: 0,
          width: tileW,
          height: tickH,
          rx: 3,
          fill: inks[model.values[i]] ?? colors.text,
        });
        tick.style.opacity = '0';
        moveTo(tick, cellX(i), TICK_BIRTH_Y, 0);
        root.appendChild(tick);
        ticks.push(tick);
      }

      // 시작 자리 칩 — 굳는 순간에 열에서 태어나 구역 앞에 선다.
      for (let v = 0; v < model.range; v += 1) {
        const chip = svgEl('g', {});
        chip.style.opacity = '0';
        chip.appendChild(
          svgEl('rect', {
            x: 0,
            y: 0,
            width: CHIP_W,
            height: CHIP_H,
            rx: 6,
            fill: inks[v] ?? colors.text,
          }),
        );
        const chipLabel = svgEl('text', {
          x: CHIP_W / 2,
          y: CHIP_H / 2 + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.stateInk,
        });
        chip.appendChild(chipLabel);
        moveTo(chip, Math.round(kindCenter(v) - CHIP_W / 2), CHIP_Y, 0);
        root.appendChild(chip);
        chips.push(chip);
        chipLabels.push(chipLabel);
      }

      // 입력 타일 — 놓기 국면에서 이 타일이 그대로 결과 자리로 옮겨간다.
      for (let i = 0; i < n; i += 1) {
        const value = model.values[i];
        const tile = svgEl('g', {});
        tile.appendChild(
          svgEl('rect', {
            x: 0,
            y: 0,
            width: tileW,
            height: CELL_H,
            rx: 5,
            fill: tints[value] ?? colors.bgSubtle,
            stroke: colors.border,
          }),
        );
        const text = svgEl('text', {
          x: tileW / 2,
          y: CELL_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: colors.stateInk,
        });
        text.textContent = String(value);
        tile.appendChild(text);
        moveTo(tile, cellX(i), INPUT_Y, 0);
        root.appendChild(tile);
        tiles.push(tile);
      }

      // 읽는 자리를 가리키는 커서.
      cursor = svgEl('polygon', {
        points: `0,0 ${CURSOR_W},0 ${CURSOR_W / 2},${CURSOR_H}`,
        fill: colors.text,
      });
      moveTo(cursor, Math.round(cellCenter(0) - CURSOR_W / 2), CURSOR_Y, 0);
      root.appendChild(cursor);

      caption = svgEl('text', {
        x: PIECE_CANVAS_W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      caption.textContent = captionText;
      root.appendChild(caption);
    };

    const pointCursorAt = (index: number, ms: number): void => {
      if (!cursor) return;
      moveTo(cursor, Math.round(cellCenter(index) - CURSOR_W / 2), CURSOR_Y, ms);
    };

    const initial = readModel(params.initialData);
    if (initial) model = initial;
    build();

    const instance: ViewInstance = {
      init(next: CountThenPlaceModel): void {
        model = { values: [...next.values], range: next.range };
        build();
      },

      setCaption(text: string): void {
        captionText = text;
        if (caption) caption.textContent = text;
      },

      /** 값을 하나 읽고, 그 값의 열에 눈금을 하나 쌓는다. */
      async countTick(step: CountTickStep): Promise<void> {
        const tick = ticks[step.index];
        if (!tick) return;
        pointCursorAt(step.index, CURSOR_MS);
        fade(tick, 1, MOVE_MS / 2);
        moveTo(tick, kindX(step.value), tickY(step.height - 1), MOVE_MS);
        const column = ticksByValue[step.value];
        if (column) column.push(tick);
        await wait(MOVE_MS);
      },

      /** 쌓인 더미가 눕는다. 눈금 하나가 자리 하나가 되고, 맨 앞이 시작 번호다. */
      async settleBucket(step: BucketSettleStep): Promise<void> {
        const column = ticksByValue[step.value] ?? [];
        for (let h = 0; h < column.length; h += 1) {
          const tick = column[h];
          moveTo(tick, cellX(step.start + h), BAND_Y, MOVE_MS);
        }
        const chip = chips[step.value];
        const chipLabel = chipLabels[step.value];
        if (chip && chipLabel) {
          if (step.count === 0) {
            // 한 번도 안 나온 값은 구역이 없다. 칩도 서지 않는다.
            chipLabel.textContent = '';
          } else {
            chipLabel.textContent = String(step.start);
            fade(chip, 1, MOVE_MS / 2);
            moveTo(chip, Math.round(cellCenter(step.start) - CHIP_W / 2), CHIP_Y, MOVE_MS);
          }
        }
        await wait(MOVE_MS);
      },

      /** 값이 제 번호로 곧장 날아가 앉는다. 앉으면 번호가 하나 오른다. */
      async placeValue(step: PlaceStep): Promise<void> {
        const tile = tiles[step.index];
        if (!tile) return;
        pointCursorAt(step.index, CURSOR_MS);
        moveTo(tile, cellX(step.slot), RESULT_Y, MOVE_MS);
        await wait(MOVE_MS);

        const chip = chips[step.value];
        const chipLabel = chipLabels[step.value];
        if (chip && chipLabel) {
          if (step.bucketFull) {
            // 구역을 다 썼다. 칩은 제 구역 안으로 잦아든다.
            fade(chip, 0, CHIP_MS);
            moveTo(chip, Math.round(cellCenter(step.slot) - CHIP_W / 2), RESULT_Y + 8, CHIP_MS);
          } else {
            chipLabel.textContent = String(step.slot + 1);
            moveTo(chip, Math.round(cellCenter(step.slot + 1) - CHIP_W / 2), CHIP_Y, CHIP_MS);
          }
        }
        await wait(CHIP_MS);
      },

      /** 다 놓았다. 커서는 할 일이 없으므로 물러난다. */
      signalDone(): void {
        if (cursor) fade(cursor, 0, CHIP_MS);
      },

      /** 처음 화면으로. 전환 없이 그 자리로 되돌린다. */
      rewind(): void {
        build();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        root.remove();
      },
    };

    return instance;
  },
};
