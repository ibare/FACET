/**
 * sieve-stage — 판 하나와 그 옆의 두 수.
 *
 * 왼쪽은 1 부터 N 까지를 열 칸씩 접어 놓은 **판**이다. 지워진 칸은 어두워지고,
 * 지우개가 된 소수와 끝까지 살아남은 수만 밝게 남는다. 오른쪽 위에는 **지우개가
 * 된 소수**가 칩으로 쌓이고, 그 아래 축에는 밀어 본 한계마다 점이 둘씩 찍힌다 —
 * 지우개와 소수. **그 둘이 갈리는 것이 이 완제품의 까닭이다.**
 *
 * ── 칸 수가 곧 칸 폭이다
 *
 * N=120 이면 칸이 120 개다. 한 줄로 늘어놓으면 칸 하나가 5px 이 되어 수를 읽을 수
 * 없으므로 **열 칸씩 접는다.** 열 개씩 접으면 한 줄이 십의 자리 하나가 되어 배수가
 * 세로줄과 대각선으로 드러나기도 한다 — 2 와 5 의 배수는 곧은 기둥이 된다.
 * 칸은 48 × 28 이라 세 자리 수도 넉넉하다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다 (S-view)
 *
 * 손잡이가 판을 50 → 120 으로 키우므로 줄 수가 5 → 12 로 변한다. 자리는 처음부터
 * **가장 큰 한계의 몫**으로 잡아 두고, 작은 판일 때는 아래가 비어 있게 둔다. 빈
 * 자리에 유령 테두리를 그려 "판이 여기까지 커진다" 를 미리 말한다. 높이를 내용에
 * 맞춰 다시 재면 글 안에 박힌 그림의 위아래 문단이 밀린다.
 *
 * ── 축의 눈금은 여기서 정한다
 *
 * View 는 algorithm 을 참조하지 않는다 (원칙 1). 그래서 손잡이의 값을 algorithm 에서
 * 가져오지 않고 이 파일이 제 눈금을 가진다. 둘이 어긋나지 않는지는 검사가 본다
 * (`SIEVE_LIMIT_TICKS` ↔ `SIEVE_LIMIT_CHOICES` ↔ facet.ts 의 segments).
 *
 * **타이머도 프레임 루프도 없다.** 걸음의 간격은 알고리즘의 `ctx.sleep` 이 정하고
 * 이 view 의 메서드는 전부 동기로 즉시 그린다. 그래서 `destroy()` 가 풀어 줄
 * 기다림이 애초에 생기지 않는다 — 이 주석은 사실이어야 하므로, 나중에 여기에
 * 애니메이션을 들이면 이 문장부터 고쳐야 한다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

/** 축에 설 한계 값. facet.ts 의 segments · algorithm 의 CHOICES 와 같아야 한다. */
export const SIEVE_LIMIT_TICKS: readonly number[] = [50, 100, 120];

// ── 기하 (S-view: SVG 안의 좌표·칸 크기는 그림이 정한다) ─────────────────────
const W = 720;
const PAD = 24;

/** 한 줄에 놓는 칸 수. 열이면 한 줄이 십의 자리 하나가 된다. */
export const SIEVE_COLS = 10;
const CELL_W = 48;
const CELL_H = 28;
/** 가장 큰 한계가 요구하는 줄 수. 자리는 처음부터 이만큼 잡는다. */
export const SIEVE_MAX_ROWS = Math.ceil(Math.max(...SIEVE_LIMIT_TICKS) / SIEVE_COLS);

const GRID_X = PAD;
const GRID_Y = 44;
const LABEL_Y = 32;

const PANEL_X = 528;
const PANEL_W = W - PAD - PANEL_X;
const CHIP_W = 36;
const CHIP_H = 24;
const CHIP_GAP = 4;
const CHIP_Y = GRID_Y;

const TREND_LABEL_Y = 100;
const CHART_TOP = 116;
const CHART_BASE = 300;
const CHART_X0 = PANEL_X + 18;
const CHART_X1 = W - PAD - 18;
const TICK_Y = 318;
const LEGEND_Y1 = 344;
const LEGEND_Y2 = 366;
const SWATCH = 9;

