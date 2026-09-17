/**
 * widest-margin stage — 띠가 벌어지다 닿아서 멈추는 그림.
 *
 * 장면 하나를 받아 그 화면을 **통째로** 세운다 (`render`). 걸음마다 부르는 메서드를
 * 두지 않는다 — 그 메서드들이 곧 되돌릴 수 없는 명령이었다 (S-scene).
 *
 * ── 화면을 어떻게 갈랐는가
 *
 * 산점도는 주인공이 아니라 무대다. 주인공은 **두께** 이므로, 두께를 점에서
 * 떼어 내 오른쪽 기록장으로 보낸다. 왼쪽에서 띠가 벌어지는 동안 오른쪽 막대가
 * 같은 속도로 자라고, 띠가 점에 닿아 멈추면 막대도 그 길이로 멈춰 남는다.
 * 후보를 다 훑고 나면 기록장에 여섯 줄이 쌓이고, 가장 긴 줄이 답이다 —
 * 견주는 일이 화면 한쪽에서 통째로 일어난다.
 *
 * ── 형편과 표식을 갈랐다
 *
 * 옛 그림은 막대의 **채움** 하나에 세 뜻을 실었다 — 지금 재는 중(accent) · 재어
 * 놓았다(옅은 회색) · 답이 가려진 뒤의 진 후보(더 옅은 회색). 거기에 "이것이
 * 답이다" 까지 채움으로 실려, 답이 정해지는 순간 *그것이 후보 중에서 골라졌다*는
 * 사실이 흐려졌다. 지금은 축을 둘로 갈랐다.
 *
 * - **채움 = 값의 형편** — 지금 화면에 서 있는 띠의 줄이 진한 채움, 이미 재어 둔
 *   줄은 옅은 채움. 답이 가려져도 진 후보가 더 옅어지지 않는다 (재었다는 사실이
 *   지워지지 않는다).
 * - **테두리 = 견줌·짚음의 표식** — 가장 두꺼운 줄에만 테두리가 서고, 우승 길이를
 *   가리키는 눈금선이 기록장을 타고 올라간다. 진 후보 다섯이 그 선에 못 미치는
 *   것이 한 화면에 함께 선다.
 *
 * ── 축척
 *
 * 그림판은 정사각이고 가로세로 눈금이 같다. 두께는 선에 수직인 거리라, 눈금이
 * 어긋나면 기울기가 다른 두 띠의 두께를 눈으로 견줄 수 없다. 기록장 막대의
 * 길이 눈금은 두 무리 사이 가장 가까운 점쌍의 거리에서 잡는다 — 마진은 그
 * 거리를 넘을 수 없으므로 막대가 자를 넘칠 일이 없다.
 *
 * **척도는 `let` 이 아니라 `layoutOf(scene)` 가 낸다.** 예전에는 `domainMin` ·
 * `domainSpan` · `unit` · `railUnit` · `rowHeight` 다섯이 stage 의 `let` 이었고
 * 화면의 모든 좌표가 거기서 나왔다. 장면이 값의 범위만 말하고 자리는 그리는 쪽이
 * 매번 셈한다 (S-piece: 장면에 좌표를 담지 않는다).
 *
 * ── 운동
 *
 * 점은 제 무리의 중심에서 자기 자리로 나오고, 후보 선은 왼쪽에서 오른쪽으로
 * 그어지고, 띠 가장자리는 중심선에서 양옆으로 **밀려난다**. 후보가 바뀔 때는
 * 띠가 접히고 선이 돌아간다. 마지막에 우승 길이를 가리키는 세로 눈금선이
 * 기록장을 타고 올라가 나머지가 모두 못 미친 것을 보인다.
 *
 * 운동의 **출발 자세**는 화면에서 되읽지 않는다. `step.from` 이 어느 기울기·절편·
 * 두께에서 접히기 시작하는지 말한다 — 되짚어 세운 직후의 화면은 옛 걸음의 것이라
 * 거기서 꺼내면 엉뚱한 자세에서 출발한다 (S-scene).
 *
 * CSS `transition` 은 쓰지 않는다. 되짚기는 `animate:false` 로 오는데 transition 은
 * 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
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
  beatsCandidates,
  bestRowIndex,
  rowAt,
  type BandPose,
  type MarginPt,
  type WidestMarginScene,
  type WidestMarginStep,
} from './scene.js';

/** 기울기 표기. 수식이라 번역하지 않는다 (C10 표식 판정 3). */
export function formatSlope(v: number): string {
  const s = v.toFixed(2);
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

/** 두께 표기. 자릿수는 후보끼리 견주기에 충분한 만큼만. */
export function formatThickness(v: number): string {
  return v.toFixed(3);
}

// ─────────────────────────────────────────────────────────────────────────────
// 자리 — 캔버스에서 역산한다. 선언에 좌표를 두지 않는다 (S-piece).
// ─────────────────────────────────────────────────────────────────────────────

const STAGE_W = PIECE_CANVAS_W;
const STAGE_H = 356;

/** 오른쪽 여백. 왼쪽은 y 눈금 글자가 나갈 자리만큼 더 준다. */
const PAD = 26;
const CAPTION_BASELINE = 22;

const PLOT_X = 34;
const PLOT_TOP = 42;
const PLOT_SIDE_MAX = 292;
const RAIL_MIN_W = 232;
const COL_GAP = 26;

const PLOT_SIDE = Math.min(PLOT_SIDE_MAX, STAGE_W - PLOT_X - COL_GAP - RAIL_MIN_W - PAD);
const PLOT_BOTTOM = PLOT_TOP + PLOT_SIDE;
const RAIL_X = PLOT_X + PLOT_SIDE + COL_GAP;
const RAIL_W = STAGE_W - PAD - RAIL_X;

const RAIL_LABEL_W = 44;
const RAIL_VALUE_W = 42;
const RAIL_BAR_GAP = 8;
const BAR_X = RAIL_X + RAIL_LABEL_W + RAIL_BAR_GAP;
const BAR_MAX_W = RAIL_W - RAIL_LABEL_W - RAIL_BAR_GAP - RAIL_VALUE_W;
const BAR_H = 11;
const RAIL_HEADER_BASELINE = PLOT_TOP + 12;
const ROWS_TOP = PLOT_TOP + 24;

/** 데이터 범위 바깥으로 남기는 여백 (데이터 단위). */
const DOMAIN_MARGIN = 1;
/** 막대 자가 꽉 차 보이지 않게 두는 여유. */
const RAIL_HEADROOM = 1.04;

const POINT_R = 6;
const SQUARE_SIDE = 10.5;
const RING_R = 11;
/** 캘리퍼를 놓아 볼 자리 (그림판 가로의 비율). 점에서 가장 먼 곳을 고른다. */
const CALIPER_SPOTS: readonly number[] = [0.12, 0.26, 0.4, 0.55, 0.7, 0.85];
const CALIPER_TICK = 7;

// 걸음 하나는 여기 지속시간 + `stepMs` 다. 열한 걸음이라 이 수들이 곧 자동
// 재생의 길이를 정한다 — 읽을 시간은 stepMs 가 주고, 여기서는 운동이 눈에
// 보일 만큼만 쓴다 (S-piece).
const ENTER_MS = 460;
const DRAW_MS = 560;
const GROW_MS = 880;
const TOUCH_MS = 240;
const PIVOT_MS = 640;
const LOCK_MS = 460;
const CROWN_MS = 520;

/** band-grow 한 걸음의 세 구간 — 접힘 → 선 돌기 → 벌어짐. */
const PHASE_FOLD = 0.16;
const PHASE_TURN = 0.4;

/** rAF 가 없는 환경(헤드리스)에서 쓰는 프레임 간격. */
const FRAME_MS = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

/** clipPath id 가 한 문서 안에서 겹치지 않게. 조각은 한 글에 여럿 박힌다. */
let mountSeq = 0;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** 여럿이 차례로 겹쳐 움직일 때 i 번째의 진행도. */
function staggered(t: number, i: number, n: number, overlap: number): number {
  if (n <= 1) return t;
  const span = 1 / (1 + (n - 1) * (1 - overlap));
  return clamp01((t - i * span * (1 - overlap)) / span);
}

/** 순수 변환 — 입력 hex 는 토큰에서 온다 (S-view Exception). */
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function place<T extends SVGElement>(node: T, attrs: Record<string, string | number>): T {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  return place(document.createElementNS(SVG_NS, name), attrs);
}

/**
 * 척도. 장면이 말하는 값의 범위에서 매번 셈한다.
 *
 * 이름을 `Layout` 으로 둔다 — `Scene` 은 이미 다른 뜻을 가진 낱말이다.
 */
type Layout = {
  /** 그림판 두 축이 함께 쓰는 아래 끝 (데이터 단위). */
  domainMin: number;
  /** 그림판 두 축이 함께 쓰는 폭 (데이터 단위). */
  domainSpan: number;
  /** 데이터 한 칸이 몇 픽셀인가. 가로세로가 같다. */
  unit: number;
  /** 두께 한 칸이 막대에서 몇 픽셀인가. */
  railUnit: number;
  /** 기록장 한 줄의 높이. */
  rowHeight: number;
};

/** 점 P 에서 선분 AB 까지의 거리. 캘리퍼 자리를 고르는 데만 쓴다. */
function distToSegment(
  pxv: number,
  pyv: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp01(((pxv - ax) * dx + (pyv - ay) * dy) / len2);
  return Math.hypot(pxv - (ax + dx * t), pyv - (ay + dy * t));
}

export const widestMarginStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<WidestMarginScene> {
    const svg = params.canvas;
    // 캔버스 **안쪽** 만 비운다. 컨테이너를 비우면 러너가 붙여 준 이 캔버스가
    // 떨어져 나가고 그림이 통째로 사라진다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 두 이름표를 가르는 색. 알고리즘 상태가 아니라 카테고리 식별이므로
    // categorical 시드에서 뽑는다 (S-view 결정 트리 3). 바탕 자료가 두 무리라
    // 상수 2 다 — 지금까지 드러난 수로 색판을 정하지 않는다.
    const groupInk = categorical(2, 'vivid');
    const inkA = groupInk.at(0) ?? c.text;
    const inkB = groupInk.at(1) ?? c.textMuted;

    const barIdleFill = hexToRgba(c.text, 0.24);
    const bandTint = hexToRgba(c.accent, 0.22);

    mountSeq += 1;
    const clipId = `widest-margin-plot-${mountSeq}`;

    // ── 뼈대. 층은 한 번 짓고 정적 그리기가 자식만 갈아 끼운다.
    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(
      el('rect', { x: PLOT_X, y: PLOT_TOP, width: PLOT_SIDE, height: PLOT_SIDE }),
    );
    defs.appendChild(clip);
    svg.appendChild(defs);

    // 재건 밖에 있는 하나. 자리는 고정이고 글자만 정적 그리기가 매번 다시 쓴다.
    const caption = el('text', {
      x: PAD,
      y: CAPTION_BASELINE,
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.appendChild(caption);

    const legendLayer = el('g', {});
    const axisLayer = el('g', {});
    const clippedLayer = el('g', { 'clip-path': `url(#${clipId})` });
    const pastLayer = el('g', {});
    const bandLayer = el('g', {});
    const supportLayer = el('g', {});
    clippedLayer.appendChild(pastLayer);
    clippedLayer.appendChild(bandLayer);
    clippedLayer.appendChild(supportLayer);
    const pointLayer = el('g', {});
    const ringLayer = el('g', {});
    const railLayer = el('g', {});
    const layers = [legendLayer, axisLayer, clippedLayer, pointLayer, ringLayer, railLayer];
    svg.appendChild(legendLayer);
    svg.appendChild(axisLayer);
    svg.appendChild(clippedLayer);
    svg.appendChild(pointLayer);
    svg.appendChild(ringLayer);
    svg.appendChild(railLayer);

    const rebuilt = [
      legendLayer,
      axisLayer,
      pastLayer,
      bandLayer,
      supportLayer,
      pointLayer,
      ringLayer,
      railLayer,
    ];

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다 (벌어짐 → 닿음). `destroy` 가 그 가운데 오면
     * 남은 마디가 **살아 있는 층**에 손을 대므로, 마디마다 자기 번호가 아직
     * 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서
     * 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const schedule = (fn: () => void): number =>
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(fn)
        : (setTimeout(fn, FRAME_MS) as unknown as number);

    const unschedule = (id: number): void => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    };

    /** 보간 한 마디. 끝나거나 끊기면 반드시 풀린다. */
    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
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
          const p = duration <= 0 ? 1 : clamp01((Date.now() - started) / duration);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = schedule(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 척도 ─────────────────────────────────────────────────────────────

    function layoutOf(scene: WidestMarginScene): Layout {
      const rowCount = Math.max(1, scene.candidateCount + 1);
      const rowHeight = (PLOT_BOTTOM - ROWS_TOP) / rowCount;
      const points = scene.points;
      if (points.length === 0) {
        return {
          domainMin: 0,
          domainSpan: 1,
          unit: PLOT_SIDE,
          railUnit: BAR_MAX_W,
          rowHeight,
        };
      }
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const lo = Math.min(Math.min(...xs), Math.min(...ys)) - DOMAIN_MARGIN;
      const hi = Math.max(Math.max(...xs), Math.max(...ys)) + DOMAIN_MARGIN;
      // 가로세로 눈금을 같게 둔다 — 두께는 선에 수직인 거리라 축척이 어긋나면
      // 기울기가 다른 띠끼리 견줄 수 없다.
      const domainSpan = Math.max(hi - lo, 1e-6);

      // 마진은 서로 다른 무리의 가장 가까운 점쌍 거리를 넘을 수 없다. 그것을
      // 막대 자의 상한으로 삼으면 우승 막대가 자를 거의 채운다.
      let bound = Number.POSITIVE_INFINITY;
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const a = points[i];
          const b = points[j];
          if (a.group === b.group) continue;
          bound = Math.min(bound, Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      if (!Number.isFinite(bound) || bound <= 0) bound = domainSpan;

      return {
        domainMin: lo,
        domainSpan,
        unit: PLOT_SIDE / domainSpan,
        railUnit: BAR_MAX_W / (bound * RAIL_HEADROOM),
        rowHeight,
      };
    }

    const px = (l: Layout, x: number): number => PLOT_X + (x - l.domainMin) * l.unit;
    const py = (l: Layout, y: number): number => PLOT_BOTTOM - (y - l.domainMin) * l.unit;
    const rowCenter = (l: Layout, row: number): number => ROWS_TOP + l.rowHeight * (row + 0.5);

    function isFirstGroup(scene: WidestMarginScene, group: string): boolean {
      const first = scene.points.at(0);
      return first !== undefined && group === first.group;
    }

    function groupInkOf(scene: WidestMarginScene, group: string): string {
      return isFirstGroup(scene, group) ? inkA : inkB;
    }

    /** 제 무리의 중심 (데이터 단위). 점이 거기서 걸어 나온다. */
    function groupCentre(
      scene: WidestMarginScene,
      l: Layout,
      group: string,
    ): { x: number; y: number } {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const p of scene.points) {
        if (p.group !== group) continue;
        sx += p.x;
        sy += p.y;
        n += 1;
      }
      if (n === 0) {
        const mid = l.domainMin + l.domainSpan / 2;
        return { x: mid, y: mid };
      }
      return { x: sx / n, y: sy / n };
    }

    function setPointAt(
      node: SVGElement,
      scene: WidestMarginScene,
      p: MarginPt,
      x: number,
      y: number,
      l: Layout,
    ): void {
      if (isFirstGroup(scene, p.group)) place(node, { cx: px(l, x), cy: py(l, y) });
      else
        place(node, {
          x: px(l, x) - SQUARE_SIDE / 2,
          y: py(l, y) - SQUARE_SIDE / 2,
        });
    }

    /**
     * 캘리퍼를 어디에 놓을지 고른다.
     *
     * 자가 점에 닿아 있으면 "이 점에서 뻗어 나온 선" 으로 읽혀 닿음을 보이는
     * 수선과 뒤섞인다. 그래서 후보 자리 가운데 어느 점에서도 가장 먼 곳을
     * 고른다. **띠 하나에서 한 번만 셈하는 순수 함수**라 프레임마다 흔들리지
     * 않고, 같은 장면이면 언제나 같은 자리가 나온다.
     */
    function caliperSpotOf(
      scene: WidestMarginScene,
      l: Layout,
      pose: BandPose | null,
    ): number {
      const fallback = CALIPER_SPOTS[Math.floor(CALIPER_SPOTS.length / 2)] ?? 0.5;
      if (pose === null) return fallback;
      const norm = Math.hypot(pose.slope, 1);
      const ox = (-pose.slope / norm) * pose.half;
      const oy = (1 / norm) * pose.half;
      const hi = l.domainMin + l.domainSpan;
      let bestSpot = fallback;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (const frac of CALIPER_SPOTS) {
        const x = l.domainMin + l.domainSpan * frac;
        const y = pose.slope * x + pose.intercept;
        const ax = x - ox;
        const ay = y - oy;
        const bx = x + ox;
        const by = y + oy;
        const inside =
          Math.min(ax, bx) >= l.domainMin &&
          Math.max(ax, bx) <= hi &&
          Math.min(ay, by) >= l.domainMin &&
          Math.max(ay, by) <= hi;
        let score = inside ? 0 : -10;
        let nearest = Number.POSITIVE_INFINITY;
        for (const p of scene.points) {
          nearest = Math.min(nearest, distToSegment(p.x, p.y, ax, ay, bx, by));
        }
        score += Number.isFinite(nearest) ? nearest : 0;
        if (score > bestScore) {
          bestScore = score;
          bestSpot = frac;
        }
      }
      return bestSpot;
    }

    // ── 띠 ───────────────────────────────────────────────────────────────

    /** 한 자세를 받아 그 모양으로 서는 띠. 정적 그리기와 운동이 같은 것을 쓴다. */
    type Band = {
      g: SVGGElement;
      apply(pose: BandPose): void;
    };

    /**
     * 띠를 짓는다. `caliperAt` 은 그 걸음이 향하는 자세에서 한 번 고른 것을 받아
     * 프레임 내내 같은 자리에 둔다.
     */
    function makeBand(l: Layout, caliperAt: number, withBody: boolean): Band {
      const g = el('g', {});
      const center = el('line', {
        stroke: c.text,
        'stroke-width': 1.5,
        'stroke-dasharray': '6 4',
      });
      const fill = withBody
        ? el('polygon', { points: '', fill: bandTint, stroke: 'none' })
        : null;
      const edgeLo = withBody
        ? el('line', { stroke: c.accent, 'stroke-width': 2.2, 'stroke-linecap': 'round' })
        : null;
      const edgeHi = withBody
        ? el('line', { stroke: c.accent, 'stroke-width': 2.2, 'stroke-linecap': 'round' })
        : null;
      // 캘리퍼는 "두께가 선에 수직인 거리" 라는 것을 그림 안에서 말한다. 닿음을
      // 보이는 수선(검정 점선)과 헷갈리지 않게 옅은 회색 실선으로 둔다.
      const caliper = withBody
        ? el('line', { stroke: c.textMuted, 'stroke-width': 1.1 })
        : null;
      const capLo = withBody ? el('line', { stroke: c.textMuted, 'stroke-width': 1.1 }) : null;
      const capHi = withBody ? el('line', { stroke: c.textMuted, 'stroke-width': 1.1 }) : null;
      const body = [fill, edgeLo, edgeHi, caliper, capLo, capHi];
      for (const node of body) if (node !== null) g.appendChild(node);
      g.appendChild(center);
      bandLayer.appendChild(g);

      const xa = l.domainMin;
      const xb = l.domainMin + l.domainSpan;

      return {
        g,
        apply(pose: BandPose): void {
          const norm = Math.hypot(pose.slope, 1);
          const at = (b: number, x: number): number => py(l, pose.slope * x + b);
          place(center, {
            x1: px(l, xa),
            y1: at(pose.intercept, xa),
            x2: px(l, xb),
            y2: at(pose.intercept, xb),
          });
          if (
            fill === null ||
            edgeLo === null ||
            edgeHi === null ||
            caliper === null ||
            capLo === null ||
            capHi === null
          ) {
            return;
          }
          const offset = pose.half * norm;
          const lo = pose.intercept - offset;
          const hi = pose.intercept + offset;
          fill.setAttribute(
            'points',
            [
              `${px(l, xa)},${at(lo, xa)}`,
              `${px(l, xb)},${at(lo, xb)}`,
              `${px(l, xb)},${at(hi, xb)}`,
              `${px(l, xa)},${at(hi, xa)}`,
            ].join(' '),
          );
          place(edgeLo, { x1: px(l, xa), y1: at(lo, xa), x2: px(l, xb), y2: at(lo, xb) });
          place(edgeHi, { x1: px(l, xa), y1: at(hi, xa), x2: px(l, xb), y2: at(hi, xb) });

          // 캘리퍼 — 띠를 수직으로 가로질러 재는 자를 그린다.
          const cxData = xa + l.domainSpan * caliperAt;
          const cx = px(l, cxData);
          const cy = at(pose.intercept, cxData);
          const nx = (pose.slope / norm) * pose.half * l.unit;
          const ny = (1 / norm) * pose.half * l.unit;
          place(caliper, { x1: cx - nx, y1: cy - ny, x2: cx + nx, y2: cy + ny });
          const tx = (1 / norm) * CALIPER_TICK;
          const ty = (-pose.slope / norm) * CALIPER_TICK;
          place(capLo, {
            x1: cx - nx - tx,
            y1: cy - ny - ty,
            x2: cx - nx + tx,
            y2: cy - ny + ty,
          });
          place(capHi, {
            x1: cx + nx - tx,
            y1: cy + ny - ty,
            x2: cx + nx + tx,
            y2: cy + ny + ty,
          });
          // 갓 벌어지는 동안은 옅게 들어온다. 두께가 곧 드러남이다.
          const shown = String(clamp01((pose.half * l.unit) / 5));
          for (const node of body) node?.setAttribute('opacity', shown);
        },
      };
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 수선의 발 (데이터 단위). 점에서 중심선까지 수직으로 내린다. */
    function footOf(
      p: MarginPt,
      slope: number,
      intercept: number,
    ): { x: number; y: number } {
      const norm = slope * slope + 1;
      const f = (slope * p.x - p.y + intercept) / norm;
      return { x: p.x - f * slope, y: p.y + f };
    }

    type Support = {
      node: SVGLineElement;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

    type Drawn = {
      layout: Layout;
      caliperAt: number;
      points: SVGElement[];
      rings: Map<number, SVGCircleElement>;
      band: Band | null;
      candidateLines: SVGLineElement[];
      bars: SVGRectElement[];
      supports: Support[];
      record: { node: SVGLineElement; x: number; from: number } | null;
    };

    function captionText(scene: WidestMarginScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'place':
          return t('caption.points', 'Points carrying two different labels.');
        case 'candidates':
          return t('caption.candidates', 'Every one of these lines separates the two groups.');
        case 'grow': {
          const index = scene.rows.length - 1;
          const row = scene.rows.at(index);
          if (row === undefined) return '';
          // "어느 후보보다 두껍다" 는 실제로 견주어 본 뒤에만 말한다. 답을
          // 적어 받지 않으므로 지금 자료에서 참이 아니면 그렇게 말하지 않는다.
          return beatsCandidates(scene, index)
            ? t('caption.growBest', 'Slope {slope}: this band opens wider than any candidate.', {
                slope: formatSlope(row.slope),
              })
            : t(
                'caption.grow',
                'Slope {slope}: the band widens until it touches a point, then stops.',
                { slope: formatSlope(row.slope) },
              );
        }
        case 'pivot':
          return t('caption.pivot', 'Turning to the slope that lets the band open widest.');
        case 'lock':
          return t('caption.contacts', 'The points the band touched are what fix this line.');
        case 'crown': {
          const best = rowAt(scene, bestRowIndex(scene));
          return t('caption.done', 'The widest gap wins. Thickness: {thickness}', {
            thickness: formatThickness(best?.thickness ?? 0),
          });
        }
      }
    }

    function drawAxes(scene: WidestMarginScene, l: Layout): void {
      axisLayer.appendChild(
        el('rect', {
          x: PLOT_X,
          y: PLOT_TOP,
          width: PLOT_SIDE,
          height: PLOT_SIDE,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      if (scene.points.length === 0) return;
      const first = Math.ceil(l.domainMin);
      const last = Math.floor(l.domainMin + l.domainSpan);
      for (let v = first; v <= last; v += 1) {
        const labelled = v % 2 === 0;
        axisLayer.appendChild(
          el('line', {
            x1: px(l, v),
            y1: PLOT_BOTTOM,
            x2: px(l, v),
            y2: PLOT_BOTTOM + (labelled ? 5 : 3),
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        axisLayer.appendChild(
          el('line', {
            x1: PLOT_X - (labelled ? 5 : 3),
            y1: py(l, v),
            x2: PLOT_X,
            y2: py(l, v),
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        if (!labelled) continue;
        const xLabel = el('text', {
          x: px(l, v),
          y: PLOT_BOTTOM + 17,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        });
        xLabel.textContent = String(v);
        axisLayer.appendChild(xLabel);
        const yLabel = el('text', {
          x: PLOT_X - 8,
          y: py(l, v) + 4,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
        yLabel.textContent = String(v);
        axisLayer.appendChild(yLabel);
      }
    }

    function drawLegend(scene: WidestMarginScene): void {
      const groups: string[] = [];
      for (const p of scene.points) if (!groups.includes(p.group)) groups.push(p.group);
      if (groups.length === 0) return;
      const entryW = 24;
      const gap = 16;
      const total = groups.length * entryW + (groups.length - 1) * gap;
      const startX = STAGE_W - PAD - total;
      groups.forEach((name, i) => {
        const x = startX + i * (entryW + gap);
        const cy = CAPTION_BASELINE - 4;
        const ink = i === 0 ? inkA : inkB;
        legendLayer.appendChild(
          i === 0
            ? el('circle', { cx: x + 5, cy, r: 4.5, fill: ink })
            : el('rect', {
                x: x + 0.7,
                y: cy - 4.3,
                width: 8.6,
                height: 8.6,
                fill: ink,
              }),
        );
        // 이름표 글자는 데이터가 준다. 문안이 아니라 표식이다 (C10).
        const label = el('text', {
          x: x + 15,
          y: cy + 4,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        label.textContent = name;
        legendLayer.appendChild(label);
      });
    }

    function drawCandidateLines(scene: WidestMarginScene, l: Layout): SVGLineElement[] {
      const xa = l.domainMin;
      const xb = l.domainMin + l.domainSpan;
      return scene.candidates.map((line) => {
        const node = el('line', {
          stroke: c.textMuted,
          'stroke-width': 1.1,
          'stroke-dasharray': '5 4',
          opacity: 0.75,
          x1: px(l, xa),
          y1: py(l, line.slope * xa + line.intercept),
          x2: px(l, xb),
          y2: py(l, line.slope * xb + line.intercept),
        });
        pastLayer.appendChild(node);
        return node;
      });
    }

    function drawPoints(scene: WidestMarginScene, l: Layout): SVGElement[] {
      // 아직 나오지 않은 점은 숨기지 않고 짓지 않는다.
      if (!scene.placed) return [];
      return scene.points.map((p) => {
        const ink = groupInkOf(scene, p.group);
        const node: SVGElement = isFirstGroup(scene, p.group)
          ? el('circle', {
              cx: 0,
              cy: 0,
              r: POINT_R,
              fill: ink,
              stroke: c.bg,
              'stroke-width': 1.6,
            })
          : el('rect', {
              x: 0,
              y: 0,
              width: SQUARE_SIDE,
              height: SQUARE_SIDE,
              fill: ink,
              stroke: c.bg,
              'stroke-width': 1.6,
            });
        setPointAt(node, scene, p, p.x, p.y, l);
        pointLayer.appendChild(node);
        return node;
      });
    }

    /**
     * 지금 재고 있는 띠를 멈춘 점에 고리를 씌운다.
     *
     * 고리는 다음 후보가 시작될 때까지 남아, 이 띠를 멈춘 것이 어느 점이었는지
     * 읽을 시간을 준다. 어느 점인지는 기록장의 **마지막 줄**이 말한다.
     */
    function drawRings(
      scene: WidestMarginScene,
      l: Layout,
    ): Map<number, SVGCircleElement> {
      const out = new Map<number, SVGCircleElement>();
      const row = scene.rows.at(-1);
      if (row === undefined) return out;
      for (const i of row.contacts) {
        const p = scene.points.at(i);
        if (p === undefined) continue;
        const ring = el('circle', {
          cx: px(l, p.x),
          cy: py(l, p.y),
          r: RING_R,
          fill: 'none',
          stroke: c.text,
          'stroke-width': 2,
        });
        ringLayer.appendChild(ring);
        out.set(i, ring);
      }
      return out;
    }

    /** 닿은 점에서 중심선까지 내려온 수선. 넷 다 정확히 반 두께다. */
    function drawSupports(scene: WidestMarginScene, l: Layout): Support[] {
      if (!scene.locked) return [];
      const best = rowAt(scene, bestRowIndex(scene));
      if (best === null) return [];
      const out: Support[] = [];
      for (const i of best.contacts) {
        const p = scene.points.at(i);
        if (p === undefined) continue;
        const foot = footOf(p, best.slope, best.intercept);
        const support: Support = {
          node: el('line', {
            stroke: c.text,
            'stroke-width': 1.2,
            'stroke-dasharray': '3 3',
            x1: px(l, p.x),
            y1: py(l, p.y),
            x2: px(l, foot.x),
            y2: py(l, foot.y),
          }),
          x1: px(l, p.x),
          y1: py(l, p.y),
          x2: px(l, foot.x),
          y2: py(l, foot.y),
        };
        supportLayer.appendChild(support.node);
        out.push(support);
      }
      return out;
    }

    /**
     * 두께 기록장.
     *
     * 채움은 값의 형편(지금 선 띠의 줄인가 / 이미 재어 둔 줄인가)만 말하고,
     * 테두리가 견줌의 표식(가장 두꺼운 줄)을 맡는다. 한 축에 두 뜻을 싣지 않으면
     * 진 후보와 이긴 후보가 한 화면에 함께 선다.
     */
    function drawRail(
      scene: WidestMarginScene,
      l: Layout,
    ): { bars: SVGRectElement[]; record: Drawn['record'] } {
      const header = el('text', {
        x: RAIL_X,
        y: RAIL_HEADER_BASELINE,
        fill: c.textMuted,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
      });
      header.textContent = t('label.thickness', 'band thickness');
      railLayer.appendChild(header);

      const rowCount = Math.max(1, scene.candidateCount + 1);
      railLayer.appendChild(
        el('line', {
          x1: BAR_X - 4,
          y1: ROWS_TOP,
          x2: BAR_X - 4,
          y2: PLOT_BOTTOM,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );

      const best = bestRowIndex(scene);
      const live = scene.rows.length - 1;
      const bars: SVGRectElement[] = [];

      for (let row = 0; row < rowCount; row += 1) {
        const cy = rowCenter(l, row);
        railLayer.appendChild(
          el('line', {
            x1: BAR_X,
            y1: cy + BAR_H / 2 + 4,
            x2: RAIL_X + RAIL_W,
            y2: cy + BAR_H / 2 + 4,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        const measured = scene.rows.at(row);
        if (measured === undefined) continue;

        const crowned = scene.crowned && row === best;
        const label = el('text', {
          x: RAIL_X + RAIL_LABEL_W,
          y: cy + 4,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
        label.textContent = `m = ${formatSlope(measured.slope)}`;
        railLayer.appendChild(label);

        const bar = el('rect', {
          x: BAR_X,
          y: cy - BAR_H / 2,
          width: Math.max(0, measured.thickness * l.railUnit),
          height: BAR_H,
          rx: 2,
          // 채움 = 값의 형편. 지금 화면에 서 있는 띠의 줄이 진하다.
          fill: row === live ? c.accent : barIdleFill,
        });
        // 테두리 = 견줌의 표식. 가장 두꺼운 줄에만 선다.
        if (crowned) place(bar, { stroke: c.text, 'stroke-width': 1.4 });
        railLayer.appendChild(bar);
        bars[row] = bar;

        const value = el('text', {
          x: RAIL_X + RAIL_W,
          y: cy + 4,
          fill: row === live || crowned ? c.text : c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'end',
        });
        value.textContent = formatThickness(measured.thickness);
        railLayer.appendChild(value);
      }

      // 우승 길이를 가리키는 눈금선. 가로 자리는 우승 줄의 **두께**에서 셈한다 —
      // 막대의 `width` 속성을 되읽으면 되짚어 세운 직후에 옛 화면의 것이 나온다.
      let record: Drawn['record'] = null;
      const bestRow = rowAt(scene, best);
      if (scene.crowned && best !== null && bestRow !== null) {
        const x = BAR_X + Math.max(0, bestRow.thickness * l.railUnit);
        const from = rowCenter(l, best) + BAR_H / 2;
        const node = el('line', {
          stroke: c.text,
          'stroke-width': 1.2,
          'stroke-dasharray': '4 3',
          x1: x,
          y1: from,
          x2: x,
          y2: ROWS_TOP - 4,
        });
        railLayer.appendChild(node);
        record = { node, x, from };
      }

      return { bars, record };
    }

    /** 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않는다 (S-scene). */
    function drawStatic(scene: WidestMarginScene): Drawn {
      for (const g of rebuilt) g.textContent = '';
      caption.textContent = captionText(scene);

      const layout = layoutOf(scene);
      const caliperAt = caliperSpotOf(scene, layout, scene.pose);

      drawLegend(scene);
      drawAxes(scene, layout);
      const candidateLines = drawCandidateLines(scene, layout);
      // 두께가 0 인 띠는 아직 벌어지지 않은 것이라 몸통을 짓지 않는다. 중심선만
      // 선다 — 아직 없는 것을 숨기기만 하면 앞 걸음의 속성이 함께 남는다.
      const band =
        scene.pose === null
          ? null
          : makeBand(layout, caliperAt, scene.pose.half > 0);
      if (band !== null && scene.pose !== null) band.apply(scene.pose);
      const supports = drawSupports(scene, layout);
      const points = drawPoints(scene, layout);
      const rings = drawRings(scene, layout);
      const rail = drawRail(scene, layout);

      return {
        layout,
        caliperAt,
        points,
        rings,
        band,
        candidateLines,
        bars: rail.bars,
        supports,
        record: rail.record,
      };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 점이 제 무리 중심에서 자기 자리로 걸어 나온다. */
    function flowPlace(
      scene: WidestMarginScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const n = scene.points.length;
      if (n === 0 || drawn.points.length !== n) return Promise.resolve();
      const centres = scene.points.map((p) => groupCentre(scene, drawn.layout, p.group));
      return tween(ENTER_MS, mine, (p) => {
        scene.points.forEach((pt, i) => {
          const node = drawn.points[i];
          const from = centres[i];
          if (node === undefined || from === undefined) return;
          const d = staggered(p, i, n, 0.65);
          const e = easeOut(d);
          setPointAt(
            node,
            scene,
            pt,
            lerp(from.x, pt.x, e),
            lerp(from.y, pt.y, e),
            drawn.layout,
          );
          node.setAttribute('opacity', String(clamp01(d * 2.2)));
        });
      });
    }

    /** 후보 선이 왼쪽에서 오른쪽으로 그어진다. */
    function flowCandidates(
      scene: WidestMarginScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const lines = scene.candidates;
      if (lines.length === 0 || drawn.candidateLines.length !== lines.length) {
        return Promise.resolve();
      }
      const l = drawn.layout;
      const xa = l.domainMin;
      const xb = l.domainMin + l.domainSpan;
      return tween(DRAW_MS, mine, (p) => {
        lines.forEach((line, i) => {
          const node = drawn.candidateLines[i];
          if (node === undefined) return;
          const d = easeOut(staggered(p, i, lines.length, 0.72));
          const x = lerp(xa, xb, d);
          place(node, {
            x2: px(l, x),
            y2: py(l, line.slope * x + line.intercept),
          });
        });
      });
    }

    /**
     * 띠가 벌어지다 점에 닿아 멈춘다.
     *
     * 앞서 재던 띠가 접히고(fold) 선이 다음 기울기로 돌고(turn) 그다음 양옆으로
     * 밀려난다(grow). 접히기 시작하는 자세는 `step.from` 이 말한다.
     */
    async function flowGrow(
      scene: WidestMarginScene,
      drawn: Drawn,
      from: BandPose | null,
      mine: number,
    ): Promise<void> {
      const index = scene.rows.length - 1;
      const row = scene.rows.at(index);
      const pose = scene.pose;
      if (row === undefined || pose === null) return;

      // 정적 그리기가 세운 띠를 거두고 운동용을 짓는다 — 접히는 동안에는 몸통이
      // 있어야 하고, 끝난 뒤에는 정적 그리기가 통째로 다시 세운다.
      drawn.band?.g.remove();
      const band = makeBand(drawn.layout, drawn.caliperAt, true);

      const bar = drawn.bars[index];
      bar?.setAttribute('width', '0');
      for (const ring of drawn.rings.values()) ring.setAttribute('opacity', '0');

      const half = pose.half;
      await tween(GROW_MS, mine, (p) => {
        if (from !== null && p < PHASE_FOLD) {
          // 앞서 재던 띠가 접힌다.
          band.apply({
            slope: from.slope,
            intercept: from.intercept,
            half: from.half * (1 - p / PHASE_FOLD),
          });
          return;
        }
        if (from !== null && p < PHASE_TURN) {
          // 선이 다음 후보의 기울기로 돈다.
          const e = easeInOut((p - PHASE_FOLD) / (PHASE_TURN - PHASE_FOLD));
          band.apply({
            slope: lerp(from.slope, pose.slope, e),
            intercept: lerp(from.intercept, pose.intercept, e),
            half: 0,
          });
          return;
        }
        // 띠가 양쪽으로 밀려난다. 오른쪽 막대가 같은 값으로 자란다.
        const e = from === null ? easeOut(p) : easeOut((p - PHASE_TURN) / (1 - PHASE_TURN));
        band.apply({ slope: pose.slope, intercept: pose.intercept, half: half * e });
        bar?.setAttribute(
          'width',
          String(Math.max(0, row.thickness * e * drawn.layout.railUnit)),
        );
      });
      if (!alive(mine)) {
        band.g.remove();
        return;
      }

      // 닿았다 — 멈춘 자리를 점이 되받는다.
      await tween(TOUCH_MS, mine, (p) => {
        const e = easeOut(p);
        for (const ring of drawn.rings.values()) {
          place(ring, { r: RING_R * lerp(1.7, 1, e), opacity: e });
        }
      });
      band.g.remove();
    }

    /** 띠가 접히고 선이 최적 기울기로 돈다. */
    async function flowPivot(
      scene: WidestMarginScene,
      drawn: Drawn,
      from: BandPose,
      mine: number,
    ): Promise<void> {
      const pose = scene.pose;
      if (pose === null) return;
      drawn.band?.g.remove();
      const band = makeBand(drawn.layout, drawn.caliperAt, true);
      await tween(PIVOT_MS, mine, (p) => {
        if (p < PHASE_FOLD) {
          band.apply({
            slope: from.slope,
            intercept: from.intercept,
            half: from.half * (1 - p / PHASE_FOLD),
          });
          return;
        }
        const e = easeInOut((p - PHASE_FOLD) / (1 - PHASE_FOLD));
        band.apply({
          slope: lerp(from.slope, pose.slope, e),
          intercept: lerp(from.intercept, pose.intercept, e),
          half: 0,
        });
      });
      band.g.remove();
    }

    /** 닿은 점에서 중심선까지 수선이 내려온다. */
    function flowLock(drawn: Drawn, mine: number): Promise<void> {
      const supports = drawn.supports;
      if (supports.length === 0) return Promise.resolve();
      return tween(LOCK_MS, mine, (p) => {
        supports.forEach((s, k) => {
          const e = easeOut(staggered(p, k, supports.length, 0.8));
          place(s.node, {
            x2: lerp(s.x1, s.x2, e),
            y2: lerp(s.y1, s.y2, e),
            opacity: clamp01(e * 2),
          });
        });
      });
    }

    /** 우승 길이를 가리키는 눈금선이 기록장을 타고 올라간다. */
    function flowCrown(drawn: Drawn, mine: number): Promise<void> {
      const record = drawn.record;
      if (record === null) return Promise.resolve();
      return tween(CROWN_MS, mine, (p) => {
        const e = easeOut(p);
        place(record.node, {
          y1: record.from,
          y2: lerp(record.from, ROWS_TOP - 4, e),
        });
      });
    }

    function flowFor(
      step: WidestMarginStep,
      scene: WidestMarginScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'place':
          return flowPlace(scene, drawn, mine);
        case 'candidates':
          return flowCandidates(scene, drawn, mine);
        case 'grow':
          return flowGrow(scene, drawn, step.from, mine);
        case 'pivot':
          return flowPivot(scene, drawn, step.from, mine);
        case 'lock':
          return flowLock(drawn, mine);
        case 'crown':
          return flowCrown(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: WidestMarginScene,
      _prev: WidestMarginScene | null,
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
        for (const id of frames) unschedule(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of layers) g.remove();
        caption.remove();
        defs.remove();
      },
    };
  },
};
