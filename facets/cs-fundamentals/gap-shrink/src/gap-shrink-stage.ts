/**
 * gap-shrink-stage — 보폭이 좁아지는 것을 보이는 캔버스.
 *
 * 화면의 뼈대는 셋이다.
 *   1. 값 칸 한 줄. 칸은 자리이고 숫자는 따로 떠서 자리를 옮긴다 — 멀리 견줄 때
 *      값이 여러 칸을 한 번에 건너뛰는 것이 이 조각의 동사다.
 *   2. 칸 아래의 보폭 자. 지금 견주는 두 끝을 재는 물건이라 폭이 곧 간격이며,
 *      라운드가 바뀌면 그 폭이 옆칸 하나로 줄어든다.
 *   3. 아래 장부 두 줄. 보폭을 줄여 온 쪽과 처음부터 옆칸만 견준 쪽의 견줌·이동
 *      횟수. 이동 횟수의 길이 차이가 이 조각의 근거다.
 *
 * 세로는 mount 전에 canvas 선언으로 정해지고 그 뒤 바뀌지 않는다 (S-view).
 *
 * 타이머 — rAF 만 쓰고 전부 `rafIds` 에 담아 `destroy()` 에서 취소한다. 스스로
 * 다음 회차를 예약하는 무한 루프는 두지 않는다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 256;

// 가로 — 상수는 상한만 두고 실제 크기는 캔버스에서 역산한다 (S-piece).
const CELL_MAX_W = 92;
const SIDE_MIN = 30;
const SLOT_INSET = 5;

// 세로 — 위에서부터 캡션 / 건너뛰는 길 / 칸 / 보폭 자 / 장부.
const CAPTION_Y = 18;
const CELL_TOP = 76;
const CELL_H = 48;
const CELL_MID = CELL_TOP + CELL_H / 2;
const BRACKET_Y = 140;
const TICK_TOP = 132;
const TICK_BOTTOM = 148;
const STRIDE_LABEL_Y = 164;
const DIVIDER_Y = 178;
const LEDGER_HEAD_Y = 192;
const LEDGER_ROW1_Y = 214;
const LEDGER_ROW2_Y = 238;

// 장부의 열.
const COL_COMPARES_X = 300;
const COL_MOVES_X = 372;
const PIP_X0 = 392;
const PIP_STEP = 16;
const PIP_R = 5;

// 지속시간. 걸음 하나는 여기에 stepMs 가 더해진다 (S-piece).
const GROW_MS = 380;
const SLIDE_MS = 190;
const FLASH_MS = 130;
const HOP_MS = 400;
const PIP_MS = 160;
const BASELINE_PIP_MS = 70;
const FADE_MS = 300;

/** 멀리 뛸수록 높이 뜬다 — 건너뛴 칸 수가 길이와 높이 양쪽으로 읽히게. */
const highApex = (gap: number): number => 26 + gap * 8;
const lowApex = (gap: number): number => 6 + gap * 2;

/** 아직 세지 않은 칸. 그래픽에 새긴 표식이라 번역하지 않는다 (C10). */
const NOT_YET = '—';

type SlotState = 'default' | 'comparing' | 'swapping' | 'sorted';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** 2차 베지어. t=0.5 에서 apex 만큼 솟는다. */
function arcAt(
  x0: number,
  x1: number,
  baseY: number,
  apex: number,
  t: number,
): { x: number; y: number } {
  const cx = (x0 + x1) / 2;
  const cy = baseY - apex * 2;
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * baseY + 2 * u * t * cy + t * t * baseY,
  };
}

