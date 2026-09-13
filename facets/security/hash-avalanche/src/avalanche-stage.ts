/**
 * avalanche-stage View — 해시 눈사태 효과 단일 캔버스.
 *
 * 화면에는 언제나 견줄 두 항이 함께 있다:
 *   - 위: 두 입력과 그 비트 (한 글자 = 한 행 = 8비트)
 *   - 아래: 각 입력의 해시 비트 (16×16 = 256비트)
 *   - 각 층 아래에 "다른 비트 / 전체 비트"
 *
 * 차이만 그린 격자 하나를 두지 않는 이유:
 *   차이는 두 항이 있어야 성립한다. 결과만 칠하면 무엇과 무엇의 차이인지가
 *   화면에서 사라지고, "5비트가 다르다" 같은 수치도 근거를 잃는다. 대신 두 항을
 *   나란히 놓고 다른 자리만 동시에 물들여, 비교를 사람 눈이 아니라 화면이 한다.
 *
 * 입력도 비트로 펼치는 이유:
 *   입력을 글자로만 두면 출력의 비트 차이와 견줄 수가 없다. 같은 형식이어야
 *   12.5% → 51.2% 라는 증폭이 한 화면에서 읽힌다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`revealInputs()` · `markInputDiff()` …) 를 두지 않는다.
 * 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터 다시
 * 밟는 수밖에 없었다. 대신 `render(next, prev)` 하나가 **그 장면의 화면 전체**를
 * 세운다 — 어느 걸음에서 어느 걸음으로 가든 같은 길이다.
 *
 * 부드러움은 `opts.animate` 가 정한다. 참이면 CSS transition 이 흐르고 격자는
 * 행마다 시차를 두어 물든다. 거짓이면 전환을 잠깐 끄고 곧바로 그 자리에 세운다 —
 * 되짚기와 첫 그림이 그 길이다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 다른 비트 — palette.accent (변화 강조)
 *   - 켜진 비트(1) — palette.textMuted
 *   - 꺼진 비트(0) — palette.bgSubtle
 *   - 캡션 — palette.text
 */

