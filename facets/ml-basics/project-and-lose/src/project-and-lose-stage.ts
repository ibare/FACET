/**
 * project-and-lose stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 이 그림이 하는 일
 *
 * 산점도는 무대이지 주인공이 아니다. 주인공은 **떨어짐**이다. 축이 완만하게 기울어
 * 있으면 그 직각 방향은 거의 수직이고, 그래서 점은 화면에서 곧장 아래(또는 위)로
 * 떨어진다. 떨어진 길이 그대로가 붉은 흔적으로 남고, 그 흔적이 축 쪽으로 빨려
 * 들어가 사라지는 것이 "잃는다" 의 뜻이다. 마지막에는 축 위의 한 자리에서 직각
 * 방향으로 후보 자리들이 줄줄이 서서, 축만 보아서는 원래 자리를 짚을 수 없다는
 * 것을 말한다.
 *
 * ── 이행이 고친 화면 둘
 *
 * **하나. 후보 가운데 하나가 이제 그 점이 실제로 있던 자리다.** 옛 그림은 후보 여섯을
 * 판이 허락하는 만큼 고르게 흩어 놓기만 했고, 그래서 **누르기 전의 자리가 완주 화면에
 * 한 점도 남지 않았다.** 잃었다는 말을 받쳐 줄 짝이 없으면 후보 고리들은 장식이 된다.
 * 지금은 눈금 간격은 그대로 두되 격자를 밀어 **한 눈금이 그 점의 원래 자리에 정확히
 * 얹히게** 한다 (`ambiguityOf`). 여섯이 서로 구별되지 않는 채로 그중 하나가 진짜라는
 * 것 — 그것이 이 조각이 하려는 말 그대로다.
 *
 * **둘. 마지막 걸음이 아무 말도 안 하는 길이 있었다.** 옛 `finish()` 는 `rings.length
 * === 0` 이면 곧장 물러났고, 고리는 `showAmbiguity` 가 실제로 돌았을 때만 생겼다.
 * 임의의 자리로 뛰면 마지막 화면이 빈 채로 섰다. 지금은 `ambiguous` 가 고리를 정적
 * 으로 세우고 `finished` 는 그 위에 부풀기만 얹는다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**이다 — 점의 채움은 그 점이 짚인 것인가(itemActive)이고, 흔적의
 * 채움(붉은 선)은 잃은 거리 그 자체다. **테두리는 표식**이다 — 떨어져 앉은 알만
 * 바탕색 테두리를 둘러 축 위에 얹혔음을 말하고, 유령 고리의 점선은 *누르기 전의
 * 자리*라는 표식이다. 두 축을 갈라 두면 "얼마나 멀었나" 와 "이미 떨어졌나" 가 서로를
 * 지우지 않는다.
 *
 * ── 자리 셈
 *
 * 가로세로 축척이 같아야 한다. 다르면 직각이 직각으로 보이지 않아 그림이 거짓말을
 * 한다. 그래서 세로에서 축척을 정하고 가로는 남는 만큼 축이 더 뻗는 데 쓴다 — 축은
 * 끝이 없는 선이라 넓어진 폭이 그대로 뜻이 된다.
 *
 * 척도도 축의 방향도 mount 의 변수에 적어 두지 않는다. 옛 그림은 `let axis` 에 축을
 * 화면 좌표로 적어 두고 그 뒤로 계속 꺼내 썼는데, 되짚어 뒷걸음으로 곧장 뛰면 그것이
 * 아직 채워지지 않은 채였다. 지금은 `geomOf` 가 바탕의 점과 기울기에서 매번 셈해 그
 * `render` 안에서만 산다 (S-piece · S-scene).
 *
 * 세로(H)는 이 파일이 갖는다. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view).
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
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
  Palette,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  droppedOf,
  phaseOf,
  projectionOf,
  waveAt,
  type ProjectAndLoseScene,
  type ProjectAndLoseStep,
  type Projection,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 (S-view). */
const H = 396;

const PAD_X = 34;
const CAPTION_BASE = 22;
const PLOT_TOP = 40;
/** 점판 세로의 **상한**. 실제 높이는 점의 퍼짐에서 역산한다. */
const PLOT_H = 300;
const BAR_TOP = PLOT_TOP + PLOT_H + 18;
const BAR_H = 12;
const BAR_LABEL_BASE = BAR_TOP + BAR_H + 15;

