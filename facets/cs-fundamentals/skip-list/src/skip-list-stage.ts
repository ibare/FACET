/**
 * skip-list-stage — 층으로 갈라진 리스트, 그 위를 걷는 자취, 그리고 걸음 수가
 * 원소 수를 따라 어떻게 자라는지.
 *
 * ── 왼쪽: 층
 *
 * 층마다 가로줄 하나를 긋고 그 층에 선 값을 눈금으로 찍는다. 원소가 128 이면
 * 값을 다 적을 수는 없지만 눈금의 **성김**은 그대로 보인다 — 한 층 오를 때마다
 * 눈금이 절반으로 준다는 것이 세지 않아도 읽힌다. 값을 글자로 적는 것은 열여섯
 * 이하일 때뿐이고, 그 위부터는 층 오른쪽의 수 하나가 대신 말한다.
 *
 * ── 오른쪽: 대조
 *
 * 가로에 원소 수, 세로에 평균 걸음. 한 층짜리는 선형으로 치솟고 스킵은 옆에
 * 그린 log₂ n 과 나란히 눕는다. 지금 고른 원소 수에 색지를 깔아 둘의 거리가
 * 그 자리에서 얼마인지 보이게 한다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다
 *
 * 층 수는 원소 수를 따라 넷에서 여덟까지 달라지지만 캔버스는 고정이다. 층
 * 사이의 간격을 고정해 두고 **묶음을 위아래 가운데에 앉히는** 것으로 담는다
 * (S-view: 넘치면 높이를 늘리지 말고 간격으로 담는다). 여덟 층이 정확히 들어
 * 차는 자리로 잡아 두었다.
 *
 * ── 뒷일을 남기지 않는다
 *
 * 타이머도 프레임 루프도 두지 않으며 promise 를 돌려주는 메서드도 없다. 걸음의
 * 박자는 algorithm 의 `ctx.sleep` 이 긋고 여기 메서드는 전부 동기로 즉시 반영한다
 * — 그래서 `destroy` 가 풀어 줘야 할 대기가 애초에 생기지 않는다. 유일한 시간
 * 요소는 커서의 미끄러짐인데 그것은 CSS transition 이라 노드가 떨어져 나가면
 * 저절로 멎는다. 구독하는 전역도 없다.
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

const SVG_NS = 'http://www.w3.org/2000/svg' as const;

// ── 캔버스
const W = 720;
const H = 320;

// ── 왼쪽: 층
const LABEL_X = 18;
const HEAD_X = 34;
const LANE_X0 = 44;
const LANE_X1 = 430;
const COUNT_X = 468;
const LANE_GAP = 28;
const BAND_TOP = 48;
const BAND_H = 196;
const TICK_H = 10;

// ── 오른쪽: 대조
const CH_LX = 502;
const CH_X0 = 508;
const CH_X1 = 704;
const CH_Y0 = 56;
const CH_Y1 = 250;
/** 세로 상한. n=128 의 한 층짜리 평균(64.5)이 천장에 붙지 않을 만큼. */
const CH_VMAX = 68;

// ── 아래: 캡션 두 줄
const CAPTION_Y = 298;
const VERDICT_Y = 313;

/**
 * 대조 곡선 셋의 색. 셋은 서로 다른 계열을 가리키는 **식별 색**이므로
 * categorical 시드에서 뽑는다 (S-view 결정 트리 3).
 */
const SERIES_SKIP = 0;
const SERIES_FLAT = 1;
const SERIES_LOG = 2;

/** 층 이름과 수식 표기는 표식이다 — 번역하면 오히려 도식과 어긋난다 (C10). */
const LEVEL_MARK = 'L';
const LOG_MARK = 'log₂ n';

const DEFAULT_N = 16;

type Shape = { n: number; maxLevels: number; values: number[]; heights: number[] };
type Point = { n: number; skip: number; flat: number; log2: number };

