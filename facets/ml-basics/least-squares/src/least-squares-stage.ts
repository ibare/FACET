/**
 * least-squares stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
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
 * 어느 자를 쓰는지는 `scene.measure` 가 말하고 기준선의 높이가 거기서 나온다.
 * 옛 stage 는 그것을 `let baseY` 에 적어 두고 걸음이 옮겨 썼다.
 *
 * ── 운동의 출발 그림을 화면에서 되읽지 않는다
 *
 * 옛 `foldSigned` · `foldSquared` 는 `Number(bar.getAttribute('x'))` 로 막대의 지금
 * 자리를 꺼내 "여기서 저기로" 를 만들었다. 되짚어 세운 직후에는 그것이 **옛 화면의
 * 막대**라 조각이 엉뚱한 데서 출발한다. 지금은 `standingRectsOf` · `signedPileOf` ·
 * `squaredPileOf` 가 점과 계수에서 양 끝을 모두 셈하므로 되읽을 자리가 없다.
 * 펼침의 방향도 `unfoldDirOf(i, n)` 라는 자리 규칙이지 적어 두는 값이 아니다.
 *
 * ── 화면에 나란히 뜨는 수
 *
 * 막대의 길이 · 레인에 쌓인 조각의 높이 · `Σr` 과 `Σr²` 의 표기 · 수평 눈금의
 * 자리 · 고리가 걸리는 직선이 한 화면에 함께 뜬다. 그 전부가 `readingsOf` 가 한
 * 번에 셈한 배열에서 나온다 (`scene.ts` 의 "조각의 결론이 그림과 같은 자료에서").
 * **자리를 먼저 한 번에 셈하고 그 다음에 그린다.**
 *
 * ── 좌표
 *
 * 선언은 구조(점 · 계수 · 걸음 간격)만 주고 자리는 전부 여기서 셈한다 (S-piece).
 * 레인 폭에서 차트 폭이, 차트 폭에서 남는 폭이 플롯 폭이 되며, 플롯의 눈금은
 * "정사각형이 이웃 점을 침범하지 않는다" 는 한 가지 제약에서 나온다. 가로는
 * 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로만 여기 둔다 (S-view).
 *
 * ── 문자
 *
 * 이 무대가 스스로 그리는 글자는 표식뿐이다 — 눈금의 수, 직선의 식(`y = 2x`),
 * 합의 표기(`Σr` · `Σr²`), 잔차의 값. 어느 것도 어순이나 조사를 타지 않는다
 * (C10 의 표식/문안 판정 3번). 문장은 캡션 하나뿐이고 그것은 `params.t` 로 만든다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  shiftLightness,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  bestOf,
  captionOf,
  focusOf,
  readingsOf,
  sceneAt,
  type CaptionKind,
  type LeastSquaresScene,
  type LeastSquaresStep,
  type LineReading,
} from './scene.js';
import type { LeastSquaresLine, LeastSquaresPoint } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const STAGE_H = 330;

// 세로 자리.
const EQ_Y = 44;
const CHART_TOP = 56;
const CHART_BOT = STAGE_H - 80; // 250 — 제곱 단계의 기준선
const PLOT_TOP = 96;
const PLOT_BOT = CHART_BOT - 6; // 244
const TICK_Y = STAGE_H - 68; // 262 — 플롯 가로 눈금
const SUM_Y = STAGE_H - 56; // 274 — 부호 있는 합
const CAPTION_Y = STAGE_H - 22; // 308

// 가로 자리. 레인 폭이 먼저 정해지고 남는 폭을 플롯이 가져간다.
const PAD_L = 38;
const PAD_R = 14;
const GAP_MID = 20;
const CHART_GAP = 12;
const PLOT_MIN_W = 190;
const LANE_MAX_W = 30;
const LANE_INSET = 2; // 레인 막대 좌우 여백
const PLOT_BAR_W = 7; // 플롯의 잔차 막대 두께
const TOWER_LABEL_ROOM = 14;

// 걸음의 길이. 늘리면 읽을 시간이 늘고 재생이 길어진다.
const MS_FOCUS = 480;
const MS_GROW = 300;
const MS_GROW_GAP = 40;
const MS_FLY = 370;
const MS_FLY_GAP = 64;
const MS_UNFOLD = 340;
const MS_UNFOLD_GAP = 50;
const MS_HOLD = 180;
const MS_SETTLE = 160;
const MS_SHIFT = 520;
const MS_VERDICT = 460;
const MS_REWIND = 260;
const SHIFT_DROP = 16;

const MINUS = '−';

type Pt = LeastSquaresPoint;
type Ln = LeastSquaresLine;

/** 화면의 네모 하나. 양 끝을 모두 셈으로 얻으므로 되읽을 일이 없다. */
type Rect = { x: number; y: number; w: number; h: number };

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

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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

