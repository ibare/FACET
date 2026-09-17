/**
 * 잔차 조각의 그림 — 장면을 받아 화면 **전체** 를 세운다.
 *
 * 무대는 산점도지만 주인공은 **세로로 내려꽂히는 막대** 다. 축과 점은 그 동사가
 * 일어나는 자리일 뿐이므로 옅게 그리고, 막대만 굵고 진하게 간다.
 *
 * 대비를 세우는 장치가 둘이다.
 *  - 최단거리는 **점을 중심으로 자라는 원이 직선에 닿는 순간** 으로 보인다. 접점이
 *    수선의 발이고, 직각 표시가 그것을 못박는다.
 *  - 세로 막대는 그 원을 **뚫고 나가** 직선에 닿는다. 더 길다는 것이 눈에 보인다.
 *
 * 기각한 후보(원 · 수선)는 옅은 유령으로 남긴다. 지워 버리면 대비도 함께 사라진다.
 *
 * ── 장면 방식이라 달라진 것
 *
 * 걸음마다 부르는 메서드가 없다. `render` 하나가 그 장면이 말하는 것을 통째로
 * 세우고, 흐르게 할 것이 있으면 그 다음에 흘린다. 그래서 되돌릴 명령이 없다.
 *
 * **척도를 변수로 쥐지 않는다.** `kx` · `ky` · `domX0` · `domX1` · `domY1` 이
 * `let` 으로 앉아 화면의 모든 좌표를 정하던 자리였는데, 지금은 `layoutOf` 가 장면의
 * 계수와 점에서 매번 셈해 그 render 안에서만 산다. 장면은 값의 범위를 말하고
 * 픽셀은 여기서 나온다 (S-piece).
 *
 * **운동의 출발값을 화면에서 되읽지 않는다.** 고리가 걸어오는 자리는 `step.from`
 * 이 말하고, 돌려세우는 각과 길이는 `footOf` 가 기하로 셈한다. 되짚어 세운 직후에는
 * 화면이 옛 걸음의 것이라 거기서 꺼내면 엉뚱한 자리에서 출발한다 (S-scene).
 *
 * 좌표는 전부 여기서 셈한다 (S-piece). 선언에는 구조(계수 · 점)만 있다.
 * 세로 축척은 **직선의 시각 기울기** 를 지키려고 잡은 것이다 — 그림을 눕히면
 * 수선과 세로가 같은 방향으로 보여 조각의 주장 자체가 사라진다. 그래서 세로가
 * 이 조각에서 넉넉하다.
 *
 * 화면의 문자는 네 갈래다. 눈금 수 · 직선의 수식 · 잔차 값 · 축 이름(`x` · `y`)은
 * 수식 표기(표식)라 번역 대상이 아니고, 캡션만 `params.t` 를 지난다 (C10).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  pointOf,
  predictedAt,
  residualOf,
  type ResidualDistanceScene,
  type ResidualStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view). */
const CANVAS_H = 380;
const W = PIECE_CANVAS_W;

/** 그림틀. 왼쪽은 y 눈금 글자 자리, 아래는 x 눈금과 캡션 자리다. */
const PLOT_TOP = 20;
const PLOT_BOTTOM = 330;
const GUTTER_LEFT = 56;
/** 오른쪽에 남기는 폭 — 맨 오른쪽 점의 잔차 값이 여기 적힌다. 상한이 아니라 글자 자리다. */
const GUTTER_RIGHT = 40;
const XTICK_BASELINE = 348;
const CAPTION_BASELINE = 370;

const PLOT_L = GUTTER_LEFT;
const PLOT_R = W - GUTTER_RIGHT;

/** 축척 여유. x 는 넉넉히, y 는 빠듯하게 — 직선을 눕히지 않으려는 것이다. */
const X_PAD_RATIO = 0.2;
const Y_PAD_RATIO = 0.08;

const POINT_R = 5;
const RING_R = 12;
const RING_GROW = 2.4;
const BAR_W = 5;
const BAR_BUMP = 3;
const DART = 6;
const RIGHT_ANGLE = 8;
const SWEEP_R = 26;

