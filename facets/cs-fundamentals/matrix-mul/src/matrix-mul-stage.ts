/**
 * matrix-mul stage — 한 겹을 나란히 견주고, 그 차이가 깊이를 타고 벌어지는 것을 본다.
 *
 * ── 세 층
 *
 *   1. 한 겹     A × B = C 를 왼쪽에 두고, 오른쪽에 표준의 셈과 스트라센의 셈을
 *                **나란히** 세운다. 나란히 두는 것이 이 화면의 주장이다 — 곱이
 *                여덟이냐 일곱이냐는 견주어야만 보인다.
 *   2. 깊이별    겹을 하나씩 쌓으며 곱셈 둘을 막대로 세우고, 그 아래 아낀 곱셈을
 *                적는다. 세로는 **로그 자**다.
 *   3. 총계      고른 깊이에서의 n · 곱셈 둘 · 아낀 곱셈.
 *
 * ── 왜 로그 자인가, 그리고 그것이 왜 주장을 깎지 않는가
 *
 * 8ᵏ 와 7ᵏ 는 깊이 7 에서 이백만과 팔십만이다. 선형 자에 나란히 세우면 깊이 1~5 가
 * 전부 바닥에 깔려 사라진다. 로그 자에서는 둘이 **천천히 벌어지는 곧은 선 둘**이
 * 되고, 그 벌어짐이 곧 log(8/7)·k 라 깊이에 정비례한다.
 *
 * 여기가 요점이다. **막대는 천천히 벌어지는데 그 아래 적힌 아낀 곱셈은 자릿수가
 * 뛴다.** 눈이 보는 완만함과 수가 말하는 폭발이 한 화면에서 어긋나는 것 — 그것이
 * "배율이 아니라 증폭이 주장이다" 의 그림꼴이다. 로그 자는 그 어긋남을 만들기
 * 위해 고른 것이지 수를 눌러 담으려고 고른 것이 아니다.
 *
 * ── 타이머를 두지 않는다
 *
 * 모든 메서드는 받은 값으로 즉시 다시 그리고 끝난다. 그래서 `destroy()` 가 거둘
 * 뒷일이 없다 — 이 문장은 사실이어야 하므로, 나중에 애니메이션을 넣는다면 이
 * 주석부터 고쳐야 한다 (S-view).
 *
 * 세로는 mount 에서 한 번 정하고 그 뒤로 바꾸지 않는다. 손잡이를 밀면 깊이 칸이
 * 둘에서 여덟로 늘지만 **가로로만** 잘게 갈린다 (S-view).
 */

