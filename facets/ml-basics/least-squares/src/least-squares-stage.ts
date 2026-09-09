/**
 * 최소제곱 조각의 무대.
 *
 * ── 무엇을 보이는가
 *
 * 왼쪽은 점 넷과 견줄 직선 셋이 놓인 자리(무대이지 주인공이 아니다). 오른쪽은
 * 직선마다 하나씩 선 **쌓는 자리**다. 벗어남(잔차)은 점에 붙어 있지 않고 떨어져
 * 나와 그 자리로 옮겨 가 머리-꼬리로 쌓인다.
 *
 *   부호를 지닌 채 쌓으면  — 내려간 만큼 올라와 기준선으로 되돌아온다 (상쇄).
 *   제곱해서 쌓으면        — 되돌아올 길이 없어 올라가기만 한다 (누적).
 *
 * ── 재는 자가 두 번 바뀐다
 *
 * 1단계의 조각은 **길이**다. 잔차 막대가 플롯에서 가진 길이를 그대로 지니고
 * 레인으로 간다.
 *
 * 2단계의 조각은 **넓이**다. 막대가 제 길이를 한 변으로 하는 정사각형으로 펼쳐진
 * 뒤, 레인 폭에 맞춰 눌리며 위로 늘어난다. 이때 픽셀 넓이가 보존되도록
 * `kCol = kPlot² / barW` 로 잡았다 — 그래서 탑의 높이가 곧 정사각형들의 넓이 합이다.
 * 눌러 담아도 넓이는 그대로라는 것이 이 조각이 말하려는 바다.
 *
 * ── 좌표
 *
 * 선언은 구조(점 · 계수 · 걸음 간격)만 주고 자리는 전부 여기서 셈한다 (S-piece).
 * 레인 폭에서 차트 폭이, 차트 폭에서 남는 폭이 플롯 폭이 되며, 플롯의 눈금은
 * "정사각형이 이웃 점을 침범하지 않는다" 는 한 가지 제약에서 나온다.
 *
 * 벗어남의 크기를 여기서 한 번 재는 것은 자리를 잡기 위해서다. **화면에 뜨는 수는
 * 전부 이벤트가 실어 온 것**을 쓴다.
 *
 * ── 문자
 *
 * 이 무대가 스스로 그리는 글자는 표식뿐이다 — 눈금의 수, 직선의 식(`y = 2x`),
 * 합의 표기(`Σr` · `Σr²`), 잔차의 값. 어느 것도 어순이나 조사를 타지 않는다
 * (C10 의 표식/문안 판정 3번). 문장은 캡션 하나뿐이고 그것은 projector 가
 * 풀어서 넘긴다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  shiftLightness,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const STAGE_H = 330;

// 세로 자리.
const EQ_Y = 44;
const CHART_TOP = 56;
const CHART_BOT = STAGE_H - 80;      // 250 — 제곱 단계의 기준선
const PLOT_TOP = 96;
const PLOT_BOT = CHART_BOT - 6;      // 244
const TICK_Y = STAGE_H - 68;         // 262 — 플롯 가로 눈금
const SUM_Y = STAGE_H - 56;          // 274 — 부호 있는 합
const CAPTION_Y = STAGE_H - 22;      // 308

// 가로 자리. 레인 폭이 먼저 정해지고 남는 폭을 플롯이 가져간다.
const PAD_L = 38;
const PAD_R = 14;
const GAP_MID = 20;
const CHART_GAP = 12;
const PLOT_MIN_W = 190;
const LANE_MAX_W = 30;
const LANE_INSET = 2;                // 레인 막대 좌우 여백
const PLOT_BAR_W = 7;                // 플롯의 잔차 막대 두께
const TOWER_LABEL_ROOM = 14;

// 걸음의 길이. 늘리면 읽을 시간이 늘고 재생이 길어진다.
const MS_FOCUS = 480;
const MS_GROW = 300;
const MS_FLY = 370;
const MS_FLY_GAP = 64;
const MS_UNFOLD = 340;
const MS_UNFOLD_GAP = 50;
const MS_HOLD = 180;
const MS_SETTLE = 160;
const MS_SHIFT = 520;
const MS_VERDICT = 460;
const MS_REWIND = 260;

const MINUS = '−';

type Pt = { x: number; y: number };
type Ln = { slope: number; intercept: number };

type Geo = {
  kPlot: number;
  kCol: number;
  xLo: number;
  xHi: number;
  yLo: number;
  plotL: number;
  plotR: number;
  plotBaseY: number;
  chartW: number;
  chartsX0: number;
  laneW: number;
  barW: number;
  signedBase: number;
};

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const key of Object.keys(attrs)) e.setAttribute(key, String(attrs[key]));
  return e;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function trim(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

/** 부호 없는 표기. 음수는 하이픈이 아니라 빼기 기호로 쓴다. */
function fmt(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return r < 0 ? MINUS + trim(-r) : trim(r);
}

