/**
 * 2의 보수 무대.
 *
 * 한 화면에 네 가지를 나란히 둔다.
 *
 *   자리의 무게   맨 윗자리만 `−2^(w−1)` 이고 나머지는 `+2^k` 다
 *   비트 칸       0 과 1. 1 인 맨 윗자리는 따로 칠해 그 자리가 부호를 지는 것을 보인다
 *   두 읽음       부호 없이 읽은 수와 2의 보수로 읽은 수를 같은 줄에 나란히
 *   셈            `−8 + 2 + 1 = −5` 를 그대로 적는다
 *
 * 폭이 16 · 32 로 커지면 칸을 다 그리지 않는다. 맨 윗자리 하나와 아랫자리 일곱만
 * 남기고 가운데를 `…` 로 접는다 — **세로는 마운트 뒤에 바뀌지 않아야 하므로**
 * (S-view) 칸을 늘리는 대신 접는다.
 *
 * 색은 전부 토큰이다. 두 약속을 가르는 두 색은 `categorical(2, 'pastel')` 로 얻는데,
 * 테마를 따라 뒤집지 않는 옅은 타일이라 그 위의 잉크는 `stateInk` 다 (S-view 표).
 *
 * 타이머도 옵저버도 두지 않는다. 걸음의 간격은 알고리즘의 `ctx.sleep` 이 정하고
 * 이 화면은 부르면 즉시 그린다 — `destroy()` 가 거둘 뒷일이 실제로 없다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 글의 문단 폭에 맞춘 공용 값, 세로는 이 그림이 정한다. */
export const STAGE_W = PIECE_CANVAS_W;
export const STAGE_H = 340;

const PAD = 16;
const CAP_Y = 24;
const HEAD_Y = 54;
const ROW_TOP = 68;
const ROW_H = 46;
const CELL_H = 28;
const CELL_GAP = 4;
const CELL_MAX_W = 46;
const BITS_X = PAD;
const BITS_W = 348;
const COL_W = 112;
const COL_UNSIGNED_X = 378;
const COL_TWOS_X = 492;
const FORMULA_Y = 272;
const SPAN_TOP = 286;
const SPAN_H = 40;
/** 폭이 이보다 크면 가운데를 접는다. */
const FOLD_OVER = 8;
/** 접었을 때 아래쪽에 남기는 자리의 수. */
const KEEP_LOW = 7;

/** 한 칸이 가리키는 자리. `'gap'` 은 접힌 자리다. */
type Slot = number | 'gap';

/** 폭에 맞는 칸 배치. 높은 자리부터 늘어놓는다. */
export const slotsFor = (width: number): Slot[] => {
  const out: Slot[] = [];
  if (width <= FOLD_OVER) {
    for (let place = width - 1; place >= 0; place -= 1) out.push(place);
    return out;
  }
  out.push(width - 1, 'gap');
  for (let place = KEEP_LOW - 1; place >= 0; place -= 1) out.push(place);
  return out;
};

/**
 * 세 자리마다 쉼표로 끊는다. 빈칸으로 묶으면 언어에 따라 다르게 읽힌다.
 *
 * 음수는 하이픈이 아니라 빼기 기호(U+2212)로 적는다 — 화면에서 하이픈은 줄표와
 * 구별되지 않는다.
 */
export const groupDigits = (value: number): string => {
  const digits = Math.abs(value).toFixed(0);
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ',';
    out += digits[i];
  }
  return value < 0 ? `−${out}` : out;
};

/** 셈 한 줄. `−8 + 2 + 1 = −5` 꼴이다. 수식 표기라 표식으로 둔다 (C10 판정 3). */
const formulaOf = (terms: number[], reading: number): string => {
  if (terms.length === 0) return `0 = ${groupDigits(reading)}`;
  return `${terms.map((v) => groupDigits(v)).join(' + ')} = ${groupDigits(reading)}`;
};

const make = <K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

type Cell = { rect: SVGRectElement; label: SVGTextElement; place: number };

type Row = {
  cells: Cell[];
  marker: SVGRectElement;
  unsignedBox: SVGRectElement;
  unsignedText: SVGTextElement;
  twosBox: SVGRectElement;
  twosText: SVGTextElement;
};

