/**
 * rabin-karp-stage — 글 한 줄, 그 위를 지나는 창, 그리고 **두 개의 원장**.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 이 facet 의 주장은 "얼마나 만지는가" 하나다. 그래서 화면의 중심은 해시가
 * 아니라 **누적**이고, 누적은 막대다.
 *
 * 원장 두 줄이 글줄과 **같은 가로 범위**에 놓인다. 창이 오른쪽으로 밀려갈수록
 * 두 막대가 함께 자라는데, 굴리는 쪽은 창의 걸음과 같은 속도로 곧게 늘고 단순
 * 쪽은 그보다 훨씬 빨리 늘어 글줄 끝을 넘본다. 두 막대의 자라는 속도 차이가
 * 곧 주장이라, 수를 읽지 않아도 보인다.
 *
 * 아래의 대조는 같은 막대 어휘를 손잡이 다섯 값에 한 번 더 쓴다. 굴리는 쪽
 * 다섯이 **한 치도 다르지 않은 높이**로 서고 단순 쪽 다섯이 계단으로 오른다.
 *
 * ── 창은 물들이고 두 글자는 표시한다
 *
 * 창 안은 옅게 깔고, 한 걸음에 실제로 만진 둘 — 빠지는 글자와 들어오는 글자 —
 * 만 물들인다. 창 전체가 아니라 그 둘이 이 알고리즘이 한 일이기 때문이다.
 *
 * 해시가 같아진 자리에서는 창 전체가 물든다. 그것이 확인이 m 글자를 더 만지는
 * 순간이고, 원장의 굴리는 쪽 막대가 그 자리에서 한 번 껑충 뛴다.
 *
 * ── 뒷일을 남기지 않는다
 *
 * 타이머도 프레임 루프도 없고 promise 를 돌려주는 메서드도 없다. 걸음의 박자는
 * algorithm 의 `ctx.sleep` 이 긋고 여기 메서드는 전부 동기로 즉시 반영한다.
 * 구독하는 전역도 없으므로 `destroy` 는 그린 것을 걷기만 한다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 손잡이가 바꾸는 것은 창의 너비와
 * 막대의 길이뿐이고 둘 다 가로다. 색은 전부 design-tokens 경유이며 hex 리터럴은
 * 없다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스
const W = 720;
const H = 348;

// ── 글줄. 원장과 대조가 모두 이 가로 범위를 공유한다.
const X0 = 30;
const STRIP_W = 660;

// ── 찾는 조각
const PAT_LABEL_Y = 22;
const PAT_X = 116;
const PAT_Y = 6;
const PAT_CELL_W = 17;
const PAT_CELL_H = 22;
const CHIP_GAP = 14;
const CHIP_W = 88;
const CHIP_H = 22;

// ── 글줄
const STRIP_Y = 52;
const STRIP_H = 30;

// ── 지금 창의 해시
const HASH_Y = 92;

// ── 원장
const LEDGER_A_LABEL_Y = 136;
const LEDGER_A_BAR_Y = 142;
const LEDGER_B_LABEL_Y = 180;
const LEDGER_B_BAR_Y = 186;
const BAR_H = 14;

/**
 * 원장과 대조가 함께 쓰는 세로 눈금의 상한.
 *
 * 이 데이터에서 가장 큰 수는 패턴 길이 10 의 단순 견줌 279 다. 300 으로 두어
 * 그것이 천장에 붙지 않게 한다. 눈금이 손잡이를 따라 바뀌면 막대의 길이를
 * 눈으로 견줄 수 없으므로 다섯 값에 걸쳐 고정이다.
 */
const SCALE_MAX = 300;

// ── 대조
const CH_LABEL_Y = 222;
const CH_Y0 = 230;
const CH_Y1 = 292;
const CH_TICK_Y = 304;
const CH_BAR_W = 26;

// ── 캡션 두 줄
const CAPTION_Y = 326;
const VERDICT_Y = 342;