import type { CanvasView, ViewInstance, ViewMountParams, Translate } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W, makeTranslator } from '@ffacet/core/runtime';
import type { AvalancheScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스 ──────────────────────────────────────────────────────────────
const W = PIECE_CANVAS_W;
const H = 392;

// ── 두 컬럼 (좌: 원본, 우: 한 글자 바뀐 것) ─────────────────────────────
const COL_A_CX = 160;
const COL_B_CX = 460;

// ── 입력 격자: 한 글자 = 한 행 = 8비트 ──────────────────────────────────
const IN_COLS = 8;
const IN_CELL = 11;
const IN_PITCH = IN_CELL + 1;
const IN_W = IN_COLS * IN_PITCH - 1;
const IN_Y = 68;

// ── 출력 격자: 256비트 = 16×16 ──────────────────────────────────────────
const OUT_COLS = 16;
const OUT_CELL = 8;
const OUT_PITCH = OUT_CELL + 1;
const OUT_W = OUT_COLS * OUT_PITCH - 1;
const OUT_Y = 188;

// ── 세로 배치 ───────────────────────────────────────────────────────────
const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const INPUT_LABEL_Y = 58;
const IN_COUNT_Y = 148;
const ARROW_Y = 172;
const OUT_COUNT_Y = 356;
const NOTE_Y = 382;

/** 격자가 행마다 물드는 시차. 한 줄씩 번지는 것이 눈사태의 운동이다. */
const PAINT_ROW_MS = 40;
const FADE_MS = 220;
const CELL_MS = 160;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 한 격자. 비트 값으로 칠해 두고, 다른 자리만 강조색으로 덮는다. */
type Grid = {
  group: SVGGElement;
  cells: SVGRectElement[];
};

export const avalancheStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const BIT_ON = palette.textMuted;
    const BIT_OFF = palette.bgSubtle;
    const BIT_DIFF = palette.accent;

    const svg = params.canvas;

    function text(
      x: number,
      y: number,
      opts: { anchor?: string; fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    // ── 캡션 ────────────────────────────────────────────────────────────
    const captionBase = text(W / 2, CAPTION_BASE_Y);
    const captionEvent = text(W / 2, CAPTION_EVENT_Y, { fill: BIT_DIFF, weight: '600' });
    svg.append(captionBase, captionEvent);

    // ── 입력 라벨 ───────────────────────────────────────────────────────
    const labelA = text(COL_A_CX, INPUT_LABEL_Y, { family: fonts.mono, size: fontSizes.md });
    const labelB = text(COL_B_CX, INPUT_LABEL_Y, { family: fonts.mono, size: fontSizes.md });
    svg.append(labelA, labelB);

    // ── 격자 / 카운트 / 화살표 ──────────────────────────────────────────
    const gridsGroup = el('g');
    const charLabelsGroup = el('g');
    svg.append(gridsGroup, charLabelsGroup);

    const inCount = text(W / 2, IN_COUNT_Y, { family: fonts.mono, weight: '600' });
    const arrow = text(W / 2, ARROW_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const outCount = text(W / 2, OUT_COUNT_Y, {
      family: fonts.mono,
      size: fontSizes.lg,
      weight: '600',
    });
    const note = text(W / 2, NOTE_Y, { fill: palette.textMuted, size: fontSizes.xs });
    svg.append(inCount, arrow, outCount, note);

    let inA: Grid | null = null;
    let inB: Grid | null = null;
    let outA: Grid | null = null;
    let outB: Grid | null = null;

    /** 지금 화면이 세워진 장면의 자료. 이것이 바뀌면 격자를 다시 짓는다. */
    let built: AvalancheScene | null = null;
    let destroyed = false;

    // ── 시차 칠하기에 걸어 둔 것 ────────────────────────────────────────
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number): void {
      if (destroyed) return;
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }
    function clearTimers(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
    }

    function makeGrid(
      bits: boolean[],
      cx: number,
      y: number,
      cols: number,
      cell: number,
      pitch: number,
      width: number,
    ): Grid {
      const group = el('g');
      const left = Math.round(cx - width / 2);
      const cells: SVGRectElement[] = [];
      bits.forEach((on, i) => {
        const rect = el('rect', {
          x: left + (i % cols) * pitch,
          y: y + Math.floor(i / cols) * pitch,
          width: cell,
          height: cell,
          rx: 1,
          fill: on ? BIT_ON : BIT_OFF,
          stroke: 'none',
          'stroke-width': 1.2,
        });
        group.appendChild(rect);
        cells.push(rect);
      });
      gridsGroup.appendChild(group);
      return { group, cells };
    }

    /** 입력 격자 왼쪽에 글자를 적어 "한 글자 = 한 행" 을 드러낸다. */
    function makeCharLabels(value: string, cx: number): void {
      const left = Math.round(cx - IN_W / 2);
      [...value].forEach((ch, row) => {
        const t = text(left - 8, IN_Y + row * IN_PITCH + IN_CELL - 1, {
          anchor: 'end',
          fill: palette.textMuted,
          family: fonts.mono,
          size: fontSizes.xs,
        });
        t.textContent = ch;
        charLabelsGroup.appendChild(t);
      });
    }

    /** 자료가 바뀌었으면 격자를 다시 짓는다. 같은 자료면 그대로 쓴다. */
    function build(scene: AvalancheScene): void {
      clearTimers();
      gridsGroup.textContent = '';
      charLabelsGroup.textContent = '';

      labelA.textContent = scene.inputA;
      labelB.textContent = scene.inputB;

      inA = makeGrid(scene.inputBitsA, COL_A_CX, IN_Y, IN_COLS, IN_CELL, IN_PITCH, IN_W);
      inB = makeGrid(scene.inputBitsB, COL_B_CX, IN_Y, IN_COLS, IN_CELL, IN_PITCH, IN_W);
      outA = makeGrid(scene.outputBitsA, COL_A_CX, OUT_Y, OUT_COLS, OUT_CELL, OUT_PITCH, OUT_W);
      outB = makeGrid(scene.outputBitsB, COL_B_CX, OUT_Y, OUT_COLS, OUT_CELL, OUT_PITCH, OUT_W);
      makeCharLabels(scene.inputA, COL_A_CX);
      makeCharLabels(scene.inputB, COL_B_CX);

      built = scene;
    }

    /** 자료가 같은 장면인가 — 같으면 격자를 다시 짓지 않는다. */
    function sameData(a: AvalancheScene | null, b: AvalancheScene): boolean {
      return (
        a !== null &&
        a.inputA === b.inputA &&
        a.inputB === b.inputB &&
        a.inputBitsA.length === b.inputBitsA.length &&
        a.outputBitsA.length === b.outputBitsA.length
      );
    }

    /**
     * 격자의 칠을 그 장면의 자리로 세운다.
     *
     * 물들일 자리를 고르는 잣대는 `marked` 하나다. 참이면 다른 자리를 강조색으로,
     * 거짓이면 본래 비트 색으로 — **덮는 것이 아니라 통째로 세운다.** 그래서
     * 어느 장면에서 어느 장면으로 가든 한 길이다.
     *
     * 다른 자리에 같은 색을 칠하면 안 된다 — 다른 자리의 *위치* 는 양쪽이 같으므로,
     * 위치만 칠하면 두 격자가 똑같아져 차이가 사라진다. 다른 자리는 정의상 한쪽이
     * 1이고 다른 쪽이 0이라, 1 은 채우고 0 은 테두리만 남기면 두 격자가 서로 반전된
     * 무늬가 되어 같은 강조색을 쓰면서도 어느 쪽이 켜졌는지가 보인다.
     */
    function paintGrid(
      grid: Grid | null,
      bits: boolean[],
      flipped: boolean[],
      cols: number,
      marked: boolean,
      stagger: boolean,
    ): void {
      if (!grid) return;
      grid.cells.forEach((rect, i) => {
        const isDiff = marked && flipped[i] === true;
        const on = bits[i] === true;
        const fill = isDiff ? (on ? BIT_DIFF : BIT_OFF) : on ? BIT_ON : BIT_OFF;
        const stroke = isDiff ? BIT_DIFF : 'none';
        const set = (): void => {
          rect.setAttribute('fill', fill);
          rect.setAttribute('stroke', stroke);
        };
        // 물드는 걸음에서만 행마다 늦춘다. 되짚을 때는 한꺼번에 세운다.
        if (stagger && isDiff) later(set, Math.floor(i / cols) * PAINT_ROW_MS);
        else set();
      });
    }

    /** 전환을 걸거나 끊는다. 되짚을 때는 흐르지 않고 곧바로 앉아야 한다. */
    function setTransitions(on: boolean): void {
      const fade = on ? `opacity ${FADE_MS}ms ease-out` : 'none';
      const cellTr = on ? `fill ${CELL_MS}ms ease-out, stroke ${CELL_MS}ms ease-out` : 'none';
      for (const node of [labelA, labelB, charLabelsGroup]) node.style.transition = fade;
      for (const g of [inA, inB, outA, outB]) {
        if (!g) continue;
        g.group.style.transition = fade;
        for (const c of g.cells) c.style.transition = cellTr;
      }
    }

    return {
      destroy() {
        destroyed = true;
        clearTimers();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      /**
       * 장면 하나를 화면에 세운다.
       *
       * 지난 장면을 보고 무엇이 달라졌는지 따지지 않는다 — 늘 전부 세운다. 그래야
       * 어느 걸음에서 오든 결과가 같고, 되돌릴 명령을 따로 둘 필요가 없다.
       */
      render(next: AvalancheScene, _prev: AvalancheScene | null, opts: { animate: boolean }): void {
        // 앞서 걸어 둔 시차 칠하기는 거둔다. 두면 새 장면 위에 옛 칠이 내려앉는다.
        clearTimers();
        if (!sameData(built, next)) build(next);
        built = next;

        setTransitions(opts.animate);

        const shown = next.phase >= 1;
        labelA.style.opacity = shown ? '1' : '0';
        labelB.style.opacity = shown ? '1' : '0';
        charLabelsGroup.style.opacity = shown ? '1' : '0';
        if (inA) inA.group.style.opacity = shown ? '1' : '0';
        if (inB) inB.group.style.opacity = shown ? '1' : '0';

        const outShown = next.phase >= 3;
        if (outA) outA.group.style.opacity = outShown ? '1' : '0';
        if (outB) outB.group.style.opacity = outShown ? '1' : '0';

        const markedIn = next.phase >= 2;
        const markedOut = next.phase >= 4;
        // 시차는 **그 걸음에 막 물드는 층**에서만. 이미 물든 채 지나가는 층은 즉시.
        paintGrid(inA, next.inputBitsA, next.inputFlipped, IN_COLS, markedIn, opts.animate && next.phase === 2);
        paintGrid(inB, next.inputBitsB, next.inputFlipped, IN_COLS, markedIn, opts.animate && next.phase === 2);
        paintGrid(outA, next.outputBitsA, next.outputFlipped, OUT_COLS, markedOut, opts.animate && next.phase === 4);
        paintGrid(outB, next.outputBitsB, next.outputFlipped, OUT_COLS, markedOut, opts.animate && next.phase === 4);

        const bitDiff = (flipped: number, total: number): string =>
          tr('label.bitDiff', '{flipped} / {total} bits differ', {
            flipped: String(flipped),
            total: String(total),
          });

        inCount.textContent = markedIn ? bitDiff(next.inputFlippedBits, next.inputTotalBits) : '';
        outCount.textContent = markedOut ? bitDiff(next.outputFlippedBits, next.outputTotalBits) : '';
        arrow.textContent = outShown
          ? tr('label.through', '↓  {algorithm}  ↓', { algorithm: next.algorithmLabel })
          : '';
        captionEvent.textContent =
          next.phase >= 4
            ? tr(
                'caption.result',
                'Only {inputFlipped} of {inputTotal} input bits differ, but {outputFlipped} of {outputTotal} output bits do.',
                {
                  inputFlipped: String(next.inputFlippedBits),
                  inputTotal: String(next.inputTotalBits),
                  outputFlipped: String(next.outputFlippedBits),
                  outputTotal: String(next.outputTotalBits),
                },
              )
            : '';
        note.textContent = '';
        captionBase.textContent = '';
      },
    };
  },
};