export const twosComplementStageView: CanvasView = {
  canvas: { width: STAGE_W, height: STAGE_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    // 두 약속을 가르는 두 색. 테마 무관 타일이라 잉크는 stateInk 다.
    const tint = categorical(2, 'pastel');

    const initial = params.initialData as { width?: unknown; patterns?: unknown } | undefined;
    const initialWidth = typeof initial?.width === 'number' ? initial.width : 4;
    const initialCount = Array.isArray(initial?.patterns) ? initial.patterns.length : 4;

    const root = make('g', {});
    params.canvas.appendChild(root);

    const caption = make('text', {
      x: PAD,
      y: CAP_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    root.appendChild(caption);

    const headUnsigned = make('text', {
      x: COL_UNSIGNED_X + COL_W / 2,
      y: HEAD_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    headUnsigned.textContent = t('label.unsigned', 'unsigned');
    root.appendChild(headUnsigned);

    const headTwos = make('text', {
      x: COL_TWOS_X + COL_W / 2,
      y: HEAD_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    headTwos.textContent = t('label.twos', 'two\'s complement');
    root.appendChild(headTwos);

    const weightLayer = make('g', {});
    const rowLayer = make('g', {});
    root.appendChild(weightLayer);
    root.appendChild(rowLayer);

    const formula = make('text', {
      x: PAD,
      y: FORMULA_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    root.appendChild(formula);

    root.appendChild(
      make('rect', {
        x: PAD,
        y: SPAN_TOP,
        width: STAGE_W - PAD * 2,
        height: SPAN_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
      }),
    );

    /** 아래 띠의 한 칸 — 이름과 수. */
    const spanSlot = (x: number, name: string): SVGTextElement => {
      const label = make('text', {
        x,
        y: SPAN_TOP + 16,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      label.textContent = name;
      root.appendChild(label);
      const value = make('text', {
        x,
        y: SPAN_TOP + 32,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      root.appendChild(value);
      return value;
    };

    const rangeValue = spanSlot(PAD + 16, t('label.range', 'range'));
    const valuesValue = spanSlot(PAD + 264, t('label.values', 'values'));
    const negativesValue = spanSlot(PAD + 434, t('label.negatives', 'negatives'));

    let width = initialWidth;
    let rows: Row[] = [];

    const drawBoard = (nextWidth: number, count: number): void => {
      width = nextWidth;
      weightLayer.textContent = '';
      rowLayer.textContent = '';
      rows = [];

      const slots = slotsFor(nextWidth);
      const cellW = Math.min(
        CELL_MAX_W,
        (BITS_W - CELL_GAP * (slots.length - 1)) / slots.length,
      );
      const used = cellW * slots.length + CELL_GAP * (slots.length - 1);
      const x0 = BITS_X + (BITS_W - used) / 2;
      const xOf = (k: number): number => x0 + k * (cellW + CELL_GAP);

      slots.forEach((slot, k) => {
        const isTop = slot !== 'gap' && slot === nextWidth - 1;
        const label = make('text', {
          x: xOf(k) + cellW / 2,
          y: HEAD_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: isTop ? colors.text : colors.textMuted,
        });
        // 자리의 무게. 맨 윗자리만 음수다.
        label.textContent = slot === 'gap' ? '…' : isTop ? `−2^${slot}` : `2^${slot}`;
        weightLayer.appendChild(label);
      });

      for (let i = 0; i < count; i += 1) {
        const yTop = ROW_TOP + i * ROW_H;
        const marker = make('rect', {
          x: BITS_X - 8,
          y: yTop + 6,
          width: 3,
          height: CELL_H,
          rx: 1,
          fill: colors.itemActive,
          opacity: 0,
        });
        rowLayer.appendChild(marker);

        const cells: Cell[] = [];
        slots.forEach((slot, k) => {
          if (slot === 'gap') {
            const dots = make('text', {
              x: xOf(k) + cellW / 2,
              y: yTop + 26,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.sm,
              fill: colors.textMuted,
            });
            dots.textContent = '…';
            rowLayer.appendChild(dots);
            return;
          }
          const rect = make('rect', {
            x: xOf(k),
            y: yTop + 6,
            width: cellW,
            height: CELL_H,
            rx: 3,
            fill: colors.itemDefault,
            stroke: colors.border,
          });
          const label = make('text', {
            x: xOf(k) + cellW / 2,
            y: yTop + 26,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.text,
          });
          rowLayer.appendChild(rect);
          rowLayer.appendChild(label);
          cells.push({ rect, label, place: slot });
        });

        const unsignedBox = make('rect', {
          x: COL_UNSIGNED_X,
          y: yTop + 6,
          width: COL_W,
          height: CELL_H,
          rx: 3,
          fill: colors.bg,
          stroke: colors.border,
        });
        const unsignedText = make('text', {
          x: COL_UNSIGNED_X + COL_W / 2,
          y: yTop + 26,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.stateInk,
        });
        const twosBox = make('rect', {
          x: COL_TWOS_X,
          y: yTop + 6,
          width: COL_W,
          height: CELL_H,
          rx: 3,
          fill: colors.bg,
          stroke: colors.border,
        });
        const twosText = make('text', {
          x: COL_TWOS_X + COL_W / 2,
          y: yTop + 26,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.stateInk,
        });
        rowLayer.appendChild(unsignedBox);
        rowLayer.appendChild(unsignedText);
        rowLayer.appendChild(twosBox);
        rowLayer.appendChild(twosText);

        rows.push({ cells, marker, unsignedBox, unsignedText, twosBox, twosText });
      }
    };

    const focus = (index: number): void => {
      rows.forEach((row, i) => row.marker.setAttribute('opacity', i === index ? '1' : '0'));
    };

    drawBoard(initialWidth, initialCount);

    return {
      destroy(): void {
        // 타이머도 옵저버도 걸지 않았으므로 붙인 노드만 거둔다. 캔버스는 러너의 것이다.
        if (root.parentNode) root.remove();
      },

      setBoard(v: { width: number; patternCount: number }): void {
        drawBoard(v.width, v.patternCount);
        formula.textContent = '';
      },

      layBits(v: { index: number; bits: number[] }): void {
        const row = rows[v.index];
        if (!row) return;
        focus(v.index);
        for (const cell of row.cells) {
          const bit = v.bits[cell.place] === 1 ? 1 : 0;
          // 칸에 새겨진 0 과 1 — 도형의 일부라 표식이다 (C10 판정 1).
          cell.label.textContent = String(bit);
          const isTop = cell.place === width - 1;
          if (bit === 1 && isTop) {
            cell.rect.setAttribute('fill', colors.accent);
            cell.label.setAttribute('fill', colors.stateInk);
          } else if (bit === 1) {
            cell.rect.setAttribute('fill', colors.primary);
            cell.label.setAttribute('fill', colors.textInverse);
          } else {
            cell.rect.setAttribute('fill', colors.itemDefault);
            cell.label.setAttribute('fill', colors.text);
          }
        }
      },

      showReading(v: {
        index: number;
        promise: string;
        reading: number;
        terms: number[];
      }): void {
        const row = rows[v.index];
        if (!row) return;
        focus(v.index);
        const signed = v.promise === 'twos';
        const box = signed ? row.twosBox : row.unsignedBox;
        const label = signed ? row.twosText : row.unsignedText;
        box.setAttribute('fill', signed ? tint[1] : tint[0]);
        label.textContent = groupDigits(v.reading);
        formula.textContent = formulaOf(v.terms, v.reading);
      },

      setSpan(v: {
        lowest: number;
        highest: number;
        valueCount: number;
        negativeCount: number;
      }): void {
        rangeValue.textContent = `${groupDigits(v.lowest)} … ${groupDigits(v.highest)}`;
        valuesValue.textContent = groupDigits(v.valueCount);
        negativesValue.textContent = groupDigits(v.negativeCount);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      reset(): void {
        drawBoard(initialWidth, initialCount);
        caption.textContent = '';
        formula.textContent = '';
        rangeValue.textContent = '';
        valuesValue.textContent = '';
        negativesValue.textContent = '';
      },
    };
  },
};