const RING_MS = 260;
const RING_MOVE_MS = 180;
const PROBE_MS = 420;
const TURN_MS = 560;
const DROP_MS = 420;
const LAND_MS = 130;
const DONE_MS = 340;

/** 보간 한 마디의 길이. */
const FRAME_MS = 16;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

/** 눈금 간격 — 대여섯 칸이 되게 1 / 2 / 5 계열에서 고른다. */
function niceStep(span: number): number {
  const raw = span / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 4.5 ? 5 : n >= 1.8 ? 2 : 1) * mag;
}

function tickText(v: number, step: number): string {
  return step < 1 ? v.toFixed(1) : String(Math.round(v));
}

/** 부호를 앞에 세운 잔차 표기. 음수는 하이픈이 아니라 뺄셈 기호를 쓴다. */
function signedText(v: number): string {
  return `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`;
}

/** `y = 1.5x + 1` 꼴의 수식 표기. 절편이 음수면 부호를 갈아 끼운다. */
function equationText(slope: number, intercept: number): string {
  const sign = intercept < 0 ? '−' : '+';
  return `y = ${slope}x ${sign} ${Math.abs(intercept)}`;
}

/**
 * 축의 척도. **장면에서 매번 셈한다** — stage 가 변수로 쥐면 그것이 곧 숨은
 * 상태이고 되짚은 화면이 옛 척도로 선다.
 */
type Layout = {
  domX0: number;
  domX1: number;
  domY1: number;
  kx: number;
  ky: number;
  /** 직선 방향의 단위 벡터 (화면 좌표). 수선의 발을 셈하는 데 쓴다. */
  dirX: number;
  dirY: number;
};

/** 꽂힌 막대 한 벌. 정적 그리기가 매번 새로 짓는다. */
type BarDrawn = {
  bar: SVGLineElement;
  dart: SVGPolygonElement;
  label: SVGTextElement;
};

/** 최단거리 유령 한 벌. 기각한 뒤에는 직각 표시가 없다. */
type ProbeDrawn = {
  circle: SVGCircleElement;
  radius: SVGLineElement;
  angle: SVGPolylineElement | null;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  layout: Layout | null;
  ring: SVGCircleElement | null;
  probe: ProbeDrawn | null;
  bars: BarDrawn[];
};

/** 점에서 직선에 내린 수선. 화면을 되읽지 않고 기하로 셈한다. */
type Foot = {
  /** 점의 화면 자리. */
  cx: number;
  cy: number;
  /** 수선의 발. */
  gx: number;
  gy: number;
  /** 수선의 길이 = 최단거리. */
  r: number;
  /** 같은 x 에서 직선이 지나는 세로 자리. */
  fy: number;
};