/** 점이 판 가장자리에 붙지 않게 하는 데이터 여백. */
const Y_PAD = 0.22;
const X_PAD_MIN = 0.45;

const R_POINT = 5.5;
const R_BEAD = 4.4;
const R_GHOST = 5.5;
const TRACE_W = 2;
const MARK_W = 3.2;
const DIM = 0.32;
/** 떨어져 앉은 알이 두르는 바탕색 테두리 — 축 위에 얹혔다는 표식이다. */
const BEAD_STROKE_W = 1.4;

const RISE_MS = 440;
const FALL_MS = 420;
const IMPACT_MS = 130;
const MARK_MS = 260;
const ERASE_MS = 540;
const GUIDE_MS = 240;
const WANDER_MS = 720;
const PULSE_MS = 380;
/** 보간 한 마디의 벽시계. rAF 가 아니라 타이머로 재어 doc 없는 자리에서도 돌게 한다. */
const FRAME_MS = 16;

/** 직각 방향에 세울 후보 자리의 수 — "여기 어디에서 와도 같다". */
const CANDIDATES = 6;
/** 그 선의 한쪽 길이 **상한**. 실제 길이는 판에서 역산해 잘라 쓴다. */
const GUIDE_HALF_MAX = 118;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/**
 * 사이값. **끝에서는 보간하지 않고 목표값을 그대로 쓴다** — 보간의 부동소수 끝자리가
 * 남으면 흘려 세운 화면과 곧바로 세운 화면이 글자 하나 어긋난다 (S-scene 함정).
 */
const lerp = (a: number, b: number, p: number): number => (p >= 1 ? b : a + (b - a) * p);
const easeIn = (p: number): number => p * p;
const easeOut = (p: number): number => 1 - (1 - p) * (1 - p);
const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 이 장면의 자리 셈. `render` 안에서만 살고 밖으로 새지 않는다. */
type Geom = {
  scale: number;
  plotW: number;
  plotTop: number;
  drawH: number;
  xLo: number;
  yLo: number;
  yHi: number;
  sx(x: number): number;
  sy(y: number): number;
  /** 판 안에 남는 축의 두 끝과 가운데, 그리고 **화면에서의** 방향. */
  axis: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    midX: number;
    midY: number;
    ux: number;
    uy: number;
  };
};

/** 축 위의 한 자리에서 직각으로 뻗는 후보들. */
type Ambiguity = {
  /** 짚은 점의 발. */
  fx: number;
  fy: number;
  /** 선의 두 끝. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** 후보 자리와 그것이 선 위 어느 비율에 있나. 하나는 그 점의 **실제 원래 자리**다. */
  stops: { x: number; y: number; q: number }[];
};

type Bar = {
  kept: SVGRectElement;
  lost: SVGRectElement;
  keptLabel: SVGTextElement;
  lostLabel: SVGTextElement;
  keptW: number;
  lostW: number;
};

/** 정적 그리기가 세워 둔 손잡이. */
type Drawn = {
  geom: Geom;
  proj: Projection;
  dots: SVGCircleElement[];
  traces: (SVGLineElement | null)[];
  ghosts: (SVGCircleElement | null)[];
  markTag: SVGTextElement | null;
  axisLine: SVGLineElement;
  axisLabel: SVGTextElement;
  bar: Bar | null;
  guide: SVGLineElement | null;
  rings: SVGCircleElement[];
  amb: Ambiguity | null;
};

