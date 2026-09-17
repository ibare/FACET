/**
 * 가장 넓게 퍼진 방향 — 무대.
 *
 * 장면 하나를 받아 그 화면을 **통째로** 세운다 (`render`). 걸음마다 부르는
 * 메서드를 두지 않는다 — 그 메서드들이 곧 되돌릴 수 없는 명령이었다 (S-scene).
 *
 * ── 화면을 어떻게 갈랐는가
 *
 * 왼쪽은 점 무리와 **도는 축**이고, 오른쪽은 그 축을 돌리는 동안 퍼짐이 어떻게
 * 오르내리는지를 그리는 **곡선**이다. 산점도는 주인공이 아니라 동사가 일어나는
 * 자리다 — 눈이 따라가야 하는 것은 축이 돌 때마다 오른쪽에서 자라나는 곡선과
 * 그 위를 달리는 읽개(head)다.
 *
 * 오른쪽 아래의 막대는 곁들여 드러나는 것을 진다. 축 방향의 퍼짐과 직각 방향의
 * 퍼짐이 한 막대를 나눠 가지는데, 나누는 자리는 축이 돌 때마다 미끄러져도
 * 막대의 오른쪽 끝은 꿈쩍하지 않는다. 합이 늘 같다는 말이 그것이다.
 *
 * ── 형편과 표식을 갈랐다
 *
 * 이 조각의 이름에 실린 무게는 **가장** 에 있다. 그러니 짚어 본 각도들이 *덜
 * 퍼졌다*는 것이 완주 화면에 남아 있어야 한다.
 *
 * - **채움 = 값의 형편** — 곡선(성긴 자취에서 촘촘한 곡선으로) · 막대의 두 도막 ·
 *   자국과 띠. 색이 곧 어느 방향인가를 말한다 (축 방향 `itemActive` · 직각 방향
 *   `auxCursor`).
 * - **테두리 = 견줌·짚음의 표식** — 짚어 본 열두 각도의 점은 속을 비운 고리로
 *   남아 완주 화면에까지 서 있고, 봉우리에만 눈금선과 **테두리 두른 점**이
 *   붙는다. 그 테두리는 `peakBeatsSweep` 이 실제로 견주어 본 뒤에만 선다 —
 *   봉우리가 훑어 본 어느 각도보다 높다는 말을 화면이 재어 보고 한다.
 *
 * ── 척도
 *
 * 왼쪽 틀은 가로세로 눈금이 같다. 각도가 뜻을 가지려면 그래야 한다. 척도는
 * `let` 이 아니라 `geomOf(scene)` 가 점에서 매번 셈해 그 `render` 안에서만
 * 산다 (S-piece: 장면에 좌표를 담지 않는다). 곡선의 세로 눈금은 **합**에서
 * 나오는데, 그 합도 장면이 재어 온 두 수를 더해 얻는다.
 *
 * ── 운동
 *
 * 고리가 조여들어 가운데를 짚고, 축이 한 칸씩 돌고, 자국이 점에서 축으로
 * 내려앉고, 읽개가 곡선 위를 달린다. 마지막에 직각 축이 양옆으로 자라 합이
 * 나뉘는 것을 보인다.
 *
 * **운동의 출발 자세를 화면에서 되읽지 않는다.** 옛 stage 는 `let angleDeg` 에
 * 지금 각도를 적어 두고 그것을 출발값으로 삼았는데, 되짚어 세운 직후에는 그것이
 * 옛 화면의 각도라 축이 엉뚱한 자세에서 돌기 시작한다. 지금은 **자취의 바로 앞
 * 칸**이 출발 자세다 — `turns[i-1]` 이 말한다 (S-scene: `prev` 는 고르는 데만).
 *
 * 각도로 좌표를 셈하므로 보간의 끝자리가 흐른다 (`Math.sin(Math.PI)` 는 0 이
 * 아니다). 걸음 함수는 마지막 마디에서 보간값 대신 장면의 값을 그대로 쓰고,
 * 운동이 끝나면 `drawStatic(next)` 가 층을 통째로 다시 세워 남은 끝자리를
 * 지운다 (S-scene).
 *
 * CSS `transition` 은 쓰지 않는다. 되짚기는 `animate:false` 로 오는데 transition
 * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
 */