/** 축의 위쪽 끝이 뜻하는 개수. 재 본 가장 큰 값이 30 이라 32 로 잡는다. */
const CHART_MAX = 32;

const CAPTION_Y = 402;
const H = 416;

type Attrs = Record<string, string | number>;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function textEl(x: number, y: number, value: string, attrs: Attrs): SVGTextElement {
  const t = svgEl('text', { x, y, 'font-family': fonts.body, ...attrs });
  t.textContent = value;
  return t;
}

function clear(g: SVGGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

/** 수 n 이 앉을 칸의 왼쪽 위 모서리. 1 이 첫 칸이라 열이 곧 일의 자리다. */
function cellX(n: number): number {
  return GRID_X + ((n - 1) % SIEVE_COLS) * CELL_W;
}

function cellY(n: number): number {
  return GRID_Y + Math.floor((n - 1) / SIEVE_COLS) * CELL_H;
}

/** 한계 값이 축에서 설 자리. */
function tickX(limit: number): number {
  const i = SIEVE_LIMIT_TICKS.indexOf(limit);
  const at = i < 0 ? 0 : i;
  return CHART_X0 + (at * (CHART_X1 - CHART_X0)) / Math.max(1, SIEVE_LIMIT_TICKS.length - 1);
}

function chartY(count: number): number {
  const capped = Math.max(0, Math.min(CHART_MAX, count));
  return CHART_BASE - (capped / CHART_MAX) * (CHART_BASE - CHART_TOP);
}

export type SieveStrikeFrame = { p: number; marks: number[] };
export type SieveRevealFrame = { limit: number; primes: number[]; erasers: number[] };

export const sieveStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    // 컨테이너는 손대지 않는다 — 러너가 캔버스를 거기 먼저 붙여 두었고, 비우면
    // 그 캔버스가 떨어져 나간다 (S-view). 그릴 자리는 `params.canvas` 안쪽이다.
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    /**
     * 지우개 라벨은 칩 머리와 축의 범례, 두 곳에 뜬다. 한 문안이 두 자리에 리터럴로
     * 흩어져 있으면 한쪽만 고쳐 조용히 갈리므로 en 원본이 한 번만 나오게 묶는다
     * (C10 PREFER). **키와 en 원본은 이 안에서도 리터럴이다** — 그것을 인자로 빼면
     * 추출기와 `en-original-matches-declaration` 이 이 문안을 아예 못 본다.
     */
    const erasersLabel = (): string => tr('label.erasers', 'Erasers');

    const root = svgEl('g', {});
    const gGrid = svgEl('g', {});
    const gPanel = svgEl('g', {});
    const gChart = svgEl('g', {});
    const gCaption = svgEl('g', {});
    root.append(gGrid, gPanel, gChart, gCaption);
    canvas.appendChild(root);

    // ── 초기 데이터 좁히기 (C9). 좁히는 자리는 여기 한 곳이다.
    const initial = params.initialData ?? {};
    const initialLimit =
      typeof initial['limit'] === 'number' ? initial['limit'] : (SIEVE_LIMIT_TICKS[0] ?? 50);

    let limit = initialLimit;
    /** 지워진 칸. */
    let struck = new Set<number>();
    /** 이번 걸음에서 지운 칸. 지나가면 struck 으로 가라앉는다. */
    let fresh = new Set<number>();
    /** 지우는 일을 한 소수들. 밝게 남는다. */
    let erasers: number[] = [];
    /** 끝까지 살아남은 수들. 거두기 전에는 null 이다. */
    let survivors: Set<number> | null = null;
    /** 지금 들여다보고 있는 수. */
    let probing = -1;
    /** 독자가 밀어 본 한계와 그때의 두 수. 축이 이것으로 채워진다. */
    const visited = new Map<number, { erasers: number; primes: number }>();

    // ── 판 ───────────────────────────────────────────────────────────────
    function drawGrid(): void {
      clear(gGrid);

      gGrid.appendChild(
        textEl(GRID_X, LABEL_Y, tr('label.board', 'Numbers 2 to {n}', { n: limit }), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      // 판이 가장 크게 자랄 자리. 지금 판이 작아도 여기까지 커진다는 뜻이다.
      gGrid.appendChild(
        svgEl('rect', {
          x: GRID_X,
          y: GRID_Y,
          width: SIEVE_COLS * CELL_W,
          height: SIEVE_MAX_ROWS * CELL_H,
          fill: 'none',
          stroke: colors.ghostOutline,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        }),
      );

      for (let n = 1; n <= limit; n += 1) {
        const x = cellX(n);
        const y = cellY(n);

        let fill = colors.itemDefault;
        let ink = colors.text;
        let stroke = colors.border;
        let dash = '';

        if (n === 1) {
          // 1 은 판 밖이다 — 소수도 합성수도 아니라 셈에 들지 않는다.
          fill = colors.bg;
          ink = colors.textMuted;
          stroke = colors.ghostOutline;
          dash = '2 2';
        } else if (fresh.has(n)) {
          // 지금 이 걸음에서 지워지는 칸 (알고리즘 상태 — 결정 트리 1).
          fill = colors.itemComparing;
          ink = colors.stateInk;
        } else if (erasers.includes(n) || survivors?.has(n)) {
          // 소수임이 드러난 칸. 지우개는 그 사실이 일찍 드러난 것뿐이다.
          fill = colors.itemPivot;
          ink = colors.stateInk;
        } else if (struck.has(n)) {
          fill = colors.itemSorted;
          ink = colors.textInverse;
        }

        gGrid.appendChild(
          svgEl('rect', {
            x: x + 1,
            y: y + 1,
            width: CELL_W - 2,
            height: CELL_H - 2,
            rx: 3,
            fill,
            stroke: n === probing ? colors.risingMarker : stroke,
            'stroke-width': n === probing ? 2 : 1,
            ...(dash === '' ? {} : { 'stroke-dasharray': dash }),
          }),
        );
        gGrid.appendChild(
          textEl(x + CELL_W / 2, y + CELL_H / 2 + 4, String(n), {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: ink,
          }),
        );
      }
    }

    // ── 지우개 칩 ────────────────────────────────────────────────────────
    function drawPanel(): void {
      clear(gPanel);

      gPanel.appendChild(
        textEl(PANEL_X, LABEL_Y, erasersLabel(), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );

      erasers.forEach((p, i) => {
        const perRow = Math.max(1, Math.floor((PANEL_W + CHIP_GAP) / (CHIP_W + CHIP_GAP)));
        const x = PANEL_X + (i % perRow) * (CHIP_W + CHIP_GAP);
        const y = CHIP_Y + Math.floor(i / perRow) * (CHIP_H + CHIP_GAP);
        gPanel.appendChild(
          svgEl('rect', {
            x,
            y,
            width: CHIP_W,
            height: CHIP_H,
            rx: 3,
            fill: colors.itemPivot,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        gPanel.appendChild(
          textEl(x + CHIP_W / 2, y + CHIP_H / 2 + 4, String(p), {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: colors.stateInk,
          }),
        );
      });
    }

    // ── 축 ───────────────────────────────────────────────────────────────
    function drawChart(): void {
      clear(gChart);

      gChart.appendChild(
        textEl(PANEL_X, TREND_LABEL_Y, tr('label.trend', 'By limit'), {
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        }),
      );
      gChart.appendChild(
        svgEl('line', {
          x1: CHART_X0 - 10,
          y1: CHART_BASE,
          x2: CHART_X1 + 10,
          y2: CHART_BASE,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const seen = SIEVE_LIMIT_TICKS.filter((t) => visited.has(t));
      // 두 줄기. 지우개는 판의 상태와 같은 뜻이라 같은 토큰을 쓰고, 소수 개수는
      // 셈의 결과라 structural 로 둔다.
      const series: Array<{ key: 'erasers' | 'primes'; color: string }> = [
        { key: 'erasers', color: colors.itemPivot },
        { key: 'primes', color: colors.text },
      ];
      for (const s of series) {
        if (seen.length >= 2) {
          const points = seen
            .map((t) => `${tickX(t)},${chartY(visited.get(t)?.[s.key] ?? 0)}`)
            .join(' ');
          gChart.appendChild(
            svgEl('polyline', { points, fill: 'none', stroke: s.color, 'stroke-width': 1.5 }),
          );
        }
        for (const t of seen) {
          const value = visited.get(t)?.[s.key] ?? 0;
          const x = tickX(t);
          const y = chartY(value);
          gChart.appendChild(
            svgEl('circle', {
              cx: x,
              cy: y,
              r: t === limit ? 4.5 : 3,
              fill: s.color,
              stroke: colors.border,
              'stroke-width': 1,
            }),
          );
          gChart.appendChild(
            textEl(x, y - 8, String(value), {
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              'text-anchor': 'middle',
              fill: t === limit ? colors.text : colors.textMuted,
            }),
          );
        }
      }

      for (const t of SIEVE_LIMIT_TICKS) {
        const x = tickX(t);
        if (!visited.has(t)) {
          // 아직 안 밀어 본 자리. 유령 외곽선이 "여기 갈 수 있다" 를 말한다.
          gChart.appendChild(
            svgEl('circle', {
              cx: x,
              cy: CHART_BASE,
              r: 3,
              fill: 'none',
              stroke: colors.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '2 2',
            }),
          );
        }
        gChart.appendChild(
          textEl(x, TICK_Y, String(t), {
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
            'font-weight': t === limit ? '600' : '400',
            fill: t === limit ? colors.text : colors.textMuted,
          }),
        );
      }

      const legend: Array<[number, string, string]> = [
        [LEGEND_Y1, colors.itemPivot, erasersLabel()],
        [LEGEND_Y2, colors.text, tr('label.primes', 'Primes found')],
      ];
      for (const [y, color, text] of legend) {
        gChart.appendChild(
          svgEl('rect', { x: PANEL_X, y: y - SWATCH, width: SWATCH, height: SWATCH, rx: 2, fill: color }),
        );
        gChart.appendChild(
          textEl(PANEL_X + SWATCH + 6, y, text, {
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          }),
        );
      }
    }

    function drawCaption(text: string): void {
      clear(gCaption);
      gCaption.appendChild(
        textEl(W / 2, CAPTION_Y, text, {
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: colors.text,
        }),
      );
    }

    function drawAll(): void {
      drawGrid();
      drawPanel();
      drawChart();
    }

    // 첫 그림. 알고리즘이 곧 board-ready 로 덮지만, 그 전에도 화면은 비어 있지 않다.
    drawAll();
    drawCaption('');

    return {
      destroy(): void {
        // 타이머도 프레임 루프도 구독도 없다 — 붙인 노드만 거둔다.
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      setBoard(info: { limit: number }): void {
        limit = info.limit;
        struck = new Set<number>();
        fresh = new Set<number>();
        erasers = [];
        survivors = null;
        probing = -1;
        drawAll();
      },

      probe(info: { p: number }): void {
        probing = info.p;
        fresh = new Set<number>();
        drawGrid();
      },

      strike(frame: SieveStrikeFrame): void {
        probing = frame.p;
        fresh = new Set<number>(frame.marks);
        for (const n of frame.marks) struck.add(n);
        if (!erasers.includes(frame.p)) erasers.push(frame.p);
        drawGrid();
        drawPanel();
      },

      halt(): void {
        probing = -1;
        fresh = new Set<number>();
        drawGrid();
      },

      reveal(frame: SieveRevealFrame): void {
        probing = -1;
        fresh = new Set<number>();
        erasers = [...frame.erasers];
        survivors = new Set<number>(frame.primes);
        visited.set(frame.limit, { erasers: frame.erasers.length, primes: frame.primes.length });
        drawAll();
      },

      setCaption(text: string): void {
        drawCaption(text);
      },

      resetAll(): void {
        limit = initialLimit;
        struck = new Set<number>();
        fresh = new Set<number>();
        erasers = [];
        survivors = null;
        probing = -1;
        visited.clear();
        drawAll();
        drawCaption('');
      },
    };
  },
};
