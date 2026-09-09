/**
 * radix-sort-stage — 기수 정렬 완결형의 전용 화면.
 *
 * 조각 `digitByDigit` 이 통 열과 장부로 이미 그린 것을 되풀이하지 않는다.
 * 여기가 보이는 것은 **누적합이 자리를 정하는 안쪽 절차** 다. 네 층으로 읽는다.
 *
 *   exp     지금 보는 자리 (1 · 10 · 100). 끝난 자리는 흐려진다.
 *   arr     여덟 개의 수. 칸 아래 작은 상자가 이번 라운드에 뽑은 그 수의 자리 숫자.
 *   count   통 열. 세는 동안은 개수이고, 누적합 뒤에는 **자리 번호**가 된다.
 *           놓을 때마다 하나씩 줄어들며 그 숫자가 곧 output 의 칸 번호다.
 *   output  줄 세운 결과. 뒤에서부터 채워진다.
 *
 * 통과 output 칸을 잇는 선이 이 화면의 요점이다 — `count[d]` 를 하나 줄인 그
 * 수가 그대로 놓을 자리라는 것.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 수의 개수가 달라지면 칸 폭만 줄여
 * 담고 높이는 그대로 둔다.
 *
 * 화면의 글자 중 번역 대상은 캡션 하나뿐이고 그것은 projector 가 이미 해석해
 * 넘긴다. 나머지 — `arr` · `count` · `output` · `exp` · `max` 와
 * `(arr[i] // exp) % 10` — 는 코드 식별자와 수식 표기라 표식이다 (C10).
 *
 * 타이머를 쓰지 않는다. destroy 는 붙인 노드 하나를 떼는 것으로 끝난다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, type Palette } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 통은 열 개 — 십진수 한 자리가 가질 수 있는 값의 가짓수. */
const BASE = 10;

const W = 620;
const H = 278;

const LABEL_X = 10;
const ROW_X = 58;
const ROW_RIGHT = 608;
const ROW_SPAN = ROW_RIGHT - ROW_X;

const CELL_GAP = 4;
const CELL_MAX_W = 64;
const CELL_H = 32;

const CHIP_Y = 10;
const CHIP_H = 20;
const CHIP_W = 54;
const CHIP_GAP = 6;
/**
 * exp 칩 자리. 라운드는 가장 큰 수의 자릿수만큼 도므로 네 자리(9999)까지 담는다.
 * 저작자가 더 큰 수를 넣으면 다섯 번째 칩부터는 그려지지 않는다 — 세로를 늘리지
 * 않는 것이 우선이라 그렇게 두었다 (S-view). 그 경우 이 값과 CHIP_W 를 함께 조정한다.
 */
const MAX_CHIPS = 4;

const ARR_Y = 40;
const DIGIT_Y = 74;
const DIGIT_H = 15;
const DIGIT_W = 26;
const FORMULA_Y = 104;
const BUCKET_HDR_Y = 126;
const BUCKET_Y = 132;
const BUCKET_H = 30;
const BUCKET_GAP = 4;
const BUCKET_W = (ROW_SPAN - (BASE - 1) * BUCKET_GAP) / BASE;
const DELTA_Y = 176;
const OUT_Y = 186;
const CAPTION_Y = 240;
const CAPTION_LINE_H = 16;
/**
 * 캡션 한 줄에 담기는 폭을 재는 단위. 라틴 글자 하나가 1, 한글·아랍·데바나가리
 * 처럼 넓은 글자가 2 다. 로케일 여덟 중 어느 것이라도 두 줄 안에 들어오게 한다.
 */
const CAPTION_UNITS = 94;

/** 자릿수 뽑기의 일반형. 값이 없을 때 보여 주는 수식 표기. */
const FORMULA_BLANK = '(arr[i] // exp) % 10';

/** arr 칸의 상태. `reading` 은 지금 자리 숫자를 뽑는 칸. */
export type RadixCellState = 'default' | 'reading' | 'settled';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function label(text: string, x: number, y: number, colors: Palette): SVGTextElement {
  const t = el('text', {
    x,
    y,
    'font-family': fonts.mono,
    'font-size': fontSizes.xs,
    fill: colors.textMuted,
    'dominant-baseline': 'central',
  });
  t.textContent = text;
  return t;
}