import {
  PIECE_CANVAS_W,
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
  axisAngleOf,
  centerOf,
  peakBeatsSweep,
  readingOf,
  shareOf,
  totalOf,
  turnAngleAt,
  type DirectionOfMostSpreadScene,
  type DirectionOfMostSpreadStep,
  type SpreadCurve,
  type SpreadPoint,
  type SpreadReading,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 그림이 정한다 (S-view). 마운트한 뒤로 바꾸지 않는다. */
const H = 288;

/** 왼쪽 — 점 무리가 사는 틀. */
const SCAT = { x: 14, y: 42, w: 236, h: 208 };
const SCAT_PAD = 18;

/** 오른쪽 — 퍼짐 곡선과 합 막대가 같은 가로 폭을 쓴다. */
const RIGHT_L = 294;
const RIGHT_R = W - 14;
const CURVE_Y = 46;
const CURVE_H = 116;
const CURVE_BASE = CURVE_Y + CURVE_H;
const TICK_LABEL_Y = 176;
const SUM_LABEL_Y = 198;
const BAR_Y = 206;
const BAR_H = 22;
const SEG_LABEL_Y = 243;
const CAPTION_Y = 272;
const HEADROOM = 1.08;

const PT_R = 3.2;
const FOOT_R = 2.5;
const SAMPLE_R = 2.6;

const CENTER_MS = 380;
const TURN_MS = 360;
const NARROW_MS = 900;
const SETTLE_MS = 560;
const FRAME_MS = 16;

/** 촘촘한 곡선이 다 그어지는 시점 (운동 전체에 대한 비율). */
const FINE_DRAWN_AT = 0.6;
/** 봉우리 눈금이 자라기 시작하는 시점. */
const PEAK_GROWS_AT = 0.7;

const DEG = Math.PI / 180;
const REACH = Math.hypot(SCAT.w, SCAT.h);

/** 마운트마다 다른 clipPath id — 한 글에 조각이 여럿 박히면 id 가 부딪힌다. */
let mountSeq = 0;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function place(node: SVGElement, attrs: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/**
 * 왼쪽 틀의 축척. `let` 이 아니라 장면의 점에서 매번 셈한다 (S-piece).
 *
 * 가로세로 눈금이 같아야 각도가 뜻을 갖는다.
 */
type Geom = { scale: number; midX: number; midY: number };

function geomOf(points: readonly SpreadPoint[]): Geom | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  return {
    scale: Math.min((SCAT.w - SCAT_PAD * 2) / spanX, (SCAT.h - SCAT_PAD * 2) / spanY),
    midX: (minX + maxX) / 2,
    midY: (minY + maxY) / 2,
  };
}

const toPx = (g: Geom, x: number): number => SCAT.x + SCAT.w / 2 + (x - g.midX) * g.scale;
const toPy = (g: Geom, y: number): number => SCAT.y + SCAT.h / 2 - (y - g.midY) * g.scale;
const plotX = (deg: number): number => RIGHT_L + (deg / 180) * (RIGHT_R - RIGHT_L);
const plotY = (v: number, total: number): number =>
  total > 0 ? CURVE_BASE - (v / (total * HEADROOM)) * CURVE_H : CURVE_BASE;

/** 촘촘한 곡선 위의 값. 읽개가 그 위를 타고 갈 때만 쓴다. */
function fineAt(curve: SpreadCurve, deg: number): number | null {
  if (curve.angles.length < 2) return null;
  const first = curve.angles[0] ?? 0;
  const step = (curve.angles[1] ?? 1) - first;
  if (step <= 0) return null;
  const raw = (deg - first) / step;
  const i = Math.max(0, Math.min(curve.angles.length - 2, Math.floor(raw)));
  const k = clamp01(raw - i);
  const a = curve.values[i];
  const b = curve.values[i + 1];
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return lerp(a, b, k);
}

/**
 * 지금 화면에 선 축의 자세. 값이지 자리가 아니다.
 *
 * `drop` 은 자국이 점에서 축까지 내려앉은 정도, `mate` 는 직각 축이 자란
 * 정도다. 둘 다 걸음이 끝나면 0 이나 1 이라 장면에서는 국면으로 산다.
 */
type Pose = {
  angleDeg: number;
  variance: number;
  across: number;
  drop: number;
  mate: number;
};

/** 정적 그리기가 세운 손잡이들. 걸음의 운동이 이것을 움직인다. */
type Drawn = {
  geom: Geom | null;
  center: SpreadPoint | null;
  points: readonly SpreadPoint[];
  total: number;
  axis: SVGLineElement | null;
  band: SVGLineElement | null;
  feet: SVGCircleElement[];
  links: SVGLineElement[];
  mateLine: SVGLineElement | null;
  mateBand: SVGLineElement | null;
  centerRing: SVGCircleElement | null;
  centerDot: SVGCircleElement | null;
  angleText: SVGTextElement | null;
  coarseLine: SVGPolylineElement | null;
  samples: SVGCircleElement[];
  finePath: SVGPathElement | null;
  peakTick: SVGLineElement | null;
  peakDot: SVGCircleElement | null;
  head: SVGCircleElement | null;
  headDrop: SVGLineElement | null;
  barLeft: SVGRectElement | null;
  barRight: SVGRectElement | null;
  sumText: SVGTextElement | null;
  spreadText: SVGTextElement | null;
  acrossText: SVGTextElement | null;
};

export const directionOfMostSpreadStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DirectionOfMostSpreadScene> {
    const svg = params.canvas;
    // 캔버스 **안쪽** 만 비운다. 컨테이너를 비우면 러너가 붙여 준 이 캔버스가
    // 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    mountSeq += 1;
    const clipId = `direction-of-most-spread-plot-${mountSeq}`;

    // ── 뼈대. 장면과 무관한 것은 한 번만 짓는다.
    const defs = el('defs', {});
    const clip = el('clipPath', { id: clipId });
    clip.appendChild(el('rect', { x: SCAT.x, y: SCAT.y, width: SCAT.w, height: SCAT.h, rx: 8 }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    const backLayer = el('g', {});
    svg.appendChild(backLayer);
    const scatLayer = el('g', { 'clip-path': `url(#${clipId})` });
    svg.appendChild(scatLayer);
    const plotLayer = el('g', {});
    svg.appendChild(plotLayer);
    const frontLayer = el('g', {});
    svg.appendChild(frontLayer);

    // 재건 밖에 있는 하나. 자리는 고정이고 글자만 정적 그리기가 매번 다시 쓴다.
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
    });
    svg.appendChild(caption);

    const layers = [backLayer, scatLayer, plotLayer, frontLayer];
    /** 정적 그리기가 매번 자식을 갈아 끼우는 층. */
    const rebuilt = [scatLayer, plotLayer];

    backLayer.appendChild(
      el('rect', {
        x: SCAT.x,
        y: SCAT.y,
        width: SCAT.w,
        height: SCAT.h,
        rx: 8,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    backLayer.appendChild(
      el('line', {
        x1: RIGHT_L,
        y1: CURVE_BASE,
        x2: RIGHT_R,
        y2: CURVE_BASE,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    backLayer.appendChild(
      el('line', {
        x1: RIGHT_L,
        y1: CURVE_Y,
        x2: RIGHT_L,
        y2: CURVE_BASE,
        stroke: c.border,
        'stroke-width': 1,
      }),
    );
    for (const deg of [0, 45, 90, 135, 180]) {
      const gx = plotX(deg);
      backLayer.appendChild(
        el('line', {
          x1: gx,
          y1: CURVE_BASE,
          x2: gx,
          y2: CURVE_BASE + 4,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      const tick = el('text', {
        x: gx,
        y: TICK_LABEL_Y,
        'text-anchor': deg === 0 ? 'start' : deg === 180 ? 'end' : 'middle',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      // 각도 눈금은 수식 표기라 문안이 아니다 (C10 표식 판정 3).
      tick.textContent = `${deg}°`;
      backLayer.appendChild(tick);
    }
    const curveTitle = el('text', {
      x: RIGHT_L,
      y: CURVE_Y - 8,
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
    });
    curveTitle.textContent = t('label.spread', 'spread');
    backLayer.appendChild(curveTitle);

    // 막대의 테두리. 두 도막 위에 얹혀야 하므로 뒤에 붙인 층에 둔다.
    frontLayer.appendChild(
      el('rect', {
        x: RIGHT_L,
        y: BAR_Y,
        width: RIGHT_R - RIGHT_L,
        height: BAR_H,
        rx: 3,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1,
      }),
    );

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지나므로 `destroy` 가 그 가운데 올 수 있다.
     * 프레임마다 자기 번호가 아직 유효한지 보고 아니면 화면에 손대지 않는다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 보간 한 마디. 끝나거나 끊기면 반드시 풀린다 (S-piece). */
    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
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

    // ── 자세 세우기 ───────────────────────────────────────────────────────

    /**
     * 축·자국·띠·막대·읽개를 한 자세대로 놓는다.
     *
     * 정적 그리기와 걸음의 운동이 **같은 이 함수**를 지난다. 두 벌로 나누면
     * 흘려 세운 화면과 곧바로 세운 화면이 갈린다.
     *
     * `traced` 가 있으면 성긴 자취를 그 목록 + 읽개까지 잇는다 (자취가 읽개를
     * 따라 자라는 동안). null 이면 자취는 정적 그리기가 세운 그대로 둔다.
     */
    function applyPose(
      d: Drawn,
      pose: Pose,
      traced: readonly SpreadReading[] | null,
    ): void {
      const g = d.geom;
      const center = d.center;
      if (g === null || center === null) return;

      const rad = pose.angleDeg * DEG;
      const ux = Math.cos(rad);
      const uy = -Math.sin(rad);
      const ox = toPx(g, center.x);
      const oy = toPy(g, center.y);
      const shown = pose.drop > 0 ? 'visible' : 'hidden';

      if (d.axis !== null) {
        place(d.axis, {
          x1: ox - ux * REACH,
          y1: oy - uy * REACH,
          x2: ox + ux * REACH,
          y2: oy + uy * REACH,
          visibility: 'visible',
        });
      }

      if (d.band !== null) {
        const half = Math.sqrt(Math.max(pose.variance, 0)) * g.scale * pose.drop;
        place(d.band, {
          x1: ox - ux * half,
          y1: oy - uy * half,
          x2: ox + ux * half,
          y2: oy + uy * half,
          visibility: shown,
        });
      }

      d.points.forEach((p, i) => {
        const px = toPx(g, p.x);
        const py = toPy(g, p.y);
        const along = (p.x - center.x) * Math.cos(rad) + (p.y - center.y) * Math.sin(rad);
        const fx = ox + ux * along * g.scale;
        const fy = oy + uy * along * g.scale;
        const lx = lerp(px, fx, pose.drop);
        const ly = lerp(py, fy, pose.drop);
        const foot = d.feet[i];
        const link = d.links[i];
        if (foot !== undefined) place(foot, { cx: lx, cy: ly, visibility: shown });
        if (link !== undefined) {
          place(link, { x1: px, y1: py, x2: lx, y2: ly, visibility: shown });
        }
      });

      const mateShown = pose.mate > 0 ? 'visible' : 'hidden';
      if (d.mateLine !== null || d.mateBand !== null) {
        const mx = Math.cos((pose.angleDeg + 90) * DEG);
        const my = -Math.sin((pose.angleDeg + 90) * DEG);
        const reach = REACH * pose.mate;
        if (d.mateLine !== null) {
          place(d.mateLine, {
            x1: ox - mx * reach,
            y1: oy - my * reach,
            x2: ox + mx * reach,
            y2: oy + my * reach,
            visibility: mateShown,
          });
        }
        if (d.mateBand !== null) {
          const mHalf = Math.sqrt(Math.max(pose.across, 0)) * g.scale * pose.mate;
          place(d.mateBand, {
            x1: ox - mx * mHalf,
            y1: oy - my * mHalf,
            x2: ox + mx * mHalf,
            y2: oy + my * mHalf,
            visibility: mateShown,
          });
        }
      }

      // 각도 표기는 수식이라 번역 대상이 아니다 (C10 표식 판정 3).
      if (d.angleText !== null) d.angleText.textContent = `θ = ${pose.angleDeg.toFixed(1)}°`;

      if (d.total <= 0) return;

      const wLeft = (pose.variance / d.total) * (RIGHT_R - RIGHT_L);
      if (d.barLeft !== null) place(d.barLeft, { width: Math.max(0, wLeft) });
      if (d.barRight !== null) {
        place(d.barRight, {
          x: RIGHT_L + wLeft,
          width: Math.max(0, RIGHT_R - RIGHT_L - wLeft),
        });
      }
      if (d.sumText !== null) {
        d.sumText.textContent = t('label.sumValue', 'sum = {v}', { v: d.total.toFixed(2) });
      }
      if (d.spreadText !== null) {
        d.spreadText.textContent = t('label.spreadValue', 'spread = {v}', {
          v: pose.variance.toFixed(2),
        });
      }
      if (d.acrossText !== null) {
        d.acrossText.textContent = t('label.acrossValue', 'across = {v}', {
          v: pose.across.toFixed(2),
        });
      }

      const hx = plotX(pose.angleDeg);
      const hy = plotY(pose.variance, d.total);
      if (d.head !== null) place(d.head, { cx: hx, cy: hy, visibility: 'visible' });
      if (d.headDrop !== null) {
        place(d.headDrop, { x1: hx, y1: hy, x2: hx, y2: CURVE_BASE, visibility: 'visible' });
      }
      if (traced !== null && d.coarseLine !== null) {
        const pts = traced.map(
          (r, j) => `${plotX(turnAngleAt(j))},${plotY(r.variance, d.total)}`,
        );
        pts.push(`${hx},${hy}`);
        d.coarseLine.setAttribute('points', pts.join(' '));
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 이 장면이 지금 무엇을 말하는가. `step` 을 읽지 않는다 (S-scene). */
    function captionText(scene: DirectionOfMostSpreadScene): string {
      if (scene.settled) {
        const share = shareOf(scene);
        if (share !== null) {
          return t('caption.done', 'The widest direction holds this much of the total: {share}%.', {
            share: share.toFixed(1),
          });
        }
      }
      if (scene.curve !== null) {
        return t('caption.stop', 'It comes back and stops where the spread is widest.');
      }
      if (scene.turns.length > 0) {
        return t('caption.turn', 'Turning the axis, measuring how far the marks spread.');
      }
      if (scene.centered) {
        return t('caption.center', 'The axis will pivot through the center of the cloud.');
      }
      return '';
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않는다 (S-scene).
     *
     * 아직 없는 것은 **숨기지 않고 짓지 않는다** — 숨기기만 하면 앞 걸음의
     * 속성이 함께 남는다 (프로토콜 4 절).
     */
    function drawStatic(scene: DirectionOfMostSpreadScene): Drawn {
      for (const g of rebuilt) g.textContent = '';
      caption.textContent = captionText(scene);

      const geom = geomOf(scene.points);
      const center = scene.centered ? centerOf(scene) : null;
      const total = totalOf(scene);
      const angle = axisAngleOf(scene);
      const reading = readingOf(scene);
      const dropped = angle !== null;

      const d: Drawn = {
        geom,
        center,
        points: scene.points,
        total,
        axis: null,
        band: null,
        feet: [],
        links: [],
        mateLine: null,
        mateBand: null,
        centerRing: null,
        centerDot: null,
        angleText: null,
        coarseLine: null,
        samples: [],
        finePath: null,
        peakTick: null,
        peakDot: null,
        head: null,
        headDrop: null,
        barLeft: null,
        barRight: null,
        sumText: null,
        spreadText: null,
        acrossText: null,
      };
      if (geom === null) return d;

      // ── 왼쪽 틀. 그리는 차례가 곧 겹치는 차례다.
      if (scene.settled) {
        d.mateLine = el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          stroke: c.auxCursor,
          'stroke-width': 1.4,
          'stroke-dasharray': '5 4',
        });
        scatLayer.appendChild(d.mateLine);
      }
      if (dropped) {
        d.axis = el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          stroke: c.text,
          'stroke-width': 1.2,
        });
        scatLayer.appendChild(d.axis);
      }
      if (scene.settled) {
        d.mateBand = el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          stroke: c.auxCursor,
          'stroke-width': 5,
          'stroke-linecap': 'round',
        });
        scatLayer.appendChild(d.mateBand);
      }
      if (dropped) {
        d.band = el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          stroke: c.itemActive,
          'stroke-width': 6,
          'stroke-linecap': 'round',
        });
        scatLayer.appendChild(d.band);

        d.links = scene.points.map(() => {
          const line = el('line', {
            x1: 0,
            y1: 0,
            x2: 0,
            y2: 0,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 3',
          });
          scatLayer.appendChild(line);
          return line;
        });
      }

      for (const p of scene.points) {
        scatLayer.appendChild(
          el('circle', { cx: toPx(geom, p.x), cy: toPy(geom, p.y), r: PT_R, fill: c.textMuted }),
        );
      }

      if (dropped) {
        d.feet = scene.points.map(() => {
          const foot = el('circle', { cx: 0, cy: 0, r: FOOT_R, fill: c.itemActive });
          scatLayer.appendChild(foot);
          return foot;
        });
      }

      if (center !== null) {
        d.centerRing = el('circle', {
          cx: toPx(geom, center.x),
          cy: toPy(geom, center.y),
          r: 8,
          fill: 'none',
          stroke: c.accent,
          'stroke-width': 1.6,
        });
        scatLayer.appendChild(d.centerRing);
        d.centerDot = el('circle', {
          cx: toPx(geom, center.x),
          cy: toPy(geom, center.y),
          r: 2.6,
          fill: c.accent,
        });
        scatLayer.appendChild(d.centerDot);
      }

      if (dropped) {
        d.angleText = el('text', {
          x: SCAT.x,
          y: SCAT.y - 8,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        plotLayer.appendChild(d.angleText);
      }

      // ── 곡선. 합이 정해져야 세로 눈금이 선다.
      if (total > 0) {
        plotLayer.appendChild(
          el('line', {
            x1: RIGHT_L,
            y1: plotY(total, total),
            x2: RIGHT_R,
            y2: plotY(total, total),
            stroke: c.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '4 4',
          }),
        );
      }

      // 성긴 자취. 촘촘한 곡선이 서면 자리를 넘겨주고 뒤로 물러난다.
      d.coarseLine = el('polyline', {
        points: scene.turns
          .map((r, j) => `${plotX(turnAngleAt(j))},${plotY(r.variance, total)}`)
          .join(' '),
        fill: 'none',
        stroke: scene.curve === null ? c.itemActive : c.border,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
      });
      plotLayer.appendChild(d.coarseLine);

      if (scene.curve !== null) {
        d.finePath = el('path', {
          d: fineD(scene.curve, total).d,
          fill: 'none',
          stroke: c.itemActive,
          'stroke-width': 2,
        });
        plotLayer.appendChild(d.finePath);
      }

      // 테두리 = 짚음의 표식. 짚어 본 각도는 속을 비운 고리로 남는다 — 완주
      // 화면에서 "따져 본 다른 각도들" 이 지워지지 않게 하는 자리다.
      d.samples = scene.turns.map((r, j) => {
        const dot = el('circle', {
          cx: plotX(turnAngleAt(j)),
          cy: plotY(r.variance, total),
          r: SAMPLE_R,
          fill: c.bg,
          stroke: c.itemActive,
          'stroke-width': 1.4,
        });
        plotLayer.appendChild(dot);
        return dot;
      });

      const peak = scene.peak;
      if (peak !== null && total > 0) {
        const peakXp = plotX(peak.angleDeg);
        const peakYp = plotY(peak.variance, total);
        d.peakTick = el('line', {
          x1: peakXp,
          y1: CURVE_BASE,
          x2: peakXp,
          y2: peakYp,
          stroke: c.accent,
          'stroke-width': 2,
        });
        plotLayer.appendChild(d.peakTick);
        d.peakDot = el('circle', {
          cx: peakXp,
          cy: peakYp,
          r: 3.4,
          fill: c.accent,
        });
        // 훑어 본 어느 각도보다 높다는 것을 실제로 견주어 본 뒤에만 테두리가 선다.
        if (peakBeatsSweep(scene)) {
          place(d.peakDot, { stroke: c.text, 'stroke-width': 1.4 });
        }
        plotLayer.appendChild(d.peakDot);
      }

      if (total > 0) {
        d.headDrop = el('line', {
          x1: 0,
          y1: 0,
          x2: 0,
          y2: 0,
          stroke: c.border,
          'stroke-width': 1,
        });
        plotLayer.appendChild(d.headDrop);
        d.head = el('circle', { cx: 0, cy: 0, r: 3.6, fill: c.itemActive });
        plotLayer.appendChild(d.head);

        d.barLeft = el('rect', { x: RIGHT_L, y: BAR_Y, width: 0, height: BAR_H, fill: c.itemActive });
        plotLayer.appendChild(d.barLeft);
        d.barRight = el('rect', { x: RIGHT_L, y: BAR_Y, width: 0, height: BAR_H, fill: c.auxCursor });
        plotLayer.appendChild(d.barRight);

        d.sumText = el('text', {
          x: RIGHT_R,
          y: SUM_LABEL_Y,
          'text-anchor': 'end',
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        plotLayer.appendChild(d.sumText);
        d.spreadText = el('text', {
          x: RIGHT_L,
          y: SEG_LABEL_Y,
          fill: c.itemActive,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        plotLayer.appendChild(d.spreadText);
        d.acrossText = el('text', {
          x: RIGHT_R,
          y: SEG_LABEL_Y,
          'text-anchor': 'end',
          fill: c.auxCursor,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
        });
        plotLayer.appendChild(d.acrossText);
      }

      if (angle !== null && reading !== null) {
        applyPose(
          d,
          {
            angleDeg: angle,
            variance: reading.variance,
            across: reading.across,
            drop: 1,
            mate: scene.settled ? 1 : 0,
          },
          null,
        );
      }
      return d;
    }

    /** 촘촘한 곡선의 경로와 그 길이. 길이는 그어지는 운동에 쓴다. */
    function fineD(curve: SpreadCurve, total: number): { d: string; length: number } {
      const pts = curve.angles.map((deg, i) => ({
        x: plotX(deg),
        y: plotY(curve.values[i] ?? 0, total),
      }));
      let length = 0;
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        if (a === undefined || b === undefined) continue;
        length += Math.hypot(b.x - a.x, b.y - a.y);
      }
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
      return { d, length: Math.max(length, 1) };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 고리가 조여들며 무리의 가운데를 짚는다. */
    function flowCenter(d: Drawn, mine: number): Promise<void> {
      const ring = d.centerRing;
      const dot = d.centerDot;
      if (ring === null || dot === null) return Promise.resolve();
      return tween(CENTER_MS, mine, (p) => {
        const e = easeInOut(p);
        ring.setAttribute('r', p >= 1 ? '8' : String(lerp(46, 8, e)));
        dot.setAttribute('visibility', e > 0.55 ? 'visible' : 'hidden');
      });
    }

    /**
     * 축이 한 칸 더 돈다. 첫 걸음에서는 돌리는 대신 자국이 점에서 축까지
     * 내려앉는다 — 잴 것이 무엇인지 먼저 보여야 하기 때문이다.
     *
     * 출발 자세는 **자취의 바로 앞 칸**이 말한다. 화면을 되읽지 않는다 (S-scene).
     */
    function flowTurn(
      scene: DirectionOfMostSpreadScene,
      d: Drawn,
      mine: number,
    ): Promise<void> {
      const index = scene.turns.length - 1;
      const to = scene.turns.at(index);
      if (index < 0 || to === undefined) return Promise.resolve();
      const toDeg = turnAngleAt(index);
      const before = index > 0 ? scene.turns.at(index - 1) : undefined;
      const fromDeg = before === undefined ? toDeg : turnAngleAt(index - 1);
      const fromVar = before?.variance ?? to.variance;
      const fromAcross = before?.across ?? to.across;
      const fromDrop = before === undefined ? 0 : 1;
      const traced = scene.turns.slice(0, index);
      const landing = d.samples[index];
      if (landing !== undefined) landing.setAttribute('visibility', 'hidden');

      return tween(TURN_MS, mine, (p) => {
        if (p >= 1) {
          // 끝에서는 보간값이 아니라 장면의 값을 그대로 쓴다 — 각도로 자리를
          // 셈하므로 끝자리가 흐른다 (프로토콜 4 절).
          applyPose(
            d,
            { angleDeg: toDeg, variance: to.variance, across: to.across, drop: 1, mate: 0 },
            traced,
          );
          if (landing !== undefined) landing.setAttribute('visibility', 'visible');
          return;
        }
        const e = easeInOut(p);
        applyPose(
          d,
          {
            angleDeg: lerp(fromDeg, toDeg, e),
            variance: lerp(fromVar, to.variance, e),
            across: lerp(fromAcross, to.across, e),
            drop: lerp(fromDrop, 1, e),
            mate: 0,
          },
          traced,
        );
      });
    }

    /**
     * 성긴 자국 사이를 촘촘히 메우고, 축은 봉우리로 되돌아가 멈춘다.
     * 읽개는 그 동안 촘촘한 곡선 위를 그대로 타고 간다.
     */
    function flowNarrow(
      scene: DirectionOfMostSpreadScene,
      d: Drawn,
      mine: number,
    ): Promise<void> {
      const peak = scene.peak;
      const curve = scene.curve;
      const fine = d.finePath;
      if (peak === null || curve === null || fine === null) return Promise.resolve();

      const { length } = fineD(curve, d.total);
      place(fine, { 'stroke-dasharray': `${length} ${length}`, 'stroke-dashoffset': length });

      const fromDeg =
        scene.turns.length > 0 ? turnAngleAt(scene.turns.length - 1) : peak.angleDeg;
      const peakYp = plotY(peak.variance, d.total);
      const tick = d.peakTick;
      const dot = d.peakDot;
      if (tick !== null) place(tick, { y2: CURVE_BASE, visibility: 'hidden' });
      if (dot !== null) dot.setAttribute('visibility', 'hidden');

      return tween(NARROW_MS, mine, (p) => {
        if (p >= 1) {
          fine.removeAttribute('stroke-dasharray');
          fine.removeAttribute('stroke-dashoffset');
          if (tick !== null) place(tick, { y2: peakYp, visibility: 'visible' });
          if (dot !== null) dot.setAttribute('visibility', 'visible');
          applyPose(
            d,
            {
              angleDeg: peak.angleDeg,
              variance: peak.variance,
              across: peak.across,
              drop: 1,
              mate: 0,
            },
            null,
          );
          return;
        }
        const e = easeInOut(p);
        fine.setAttribute(
          'stroke-dashoffset',
          String(length * (1 - clamp01(e / FINE_DRAWN_AT))),
        );
        const deg = lerp(fromDeg, peak.angleDeg, e);
        const v = fineAt(curve, deg) ?? peak.variance;
        applyPose(
          d,
          {
            angleDeg: deg,
            variance: v,
            across: Math.max(0, d.total - v),
            drop: 1,
            mate: 0,
          },
          null,
        );
        const grow = clamp01((e - PEAK_GROWS_AT) / (1 - PEAK_GROWS_AT));
        if (tick !== null && grow > 0) {
          place(tick, { y2: lerp(CURVE_BASE, peakYp, grow), visibility: 'visible' });
        }
        if (dot !== null) dot.setAttribute('visibility', grow > 0.9 ? 'visible' : 'hidden');
      });
    }

    /** 멈춘 자리에서 직각 방향이 함께 자란다 — 한쪽이 늘면 다른 쪽이 준다. */
    function flowSettle(
      scene: DirectionOfMostSpreadScene,
      d: Drawn,
      mine: number,
    ): Promise<void> {
      const peak = scene.peak;
      if (peak === null) return Promise.resolve();
      return tween(SETTLE_MS, mine, (p) => {
        applyPose(
          d,
          {
            angleDeg: peak.angleDeg,
            variance: peak.variance,
            across: peak.across,
            drop: 1,
            mate: p >= 1 ? 1 : easeInOut(p),
          },
          null,
        );
      });
    }

    function flowFor(
      step: DirectionOfMostSpreadStep,
      scene: DirectionOfMostSpreadScene,
      d: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'center':
          return flowCenter(d, mine);
        case 'turn':
          return flowTurn(scene, d, mine);
        case 'narrow':
          return flowNarrow(scene, d, mine);
        case 'settle':
          return flowSettle(scene, d, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: DirectionOfMostSpreadScene,
      _prev: DirectionOfMostSpreadScene | null,
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

      // 운동이 남긴 속성과 보간의 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
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
        defs.remove();
      },
    };
  },
};
