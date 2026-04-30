/**
 * linear-regression-stage View — 선형 회귀 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 다음을 모두 담는다:
 *   - 상단 캡션 (개념 한 줄 + 사건 메시지)
 *   - 좌측 데이터 평면 (좌표축 + 점 + 가설 직선 + 잔차 정사각형 + RSS 라벨 + 두 게이지)
 *   - 우측 매개변수 평면 ((w, b) 축 + 등고선 + 현재 점 + 발자국 궤적 + (w, b) 라벨)
 *   - 두 평면 사이 옅은 세로 분리선
 *   - 손실 곡선 패널 (가로 580×80, 수렴 깃발)
 *   - 참고 레퍼런스 칩 4개
 *
 * 시각적 정체성 (기획 §5):
 *   1. 데이터 평면 직선 + 잔차 정사각형 — 면적의 합 = 손실.
 *   2. 매개변수 평면 등고선 + 굴러가는 점 — 두 시점 1:1 동기.
 *   3. 두 게이지 — 잔차 부호 합 / 잔차 제곱 합 비대칭 운동.
 *   4. 학습률 운동 모양 — 슬라이더는 control-bar 가 그리고 stage 는 발산 표지를 받는다.
 *   5. 수렴 깃발 + 손실 곡선 — 운동의 정지에 사건성.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 데이터 점 — palette.text
 *   - 가설 직선 — categorical(8, 'vivid')[3] (청록)
 *   - 잔차 정사각형 — categorical(8, 'pastel')[1] 채움 + categorical(8, 'vivid')[1] 테두리 (살구색 톤)
 *   - 등고선 — categorical(8, 'pastel')[3] → categorical(8, 'deep')[3] (바깥 → 중심 청록 톤)
 *   - 현재 (w, b) 점 — categorical(8, 'deep')[3]
 *   - 발자국 궤적 — categorical(8, 'pastel')[3] 점선
 *   - 잔차 합 게이지 — palette.text 양방향
 *   - 잔차 제곱 합 게이지 — categorical(8, 'vivid')[1] 단방향
 *   - 수렴 깃발 — palette.danger
 *   - 발산 표지 / 잘림 점선 — palette.danger
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import { getColors, fonts, fontSizes, categorical } from '@facet/core/runtime';
import type { Point, LrSegment } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스 ──────────────────────────────────────────────────────────────
const W = 720;
const H = 620;

// ── 영역 ────────────────────────────────────────────────────────────────
const TITLE_Y = 22;
const CONCEPT_Y0 = 42;
const CONCEPT_LINE_H = 16;

const BODY_Y = 110;
const BODY_H = 280;

// 좌측 데이터 평면.
const DATA_X = 14;
const DATA_W = 320;
const DATA_AXIS_X = DATA_X + 36;
const DATA_AXIS_Y = BODY_Y + 8;
const DATA_AXIS_W = 280 - 28;
const DATA_AXIS_H = 220;

// 두 게이지 위치 (데이터 평면 좌하단).
const GAUGE_Y0 = BODY_Y + DATA_AXIS_H + 36;
const GAUGE_W = 100;
const GAUGE_H = 8;
const GAUGE_GAP = 18;

// 우측 매개변수 평면.
const PARAM_X = DATA_X + DATA_W + 20;
const PARAM_W = 240;
const PARAM_AXIS_X = PARAM_X + 36;
const PARAM_AXIS_Y = BODY_Y + 8;
const PARAM_AXIS_W = PARAM_W - 50;
const PARAM_AXIS_H = 220;

// 손실 곡선 패널.
const LOSS_PANEL_Y = BODY_Y + BODY_H + 18;
const LOSS_PANEL_H = 80;
const LOSS_PANEL_X = DATA_X;
const LOSS_PANEL_W = (DATA_X + DATA_W + 20 + PARAM_W) - DATA_X;

// 참고 칩.
const CHIP_Y0 = LOSS_PANEL_Y + LOSS_PANEL_H + 22;
const CHIP_Y1 = CHIP_Y0 + 20;

// 운동 시간 (ms).
const STEP_MOVE_DUR = 280;
const PULSE_DUR = 240;
const FLAG_PULSE_DUR = 600;
const CAPTION_DUR = 1800;

// 데이터 도메인.
const DATA_DOM_X0 = 0;
const DATA_DOM_X1 = 5;
const DATA_DOM_Y0 = -1;
const DATA_DOM_Y1 = 11;

type Refs = { name: string; url: string };

const REFERENCES: Refs[] = [
  { name: 'Setosa — OLS Regression', url: 'https://setosa.io/ev/ordinary-least-squares-regression/' },
  { name: 'ml-visualized — Linear Regression', url: 'https://ml-visualized.com/chapter1/linear_regression' },
  { name: 'Google ML — Loss / GD', url: 'https://developers.google.com/machine-learning/crash-course/linear-regression/loss' },
  { name: 'angeloyeo — 선형회귀', url: 'https://angeloyeo.github.io/2020/08/24/linear_regression.html' },
];

const CONCEPT_TEXT = [
  '선형 회귀는 점 무리에 직선 한 줄을 끼우되, 잔차 제곱을',
  '면적으로 환원해 그 면적의 합이 가장 작아지도록 직선을 매',
  '반복마다 한 걸음씩 회전·이동시키는 학습 운동이다.',
];

// ── SVG 헬퍼 ────────────────────────────────────────────────────────────

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}
function makeText(
  parent: SVGElement,
  attrs: Record<string, string | number>,
  text = '',
): SVGTextElement {
  const el = document.createElementNS(SVG_NS, 'text');
  setAttrs(el, attrs);
  el.textContent = text;
  parent.appendChild(el);
  return el;
}
function makeRect(parent: SVGElement, attrs: Record<string, string | number>): SVGRectElement {
  const el = document.createElementNS(SVG_NS, 'rect');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makeLine(parent: SVGElement, attrs: Record<string, string | number>): SVGLineElement {
  const el = document.createElementNS(SVG_NS, 'line');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makeCircle(parent: SVGElement, attrs: Record<string, string | number>): SVGCircleElement {
  const el = document.createElementNS(SVG_NS, 'circle');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makeEllipse(parent: SVGElement, attrs: Record<string, string | number>): SVGEllipseElement {
  const el = document.createElementNS(SVG_NS, 'ellipse');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makePath(parent: SVGElement, attrs: Record<string, string | number>): SVGPathElement {
  const el = document.createElementNS(SVG_NS, 'path');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makePolyline(parent: SVGElement, attrs: Record<string, string | number>): SVGPolylineElement {
  const el = document.createElementNS(SVG_NS, 'polyline');
  setAttrs(el, attrs);
  parent.appendChild(el);
  return el;
}
function makeGroup(parent: SVGElement): SVGGElement {
  const el = document.createElementNS(SVG_NS, 'g');
  parent.appendChild(el);
  return el;
}

// ── 좌표 변환 ───────────────────────────────────────────────────────────

function dataX(x: number): number {
  return DATA_AXIS_X + ((x - DATA_DOM_X0) / (DATA_DOM_X1 - DATA_DOM_X0)) * DATA_AXIS_W;
}
function dataY(y: number): number {
  return DATA_AXIS_Y + DATA_AXIS_H - ((y - DATA_DOM_Y0) / (DATA_DOM_Y1 - DATA_DOM_Y0)) * DATA_AXIS_H;
}

// ── OLS 닫힌해 + Hessian (2x2) ──────────────────────────────────────────

function olsSolution(points: Point[]): {
  wStar: number;
  bStar: number;
  minRss: number;
  /** Hessian H = [[A, B], [B, C]] — RSS(w,b) ≈ minRss + dw^T H dw 의 계수. */
  A: number;
  B: number;
  C: number;
} {
  const n = points.length;
  if (n === 0) return { wStar: 0, bStar: 0, minRss: 0, A: 1, B: 0, C: 1 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  const xbar = sx / n;
  const ybar = sy / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - xbar) * (p.y - ybar);
    den += (p.x - xbar) * (p.x - xbar);
  }
  const wStar = den === 0 ? 0 : num / den;
  const bStar = ybar - wStar * xbar;
  let minRss = 0;
  for (const p of points) {
    const r = p.y - wStar * p.x - bStar;
    minRss += r * r;
  }
  // RSS(w,b) = Σ (y - wx - b)^2.
  //         = Σ x^2 (w-w*)^2 + 2 Σ x (w-w*)(b-b*) + n (b-b*)^2 + minRss.
  let sxx = 0;
  for (const p of points) sxx += p.x * p.x;
  return { wStar, bStar, minRss, A: sxx, B: sx, C: n };
}