/**
 * 두 방식의 식별 색. 알고리즘 상태가 아니라 **서로 다른 계열**을 가리키므로
 * categorical 시드에서 뽑는다 (S-view 결정 트리 3). 원장과 대조가 같은 인덱스를
 * 써야 위아래가 같은 것을 말한다.
 */
const SERIES_ROLLED = 0;
const SERIES_NAIVE = 1;

/** 도식 라벨 한 단어는 표식이다 — 키를 만들지 않는다 (C10). */
const HASH_MARK = 'hash';

type Point = { m: number; rolled: number; naive: number };
type CellTone = 'plain' | 'inside' | 'out' | 'in' | 'hit';

export type RabinKarpScene = { text: string; patternEnd: number; patternLength: number };

/**
 * `initialData` 를 좁힌다. 좁히개는 stage 가 내주고 `mount` 가 부른다 — 좁히는
 * 규칙이 두 벌이 되지 않게.
 */
export function readRabinKarpScene(raw: unknown): RabinKarpScene {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    text: typeof d.text === 'string' ? d.text : '',
    patternEnd: typeof d.patternEnd === 'number' ? d.patternEnd : 0,
    patternLength: typeof d.patternLength === 'number' ? d.patternLength : 0,
  };
}

function node(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
  return e;
}

