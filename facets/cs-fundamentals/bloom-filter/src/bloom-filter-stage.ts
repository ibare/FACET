/**
 * bloom-filter-stage — 비트 배열 한 줄과 넣는 여섯, 그리고 요약 둘.
 *
 * 그리는 것은 셋이다.
 *   1. 넣는 것 여섯. 지금 넣는 것과 이미 넣은 것이 갈린다.
 *   2. 비트 배열 한 줄. m 이 16 · 32 · 64 로 갈려도 **세로는 그대로**다 (S-view).
 *   3. 켜진 자리와 거짓 양성률. 비율은 그림이 아니라 요약으로 보인다.
 *
 * 애니메이션이 없다 — 걸음의 길이는 알고리즘의 `ctx.sleep` 이 정하고, 여기서는
 * 즉시 칠한다. 그래서 기다리는 promise 도, 거둘 타이머도 없다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 300;
const PAD = 20;
const INNER = W - PAD * 2;

const KEYS_LABEL_Y = 22;
const CHIP_Y = 30;
const CHIP_H = 30;
const CHIP_GAP = 8;
const SLOTS_Y = 76;
const BITS_LABEL_Y = 104;
const CELL_Y = 112;
const CELL_H = 38;
const INDEX_Y = 166;
const STAT_LABEL_Y = 198;
const STAT_VALUE_Y = 224;
const BAR_Y = 232;
const BAR_H = 6;
const BAR_W = 300;
const STAT_RIGHT_X = 380;
const CAPTION_Y = 272;

/** 칸 안에 0/1 을 적을 수 있는 최소 너비. 이보다 좁으면 칸만 칠한다. */
const DIGIT_MIN_W = 18;

type CellTone = 'off' | 'on' | 'active' | 'shared';
type ChipTone = 'pending' | 'active' | 'done';

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function text(
  x: number,
  y: number,
  size: string,
  fill: string,
  anchor: 'start' | 'middle' | 'end' = 'start',
): SVGTextElement {
  return el('text', {
    x,
    y,
    'font-family': fonts.body,
    'font-size': size,
    fill,
    'text-anchor': anchor,
  });
}