export const gapShrinkStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const palette: Palette = getColors(params.theme);
    const slotRadius = parseInt(radii.md, 10);

    const data = (params.initialData ?? {}) as { values?: unknown; gaps?: unknown };
    const startValues = Array.isArray(data.values)
      ? data.values.filter((v): v is number => typeof v === 'number')
      : [];
    const roundCount = Array.isArray(data.gaps) ? data.gaps.length : 2;
    const roundInk = categorical(Math.max(2, roundCount), 'vivid');

    const n = Math.max(1, startValues.length);
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
    const originX = Math.round((W - n * cellW) / 2);
    const slotCenter = (i: number): number => originX + i * cellW + cellW / 2;

    // ── 뼈대
    const root = el('g');
    const bracketLayer = el('g');
    const slotLayer = el('g');
    const glyphLayer = el('g');
    const ledgerLayer = el('g');
    root.append(bracketLayer, slotLayer, glyphLayer, ledgerLayer);
    svg.appendChild(root);

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: palette.text,
    });
    root.appendChild(caption);

    // ── 보폭 자
    const bracket = el('g', { opacity: 0 });
    const bracketLine = el('line', {
      y1: BRACKET_Y,
      y2: BRACKET_Y,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
    const tickLeft = el('line', { y1: TICK_TOP, y2: TICK_BOTTOM, 'stroke-width': 2 });
    const tickRight = el('line', { y1: TICK_TOP, y2: TICK_BOTTOM, 'stroke-width': 2 });
    const strideLabel = el('text', {
      y: STRIDE_LABEL_Y,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    bracket.append(bracketLine, tickLeft, tickRight, strideLabel);
    bracketLayer.appendChild(bracket);

    // ── 칸(자리)과 숫자(값). 둘을 갈라 두어야 값만 자리를 건너뛸 수 있다.
    const slots: SVGRectElement[] = [];
    const slotState: SlotState[] = [];
    const glyphNodes: SVGTextElement[] = [];
    const occupant: SVGTextElement[] = [];

    for (let i = 0; i < n; i++) {
      const rect = el('rect', {
        x: originX + i * cellW + SLOT_INSET,
        y: CELL_TOP,
        width: cellW - SLOT_INSET * 2,
        height: CELL_H,
        rx: slotRadius,
        fill: palette.itemDefault,
        stroke: palette.border,
        'stroke-width': 1.5,
      });
      slotLayer.appendChild(rect);
      slots.push(rect);
      slotState.push('default');

      const glyph = el('text', {
        x: slotCenter(i),
        y: CELL_MID,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 600,
        fill: palette.text,
      });
      glyphLayer.appendChild(glyph);
      glyphNodes.push(glyph);
      occupant.push(glyph);
    }

    // ── 장부
    ledgerLayer.appendChild(
      el('line', {
        x1: originX,
        x2: originX + n * cellW,
        y1: DIVIDER_Y,
        y2: DIVIDER_Y,
        stroke: palette.border,
        'stroke-width': 1,
      }),
    );

    const label = (
      x: number,
      y: number,
      anchor: string,
      size: string,
      fill: string,
      family: string,
    ): SVGTextElement => {
      const node = el('text', {
        x,
        y,
        'text-anchor': anchor,
        'dominant-baseline': 'central',
        'font-family': family,
        'font-size': size,
        fill,
      });
      ledgerLayer.appendChild(node);
      return node;
    };

    label(COL_COMPARES_X, LEDGER_HEAD_Y, 'end', fontSizes.xs, palette.textMuted, fonts.body).textContent =
      tr('label.compares', 'compares');
    label(COL_MOVES_X, LEDGER_HEAD_Y, 'end', fontSizes.xs, palette.textMuted, fonts.body).textContent =
      tr('label.moves', 'moves');
    label(originX, LEDGER_ROW1_Y, 'start', fontSizes.sm, palette.text, fonts.body).textContent =
      tr('label.shrinkRun', 'stride shrinking');
    label(originX, LEDGER_ROW2_Y, 'start', fontSizes.sm, palette.textMuted, fonts.body).textContent =
      tr('label.nearOnly', 'neighbours only');

    const numeral = (y: number, x: number, fill: string): SVGTextElement => {
      const node = label(x, y, 'end', fontSizes.lg, fill, fonts.mono);
      node.setAttribute('font-weight', '600');
      return node;
    };

    const shrinkCompares = numeral(LEDGER_ROW1_Y, COL_COMPARES_X, palette.text);
    const shrinkMoves = numeral(LEDGER_ROW1_Y, COL_MOVES_X, palette.text);
    const nearCompares = numeral(LEDGER_ROW2_Y, COL_COMPARES_X, palette.textMuted);
    const nearMoves = numeral(LEDGER_ROW2_Y, COL_MOVES_X, palette.textMuted);

    const shrinkPips = el('g');
    const nearPips = el('g');
    ledgerLayer.append(shrinkPips, nearPips);

    // ── 시간
    const rafIds = new Set<number>();
    let destroyed = false;
    const canAnimate = typeof requestAnimationFrame === 'function';

    const tween = (ms: number, apply: (p: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || !canAnimate || ms <= 0) {
          apply(1);
          resolve();
          return;
        }
        const t0 = Date.now();
        let id = 0;
        const frame = (): void => {
          rafIds.delete(id);
          if (destroyed) {
            apply(1);
            resolve();
            return;
          }
          const p = Math.min(1, (Date.now() - t0) / ms);
          apply(easeInOut(p));
          if (p < 1) {
            id = requestAnimationFrame(frame);
            rafIds.add(id);
          } else {
            resolve();
          }
        };
        id = requestAnimationFrame(frame);
        rafIds.add(id);
      });

    const wait = (ms: number): Promise<void> => tween(ms, () => undefined);

    // ── 상태 칠하기
    const paintSlot = (i: number, state: SlotState): void => {
      slotState[i] = state;
      const rect = slots[i];
      const glyph = occupant[i];
      if (state === 'comparing') {
        rect.setAttribute('fill', palette.itemComparing);
        rect.setAttribute('stroke', palette.itemComparing);
        glyph.setAttribute('fill', palette.stateInk);
      } else if (state === 'swapping') {
        rect.setAttribute('fill', palette.itemSwapping);
        rect.setAttribute('stroke', palette.itemSwapping);
        glyph.setAttribute('fill', palette.stateInk);
      } else if (state === 'sorted') {
        rect.setAttribute('fill', palette.itemSorted);
        rect.setAttribute('stroke', palette.itemSorted);
        glyph.setAttribute('fill', palette.textInverse);
      } else {
        rect.setAttribute('fill', palette.itemDefault);
        rect.setAttribute('stroke', palette.border);
        glyph.setAttribute('fill', palette.text);
      }
    };

    const clearMarks = (): void => {
      for (let i = 0; i < n; i++) if (slotState[i] !== 'sorted') paintSlot(i, 'default');
    };

    // ── 보폭 자 놓기
    let spanLeft = slotCenter(0);
    let spanRight = slotCenter(0);

    const drawBracket = (x0: number, x1: number): void => {
      spanLeft = x0;
      spanRight = x1;
      bracketLine.setAttribute('x1', String(x0));
      bracketLine.setAttribute('x2', String(x1));
      tickLeft.setAttribute('x1', String(x0));
      tickLeft.setAttribute('x2', String(x0));
      tickRight.setAttribute('x1', String(x1));
      tickRight.setAttribute('x2', String(x1));
      strideLabel.setAttribute('x', String((x0 + x1) / 2));
    };

    const moveBracket = (left: number, right: number, ms: number): Promise<void> => {
      const from0 = spanLeft;
      const from1 = spanRight;
      const to0 = slotCenter(left);
      const to1 = slotCenter(right);
      return tween(ms, (p) => drawBracket(from0 + (to0 - from0) * p, from1 + (to1 - from1) * p));
    };

    const roundColor = (round: number): string => roundInk[round % roundInk.length] ?? palette.text;

    const paintBracket = (round: number): void => {
      const ink = roundColor(round);
      bracketLine.setAttribute('stroke', ink);
      tickLeft.setAttribute('stroke', ink);
      tickRight.setAttribute('stroke', ink);
      strideLabel.setAttribute('fill', ink);
    };

    // ── 장부 채우기
    const addPip = (
      group: SVGGElement,
      index: number,
      y: number,
      fill: string,
      ms: number,
    ): Promise<void> => {
      const pip = el('circle', { cx: PIP_X0 + index * PIP_STEP, cy: y, r: 0, fill });
      group.appendChild(pip);
      return tween(ms, (p) => pip.setAttribute('r', String(PIP_R * p)));
    };

    // ── 처음 상태
    const resetTo = (values: number[]): void => {
      for (let i = 0; i < n; i++) {
        const glyph = glyphNodes[i];
        occupant[i] = glyph;
        glyph.setAttribute('x', String(slotCenter(i)));
        glyph.setAttribute('y', String(CELL_MID));
        glyph.textContent = String(values[i] ?? startValues[i] ?? '');
        paintSlot(i, 'default');
      }
      bracket.setAttribute('opacity', '0');
      drawBracket(slotCenter(0), slotCenter(0));
      strideLabel.textContent = '';
      shrinkPips.textContent = '';
      nearPips.textContent = '';
      shrinkCompares.textContent = '0';
      shrinkMoves.textContent = '0';
      nearCompares.textContent = NOT_YET;
      nearMoves.textContent = NOT_YET;
      nearCompares.setAttribute('fill', palette.textMuted);
      nearMoves.setAttribute('fill', palette.textMuted);
    };

    resetTo(startValues);

    const instance: ViewInstance = {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      showInitial(values: number[]): void {
        resetTo(values);
      },

      /** 라운드가 열린다 — 보폭 자가 이 라운드의 폭만큼 벌어지거나 좁아진다. */
      async beginRound(round: number, gap: number): Promise<void> {
        paintBracket(round);
        strideLabel.textContent = tr('label.stride', 'stride {gap}', { gap });
        bracket.setAttribute('opacity', '1');
        clearMarks();
        await moveBracket(0, Math.min(gap, n - 1), GROW_MS);
      },

      /** 한 번의 견줌 — 자가 그 짝으로 미끄러지고 두 칸이 켜진다. */
      async showCompare(left: number, right: number, comparisons: number): Promise<void> {
        clearMarks();
        await moveBracket(left, right, SLIDE_MS);
        paintSlot(left, 'comparing');
        paintSlot(right, 'comparing');
        shrinkCompares.textContent = String(comparisons);
        await wait(FLASH_MS);
      },

      /** 어긋난 짝을 맞바꾼다 — 숫자가 자리를 건너뛴다. */
      async showSwap(left: number, right: number, round: number, moves: number): Promise<void> {
        paintSlot(left, 'swapping');
        paintSlot(right, 'swapping');

        const gap = right - left;
        const goingRight = occupant[left];
        const goingLeft = occupant[right];
        const x0 = slotCenter(left);
        const x1 = slotCenter(right);
        const high = highApex(gap);
        const low = lowApex(gap);

        const hop = tween(HOP_MS, (p) => {
          const a = arcAt(x0, x1, CELL_MID, high, p);
          goingRight.setAttribute('x', String(a.x));
          goingRight.setAttribute('y', String(a.y));
          const b = arcAt(x1, x0, CELL_MID, low, p);
          goingLeft.setAttribute('x', String(b.x));
          goingLeft.setAttribute('y', String(b.y));
        });

        shrinkMoves.textContent = String(moves);
        await Promise.all([
          hop,
          addPip(shrinkPips, moves - 1, LEDGER_ROW1_Y, roundColor(round), PIP_MS),
        ]);

        occupant[left] = goingLeft;
        occupant[right] = goingRight;
        paintSlot(left, 'default');
        paintSlot(right, 'default');
      },

      /** 대조군 — 처음부터 옆칸만 견줬을 때의 장부가 채워진다. */
      async showBaseline(comparisons: number, moves: number): Promise<void> {
        clearMarks();
        nearCompares.textContent = String(comparisons);
        nearMoves.textContent = String(moves);
        nearCompares.setAttribute('fill', palette.text);
        nearMoves.setAttribute('fill', palette.text);
        for (let i = 0; i < moves; i++) {
          if (destroyed) return;
          await addPip(nearPips, i, LEDGER_ROW2_Y, palette.textMuted, BASELINE_PIP_MS);
        }
      },

      /** 다 끝났다 — 자를 거두고 줄을 굳힌다. */
      async finish(): Promise<void> {
        for (let i = 0; i < n; i++) paintSlot(i, 'sorted');
        await tween(FADE_MS, (p) => bracket.setAttribute('opacity', String(1 - p)));
      },

      destroy(): void {
        destroyed = true;
        if (canAnimate) for (const id of rafIds) cancelAnimationFrame(id);
        rafIds.clear();
        root.remove();
      },
    };

    return instance;
  },
};