function clearGroup(g: SVGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

export const rabinKarpStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const series = categorical(2, 'vivid');
    const rolledInk = series[SERIES_ROLLED] ?? colors.text;
    const naiveInk = series[SERIES_NAIVE] ?? colors.textMuted;

    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 러너는 캔버스를 컨테이너에
    // 먼저 붙이고 mount 를 부르므로, 컨테이너를 비우면 그림판이 통째로 떨어져
    // 나가고 예외 없이 화면만 빈다 (S-view).
    canvas.textContent = '';

    const gPattern = node('g', {});
    const gStrip = node('g', {});
    const gMark = node('g', {});
    const gLedger = node('g', {});
    const gChart = node('g', {});
    for (const g of [gPattern, gStrip, gMark, gLedger, gChart]) canvas.appendChild(g);

    function label(
      x: number,
      y: number,
      s: string,
      fill: string,
      size: string,
      anchor: string,
      family: string = fonts.body,
    ): SVGElement {
      const el = node('text', {
        x,
        y,
        fill,
        'font-size': size,
        'font-family': family,
        'text-anchor': anchor,
      });
      el.textContent = s;
      return el;
    }

    const captionEl = label(W / 2, CAPTION_Y, '', colors.text, fontSizes.sm, 'middle');
    const verdictEl = label(W / 2, VERDICT_Y, '', colors.textMuted, fontSizes.xs, 'middle');
    canvas.appendChild(captionEl);
    canvas.appendChild(verdictEl);

    const scene = readRabinKarpScene(params.initialData);

    // ── 상태
    let text = scene.text;
    let patternLength = scene.patternLength;
    let cellW = 11;
    const cellRects: SVGElement[] = [];
    const cellTexts: SVGElement[] = [];
    let frame: SVGElement | null = null;
    let hashChip: SVGElement | null = null;
    let hashValue: SVGElement | null = null;
    let matchStart: number | null = null;
    let rolledBar: SVGElement | null = null;
    let naiveBar: SVGElement | null = null;
    let rolledValue: SVGElement | null = null;
    let naiveValue: SVGElement | null = null;

    // ── 좌표
    const cellX = (i: number): number => X0 + i * cellW;
    const cellMid = (i: number): number => cellX(i) + cellW / 2;
    const windowMid = (start: number): number => X0 + (start + patternLength / 2) * cellW;
    const barLen = (value: number): number =>
      Math.max(0, Math.min(1, value / SCALE_MAX)) * STRIP_W;

    function paintCell(i: number, tone: CellTone): void {
      const rect = cellRects[i];
      const glyph = cellTexts[i];
      if (!rect || !glyph) return;
      const fill =
        tone === 'out'
          ? colors.itemSwapping
          : tone === 'in'
            ? colors.itemComparing
            : tone === 'hit'
              ? colors.itemPivot
              : tone === 'inside'
                ? colors.bgSubtle
                : colors.itemDefault;
      rect.setAttribute('fill', fill);
      glyph.setAttribute('fill', tone === 'plain' || tone === 'inside' ? colors.text : colors.stateInk);
    }

    // ── 글줄 짓기
    function drawStrip(): void {
      clearGroup(gStrip);
      clearGroup(gMark);
      cellRects.length = 0;
      cellTexts.length = 0;
      matchStart = null;

      const letters = [...text];
      const count = Math.max(1, letters.length);
      cellW = STRIP_W / count;

      gStrip.appendChild(
        node('rect', {
          x: X0,
          y: STRIP_Y,
          width: STRIP_W,
          height: STRIP_H,
          rx: 4,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      letters.forEach((ch, i) => {
        const rect = node('rect', {
          x: cellX(i) + 0.5,
          y: STRIP_Y + 2,
          width: Math.max(1, cellW - 1),
          height: STRIP_H - 4,
          rx: 1.5,
          fill: colors.itemDefault,
        });
        gStrip.appendChild(rect);
        cellRects.push(rect);

        const glyph = label(
          cellMid(i),
          STRIP_Y + STRIP_H / 2 + 4,
          ch,
          colors.text,
          fontSizes.xs,
          'middle',
          fonts.mono,
        );
        gStrip.appendChild(glyph);
        cellTexts.push(glyph);
      });

      // 창틀 — 글줄 위에 얹는다.
      frame = node('rect', {
        x: X0,
        y: STRIP_Y - 3,
        width: Math.max(1, cellW * patternLength),
        height: STRIP_H + 6,
        rx: 5,
        fill: 'none',
        stroke: colors.text,
        'stroke-width': 2,
        opacity: 0,
      });
      gMark.appendChild(frame);

      // 지금 창의 해시 — 창 아래를 따라다닌다.
      hashChip = node('rect', {
        x: X0,
        y: HASH_Y,
        width: CHIP_W,
        height: CHIP_H,
        rx: CHIP_H / 2,
        fill: colors.itemDefault,
        stroke: colors.border,
        'stroke-width': 1,
        opacity: 0,
      });
      gMark.appendChild(hashChip);
      hashValue = label(X0, HASH_Y + 15, '', colors.text, fontSizes.sm, 'middle', fonts.mono);
      gMark.appendChild(hashValue);
    }

    // ── 찾는 조각 짓기
    function drawPattern(pattern: string, patternHash: number | null): void {
      clearGroup(gPattern);
      gPattern.appendChild(
        label(X0, PAT_LABEL_Y, t('label.pattern', 'Pattern'), colors.textMuted, fontSizes.xs, 'start'),
      );

      const letters = [...pattern];
      letters.forEach((ch, i) => {
        gPattern.appendChild(
          node('rect', {
            x: PAT_X + i * PAT_CELL_W,
            y: PAT_Y,
            width: PAT_CELL_W - 1,
            height: PAT_CELL_H,
            rx: 3,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        gPattern.appendChild(
          label(
            PAT_X + i * PAT_CELL_W + (PAT_CELL_W - 1) / 2,
            PAT_Y + PAT_CELL_H / 2 + 4,
            ch,
            colors.text,
            fontSizes.sm,
            'middle',
            fonts.mono,
          ),
        );
      });

      if (patternHash === null) return;
      const chipX = PAT_X + letters.length * PAT_CELL_W + CHIP_GAP;
      gPattern.appendChild(
        label(chipX - 6, PAT_Y + PAT_CELL_H / 2 + 4, HASH_MARK, colors.textMuted, fontSizes.xs, 'end'),
      );
      gPattern.appendChild(
        node('rect', {
          x: chipX + 22,
          y: PAT_Y,
          width: CHIP_W,
          height: CHIP_H,
          rx: CHIP_H / 2,
          fill: colors.itemDefault,
          stroke: colors.text,
          'stroke-width': 1.5,
        }),
      );
      gPattern.appendChild(
        label(
          chipX + 22 + CHIP_W / 2,
          PAT_Y + PAT_CELL_H / 2 + 4,
          String(patternHash),
          colors.text,
          fontSizes.sm,
          'middle',
          fonts.mono,
        ),
      );
    }

    // ── 원장 짓기
    function drawLedgerFrame(): void {
      clearGroup(gLedger);

      const rows: Array<[string, number, number, string]> = [
        [
          t('label.rolled', 'Letters the rolling hash touched'),
          LEDGER_A_LABEL_Y,
          LEDGER_A_BAR_Y,
          rolledInk,
        ],
        [
          t('label.naive', 'Letters plain comparison read'),
          LEDGER_B_LABEL_Y,
          LEDGER_B_BAR_Y,
          naiveInk,
        ],
      ];

      const bars: SVGElement[] = [];
      const values: SVGElement[] = [];
      for (const [name, labelY, barY, ink] of rows) {
        gLedger.appendChild(label(X0, labelY, name, colors.textMuted, fontSizes.xs, 'start'));
        values.push(
          gLedger.appendChild(
            label(X0 + STRIP_W, labelY, '', ink, fontSizes.sm, 'end', fonts.mono),
          ),
        );
        // 눈금 바탕 — 막대가 얼마나 남았는지 보이게 한다.
        gLedger.appendChild(
          node('rect', {
            x: X0,
            y: barY,
            width: STRIP_W,
            height: BAR_H,
            rx: 3,
            fill: colors.bgSubtle,
          }),
        );
        bars.push(
          gLedger.appendChild(
            node('rect', { x: X0, y: barY, width: 0, height: BAR_H, rx: 3, fill: ink }),
          ),
        );
      }

      rolledBar = bars[0] ?? null;
      naiveBar = bars[1] ?? null;
      rolledValue = values[0] ?? null;
      naiveValue = values[1] ?? null;
    }

    // ── 대조 짓기
    function drawChartFrame(): void {
      clearGroup(gChart);
      gChart.appendChild(
        label(X0, CH_LABEL_Y, t('label.byLength', 'By pattern length'), colors.textMuted, fontSizes.xs, 'start'),
      );
      gChart.appendChild(
        node('line', {
          x1: X0,
          y1: CH_Y1,
          x2: X0 + STRIP_W,
          y2: CH_Y1,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
    }

    function drawContrast(points: Point[], current: number): void {
      drawChartFrame();
      if (points.length === 0) return;
      const groupW = STRIP_W / points.length;
      const span = CH_Y1 - CH_Y0;
      const height = (value: number): number =>
        Math.max(1, Math.min(1, value / SCALE_MAX) * span);

      points.forEach((p, i) => {
        const cx = X0 + (i + 0.5) * groupW;

        if (p.m === current) {
          gChart.appendChild(
            node('rect', {
              x: cx - groupW / 2,
              y: CH_Y0 - 6,
              width: groupW,
              height: CH_Y1 - CH_Y0 + 6 + 16,
              fill: colors.subtreeShadeRight,
            }),
          );
        }

        const pair: Array<[number, string, number]> = [
          [p.rolled, rolledInk, cx - CH_BAR_W - 3],
          [p.naive, naiveInk, cx + 3],
        ];
        for (const [value, ink, x] of pair) {
          const h = height(value);
          gChart.appendChild(
            node('rect', { x, y: CH_Y1 - h, width: CH_BAR_W, height: h, rx: 2, fill: ink }),
          );
          gChart.appendChild(
            label(
              x + CH_BAR_W / 2,
              CH_Y1 - h - 4,
              String(value),
              ink,
              fontSizes.xs,
              'middle',
              fonts.mono,
            ),
          );
        }

        gChart.appendChild(
          label(
            cx,
            CH_TICK_Y,
            String(p.m),
            p.m === current ? colors.text : colors.textMuted,
            fontSizes.xs,
            'middle',
            fonts.mono,
          ),
        );
      });
    }

    // ── 첫 틀
    function initialFrame(): void {
      text = scene.text;
      patternLength = scene.patternLength;
      drawStrip();
      drawPattern(
        scene.text.slice(scene.patternEnd - scene.patternLength + 1, scene.patternEnd + 1),
        null,
      );
      drawLedgerFrame();
      drawChartFrame();
      captionEl.textContent = '';
      verdictEl.textContent = '';
    }

    initialFrame();

    return {
      destroy(): void {
        // 거둘 타이머도 구독도 없다 (파일 머리말 참조). 그린 것만 걷는다.
        canvas.textContent = '';
      },

      clear(): void {
        initialFrame();
      },

      setup(m: number, nextText: string, pattern: string, patternHash: number): void {
        text = nextText;
        patternLength = m;
        drawStrip();
        drawPattern(pattern, patternHash);
        drawLedgerFrame();
        drawChartFrame();
      },

      showWindow(w: {
        start: number;
        hash: number;
        match: boolean;
        outIndex: number | null;
        inIndex: number | null;
      }): void {
        for (let i = 0; i < cellRects.length; i += 1) paintCell(i, 'plain');
        for (let k = 0; k < patternLength; k += 1) paintCell(w.start + k, 'inside');
        // 한 걸음에 실제로 만진 둘만 물든다 — 그것이 이 알고리즘이 한 일이다.
        if (w.outIndex !== null) paintCell(w.outIndex, 'out');
        if (w.inIndex !== null) paintCell(w.inIndex, 'in');
        // 이미 찾은 자리는 계속 남겨 둔다.
        if (matchStart !== null) {
          for (let k = 0; k < patternLength; k += 1) paintCell(matchStart + k, 'hit');
        }

        frame?.setAttribute('x', String(cellX(w.start)));
        frame?.setAttribute('width', String(Math.max(1, cellW * patternLength)));
        frame?.setAttribute('opacity', '1');

        const mid = windowMid(w.start);
        const chipX = Math.max(X0, Math.min(X0 + STRIP_W - CHIP_W, mid - CHIP_W / 2));
        hashChip?.setAttribute('x', String(chipX));
        hashChip?.setAttribute('opacity', '1');
        hashChip?.setAttribute('fill', w.match ? colors.itemPivot : colors.itemDefault);
        hashChip?.setAttribute('stroke', w.match ? colors.text : colors.border);
        if (hashValue) {
          hashValue.textContent = String(w.hash);
          hashValue.setAttribute('x', String(chipX + CHIP_W / 2));
          hashValue.setAttribute('fill', w.match ? colors.stateInk : colors.text);
        }
      },

      verify(start: number, ok: boolean): void {
        // 확인은 창의 글자를 하나씩 견준다 — 여기서 m 글자를 더 만진다.
        for (let k = 0; k < patternLength; k += 1) paintCell(start + k, ok ? 'hit' : 'out');
      },

      found(start: number): void {
        matchStart = start;
        for (let k = 0; k < patternLength; k += 1) paintCell(start + k, 'hit');
        gMark.appendChild(
          node('line', {
            x1: cellX(start),
            y1: STRIP_Y + STRIP_H + 5,
            x2: cellX(start) + cellW * patternLength,
            y2: STRIP_Y + STRIP_H + 5,
            stroke: colors.itemPivot,
            'stroke-width': 3,
            'stroke-linecap': 'round',
          }),
        );
      },

      setLedger(touched: number, naive: number): void {
        rolledBar?.setAttribute('width', String(barLen(touched)));
        naiveBar?.setAttribute('width', String(barLen(naive)));
        if (rolledValue) rolledValue.textContent = String(touched);
        if (naiveValue) naiveValue.textContent = String(naive);
      },

      setContrast(points: Point[], current: number): void {
        drawContrast(points, current);
      },

      setCaption(value: string): void {
        captionEl.textContent = value;
      },

      setVerdict(value: string): void {
        verdictEl.textContent = value;
      },
    };
  },
};