/** ellipse 회전각 θ (rad) 와 두 축 방향 eigenvalue 분해. */
function ellipseAxes(A: number, B: number, C: number): {
  theta: number;
  lambda1: number;
  lambda2: number;
} {
  // 2x2 대칭행렬 [[A, B], [B, C]] 의 eigenvalue.
  const tr = A + C;
  const disc = Math.sqrt(Math.max(0, (A - C) * (A - C) + 4 * B * B));
  const lambda1 = (tr + disc) / 2;
  const lambda2 = (tr - disc) / 2;
  // 큰 eigenvalue 의 eigenvector: (B, lambda1 - A). lambda1 - A 가 0 이면 (1, 0).
  const vy = lambda1 - A;
  const theta = Math.atan2(vy, B === 0 ? 1 : B);
  return { theta, lambda1, lambda2 };
}

// ── 시퀀스 큐 ───────────────────────────────────────────────────────────

class TaskQueue {
  private chain: Promise<unknown> = Promise.resolve();
  enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.chain.then(() => task());
    this.chain = next.catch(() => undefined);
    return next;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── stage 본체 ──────────────────────────────────────────────────────────

export const linearRegressionStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';

    const colors = getColors(params.theme);
    const catVivid = categorical(8, 'vivid');
    const catPastel = categorical(8, 'pastel');
    const catDeep = categorical(8, 'deep');

    const LINE_TONE = catVivid[3]!;
    const SQ_FILL = catPastel[1]!;
    const SQ_STROKE = catVivid[1]!;
    const CONTOUR_OUT = catPastel[3]!;
    const CONTOUR_IN = catDeep[3]!;
    const PARAM_DOT = catDeep[3]!;
    const TRAIL_TONE = catPastel[3]!;
    const RSS_GAUGE_TONE = catVivid[1]!;
    const DANGER = colors.danger;

