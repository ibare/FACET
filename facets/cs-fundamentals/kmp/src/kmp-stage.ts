/**
 * kmp-stage — 같은 글 위에서 두 방식을 위아래로 나란히 돌린다.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 주장이 **견줌**이므로, 화면의 주어는 글자가 아니라 견준 횟수다. 그래서 두
 * 훑기 아래에 막대 둘을 두고, 단순 막대에서 KMP 막대를 넘어선 구간만 색을 달리
 * 칠한다. **그 붉은 구간이 곧 헛수고다** — 수를 따로 읽지 않아도 길이로 보인다.
 *
 * 위아래 두 판은 같은 칸 격자를 쓴다. 두 패턴 띠가 같은 자로 미끄러져야 "하나는
 * 한 칸, 하나는 겹친 만큼" 이 한 문장이 되기 때문이다.
 *
 *   위   단순. 맞힌 만큼 차오르던 이음 띠가 어긋나는 순간 0 으로 무너진다
 *        (조각 `naiveShiftByOne` 의 어휘).
 *   아래 KMP. 남긴 겹침은 가라앉은 색으로 그대로 두고 그만큼만 민다. 그 값을
 *        준 표 칸에 불이 들어온다 (조각 `prefixSuffixJump` 의 어휘).
 *
 * ── 애니메이션이 없다
 *
 * 한 판이 마흔 걸음 넘게 가므로 걸음마다 트윈을 두면 한 판이 너무 길어진다.
 * 걸음의 길이는 알고리즘의 `sleep` 이 정하고 여기서는 즉시 칠한다. 그래서
 * **기다리는 promise 도 거둘 타이머도 없다** — `destroy` 가 할 일은 캔버스를
 * 비우는 것뿐이다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view).
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 384;
const PAD = 18;

/**
 * 격자가 쓰는 가로 구간 — 캔버스를 통째로 쓴다.
 *
 * 행 표식을 격자 **왼쪽 고정 폭 여백**에 두었다가 물렀다. 프랑스어
 * `Table des recouvrements` 나 포르투갈어 `Uma de cada vez` 처럼 긴 번역이
 * 첫 칸을 덮기 때문이다 — **언어마다 길이가 다른 것을 고정 폭으로 감당할 수
 * 없다.** 표식을 각 행 위로 올리니 그 걱정이 사라지고 칸도 넓어졌다.
 */
const GRID_L = PAD;
const GRID_R = W - PAD;

const CELL_H = 26;
const CELL_GAP = 1;
/** 칸 안에 글자를 적을 수 있는 최소 너비. 이보다 좁으면 칸만 칠한다. */
const GLYPH_MIN_W = 9;

const NAIVE_MARK_Y = 12;
const NAIVE_TEXT_Y = 18;
const SEAM_Y = 48;
const SEAM_H = 6;
const NAIVE_PAT_Y = 58;
const DIVIDER_Y = 96;
const KMP_MARK_Y = 110;
const KMP_TEXT_Y = 116;
const KMP_PAT_Y = 150;
const TABLE_Y = 186;
const TABLE_H = 20;
/** 표식은 표 칸 **오른쪽**에 선다 — 표는 패턴 길이만큼만 차지해 자리가 남는다. */
const TABLE_MARK_GAP = 12;

const NAIVE_BAR_LABEL_Y = 234;
const NAIVE_BAR_Y = 242;
const KMP_BAR_LABEL_Y = 272;
const KMP_BAR_Y = 280;
const BAR_H = 11;
const BAR_W = 540;
const BAR_VALUE_X = GRID_L + BAR_W + 14;
const WASTE_LABEL_Y = 322;
const WASTE_VALUE_Y = 322;
const CAPTION_Y = 360;

/**
 * 막대의 자. 견줌 300 이 막대 전체 길이다.
 *
 * 손잡이를 밀 때마다 다시 재면 막대가 늘 꽉 차서 **아무것도 자라 보이지 않는다.**
 * 고정해 두어야 패턴을 길게 밀 때 단순 막대가 실제로 길어지는 것이 보인다.
 * 실측 최대는 길이 12 에서 279 다.
 */
const BAR_FULL = 300;

/**
 * 도형에 새겨진 표식 — 그 분야에서 원어 그대로 통용되는 말이라 키를 만들지
 * 않는다 (C10 의 표식 판정 2번). 짝인 "단순" 은 조사가 붙는 말이라 키다.
 */
const MARK_KMP = 'KMP';