export const bloomFilterStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const init = params.initialData as Record<string, unknown> | undefined;
    const initM = typeof init?.m === 'number' ? init.m : 32;
    const initK = typeof init?.k === 'number' ? init.k : 3;
    const initKeys = Array.isArray(init?.keys)
      ? (init.keys as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];

    // ── 고정 층 ────────────────────────────────────────────────
    const keysLabel = text(PAD, KEYS_LABEL_Y, fontSizes.xs, colors.textMuted);
    keysLabel.textContent = tr('label.keys', 'Put in');
    svg.appendChild(keysLabel);

    const bitsLabel = text(PAD, BITS_LABEL_Y, fontSizes.xs, colors.textMuted);
    bitsLabel.textContent = tr('label.bits', 'Bit array');
    svg.appendChild(bitsLabel);

    const onLabel = text(PAD, STAT_LABEL_Y, fontSizes.xs, colors.textMuted);
    onLabel.textContent = tr('label.onBits', 'Bits on');
    svg.appendChild(onLabel);

    const fpLabel = text(STAT_RIGHT_X, STAT_LABEL_Y, fontSizes.xs, colors.textMuted);
    fpLabel.textContent = tr('label.falsePositive', 'False positive');
    svg.appendChild(fpLabel);

    const barBg = el('rect', {
      x: PAD,
      y: BAR_Y,
      width: BAR_W,
      height: BAR_H,
      rx: 3,
      fill: colors.bgSubtle,
      stroke: colors.border,
    });
    svg.appendChild(barBg);
    const barFill = el('rect', {
      x: PAD,
      y: BAR_Y,
      width: 0,
      height: BAR_H,
      rx: 3,
      fill: colors.itemSorted,
    });
    svg.appendChild(barFill);

    const onValue = text(PAD, STAT_VALUE_Y, fontSizes.xl, colors.text);
    svg.appendChild(onValue);
    const fpValue = text(STAT_RIGHT_X, STAT_VALUE_Y, fontSizes.xl, colors.text);
    svg.appendChild(fpValue);

    const caption = text(PAD, CAPTION_Y, fontSizes.sm, colors.text);
    svg.appendChild(caption);

    // ── 다시 지어지는 층 ────────────────────────────────────────
    const chipsG = el('g', {});
    svg.appendChild(chipsG);
    const cellsG = el('g', {});
    svg.appendChild(cellsG);

    let cellRects: SVGRectElement[] = [];
    let cellTexts: (SVGTextElement | null)[] = [];
    let cellOn: boolean[] = [];
    let chipRects: SVGRectElement[] = [];
    let chipTexts: SVGTextElement[] = [];
    let chipSlots: SVGTextElement[] = [];
    let slotCount = initM;

    function cellFill(tone: CellTone): string {
      if (tone === 'active') return colors.itemActive;
      if (tone === 'shared') return colors.itemPivot;
      if (tone === 'on') return colors.itemSorted;
      return colors.itemDefault;
    }

    /**
     * 칸 위의 잉크. 타일이 테마를 따라 뒤집으면 잉크도 뒤집고, 타일이 고정이면
     * 잉크도 고정한다 (design-tokens 의 stateInk 표).
     */
    function cellInk(tone: CellTone): string {
      if (tone === 'active' || tone === 'shared') return colors.stateInk;
      if (tone === 'on') return colors.textInverse;
      return colors.text;
    }

    function paintCell(i: number, tone: CellTone): void {
      const rect = cellRects[i];
      if (rect === undefined) return;
      rect.setAttribute('fill', cellFill(tone));
      rect.setAttribute('stroke', tone === 'off' ? colors.border : cellFill(tone));
      const label = cellTexts[i];
      if (label) {
        label.setAttribute('fill', cellInk(tone));
        label.textContent = cellOn[i] ? '1' : '0';
      }
    }

    function paintChip(i: number, tone: ChipTone): void {
      const rect = chipRects[i];
      const label = chipTexts[i];
      if (rect === undefined || label === undefined) return;
      const fill =
        tone === 'active' ? colors.itemActive : tone === 'done' ? colors.itemSorted : colors.itemDefault;
      const ink =
        tone === 'active' ? colors.stateInk : tone === 'done' ? colors.textInverse : colors.text;
      rect.setAttribute('fill', fill);
      rect.setAttribute('stroke', tone === 'pending' ? colors.border : fill);
      label.setAttribute('fill', ink);
    }

    /** 이번 판의 m·k·넣는 것으로 화면을 다시 짓는다. 세로는 건드리지 않는다. */
    function build(m: number, keys: string[]): void {
      slotCount = Math.max(1, m);
      chipsG.textContent = '';
      cellsG.textContent = '';
      cellRects = [];
      cellTexts = [];
      cellOn = new Array<boolean>(slotCount).fill(false);
      chipRects = [];
      chipTexts = [];
      chipSlots = [];

      // 넣는 것
      const n = Math.max(1, keys.length);
      const chipW = (INNER - CHIP_GAP * (n - 1)) / n;
      for (let i = 0; i < keys.length; i += 1) {
        const x = PAD + i * (chipW + CHIP_GAP);
        const rect = el('rect', {
          x,
          y: CHIP_Y,
          width: chipW,
          height: CHIP_H,
          rx: 4,
          fill: colors.itemDefault,
          stroke: colors.border,
        });
        chipsG.appendChild(rect);
        const label = text(x + chipW / 2, CHIP_Y + 20, fontSizes.sm, colors.text, 'middle');
        label.textContent = keys[i] ?? '';
        chipsG.appendChild(label);
        const slots = text(x + chipW / 2, SLOTS_Y, fontSizes.xs, colors.textMuted, 'middle');
        chipsG.appendChild(slots);
        chipRects.push(rect);
        chipTexts.push(label);
        chipSlots.push(slots);
      }

      // 비트 배열 한 줄
      const cellW = INNER / slotCount;
      const showDigit = cellW >= DIGIT_MIN_W;
      const indexEvery = slotCount <= 32 ? 1 : 8;
      for (let i = 0; i < slotCount; i += 1) {
        const x = PAD + i * cellW;
        const rect = el('rect', {
          x,
          y: CELL_Y,
          width: cellW - 1,
          height: CELL_H,
          rx: 2,
          fill: colors.itemDefault,
          stroke: colors.border,
        });
        cellsG.appendChild(rect);
        cellRects.push(rect);

        if (showDigit) {
          const digit = text(x + (cellW - 1) / 2, CELL_Y + 25, fontSizes.xs, colors.text, 'middle');
          digit.textContent = '0';
          cellsG.appendChild(digit);
          cellTexts.push(digit);
        } else {
          cellTexts.push(null);
        }

        if (i % indexEvery === 0) {
          const idx = text(x + (cellW - 1) / 2, INDEX_Y, fontSizes.xs, colors.textMuted, 'middle');
          idx.textContent = String(i);
          cellsG.appendChild(idx);
        }
      }
    }

    function clearStats(): void {
      onValue.textContent = '';
      fpValue.textContent = '';
      fpValue.setAttribute('fill', colors.text);
      barFill.setAttribute('width', '0');
    }

    build(initM, initKeys);
    caption.textContent = tr(
      'caption.setup',
      'm = {m} slots, k = {k} hashes. The array starts empty.',
      { m: initM, k: initK },
    );

    return {
      destroy() {
        // 거둘 타이머도 프레임도 없다 — 애니메이션을 두지 않았다. 남은 것은
        // 캔버스 안의 노드뿐이고, 캔버스 자체는 러너의 것이라 두고 간다.
        svg.textContent = '';
      },

      setup(m: number, k: number, keys: string[]) {
        build(m, keys);
        clearStats();
        caption.textContent = tr(
          'caption.setup',
          'm = {m} slots, k = {k} hashes. The array starts empty.',
          { m, k },
        );
      },

      showHash(key: string, keyIndex: number, slots: number[]) {
        for (let i = 0; i < chipRects.length; i += 1) {
          paintChip(i, i < keyIndex ? 'done' : i === keyIndex ? 'active' : 'pending');
        }
        const label = chipSlots[keyIndex];
        if (label) label.textContent = slots.join(' ');
        caption.textContent = tr('caption.hash', '{key} lands on {slots}.', {
          key,
          slots: slots.join(', '),
        });
      },

      setBit(slot: number, _keyIndex: number, shared: boolean) {
        // 지난 걸음에 짚은 칸은 가라앉히고, 이번 칸만 도드라지게 한다.
        for (let i = 0; i < cellRects.length; i += 1) {
          if (cellOn[i]) paintCell(i, 'on');
        }
        if (slot >= 0 && slot < cellRects.length) {
          cellOn[slot] = true;
          paintCell(slot, shared ? 'shared' : 'active');
        }
        caption.textContent = shared
          ? tr('caption.shared', 'Slot {slot} was already on. It stays 1.', { slot })
          : tr('caption.set', 'Slot {slot} turns on.', { slot });
      },

      showMeasure(queries: number) {
        for (let i = 0; i < cellRects.length; i += 1) {
          paintCell(i, cellOn[i] ? 'on' : 'off');
        }
        for (let i = 0; i < chipRects.length; i += 1) paintChip(i, 'done');
        caption.textContent = tr('caption.measure', 'Asking {q} keys that were never put in.', {
          q: queries,
        });
      },

      showDone(onBits: number, m: number, percent: number, queries: number) {
        const pct = percent.toFixed(1);
        onValue.textContent = tr('value.onBits', '{on} / {m}', { on: onBits, m });
        fpValue.textContent = tr('value.percent', '{pct}%', { pct });
        // 자리가 다 차면 무엇을 물어도 "있다" 가 된다. 그것은 실패 신호다.
        const full = onBits >= m;
        fpValue.setAttribute('fill', full ? colors.danger : colors.text);
        barFill.setAttribute('width', String(m > 0 ? (BAR_W * onBits) / m : 0));
        caption.textContent = full
          ? tr('caption.full', 'Every slot is on. Whatever you ask, the answer is "present".')
          : tr('caption.done', '{on} of {m} slots on. False positives {pct}% of {q}.', {
              on: onBits,
              m,
              pct,
              q: queries,
            });
      },

      reset() {
        clearStats();
        caption.textContent = '';
      },
    };
  },
};
