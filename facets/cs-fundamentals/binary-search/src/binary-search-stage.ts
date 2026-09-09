/**
 * binary-search-stage — 이진 탐색 완결형의 전용 시각화.
 *
 * 한 화면에 셋을 겹치지 않게 쌓는다.
 *
 *   1. **줄 선 값들** — 열두 칸. 남은 구간 안은 밝고 버려진 칸은 가라앉는다.
 *      지금 견주는 가운데 칸만 도드라진다.
 *   2. **남은 구간 자** — 칸 아래를 가로지르는 자 하나와 「몇 개 남았나」.
 *      구간이 비면 자가 사라진다. 그것이 「없다」의 모양이다.
 *   3. **구간 계단** — 견줄 때마다 그때의 구간을 한 줄씩 아래로 쌓는다.
 *      막대가 절반씩 짧아지며 왼쪽/오른쪽으로 붙는 것이 이진 탐색의 전부다.
 *      못 찾고 끝나면 마지막 줄이 폭 없는 표시로 남는다.
 *
 * 오른쪽 위의 알약 줄은 **몇 번 찾고 각각 어떻게 끝났는지**를 남긴다. 찾기가
 * 끝나면 화면이 다음 찾기를 위해 지워지므로, 앞선 결과가 사라지지 않게 하려면
 * 이 줄이 필요하다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 계단 자리는 다섯 줄을 미리 잡아
 * 두고, 그보다 많아지면 줄 간격을 줄여 담는다 — 높이를 늘리지 않는다.
 * 타이머도 관찰자도 두지 않으므로 `destroy()` 는 붙인 노드를 떼는 것이 전부다.
 *
 * 화면 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10). 화살표와 자리 번호는 도형에 새겨진 표식이라
 * 키를 만들지 않는다.
 */

import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 680;
const CANVAS_H = 300;

const PAD_X = 28;
const TRACK_W = CANVAS_W - PAD_X * 2;
const CELL_GAP = 4;

const CAPTION_Y1 = 18;
const CAPTION_Y2 = 36;
const CAPTION_LINES = 2;

const CHIP_Y = 46;
const CHIP_H = 24;

const CELL_Y = 86;
const CELL_H = 44;
const INDEX_BASELINE = 144;

const BRACKET_Y = 158;
const REMAIN_BASELINE = 176;

const LADDER_TITLE_BASELINE = 198;
const LADDER_Y0 = 206;
const LADDER_SLOTS = 5;
const LADDER_ROW_H = 18;
const LADDER_BAR_H = 10;

/** 도형에 새겨진 표식 — 번역하지 않는다 (C10 판정 1·3). */
const GLYPH_RIGHT = '→';
const GLYPH_LEFT = '←';
const GLYPH_HIT = '✓';
const GLYPH_MISS = '✕';

/** 견줌 한 번의 결과. 계단 한 줄이 된다. */
export type BinarySearchStepRow = {
  lo: number;
  hi: number;
  mid: number;
  outcome: 'lt' | 'gt' | 'eq';
};

/** 찾기 한 번의 상태. 알약 줄이 이것을 그린다. */
export type BinarySearchRunState = 'pending' | 'active' | 'found' | 'missing';

type CellTone = 'in' | 'out' | 'probe' | 'found';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function textNode(
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = content;
  return node;
}

/** 글자 폭 어림 — 한글·한자·아랍 문자는 라틴의 두 배 가까이 넓다. */
function widthUnits(s: string): number {
  let u = 0;
  for (const ch of s) u += ch.codePointAt(0)! >= 0x1100 ? 1 : 0.54;
  return u;
}

/** 캡션을 두 줄까지 접는다. 넘치면 마지막 줄을 줄임표로 자른다. */
function wrapCaption(text: string, maxUnits: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur === '' ? w : `${cur} ${w}`;
    if (widthUnits(next) <= maxUnits || cur === '') {
      cur = next;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length === CAPTION_LINES) break;
    }
  }
  if (lines.length < CAPTION_LINES && cur !== '') lines.push(cur);
  if (lines.length > CAPTION_LINES) lines.length = CAPTION_LINES;
  const last = lines[lines.length - 1];
  if (last !== undefined && widthUnits(last) > maxUnits) {
    let cut = last;
    while (cut.length > 1 && widthUnits(`${cut}…`) > maxUnits) cut = cut.slice(0, -1);
    lines[lines.length - 1] = `${cut}…`;
  }
  return lines;
}