import {
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 356;

// ── 1층. 한 겹.
const LAYER_LABEL_Y = 20;
const GRID_TOP = 34;
const CELL = 30;
const GRID_X_A = 20;
/** 열 둘. 왼쪽이 표준, 오른쪽이 스트라센. */
const COL_STD_X = 276;
const COL_FAST_X = 498;
const COL_HEAD_Y = 34;
const COL_ROW_Y = 66;
const COL_ROW_H = 17;

// ── 2층. 깊이별.
const DEPTH_LABEL_Y = 196;
const BAR_TOP = 208;
const BAR_H = 62;
const BAR_BASE = BAR_TOP + BAR_H;
const DEPTH_L = 26;
const DEPTH_R = 700;
const SAVED_Y = BAR_BASE + 26;
const TICK_Y = BAR_BASE + 13;

// ── 3층. 총계와 캡션.
const TALLY_Y = 326;
const CAPTION_Y = 346;

/**
 * 견주는 것이 둘이라 categorical 시드에서 뽑는다 (S-view 결정 트리 3).
 * 알고리즘 상태가 아니라 **두 방법의 식별**이므로 state 어휘를 쓰지 않는다.
 */
const METHOD_TONE = 'vivid' as const;
const METHOD_STANDARD = 0;
const METHOD_STRASSEN = 1;

/** 도형에 새겨진 표식 — 번역하면 화면과 어긋난다 (C10). */
const SYM_TIMES = '×';
const SYM_EQUALS = '=';
/** 아직 셈하기 전임을 뜻하는 자리표. 0 을 적으면 없는 상태를 주장하게 된다. */
const SYM_PENDING = '—';
/** 아래 첨자. `a₁₁` 은 수식 표기라 표식이다. */
const SUB = ['₁', '₂', '₃', '₄'];

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 자릿수가 뛰는 것이 이 화면의 요점이라 세 자리마다 끊어 준다. 표식이다. */
function group(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const sub = (i: number): string => SUB[i] ?? String(i + 1);
/** `a₁₁` — 행렬 이름과 자리 번호. */
const nameAt = (matrix: string, row: number, col: number): string =>
  `${matrix}${sub(row)}${sub(col)}`;

/** `(a₁₁+a₂₂)` 처럼 항을 이어 적는다. 원소가 하나면 괄호를 두르지 않는다. */
function partsText(matrix: string, parts: { row: number; col: number; sign: number }[]): string {
  if (parts.length === 0) return '';
  const first = parts[0]!;
  let out = (first.sign < 0 ? '−' : '') + nameAt(matrix, first.row, first.col);
  for (const p of parts.slice(1)) {
    out += (p.sign < 0 ? '−' : '+') + nameAt(matrix, p.row, p.col);
  }
  return parts.length === 1 ? out : `(${out})`;
}

type Matrix = number[][];
type Pair = { row: number; col: number; k: number; left: number; right: number; value: number };
type Part = { row: number; col: number; sign: number };
type Term = {
  index: number;
  leftParts: Part[];
  rightParts: Part[];
  left: number;
  right: number;
  value: number;
};
type Combine = { row: number; col: number; parts: { index: number; sign: number }[]; value: number };

type Scene = { a: Matrix; b: Matrix; depth: number; depths: number[] };

/**
 * 선언을 좁히는 자리는 여기다 — `params.initialData` 를 받는 유일한 경로이고,
 * projector 가 없어도 반드시 불린다.
 */
function readScene(data: unknown): Scene | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  const matrix = (v: unknown): Matrix | null => {
    if (!Array.isArray(v)) return null;
    const out: Matrix = [];
    for (const row of v) {
      if (!Array.isArray(row)) return null;
      const line: number[] = [];
      for (const cell of row) {
        if (typeof cell !== 'number' || !Number.isFinite(cell)) return null;
        line.push(cell);
      }
      out.push(line);
    }
    return out;
  };
  const a = matrix(d.a);
  const b = matrix(d.b);
  if (!a || !b || a.length === 0 || b.length === 0) return null;
  const depth = typeof d.depth === 'number' ? d.depth : 1;
  const depths = Array.isArray(d.depths)
    ? d.depths.filter((x): x is number => typeof x === 'number')
    : [depth];
  return { a, b, depth, depths };
}

export const matrixMulStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    // 컨테이너에는 손대지 않는다 — 그릴 자리는 러너가 이미 붙여 준 캔버스다.
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었으므로 비우면
    // 그림이 통째로 사라진다 (S-view). 지울 것은 캔버스 안쪽뿐이다.
    const svg = params.canvas;
    svg.textContent = '';

    const colors: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    const methodInk = categorical(2, METHOD_TONE);
    const inkStandard = methodInk[METHOD_STANDARD] ?? colors.text;
    const inkStrassen = methodInk[METHOD_STRASSEN] ?? colors.textMuted;

    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }));

    // 층마다 제 무리를 두고, 갱신은 그 무리만 비우고 다시 그린다.
    const gGrids = el('g', {});
    const gStandard = el('g', {});
    const gStrassen = el('g', {});
    const gDepth = el('g', {});
    const gTally = el('g', {});
    const gCaption = el('g', {});
    svg.append(gGrids, gStandard, gStrassen, gDepth, gTally, gCaption);

    function text(
      x: number,
      y: number,
      content: string,
      opts: { fill: string; size?: string; anchor?: string; weight?: string; mono?: boolean },
    ): SVGTextElement {
      const t = el('text', {
        x,
        y,
        fill: opts.fill,
        'font-size': opts.size ?? fontSizes.xs,
        'font-family': opts.mono ? fonts.mono : fonts.body,
        'text-anchor': opts.anchor ?? 'start',
      });
      if (opts.weight) t.setAttribute('font-weight', opts.weight);
      t.textContent = content;
      return t;
    }

    // ── 1층. A × B = C.

    /** 한 행렬을 격자로 그린다. `values` 가 null 인 칸은 아직 셈하기 전이다. */
    function drawGrid(
      into: SVGGElement,
      x: number,
      label: string,
      values: Matrix | null,
      rows: number,
      cols: number,
      filled: boolean,
    ): number {
      const width = cols * CELL;
      into.appendChild(
        text(x, GRID_TOP - 6, label, { fill: colors.textMuted, mono: true }),
      );
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const cx = x + col * CELL;
          const cy = GRID_TOP + row * CELL;
          into.appendChild(
            el('rect', {
              x: cx,
              y: cy,
              width: CELL,
              height: CELL,
              fill: filled ? colors.bgSubtle : colors.bg,
              stroke: colors.border,
              'stroke-width': 1,
              rx: 3,
            }),
          );
          const value = values?.[row]?.[col];
          into.appendChild(
            text(cx + CELL / 2, cy + CELL / 2 + 4, value === undefined ? SYM_PENDING : String(value), {
              fill: value === undefined ? colors.textMuted : colors.text,
              size: fontSizes.sm,
              anchor: 'middle',
              mono: true,
            }),
          );
        }
      }
      return x + width;
    }

    function drawGrids(a: Matrix, b: Matrix, c: Matrix | null): void {
      gGrids.textContent = '';
      const rows = a.length;
      const inner = b.length;
      const cols = b[0]?.length ?? 0;
      const midY = GRID_TOP + (rows * CELL) / 2 + 4;

      let x = drawGrid(gGrids, GRID_X_A, 'A', a, rows, inner, true);
      gGrids.appendChild(
        text(x + 10, midY, SYM_TIMES, { fill: colors.textMuted, size: fontSizes.md }),
      );
      x = drawGrid(gGrids, x + 26, 'B', b, inner, cols, true);
      gGrids.appendChild(
        text(x + 10, midY, SYM_EQUALS, { fill: colors.textMuted, size: fontSizes.md }),
      );
      drawGrid(gGrids, x + 26, 'C', c, rows, cols, c !== null);
    }

    /** 한 열의 머리 — 이름과 곱셈·덧셈 수. */
    function drawColumnHead(
      into: SVGGElement,
      x: number,
      name: string,
      ink: string,
      mults: number,
      adds: number,
    ): void {
      into.appendChild(el('rect', { x, y: COL_HEAD_Y - 11, width: 3, height: 14, fill: ink }));
      into.appendChild(
        text(x + 10, COL_HEAD_Y, name, { fill: colors.text, size: fontSizes.sm, weight: '600' }),
      );
      into.appendChild(
        text(x + 10, COL_HEAD_Y + 16, tr('label.mults', '{count} multiplications', { count: mults }), {
          fill: ink,
          weight: '600',
        }),
      );
      into.appendChild(
        text(x + 112, COL_HEAD_Y + 16, tr('label.adds', '{count} additions', { count: adds }), {
          fill: colors.textMuted,
        }),
      );
    }

    /**
     * 표준 — C 의 칸마다 한 줄. 짝을 이어 적고 합으로 닫는다.
     * 조각 `rowTimesColumn` 이 한 칸에서 보인 것을 네 칸으로 편 것이다.
     */
    function drawStandard(pairs: Pair[], c: Matrix, mults: number, adds: number): void {
      gStandard.textContent = '';
      drawColumnHead(gStandard, COL_STD_X, tr('label.standard', 'Standard'), inkStandard, mults, adds);

      const byCell = new Map<string, Pair[]>();
      for (const p of pairs) {
        const key = `${p.row},${p.col}`;
        const bucket = byCell.get(key) ?? [];
        bucket.push(p);
        byCell.set(key, bucket);
      }

      let row = 0;
      for (const [key, bucket] of byCell) {
        const [r, col] = key.split(',').map(Number);
        const y = COL_ROW_Y + row * COL_ROW_H;
        const terms = bucket
          .map((p) => `${nameAt('a', p.row, p.k)}${nameAt('b', p.k, p.col)}`)
          .join('+');
        gStandard.appendChild(
          text(COL_STD_X, y, `${nameAt('c', r ?? 0, col ?? 0)} = ${terms}`, {
            fill: colors.textMuted,
            mono: true,
          }),
        );
        gStandard.appendChild(
          text(COL_STD_X + 196, y, String(c[r ?? 0]?.[col ?? 0] ?? 0), {
            fill: colors.text,
            anchor: 'end',
            mono: true,
            weight: '600',
          }),
        );
        row += 1;
      }
    }

    /** 스트라센 — 곱 하나에 한 줄. 피연산자가 합·차라는 것이 줄의 모양으로 보인다. */
    function drawStrassen(terms: Term[], mults: number, adds: number): void {
      gStrassen.textContent = '';
      drawColumnHead(gStrassen, COL_FAST_X, tr('label.strassen', 'Strassen'), inkStrassen, mults, adds);

      terms.forEach((t, i) => {
        const y = COL_ROW_Y + i * COL_ROW_H;
        const formula = `${partsText('a', t.leftParts)}${partsText('b', t.rightParts)}`;
        gStrassen.appendChild(
          text(COL_FAST_X, y, `M${sub(t.index - 1)} = ${formula}`, {
            fill: colors.textMuted,
            mono: true,
          }),
        );
        gStrassen.appendChild(
          text(COL_FAST_X + 196, y, String(t.value), {
            fill: colors.text,
            anchor: 'end',
            mono: true,
            weight: '600',
          }),
        );
      });
    }

    /** 되맞추기 — 곱이 하나도 없다는 것을 줄의 모양이 말한다. */
    function drawCombines(combines: Combine[]): void {
      combines.forEach((c, i) => {
        const y = COL_ROW_Y + i * COL_ROW_H;
        const formula = c.parts
          .map((p, j) => `${p.sign < 0 ? '−' : j === 0 ? '' : '+'}M${sub(p.index - 1)}`)
          .join('');
        gStandard.appendChild(
          text(COL_STD_X, y, `${nameAt('c', c.row, c.col)} = ${formula}`, {
            fill: colors.textMuted,
            mono: true,
          }),
        );
        gStandard.appendChild(
          text(COL_STD_X + 196, y, String(c.value), {
            fill: inkStrassen,
            anchor: 'end',
            mono: true,
            weight: '600',
          }),
        );
      });
    }

    // ── 2층. 깊이별 곱셈.

    /** 지금까지 받은 깊이 걸음. 손잡이가 바뀌면 비운다. */
    let levels: { level: number; standard: number; fast: number; saved: number }[] = [];
    /** 지금 고른 깊이. 그 칸을 짙게 하는 데만 쓴다. */
    let top = scene?.depth ?? 1;

    /**
     * 깊이 자의 끝 — **선언이 정한 눈금의 맨 끝**이지 지금 고른 깊이가 아니다.
     *
     * 자를 손잡이에 맞춰 다시 그리면 어느 깊이에서나 칸이 폭을 꽉 채워, 깊이 1 과
     * 깊이 7 이 **같은 그림**이 된다. 그러면 손잡이를 밀어도 아무 일이 없는 것처럼
     * 보이고 이 화면의 주장이 통째로 사라진다. 자를 고정해 두어야 손잡이를 밀 때
     * 칸이 오른쪽으로 **뻗어 나가고**, 그 아래 아낀 곱셈의 자릿수가 뛰는 것이 보인다.
     *
     * 이 값은 stage 가 스스로 정하지 않는다 — algorithm 을 참조할 수 없으므로
     * (원칙 1) `initialData.depths` 로 받는다. 선언 · algorithm · stage 셋이 갈리지
     * 않게 묶는 것은 검사의 몫이다.
     */
    const axisTop = scene ? Math.max(scene.depth, ...scene.depths) : 1;

    /**
     * 한 겹이 몇 벌로 갈라지는가 (표준 쪽). stage 는 이 수를 스스로 알 수 없다 —
     * algorithm 을 참조할 수 없으므로 (원칙 1) 걸음이 실어 보낸 것을 기억한다.
     * 자의 끝을 미리 잡는 데만 쓴다. 아직 못 받았으면 0 이고, 그때는 받은 값들로만
     * 자를 잡는다.
     */
    let perLayer = 0;
    const productAt = (level: number): number => (perLayer <= 1 ? 1 : perLayer ** level);

    function drawDepths(): void {
      gDepth.textContent = '';
      gDepth.appendChild(
        text(DEPTH_L, DEPTH_LABEL_Y, tr('label.byDepth', 'Multiplications by depth (log scale)'), {
          fill: colors.text,
          size: fontSizes.sm,
          weight: '600',
        }),
      );
      gDepth.appendChild(
        text(DEPTH_R, DEPTH_LABEL_Y, tr('label.saved', 'Saved'), {
          fill: colors.textMuted,
          anchor: 'end',
        }),
      );
      gDepth.appendChild(
        el('line', {
          x1: DEPTH_L,
          y1: BAR_BASE,
          x2: DEPTH_R,
          y2: BAR_BASE,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      // 칸 수가 정해지면 칸 폭이 따라온다 — 상수로 못박지 않는다. 칸 수를 정하는
      // 것은 선언의 눈금이지 지금 고른 깊이가 아니다 (위 `axisTop`).
      const slots = axisTop + 1;
      const colW = (DEPTH_R - DEPTH_L) / slots;
      const barW = Math.max(4, Math.min(22, colW / 3 - 2));

      // 로그 자. **자의 끝은 눈금의 맨 끝이 내는 값이다** — 지금 받은 것 중 가장 큰
      // 값에 맞추면 손잡이를 밀 때마다 자가 다시 그려져, 막대가 벌어지는 것이
      // 보이지 않는다.
      const peak = Math.max(
        1,
        ...levels.map((row) => row.standard),
        productAt(axisTop),
      );
      const span = Math.log(peak) || 1;
      const height = (v: number): number =>
        v <= 1 ? 1 : Math.max(1, (Math.log(v) / span) * BAR_H);

      const got = new Map(levels.map((row) => [row.level, row]));
      for (let level = 0; level <= axisTop; level += 1) {
        const cx = DEPTH_L + colW * (level + 0.5);
        const row = got.get(level);
        const current = level === top;
        // 아직 안 온 칸도 눈금은 있다. 자가 처음부터 끝까지 서 있어야 손잡이를
        // 밀 때 칸이 채워져 나가는 것으로 읽힌다.
        const ink = row === undefined ? colors.textMuted : current ? colors.text : colors.textMuted;

        if (row) {
          for (const bar of [
            { value: row.standard, ink: inkStandard, dx: -barW - 1 },
            { value: row.fast, ink: inkStrassen, dx: 1 },
          ]) {
            const h = height(bar.value);
            gDepth.appendChild(
              el('rect', {
                x: cx + bar.dx,
                y: BAR_BASE - h,
                width: barW,
                height: h,
                fill: bar.ink,
                rx: 2,
                opacity: current ? 1 : 0.5,
              }),
            );
          }
        }

        const tick = text(cx, TICK_Y, String(level), {
          fill: ink,
          anchor: 'middle',
          mono: true,
          weight: current ? '600' : '400',
        });
        // 검사가 자의 끝을 집어 볼 수 있게 표를 남긴다 — 자가 손잡이를 따라
        // 줄어들면 이 표의 수가 바뀐다.
        tick.setAttribute('data-role', 'depth-tick');
        if (row === undefined) tick.setAttribute('opacity', '0.45');
        gDepth.appendChild(tick);
        if (row) {
          gDepth.appendChild(
            text(cx, SAVED_Y, group(row.saved), {
              fill: current ? colors.text : colors.textMuted,
              anchor: 'middle',
              mono: true,
              weight: current ? '600' : '400',
            }),
          );
        }
      }
    }

    // ── 3층. 총계.

    function drawTally(v: {
      depth: number;
      size: number;
      standard: number;
      fast: number;
      saved: number;
    } | null): void {
      gTally.textContent = '';
      if (!v) return;
      // 전부 수식 표기라 표식이다 (C10).
      gTally.appendChild(
        text(DEPTH_L, TALLY_Y, `k = ${v.depth}    n = ${group(v.size)}`, {
          fill: colors.textMuted,
          mono: true,
        }),
      );
      gTally.appendChild(
        text(COL_STD_X, TALLY_Y, group(v.standard), {
          fill: inkStandard,
          mono: true,
          weight: '600',
        }),
      );
      gTally.appendChild(
        text(COL_STD_X + 92, TALLY_Y, group(v.fast), {
          fill: inkStrassen,
          mono: true,
          weight: '600',
        }),
      );
      gTally.appendChild(
        text(DEPTH_R, TALLY_Y, group(v.saved), {
          fill: colors.text,
          size: fontSizes.md,
          anchor: 'end',
          mono: true,
          weight: '700',
        }),
      );
    }

    function setCaption(value: string): void {
      gCaption.textContent = '';
      gCaption.appendChild(
        text(DEPTH_L, CAPTION_Y, value, { fill: colors.textMuted }),
      );
    }

    function resetToInitial(): void {
      levels = [];
      top = scene?.depth ?? 1;
      gStandard.textContent = '';
      gStrassen.textContent = '';
      gTally.textContent = '';
      gCaption.textContent = '';
      if (scene) drawGrids(scene.a, scene.b, null);
      gStandard.appendChild(
        text(COL_STD_X, LAYER_LABEL_Y, tr('label.oneLayer', 'One layer'), {
          fill: colors.text,
          size: fontSizes.sm,
          weight: '600',
        }),
      );
      drawDepths();
    }

    resetToInitial();

    return {
      destroy(): void {
        // 타이머도 프레임 루프도 관찰자도 걸지 않았으므로 거둘 것이 없다.
        // 캔버스는 러너가 컨테이너째 걷어낸다.
        svg.textContent = '';
      },

      showStandard(v: {
        a: Matrix;
        b: Matrix;
        pairs: Pair[];
        c: Matrix;
        mults: number;
        adds: number;
        caption: string;
      }): void {
        // 새 바퀴가 시작됐다 — 앞 바퀴의 깊이 걸음은 이 그림의 것이 아니다.
        levels = [];
        // 한 겹이 몇 벌인지는 걸음이 알려 준다 (위 `perLayer`).
        perLayer = v.mults;
        gStrassen.textContent = '';
        drawGrids(v.a, v.b, v.c);
        drawStandard(v.pairs, v.c, v.mults, v.adds);
        gStandard.appendChild(
          text(COL_STD_X, LAYER_LABEL_Y, tr('label.oneLayer', 'One layer'), {
            fill: colors.text,
            size: fontSizes.sm,
            weight: '600',
          }),
        );
        drawDepths();
        drawTally(null);
        setCaption(v.caption);
      },

      showStrassen(v: { terms: Term[]; mults: number; adds: number; caption: string }): void {
        drawStrassen(v.terms, v.mults, v.adds);
        setCaption(v.caption);
      },

      showCombine(v: { c: Matrix; combines: Combine[]; same: boolean; caption: string }): void {
        // 표준의 줄을 되맞추기의 줄로 갈아 끼운다 — 같은 자리에서 바뀌므로
        // 무엇이 무엇으로 대체됐는지가 자리로 보인다.
        gStandard.textContent = '';
        gStandard.appendChild(
          text(COL_STD_X, LAYER_LABEL_Y, tr('label.oneLayer', 'One layer'), {
            fill: colors.text,
            size: fontSizes.sm,
            weight: '600',
          }),
        );
        drawCombines(v.combines);
        setCaption(v.caption);
      },

      showDepth(v: {
        level: number;
        size: number;
        standard: number;
        fast: number;
        saved: number;
        top: number;
        caption: string;
      }): void {
        top = v.top;
        levels = [
          ...levels.filter((row) => row.level !== v.level),
          { level: v.level, standard: v.standard, fast: v.fast, saved: v.saved },
        ].sort((x, y) => x.level - y.level);
        drawDepths();
        setCaption(v.caption);
      },

      showTally(v: {
        depth: number;
        size: number;
        standard: number;
        fast: number;
        saved: number;
        caption: string;
      }): void {
        drawTally(v);
        setCaption(v.caption);
      },

      resetToInitial,
    };
  },
};