function node(tag: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function clearGroup(g: SVGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

function levelsOf(n: number): number {
  return Math.ceil(Math.log2(Math.max(2, n))) + 1;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export const skipListStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const series = categorical(3, 'vivid');
    const skipInk = series[SERIES_SKIP] ?? colors.text;
    const flatInk = series[SERIES_FLAT] ?? colors.text;
    const logInk = series[SERIES_LOG] ?? colors.textMuted;

    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 러너는 캔버스를 컨테이너에
    // 먼저 붙이고 mount 를 부르므로, 컨테이너를 비우면 그림판이 통째로 떨어져
    // 나가고 예외 없이 화면만 빈다 (S-view).
    canvas.textContent = '';

    const gLanes = node('g', {});
    const gTrail = node('g', {});
    const gChart = node('g', {});
    canvas.appendChild(gLanes);
    canvas.appendChild(gTrail);
    canvas.appendChild(gChart);

    function label(
      x: number,
      y: number,
      s: string,
      fill: string,
      size: string,
      anchor: string,
    ): SVGElement {
      const t = node('text', {
        x,
        y,
        fill,
        'font-size': size,
        'font-family': fonts.body,
        'text-anchor': anchor,
      });
      t.textContent = s;
      return t;
    }

    const captionEl = label(W / 2, CAPTION_Y, '', colors.text, fontSizes.sm, 'middle');
    const verdictEl = label(W / 2, VERDICT_Y, '', colors.textMuted, fontSizes.xs, 'middle');
    canvas.appendChild(captionEl);
    canvas.appendChild(verdictEl);

    const baseN = (() => {
      const raw = params.initialData?.n;
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 2 ? raw : DEFAULT_N;
    })();

    // ── 상태
    let shape: Shape | null = null;
    const ticks = new Map<string, SVGElement>();
    let trailPath: SVGElement | null = null;
    let cursorEl: SVGElement | null = null;
    let trailD = '';
    let cursorX = HEAD_X;
    let cursorLevel = 0;
    let lastProbed: SVGElement | null = null;

    // ── 좌표
    const bandBottom = (levels: number): number =>
      BAND_TOP + (BAND_H + (levels - 1) * LANE_GAP) / 2;
    const laneY = (level: number, levels: number): number => bandBottom(levels) - level * LANE_GAP;
    const tickX = (i: number, n: number): number => LANE_X0 + ((i + 0.5) * (LANE_X1 - LANE_X0)) / n;
    const chartX = (i: number, count: number): number =>
      CH_X0 + ((i + 0.5) * (CH_X1 - CH_X0)) / count;
    const chartY = (v: number): number => CH_Y1 - (v / CH_VMAX) * (CH_Y1 - CH_Y0);

    // ── 층 그리기
    function drawLaneFrame(levels: number): void {
      clearGroup(gLanes);
      clearGroup(gTrail);
      ticks.clear();
      lastProbed = null;

      const top = laneY(levels - 1, levels);
      const bottom = laneY(0, levels);

      // 머리 — 모든 층이 여기서 출발한다.
      gLanes.appendChild(
        node('line', {
          x1: HEAD_X,
          y1: top - 12,
          x2: HEAD_X,
          y2: bottom + 12,
          stroke: colors.border,
          'stroke-width': 2,
        }),
      );

      for (let lv = 0; lv < levels; lv += 1) {
        const y = laneY(lv, levels);
        gLanes.appendChild(
          node('line', {
            x1: HEAD_X,
            y1: y,
            x2: LANE_X1,
            y2: y,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        gLanes.appendChild(
          label(LABEL_X, y + 4, `${LEVEL_MARK}${lv}`, colors.textMuted, fontSizes.xs, 'start'),
        );
      }

      trailD = `M ${HEAD_X} ${top}`;
      trailPath = node('path', {
        d: trailD,
        fill: 'none',
        stroke: colors.itemSorted,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      });
      gTrail.appendChild(trailPath);

      cursorEl = node('circle', { cx: 0, cy: 0, r: 5, fill: colors.itemActive });
      cursorEl.setAttribute('transform', `translate(${HEAD_X} ${top})`);
      // 걸음 사이의 미끄러짐. 타이머가 아니라 그리기의 일이라 CSS 에 맡긴다.
      cursorEl.setAttribute('style', 'transition: transform 180ms ease');
      gTrail.appendChild(cursorEl);

      cursorX = HEAD_X;
      cursorLevel = levels - 1;
    }

    function extendTrail(x: number, y: number): void {
      trailD += ` L ${x} ${y}`;
      trailPath?.setAttribute('d', trailD);
      cursorEl?.setAttribute('transform', `translate(${x} ${y})`);
      cursorX = x;
    }

    // ── 대조 그리기
    function drawChartFrame(): void {
      clearGroup(gChart);
      gChart.appendChild(
        label(CH_X0, 42, tr('label.avgLooks', 'Average looks'), colors.textMuted, fontSizes.xs, 'start'),
      );
      gChart.appendChild(
        node('line', {
          x1: CH_X0,
          y1: CH_Y1,
          x2: CH_X1,
          y2: CH_Y1,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      gChart.appendChild(
        label(
          (CH_X0 + CH_X1) / 2,
          276,
          tr('label.elements', 'Elements'),
          colors.textMuted,
          fontSizes.xs,
          'middle',
        ),
      );

      // 범례 — 곡선이 차지하지 않는 왼쪽 위에 앉힌다.
      const rows: Array<[string, string, boolean]> = [
        [tr('label.skip', 'Skip list'), skipInk, false],
        [tr('label.flat', 'One level'), flatInk, false],
        [LOG_MARK, logInk, true],
      ];
      rows.forEach(([name, ink, dashed], i) => {
        const y = 70 + i * 14;
        const line = node('line', {
          x1: CH_X0 + 6,
          y1: y,
          x2: CH_X0 + 20,
          y2: y,
          stroke: ink,
          'stroke-width': 2,
        });
        if (dashed) line.setAttribute('stroke-dasharray', '3 3');
        gChart.appendChild(line);
        gChart.appendChild(label(CH_X0 + 26, y + 4, name, colors.textMuted, fontSizes.xs, 'start'));
      });
    }

    function drawContrast(points: Point[], current: number): void {
      drawChartFrame();
      if (points.length === 0) return;
      const count = points.length;
      const slot = (CH_X1 - CH_X0) / count;

      // 지금 고른 원소 수 — 색지 한 장으로 그 자리를 집는다.
      const idx = points.findIndex((p) => p.n === current);
      if (idx >= 0) {
        gChart.appendChild(
          node('rect', {
            x: chartX(idx, count) - slot / 2,
            y: CH_Y0,
            width: slot,
            height: CH_Y1 - CH_Y0,
            fill: colors.subtreeShadeRight,
          }),
        );
      }

      for (const v of [0, 64]) {
        gChart.appendChild(
          node('line', {
            x1: CH_X0,
            y1: chartY(v),
            x2: CH_X1,
            y2: chartY(v),
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 4',
          }),
        );
        gChart.appendChild(
          label(CH_LX, chartY(v) + 4, String(v), colors.textMuted, fontSizes.xs, 'end'),
        );
      }

      const curve = (pick: (p: Point) => number, ink: string, dashed: boolean): void => {
        const pts = points.map((p, i) => `${chartX(i, count)},${chartY(pick(p))}`).join(' ');
        const line = node('polyline', {
          points: pts,
          fill: 'none',
          stroke: ink,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        });
        if (dashed) line.setAttribute('stroke-dasharray', '3 3');
        gChart.appendChild(line);
        points.forEach((p, i) => {
          const here = p.n === current;
          gChart.appendChild(
            node('circle', {
              cx: chartX(i, count),
              cy: chartY(pick(p)),
              r: here ? 4 : 2.5,
              fill: ink,
            }),
          );
        });
      };

      curve((p) => p.flat, flatInk, false);
      curve((p) => p.log2, logInk, true);
      curve((p) => p.skip, skipInk, false);

      points.forEach((p, i) => {
        gChart.appendChild(
          label(chartX(i, count), CH_Y1 + 14, String(p.n), colors.textMuted, fontSizes.xs, 'middle'),
        );
      });

      // 지금 자리의 두 수만 적는다. 다 적으면 곡선이 글자에 묻힌다.
      if (idx >= 0) {
        const p = points[idx] as Point;
        gChart.appendChild(
          label(chartX(idx, count), chartY(p.flat) - 8, fmt(p.flat), flatInk, fontSizes.xs, 'middle'),
        );
        gChart.appendChild(
          label(chartX(idx, count), chartY(p.skip) + 16, fmt(p.skip), skipInk, fontSizes.xs, 'middle'),
        );
      }
    }

    // ── 첫 틀
    function initialFrame(): void {
      shape = null;
      drawLaneFrame(levelsOf(baseN));
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

      setShape(next: Shape): void {
        shape = next;
        drawLaneFrame(next.maxLevels);
      },

      fillLevel(level: number, count: number): void {
        if (!shape) return;
        const { n, maxLevels, heights, values } = shape;
        const y = laneY(level, maxLevels);
        const w = Math.max(1.2, ((LANE_X1 - LANE_X0) / n) * 0.5);
        for (let i = 0; i < n; i += 1) {
          if ((heights[i] ?? 0) <= level) continue;
          const x = tickX(i, n);
          const mark = node('rect', {
            x: x - w / 2,
            y: y - TICK_H / 2,
            width: w,
            height: TICK_H,
            rx: 0.5,
            fill: colors.text,
          });
          gLanes.appendChild(mark);
          ticks.set(`${level}:${i}`, mark);
          // 값을 글자로 적는 것은 열여섯까지. 그 위는 눈금의 성김이 대신 말한다.
          if (level === 0 && n <= 16) {
            gLanes.appendChild(
              label(x, y + 16, String(values[i] ?? 0), colors.textMuted, fontSizes.xs, 'middle'),
            );
          }
        }
        gLanes.appendChild(
          label(COUNT_X, y + 4, String(count), colors.textMuted, fontSizes.xs, 'end'),
        );
      },

      setTarget(index: number, value: number): void {
        if (!shape) return;
        const { n, maxLevels } = shape;
        const x = tickX(index, n);
        const top = laneY(maxLevels - 1, maxLevels) - 14;
        const bottom = laneY(0, maxLevels) + 14;
        const guide = node('line', {
          x1: x,
          y1: top,
          x2: x,
          y2: bottom,
          stroke: colors.ghostOutline,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        // 자취보다 뒤에 깔아 둔다 — 걸음이 가려지면 안 된다.
        gTrail.insertBefore(guide, gTrail.firstChild);
        gTrail.appendChild(
          label(x, top - 4, String(value), colors.textMuted, fontSizes.xs, 'middle'),
        );
      },

      probe(level: number, index: number, verdict: 'less' | 'greater'): void {
        if (!shape) return;
        const { n, maxLevels } = shape;
        const y = laneY(level, maxLevels);
        if (cursorLevel !== level) {
          extendTrail(cursorX, y);
          cursorLevel = level;
        }
        const x = tickX(index, n);
        const mark = ticks.get(`${level}:${index}`) ?? null;
        if (lastProbed) lastProbed.setAttribute('fill', colors.itemSorted);

        if (verdict === 'less') {
          extendTrail(x, y);
          mark?.setAttribute('fill', colors.itemComparing);
          lastProbed = mark;
          return;
        }

        // 지나쳤다 — 본 것은 표시하되 그리로 가지는 않는다.
        gTrail.appendChild(
          node('line', {
            x1: cursorX,
            y1: y,
            x2: x,
            y2: y,
            stroke: colors.ghostOutline,
            'stroke-width': 1,
            'stroke-dasharray': '2 3',
          }),
        );
        mark?.setAttribute('fill', colors.ghostOutline);
        lastProbed = null;
        if (level > 0) {
          extendTrail(cursorX, laneY(level - 1, maxLevels));
          cursorLevel = level - 1;
        }
      },

      laneEnd(level: number): void {
        if (!shape || level <= 0) return;
        extendTrail(cursorX, laneY(level - 1, shape.maxLevels));
        cursorLevel = level - 1;
      },

      found(level: number, index: number): void {
        if (!shape) return;
        const { n, maxLevels } = shape;
        const y = laneY(level, maxLevels);
        if (cursorLevel !== level) {
          extendTrail(cursorX, y);
          cursorLevel = level;
        }
        const x = tickX(index, n);
        extendTrail(x, y);
        if (lastProbed) lastProbed.setAttribute('fill', colors.itemSorted);
        lastProbed = null;
        ticks.get(`${level}:${index}`)?.setAttribute('fill', colors.itemPivot);
        gTrail.appendChild(
          node('circle', {
            cx: x,
            cy: y,
            r: 9,
            fill: 'none',
            stroke: colors.itemPivot,
            'stroke-width': 2,
          }),
        );
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