// ── 자리 셈. 전부 순수 함수다 — 장면만 주면 같은 자리가 나온다 ───────────────

/**
 * 캔버스와 바탕 자료에서 척도를 역산한다.
 *
 * 옛 stage 는 이것을 `let geo` 에 담아 두고 걸음마다 읽었다. 바탕에서만 나오는
 * 값이라 걸음이 고칠 것이 없는데도 변수였다 — 이제는 그릴 때마다 셈한다.
 */
function geoOf(points: readonly Pt[], lines: readonly Ln[]): Geo {
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

/** 기준선의 높이. 재는 자가 정한다 — 옛 `let baseY` 가 있던 자리다. */
function baseYOf(g: Geo, measure: 'length' | 'area'): number {
  return measure === 'length' ? g.signedBase : CHART_BOT;
}

/**
 * i 번째 막대가 펼쳐질 방향.
 *
 * 왼쪽 절반은 오른쪽으로, 오른쪽 절반은 왼쪽으로 — 정사각형이 플롯 밖으로 나가지
 * 않게 하는 **자리 규칙**이다. 옛 stage 는 이것을 `let unfoldDir` 에 적어 두고
 * 다음 걸음이 도로 읽었다 (함정 28).
 */
function unfoldDirOf(i: number, count: number): number {
  return i < count / 2 ? 1 : -1;
}

/** 플롯에서 직선에 붙어 선 벗어남 막대들. 운동의 출발 그림이 여기서 나온다. */
function standingRectsOf(
  g: Geo,
  points: readonly Pt[],
  line: Ln,
  residuals: readonly number[],
): Rect[] {
  return points.map((p, i) => {
    const r = residuals[i] ?? 0;
    const dir = unfoldDirOf(i, points.length);
    const cx = px(g, p.x);
    const yLine = py(g, line.slope * p.x + line.intercept);
    const h = Math.abs(r) * g.kPlot;
    return {
      x: dir > 0 ? cx : cx - PLOT_BAR_W,
      y: r > 0 ? yLine - h : yLine,
      w: PLOT_BAR_W,
      h,
    };
  });
}

/** 막대가 제 길이를 한 변으로 펼쳐진 정사각형. */
function squareBoxOf(bar: Rect, i: number, count: number): Rect {
  const side = bar.h;
  return {
    x: unfoldDirOf(i, count) > 0 ? bar.x : bar.x + bar.w - side,
    y: bar.y,
    w: side,
    h: side,
  };
}

/** 레인에 쌓인 조각의 자리. from → to 는 누적값(단위)이고 unit 은 그 단위의 눈금. */
function laneRectOf(
  g: Geo,
  lineIndex: number,
  i: number,
  from: number,
  to: number,
  unit: number,
  base: number,
): Rect {
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

/** 부호를 지닌 채 머리-꼬리로 쌓은 자리들. 되돌아오는 것이 눈에 보인다. */
function signedPileOf(g: Geo, lineIndex: number, residuals: readonly number[]): Rect[] {
  const out: Rect[] = [];
  let running = 0;
  for (let i = 0; i < residuals.length; i += 1) {
    const next = running + residuals[i];
    out.push(laneRectOf(g, lineIndex, i, running, next, g.kPlot, g.signedBase));
    running = next;
  }
  return out;
}

/** 제곱해서 쌓은 자리들. 되돌아올 길이 없어 올라가기만 한다. */
function squaredPileOf(g: Geo, lineIndex: number, squares: readonly number[]): Rect[] {
  const out: Rect[] = [];
  let running = 0;
  for (let i = 0; i < squares.length; i += 1) {
    const next = running + squares[i];
    out.push(laneRectOf(g, lineIndex, i, running, next, g.kCol, CHART_BOT));
    running = next;
  }
  return out;
}

function lerpRect(a: Rect, b: Rect, t: number): Rect {
  // 끝에서는 보간값이 아니라 목표값을 그대로 쓴다 — 부동소수 끝자리가 문자열을
  // 가른다 (프로토콜 함정 6).
  if (t >= 1) return b;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    w: a.w + (b.w - a.w) * t,
    h: a.h + (b.h - a.h) * t,
  };
}

export const leastSquaresStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<LeastSquaresScene> {
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    const palette = getColors(params.theme);
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 (S-view).
    svg.textContent = '';

    // ── 층. 그리는 순서가 곧 겹치는 순서다. 걸음마다 통째로 다시 세운다.
    const gPlot = node('g', {});
    const gLines = node('g', {});
    const gPoints = node('g', {});
    const gCharts = node('g', {});
    const gLanes = node('g', {});
    const gResid = node('g', {});
    const gMarks = node('g', {});
    const gFlow = node('g', {});
    const gCaption = node('g', {});
    const layers = [gPlot, gLines, gPoints, gCharts, gLanes, gResid, gMarks, gFlow, gCaption];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 걸음 하나가 프레임을 여러 번 지나고 `await` 도 여러 번 지난다. `destroy` 가
     * 그 가운데로 오는 길은 실제로 열려 있으므로, 마디마다 자기 번호가 아직
     * 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서
     * 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function wait(ms: number, mine: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
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

    /** 진행률을 프레임마다 흘려 준다. 끊기면 그리지 않고 물러나며 깨운다. */
    function run(ms: number, mine: number, onFrame: (elapsed: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine) || ms <= 0) {
          if (alive(mine)) onFrame(ms);
          return resolve();
        }
        const started = now();
        let id = 0;
        const finish = (): void => {
          waiters.delete(finish);
          frames.delete(id);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(id);
          if (!alive(mine)) return finish();
          const elapsed = now() - started;
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

    // ── 그리는 부속 ──────────────────────────────────────────────────────

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

    function place(el: SVGRectElement, r: Rect): void {
      el.setAttribute('x', String(r.x));
      el.setAttribute('y', String(r.y));
      el.setAttribute('width', String(Math.max(0, r.w)));
      el.setAttribute('height', String(Math.max(0, r.h)));
    }

    function rectNode(r: Rect, fill: string): SVGRectElement {
      const el = node('rect', { x: r.x, y: r.y, width: 0, height: 0, fill, rx: 1 });
      place(el, r);
      return el;
    }

    /** 잔차 값 딱지. 막대의 어느 쪽에 붙는지는 펼침 방향이 정한다. */
    function residLabel(bar: Rect, dir: number, value: string): SVGTextElement {
      return text(dir > 0 ? bar.x + bar.w + 4 : bar.x - 4, bar.y + bar.h / 2 + 4, value, {
        size: fontSizes.xs,
        fill: palette.textMuted,
        anchor: dir > 0 ? 'start' : 'end',
      });
    }

    function levelMark(g: Geo, lineIndex: number, y: number): SVGLineElement {
      return node('line', {
        x1: chartX(g, lineIndex) - 3,
        y1: y,
        x2: chartX(g, lineIndex) + g.chartW + 3,
        y2: y,
        stroke: palette.text,
        'stroke-width': 1.6,
        'stroke-dasharray': '4 3',
      });
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /**
     * 캡션이 말할 것. 장면은 갈래만 말하고 문자는 여기서 만든다 (C10).
     *
     * en 원본은 호출부 리터럴로 남고 **선언(`facet.ts`)이 정본**이다 — 하나만
     * 고치면 `en-original-matches-declaration` 이 잡는다 (함정 32).
     */
    function captionText(kind: CaptionKind): string {
      switch (kind) {
        case 'opening':
          return t('caption.opening', 'Four points. Three lines to be judged.');
        case 'miss':
          return t('caption.miss', 'Each point misses the line by this much.');
        case 'cancel':
          return t('caption.cancel', 'Stacked with their signs, the misses undo one another.');
        case 'allZero':
          return t(
            'caption.allZero',
            'All three come back to zero. The signed sum cannot tell them apart.',
          );
        case 'square':
          return t(
            'caption.square',
            'So square each miss: a length becomes an area, and an area is never negative.',
          );
        case 'pileUp':
          return t('caption.pileUp', 'The same misses, squared. Squares only pile up.');
        case 'split':
          return t('caption.split', 'Now the three stand apart.');
        case 'verdict':
          return t(
            'caption.verdict',
            'Least squares picks the line whose squares pile up the least.',
          );
      }
    }

    // ── 자취 그리기 ──────────────────────────────────────────────────────

    /** 자취가 세우는 것들. 되감기가 떠나는 그림을 유령 층에 세울 때도 쓴다. */
    type Painted = {
      /** 플롯에 서 있는 벗어남 막대. */
      standBars: SVGRectElement[];
      standLabels: SVGTextElement[];
      /** 직선마다 레인에 담긴 조각. 재는 자에 따라 길이거나 넓이다. */
      pieces: SVGRectElement[][];
      /** 부호 있는 합의 수평 눈금. 넓이로 바꿀 때 지워진다. */
      signedMarks: (SVGLineElement | null)[];
      /** `Σr = 0` 기록. **남는다** — 셋 다 0 이라는 것이 논증의 절반이다. */
      signedSums: (SVGTextElement | null)[];
      squaredMarks: (SVGLineElement | null)[];
      squaredSums: (SVGTextElement | null)[];
      /** 가장 낮은 탑에 걸리는 고리. 머무는 표식이다. */
      ring: SVGRectElement | null;
      /** 통째로 거두어야 할 때 (되감기 유령). */
      all: SVGElement[];
    };

    type Slots = { lanes: SVGGElement; resid: SVGGElement; marks: SVGGElement };

    /**
     * 자취가 말하는 것을 전부 세운다.
     *
     * 바탕(플롯 · 직선 · 점 · 차트 틀)은 그리지 않는다 — 되감기의 유령은 자취만
     * 흩어져야 하기 때문이다.
     */
    function paintTrace(
      g: Geo,
      scene: LeastSquaresScene,
      readings: readonly LineReading[],
      hues: readonly string[],
      into: Slots,
    ): Painted {
      const count = scene.lines.length;
      const out: Painted = {
        standBars: [],
        standLabels: [],
        pieces: readings.map(() => []),
        signedMarks: new Array<SVGLineElement | null>(count).fill(null),
        signedSums: new Array<SVGTextElement | null>(count).fill(null),
        squaredMarks: new Array<SVGLineElement | null>(count).fill(null),
        squaredSums: new Array<SVGTextElement | null>(count).fill(null),
        ring: null,
        all: [],
      };

      const keep = <E extends SVGElement>(el: E, parent: SVGGElement): E => {
        parent.appendChild(el);
        out.all.push(el);
        return el;
      };

      // 담긴 조각. 지금 쓰는 자가 무엇을 담을지 정한다.
      const poured = scene.measure === 'length' ? scene.signedPoured : scene.squaredPoured;
      for (let k = 0; k < poured && k < count; k += 1) {
        const reading = readings[k];
        const rects =
          scene.measure === 'length'
            ? signedPileOf(g, k, reading.residuals)
            : squaredPileOf(g, k, reading.squares);
        for (let i = 0; i < rects.length; i += 1) {
          const sign = reading.residuals[i] < 0 ? shiftLightness(hues[k], 0.16) : hues[k];
          out.pieces[k].push(keep(rectNode(rects[i], sign), into.lanes));
        }
      }

      // 부호 있는 합의 기록. 넓이로 바꾼 뒤에도 남는다.
      for (let k = 0; k < scene.signedPoured && k < count; k += 1) {
        const total = readings[k].signedTotal;
        if (scene.measure === 'length') {
          out.signedMarks[k] = keep(
            levelMark(g, k, g.signedBase - total * g.kPlot),
            into.marks,
          );
        }
        out.signedSums[k] = keep(
          text(chartX(g, k) + g.chartW / 2, SUM_Y, `Σr = ${fmt(total)}`, {
            size: fontSizes.sm,
            fill: palette.text,
            weight: '600',
          }),
          into.marks,
        );
      }

      // 제곱합의 기록.
      for (let k = 0; k < scene.squaredPoured && k < count; k += 1) {
        const top = CHART_BOT - readings[k].squaredTotal * g.kCol;
        out.squaredMarks[k] = keep(levelMark(g, k, top), into.marks);
        out.squaredSums[k] = keep(
          text(
            chartX(g, k) + g.chartW / 2,
            top - 8,
            `Σr² = ${fmt(readings[k].squaredTotal)}`,
            { size: fontSizes.sm, fill: palette.text, weight: '600' },
          ),
          into.marks,
        );
      }

      // 플롯에 선 벗어남 막대.
      if (scene.standing !== null && scene.standing < count) {
        const k = scene.standing;
        const reading = readings[k];
        const bars = standingRectsOf(g, scene.points, scene.lines[k], reading.residuals);
        for (let i = 0; i < bars.length; i += 1) {
          const r = reading.residuals[i];
          const sign = r < 0 ? shiftLightness(hues[k], 0.16) : hues[k];
          out.standBars.push(keep(rectNode(bars[i], sign), into.resid));
          out.standLabels.push(
            keep(residLabel(bars[i], unfoldDirOf(i, bars.length), fmtSigned(r)), into.resid),
          );
        }
      }

      // 판정. 머무는 표식이라 정적 그리기가 세운다 (S-scene).
      if (scene.judged && count > 0) {
        const k = bestOf(readings);
        out.ring = keep(
          node('rect', {
            x: chartX(g, k) - 4,
            y: CHART_TOP - 4,
            width: g.chartW + 8,
            height: CHART_BOT - CHART_TOP + 8,
            fill: 'none',
            stroke: palette.accent,
            'stroke-width': 3,
            rx: 5,
          }),
          into.marks,
        );
      }

      return out;
    }

    // ── 정적 그리기 ──────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function clearLayers(): void {
      for (const layer of layers) layer.textContent = '';
    }

    type Drawn = Painted & {
      geo: Geo | null;
      readings: LineReading[];
      hues: readonly string[];
      baseEls: SVGLineElement[];
    };

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: LeastSquaresScene): Drawn {
      clearLayers();
      gCaption.appendChild(
        text(W / 2, CAPTION_Y, captionText(captionOf(scene)), {
          size: fontSizes.md,
          fill: palette.text,
          mono: false,
        }),
      );

      const empty: Painted = {
        standBars: [],
        standLabels: [],
        pieces: [],
        signedMarks: [],
        signedSums: [],
        squaredMarks: [],
        squaredSums: [],
        ring: null,
        all: [],
      };
      if (scene.points.length === 0 || scene.lines.length === 0) {
        return { ...empty, geo: null, readings: [], hues: [], baseEls: [] };
      }

      // 자리를 먼저 한 번에 셈하고 그 다음에 그린다 (함정 13).
      const g = geoOf(scene.points, scene.lines);
      const readings = readingsOf(scene);
      // 색판은 바탕 자료에서 한 번에 센다. 드러난 수로 정하면 갈린다 (함정 12).
      const hues = categorical(scene.lines.length, 'vivid');
      const focus = focusOf(scene);
      const baseY = baseYOf(g, scene.measure);

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
      for (const p of scene.points) {
        gPlot.appendChild(
          text(px(g, p.x), TICK_Y, trim(p.x), {
            size: fontSizes.xs,
            fill: palette.textMuted,
          }),
        );
      }

      // 견줄 직선들. 모두 옅게 깔리고 짚은 것만 진해진다.
      for (let k = 0; k < scene.lines.length; k += 1) {
        const ln = scene.lines[k];
        gLines.appendChild(
          node('line', {
            x1: px(g, g.xLo),
            y1: py(g, ln.slope * g.xLo + ln.intercept),
            x2: px(g, g.xHi),
            y2: py(g, ln.slope * g.xHi + ln.intercept),
            stroke: hues[k],
            'stroke-width': focus === k ? 2.6 : 1.4,
            'stroke-opacity': focus === k ? 1 : focus === null ? 0.28 : 0.22,
            'stroke-linecap': 'round',
          }),
        );
      }

      for (const p of scene.points) {
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

      // 쌓는 자리 — 직선마다 하나. 기준선의 높이는 재는 자가 정한다.
      const baseEls: SVGLineElement[] = [];
      for (let k = 0; k < scene.lines.length; k += 1) {
        gCharts.appendChild(
          node('rect', {
            x: chartX(g, k),
            y: CHART_TOP,
            width: g.chartW,
            height: CHART_BOT - CHART_TOP,
            fill: hues[k],
            'fill-opacity': focus === k ? 0.14 : 0.05,
            rx: 3,
          }),
        );
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
          text(chartX(g, k) + g.chartW / 2, EQ_Y, fmtLine(scene.lines[k]), {
            size: fontSizes.sm,
            fill: hues[k],
            weight: '600',
          }),
        );
      }

      const painted = paintTrace(g, scene, readings, hues, {
        lanes: gLanes,
        resid: gResid,
        marks: gMarks,
      });

      return { ...painted, geo: g, readings, hues, baseEls };
    }

    // ── 걸음의 운동 ──────────────────────────────────────────────────────

    /** 벗어남 막대가 직선에서 점까지 자란다. */
    function growBars(
      bars: SVGRectElement[],
      labels: SVGTextElement[],
      targets: readonly Rect[],
      residuals: readonly number[],
      mine: number,
    ): Promise<void> {
      return run(MS_FOCUS, mine, (elapsed) => {
        for (let i = 0; i < bars.length; i += 1) {
          const e = ease(clamp01((elapsed - i * MS_GROW_GAP) / MS_GROW));
          const target = targets[i];
          const h = e >= 1 ? target.h : target.h * e;
          // 위로 벗어난 막대는 직선에서 위로 자라고, 아래로 벗어난 것은 아래로.
          const y = residuals[i] > 0 ? target.y + target.h - h : target.y;
          place(bars[i], { x: target.x, y, w: PLOT_BAR_W, h });
          labels[i].setAttribute('opacity', String(e));
          labels[i].setAttribute('y', String(y + h / 2 + 4));
        }
      });
    }

    /** 조각이 차례로 레인으로 날아간다. 딱지는 따라가며 사라진다. */
    function flyPieces(
      bars: SVGRectElement[],
      labels: SVGTextElement[],
      starts: readonly Rect[],
      ends: readonly Rect[],
      mine: number,
    ): Promise<void> {
      const total = MS_FLY + MS_FLY_GAP * Math.max(0, bars.length - 1);
      return run(total, mine, (elapsed) => {
        for (let i = 0; i < bars.length; i += 1) {
          const e = ease(clamp01((elapsed - i * MS_FLY_GAP) / MS_FLY));
          place(bars[i], lerpRect(starts[i], ends[i], e));
          labels[i]?.setAttribute('opacity', String(1 - e));
        }
      });
    }

    /** 합의 표식이 내려앉는다. */
    function settleMark(
      mark: SVGElement | null,
      sum: SVGElement | null,
      mine: number,
    ): Promise<void> {
      mark?.setAttribute('opacity', '0');
      sum?.setAttribute('opacity', '0');
      return run(MS_SETTLE, mine, (elapsed) => {
        const e = clamp01(elapsed / MS_SETTLE);
        mark?.setAttribute('opacity', String(e));
        sum?.setAttribute('opacity', String(e));
      });
    }

    async function flowStand(
      drawn: Drawn,
      scene: LeastSquaresScene,
      mine: number,
    ): Promise<void> {
      const g = drawn.geo;
      const k = scene.standing;
      if (g === null || k === null) return;
      const reading = drawn.readings[k];
      const targets = standingRectsOf(g, scene.points, scene.lines[k], reading.residuals);
      await growBars(drawn.standBars, drawn.standLabels, targets, reading.residuals, mine);
    }

    async function flowPourSigned(
      drawn: Drawn,
      scene: LeastSquaresScene,
      mine: number,
    ): Promise<void> {
      const g = drawn.geo;
      const k = scene.signedPoured - 1;
      if (g === null || k < 0) return;
      const reading = drawn.readings[k];
      // 출발 그림은 장면에서 셈한다 — 화면을 되읽지 않는다 (S-scene).
      const starts = standingRectsOf(g, scene.points, scene.lines[k], reading.residuals);
      const ends = signedPileOf(g, k, reading.residuals);
      const labels = starts.map((bar, i) =>
        gFlow.appendChild(
          residLabel(bar, unfoldDirOf(i, starts.length), fmtSigned(reading.residuals[i])),
        ),
      );
      await flyPieces(drawn.pieces[k] ?? [], labels, starts, ends, mine);
      if (!alive(mine)) return;
      for (const el of labels) el.remove();
      await settleMark(drawn.signedMarks[k], drawn.signedSums[k], mine);
    }

    /** 재는 자가 넓이로 바뀐다. 쌓인 것이 흩어지고 기준선이 바닥으로 내려간다. */
    async function flowShift(
      drawn: Drawn,
      scene: LeastSquaresScene,
      mine: number,
    ): Promise<void> {
      const g = drawn.geo;
      if (g === null) return;
      // 떠나는 그림을 유령 층에 세운다. 자취를 장면이 말하므로 `prev` 가 필요 없다.
      const ghost = paintTrace(
        g,
        sceneAt(scene, {
          measure: 'length',
          signedPoured: scene.signedPoured,
          squaredPoured: 0,
          standing: null,
          judged: false,
        }),
        drawn.readings,
        drawn.hues,
        { lanes: gFlow, resid: gFlow, marks: gFlow },
      );
      const leaving = ghost.pieces.flat();
      const from = g.signedBase;
      const to = CHART_BOT;
      await run(MS_SHIFT, mine, (elapsed) => {
        const e = ease(clamp01(elapsed / MS_SHIFT));
        const y = e >= 1 ? to : from + (to - from) * e;
        for (const el of drawn.baseEls) {
          el.setAttribute('y1', String(y));
          el.setAttribute('y2', String(y));
        }
        for (const el of ghost.all) el.setAttribute('opacity', String(1 - e));
        for (const el of leaving) el.setAttribute('transform', `translate(0 ${e * SHIFT_DROP})`);
      });
    }

    async function flowPourSquared(
      drawn: Drawn,
      scene: LeastSquaresScene,
      mine: number,
    ): Promise<void> {
      const g = drawn.geo;
      const k = scene.squaredPoured - 1;
      if (g === null || k < 0) return;
      const reading = drawn.readings[k];
      const bars = drawn.pieces[k] ?? [];
      const stands = standingRectsOf(g, scene.points, scene.lines[k], reading.residuals);
      const boxes = stands.map((bar, i) => squareBoxOf(bar, i, stands.length));
      const ends = squaredPileOf(g, k, reading.squares);
      const labels = stands.map((bar, i) =>
        gFlow.appendChild(
          residLabel(bar, unfoldDirOf(i, stands.length), fmtSigned(reading.residuals[i])),
        ),
      );

      // 1) 같은 벗어남을 다시 세운다 — 세우고, 펼치고, 담는 한 몸짓의 첫 마디다.
      await growBars(bars, labels, stands, reading.residuals, mine);
      if (!alive(mine)) return;

      // 2) 막대가 제 길이를 한 변으로 하는 정사각형으로 펼쳐진다.
      const unfoldTotal = MS_UNFOLD + MS_UNFOLD_GAP * Math.max(0, bars.length - 1);
      await run(unfoldTotal, mine, (elapsed) => {
        for (let i = 0; i < bars.length; i += 1) {
          const e = ease(clamp01((elapsed - i * MS_UNFOLD_GAP) / MS_UNFOLD));
          const a = stands[i];
          const b = boxes[i];
          // 가로로만 펼쳐진다 — 세로는 막대가 이미 가진 길이 그대로다.
          place(bars[i], {
            x: e >= 1 ? b.x : a.x + (b.x - a.x) * e,
            y: a.y,
            w: e >= 1 ? b.w : a.w + (b.w - a.w) * e,
            h: a.h,
          });
          // 수도 막대를 따라간다 — 먼저 자리를 옮기면 글자만 떨어져 나온 것으로 보인다.
          const label = labels[i];
          const midA = a.x + a.w / 2;
          const midB = b.x + b.w / 2;
          label.setAttribute('text-anchor', 'middle');
          label.setAttribute('x', String(e >= 1 ? midB : midA + (midB - midA) * e));
          label.setAttribute('y', String(b.y + b.h / 2 + 4));
          if (e > 0.35) label.textContent = fmt(reading.squares[i]);
        }
      });
      if (!alive(mine)) return;

      // 펼쳐진 정사각형을 한 박자 보여 준다 — 여기가 이 조각의 고비다.
      await wait(MS_HOLD, mine);
      if (!alive(mine)) return;

      // 3) 레인 폭에 맞춰 눌러 담는다. 픽셀 넓이는 그대로다.
      await flyPieces(bars, labels, boxes, ends, mine);
      if (!alive(mine)) return;
      for (const el of labels) el.remove();
      await settleMark(drawn.squaredMarks[k], drawn.squaredSums[k], mine);
    }

    function flowVerdict(drawn: Drawn, mine: number): Promise<void> {
      const ring = drawn.ring;
      if (ring === null) return Promise.resolve();
      ring.setAttribute('opacity', '0');
      return run(MS_VERDICT, mine, (elapsed) => {
        const e = ease(clamp01(elapsed / MS_VERDICT));
        ring.setAttribute('opacity', String(e));
      });
    }

    /** 처음 화면으로. 떠나는 그림은 걸음이 실어 온 자취에서 되세운다. */
    async function flowRewind(
      drawn: Drawn,
      scene: LeastSquaresScene,
      step: Extract<LeastSquaresStep, { kind: 'rewind' }>,
      mine: number,
    ): Promise<void> {
      const g = drawn.geo;
      if (g === null) return;
      const ghost = paintTrace(g, sceneAt(scene, step.was), drawn.readings, drawn.hues, {
        lanes: gFlow,
        resid: gFlow,
        marks: gFlow,
      });
      const from = baseYOf(g, step.was.measure);
      const to = g.signedBase;
      await run(MS_REWIND, mine, (elapsed) => {
        const e = ease(clamp01(elapsed / MS_REWIND));
        const y = e >= 1 ? to : from + (to - from) * e;
        for (const el of drawn.baseEls) {
          el.setAttribute('y1', String(y));
          el.setAttribute('y2', String(y));
        }
        for (const el of ghost.all) el.setAttribute('opacity', String(1 - e));
      });
    }

    function flowFor(
      step: LeastSquaresStep,
      drawn: Drawn,
      scene: LeastSquaresScene,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'stand':
          return flowStand(drawn, scene, mine);
        case 'pour-signed':
          return flowPourSigned(drawn, scene, mine);
        case 'shift':
          return flowShift(drawn, scene, mine);
        case 'pour-squared':
          return flowPourSquared(drawn, scene, mine);
        case 'verdict':
          return flowVerdict(drawn, mine);
        case 'rewind':
          return flowRewind(drawn, scene, step, mine);
      }
    }

    // ── 장면 그리기 ──────────────────────────────────────────────────────

    async function render(
      next: LeastSquaresScene,
      _prev: LeastSquaresScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
