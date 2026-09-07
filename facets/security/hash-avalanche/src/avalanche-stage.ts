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
 * 색 토큰 (S-view 결정 트리):
 *   - 다른 비트 — palette.accent (변화 강조)
 *   - 켜진 비트(1) — palette.textMuted
 *   - 꺼진 비트(0) — palette.bgSubtle
 *   - 캡션 — palette.text
 */

import type { View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스 ──────────────────────────────────────────────────────────────
/**
 * 캔버스 폭.
 *
 * playground 의 넓은 컨테이너가 아니라 글의 문단 폭에 맞춘다. 조각이 놓이는
 * 자리는 문서 본문이고 (보통 600~800px), viewBox SVG 는 늘리면 글자까지 비례해
 * 커지므로 컨테이너를 다 채우게 두면 조각이 아니라 포스터가 된다.
 */
const W = 620;
const H = 372;

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

/** 한 행이 물드는 간격 (ms). 위에서 아래로 훑는 느낌을 준다. */
const PAINT_ROW_MS = 40;

type InitPayload = {
  algorithmLabel: string;
  inputA: string;
  inputB: string;
  inputBitsA: boolean[];
  inputBitsB: boolean[];
  inputFlipped: boolean[];
  outputBitsA: boolean[];
  outputBitsB: boolean[];
  outputFlipped: boolean[];
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 한 격자. 비트 값으로 칠해 두고, 나중에 다른 자리만 강조색으로 덮는다. */
type Grid = {
  group: SVGGElement;
  cells: SVGRectElement[];
};

export const avalancheStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);

    const BIT_ON = palette.textMuted;
    const BIT_OFF = palette.bgSubtle;
    const BIT_DIFF = palette.accent;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img' });
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    container.appendChild(svg);

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
    svg.append(inCount, arrow, outCount);

    let inA: Grid | null = null;
    let inB: Grid | null = null;
    let outA: Grid | null = null;
    let outB: Grid | null = null;
    let inputFlipped: boolean[] = [];
    let outputFlipped: boolean[] = [];

    // ── 타이머 ──────────────────────────────────────────────────────────
    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number): void {
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
        rect.style.transition = 'fill 160ms ease-out, stroke 160ms ease-out';
        group.appendChild(rect);
        cells.push(rect);
      });
      group.style.opacity = '0';
      group.style.transition = 'opacity 220ms ease-out';
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

    /**
     * 다른 자리를 강조한다. 두 격자에 같은 색을 칠하면 안 된다 — 다른 자리의
     * *위치* 는 양쪽이 같으므로, 위치만 칠하면 두 격자가 똑같아져 차이가 사라진다.
     *
     * 다른 자리는 정의상 한쪽이 1이고 다른 쪽이 0이다. 그래서 1 은 채우고 0 은
     * 테두리만 남기면 두 격자가 서로 반전된 무늬가 되어, 같은 강조색을 쓰면서도
     * 어느 쪽이 켜졌는지가 보인다.
     */
    function paintDiff(
      pairs: { grid: Grid | null; bits: boolean[] }[],
      flipped: boolean[],
      cols: number,
    ): void {
      flipped.forEach((isDiff, i) => {
        if (!isDiff) return;
        const row = Math.floor(i / cols);
        later(() => {
          for (const { grid, bits } of pairs) {
            const cell = grid?.cells[i];
            if (!cell) continue;
            const on = bits[i] === true;
            cell.setAttribute('fill', on ? BIT_DIFF : BIT_OFF);
            cell.setAttribute('stroke', BIT_DIFF);
          }
        }, row * PAINT_ROW_MS);
      });
    }

    function restoreBits(grid: Grid | null, bits: boolean[]): void {
      if (!grid) return;
      grid.cells.forEach((rect, i) => {
        rect.setAttribute('fill', bits[i] ? BIT_ON : BIT_OFF);
        rect.setAttribute('stroke', 'none');
      });
    }

    let snapshot: InitPayload | null = null;

    function resetAll(): void {
      clearTimers();
      captionEvent.textContent = '';
      inCount.textContent = '';
      outCount.textContent = '';
      arrow.textContent = '';
      for (const g of [inA, inB, outA, outB]) {
        if (g) g.group.style.opacity = '0';
      }
      if (snapshot) {
        restoreBits(inA, snapshot.inputBitsA);
        restoreBits(inB, snapshot.inputBitsB);
        restoreBits(outA, snapshot.outputBitsA);
        restoreBits(outB, snapshot.outputBitsB);
      }
    }

    return {
      destroy() {
        clearTimers();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset: resetAll,

      init(p: InitPayload) {
        clearTimers();
        snapshot = p;
        gridsGroup.textContent = '';
        charLabelsGroup.textContent = '';

        labelA.textContent = p.inputA;
        labelB.textContent = p.inputB;
        labelA.style.opacity = '0';
        labelB.style.opacity = '0';
        labelA.style.transition = 'opacity 220ms ease-out';
        labelB.style.transition = 'opacity 220ms ease-out';

        inA = makeGrid(p.inputBitsA, COL_A_CX, IN_Y, IN_COLS, IN_CELL, IN_PITCH, IN_W);
        inB = makeGrid(p.inputBitsB, COL_B_CX, IN_Y, IN_COLS, IN_CELL, IN_PITCH, IN_W);
        outA = makeGrid(p.outputBitsA, COL_A_CX, OUT_Y, OUT_COLS, OUT_CELL, OUT_PITCH, OUT_W);
        outB = makeGrid(p.outputBitsB, COL_B_CX, OUT_Y, OUT_COLS, OUT_CELL, OUT_PITCH, OUT_W);
        makeCharLabels(p.inputA, COL_A_CX);
        makeCharLabels(p.inputB, COL_B_CX);
        charLabelsGroup.style.opacity = '0';
        charLabelsGroup.style.transition = 'opacity 220ms ease-out';

        inputFlipped = p.inputFlipped;
        outputFlipped = p.outputFlipped;

        captionEvent.textContent = '';
        inCount.textContent = '';
        outCount.textContent = '';
        arrow.textContent = '';
      },

      setBaseCaption(value: string) {
        captionBase.textContent = value;
      },

      setCaption(value: string) {
        captionEvent.textContent = value;
      },

      /** 견줄 두 항을 함께 놓는다 — 순서를 매기지 않는다. */
      revealInputs() {
        labelA.style.opacity = '1';
        labelB.style.opacity = '1';
        charLabelsGroup.style.opacity = '1';
        if (inA) inA.group.style.opacity = '1';
        if (inB) inB.group.style.opacity = '1';
      },

      markInputDiff(countLabel: string) {
        if (snapshot) {
          paintDiff(
            [
              { grid: inA, bits: snapshot.inputBitsA },
              { grid: inB, bits: snapshot.inputBitsB },
            ],
            inputFlipped,
            IN_COLS,
          );
        }
        inCount.textContent = countLabel;
      },

      revealOutputs(arrowLabel: string) {
        arrow.textContent = arrowLabel;
        if (outA) outA.group.style.opacity = '1';
        if (outB) outB.group.style.opacity = '1';
      },

      markOutputDiff(countLabel: string) {
        if (snapshot) {
          paintDiff(
            [
              { grid: outA, bits: snapshot.outputBitsA },
              { grid: outB, bits: snapshot.outputBitsB },
            ],
            outputFlipped,
            OUT_COLS,
          );
        }
        outCount.textContent = countLabel;
      },
    };
  },
};