/** 부호를 드러내는 표기 — 잔차는 방향이 곧 뜻이라 양수에도 부호를 붙인다. */
function fmtSigned(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  if (r === 0) return '0';
  return (r < 0 ? MINUS : '+') + trim(Math.abs(r));
}

/** 직선의 식. 화면에서 세 직선을 구별하는 표식이다. */
function fmtLine(line: Ln): string {
  if (line.slope === 0) return `y = ${fmt(line.intercept)}`;
  const head =
    line.slope === 1 ? 'x' : line.slope === -1 ? `${MINUS}x` : `${fmt(line.slope)}x`;
  if (line.intercept === 0) return `y = ${head}`;
  const sign = line.intercept > 0 ? '+' : MINUS;
  return `y = ${head} ${sign} ${trim(Math.abs(line.intercept))}`;
}

export const leastSquaresStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const palette = getColors(params.theme);

    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /** 진행률을 프레임마다 흘려 준다. 취소되면 마지막 모습으로 끝내고 깨운다. */
    function run(ms: number, onFrame: (elapsed: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          if (!destroyed) onFrame(ms);
          return resolve();
        }
        const started = performance.now();
        let id = 0;
        const finish = (): void => {
          waiters.delete(finish);
          frames.delete(id);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(id);
          if (destroyed) return finish();
          const elapsed = performance.now() - started;
          if (elapsed >= ms) {
            onFrame(ms);
            return finish();
          }
          onFrame(elapsed);
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 무대 상태 ────────────────────────────────────────────────────────
    let points: Pt[] = [];
    let lines: Ln[] = [];
    let geo: Geo | null = null;
    let hues: readonly string[] = [];

    const gPlot = node('g', {});
    const gLines = node('g', {});
    const gPoints = node('g', {});
    const gCharts = node('g', {});
    const gLanes = node('g', {});
    const gResid = node('g', {});
    const gMarks = node('g', {});
    let captionEl: SVGTextElement | null = null;

    let lineEls: SVGLineElement[] = [];
    let chartBgs: SVGRectElement[] = [];
    let baseEls: SVGLineElement[] = [];
    let residBars: SVGRectElement[] = [];
    let residLabels: SVGTextElement[] = [];
    let unfoldDir: number[] = [];
    let laneGroups: SVGGElement[] = [];
    let lanePieces: SVGRectElement[] = [];
    let markEls: SVGElement[] = [];
    let baseY = CHART_TOP;

    function text(
      x: number,
      y: number,
      value: string,
      opt: { size: string; fill: string; anchor?: string; mono?: boolean; weight?: string },
    ): SVGTextElement {
      const el = node('text', {
        x,
        y,
        'font-size': opt.size,
        'font-family': opt.mono === false ? fonts.body : fonts.mono,
        fill: opt.fill,
        'text-anchor': opt.anchor ?? 'middle',
      });
      if (opt.weight) el.setAttribute('font-weight', opt.weight);
      el.textContent = value;
      return el;
    }

    function rectOf(el: SVGRectElement, x: number, y: number, w: number, h: number): void {
      el.setAttribute('x', String(x));
      el.setAttribute('y', String(y));
      el.setAttribute('width', String(Math.max(0, w)));
      el.setAttribute('height', String(Math.max(0, h)));
    }

    // ── 자리 셈 ──────────────────────────────────────────────────────────
    function measure(): Geo {
      const laneCount = Math.max(1, lines.length * points.length);
      const gapTotal = CHART_GAP * Math.max(0, lines.length - 1);
      const laneW = Math.max(
        12,
        Math.min(
          LANE_MAX_W,
          Math.floor((W - PAD_L - PAD_R - GAP_MID - PLOT_MIN_W - gapTotal) / laneCount),
        ),
      );
      const chartW = points.length * laneW;
      const chartsW = chartW * lines.length + gapTotal;
      const chartsX0 = W - PAD_R - chartsW;
      const plotL = PAD_L;
      const plotR = chartsX0 - GAP_MID;

      const xs = points.map((p) => p.x);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const xPad = (xMax - xMin || 1) * 0.135;
      const xLo = xMin - xPad;
      const xHi = xMax + xPad;

      const ys: number[] = points.map((p) => p.y);
      for (const ln of lines) {
        ys.push(ln.slope * xLo + ln.intercept, ln.slope * xHi + ln.intercept);
      }
      const yMin = Math.min(...ys);
      const yMax = Math.max(...ys);
      const yPad = (yMax - yMin || 1) * 0.05;
      const yLo = yMin - yPad;
      const yHi = yMax + yPad;

      // 벗어남의 크기. 자리를 잡기 위해서만 쓴다.
      let maxAbs = 0;
      let maxUp = 0;
      let maxDown = 0;
      let maxSquared = 0;
      for (const ln of lines) {
        let runningSum = 0;
        let squared = 0;
        for (const p of points) {
          const r = p.y - (ln.slope * p.x + ln.intercept);
          maxAbs = Math.max(maxAbs, Math.abs(r));
          runningSum += r;
          squared += r * r;
          maxUp = Math.max(maxUp, runningSum);
          maxDown = Math.max(maxDown, -runningSum);
        }
        maxSquared = Math.max(maxSquared, squared);
      }

      const xStep = (plotR - plotL) / (xHi - xLo);
      const kFit = (PLOT_BOT - PLOT_TOP) / (yHi - yLo);
      // 정사각형의 한 변이 이웃 점까지의 거리를 넘지 않게 — 넘으면 서로 겹친다.
      const kSquare = maxAbs > 0 ? xStep / maxAbs : kFit;
      const kPlot = Math.min(kFit, kSquare);
      const used = (yHi - yLo) * kPlot;
      const plotBaseY = PLOT_BOT - (PLOT_BOT - PLOT_TOP - used) / 2;

      const barW = Math.max(4, laneW - LANE_INSET * 2);
      // 넓이 보존. 정사각형(한 변 |r|·kPlot)을 폭 barW 로 눌러 담으면 높이는 r²·kCol.
      const idealCol = (kPlot * kPlot) / barW;
      const towerRoom = CHART_BOT - CHART_TOP - TOWER_LABEL_ROOM;
      const kCol = maxSquared > 0 ? Math.min(idealCol, towerRoom / maxSquared) : idealCol;

      const upPx = maxUp * kPlot;
      const downPx = maxDown * kPlot;
      const band = CHART_BOT - CHART_TOP;
      let signedBase = CHART_TOP + (band - (upPx + downPx)) / 2 + upPx;
      signedBase = Math.max(CHART_TOP + upPx, Math.min(CHART_BOT - downPx, signedBase));

      return {
        kPlot,
        kCol,
        xLo,
        xHi,
        yLo,
        plotL,
        plotR,
        plotBaseY,
        chartW,
        chartsX0,
        laneW,
        barW,
        signedBase: Math.round(signedBase),
      };
    }

    function px(g: Geo, x: number): number {
      return g.plotL + ((x - g.xLo) / (g.xHi - g.xLo)) * (g.plotR - g.plotL);
    }

    function py(g: Geo, y: number): number {
      return g.plotBaseY - (y - g.yLo) * g.kPlot;
    }

    function chartX(g: Geo, k: number): number {
      return g.chartsX0 + k * (g.chartW + CHART_GAP);
    }

    function laneX(g: Geo, k: number, i: number): number {
      return chartX(g, k) + i * g.laneW + LANE_INSET;
    }

    // ── 세우기 ───────────────────────────────────────────────────────────
    function clearAll(): void {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      lineEls = [];
      chartBgs = [];
      baseEls = [];
      residBars = [];
      residLabels = [];
      unfoldDir = [];
      laneGroups = [];
      lanePieces = [];
      markEls = [];
      captionEl = null;
    }

    function setCaption(value: string): void {
      if (captionEl) captionEl.textContent = value;
    }

    function setup(spec: { points: Pt[]; lines: Ln[]; caption: string }): void {
      if (destroyed) return;
      points = spec.points;
      lines = spec.lines;
      clearAll();
      for (const layer of [gPlot, gLines, gPoints, gCharts, gLanes, gResid, gMarks]) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
        svg.appendChild(layer);
      }
      captionEl = text(W / 2, CAPTION_Y, spec.caption, {
        size: fontSizes.md,
        fill: palette.text,
        mono: false,
      });
      svg.appendChild(captionEl);

      if (points.length === 0 || lines.length === 0) {
        geo = null;
        return;
      }

      const g = measure();
      geo = g;
      hues = categorical(lines.length, 'vivid');
      baseY = g.signedBase;

      // 플롯 — 가로 눈금선과 값 표식.
      const yTopVal = g.yLo + (g.plotBaseY - PLOT_TOP) / g.kPlot;
      const tickStep = 5;
      for (let v = 0; v <= yTopVal; v += tickStep) {
        const y = py(g, v);
        if (y < PLOT_TOP - 4 || y > PLOT_BOT + 4) continue;
        gPlot.appendChild(
          node('line', {
            x1: g.plotL,
            y1: y,
            x2: g.plotR,
            y2: y,
            stroke: palette.border,
            'stroke-width': v === 0 ? 1.4 : 1,
          }),
        );
        gPlot.appendChild(
          text(g.plotL - 8, y + 4, trim(v), {
            size: fontSizes.xs,
            fill: palette.textMuted,
            anchor: 'end',
          }),
        );
      }
      for (const p of points) {
        gPlot.appendChild(
          text(px(g, p.x), TICK_Y, trim(p.x), {
            size: fontSizes.xs,
            fill: palette.textMuted,
          }),
        );
      }

      // 견줄 직선 셋. 모두 옅게 깔아 두고 짚을 때만 진해진다.
      for (let k = 0; k < lines.length; k++) {
        const ln = lines[k];
        const el = node('line', {
          x1: px(g, g.xLo),
          y1: py(g, ln.slope * g.xLo + ln.intercept),
          x2: px(g, g.xHi),
          y2: py(g, ln.slope * g.xHi + ln.intercept),
          stroke: hues[k],
          'stroke-width': 1.4,
          'stroke-opacity': 0.28,
          'stroke-linecap': 'round',
        });
        gLines.appendChild(el);
        lineEls.push(el);
      }

      for (const p of points) {
        gPoints.appendChild(
          node('circle', {
            cx: px(g, p.x),
            cy: py(g, p.y),
            r: 4.2,
            fill: palette.text,
            stroke: palette.bg,
            'stroke-width': 1.6,
          }),
        );
      }

      // 쌓는 자리 — 직선마다 하나.
      for (let k = 0; k < lines.length; k++) {
        const bg = node('rect', {
          x: chartX(g, k),
          y: CHART_TOP,
          width: g.chartW,
          height: CHART_BOT - CHART_TOP,
          fill: hues[k],
          'fill-opacity': 0.05,
          rx: 3,
        });
        gCharts.appendChild(bg);
        chartBgs.push(bg);

        const base = node('line', {
          x1: chartX(g, k) - 2,
          y1: baseY,
          x2: chartX(g, k) + g.chartW + 2,
          y2: baseY,
          stroke: palette.border,
          'stroke-width': 1.6,
        });
        gCharts.appendChild(base);
        baseEls.push(base);

        gCharts.appendChild(
          text(chartX(g, k) + g.chartW / 2, EQ_Y, fmtLine(lines[k]), {
            size: fontSizes.sm,
            fill: hues[k],
            weight: '600',
          }),
        );

        const lane = node('g', {});
        gLanes.appendChild(lane);
        laneGroups.push(lane);
      }
    }

    // ── 걸음 ─────────────────────────────────────────────────────────────
    function dropResiduals(): void {
      for (const el of residBars) el.remove();
      for (const el of residLabels) el.remove();
      residBars = [];
      residLabels = [];
      unfoldDir = [];
    }

    function highlight(lineIndex: number): void {
      for (let k = 0; k < lineEls.length; k++) {
        const on = k === lineIndex;
        lineEls[k].setAttribute('stroke-opacity', on ? '1' : '0.22');
        lineEls[k].setAttribute('stroke-width', on ? '2.6' : '1.4');
        chartBgs[k].setAttribute('fill-opacity', on ? '0.14' : '0.05');
      }
    }

    async function focusLine(spec: {
      lineIndex: number;
      residuals: number[];
      caption: string;
    }): Promise<void> {
      const g = geo;
      if (destroyed || !g) return;
      setCaption(spec.caption);
      const k = spec.lineIndex;
      highlight(k);
      dropResiduals();

      const ln = lines[k];
      const half = points.length / 2;
      const targets: { x: number; yLine: number; h: number; up: boolean }[] = [];

      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const r = spec.residuals[i] ?? 0;
        // 왼쪽 절반은 오른쪽으로, 오른쪽 절반은 왼쪽으로 펼친다 — 정사각형이
        // 플롯 밖으로 나가지 않게 하는 자리 규칙이다.
        const dir = i < half ? 1 : -1;
        unfoldDir.push(dir);
        const cx = px(g, p.x);
        const yLine = py(g, ln.slope * p.x + ln.intercept);
        const h = Math.abs(r) * g.kPlot;
        const bar = node('rect', {
          x: dir > 0 ? cx : cx - PLOT_BAR_W,
          y: yLine,
          width: PLOT_BAR_W,
          height: 0,
          fill: r < 0 ? shiftLightness(hues[k], 0.16) : hues[k],
          rx: 1,
        });
        gResid.appendChild(bar);
        residBars.push(bar);

        const label = text(
          dir > 0 ? cx + PLOT_BAR_W + 4 : cx - PLOT_BAR_W - 4,
          yLine,
          fmtSigned(r),
          {
            size: fontSizes.xs,
            fill: palette.textMuted,
            anchor: dir > 0 ? 'start' : 'end',
          },
        );
        label.setAttribute('opacity', '0');
        gResid.appendChild(label);
        residLabels.push(label);

        targets.push({ x: dir > 0 ? cx : cx - PLOT_BAR_W, yLine, h, up: r > 0 });
      }

      await run(MS_FOCUS, (elapsed) => {
        for (let i = 0; i < residBars.length; i++) {
          const t = ease(clamp01((elapsed - i * 40) / MS_GROW));
          const target = targets[i];
          const h = target.h * t;
          const y = target.up ? target.yLine - h : target.yLine;
          rectOf(residBars[i], target.x, y, PLOT_BAR_W, h);
          residLabels[i].setAttribute('opacity', String(t));
          residLabels[i].setAttribute('y', String(y + h / 2 + 4));
        }
      });
    }

    /** 레인에 쌓인 조각의 자리. from → to 는 누적값(단위)이고 k 는 그 단위의 눈금. */
    function laneRect(
      g: Geo,
      lineIndex: number,
      i: number,
      from: number,
      to: number,
      unit: number,
      base: number,
    ): { x: number; y: number; w: number; h: number } {
      const hi = Math.max(from, to);
      const lo = Math.min(from, to);
      const h = (hi - lo) * unit;
      // 0 은 두께가 없어 보이지 않는다. 얇은 자국만 남겨 "아무것도 아니다" 를 보인다.
      const drawn = Math.max(2, h);
      return {
        x: laneX(g, lineIndex, i),
        y: base - hi * unit - (drawn - h) / 2,
        w: g.barW,
        h: drawn,
      };
    }

    function levelMark(g: Geo, lineIndex: number, y: number): SVGLineElement {
      const el = node('line', {
        x1: chartX(g, lineIndex) - 3,
        y1: y,
        x2: chartX(g, lineIndex) + g.chartW + 3,
        y2: y,
        stroke: palette.text,
        'stroke-width': 1.6,
        'stroke-dasharray': '4 3',
        opacity: 0,
      });
      gMarks.appendChild(el);
      markEls.push(el);
      return el;
    }

    async function fly(
      starts: { x: number; y: number; w: number; h: number }[],
      ends: { x: number; y: number; w: number; h: number }[],
      lineIndex: number,
      fadeLabels: boolean,
    ): Promise<void> {
      const bars = residBars;
      const labels = residLabels;
      for (const bar of bars) laneGroups[lineIndex].appendChild(bar);
      const total = MS_FLY + MS_FLY_GAP * Math.max(0, bars.length - 1);
      await run(total, (elapsed) => {
        for (let i = 0; i < bars.length; i++) {
          const t = ease(clamp01((elapsed - i * MS_FLY_GAP) / MS_FLY));
          const a = starts[i];
          const b = ends[i];
          rectOf(
            bars[i],
            a.x + (b.x - a.x) * t,
            a.y + (b.y - a.y) * t,
            a.w + (b.w - a.w) * t,
            a.h + (b.h - a.h) * t,
          );
          if (fadeLabels) labels[i].setAttribute('opacity', String(1 - t));
        }
      });
      for (const el of labels) el.remove();
      lanePieces.push(...bars);
      residBars = [];
      residLabels = [];
    }

    async function foldSigned(spec: {
      lineIndex: number;
      residuals: number[];
      total: number;
      caption: string;
    }): Promise<void> {
      const g = geo;
      if (destroyed || !g || residBars.length === 0) return;
      setCaption(spec.caption);
      const k = spec.lineIndex;

      const starts = residBars.map((bar) => ({
        x: Number(bar.getAttribute('x')),
        y: Number(bar.getAttribute('y')),
        w: Number(bar.getAttribute('width')),
        h: Number(bar.getAttribute('height')),
      }));
      const ends: { x: number; y: number; w: number; h: number }[] = [];
      let running = 0;
      for (let i = 0; i < residBars.length; i++) {
        const r = spec.residuals[i] ?? 0;
        const next = running + r;
        ends.push(laneRect(g, k, i, running, next, g.kPlot, baseY));
        running = next;
      }

      await fly(starts, ends, k, true);

      const mark = levelMark(g, k, baseY - spec.total * g.kPlot);
      const sum = text(chartX(g, k) + g.chartW / 2, SUM_Y, `Σr = ${fmt(spec.total)}`, {
        size: fontSizes.sm,
        fill: palette.text,
        weight: '600',
      });
      sum.setAttribute('opacity', '0');
      gMarks.appendChild(sum);
      markEls.push(sum);
      await run(MS_SETTLE, (elapsed) => {
        const t = clamp01(elapsed / MS_SETTLE);
        mark.setAttribute('opacity', String(t));
        sum.setAttribute('opacity', String(t));
      });
    }

    async function foldSquared(spec: {
      lineIndex: number;
      residuals: number[];
      squares: number[];
      total: number;
      caption: string;
    }): Promise<void> {
      const g = geo;
      if (destroyed || !g) return;
      // 같은 벗어남을 다시 세우는 것부터 한 몸짓이다 — 세우고, 펼치고, 담는다.
      await focusLine({
        lineIndex: spec.lineIndex,
        residuals: spec.residuals,
        caption: spec.caption,
      });
      if (destroyed || residBars.length === 0) return;
      const k = spec.lineIndex;

      // 1) 막대가 제 길이를 한 변으로 하는 정사각형으로 펼쳐진다.
      const before = residBars.map((bar) => ({
        x: Number(bar.getAttribute('x')),
        y: Number(bar.getAttribute('y')),
        w: Number(bar.getAttribute('width')),
        h: Number(bar.getAttribute('height')),
      }));
      const boxes = before.map((b, i) => {
        const side = b.h;
        const dir = unfoldDir[i] ?? 1;
        return { x: dir > 0 ? b.x : b.x + b.w - side, y: b.y, w: side, h: side };
      });
      const unfoldTotal = MS_UNFOLD + MS_UNFOLD_GAP * Math.max(0, residBars.length - 1);
      await run(unfoldTotal, (elapsed) => {
        for (let i = 0; i < residBars.length; i++) {
          const t = ease(clamp01((elapsed - i * MS_UNFOLD_GAP) / MS_UNFOLD));
          const a = before[i];
          const b = boxes[i];
          rectOf(residBars[i], a.x + (b.x - a.x) * t, a.y, a.w + (b.w - a.w) * t, a.h);
          // 수도 막대를 따라간다 — 먼저 자리를 옮기면 글자만 떨어져 나온 것으로 보인다.
          const label = residLabels[i];
          const cx = a.x + a.w / 2 + (b.x + b.w / 2 - (a.x + a.w / 2)) * t;
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('x', String(cx));
          label.setAttribute('y', String(b.y + b.h / 2 + 4));
          if (t > 0.35) label.textContent = fmt(spec.squares[i] ?? 0);
        }
      });
      if (destroyed) return;
      // 펼쳐진 정사각형을 한 박자 보여 준다 — 여기가 이 조각의 고비다.
      await wait(MS_HOLD);
      if (destroyed) return;

      // 2) 레인 폭에 맞춰 눌러 담는다. 픽셀 넓이는 그대로다.
      const ends: { x: number; y: number; w: number; h: number }[] = [];
      let running = 0;
      for (let i = 0; i < residBars.length; i++) {
        const next = running + (spec.squares[i] ?? 0);
        ends.push(laneRect(g, k, i, running, next, g.kCol, CHART_BOT));
        running = next;
      }
      await fly(boxes, ends, k, true);

      const top = CHART_BOT - spec.total * g.kCol;
      const mark = levelMark(g, k, top);
      const sum = text(chartX(g, k) + g.chartW / 2, top - 8, `Σr² = ${fmt(spec.total)}`, {
        size: fontSizes.sm,
        fill: palette.text,
        weight: '600',
      });
      sum.setAttribute('opacity', '0');
      gMarks.appendChild(sum);
      markEls.push(sum);
      await run(MS_SETTLE, (elapsed) => {
        const t = clamp01(elapsed / MS_SETTLE);
        mark.setAttribute('opacity', String(t));
        sum.setAttribute('opacity', String(t));
      });
    }

    /** 재는 자를 길이에서 넓이로. 쌓인 것을 비우고 기준선을 바닥으로 내린다. */
    async function shiftMeasure(spec: { caption: string }): Promise<void> {
      const g = geo;
      if (destroyed || !g) return;
      setCaption(spec.caption);
      for (const el of lineEls) {
        el.setAttribute('stroke-opacity', '0.28');
        el.setAttribute('stroke-width', '1.4');
      }
      for (const bg of chartBgs) bg.setAttribute('fill-opacity', '0.05');

      const leaving = lanePieces;
      lanePieces = [];
      const from = baseY;
      const to = CHART_BOT;
      // 부호 있는 합을 적은 표식은 남긴다 — 셋 다 0 이라는 기록이 논증의 절반이다.
      const fading = markEls.filter((el) => el.tagName === 'line');
      await run(MS_SHIFT, (elapsed) => {
        const t = ease(clamp01(elapsed / MS_SHIFT));
        const y = from + (to - from) * t;
        for (const el of baseEls) {
          el.setAttribute('y1', String(y));
          el.setAttribute('y2', String(y));
        }
        for (const el of leaving) {
          el.setAttribute('opacity', String(1 - t));
          el.setAttribute('transform', `translate(0 ${t * 16})`);
        }
        for (const el of fading) el.setAttribute('opacity', String(1 - t));
      });
      for (const el of leaving) el.remove();
      for (const el of fading) {
        el.remove();
        markEls.splice(markEls.indexOf(el), 1);
      }
      baseY = to;
    }

    /** 제곱이 가장 적게 쌓인 직선을 짚는다. */
    async function markSmallest(spec: { bestIndex: number; caption: string }): Promise<void> {
      const g = geo;
      if (destroyed || !g) return;
      setCaption(spec.caption);
      const k = spec.bestIndex;
      highlight(k);
      const ring = node('rect', {
        x: chartX(g, k) - 4,
        y: CHART_TOP - 4,
        width: g.chartW + 8,
        height: CHART_BOT - CHART_TOP + 8,
        fill: 'none',
        stroke: palette.accent,
        'stroke-width': 3,
        rx: 5,
        opacity: 0,
      });
      gMarks.appendChild(ring);
      markEls.push(ring);
      await run(MS_VERDICT, (elapsed) => {
        const t = ease(clamp01(elapsed / MS_VERDICT));
        ring.setAttribute('opacity', String(t));
      });
    }

    /** 처음 화면으로. 자동 재생이 끝난 뒤 한 걸음씩 짚어 볼 때만 부른다. */
    async function rewind(spec: { caption: string }): Promise<void> {
      if (destroyed) return;
      setCaption(spec.caption);
      const leaving = [...lanePieces, ...markEls, ...residBars, ...residLabels];
      lanePieces = [];
      markEls = [];
      residBars = [];
      residLabels = [];
      unfoldDir = [];
      const from = baseY;
      const to = geo ? geo.signedBase : CHART_TOP;
      await run(MS_REWIND, (elapsed) => {
        const t = ease(clamp01(elapsed / MS_REWIND));
        const y = from + (to - from) * t;
        for (const el of baseEls) {
          el.setAttribute('y1', String(y));
          el.setAttribute('y2', String(y));
        }
        for (const el of leaving) el.setAttribute('opacity', String(1 - t));
      });
      for (const el of leaving) el.remove();
      for (const el of lineEls) {
        el.setAttribute('stroke-opacity', '0.28');
        el.setAttribute('stroke-width', '1.4');
      }
      for (const bg of chartBgs) bg.setAttribute('fill-opacity', '0.05');
      baseY = to;
    }

    return {
      setup,
      focusLine,
      foldSigned,
      foldSquared,
      shiftMeasure,
      markSmallest,
      rewind,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        clearAll();
      },
    };
  },
};