    const svg = document.createElementNS(SVG_NS, 'svg');
    setAttrs(svg, {
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
      height: 'auto',
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': '선형 회귀 시각화 — 잔차 정사각형과 등고선의 1:1 동기',
    });
    svg.style.fontFamily = fonts.body;
    svg.style.background = colors.bg;
    container.appendChild(svg);

    // 상단 캡션.
    makeText(
      svg,
      {
        x: W / 2,
        y: TITLE_Y,
        'text-anchor': 'middle',
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: colors.text,
      },
      '선형 회귀 — 잔차의 면적이 줄어들수록 점이 골짜기를 굴러간다',
    );

    for (let i = 0; i < CONCEPT_TEXT.length; i++) {
      makeText(
        svg,
        {
          x: W / 2,
          y: CONCEPT_Y0 + i * CONCEPT_LINE_H,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        CONCEPT_TEXT[i]!,
      );
    }

    // 두 평면 사이 분리선.
    const sepX = (DATA_X + DATA_W + PARAM_X) / 2;
    makeLine(svg, {
      x1: sepX,
      y1: BODY_Y,
      x2: sepX,
      y2: BODY_Y + BODY_H,
      stroke: colors.border,
      'stroke-width': 1,
      'stroke-dasharray': '2 4',
      opacity: 0.5,
    });

    // ── 데이터 평면 ───────────────────────────────────────────────────────
    const dataLayer = makeGroup(svg);

    // 외곽 (영역 바운딩).
    makeRect(dataLayer, {
      x: DATA_X,
      y: BODY_Y - 4,
      width: DATA_W,
      height: BODY_H + 4,
      fill: 'none',
      stroke: 'none',
    });

    // y / x 축선.
    makeLine(dataLayer, {
      x1: DATA_AXIS_X,
      y1: DATA_AXIS_Y,
      x2: DATA_AXIS_X,
      y2: DATA_AXIS_Y + DATA_AXIS_H,
      stroke: colors.border,
      'stroke-width': 1,
    });
    makeLine(dataLayer, {
      x1: DATA_AXIS_X,
      y1: DATA_AXIS_Y + DATA_AXIS_H,
      x2: DATA_AXIS_X + DATA_AXIS_W,
      y2: DATA_AXIS_Y + DATA_AXIS_H,
      stroke: colors.border,
      'stroke-width': 1,
    });
    // 축 라벨.
    makeText(
      dataLayer,
      {
        x: DATA_AXIS_X - 6,
        y: DATA_AXIS_Y + 10,
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      'y',
    );
    makeText(
      dataLayer,
      {
        x: DATA_AXIS_X + DATA_AXIS_W + 6,
        y: DATA_AXIS_Y + DATA_AXIS_H - 4,
        'text-anchor': 'start',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      'x',
    );

    // RSS 라벨 (우상단).
    const rssLabel = makeText(
      dataLayer,
      {
        x: DATA_X + DATA_W - 6,
        y: BODY_Y + 18,
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        'font-family': fonts.mono,
      },
      'RSS = —',
    );

    // 잔차 사각형 + 직선 + 점은 init 에서 그려짐.
    const squaresLayer = makeGroup(dataLayer);
    const linePath = makeLine(dataLayer, {
      x1: DATA_AXIS_X,
      y1: DATA_AXIS_Y + DATA_AXIS_H / 2,
      x2: DATA_AXIS_X + DATA_AXIS_W,
      y2: DATA_AXIS_Y + DATA_AXIS_H / 2,
      stroke: LINE_TONE,
      'stroke-width': 2,
      'stroke-linecap': 'round',
      opacity: 0,
    });
    const pointsLayer = makeGroup(dataLayer);

    // 발산 잘림 표지 (점선 외곽 — 영역 가장자리).
    const dangerOverlay = makeRect(dataLayer, {
      x: DATA_AXIS_X,
      y: DATA_AXIS_Y,
      width: DATA_AXIS_W,
      height: DATA_AXIS_H,
      fill: 'none',
      stroke: DANGER,
      'stroke-width': 1.5,
      'stroke-dasharray': '4 3',
      opacity: 0,
    });

    // 두 게이지 — 잔차 합 (양방향) + 잔차 제곱 합 (단방향).
    const gaugeGroup = makeGroup(dataLayer);
    const gaugeXBase = DATA_AXIS_X;
    // 잔차 합 게이지 라벨.
    makeText(
      gaugeGroup,
      {
        x: gaugeXBase,
        y: GAUGE_Y0 - 4,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      '잔차 합 (부호 포함)',
    );
    // 양방향 막대 트랙.
    makeRect(gaugeGroup, {
      x: gaugeXBase,
      y: GAUGE_Y0,
      width: GAUGE_W,
      height: GAUGE_H,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 0.5,
    });
    // 0 중심 마커.
    const sumZeroX = gaugeXBase + GAUGE_W / 2;
    makeLine(gaugeGroup, {
      x1: sumZeroX,
      y1: GAUGE_Y0 - 1,
      x2: sumZeroX,
      y2: GAUGE_Y0 + GAUGE_H + 1,
      stroke: colors.text,
      'stroke-width': 0.7,
    });
    const sumBar = makeRect(gaugeGroup, {
      x: sumZeroX,
      y: GAUGE_Y0,
      width: 0,
      height: GAUGE_H,
      fill: colors.text,
      opacity: 0.7,
    });

    // 잔차 제곱 합 게이지.
    const sqGaugeY = GAUGE_Y0 + GAUGE_GAP;
    makeText(
      gaugeGroup,
      {
        x: gaugeXBase,
        y: sqGaugeY - 4,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      '잔차 제곱 합 (손실)',
    );
    makeRect(gaugeGroup, {
      x: gaugeXBase,
      y: sqGaugeY,
      width: GAUGE_W,
      height: GAUGE_H,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 0.5,
    });
    const sqBar = makeRect(gaugeGroup, {
      x: gaugeXBase,
      y: sqGaugeY,
      width: GAUGE_W,
      height: GAUGE_H,
      fill: RSS_GAUGE_TONE,
      opacity: 0.85,
    });

    // ── 매개변수 평면 ─────────────────────────────────────────────────────
    const paramLayer = makeGroup(svg);

    // 축선.
    makeLine(paramLayer, {
      x1: PARAM_AXIS_X,
      y1: PARAM_AXIS_Y,
      x2: PARAM_AXIS_X,
      y2: PARAM_AXIS_Y + PARAM_AXIS_H,
      stroke: colors.border,
      'stroke-width': 1,
    });
    makeLine(paramLayer, {
      x1: PARAM_AXIS_X,
      y1: PARAM_AXIS_Y + PARAM_AXIS_H,
      x2: PARAM_AXIS_X + PARAM_AXIS_W,
      y2: PARAM_AXIS_Y + PARAM_AXIS_H,
      stroke: colors.border,
      'stroke-width': 1,
    });
    makeText(
      paramLayer,
      {
        x: PARAM_AXIS_X - 6,
        y: PARAM_AXIS_Y + 10,
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      'b',
    );
    makeText(
      paramLayer,
      {
        x: PARAM_AXIS_X + PARAM_AXIS_W + 6,
        y: PARAM_AXIS_Y + PARAM_AXIS_H - 4,
        'text-anchor': 'start',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      'w',
    );

    // (w, b) 라벨 우상단.
    const wbLabel = makeText(
      paramLayer,
      {
        x: PARAM_X + PARAM_W - 6,
        y: BODY_Y + 18,
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        'font-family': fonts.mono,
      },
      '(w, b) = —',
    );
    // 등고선 범례 (좌하단).
    makeText(
      paramLayer,
      {
        x: PARAM_AXIS_X,
        y: BODY_Y + BODY_H - 12,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      '등고선: 바깥=큼, 중심=작음',
    );

    const contourLayer = makeGroup(paramLayer);
    const trailLayer = makeGroup(paramLayer);
    const dotLayer = makeGroup(paramLayer);

    // ── 손실 곡선 패널 ────────────────────────────────────────────────────
    const lossLayer = makeGroup(svg);
    makeRect(lossLayer, {
      x: LOSS_PANEL_X,
      y: LOSS_PANEL_Y,
      width: LOSS_PANEL_W,
      height: LOSS_PANEL_H,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 0.5,
      rx: 3,
    });
    makeText(
      lossLayer,
      {
        x: LOSS_PANEL_X + 8,
        y: LOSS_PANEL_Y + 14,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      },
      '손실 곡선 — 시간 t 에 따른 RSS',
    );
    makeText(
      lossLayer,
      {
        x: LOSS_PANEL_X + LOSS_PANEL_W - 8,
        y: LOSS_PANEL_Y + LOSS_PANEL_H - 6,
        'text-anchor': 'end',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        'font-family': fonts.mono,
      },
      't',
    );
    const lossCurveLayer = makeGroup(lossLayer);
    const lossPolyline = makePolyline(lossCurveLayer, {
      fill: 'none',
      stroke: LINE_TONE,
      'stroke-width': 1.5,
      points: '',
    });
    const lossFlagLayer = makeGroup(lossLayer);

    // 사건 캡션 (본체 영역 위).
    const eventCaption = makeText(
      svg,
      {
        x: W / 2,
        y: BODY_Y - 16,
        'text-anchor': 'middle',
        'font-size': fontSizes.sm,
        fill: colors.text,
      },
      '',
    );

    // 참고 칩.
    for (let i = 0; i < REFERENCES.length; i++) {
      const r = REFERENCES[i]!;
      const colW = W / REFERENCES.length;
      const cx = colW * i + colW / 2;
      const a = document.createElementNS(SVG_NS, 'a');
      a.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', r.url);
      a.setAttribute('href', r.url);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      const t = makeText(
        a as unknown as SVGElement,
        {
          x: cx,
          y: CHIP_Y0,
          'text-anchor': 'middle',
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        },
        r.name,
      );
      t.style.cursor = 'pointer';
      svg.appendChild(a);
    }
    makeText(
      svg,
      {
        x: W / 2,
        y: CHIP_Y1,
        'text-anchor': 'middle',
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        opacity: 0.7,
      },
      '참고 — Setosa · ml-visualized · Google ML Crash Course · angeloyeo',
    );

    // ── 상태 ──────────────────────────────────────────────────────────────
    let pointsData: Point[] = [];
    let currentW = 0;
    let currentB = 0;
    let initialRss = 1;
    let lossSeries: Array<{ t: number; rss: number }> = [];
    let trailPts: Array<{ x: number; y: number }> = [];
    let paramRangeRef: [number, number, number, number] = [-2, 4, -1, 4];
    let convergedFlagX: number | null = null;
    let stoppedDiverged = false;

    const queue = new TaskQueue();
    let captionResetTimer: ReturnType<typeof setTimeout> | null = null;

    // 점 / 사각형 cache — index 별 SVG 요소 보관.
    const pointEls: SVGCircleElement[] = [];
    const squareEls: SVGRectElement[] = [];

    function paramX(w: number): number {
      const [wMin, wMax] = paramRangeRef;
      const t = (w - wMin) / Math.max(1e-6, wMax - wMin);
      return PARAM_AXIS_X + Math.max(0, Math.min(1, t)) * PARAM_AXIS_W;
    }
    function paramY(b: number): number {
      const [, , bMin, bMax] = paramRangeRef;
      const t = (b - bMin) / Math.max(1e-6, bMax - bMin);
      return PARAM_AXIS_Y + PARAM_AXIS_H - Math.max(0, Math.min(1, t)) * PARAM_AXIS_H;
    }

    function setEventCaption(text: string, opts?: { duration?: number }): void {
      eventCaption.textContent = text;
      if (captionResetTimer !== null) clearTimeout(captionResetTimer);
      const duration = opts?.duration ?? CAPTION_DUR;
      captionResetTimer = setTimeout(() => {
        eventCaption.textContent = '';
        captionResetTimer = null;
      }, duration);
    }

    function clearChildren(g: SVGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function rebuildPointsAndSquares(): void {
      clearChildren(squaresLayer);
      clearChildren(pointsLayer);
      pointEls.length = 0;
      squareEls.length = 0;
      for (let i = 0; i < pointsData.length; i++) {
        const p = pointsData[i]!;
        // 잔차 정사각형 — 점에서 직선까지의 y 방향 변 + 직선 평행 변.
        const sq = makeRect(squaresLayer, {
          x: dataX(p.x),
          y: dataY(p.y),
          width: 0,
          height: 0,
          fill: SQ_FILL,
          stroke: SQ_STROKE,
          'stroke-width': 0.8,
          opacity: 0.55,
        });
        squareEls.push(sq);

        const c = makeCircle(pointsLayer, {
          cx: dataX(p.x),
          cy: dataY(p.y),
          r: 3,
          fill: colors.text,
        });
        pointEls.push(c);
      }
    }

    /** 직선 + 잔차 사각형을 (w, b) 에 맞춰 다시 그림. */
    function repaintLineAndSquares(w: number, b: number): void {
      // 직선: x ∈ [DOM_X0, DOM_X1] 두 끝점.
      const x1 = DATA_DOM_X0;
      const y1 = w * x1 + b;
      const x2 = DATA_DOM_X1;
      const y2 = w * x2 + b;
      setAttrs(linePath, {
        x1: dataX(x1),
        y1: dataY(y1),
        x2: dataX(x2),
        y2: dataY(y2),
        opacity: 1,
      });

      // y 단위와 x 단위가 데이터 평면에서 다른 픽셀 스케일을 갖는다.
      // 잔차 변 길이를 y 단위로 정의하고, 정사각형의 다른 변 (직선 평행) 도
      // 같은 |잔차| y 단위 길이로 그린다 — 위치만으로 부호가 흡수됨.
      const yPerUnit = DATA_AXIS_H / (DATA_DOM_Y1 - DATA_DOM_Y0);
      // 정사각형은 SVG 좌표계에서 '시각적 정사각형' 으로 그리되, 변 길이는
      // |잔차| × (yPerUnit) 로 통일한다 (점과 직선 사이 수직 변 = SVG y 픽셀
      // 길이). 다른 변 (직선 평행 = 수평) 은 같은 픽셀 길이로 그려 정사각형.
      const danger: number[] = [];
      for (let i = 0; i < pointsData.length; i++) {
        const p = pointsData[i]!;
        const yhat = w * p.x + b;
        const r = p.y - yhat; // 잔차 (y 단위, 양수 = 점이 직선 위쪽)
        const sidePx = Math.abs(r) * yPerUnit;
        const px = dataX(p.x);
        const pyPoint = dataY(p.y);
        const pyLine = dataY(yhat);
        // 정사각형: 점과 직선 사이 수직 변 + 점 옆쪽으로 sidePx 만큼 펼친 변.
        // 잔차 양수 (점이 직선 위) — 직선 위쪽 영역, 사각형은 점에서 좌측으로 펼침.
        // 잔차 음수 (점이 직선 아래) — 직선 아래쪽, 사각형은 점에서 우측으로 펼침.
        const xLeft = r >= 0 ? px - sidePx : px;
        const yTop = Math.min(pyPoint, pyLine);
        const widthPx = sidePx;
        const heightPx = Math.abs(pyPoint - pyLine);
        // 영역 가장자리를 벗어나면 잘리고 잘림 표지 발화 (단순화 — flag).
        if (
          xLeft < DATA_AXIS_X - 4 ||
          xLeft + widthPx > DATA_AXIS_X + DATA_AXIS_W + 4 ||
          yTop < DATA_AXIS_Y - 4 ||
          yTop + heightPx > DATA_AXIS_Y + DATA_AXIS_H + 4
        ) {
          danger.push(i);
        }
        const sq = squareEls[i];
        if (sq) {
          // 잘림 — 가장자리에 클램프.
          const cx = Math.max(DATA_AXIS_X, Math.min(DATA_AXIS_X + DATA_AXIS_W - widthPx, xLeft));
          const cy = Math.max(DATA_AXIS_Y, Math.min(DATA_AXIS_Y + DATA_AXIS_H - heightPx, yTop));
          const cw = Math.max(0, Math.min(DATA_AXIS_W, widthPx));
          const ch = Math.max(0, Math.min(DATA_AXIS_H, heightPx));
          setAttrs(sq, {
            x: cx,
            y: cy,
            width: cw,
            height: ch,
          });
        }
      }
      // 영역 밖으로 잘린 잔차가 있으면 잘림 표지 점선을 발화.
      dangerOverlay.setAttribute('opacity', danger.length > 0 ? '0.55' : '0');
    }

    function repaintRssLabel(rss: number, residualSum: number): void {
      rssLabel.textContent = `RSS = ${rss.toFixed(2)}`;
      const sumScale = Math.max(1, Math.abs(residualSum));
      const norm = Math.tanh(residualSum / sumScale);
      const halfW = (GAUGE_W / 2) * Math.abs(norm);
      if (norm >= 0) {
        setAttrs(sumBar, { x: sumZeroX, width: halfW });
      } else {
        setAttrs(sumBar, { x: sumZeroX - halfW, width: halfW });
      }
      const ratio = Math.max(0, Math.min(1, rss / Math.max(1e-6, initialRss)));
      setAttrs(sqBar, { width: GAUGE_W * ratio });
    }

    function repaintWbLabel(w: number, b: number): void {
      wbLabel.textContent = `(w, b) = (${w.toFixed(2)}, ${b.toFixed(2)})`;
    }

    function buildContours(): void {
      clearChildren(contourLayer);
      if (pointsData.length === 0) return;
      const { wStar, bStar, minRss, A, B, C } = olsSolution(pointsData);
      const { theta, lambda1, lambda2 } = ellipseAxes(A, B, C);
      const cx = paramX(wStar);
      const cy = paramY(bStar);
      // 등고선 단계 — minRss 부터 (initialRss 또는 적절한 max) 까지 6단.
      const startRss = computeRssAt(currentW, currentB);
      const maxLevel = Math.max(startRss, minRss + 1) * 1.05;
      const levels = 6;
      for (let k = levels; k >= 1; k--) {
        const level = minRss + ((maxLevel - minRss) * k) / levels;
        const radius2 = level - minRss;
        if (radius2 <= 0) continue;
        // semi-axes (w, b 도메인 단위).
        const aDomain = Math.sqrt(radius2 / Math.max(1e-9, lambda1));
        const bDomain = Math.sqrt(radius2 / Math.max(1e-9, lambda2));
        // 도메인 → SVG 픽셀.
        const [wMin, wMax, bMin, bMax] = paramRangeRef;
        const xPerW = PARAM_AXIS_W / (wMax - wMin);
        const yPerB = PARAM_AXIS_H / (bMax - bMin);
        // axis-aligned ellipse 의 도메인 반지름을 SVG 로 옮길 때 회전이 있으므로
        // 평균 단위로 변환하고 transform 으로 회전.
        const sX = aDomain * xPerW;
        const sY = bDomain * yPerB;
        const t = k / levels;
        const fillTone = lerpHex(CONTOUR_OUT, CONTOUR_IN, 1 - t);
        const ell = makeEllipse(contourLayer, {
          cx,
          cy,
          rx: sX,
          ry: sY,
          fill: fillTone,
          'fill-opacity': 0.18,
          stroke: fillTone,
          'stroke-width': 0.8,
          'stroke-opacity': 0.5,
        });
        // 회전: SVG y 축이 반전되므로 -theta.
        ell.setAttribute('transform', `rotate(${(-theta * 180) / Math.PI}, ${cx}, ${cy})`);
      }
      // 중심 십자.
      makeLine(contourLayer, {
        x1: cx - 3,
        y1: cy,
        x2: cx + 3,
        y2: cy,
        stroke: CONTOUR_IN,
        'stroke-width': 0.7,
        opacity: 0.8,
      });
      makeLine(contourLayer, {
        x1: cx,
        y1: cy - 3,
        x2: cx,
        y2: cy + 3,
        stroke: CONTOUR_IN,
        'stroke-width': 0.7,
        opacity: 0.8,
      });
    }

    function computeRssAt(w: number, b: number): number {
      let s = 0;
      for (const p of pointsData) {
        const r = p.y - (w * p.x + b);
        s += r * r;
      }
      return s;
    }

    /** 두 hex 색을 t (0~1) 로 보간 — 단순 RGB 보간. */
    function lerpHex(a: string, b: string, t: number): string {
      const ar = parseInt(a.slice(1, 3), 16);
      const ag = parseInt(a.slice(3, 5), 16);
      const ab = parseInt(a.slice(5, 7), 16);
      const br = parseInt(b.slice(1, 3), 16);
      const bg = parseInt(b.slice(3, 5), 16);
      const bb = parseInt(b.slice(5, 7), 16);
      const r = Math.round(ar + (br - ar) * t);
      const g = Math.round(ag + (bg - ag) * t);
      const bl = Math.round(ab + (bb - ab) * t);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
    }

    function rebuildParamDot(): void {
      clearChildren(dotLayer);
      const cx = paramX(currentW);
      const cy = paramY(currentB);
      makeCircle(dotLayer, {
        cx,
        cy,
        r: 4.5,
        fill: PARAM_DOT,
      });
    }

    function repaintTrail(): void {
      clearChildren(trailLayer);
      if (trailPts.length < 2) return;
      const pts = trailPts.map((p) => `${paramX(p.x).toFixed(1)},${paramY(p.y).toFixed(1)}`).join(' ');
      makePolyline(trailLayer, {
        points: pts,
        fill: 'none',
        stroke: TRAIL_TONE,
        'stroke-width': 1,
        'stroke-dasharray': '2 2',
        opacity: 0.85,
      });
    }

    function repaintLossCurve(): void {
      if (lossSeries.length === 0) {
        lossPolyline.setAttribute('points', '');
        clearChildren(lossFlagLayer);
        return;
      }
      const padX = 14;
      const padTop = 22;
      const padBottom = 14;
      const tMax = Math.max(8, lossSeries[lossSeries.length - 1]!.t);
      const rMax = Math.max(...lossSeries.map((s) => s.rss), initialRss);
      const innerW = LOSS_PANEL_W - padX * 2;
      const innerH = LOSS_PANEL_H - padTop - padBottom;
      const pts = lossSeries.map((s) => {
        const x = LOSS_PANEL_X + padX + (s.t / tMax) * innerW;
        const y = LOSS_PANEL_Y + padTop + innerH - (s.rss / Math.max(1e-6, rMax)) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      lossPolyline.setAttribute('points', pts.join(' '));
      // 깃발 갱신.
      clearChildren(lossFlagLayer);
      if (convergedFlagX !== null) {
        // 깃발 위치 = 마지막 점.
        const last = lossSeries[lossSeries.length - 1]!;
        const fx = LOSS_PANEL_X + padX + (last.t / tMax) * innerW;
        const fy = LOSS_PANEL_Y + padTop + innerH - (last.rss / Math.max(1e-6, rMax)) * innerH;
        // 깃대.
        makeLine(lossFlagLayer, {
          x1: fx,
          y1: fy,
          x2: fx,
          y2: fy - 16,
          stroke: DANGER,
          'stroke-width': 1.2,
        });
        // 깃발 삼각형.
        makePath(lossFlagLayer, {
          d: `M ${fx} ${fy - 16} L ${fx + 9} ${fy - 12} L ${fx} ${fy - 8} Z`,
          fill: DANGER,
        });
        makeText(
          lossFlagLayer,
          {
            x: fx + 12,
            y: fy - 9,
            'font-size': fontSizes.xs,
            fill: DANGER,
          },
          '수렴',
        );
      }
    }

    // ── 외부 API ─────────────────────────────────────────────────────────

    function reset(): void {
      stoppedDiverged = false;
      convergedFlagX = null;
      lossSeries = [];
      trailPts = [];
      eventCaption.textContent = '';
      if (captionResetTimer !== null) {
        clearTimeout(captionResetTimer);
        captionResetTimer = null;
      }
      clearChildren(squaresLayer);
      clearChildren(pointsLayer);
      clearChildren(contourLayer);
      clearChildren(trailLayer);
      clearChildren(dotLayer);
      clearChildren(lossFlagLayer);
      lossPolyline.setAttribute('points', '');
      linePath.setAttribute('opacity', '0');
      dangerOverlay.setAttribute('opacity', '0');
      rssLabel.textContent = 'RSS = —';
      wbLabel.textContent = '(w, b) = —';
      pointEls.length = 0;
      squareEls.length = 0;
    }

    function setBaseCaption(_text: string): void {
      // 개념 문장은 stage 상단에 고정 표시 — 별도 처리 없음.
    }

    function init(payload: {
      points: Point[];
      w: number;
      b: number;
      rss: number;
      residualSum: number;
      lr: number;
      lrSegmentIndex: number;
      lrSegments: LrSegment[];
      contourLevels: number;
      paramRange: [number, number, number, number];
      epsilon: number;
    }): void {
      pointsData = payload.points.slice();
      currentW = payload.w;
      currentB = payload.b;
      paramRangeRef = payload.paramRange;
      initialRss = payload.rss;
      lossSeries = [{ t: 0, rss: payload.rss }];
      trailPts = [{ x: currentW, y: currentB }];
      convergedFlagX = null;
      stoppedDiverged = false;

      rebuildPointsAndSquares();
      repaintLineAndSquares(currentW, currentB);
      buildContours();
      rebuildParamDot();
      repaintTrail();
      repaintLossCurve();
      repaintRssLabel(payload.rss, payload.residualSum);
      repaintWbLabel(currentW, currentB);
    }

    function signalStepBegin(_payload: { t: number; w: number; b: number; lr: number }): Promise<void> {
      return queue.enqueue(async () => {
        // 짧은 동기 펄스 — 직선 색 깜빡 + 점 둘레 펄스.
        linePath.setAttribute('stroke-width', '3');
        const dot = dotLayer.firstChild as SVGCircleElement | null;
        if (dot) dot.setAttribute('r', '6');
        await wait(PULSE_DUR / 2);
        linePath.setAttribute('stroke-width', '2');
        if (dot) dot.setAttribute('r', '4.5');
      });
    }

    function signalStepEnd(payload: {
      t: number;
      w: number;
      b: number;
      prevW: number;
      prevB: number;
      rss: number;
      prevRss: number;
      residualSum: number;
    }): Promise<void> {
      return queue.enqueue(async () => {
        if (stoppedDiverged) return;
        currentW = payload.w;
        currentB = payload.b;
        // 직선·사각형 재계산.
        repaintLineAndSquares(currentW, currentB);
        // 매개변수 점·발자국·등고선 재계산.
        trailPts.push({ x: currentW, y: currentB });
        repaintTrail();
        rebuildParamDot();
        // 손실 곡선.
        lossSeries.push({ t: payload.t, rss: payload.rss });
        repaintLossCurve();
        repaintRssLabel(payload.rss, payload.residualSum);
        repaintWbLabel(currentW, currentB);
        await wait(STEP_MOVE_DUR / 2);
      });
    }

    function signalConverged(payload: { t: number; w: number; b: number; rss: number }): Promise<void> {
      return queue.enqueue(async () => {
        convergedFlagX = payload.t;
        repaintLossCurve();
        // 매개변수 점에 도착 표지 (펄스 두 겹).
        const cx = paramX(payload.w);
        const cy = paramY(payload.b);
        const r1 = makeCircle(dotLayer, {
          cx,
          cy,
          r: 4.5,
          fill: 'none',
          stroke: DANGER,
          'stroke-width': 1.2,
          opacity: 0.9,
        });
        const r2 = makeCircle(dotLayer, {
          cx,
          cy,
          r: 4.5,
          fill: 'none',
          stroke: DANGER,
          'stroke-width': 1.2,
          opacity: 0.6,
        });
        // 펄스 — radius 증가 + opacity 감소.
        const start = performance.now();
        const dur = FLAG_PULSE_DUR;
        await new Promise<void>((resolve) => {
          function frame(now: number) {
            const t = Math.min(1, (now - start) / dur);
            r1.setAttribute('r', String(4.5 + t * 8));
            r1.setAttribute('opacity', String(0.9 * (1 - t)));
            r2.setAttribute('r', String(4.5 + t * 14));
            r2.setAttribute('opacity', String(0.6 * (1 - t)));
            if (t < 1) requestAnimationFrame(frame);
            else {
              r1.remove();
              r2.remove();
              resolve();
            }
          }
          requestAnimationFrame(frame);
        });
        setEventCaption('수렴 — 더 줄지 않는다.');
      });
    }

    function signalDiverged(_payload: { t: number; w: number; b: number; rss: number }): Promise<void> {
      return queue.enqueue(async () => {
        stoppedDiverged = true;
        dangerOverlay.setAttribute('opacity', '0.7');
        // 직선을 살짝 빨강 강조 (한 박자만).
        linePath.setAttribute('stroke', DANGER);
        setEventCaption('학습률이 너무 크다 — 직선이 발산했다.');
        await wait(420);
        linePath.setAttribute('stroke', LINE_TONE);
      });
    }

    function applyLrChanged(value: number, segmentIndex: number): void {
      // 학습률 segmented-slider 변경 — 캡션 한 줄.
      const label = ['느림', '적정', '발산'][segmentIndex] ?? `η=${value.toFixed(3)}`;
      setEventCaption(`학습률 → ${label} (η = ${value.toFixed(3)})`);
      // 발산 표지가 떠 있던 경우 새 학습률에서 다시 시도하므로 표지 끔.
      if (segmentIndex !== 2) {
        dangerOverlay.setAttribute('opacity', '0');
        stoppedDiverged = false;
      }
    }

    function signalReset(): void {
      reset();
    }

    // 외부 인터페이스 노출.
    const stage = {
      reset,
      init,
      setBaseCaption,
      setCaption: setEventCaption,
      signalStepBegin,
      signalStepEnd,
      signalConverged,
      signalDiverged,
      applyLrChanged,
      signalReset,
    };

    // dispatch — control-bar 가 ViewMountParams 의 dispatch 와는 별도 onAction 을
    // 통해 mechanism 으로 보냄. stage 자체는 dispatch 안 함.
    void params;

    const instance: ViewInstance = {
      destroy() {
        if (captionResetTimer !== null) clearTimeout(captionResetTimer);
        if (svg.parentElement) svg.remove();
      },
    };
    // 외부 (projector) 에서 메서드 호출용으로 stage 를 instance 에 부착.
    Object.assign(instance, stage);
    return instance;
  },
};