type CellTone = 'idle' | 'hit' | 'miss' | 'kept';

type Cell = { rect: SVGRectElement; glyph: SVGTextElement | null };

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

export const kmpStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    const init = params.initialData as Record<string, unknown> | undefined;
    const initText = typeof init?.text === 'string' ? init.text : '';
    const initPatterns = Array.isArray(init?.patterns)
      ? (init.patterns as unknown[]).filter((x): x is string => typeof x === 'string')
      : [];
    const initLength = typeof init?.patternLength === 'number' ? init.patternLength : 0;
    const initPattern =
      initPatterns.find((p) => p.length === initLength) ??
      [...initPatterns].sort((a, b) => a.length - b.length)[0] ??
      '';

    // ── 고정 층 ────────────────────────────────────────────────
    const naiveMark = text(PAD, NAIVE_MARK_Y, fontSizes.xs, colors.textMuted);
    naiveMark.textContent = tr('label.naive', 'One at a time');
    svg.appendChild(naiveMark);

    const kmpMark = text(PAD, KMP_MARK_Y, fontSizes.xs, colors.textMuted);
    kmpMark.textContent = MARK_KMP;
    svg.appendChild(kmpMark);

    svg.appendChild(
      el('line', {
        x1: PAD,
        y1: DIVIDER_Y,
        x2: GRID_R,
        y2: DIVIDER_Y,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    // 가로 자리는 패턴 길이가 정하므로 `build` 가 다시 놓는다.
    const tableMark = text(PAD, TABLE_Y + 14, fontSizes.xs, colors.textMuted);
    tableMark.textContent = tr('label.table', 'Overlap table');
    svg.appendChild(tableMark);

    const naiveBarMark = text(GRID_L, NAIVE_BAR_LABEL_Y, fontSizes.xs, colors.textMuted);
    naiveBarMark.textContent = tr('label.naiveCompares', 'Compares, one at a time');
    svg.appendChild(naiveBarMark);

    const kmpBarMark = text(GRID_L, KMP_BAR_LABEL_Y, fontSizes.xs, colors.textMuted);
    kmpBarMark.textContent = tr('label.kmpCompares', 'Compares, KMP');
    svg.appendChild(kmpBarMark);

    for (const y of [NAIVE_BAR_Y, KMP_BAR_Y]) {
      svg.appendChild(
        el('rect', {
          x: GRID_L,
          y,
          width: BAR_W,
          height: BAR_H,
          rx: BAR_H / 2,
          fill: colors.bgSubtle,
          stroke: colors.border,
        }),
      );
    }

    // 단순 막대는 두 토막이다. 앞쪽은 KMP 도 치른 몫, 뒤쪽이 더 치른 몫이다.
    const naiveBarPaid = el('rect', {
      x: GRID_L,
      y: NAIVE_BAR_Y,
      width: 0,
      height: BAR_H,
      rx: BAR_H / 2,
      fill: colors.itemComparing,
    });
    svg.appendChild(naiveBarPaid);
    const naiveBarWasted = el('rect', {
      x: GRID_L,
      y: NAIVE_BAR_Y,
      width: 0,
      height: BAR_H,
      rx: BAR_H / 2,
      fill: colors.itemSwapping,
    });
    svg.appendChild(naiveBarWasted);
    const kmpBar = el('rect', {
      x: GRID_L,
      y: KMP_BAR_Y,
      width: 0,
      height: BAR_H,
      rx: BAR_H / 2,
      fill: colors.itemSorted,
    });
    svg.appendChild(kmpBar);

    const naiveBarValue = text(BAR_VALUE_X, NAIVE_BAR_Y + BAR_H, fontSizes.md, colors.text);
    svg.appendChild(naiveBarValue);
    const kmpBarValue = text(BAR_VALUE_X, KMP_BAR_Y + BAR_H, fontSizes.md, colors.text);
    svg.appendChild(kmpBarValue);

    const wasteMark = text(GRID_L, WASTE_LABEL_Y, fontSizes.sm, colors.textMuted);
    wasteMark.textContent = tr('label.waste', 'Wasted compares');
    svg.appendChild(wasteMark);
    const wasteValue = text(BAR_VALUE_X, WASTE_VALUE_Y, fontSizes.xl, colors.text);
    svg.appendChild(wasteValue);

    const caption = text(PAD, CAPTION_Y, fontSizes.sm, colors.text);
    svg.appendChild(caption);

    // ── 다시 지어지는 층 ────────────────────────────────────────
    const naiveTextG = el('g', {});
    svg.appendChild(naiveTextG);
    const kmpTextG = el('g', {});
    svg.appendChild(kmpTextG);
    const foundG = el('g', {});
    svg.appendChild(foundG);
    const naiveStripG = el('g', {});
    svg.appendChild(naiveStripG);
    const seam = el('rect', {
      x: GRID_L,
      y: SEAM_Y,
      width: 0,
      height: SEAM_H,
      rx: SEAM_H / 2,
      fill: colors.itemPivot,
    });
    svg.appendChild(seam);
    const kmpStripG = el('g', {});
    svg.appendChild(kmpStripG);
    const tableG = el('g', {});
    svg.appendChild(tableG);

    let cellW = 11;
    let originX = GRID_L;
    let naiveTextCells: Cell[] = [];
    let kmpTextCells: Cell[] = [];
    let naivePatCells: Cell[] = [];
    let kmpPatCells: Cell[] = [];
    let tableCells: Cell[] = [];
    let patternLen = 0;

    function toneFill(tone: CellTone): string {
      if (tone === 'hit') return colors.itemPivot;
      if (tone === 'miss') return colors.itemSwapping;
      if (tone === 'kept') return colors.itemSorted;
      return colors.itemDefault;
    }

    /** 칸 위의 잉크. 타일이 테마를 따라 뒤집으면 잉크도 뒤집는다 (design-tokens 의 stateInk 표). */
    function toneInk(tone: CellTone): string {
      if (tone === 'hit' || tone === 'miss') return colors.stateInk;
      if (tone === 'kept') return colors.textInverse;
      return colors.text;
    }

    function paint(cell: Cell | undefined, tone: CellTone): void {
      if (cell === undefined) return;
      const fill = toneFill(tone);
      cell.rect.setAttribute('fill', fill);
      cell.rect.setAttribute('stroke', tone === 'idle' ? colors.border : fill);
      cell.glyph?.setAttribute('fill', toneInk(tone));
    }

    function makeCell(parent: SVGElement, x: number, y: number, glyph: string, h: number): Cell {
      const rect = el('rect', {
        x,
        y,
        width: Math.max(1, cellW - CELL_GAP),
        height: h,
        rx: 3,
        fill: colors.itemDefault,
        stroke: colors.border,
      });
      parent.appendChild(rect);
      let label: SVGTextElement | null = null;
      if (cellW >= GLYPH_MIN_W && glyph !== '') {
        label = text(
          x + (cellW - CELL_GAP) / 2,
          y + h / 2 + 4,
          fontSizes.xs,
          colors.text,
          'middle',
        );
        label.textContent = glyph;
        parent.appendChild(label);
      }
      return { rect, glyph: label };
    }

    function row(parent: SVGElement, chars: string, y: number, h: number): Cell[] {
      const out: Cell[] = [];
      for (let i = 0; i < chars.length; i += 1) {
        out.push(makeCell(parent, originX + i * cellW, y, chars[i] ?? '', h));
      }
      return out;
    }

    /** 이번 판의 글과 패턴으로 화면을 다시 짓는다. 세로는 건드리지 않는다. */
    function build(source: string, pattern: string): void {
      const n = Math.max(1, source.length);
      cellW = Math.max(2, Math.floor((GRID_R - GRID_L) / n));
      originX = GRID_L + Math.round((GRID_R - GRID_L - n * cellW) / 2);
      patternLen = pattern.length;

      naiveTextG.textContent = '';
      kmpTextG.textContent = '';
      naiveStripG.textContent = '';
      kmpStripG.textContent = '';
      tableG.textContent = '';
      foundG.textContent = '';

      naiveTextCells = row(naiveTextG, source, NAIVE_TEXT_Y, CELL_H);
      kmpTextCells = row(kmpTextG, source, KMP_TEXT_Y, CELL_H);
      naivePatCells = row(naiveStripG, pattern, NAIVE_PAT_Y, CELL_H);
      kmpPatCells = row(kmpStripG, pattern, KMP_PAT_Y, CELL_H);
      tableCells = row(tableG, ' '.repeat(pattern.length), TABLE_Y, TABLE_H);
      for (const cell of tableCells) {
        cell.rect.setAttribute('fill', colors.bg);
        cell.rect.setAttribute('stroke-dasharray', '3 2');
      }
      tableMark.setAttribute('x', String(originX + patternLen * cellW + TABLE_MARK_GAP));
      seam.setAttribute('width', '0');
      seam.setAttribute('x', String(originX));
      placeStrip(naiveStripG, 0);
      placeStrip(kmpStripG, 0);
    }

    function placeStrip(group: SVGGElement, at: number): void {
      group.setAttribute('transform', `translate(${at * cellW}, 0)`);
    }

    /** 표 칸의 값을 적는다. `lit` 이면 지금 그 값을 빌려 쓰는 중이다. */
    function paintTable(index: number, value: number | null, lit: boolean): void {
      const cell = tableCells[index];
      if (cell === undefined) return;
      const filled = value !== null;
      cell.rect.setAttribute('fill', lit ? colors.itemPivot : filled ? colors.bgSubtle : colors.bg);
      cell.rect.setAttribute('stroke', lit ? colors.itemPivot : colors.border);
      cell.rect.setAttribute('stroke-dasharray', filled || lit ? '' : '3 2');
      if (cell.glyph !== null) {
        cell.glyph.textContent = value === null ? '' : String(value);
        cell.glyph.setAttribute('fill', lit ? colors.stateInk : colors.text);
      }
    }

    let tableValues: (number | null)[] = [];

    function clearRow(cells: Cell[]): void {
      for (const cell of cells) paint(cell, 'idle');
    }

    function markFound(at: number, y: number): void {
      foundG.appendChild(
        el('rect', {
          x: originX + at * cellW,
          y,
          width: Math.max(2, patternLen * cellW - CELL_GAP),
          height: 3,
          rx: 1.5,
          fill: colors.itemPivot,
        }),
      );
    }

    function setBars(naive: number, kmp: number): void {
      const scale = BAR_W / BAR_FULL;
      const nW = Math.min(BAR_W, naive * scale);
      const kW = Math.min(BAR_W, kmp * scale);
      const paid = Math.min(nW, kW);
      naiveBarPaid.setAttribute('width', String(paid));
      naiveBarWasted.setAttribute('x', String(GRID_L + paid));
      naiveBarWasted.setAttribute('width', String(Math.max(0, nW - paid)));
      kmpBar.setAttribute('width', String(kW));
      naiveBarValue.textContent = String(naive);
      kmpBarValue.textContent = String(kmp);
      wasteValue.textContent = String(Math.max(0, naive - kmp));
    }

    let naiveCompares = 0;
    let kmpCompares = 0;

    function clearAll(): void {
      naiveCompares = 0;
      kmpCompares = 0;
      setBars(0, 0);
      wasteValue.textContent = '';
      naiveBarValue.textContent = '';
      kmpBarValue.textContent = '';
      tableValues = new Array<number | null>(patternLen).fill(null);
      for (let i = 0; i < patternLen; i += 1) paintTable(i, null, false);
      clearRow(naiveTextCells);
      clearRow(kmpTextCells);
      clearRow(naivePatCells);
      clearRow(kmpPatCells);
      foundG.textContent = '';
      seam.setAttribute('width', '0');
      placeStrip(naiveStripG, 0);
      placeStrip(kmpStripG, 0);
    }

    build(initText, initPattern);
    tableValues = new Array<number | null>(patternLen).fill(null);
    caption.textContent = tr(
      'caption.setup',
      'The same text, two ways. {m} letters to find in {n}.',
      { m: initPattern.length, n: initText.length },
    );

    return {
      destroy() {
        // 거둘 타이머도 프레임도 없다 — 이 stage 는 애니메이션을 두지 않았고
        // 걸음의 길이는 알고리즘이 정한다. 캔버스 자체는 러너의 것이라 두고 간다.
        svg.textContent = '';
      },

      setup(source: string, pattern: string) {
        build(source, pattern);
        clearAll();
        caption.textContent = tr(
          'caption.setup',
          'The same text, two ways. {m} letters to find in {n}.',
          { m: pattern.length, n: source.length },
        );
      },

      tableCell(index: number, value: number, compares: number) {
        tableValues[index] = value;
        paintTable(index, value, false);
        // 표를 세우는 것도 견줌이다. 그 값은 요약에서 따로 밝힌다.
        caption.textContent = tr(
          'caption.build',
          'Building the overlap table: slot {i} takes {v}. That cost {c} compares so far.',
          { i: index, v: value, c: compares },
        );
      },

      naiveSpot(shift: number, matched: number, mismatch: number, compares: number, hit: boolean) {
        naiveCompares = compares;
        clearRow(naiveTextCells);
        clearRow(naivePatCells);
        placeStrip(naiveStripG, shift);
        for (let j = 0; j < matched; j += 1) {
          paint(naiveTextCells[shift + j], 'hit');
          paint(naivePatCells[j], 'hit');
        }
        if (mismatch >= 0) {
          paint(naiveTextCells[shift + mismatch], 'miss');
          paint(naivePatCells[mismatch], 'miss');
        }
        // 맞힌 만큼 차오르는 띠. 다음 자리에서 0 으로 무너지는 것이 곧 버리는 일이다.
        seam.setAttribute('x', String(originX + shift * cellW));
        seam.setAttribute('width', String(Math.max(0, matched * cellW - CELL_GAP)));
        if (hit) markFound(shift, SEAM_Y);
        setBars(naiveCompares, kmpCompares);
      },

      kmpSpot(
        start: number,
        keep: number,
        matched: number,
        mismatch: number,
        compares: number,
        hit: boolean,
        border: number,
        to: number,
      ) {
        kmpCompares = compares;
        clearRow(kmpTextCells);
        clearRow(kmpPatCells);
        placeStrip(kmpStripG, start);
        // 앞 `keep` 글자는 지난 걸음이 남겨 준 것이다. 다시 견주지 않았다.
        for (let j = 0; j < keep; j += 1) {
          paint(kmpTextCells[start + j], 'kept');
          paint(kmpPatCells[j], 'kept');
        }
        for (let j = keep; j < matched; j += 1) {
          paint(kmpTextCells[start + j], 'hit');
          paint(kmpPatCells[j], 'hit');
        }
        if (mismatch >= 0) {
          paint(kmpTextCells[start + mismatch], 'miss');
          paint(kmpPatCells[mismatch], 'miss');
        }
        // 표에서 값을 빌린 칸에 불이 들어온다.
        for (let i = 0; i < patternLen; i += 1) {
          paintTable(i, tableValues[i] ?? null, false);
        }
        const borrowed = hit ? patternLen - 1 : matched - 1;
        if (borrowed >= 0 && matched > 0) paintTable(borrowed, tableValues[borrowed] ?? null, true);

        if (hit) {
          markFound(start, KMP_PAT_Y - 6);
          caption.textContent = tr(
            'caption.hit',
            'Found it. KMP keeps the {b} letters that overlap and carries on.',
            { b: border },
          );
        } else if (matched === 0) {
          caption.textContent = tr('caption.kmpNone', 'Nothing matched here, so slide one.');
        } else {
          caption.textContent = tr(
            'caption.kmpKeep',
            'Matched {n}, then a mismatch. KMP keeps {b} and slides {s}.',
            { n: matched, b: border, s: to - start },
          );
        }
        setBars(naiveCompares, kmpCompares);
      },

      naiveEnd(compares: number) {
        naiveCompares = compares;
        clearRow(naiveTextCells);
        clearRow(naivePatCells);
        seam.setAttribute('width', '0');
        setBars(naiveCompares, kmpCompares);
      },

      kmpEnd(compares: number) {
        kmpCompares = compares;
        clearRow(kmpTextCells);
        clearRow(kmpPatCells);
        for (let i = 0; i < patternLen; i += 1) paintTable(i, tableValues[i] ?? null, false);
        setBars(naiveCompares, kmpCompares);
        caption.textContent = tr(
          'caption.kmpEnd',
          'KMP has read the whole text. The other one is still going.',
          {},
        );
      },

      // 헛수고는 받지 않고 여기서 다시 뺀다 — 두 막대의 길이 차와 같은 수여야
      // 하므로, 실어 온 값을 믿기보다 보이는 것에서 셈하는 편이 어긋날 자리가 없다.
      showMeasure(naive: number, kmp: number, table: number) {
        naiveCompares = naive;
        kmpCompares = kmp;
        setBars(naive, kmp);
        caption.textContent = tr(
          'caption.measure',
          '{a} compares against {b}, plus {t} to build the table.',
          { a: naive, b: kmp, t: table },
        );
      },

      showDone(naive: number, kmp: number, waste: number) {
        naiveCompares = naive;
        kmpCompares = kmp;
        setBars(naive, kmp);
        caption.textContent = tr(
          'caption.done',
          'Sliding one at a time wasted {w} compares. Push the handle and watch it grow.',
          { w: waste },
        );
      },

      reset() {
        clearAll();
        caption.textContent = '';
      },
    };
  },
};