export const binarySearchStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 러너 밖 mount 를 위한 fallback (C10). 러너 안에서는 언제나 params.t 가 온다.
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const root = el('g', {});
    svg.appendChild(root);

    let values: number[] = [];
    let targets: number[] = [];
    let runStates: BinarySearchRunState[] = [];
    let activeRun = 0;
    let activeTarget: number | null = null;
    let lo = 0;
    let hi = -1;
    let probe: number | null = null;
    let foundAt: number | null = null;
    let steps: BinarySearchStepRow[] = [];
    let emptyStep = false;

    const captionSize = Number.parseFloat(fontSizes.md);
    const valueSize = Number.parseFloat(fontSizes.md);
    const smallSize = Number.parseFloat(fontSizes.sm);

    const cellW = (): number => {
      const n = Math.max(1, values.length);
      return (TRACK_W - (n - 1) * CELL_GAP) / n;
    };
    const cellX = (i: number): number => PAD_X + i * (cellW() + CELL_GAP);

    let caption = '';

    const toneOf = (i: number): CellTone => {
      if (foundAt === i) return 'found';
      if (probe === i) return 'probe';
      if (activeRun === 0) return 'in';
      return i >= lo && i <= hi ? 'in' : 'out';
    };

    const fillOf = (tone: CellTone): string => {
      if (tone === 'found') return c.itemPivot;
      if (tone === 'probe') return c.itemComparing;
      if (tone === 'out') return c.bgSubtle;
      return c.itemDefault;
    };

    const inkOf = (tone: CellTone): string => {
      if (tone === 'found' || tone === 'probe') return c.stateInk;
      if (tone === 'out') return c.textMuted;
      return c.text;
    };

    const drawCaption = (): void => {
      // widthUnits 가 이미 라틴 글자를 0.54 로 세므로 단위에 글자 크기를 곱하면
      // 대략 픽셀이 된다. 나눗셈에 0.54 를 한 번 더 넣으면 두 배로 헐거워진다.
      const maxUnits = TRACK_W / captionSize;
      const lines = wrapCaption(caption, maxUnits);
      lines.forEach((line, i) => {
        root.appendChild(
          textNode(line, {
            x: PAD_X,
            y: i === 0 ? CAPTION_Y1 : CAPTION_Y2,
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: c.text,
          }),
        );
      });
    };

    const drawChipRow = (): void => {
      // 알약 줄이 오른쪽 끝을 차지하므로 그 왼쪽 자리를 먼저 잰다.
      const pillW = 54;
      const pillGap = 6;
      const count = targets.length;
      const startX =
        count === 0
          ? CANVAS_W - PAD_X
          : CANVAS_W - PAD_X - count * pillW - (count - 1) * pillGap;

      if (activeTarget !== null) {
        const label = tr('label.searchFor', 'Looking for {value}', { value: activeTarget });
        // 로케일이 길어져도 알약을 밀지 않는다.
        const w = Math.min(
          Math.max(96, widthUnits(label) * smallSize + 24),
          startX - PAD_X - 12,
        );
        root.appendChild(
          el('rect', {
            x: PAD_X,
            y: CHIP_Y,
            width: w,
            height: CHIP_H,
            rx: 12,
            fill: c.primary,
          }),
        );
        root.appendChild(
          textNode(label, {
            x: PAD_X + 12,
            y: CHIP_Y + CHIP_H / 2 + 4,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textInverse,
          }),
        );
      }

      // 알약 줄 — 오른쪽 끝에서 왼쪽으로 쌓는다.
      targets.forEach((t, i) => {
        const state = runStates[i] ?? 'pending';
        const x = startX + i * (pillW + pillGap);
        const fill =
          state === 'found' ? c.itemPivot : state === 'missing' ? c.danger : c.bgSubtle;
        const ink =
          state === 'found' || state === 'missing' ? c.stateInk : c.textMuted;
        root.appendChild(
          el('rect', {
            x,
            y: CHIP_Y,
            width: pillW,
            height: CHIP_H,
            rx: 6,
            fill,
            stroke: state === 'active' ? c.text : c.border,
            'stroke-width': state === 'active' ? 2 : 1,
          }),
        );
        const glyph =
          state === 'found' ? ` ${GLYPH_HIT}` : state === 'missing' ? ` ${GLYPH_MISS}` : '';
        root.appendChild(
          textNode(`${t}${glyph}`, {
            x: x + pillW / 2,
            y: CHIP_Y + CHIP_H / 2 + 4,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: state === 'active' ? c.text : ink,
          }),
        );
      });
    };

    const drawCells = (): void => {
      const w = cellW();
      values.forEach((v, i) => {
        const tone = toneOf(i);
        root.appendChild(
          el('rect', {
            x: cellX(i),
            y: CELL_Y,
            width: w,
            height: CELL_H,
            rx: 4,
            fill: fillOf(tone),
            stroke: tone === 'out' ? c.border : c.text,
            'stroke-width': tone === 'probe' || tone === 'found' ? 2 : 1,
          }),
        );
        root.appendChild(
          textNode(String(v), {
            x: cellX(i) + w / 2,
            y: CELL_Y + CELL_H / 2 + valueSize / 3,
            'font-family': fonts.mono,
            'font-size': fontSizes.md,
            'text-anchor': 'middle',
            fill: inkOf(tone),
          }),
        );
        root.appendChild(
          textNode(String(i), {
            x: cellX(i) + w / 2,
            y: INDEX_BASELINE,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            fill: c.textMuted,
          }),
        );
      });
    };

    const drawWindow = (): void => {
      // 찾기 밖 (시작 전 · 모두 끝난 뒤) 에는 「지금 남은 구간」이라는 것이 없다.
      // 자를 그려 두면 열두 칸이 아직 후보인 것처럼 읽힌다.
      if (activeRun === 0) return;
      const size = Math.max(0, hi - lo + 1);
      if (size > 0) {
        const w = cellW();
        const x1 = cellX(lo);
        const x2 = cellX(hi) + w;
        root.appendChild(
          el('path', {
            d: `M ${x1} ${BRACKET_Y - 4} L ${x1} ${BRACKET_Y} L ${x2} ${BRACKET_Y} L ${x2} ${BRACKET_Y - 4}`,
            fill: 'none',
            stroke: c.text,
            'stroke-width': 1.5,
          }),
        );
        root.appendChild(
          textNode(tr('label.remaining', '{count} left', { count: size }), {
            x: (x1 + x2) / 2,
            y: REMAIN_BASELINE,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: c.textMuted,
          }),
        );
        return;
      }
      // 구간이 비었다 — 자를 그리지 않는다. 그것이 「없다」의 모양이다.
      root.appendChild(
        textNode(tr('label.remaining', '{count} left', { count: 0 }), {
          x: CANVAS_W / 2,
          y: REMAIN_BASELINE,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: c.danger,
        }),
      );
    };

    const drawLadder = (): void => {
      root.appendChild(
        textNode(tr('label.history', 'Ranges searched'), {
          x: PAD_X,
          y: LADDER_TITLE_BASELINE,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        }),
      );

      const rowCount = steps.length + (emptyStep ? 1 : 0);
      if (rowCount === 0) return;
      // 다섯 줄 자리를 미리 잡아 두고, 넘치면 줄 간격을 줄여 담는다 (S-view).
      const rowH = Math.min(LADDER_ROW_H, (LADDER_SLOTS * LADDER_ROW_H) / rowCount);
      const barH = Math.min(LADDER_BAR_H, rowH - 4);
      const w = cellW();

      steps.forEach((s, r) => {
        const y = LADDER_Y0 + r * rowH;
        const x1 = cellX(s.lo);
        const x2 = cellX(s.hi) + w;
        root.appendChild(
          el('rect', {
            x: x1,
            y,
            width: Math.max(2, x2 - x1),
            height: barH,
            rx: 2,
            fill: c.bgSubtle,
            stroke: c.border,
          }),
        );
        root.appendChild(
          el('rect', {
            x: cellX(s.mid),
            y,
            width: w,
            height: barH,
            rx: 2,
            fill: s.outcome === 'eq' ? c.itemPivot : c.itemComparing,
          }),
        );
        root.appendChild(
          textNode(String(s.hi - s.lo + 1), {
            x: PAD_X - 6,
            y: y + barH - 1,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'end',
            fill: c.textMuted,
          }),
        );
        const glyph =
          s.outcome === 'eq' ? GLYPH_HIT : s.outcome === 'lt' ? GLYPH_RIGHT : GLYPH_LEFT;
        root.appendChild(
          textNode(glyph, {
            x: CANVAS_W - PAD_X + 6,
            y: y + barH - 1,
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: s.outcome === 'eq' ? c.text : c.textMuted,
          }),
        );
      });

      if (!emptyStep) return;
      const y = LADDER_Y0 + steps.length * rowH;
      root.appendChild(
        el('line', {
          x1: PAD_X,
          y1: y + barH / 2,
          x2: CANVAS_W - PAD_X,
          y2: y + barH / 2,
          stroke: c.danger,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        }),
      );
      const label = tr('label.emptyRange', 'the range is empty');
      root.appendChild(
        el('rect', {
          x: CANVAS_W / 2 - (widthUnits(label) * smallSize) / 2 - 8,
          y: y - 2,
          width: widthUnits(label) * smallSize + 16,
          height: barH + 4,
          rx: 3,
          fill: c.bg,
        }),
      );
      root.appendChild(
        textNode(label, {
          x: CANVAS_W / 2,
          y: y + barH - 1,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: c.danger,
        }),
      );
      root.appendChild(
        textNode('0', {
          x: PAD_X - 6,
          y: y + barH - 1,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
          fill: c.danger,
        }),
      );
    };

    const render = (): void => {
      while (root.firstChild) root.removeChild(root.firstChild);
      drawCaption();
      drawChipRow();
      drawCells();
      drawWindow();
      drawLadder();
    };

    render();

    return {
      setData(next: number[]): void {
        values = [...next];
        lo = 0;
        hi = values.length - 1;
        render();
      },

      setTargets(next: number[]): void {
        targets = [...next];
        runStates = targets.map(() => 'pending');
        render();
      },

      setCaption(text: string): void {
        caption = text;
        render();
      },

      beginRun(run: number, target: number): void {
        activeRun = run;
        activeTarget = target;
        runStates = runStates.map((s, i) => (i === run - 1 ? 'active' : s));
        probe = null;
        foundAt = null;
        steps = [];
        emptyStep = false;
        lo = 0;
        hi = values.length - 1;
        render();
      },

      setWindow(nextLo: number, nextHi: number): void {
        lo = nextLo;
        hi = nextHi;
        render();
      },

      setProbe(index: number | null): void {
        probe = index;
        render();
      },

      addStep(row: BinarySearchStepRow): void {
        steps = [...steps, row];
        render();
      },

      addEmptyStep(): void {
        emptyStep = true;
        render();
      },

      markFound(index: number): void {
        foundAt = index;
        probe = null;
        render();
      },

      /** 모든 찾기가 끝났다 — 남은 구간 표시를 거두고 줄을 원래 밝기로 되돌린다. */
      finish(): void {
        activeRun = 0;
        probe = null;
        render();
      },

      endRun(run: number, found: boolean): void {
        runStates = runStates.map((s, i) => (i === run - 1 ? (found ? 'found' : 'missing') : s));
        probe = null;
        render();
      },

      reset(): void {
        targets = [];
        runStates = [];
        activeRun = 0;
        activeTarget = null;
        probe = null;
        foundAt = null;
        steps = [];
        emptyStep = false;
        caption = '';
        lo = 0;
        hi = values.length - 1;
        render();
      },

      destroy(): void {
        // 타이머도 관찰자도 걸지 않았다. 붙인 노드를 떼는 것이 전부다.
        root.remove();
      },
    };
  },
};