export const residualDistanceStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ResidualDistanceScene> {
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // 부호는 두 갈래를 가르는 식별색이다 — 상태 어휘에 "선 위 / 선 아래" 가 없으므로
    // categorical 두 칸을 쓴다 (S-view 결정 트리 3번). 따뜻한 쪽이 위, 찬 쪽이 아래.
    const signColors = categorical(2, 'vivid');
    const ABOVE = signColors[0];
    const BELOW = signColors[1];

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    function textNode(attrs: Record<string, string | number>, content: string): SVGTextElement {
      const node = el('text', { 'font-family': fonts.mono, ...attrs });
      node.textContent = content;
      return node;
    }

    // 층 — 뒤에서 앞으로. 점은 막대 위에 놓여야 가려지지 않는다.
    const gridLayer = el('g', {});
    const lineLayer = el('g', {});
    const ghostLayer = el('g', {});
    const barLayer = el('g', {});
    const pointLayer = el('g', {});
    const ringLayer = el('g', {});
    const layers = [gridLayer, lineLayer, ghostLayer, barLayer, pointLayer, ringLayer];
    for (const g of layers) svg.appendChild(g);

    // 재건 밖에 있는 하나. 자리는 고정이고 글자만 정적 그리기가 매번 다시 쓴다.
    const caption = textNode(
      {
        x: W / 2,
        y: CAPTION_BASELINE,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.text,
      },
      '',
    );
    svg.appendChild(caption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다. `destroy` 가 그 가운데 오면 남은 마디가
     * **살아 있는 층**에 막대를 덧붙이므로, 마디마다 자기 번호가 아직 유효한지 보고
     * 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지
     * 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS transition 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition 은
     * 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 척도 ─────────────────────────────────────────────────────────────

    function layoutOf(scene: ResidualDistanceScene): Layout | null {
      if (scene.points.length === 0) return null;
      const xs = scene.points.map((p) => p.x);
      const xLo = Math.min(...xs);
      const xHi = Math.max(...xs);
      const xSpan = xHi - xLo || 1;
      const domX0 = xLo - xSpan * X_PAD_RATIO;
      const domX1 = xHi + xSpan * X_PAD_RATIO;
      const kx = (PLOT_R - PLOT_L) / (domX1 - domX0);

      // 직선의 양 끝도 y 범위에 넣는다 — 넣지 않으면 직선이 틀 밖으로 나간다.
      const ys = [
        ...scene.points.map((p) => p.y),
        predictedAt(scene, domX0),
        predictedAt(scene, domX1),
      ];
      const yLo = Math.min(...ys);
      const yHi = Math.max(...ys);
      const ySpan = yHi - yLo || 1;
      const domY0 = yLo - ySpan * Y_PAD_RATIO;
      const domY1 = yHi + ySpan * Y_PAD_RATIO;
      const ky = (PLOT_BOTTOM - PLOT_TOP) / (domY1 - domY0);

      const len = Math.hypot(kx, ky * scene.slope);
      return {
        domX0,
        domX1,
        domY1,
        kx,
        ky,
        dirX: kx / len,
        dirY: (-ky * scene.slope) / len,
      };
    }

    const px = (l: Layout, x: number): number => PLOT_L + (x - l.domX0) * l.kx;
    const py = (l: Layout, y: number): number => PLOT_TOP + (l.domY1 - y) * l.ky;

    /** 그 점이 선 화면 자리. */
    function spotOf(
      scene: ResidualDistanceScene,
      l: Layout,
      index: number,
    ): { x: number; y: number } | null {
      const p = pointOf(scene, index);
      return p === null ? null : { x: px(l, p.x), y: py(l, p.y) };
    }

    /** 점에서 직선에 내린 수선 — 직선 위 발끝에서 직선 방향으로 사영한다. */
    function footOf(scene: ResidualDistanceScene, l: Layout, index: number): Foot | null {
      const p = pointOf(scene, index);
      if (p === null) return null;
      const cx = px(l, p.x);
      const cy = py(l, p.y);
      const fy = py(l, predictedAt(scene, p.x));
      const proj = -(fy - cy) * l.dirY;
      const gx = cx + proj * l.dirX;
      const gy = fy + proj * l.dirY;
      return { cx, cy, gx, gy, r: Math.hypot(gx - cx, gy - cy), fy };
    }

    const toneOf = (residual: number): string => (residual >= 0 ? ABOVE : BELOW);

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function clearLayer(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function drawGrid(l: Layout): void {
      const domY0 = l.domY1 - (PLOT_BOTTOM - PLOT_TOP) / l.ky;

      // 가로 눈금선 — 세로로 잰다는 것을 읽게 하는 바탕이다.
      const yStep = niceStep(l.domY1 - domY0);
      for (let v = Math.ceil(domY0 / yStep) * yStep; v <= l.domY1 + 1e-9; v += yStep) {
        const gy = py(l, v);
        gridLayer.appendChild(
          el('line', {
            x1: PLOT_L, y1: gy, x2: PLOT_R, y2: gy,
            stroke: c.border, 'stroke-width': 1,
          }),
        );
        gridLayer.appendChild(
          textNode(
            {
              x: PLOT_L - 8,
              y: gy + 4,
              'text-anchor': 'end',
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            },
            tickText(v, yStep),
          ),
        );
      }

      // 틀 — 왼쪽과 아래만. 원점 축이 아니라 눈금이 붙는 자리다.
      gridLayer.appendChild(
        el('line', {
          x1: PLOT_L, y1: PLOT_TOP, x2: PLOT_L, y2: PLOT_BOTTOM,
          stroke: c.border, 'stroke-width': 1,
        }),
      );
      gridLayer.appendChild(
        el('line', {
          x1: PLOT_L, y1: PLOT_BOTTOM, x2: PLOT_R, y2: PLOT_BOTTOM,
          stroke: c.border, 'stroke-width': 1,
        }),
      );

      const xStep = niceStep(l.domX1 - l.domX0);
      for (let v = Math.ceil(l.domX0 / xStep) * xStep; v <= l.domX1 + 1e-9; v += xStep) {
        gridLayer.appendChild(
          textNode(
            {
              x: px(l, v),
              y: XTICK_BASELINE,
              'text-anchor': 'middle',
              'font-size': fontSizes.sm,
              fill: c.textMuted,
            },
            tickText(v, xStep),
          ),
        );
      }
      gridLayer.appendChild(
        textNode(
          { x: PLOT_R + 10, y: PLOT_BOTTOM + 4, 'font-size': fontSizes.xs, fill: c.textMuted },
          'x',
        ),
      );
      gridLayer.appendChild(
        textNode(
          {
            x: PLOT_L, y: PLOT_TOP - 7, 'text-anchor': 'middle',
            'font-size': fontSizes.xs, fill: c.textMuted,
          },
          'y',
        ),
      );
    }

    function drawLine(scene: ResidualDistanceScene, l: Layout): void {
      lineLayer.appendChild(
        el('line', {
          x1: px(l, l.domX0), y1: py(l, predictedAt(scene, l.domX0)),
          x2: px(l, l.domX1), y2: py(l, predictedAt(scene, l.domX1)),
          stroke: c.text, 'stroke-width': 2,
        }),
      );
      lineLayer.appendChild(
        textNode(
          { x: PLOT_L + 10, y: PLOT_BOTTOM - 10, 'font-size': fontSizes.sm, fill: c.textMuted },
          equationText(scene.slope, scene.intercept),
        ),
      );
    }

    function drawPoints(scene: ResidualDistanceScene, l: Layout): void {
      for (const p of scene.points) {
        pointLayer.appendChild(
          el('circle', {
            cx: px(l, p.x), cy: py(l, p.y), r: POINT_R,
            fill: c.bg, stroke: c.text, 'stroke-width': 1.6,
          }),
        );
      }
    }

    /**
     * 최단거리 유령. 기각한 뒤에는 원이 옅어지고 직각 표시가 없다 —
     * 그 둘이 *아직 견주는 중인가 / 이미 기각했는가* 를 말한다.
     */
    function drawProbe(
      scene: ResidualDistanceScene,
      l: Layout,
      index: number,
      turned: boolean,
    ): ProbeDrawn | null {
      const f = footOf(scene, l, index);
      if (f === null) return null;
      const circle = el('circle', {
        cx: f.cx, cy: f.cy, r: f.r,
        fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.2, 'stroke-dasharray': '4 4',
      });
      if (turned) circle.setAttribute('stroke-opacity', '0.55');
      const radius = el('line', {
        x1: f.cx, y1: f.cy, x2: f.gx, y2: f.gy,
        stroke: c.ghostOutline, 'stroke-width': 2, 'stroke-dasharray': '5 4',
      });
      ghostLayer.appendChild(circle);
      ghostLayer.appendChild(radius);
      if (turned) return { circle, radius, angle: null };

      // 직각 표시 — 직선 방향과 수선 방향으로 한 칸씩 낸 작은 네모.
      const nx = (f.cx - f.gx) / (f.r || 1);
      const ny = (f.cy - f.gy) / (f.r || 1);
      const angle = el('polyline', {
        points: [
          `${f.gx + l.dirX * RIGHT_ANGLE},${f.gy + l.dirY * RIGHT_ANGLE}`,
          `${f.gx + (l.dirX + nx) * RIGHT_ANGLE},${f.gy + (l.dirY + ny) * RIGHT_ANGLE}`,
          `${f.gx + nx * RIGHT_ANGLE},${f.gy + ny * RIGHT_ANGLE}`,
        ].join(' '),
        fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.4,
      });
      ghostLayer.appendChild(angle);
      return { circle, radius, angle };
    }

    /** 잔차 막대와 그 끝의 쐐기, 그리고 값. 잰 방향이 곧 부호다. */
    function plantBar(
      scene: ResidualDistanceScene,
      l: Layout,
      index: number,
    ): BarDrawn | null {
      const p = pointOf(scene, index);
      if (p === null) return null;
      const residual = residualOf(scene, index);
      const tone = toneOf(residual);
      const x = px(l, p.x);
      const yFrom = py(l, p.y);
      const yTo = py(l, predictedAt(scene, p.x));
      const down = yTo > yFrom ? 1 : -1;
      const bar = el('line', {
        x1: x, y1: yFrom, x2: x, y2: yTo,
        stroke: tone, 'stroke-width': BAR_W, 'stroke-linecap': 'butt',
      });
      const dart = el('polygon', {
        points: [
          `${x},${yTo}`,
          `${x - DART * 0.75},${yTo - DART * down}`,
          `${x + DART * 0.75},${yTo - DART * down}`,
        ].join(' '),
        fill: tone,
      });
      const label = textNode(
        {
          x: x + 10,
          y: (yFrom + yTo) / 2 + 4,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: tone,
          stroke: c.bg,
          'stroke-width': 3,
          'stroke-linejoin': 'round',
          'paint-order': 'stroke',
        },
        signedText(residual),
      );
      barLayer.appendChild(bar);
      barLayer.appendChild(dart);
      barLayer.appendChild(label);
      return { bar, dart, label };
    }

    function removeBar(drawn: BarDrawn): void {
      drawn.bar.remove();
      drawn.dart.remove();
      drawn.label.remove();
    }

    /** 지금 짚고 있는 자리. 다 끝나면 고리가 없다. */
    function drawRing(
      scene: ResidualDistanceScene,
      l: Layout,
      index: number,
    ): SVGCircleElement | null {
      const spot = spotOf(scene, l, index);
      if (spot === null) return null;
      const ring = el('circle', {
        cx: spot.x, cy: spot.y, r: RING_R,
        fill: 'none', stroke: c.accent, 'stroke-width': 2,
      });
      ringLayer.appendChild(ring);
      return ring;
    }

    /**
     * 캡션. 무엇을 말할지는 `step` 이 정하고 부호로 갈리는 한 자리는 잔차가 정한다 —
     * 화면의 막대와 같은 함수를 지나므로 둘이 어긋날 자리가 없다 (C10).
     */
    function captionText(scene: ResidualDistanceScene): string {
      const step = scene.step;
      if (step === null) return t('caption.scene', 'A fixed line and the observed points.');
      switch (step.kind) {
        case 'focus':
          return t('caption.pick', 'One point. How far off is the line here?');
        case 'perpendicular':
          return t('caption.perpendicular', 'The closest reach reads a right angle to the line.');
        case 'turn':
          return t('caption.turn', 'But y is what we predict, so measure straight along y.');
        case 'drop':
          return (scene.cursor === null ? 0 : residualOf(scene, scene.cursor)) >= 0
            ? t('caption.above', 'Above the line: the observation has more than predicted.')
            : t('caption.below', 'Below the line: the observation falls short of the prediction.');
        case 'done':
          return t('caption.done', 'Length is how much, sign is which way.');
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않는다 (S-scene). */
    function drawStatic(scene: ResidualDistanceScene): Drawn {
      for (const g of layers) clearLayer(g);
      caption.textContent = captionText(scene);

      const layout = layoutOf(scene);
      if (layout === null) return { layout: null, ring: null, probe: null, bars: [] };

      drawGrid(layout);
      drawLine(scene, layout);
      const probe =
        scene.probe === null
          ? null
          : drawProbe(scene, layout, scene.probe.index, scene.probe.turned);
      const bars: BarDrawn[] = [];
      for (const index of scene.planted) {
        const bar = plantBar(scene, layout, index);
        if (bar !== null) bars.push(bar);
      }
      drawPoints(scene, layout);
      const ring = scene.cursor === null ? null : drawRing(scene, layout, scene.cursor);
      return { layout, ring, probe, bars };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 막대가 자리를 잡는 순간의 짧은 두께 반동. 꽂혔다는 신호다. */
    function impact(bar: SVGLineElement, mine: number): Promise<void> {
      return tween(LAND_MS, mine, (p) => {
        bar.setAttribute('stroke-width', String(BAR_W + (1 - Math.abs(p * 2 - 1)) * BAR_BUMP));
      });
    }

    /** 고리가 점 위에서 오므라들며 자리를 잡는다. */
    function flowFocus(drawn: Drawn, mine: number): Promise<void> {
      const ring = drawn.ring;
      if (ring === null) return Promise.resolve();
      return tween(RING_MS, mine, (p) => {
        const e = easeOut(p);
        ring.setAttribute('r', String(RING_R * RING_GROW + (RING_R - RING_R * RING_GROW) * e));
      });
    }

    /**
     * 최단거리를 보인다. 점을 중심으로 원이 자라 직선에 **닿는** 순간 멈추고,
     * 그 접점이 수선의 발이다. 직각 표시는 닿은 뒤에 선다 — 자라는 동안에는
     * 아직 없는 것이라 숨기지 않고 짓지 않는다.
     */
    async function flowPerpendicular(
      scene: ResidualDistanceScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const probe = drawn.probe;
      const layout = drawn.layout;
      if (probe === null || layout === null || scene.probe === null) return;
      probe.angle?.remove();
      const f = footOf(scene, layout, scene.probe.index);
      if (f === null) return;
      probe.circle.setAttribute('r', '0');
      await tween(PROBE_MS, mine, (p) => {
        const e = easeOut(p);
        probe.circle.setAttribute('r', String(f.r * e));
        probe.radius.setAttribute('x2', String(f.cx + (f.gx - f.cx) * e));
        probe.radius.setAttribute('y2', String(f.cy + (f.gy - f.cy) * e));
      });
    }

    /**
     * 수선을 세로로 돌려세운다. 막대가 점을 축으로 회전하면서 길어져 원을
     * 뚫고 나가 직선에 닿는다 — 최단거리보다 길다는 것이 그때 보인다.
     */
    async function flowTurn(
      scene: ResidualDistanceScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const layout = drawn.layout;
      const index = scene.cursor;
      if (layout === null || index === null) return;
      const f = footOf(scene, layout, index);
      if (f === null) return;

      // 돌려세우는 동안에는 막대가 아직 없다. 정적 그리기가 세워 둔 것을 거둔다.
      const planted = drawn.bars[drawn.bars.length - 1];
      if (planted !== undefined) removeBar(planted);

      const r0 = f.r;
      const r1 = Math.abs(f.fy - f.cy);
      const a0 = Math.atan2(f.gy - f.cy, f.gx - f.cx);
      const a1 = Math.atan2(f.fy - f.cy, 0);
      let sweep = a1 - a0;
      while (sweep > Math.PI) sweep -= Math.PI * 2;
      while (sweep < -Math.PI) sweep += Math.PI * 2;

      const swing = el('line', {
        x1: f.cx, y1: f.cy, x2: f.gx, y2: f.gy,
        stroke: c.ghostOutline, 'stroke-width': 2, 'stroke-dasharray': '5 4',
      });
      const arc = el('path', {
        d: '', fill: 'none', stroke: c.ghostOutline, 'stroke-width': 1.2,
      });
      ghostLayer.appendChild(arc);
      ghostLayer.appendChild(swing);

      await tween(TURN_MS, mine, (p) => {
        const e = easeInOut(p);
        const a = a0 + sweep * e;
        const r = r0 + (r1 - r0) * e;
        swing.setAttribute('x2', String(f.cx + Math.cos(a) * r));
        swing.setAttribute('y2', String(f.cy + Math.sin(a) * r));
        arc.setAttribute(
          'd',
          [
            `M ${f.cx + Math.cos(a0) * SWEEP_R} ${f.cy + Math.sin(a0) * SWEEP_R}`,
            `A ${SWEEP_R} ${SWEEP_R} 0 0 ${sweep > 0 ? 1 : 0}`,
            `${f.cx + Math.cos(a) * SWEEP_R} ${f.cy + Math.sin(a) * SWEEP_R}`,
          ].join(' '),
        );
      });

      swing.remove();
      arc.remove();
      if (!alive(mine)) return;
      const bar = plantBar(scene, layout, index);
      if (bar === null) return;
      await impact(bar.bar, mine);
    }

    /** 점에서 직선까지 세로로 내려꽂는다. 고리가 먼저 그 점으로 걸어간다. */
    async function flowDrop(
      scene: ResidualDistanceScene,
      drawn: Drawn,
      step: { kind: 'drop'; from: number | null },
      mine: number,
    ): Promise<void> {
      const layout = drawn.layout;
      const index = scene.cursor;
      if (layout === null || index === null) return;
      const to = spotOf(scene, layout, index);
      if (to === null) return;

      const planted = drawn.bars[drawn.bars.length - 1];
      if (planted !== undefined) removeBar(planted);

      // 출발 자리는 장면이 말한다. 고리의 `cx` 를 되읽으면 되짚은 직후에 어긋난다.
      const ring = drawn.ring;
      const from = step.from === null ? null : spotOf(scene, layout, step.from);
      if (ring !== null && from !== null) {
        await tween(RING_MOVE_MS, mine, (p) => {
          const e = easeInOut(p);
          ring.setAttribute('cx', String(from.x + (to.x - from.x) * e));
          ring.setAttribute('cy', String(from.y + (to.y - from.y) * e));
        });
        if (!alive(mine)) return;
      }

      const p = pointOf(scene, index);
      if (p === null) return;
      const fy = py(layout, predictedAt(scene, p.x));
      const shaft = el('line', {
        x1: to.x, y1: to.y, x2: to.x, y2: to.y,
        stroke: toneOf(residualOf(scene, index)),
        'stroke-width': BAR_W, 'stroke-linecap': 'butt',
      });
      barLayer.appendChild(shaft);
      await tween(DROP_MS, mine, (q) => {
        shaft.setAttribute('y2', String(to.y + (fy - to.y) * easeIn(q)));
      });
      shaft.remove();
      if (!alive(mine)) return;
      const bar = plantBar(scene, layout, index);
      if (bar === null) return;
      await impact(bar.bar, mine);
    }

    /** 다 꽂혔다. 꽂힌 것들을 한 시계로 함께 두드린다. */
    function flowDone(drawn: Drawn, mine: number): Promise<void> {
      const bars = drawn.bars.map((b) => b.bar);
      if (bars.length === 0) return Promise.resolve();
      return tween(DONE_MS, mine, (p) => {
        const w = String(BAR_W + (1 - Math.abs(p * 2 - 1)) * BAR_BUMP);
        for (const bar of bars) bar.setAttribute('stroke-width', w);
      });
    }

    function flowFor(
      step: ResidualStep,
      scene: ResidualDistanceScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'focus':
          return flowFocus(drawn, mine);
        case 'perpendicular':
          return flowPerpendicular(scene, drawn, mine);
        case 'turn':
          return flowTurn(scene, drawn, mine);
        case 'drop':
          return flowDrop(scene, drawn, step, mine);
        case 'done':
          return flowDone(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: ResidualDistanceScene,
      _prev: ResidualDistanceScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
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
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of layers) g.remove();
        caption.remove();
      },
    };
  },
};