export const radixSortStageView: CanvasView = {
  canvas: { width: W, height: H },

  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    void container;
    const colors = getColors(params.theme);
    const svg = params.canvas;

    const root = el('g', {});
    svg.appendChild(root);

    // ── 층 컨테이너 ────────────────────────────────────────────────
    const chipLayer = el('g', {});
    const arrLayer = el('g', {});
    const digitLayer = el('g', {});
    const linkLayer = el('g', {});
    const bucketLayer = el('g', {});
    const outLayer = el('g', {});
    const textLayer = el('g', {});
    root.appendChild(chipLayer);
    root.appendChild(arrLayer);
    root.appendChild(digitLayer);
    root.appendChild(linkLayer);
    root.appendChild(bucketLayer);
    root.appendChild(outLayer);
    root.appendChild(textLayer);

    // ── 고정 라벨 (코드 식별자 = 표식) ─────────────────────────────
    textLayer.appendChild(label('exp', LABEL_X, CHIP_Y + CHIP_H / 2, colors));
    textLayer.appendChild(label('arr', LABEL_X, ARR_Y + CELL_H / 2, colors));
    textLayer.appendChild(label('count', LABEL_X, BUCKET_Y + BUCKET_H / 2, colors));
    textLayer.appendChild(label('output', LABEL_X, OUT_Y + CELL_H / 2, colors));

    const maxText = el('text', {
      x: ROW_RIGHT,
      y: CHIP_Y + CHIP_H / 2,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
      'text-anchor': 'end',
      'dominant-baseline': 'central',
    });
    textLayer.appendChild(maxText);

    const formulaText = el('text', {
      x: ROW_X,
      y: FORMULA_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
      fill: colors.textMuted,
      'dominant-baseline': 'central',
    });
    formulaText.textContent = FORMULA_BLANK;
    textLayer.appendChild(formulaText);

    const captionLines: SVGTextElement[] = [];
    for (let line = 0; line < 2; line++) {
      const node = el('text', {
        x: LABEL_X,
        y: CAPTION_Y + line * CAPTION_LINE_H,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
        'dominant-baseline': 'central',
      });
      textLayer.appendChild(node);
      captionLines.push(node);
    }

    const deltaText = el('text', {
      x: 0,
      y: DELTA_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.xs,
      fill: colors.text,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    textLayer.appendChild(deltaText);

    // ── exp 칩 (자리 고름) ─────────────────────────────────────────
    const chipBoxes: SVGRectElement[] = [];
    const chipTexts: SVGTextElement[] = [];
    for (let c = 0; c < MAX_CHIPS; c++) {
      const x = ROW_X + c * (CHIP_W + CHIP_GAP);
      const box = el('rect', {
        x,
        y: CHIP_Y,
        width: CHIP_W,
        height: CHIP_H,
        rx: 4,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': 1,
        opacity: 0,
      });
      const txt = el('text', {
        x: x + CHIP_W / 2,
        y: CHIP_Y + CHIP_H / 2,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        opacity: 0,
      });
      chipLayer.appendChild(box);
      chipLayer.appendChild(txt);
      chipBoxes.push(box);
      chipTexts.push(txt);
    }

    // ── count 통 열 ────────────────────────────────────────────────
    const bucketX = (d: number): number => ROW_X + d * (BUCKET_W + BUCKET_GAP);
    const bucketBoxes: SVGRectElement[] = [];
    const bucketTexts: SVGTextElement[] = [];
    for (let d = 0; d < BASE; d++) {
      const x = bucketX(d);
      const hdr = el('text', {
        x: x + BUCKET_W / 2,
        y: BUCKET_HDR_Y,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      hdr.textContent = String(d);
      bucketLayer.appendChild(hdr);

      const box = el('rect', {
        x,
        y: BUCKET_Y,
        width: BUCKET_W,
        height: BUCKET_H,
        rx: 3,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
      });
      const txt = el('text', {
        x: x + BUCKET_W / 2,
        y: BUCKET_Y + BUCKET_H / 2,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      txt.textContent = '0';
      bucketLayer.appendChild(box);
      bucketLayer.appendChild(txt);
      bucketBoxes.push(box);
      bucketTexts.push(txt);
    }

    // ── 값에 따라 만들어지는 층 (arr · 자리 숫자 · output) ──────────
    let size = 0;
    let cellW = CELL_MAX_W;
    const arrBoxes: SVGRectElement[] = [];
    const arrTexts: SVGTextElement[] = [];
    const digitBoxes: SVGRectElement[] = [];
    const digitTexts: SVGTextElement[] = [];
    const outBoxes: SVGRectElement[] = [];
    const outTexts: SVGTextElement[] = [];
    const cellStates: RadixCellState[] = [];

    let cellStartX = ROW_X;
    const cellX = (i: number): number => cellStartX + i * (cellW + CELL_GAP);

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    function buildCells(values: number[]): void {
      clearLayer(arrLayer);
      clearLayer(digitLayer);
      clearLayer(outLayer);
      arrBoxes.length = 0;
      arrTexts.length = 0;
      digitBoxes.length = 0;
      digitTexts.length = 0;
      outBoxes.length = 0;
      outTexts.length = 0;
      cellStates.length = 0;

      size = values.length;
      if (size === 0) return;
      // 세로는 그대로 두고 칸 폭만 줄여 담는다 (S-view).
      cellW = Math.min(CELL_MAX_W, (ROW_SPAN - (size - 1) * CELL_GAP) / size);
      // 남는 폭은 양쪽으로 나눈다 — 통 열과 가운데가 맞아야 잇는 선이 곧게 선다.
      cellStartX = ROW_X + (ROW_SPAN - (size * cellW + (size - 1) * CELL_GAP)) / 2;

      for (let i = 0; i < size; i++) {
        const x = cellX(i);

        const box = el('rect', {
          x,
          y: ARR_Y,
          width: cellW,
          height: CELL_H,
          rx: 3,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const txt = el('text', {
          x: x + cellW / 2,
          y: ARR_Y + CELL_H / 2,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        txt.textContent = String(values[i]);
        arrLayer.appendChild(box);
        arrLayer.appendChild(txt);
        arrBoxes.push(box);
        arrTexts.push(txt);
        cellStates.push('default');

        const dw = Math.min(DIGIT_W, cellW);
        const dbox = el('rect', {
          x: x + (cellW - dw) / 2,
          y: DIGIT_Y,
          width: dw,
          height: DIGIT_H,
          rx: 2,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
          opacity: 0,
        });
        const dtxt = el('text', {
          x: x + cellW / 2,
          y: DIGIT_Y + DIGIT_H / 2,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          opacity: 0,
        });
        digitLayer.appendChild(dbox);
        digitLayer.appendChild(dtxt);
        digitBoxes.push(dbox);
        digitTexts.push(dtxt);

        const obox = el('rect', {
          x,
          y: OUT_Y,
          width: cellW,
          height: CELL_H,
          rx: 3,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        const otxt = el('text', {
          x: x + cellW / 2,
          y: OUT_Y + CELL_H / 2,
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.text,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        outLayer.appendChild(obox);
        outLayer.appendChild(otxt);
        outBoxes.push(obox);
        outTexts.push(otxt);
      }
    }

    // ── 상태 칠하기 ────────────────────────────────────────────────
    function paintCell(i: number): void {
      const box = arrBoxes[i];
      const txt = arrTexts[i];
      if (!box || !txt) return;
      const state = cellStates[i];
      if (state === 'reading') {
        box.setAttribute('fill', colors.itemActive);
        box.setAttribute('stroke', colors.itemActive);
        txt.setAttribute('fill', colors.stateInk);
      } else if (state === 'settled') {
        box.setAttribute('fill', colors.itemSorted);
        box.setAttribute('stroke', colors.itemSorted);
        txt.setAttribute('fill', colors.textInverse);
      } else {
        box.setAttribute('fill', colors.itemDefault);
        box.setAttribute('stroke', colors.border);
        txt.setAttribute('fill', colors.text);
      }
    }

    function paintBucket(d: number, active: boolean): void {
      const box = bucketBoxes[d];
      const txt = bucketTexts[d];
      if (!box || !txt) return;
      if (active) {
        box.setAttribute('fill', colors.itemPivot);
        box.setAttribute('stroke', colors.itemPivot);
        txt.setAttribute('fill', colors.stateInk);
      } else {
        box.setAttribute('fill', colors.itemDefault);
        box.setAttribute('stroke', colors.border);
        txt.setAttribute('fill', colors.text);
      }
    }

    let activeBucket: number | null = null;

    function setActiveBucket(d: number | null): void {
      if (activeBucket !== null && activeBucket !== d) paintBucket(activeBucket, false);
      activeBucket = d;
      if (d !== null) paintBucket(d, true);
    }

    function clearLink(): void {
      clearLayer(linkLayer);
      deltaText.textContent = '';
    }

    // ── 공개 메서드 ────────────────────────────────────────────────

    function setData(values: number[]): void {
      buildCells(values);
      for (let i = 0; i < size; i++) paintCell(i);
      clearLink();
      setActiveBucket(null);
    }

    function setMax(maxValue: number): void {
      // 수식 표기 — 표식이라 키를 만들지 않는다 (C10).
      maxText.textContent = `max = ${maxValue}`;
    }

    function beginRound(round: number, exp: number): void {
      const slot = round - 1;
      if (slot >= 0 && slot < MAX_CHIPS) {
        const box = chipBoxes[slot];
        const txt = chipTexts[slot];
        box.setAttribute('opacity', '1');
        txt.setAttribute('opacity', '1');
        txt.textContent = String(exp);
      }
      for (let c = 0; c < MAX_CHIPS; c++) {
        const on = c === slot;
        chipBoxes[c].setAttribute('fill', on ? colors.primary : colors.bg);
        chipBoxes[c].setAttribute('stroke', on ? colors.primary : colors.border);
        chipTexts[c].setAttribute('fill', on ? colors.textInverse : colors.textMuted);
      }
      resetBuckets();
      clearOutput();
      clearDigits();
      formulaText.textContent = FORMULA_BLANK;
      formulaText.setAttribute('fill', colors.textMuted);
    }

    function resetBuckets(): void {
      for (let d = 0; d < BASE; d++) {
        bucketTexts[d].textContent = '0';
        paintBucket(d, false);
      }
      activeBucket = null;
      clearLink();
    }

    function clearOutput(): void {
      for (let i = 0; i < size; i++) {
        outTexts[i].textContent = '';
        outBoxes[i].setAttribute('fill', colors.bg);
        outBoxes[i].setAttribute('stroke', colors.border);
        outBoxes[i].setAttribute('stroke-dasharray', '3 3');
      }
    }

    function clearDigits(): void {
      for (let i = 0; i < size; i++) {
        digitBoxes[i].setAttribute('opacity', '0');
        digitTexts[i].setAttribute('opacity', '0');
      }
    }

    /** 자리 숫자를 뽑는 순간 — 칸을 짚고 수식에 값을 끼운다. */
    function readDigit(index: number, value: number, exp: number, digit: number): void {
      if (index < 0 || index >= size) return;
      // 앞 걸음의 잇는 선을 거둔다 — 선은 언제나 지금 보는 값의 것이어야 한다.
      clearLink();
      for (let i = 0; i < size; i++) {
        if (cellStates[i] === 'reading') {
          cellStates[i] = 'default';
          paintCell(i);
        }
      }
      cellStates[index] = 'reading';
      paintCell(index);

      digitBoxes[index].setAttribute('opacity', '1');
      digitTexts[index].setAttribute('opacity', '1');
      digitTexts[index].textContent = String(digit);

      // 수식 표기에 값을 끼운 것 — 문장이 아니라 표식이다 (C10).
      formulaText.textContent = `(${value} // ${exp}) % 10 = ${digit}`;
      formulaText.setAttribute('fill', colors.text);
      setActiveBucket(digit);
    }

    function releaseCell(index: number): void {
      if (index < 0 || index >= size) return;
      if (cellStates[index] === 'reading') {
        cellStates[index] = 'default';
        paintCell(index);
      }
    }

    function setBucketValue(digit: number, value: number): void {
      if (digit < 0 || digit >= BASE) return;
      bucketTexts[digit].textContent = String(value);
      setActiveBucket(digit);
    }

    /** 누적합 — 왼쪽 통에서 얼마를 받았는지 통 아래에 적는다. */
    function showPrefixAdd(digit: number, added: number): void {
      clearLayer(linkLayer);
      if (digit <= 0 || digit >= BASE) return;
      const from = bucketX(digit - 1) + BUCKET_W / 2;
      const to = bucketX(digit) + BUCKET_W / 2;
      const y = BUCKET_Y + BUCKET_H + 6;
      linkLayer.appendChild(
        el('path', {
          d: `M ${from} ${y} L ${to} ${y}`,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
        }),
      );
      deltaText.setAttribute('x', String(to));
      deltaText.setAttribute('y', String(DELTA_Y));
      deltaText.setAttribute('text-anchor', 'middle');
      deltaText.textContent = `+${added}`;
    }

    /** 놓기 — 줄어든 count[d] 가 곧 output 의 칸 번호라는 것을 선으로 잇는다. */
    function linkToSlot(digit: number, slot: number, value: number): void {
      clearLayer(linkLayer);
      if (digit < 0 || digit >= BASE || slot < 0 || slot >= size) return;

      const bx = bucketX(digit) + BUCKET_W / 2;
      const by = BUCKET_Y + BUCKET_H;
      const ox = cellX(slot) + cellW / 2;
      const oy = OUT_Y;
      // 가로줄은 output 칸 바로 위로 낮춰 긋고, '-1' 은 세로 줄기 오른쪽에 붙인다.
      const mid = oy - 4;
      linkLayer.appendChild(
        el('path', {
          d: `M ${bx} ${by} L ${bx} ${mid} L ${ox} ${mid} L ${ox} ${oy}`,
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
        }),
      );
      deltaText.setAttribute('x', String(bx + 6));
      deltaText.setAttribute('y', String(by + 8));
      deltaText.setAttribute('text-anchor', 'start');
      deltaText.textContent = '-1';

      outTexts[slot].textContent = String(value);
      outBoxes[slot].setAttribute('fill', colors.itemDefault);
      outBoxes[slot].setAttribute('stroke', colors.accent);
      outBoxes[slot].setAttribute('stroke-dasharray', 'none');
    }

    /** 라운드 끝 — 줄 세운 결과를 arr 로 되돌려 담는다. */
    function commitRound(values: number[]): void {
      for (let i = 0; i < size; i++) {
        const value = values[i];
        if (typeof value === 'number') arrTexts[i].textContent = String(value);
        cellStates[i] = 'default';
        paintCell(i);
      }
      clearDigits();
      clearLink();
      setActiveBucket(null);
      formulaText.textContent = FORMULA_BLANK;
      formulaText.setAttribute('fill', colors.textMuted);
    }

    function markDone(): void {
      for (let i = 0; i < size; i++) {
        cellStates[i] = 'settled';
        paintCell(i);
      }
      for (let c = 0; c < MAX_CHIPS; c++) {
        if (chipBoxes[c].getAttribute('opacity') === '0') continue;
        chipBoxes[c].setAttribute('fill', colors.itemSorted);
        chipBoxes[c].setAttribute('stroke', colors.itemSorted);
        chipTexts[c].setAttribute('fill', colors.textInverse);
      }
      // 마지막 라운드의 강조를 거둔다 — 결과는 arr 가 말한다.
      for (let i = 0; i < size; i++) outBoxes[i].setAttribute('stroke', colors.border);
      clearLink();
      setActiveBucket(null);
    }

    /** 넓은 글자를 2 로 세어 한 줄에 담기는 폭을 잰다. */
    function widthOf(word: string): number {
      let n = 0;
      for (const ch of word) n += (ch.codePointAt(0) ?? 0) > 0x0590 ? 2 : 1;
      return n;
    }

    function setCaption(text: string): void {
      // SVG text 는 스스로 줄을 바꾸지 않는다. 낱말 경계에서 두 줄로 나눈다.
      const words = text.split(' ');
      const rows = ['', ''];
      let row = 0;
      for (const word of words) {
        const candidate = rows[row] === '' ? word : `${rows[row]} ${word}`;
        if (widthOf(candidate) > CAPTION_UNITS && row === 0) {
          row = 1;
          rows[1] = word;
        } else {
          rows[row] = candidate;
        }
      }
      captionLines[0].textContent = rows[0];
      captionLines[1].textContent = rows[1];
    }

    function reset(): void {
      for (let c = 0; c < MAX_CHIPS; c++) {
        chipBoxes[c].setAttribute('opacity', '0');
        chipTexts[c].setAttribute('opacity', '0');
        chipTexts[c].textContent = '';
      }
      maxText.textContent = '';
      setCaption('');
      formulaText.textContent = FORMULA_BLANK;
      formulaText.setAttribute('fill', colors.textMuted);
      resetBuckets();
      clearOutput();
      clearDigits();
      for (let i = 0; i < size; i++) {
        cellStates[i] = 'default';
        paintCell(i);
      }
    }

    return {
      setData,
      setMax,
      beginRound,
      readDigit,
      releaseCell,
      setBucketValue,
      showPrefixAdd,
      linkToSlot,
      commitRound,
      markDone,
      setCaption,
      reset,
      destroy(): void {
        // 타이머도 관찰자도 없다. 붙인 노드 하나를 떼는 것이 전부다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