export const projectAndLoseStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ProjectAndLoseScene> {
    const svg = params.canvas;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gAxis = el('g');
    const gTrace = el('g');
    const gGhost = el('g');
    const gGuide = el('g');
    const gDot = el('g');
    const gBar = el('g');
    const gCaption = el('g');
    const layers = [gAxis, gTrace, gGhost, gGuide, gDot, gBar, gCaption];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 프레임을 지난다. `destroy` 가 그 가운데 오면 남은 프레임이 이미
     * 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT).
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

    // ── 자리 셈 ──────────────────────────────────────────────────────────

    /**
     * 판 안에 남는 축의 두 끝 (Liang-Barsky). 축은 끝이 없으므로 판이 끝을 정한다.
     * 데이터 좌표에서 잰다.
     */
    function axisSpan(
      box: { xLo: number; xHi: number; yLo: number; yHi: number },
      cx: number,
      cy: number,
      ux: number,
      uy: number,
    ): [number, number] {
      let tMin = -Infinity;
      let tMax = Infinity;
      const cut = (p: number, q: number): void => {
        if (Math.abs(p) < 1e-9) return;
        const r = q / p;
        if (p < 0) tMin = Math.max(tMin, r);
        else tMax = Math.min(tMax, r);
      };
      cut(-ux, cx - box.xLo);
      cut(ux, box.xHi - cx);
      cut(-uy, cy - box.yLo);
      cut(uy, box.yHi - cy);
      return [tMin, tMax];
    }

    /**
     * 장면의 점과 기울기에서 자리를 셈한다. 걸음이 실어 온 것을 적어 두지 않는다.
     */
    function geomOf(scene: ProjectAndLoseScene, proj: Projection): Geom {
      const plotW = W - PAD_X * 2;
      const xs = scene.points.map((p) => p[0]);
      const ys = scene.points.map((p) => p[1]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const yLo = Math.min(...ys) - Y_PAD;
      const yHi = Math.max(...ys) + Y_PAD;
      const scale = Math.min(plotW / (xMax - xMin + X_PAD_MIN * 2), PLOT_H / (yHi - yLo));
      const drawH = (yHi - yLo) * scale;
      const plotTop = PLOT_TOP + (PLOT_H - drawH) / 2;
      const xLo = (xMin + xMax) / 2 - plotW / scale / 2;
      const sx = (x: number): number => PAD_X + (x - xLo) * scale;
      const sy = (y: number): number => plotTop + (yHi - y) * scale;

      const [tMin, tMax] = axisSpan(
        { xLo, xHi: xLo + plotW / scale, yLo, yHi },
        proj.centerX,
        proj.centerY,
        proj.ux,
        proj.uy,
      );
      const x1 = sx(proj.centerX + tMin * proj.ux);
      const y1 = sy(proj.centerY + tMin * proj.uy);
      const x2 = sx(proj.centerX + tMax * proj.ux);
      const y2 = sy(proj.centerY + tMax * proj.uy);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;

      return {
        scale,
        plotW,
        plotTop,
        drawH,
        xLo,
        yLo,
        yHi,
        sx,
        sy,
        axis: {
          x1,
          y1,
          x2,
          y2,
          midX: sx(proj.centerX),
          midY: sy(proj.centerY),
          ux: (x2 - x1) / len,
          uy: (y2 - y1) / len,
        },
      };
    }

    /** 점 i 의 원래 자리 (화면). */
    function originOf(scene: ProjectAndLoseScene, geom: Geom, i: number): { x: number; y: number } {
      const p = scene.points[i];
      return { x: geom.sx(p[0]), y: geom.sy(p[1]) };
    }

    /** 점 i 의 발 — 축 위로 내린 자리 (화면). */
    function footOf(proj: Projection, geom: Geom, i: number): { x: number; y: number } {
      const shot = proj.shots[i];
      return { x: geom.sx(shot.footX), y: geom.sy(shot.footY) };
    }

    /** 직각 방향으로 뻗을 수 있는 한쪽 길이 (화면 픽셀). */
    function guideHalf(geom: Geom, bx: number, by: number, px: number, py: number): number {
      const margin = R_GHOST + 6;
      let half = GUIDE_HALF_MAX;
      const cut = (v: number, d: number, lo: number, hi: number): void => {
        if (Math.abs(d) < 1e-9) return;
        half = Math.min(half, Math.max((lo - v) / d, (hi - v) / d));
      };
      cut(bx, px, PAD_X + margin, PAD_X + geom.plotW - margin);
      cut(by, py, geom.plotTop + margin, geom.plotTop + geom.drawH - margin);
      cut(bx, -px, PAD_X + margin, PAD_X + geom.plotW - margin);
      cut(by, -py, geom.plotTop + margin, geom.plotTop + geom.drawH - margin);
      return Math.max(0, half);
    }

    /**
     * 후보 자리들.
     *
     * 눈금은 `CANDIDATES` 개를 선 위에 고르게 놓되, **격자를 밀어 한 눈금이 그 점의
     * 실제 원래 자리에 정확히 얹히게** 한다. 그래야 "이 선 위 어디에서 와도 같다" 가
     * 주장이 아니라 그림이 된다 — 여섯 가운데 하나는 진짜인데 어느 것인지 말할 길이
     * 없다. 간격 `d` 로 나눈 칸의 **가운데**에 눈금을 두는 격자라, 어느 칸에 얹혀도
     * 모든 눈금이 선 안(`±half`)에 남는다.
     */
    function ambiguityOf(
      scene: ProjectAndLoseScene,
      geom: Geom,
      proj: Projection,
    ): Ambiguity | null {
      const i = proj.farthest;
      const foot = footOf(proj, geom, i);
      const px = -geom.axis.uy;
      const py = geom.axis.ux;
      const half = guideHalf(geom, foot.x, foot.y, px, py);
      if (half <= 0) return null;

      const origin = originOf(scene, geom, i);
      // 원래 자리가 발에서 직각 방향으로 얼마나 떨어져 있나 (부호 있는 화면 거리).
      const trueOff = (origin.x - foot.x) * px + (origin.y - foot.y) * py;
      const d = (2 * half) / CANDIDATES;
      const cell = Math.round((trueOff + half) / d - 0.5);
      const k = cell < 0 ? 0 : cell > CANDIDATES - 1 ? CANDIDATES - 1 : cell;
      const base = trueOff - k * d;

      const stops: { x: number; y: number; q: number }[] = [];
      for (let n = 0; n < CANDIDATES; n += 1) {
        const off = base + n * d;
        stops.push({
          x: foot.x + px * off,
          y: foot.y + py * off,
          q: clamp01((off + half) / (2 * half)),
        });
      }
      return {
        fx: foot.x,
        fy: foot.y,
        ax: foot.x - px * half,
        ay: foot.y - py * half,
        bx: foot.x + px * half,
        by: foot.y + py * half,
        stops,
      };
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /**
     * 지금 화면이 할 말.
     *
     * `step` 이 아니라 **국면**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
     * 나와야 한다. 수는 자취와 같은 셈(`projectOnAxis`)에서 나온다.
     */
    function captionFor(scene: ProjectAndLoseScene): string | null {
      const phase = phaseOf(scene);
      switch (phase.kind) {
        case 'blank':
          return null;
        case 'axis':
          return t('caption.axisGiven', 'One axis, already found. The points will drop onto it.');
        case 'drop':
          return t('caption.drop', 'Each point drops onto the axis at a right angle.');
        case 'measure':
          return t(
            'caption.measure',
            'The drop distance is what is lost — farthest {max}, average {mean}.',
            { max: phase.maxDist.toFixed(2), mean: phase.meanDist.toFixed(2) },
          );
        case 'erase':
          return t('caption.erase', 'Erase the traces. Only the spots on the axis remain.');
        case 'ambiguous':
          return t(
            'caption.ambiguous',
            'This spot on the axis looks the same from anywhere along this line.',
          );
        case 'done':
          return t('caption.done', 'So the original spot cannot be pointed back to.');
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /**
     * 떨어진 점마다의 흔적과 유령 고리, 그리고 짚은 것의 거리 딱지.
     *
     * 정적 그리기는 **아직 안 지웠을 때만** 부르고, 지우는 걸음은 지우기 전 그림이
     * 있어야 하므로 따로 부른다 — 그 그림은 운동 도중에만 살고 정지 화면에는 없다
     * (함정 27).
     */
    function paintTraces(
      scene: ProjectAndLoseScene,
      geom: Geom,
      proj: Projection,
    ): {
      traces: (SVGLineElement | null)[];
      ghosts: (SVGCircleElement | null)[];
      markTag: SVGTextElement | null;
    } {
      const traces: (SVGLineElement | null)[] = scene.points.map(() => null);
      const ghosts: (SVGCircleElement | null)[] = scene.points.map(() => null);

      for (const i of droppedOf(scene)) {
        const origin = originOf(scene, geom, i);
        const foot = footOf(proj, geom, i);
        const picked = scene.marked && i === proj.farthest;
        const ghost = el('circle', {
          cx: origin.x,
          cy: origin.y,
          r: R_GHOST,
          fill: 'none',
          stroke: picked ? c.itemActive : c.textMuted,
          'stroke-width': 1,
          'stroke-dasharray': '2 2',
        });
        const trace = el('line', {
          x1: origin.x,
          y1: origin.y,
          x2: foot.x,
          y2: foot.y,
          stroke: picked ? c.itemActive : c.danger,
          'stroke-width': picked ? MARK_W : TRACE_W,
          'stroke-linecap': 'round',
        });
        // 짚은 뒤로는 나머지가 물러난다 — **머무는 강조**라 정적 그리기에도 넣는다.
        if (scene.marked && !picked) {
          ghost.setAttribute('opacity', String(DIM));
          trace.setAttribute('opacity', String(DIM));
        }
        gGhost.appendChild(ghost);
        gTrace.appendChild(trace);
        ghosts[i] = ghost;
        traces[i] = trace;
      }

      let markTag: SVGTextElement | null = null;
      if (scene.marked) {
        const i = proj.farthest;
        const origin = originOf(scene, geom, i);
        const foot = footOf(proj, geom, i);
        markTag = el('text', {
          x: (origin.x + foot.x) / 2 + 10,
          y: (origin.y + foot.y) / 2 + 4,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.itemActive,
        });
        markTag.textContent = proj.maxDist.toFixed(2);
        gGhost.appendChild(markTag);
      }

      return { traces, ghosts, markTag };
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: ProjectAndLoseScene): Drawn | null {
      rewind();

      const text = captionFor(scene);
      if (text !== null) {
        const caption = el('text', {
          x: W / 2,
          y: CAPTION_BASE,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          fill: c.text,
        });
        caption.textContent = text;
        gCaption.appendChild(caption);
      }

      const proj = projectionOf(scene);
      // 아직 아무것도 서지 않은 장면 — 있지도 않은 것을 숨겨 두지 않는다 (함정 17).
      if (proj === null || !scene.ready) return null;
      const geom = geomOf(scene, proj);

      // ── 축
      const axisLine = el('line', {
        x1: geom.axis.x1,
        y1: geom.axis.y1,
        x2: geom.axis.x2,
        y2: geom.axis.y2,
        stroke: c.primary,
        'stroke-width': 2.6,
        'stroke-linecap': 'round',
      });
      // 축 이름은 오른쪽 끝에서 조금 물러나 선 위쪽에 눕히지 않고 둔다 —
      // 열한 픽셀짜리 한 글자는 기울이면 읽히지 않는다.
      const axisLabel = el('text', {
        x: geom.axis.x2 - geom.axis.ux * 14 + geom.axis.uy * 16,
        y: geom.axis.y2 - geom.axis.uy * 14 - geom.axis.ux * 16,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
        'text-anchor': 'end',
      });
      axisLabel.textContent = t('label.axis', 'axis');
      gAxis.append(axisLine, axisLabel);

      // ── 흔적과 유령 고리. 지운 뒤에는 없다.
      const painted = scene.collapsed
        ? {
            traces: scene.points.map(() => null),
            ghosts: scene.points.map(() => null),
            markTag: null,
          }
        : paintTraces(scene, geom, proj);

      // ── 점. 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다 (함정 13).
      const dropped = new Set(droppedOf(scene));
      const dots = scene.points.map((_p, i) => {
        const down = dropped.has(i);
        const at = down ? footOf(proj, geom, i) : originOf(scene, geom, i);
        const dot = el('circle', {
          cx: at.x,
          cy: at.y,
          r: down ? R_BEAD : R_POINT,
          // 짚은 점은 지운 뒤에도 그대로 남는다 — 머무는 강조다.
          fill: scene.marked && i === proj.farthest ? c.itemActive : c.text,
        });
        if (down) {
          dot.setAttribute('stroke', c.bg);
          dot.setAttribute('stroke-width', String(BEAD_STROKE_W));
        }
        gDot.appendChild(dot);
        return dot;
      });

      // ── 잃은 몫의 자. 흔적을 지운 뒤에만 선다.
      let bar: Bar | null = null;
      if (scene.collapsed) {
        const keptW = (geom.plotW * proj.keepPct) / 100;
        const lostW = geom.plotW - keptW;
        const rail = el('rect', {
          x: PAD_X,
          y: BAR_TOP,
          width: geom.plotW,
          height: BAR_H,
          rx: 3,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        });
        const kept = el('rect', {
          x: PAD_X,
          y: BAR_TOP,
          width: keptW,
          height: BAR_H,
          rx: 2,
          fill: c.primary,
        });
        const lost = el('rect', {
          x: PAD_X + keptW,
          y: BAR_TOP,
          width: lostW,
          height: BAR_H,
          rx: 2,
          fill: c.danger,
        });
        const keptLabel = el('text', {
          x: PAD_X,
          y: BAR_LABEL_BASE,
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        keptLabel.textContent = t('label.kept', 'Kept by the axis {pct}%', {
          pct: proj.keepPct.toFixed(1),
        });
        const lostLabel = el('text', {
          x: PAD_X + geom.plotW,
          y: BAR_LABEL_BASE,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: c.danger,
        });
        lostLabel.textContent = t('label.lost', 'Lost {pct}%', { pct: proj.losePct.toFixed(1) });
        gBar.append(rail, kept, lost, keptLabel, lostLabel);
        bar = { kept, lost, keptLabel, lostLabel, keptW, lostW };
      }

      // ── 후보 자리들.
      const amb = ambiguityOf(scene, geom, proj);
      let guide: SVGLineElement | null = null;
      const rings: SVGCircleElement[] = [];
      if (scene.ambiguous && amb !== null) {
        guide = el('line', {
          x1: amb.ax,
          y1: amb.ay,
          x2: amb.bx,
          y2: amb.by,
          stroke: c.itemActive,
          'stroke-width': 1.4,
          'stroke-dasharray': '4 4',
          opacity: 0.75,
        });
        gGuide.appendChild(guide);
        for (const stop of amb.stops) {
          const ring = el('circle', {
            cx: stop.x,
            cy: stop.y,
            r: R_GHOST,
            fill: 'none',
            stroke: c.itemActive,
            'stroke-width': 1.6,
            'stroke-dasharray': '2 2',
            opacity: 0.6,
          });
          gGuide.appendChild(ring);
          rings.push(ring);
        }
      }

      return {
        geom,
        proj,
        dots,
        traces: painted.traces,
        ghosts: painted.ghosts,
        markTag: painted.markTag,
        axisLine,
        axisLabel,
        bar,
        guide,
        rings,
        amb,
      };
    }

    // ── 몸짓 하나: 점이 서고 축이 자란다 ──────────────────────────────────

    async function flowStand(drawn: Drawn, mine: number): Promise<void> {
      const { axis } = drawn.geom;
      const last = drawn.dots.length - 1 || 1;
      await tween(RISE_MS, mine, (p) => {
        const grow = easeOut(p);
        drawn.axisLine.setAttribute('x1', String(lerp(axis.midX, axis.x1, grow)));
        drawn.axisLine.setAttribute('y1', String(lerp(axis.midY, axis.y1, grow)));
        drawn.axisLine.setAttribute('x2', String(lerp(axis.midX, axis.x2, grow)));
        drawn.axisLine.setAttribute('y2', String(lerp(axis.midY, axis.y2, grow)));
        drawn.axisLabel.setAttribute('opacity', String(clamp01((p - 0.7) / 0.3)));
        drawn.dots.forEach((dot, i) => {
          const local = clamp01((p - (i / last) * 0.5) / 0.5);
          dot.setAttribute('r', String(R_POINT * easeOut(local)));
        });
      });
    }

    // ── 몸짓 둘: 한 무리가 떨어진다 ───────────────────────────────────────

    /**
     * 출발 자리를 화면에서도 `prev` 에서도 꺼내지 않는다 — 원래 자리는 바탕에 있고
     * 이번에 떨어지는 묶음은 **자취의 길이**가 말한다 (S-scene).
     */
    async function flowDrop(
      scene: ProjectAndLoseScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const moves = waveAt(scene, scene.waves).map((i) => ({
        dot: drawn.dots[i],
        trace: drawn.traces[i],
        ghost: drawn.ghosts[i],
        from: originOf(scene, drawn.geom, i),
        to: footOf(drawn.proj, drawn.geom, i),
      }));
      if (moves.length === 0) return;

      // 떨어지는 동안은 아직 축에 얹히지 않았다 — 테두리도 앉은 크기도 아직이다.
      for (const m of moves) {
        m.dot.setAttribute('r', String(R_POINT));
        m.dot.removeAttribute('stroke');
        m.dot.removeAttribute('stroke-width');
      }
      await tween(FALL_MS, mine, (p) => {
        const fall = easeIn(p);
        for (const m of moves) {
          const x = lerp(m.from.x, m.to.x, fall);
          const y = lerp(m.from.y, m.to.y, fall);
          m.dot.setAttribute('cx', String(x));
          m.dot.setAttribute('cy', String(y));
          m.trace?.setAttribute('x2', String(x));
          m.trace?.setAttribute('y2', String(y));
          m.ghost?.setAttribute('r', String(R_GHOST * clamp01(p / 0.3)));
        }
      });
      if (!alive(mine)) return;

      for (const m of moves) {
        m.dot.setAttribute('stroke', c.bg);
        m.dot.setAttribute('stroke-width', String(BEAD_STROKE_W));
      }
      // 닿는 순간의 되튐 — 커졌다가 축 위의 작은 알로 앉는다.
      await tween(IMPACT_MS, mine, (p) => {
        const r = lerp(R_POINT * 1.35, R_BEAD, easeOut(p));
        for (const m of moves) m.dot.setAttribute('r', String(r));
      });
    }

    // ── 몸짓 셋: 가장 먼 하나를 짚는다 ───────────────────────────────────

    async function flowMark(
      scene: ProjectAndLoseScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const picked = drawn.proj.farthest;
      const others = droppedOf(scene).filter((i) => i !== picked);
      const origin = originOf(scene, drawn.geom, picked);
      const foot = footOf(drawn.proj, drawn.geom, picked);
      const tag = drawn.markTag;

      await tween(MARK_MS, mine, (p) => {
        const dim = String(lerp(1, DIM, easeInOut(p)));
        for (const i of others) {
          drawn.traces[i]?.setAttribute('opacity', dim);
          drawn.ghosts[i]?.setAttribute('opacity', dim);
        }
        if (tag === null) return;
        tag.setAttribute('opacity', String(easeOut(p)));
        tag.setAttribute('x', String((origin.x + foot.x) / 2 + lerp(2, 10, easeOut(p))));
      });
    }

    // ── 몸짓 넷: 흔적이 축으로 빨려 들어간다 ─────────────────────────────

    /**
     * 지우는 걸음이라 지우기 전 그림이 있어야 한다. 정지 화면에는 없는 것이므로
     * 여기서 짓고, 마지막 `drawStatic` 이 통째로 거둔다 (함정 27).
     */
    async function flowCollapse(
      scene: ProjectAndLoseScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const { traces, ghosts, markTag } = paintTraces(scene, drawn.geom, drawn.proj);
      const bar = drawn.bar;
      const picked = drawn.proj.farthest;
      const tagFrom = originOf(scene, drawn.geom, picked);
      const tagTo = footOf(drawn.proj, drawn.geom, picked);
      // 자리를 먼저 한 번에 셈하고 그 다음에 흘린다 (함정 13).
      const moves = droppedOf(scene).map((i) => ({
        trace: traces[i],
        ghost: ghosts[i],
        from: originOf(scene, drawn.geom, i),
        to: footOf(drawn.proj, drawn.geom, i),
      }));

      await tween(ERASE_MS, mine, (p) => {
        const gone = easeInOut(p);
        for (const m of moves) {
          const x = lerp(m.from.x, m.to.x, gone);
          const y = lerp(m.from.y, m.to.y, gone);
          m.trace?.setAttribute('x1', String(x));
          m.trace?.setAttribute('y1', String(y));
          m.ghost?.setAttribute('cx', String(x));
          m.ghost?.setAttribute('cy', String(y));
          m.ghost?.setAttribute('r', String(R_GHOST * (1 - gone)));
        }
        if (markTag !== null) {
          markTag.setAttribute(
            'x',
            String(lerp((tagFrom.x + tagTo.x) / 2 + 10, tagTo.x + 10, gone)),
          );
          markTag.setAttribute(
            'y',
            String(lerp((tagFrom.y + tagTo.y) / 2 + 4, tagTo.y + 4, gone)),
          );
          markTag.setAttribute('opacity', String(1 - gone));
        }
        if (bar !== null) {
          const shown = String(clamp01((p - 0.55) / 0.45));
          bar.kept.setAttribute('width', String(bar.keptW * gone));
          bar.lost.setAttribute('x', String(PAD_X + bar.keptW * gone));
          bar.lost.setAttribute('width', String(bar.lostW * gone));
          bar.keptLabel.setAttribute('opacity', shown);
          bar.lostLabel.setAttribute('opacity', shown);
        }
      });
    }

    // ── 몸짓 다섯: 후보들이 줄줄이 선다 ──────────────────────────────────

    async function flowSpread(drawn: Drawn, mine: number): Promise<void> {
      const amb = drawn.amb;
      const guide = drawn.guide;
      if (amb === null || guide === null) return;

      for (const ring of drawn.rings) ring.setAttribute('r', '0');
      await tween(GUIDE_MS, mine, (p) => {
        const grow = easeOut(p);
        guide.setAttribute('x1', String(lerp(amb.fx, amb.ax, grow)));
        guide.setAttribute('y1', String(lerp(amb.fy, amb.ay, grow)));
        guide.setAttribute('x2', String(lerp(amb.fx, amb.bx, grow)));
        guide.setAttribute('y2', String(lerp(amb.fy, amb.by, grow)));
      });
      if (!alive(mine)) return;

      // 빈 고리 하나가 한쪽 끝에서 다른 쪽 끝으로 올라가며 자기 자국을 남긴다.
      const walker = el('circle', {
        cx: amb.ax,
        cy: amb.ay,
        r: R_GHOST,
        fill: 'none',
        stroke: c.itemActive,
        'stroke-width': 2,
      });
      gGuide.appendChild(walker);
      await tween(WANDER_MS, mine, (p) => {
        walker.setAttribute('cx', String(lerp(amb.ax, amb.bx, p)));
        walker.setAttribute('cy', String(lerp(amb.ay, amb.by, p)));
        drawn.rings.forEach((ring, i) => {
          ring.setAttribute('r', String(R_GHOST * clamp01((p - amb.stops[i].q) / 0.12)));
        });
      });
      // 걷는 이도 마지막 고리의 덜 자란 반지름도 마지막 `drawStatic` 이 거둔다.
    }

    // ── 몸짓 여섯: 후보들이 한 번 함께 부푼다 ────────────────────────────

    async function flowPulse(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.rings.length === 0) return;
      await tween(PULSE_MS, mine, (p) => {
        // 끝에서는 보간값이 아니라 상수를 쓴다 — `Math.sin(π)` 는 0 이 아니다 (함정 35).
        const swell = p >= 1 ? 0 : Math.sin(p * Math.PI);
        for (const ring of drawn.rings) {
          ring.setAttribute('r', String(R_GHOST * (1 + 0.4 * swell)));
        }
      });
    }

    function flowFor(
      step: ProjectAndLoseStep,
      scene: ProjectAndLoseScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'stand':
          return flowStand(drawn, mine);
        case 'drop':
          return flowDrop(scene, drawn, mine);
        case 'mark':
          return flowMark(scene, drawn, mine);
        case 'collapse':
          return flowCollapse(scene, drawn, mine);
        case 'spread':
          return flowSpread(drawn, mine);
        case 'pulse':
          return flowPulse(drawn, mine);
      }
    }

    async function render(
      next: ProjectAndLoseScene,
      _prev: ProjectAndLoseScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null || drawn === null) return;

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
        svg.textContent = '';
      },
    };
  },
};
