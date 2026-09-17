/**
 * 커널 트릭 조각 — stage view. 장면을 받아 화면 **전체** 를 세운다.
 *
 * 그림의 형태는 질문의 동사에서 나왔다. 동사는 **들어올린다** 이므로 이 화면의
 * 운동은 전부 자리가 바뀌는 것이다 — 칼이 줄 위를 미끄러지고, 줄이 바닥으로
 * 내려앉아 위를 열어 주고, 점이 제 기둥을 밀며 솟고, 곧은 선이 내려와 멈춘다.
 * 색만 바뀌는 것은 반평면 tint 하나뿐이고 그것은 운동이 아니라 판정이다.
 *
 * ── 세로 배치 (마운트 뒤 바뀌지 않는다 — S-view)
 *
 *   26        캡션
 *   66..188   칼 (1차원 세계에서 자르는 자리)
 *   152       줄            ← 들어올릴 때 258 로 내려앉는다
 *   198/218   묶음표와 그 안에 남은 이름표
 *   72..258   올린 뒤의 높이 축. 258 이 바닥, 72 가 가장 높이 오른 자리
 *
 * 위쪽이 처음에 비어 있는 것은 낭비가 아니라 사정이다. 아직 그 쪽이 없다.
 * 칼이 그 자리를 세로로 채우고 있다가 물러나면서 자리를 내준다.
 *
 * 가로는 줄 자체라 폭을 채운다. 칸 폭은 캔버스에서 역산하고 상수는 상한만 둔다.
 *
 * ── 장면 방식이라 달라진 것
 *
 * 걸음마다 부르는 메서드가 없다. `render` 하나가 그 장면이 말하는 것을 통째로
 * 세우고, 흐르게 할 것이 있으면 그 다음에 흘린다. 그래서 되돌릴 명령이 없다.
 *
 * **척도를 변수로 쥐지 않는다.** `xUnit` · `originX` · `minX` · `yUnit` · `worldDy` 가
 * `let` 으로 앉아 화면의 모든 좌표를 정하던 자리였는데, 지금은 `geomOf` 가 장면의
 * 점과 높이 눈금에서 매번 셈해 그 render 안에서만 산다 (S-piece).
 *
 * **운동의 출발값을 화면에서 되읽지 않는다.** 칼이 걸어오는 자리는 `step.from` 이
 * 말하고, 띠를 칠 자리는 `scene.cut` 에서 셈한다. 되짚어 세운 직후에는 화면이 옛
 * 걸음의 것이라 거기서 꺼내면 엉뚱한 자리에서 출발한다 (S-scene).
 *
 * **짚어 본 자리가 화면에 남는다.** 옛 그림은 묶음표 한 벌만 들고 다음 자리로 옮길
 * 때 걷어냈고, 칼이 물러나면서 마지막 것까지 지웠다. 그래서 "다 해 봤지만 전부
 * 실패했다" 는 논증이 완주 화면에서 사라졌다. 지금은 짚어 본 자리마다 옅은 점선
 * 표식이 남아 줄과 함께 바닥으로 내려앉는다 — 위에서 성공한 곧은 선과 견줄 짝이다.
 *
 * **어휘를 가른다.** 채움은 *값의 형편*(이름표의 색 · 위아래 반평면), 테두리와
 * 점선은 *짚음의 표식*(짚어 본 자름 자리 · 지금 걸린 칼 · 묶음표 · 오르는 무리의
 * 고리)이다. 그래서 실패한 칼금과 성공한 곧은 선이 한 화면에 서도 부딪히지 않는다.
 *
 * 화면의 문자는 두 갈래다. 눈금 수 · 높이 표식(`x²`)은 수식 표기라 번역 대상이
 * 아니고, 캡션만 `params.t` 를 지난다 (C10).
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
  cutAt,
  cutCountOf,
  labelsOf,
  lastRiseOf,
  liftedHeightOf,
  sidesOf,
  splitOf,
  type KernelLiftsScene,
  type KernelStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-view). */
const H = 304;
const W = PIECE_CANVAS_W;

const CAPTION_Y = 26;
const LINE_Y = 152;
/** 줄이 바닥으로 내려앉는 거리. 그만큼이 위쪽으로 열린다. */
const FLOOR_DY = 106;
const FLOOR_Y = LINE_Y + FLOOR_DY;
/** 가장 높이 오른 것이 앉는 자리. */
const TOP_Y = 72;
const TICK_DY = 24;
const BRACKET_DY = 46;
const BRACKET_LABEL_DY = 66;
const KNIFE_TOP = 66;
const KNIFE_DOWN = 36;
/** 칼이 내려올 때 물려 두는 만큼. 물러날 때는 그만큼 위로 빠진다. */
const KNIFE_RISE = 16;
const KNIFE_FALL = 22;
/** 짚어 본 자리의 표식이 줄을 가로지르는 길이의 반. */
const TRIED_HALF = 20;
const AXIS_X = 30;
const AXIS_TOP = 64;
const AXIS_TICK_HALF = 4;
const DOT_R = 12;
const DROP_IN = 20;
const X_UNIT_MAX = 84;
const SIDE_MIN = 56;
const RIGHT_PAD = 14;
const CUT_W = 2;
const CUT_SWELL = 2;
const CUT_MARK_DY = 7;
/** 반평면 tint 와 기둥의 옅기. 색은 토큰에서 오고 여기서 알파만 얹는다. */
const BAND_ALPHA = 0.14;
const STEM_ALPHA = 0.4;

/** 걸음의 운동. `stepMs` 는 이 위에 더해진다 (S-piece). */
const LINE_MS = 460;
const KNIFE_MS = 250;
const BRACKET_MS = 120;
const WITHDRAW_MS = 280;
const OPEN_MS = 460;
const AXIS_MS = 200;
const RISE_MS = 480;
const CURVE_MS = 540;
const PLACE_MS = 540;
const BAND_MS = 380;
const SETTLE_MS = 400;
/** 보간 한 마디의 길이. */
const FRAME_MS = 16;

/** 높이 축에 새기는 표식. 수식 표기라 번역하지 않는다 (C10). */
const HEIGHT_AXIS_MARK = 'x²';
/** 음수 부호는 하이픈이 아니라 수학 기호로 새긴다. */
const MINUS = '−';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number =>
  p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 표식으로 새기는 수 — 2.5 는 2.5 로, 9 는 9 로. */
function mark(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded).replace('-', MINUS);
}

/** 점들의 꼭대기를 지나는 매끄러운 길 (Catmull-Rom → 3차 베지에). */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i + 2 < pts.length ? pts[i + 2] : p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/** 길이의 어림 — `getTotalLength` 없이 대시 애니메이션의 눈금을 잡는다. */
function chordLength(pts: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len * 1.06;
}

/**
 * 토큰 색을 옅게 깐다. 색 리터럴이 아니라 순수 변환이라 view 에 두어도 된다
 * (S-view 의 예외 — 들어오는 hex 는 언제나 토큰에서 온다).
 */
function hexToRgba(hex: string, alpha: number): string {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 화면의 척도. **장면에서 매번 셈한다** — stage 가 변수로 쥐면 그것이 곧 숨은
 * 상태이고 되짚은 화면이 옛 척도로 선다.
 */
type Geom = {
  minX: number;
  spanX: number;
  xUnit: number;
  originX: number;
  /** 높이 1 이 몇 픽셀인가. 위가 아직 안 열렸으면 0. */
  yUnit: number;
  /** 줄이 내려앉은 거리. 위가 열렸으면 `FLOOR_DY`. */
  worldDy: number;
};

/** 정적 그리기가 세운 점 하나. `render` 안에서만 살고 밖으로 새지 않는다. */
type DrawnNode = {
  x: number;
  /** 지금 선 화면 자리 (gWorld 안 좌표). */
  cx: number;
  cy: number;
  dot: SVGGElement;
  /** 오른 만큼의 기둥. 아직 안 올랐으면 없다 — 길이 0 짜리 선은 점이 된다. */
  stem: SVGLineElement | null;
};

/** 내려온 곧은 선 한 벌. */
type DrawnCut = { line: SVGLineElement; mark: SVGTextElement };

/** 정적 그리기가 세워 둔 손잡이. */
type Drawn = {
  geom: Geom | null;
  nodes: DrawnNode[];
  knife: SVGLineElement | null;
  brackets: SVGGElement | null;
  curve: SVGPathElement | null;
  cut: DrawnCut | null;
  bands: SVGRectElement[];
};

export const kernelLiftsStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<KernelLiftsScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const rightEdge = W - RIGHT_PAD;

    // ── 화면의 층. 뒤에서 앞으로.
    const gBands = el('g', {});
    const gAxis = el('g', {});
    const gCurve = el('g', {});
    const gCutLine = el('g', {});
    const gKnife = el('g', {});
    /** 한 줄 세계. 위가 열리면 통째로 바닥으로 내려앉는다. */
    const gWorld = el('g', {});
    const layers = [gBands, gAxis, gCurve, gCutLine, gKnife, gWorld];
    for (const g of layers) svg.appendChild(g);

    // 재건 밖에 있는 하나. 자리는 고정이고 글자만 정적 그리기가 매번 다시 쓴다.
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.text,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    svg.appendChild(caption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다. `destroy` 가 그 가운데 오면 남은 마디가
     * **살아 있는 층**에 그림을 덧붙이므로, 마디마다 자기 번호가 아직 유효한지 보고
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

    function geomOf(scene: KernelLiftsScene): Geom | null {
      if (scene.points.length === 0) return null;
      const xs = scene.points.map((p) => p.x);
      const minX = Math.min(...xs);
      const spanX = Math.max(...xs) - minX;
      const xUnit =
        spanX > 0
          ? Math.min(X_UNIT_MAX, Math.floor((W - SIDE_MIN * 2) / spanX))
          : X_UNIT_MAX;
      const heights = scene.heights;
      const top = heights === null || heights.length === 0 ? 0 : Math.max(...heights);
      return {
        minX,
        spanX,
        xUnit,
        originX: Math.round((W - xUnit * spanX) / 2),
        yUnit: heights !== null && top > 0 ? (FLOOR_Y - TOP_Y) / top : 0,
        worldDy: heights !== null ? FLOOR_DY : 0,
      };
    }

    const px = (g: Geom, x: number): number => g.originX + (x - g.minX) * g.xUnit;
    /** 높이 h 의 자리 — gWorld **안**. 줄이 내려앉은 만큼은 층의 transform 이 얹는다. */
    const worldY = (g: Geom, h: number): number => LINE_Y - h * g.yUnit;
    /** 높이 h 의 자리 — gWorld **밖**. 축 · 곧은 선 · 반평면이 쓴다. */
    const py = (g: Geom, h: number): number => FLOOR_Y - h * g.yUnit;

    /** 이름표마다의 색. **바탕 점에서 한 번에 센다** — 드러난 수로 잡으면 갈린다. */
    function tonesOf(scene: KernelLiftsScene): Map<string, string> {
      const labels = labelsOf(scene);
      const tones = categorical(Math.max(2, labels.length), 'vivid');
      return new Map(labels.map((name, i) => [name, tones[i % tones.length]]));
    }

    /** 점들이 앉은 꼭대기 — 곡선이 지나는 자리. gWorld 밖 좌표다. */
    function tipsOf(
      scene: KernelLiftsScene,
      g: Geom,
    ): Array<{ x: number; y: number }> {
      return scene.points.map((p) => ({
        x: px(g, p.x),
        y: py(g, liftedHeightOf(scene, p.x)),
      }));
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    function clearLayer(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function drawBaseLine(scene: KernelLiftsScene, g: Geom): void {
      gWorld.appendChild(
        el('line', {
          x1: px(g, g.minX) - DOT_R - 14,
          y1: LINE_Y,
          x2: px(g, g.minX + g.spanX) + DOT_R + 14,
          y2: LINE_Y,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
      for (const p of scene.points) {
        const tick = el('text', {
          x: px(g, p.x),
          y: LINE_Y + TICK_DY,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        tick.textContent = mark(p.x);
        gWorld.appendChild(tick);
      }
    }

    /**
     * 짚어 본 자름 자리의 표식.
     *
     * **이 조각의 논증이 여기 남는다** — 한 줄 위에서 어디를 잘라도 안 됐다는 것이
     * 완주 화면까지 따라와야 들어올린 뒤의 성공과 견줄 짝이 된다. 지금 걸린 칼은
     * 따로 그리므로 그 자리는 건너뛴다. 섞인 쪽을 남긴 자리는 danger 로 말한다 —
     * 걸음이 실어 온 판정이 아니라 점과 그 자리에서 센 것이다.
     */
    function drawTriedMarks(scene: KernelLiftsScene, g: Geom, knifeAt: number | null): void {
      for (let i = 0; i < scene.tried; i += 1) {
        const cut = cutAt(scene, i);
        if (cut === null || cut === knifeAt) continue;
        const sides = sidesOf(scene, cut);
        const failed = sides.leftMixed || sides.rightMixed;
        gWorld.appendChild(
          el('line', {
            x1: px(g, cut),
            y1: LINE_Y - TRIED_HALF,
            x2: px(g, cut),
            y2: LINE_Y + TRIED_HALF,
            stroke: failed ? c.danger : c.ghostOutline,
            'stroke-width': 1.4,
            'stroke-dasharray': '3 4',
            'stroke-opacity': 0.5,
          }),
        );
      }
    }

    /** 점과 그 기둥, 그리고 방금 오른 무리의 고리. */
    function drawNodes(
      scene: KernelLiftsScene,
      g: Geom,
      tones: Map<string, string>,
    ): DrawnNode[] {
      const heights = scene.points.map((p) => liftedHeightOf(scene, p.x));

      // 기둥을 먼저 다 세우고 그 다음에 점을 얹는다 — 점이 가려지지 않게.
      const stems = scene.points.map((p, i) => {
        if (heights[i] <= 0) return null;
        const stem = el('line', {
          x1: px(g, p.x),
          y1: LINE_Y,
          x2: px(g, p.x),
          y2: worldY(g, heights[i]),
          stroke: hexToRgba(tones.get(p.label) ?? c.border, STEM_ALPHA),
          'stroke-width': 4,
          'stroke-linecap': 'round',
        });
        gWorld.appendChild(stem);
        return stem;
      });

      const rise = lastRiseOf(scene);
      return scene.points.map((p, i) => {
        const cx = px(g, p.x);
        const cy = worldY(g, heights[i]);
        const dot = el('g', { transform: `translate(${cx}, ${cy})` });
        // 고리는 짚음의 표식이라 테두리만 있다 (채움 = 값의 형편).
        if (rise !== null && rise.xs.includes(p.x)) {
          dot.appendChild(
            el('circle', {
              cx: 0,
              cy: 0,
              r: DOT_R + 5,
              fill: 'none',
              stroke: c.accent,
              'stroke-width': 2.5,
              opacity: 0.9,
            }),
          );
        }
        dot.appendChild(
          el('circle', {
            cx: 0,
            cy: 0,
            r: DOT_R,
            fill: tones.get(p.label) ?? c.itemDefault,
            stroke: c.stateInk,
            'stroke-width': 1,
          }),
        );
        const glyph = el('text', {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          fill: c.stateInk,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': 600,
        });
        glyph.textContent = p.label;
        dot.appendChild(glyph);
        gWorld.appendChild(dot);
        return { x: p.x, cx, cy, dot, stem: stems[i] };
      });
    }

    /** 지금 걸린 칼. 점선이라 짚는 중임을 말한다. */
    function makeKnife(g: Geom, cut: number): SVGLineElement {
      const x = px(g, cut);
      const knife = el('line', {
        x1: x,
        y1: KNIFE_TOP,
        x2: x,
        y2: LINE_Y + KNIFE_DOWN,
        stroke: c.text,
        'stroke-width': 2,
        'stroke-dasharray': '6 5',
      });
      gKnife.appendChild(knife);
      return knife;
    }

    /** 묶음표 — 양쪽에 무엇이 남았는지. 섞인 쪽은 danger 로 말한다. */
    function makeBrackets(
      scene: KernelLiftsScene,
      g: Geom,
      cut: number,
    ): SVGGElement | null {
      if (scene.points.length === 0) return null;
      const sides = sidesOf(scene, cut);
      const cutX = px(g, cut);
      const specs: Array<{ labels: string[]; mixed: boolean; from: number; to: number }> = [
        {
          labels: sides.left,
          mixed: sides.leftMixed,
          from: px(g, g.minX) - DOT_R,
          to: cutX - 10,
        },
        {
          labels: sides.right,
          mixed: sides.rightMixed,
          from: cutX + 10,
          to: px(g, g.minX + g.spanX) + DOT_R,
        },
      ];
      const brackets = el('g', {});
      for (const side of specs) {
        if (side.labels.length === 0) continue;
        const tone = side.mixed ? c.danger : c.textMuted;
        const y = LINE_Y + BRACKET_DY;
        brackets.appendChild(
          el('path', {
            d: `M ${side.from} ${y - 7} L ${side.from} ${y} L ${side.to} ${y} L ${side.to} ${y - 7}`,
            fill: 'none',
            stroke: tone,
            'stroke-width': side.mixed ? 2 : 1,
          }),
        );
        const census = el('text', {
          x: (side.from + side.to) / 2,
          y: LINE_Y + BRACKET_LABEL_DY,
          'text-anchor': 'middle',
          fill: tone,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': side.mixed ? 600 : 400,
        });
        census.textContent = side.labels.join(' ');
        brackets.appendChild(census);
      }
      gKnife.appendChild(brackets);
      return brackets;
    }

    /** 높이 축. 위가 열린 뒤에만 있다. */
    function drawAxis(scene: KernelLiftsScene, g: Geom): void {
      const heights = scene.heights;
      if (heights === null) return;
      gAxis.appendChild(
        el('line', {
          x1: AXIS_X,
          y1: FLOOR_Y,
          x2: AXIS_X,
          y2: AXIS_TOP,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-linecap': 'round',
        }),
      );
      for (const h of heights) {
        gAxis.appendChild(
          el('line', {
            x1: AXIS_X - AXIS_TICK_HALF,
            y1: py(g, h),
            x2: AXIS_X + AXIS_TICK_HALF,
            y2: py(g, h),
            stroke: c.border,
            'stroke-width': 1.5,
          }),
        );
        const num = el('text', {
          x: AXIS_X - 9,
          y: py(g, h) + 4,
          'text-anchor': 'end',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        });
        num.textContent = mark(h);
        gAxis.appendChild(num);
      }
      const axisMark = el('text', {
        x: AXIS_X,
        y: AXIS_TOP - 10,
        'text-anchor': 'middle',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      axisMark.textContent = HEIGHT_AXIS_MARK;
      gAxis.appendChild(axisMark);
    }

    /** 앉은 자리를 잇는 길. 평평하지 않다는 것이 이 선의 말이다. */
    function drawCurve(scene: KernelLiftsScene, g: Geom): SVGPathElement {
      const path = el('path', {
        d: smoothPath(tipsOf(scene, g)),
        fill: 'none',
        stroke: c.textMuted,
        'stroke-width': 1.5,
        'stroke-linecap': 'round',
      });
      gCurve.appendChild(path);
      return path;
    }

    /** 내려온 곧은 선과 그 높이. 성공한 자름이라 점선이 아니다. */
    function makeCutLine(g: Geom, height: number): DrawnCut {
      const y = py(g, height);
      const line = el('line', {
        x1: AXIS_X,
        y1: y,
        x2: rightEdge,
        y2: y,
        stroke: c.text,
        'stroke-width': CUT_W,
        'stroke-linecap': 'round',
      });
      const label = el('text', {
        x: rightEdge,
        y: y - CUT_MARK_DY,
        'text-anchor': 'end',
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
      });
      label.textContent = mark(height);
      gCutLine.append(line, label);
      return { line, mark: label };
    }

    /** 위아래 반평면. 채움이라 *값의 형편* 을 말한다 — 어느 이름표의 자리인가. */
    function drawBands(
      scene: KernelLiftsScene,
      g: Geom,
      tones: Map<string, string>,
    ): SVGRectElement[] {
      const split = splitOf(scene);
      if (split === null || scene.cut === null) return [];
      const y = py(g, scene.cut);
      const below = el('rect', {
        x: AXIS_X,
        y,
        width: rightEdge - AXIS_X,
        height: Math.max(0, FLOOR_Y + DOT_R + 6 - y),
        fill: hexToRgba(tones.get(split.below) ?? c.border, BAND_ALPHA),
      });
      const above = el('rect', {
        x: AXIS_X,
        y: AXIS_TOP - 8,
        width: rightEdge - AXIS_X,
        height: Math.max(0, y - (AXIS_TOP - 8)),
        fill: hexToRgba(tones.get(split.above) ?? c.border, BAND_ALPHA),
      });
      gBands.append(below, above);
      return [below, above];
    }

    /**
     * 캡션. 무엇을 말할지는 `step` 이 정하고 인자는 장면에서 센다 — 화면의 칼금과
     * 같은 함수를 지나므로 둘이 어긋날 자리가 없다 (C10).
     */
    function captionText(scene: KernelLiftsScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'line':
          return t('caption.line', 'They all sit on one line — A in the middle, B outside.');
        case 'cut':
          return t('caption.cut', 'Cut here — one side still holds both. ({k}/{n})', {
            k: scene.tried,
            n: cutCountOf(scene),
          });
        case 'exhausted':
          return t('caption.noCut', 'Every cut on the line has been tried. None works.');
        case 'open':
          return t('caption.open', 'So open a direction that was not there — up.');
        case 'raise': {
          const rise = scene.risen[scene.risen.length - 1];
          return t('caption.rise', 'Each rises by its own value squared — height {h}.', {
            h: mark(rise === undefined ? 0 : rise.height),
          });
        }
        case 'curve':
          return t('caption.curve', 'Where they landed is not flat. It curves.');
        case 'place':
          return t('caption.place', 'Now one straight line comes down — height {h}.', {
            h: mark(scene.cut ?? 0),
          });
        case 'verify': {
          // 위아래 이름표는 오른 높이에서 센다. 갈리지 않는 자료면 이름표 순서로
          // 떨어지지만 algorithm 이 그 경우에 던지므로 화면에 오지 않는다.
          const split = splitOf(scene);
          const labels = labelsOf(scene);
          return t('caption.verify', 'All {below} below, all {above} above — nothing mixed.', {
            below: split?.below ?? labels[0] ?? '',
            above: split?.above ?? labels[1] ?? '',
          });
        }
        case 'done':
          return t('caption.done', 'It was never unsplittable. The room was too small.');
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않는다 (S-scene). */
    function drawStatic(scene: KernelLiftsScene): Drawn {
      for (const g of layers) clearLayer(g);
      // 자식을 비워도 레이어 자신의 속성은 남는다. 운동이 얹은 것을 여기서 거둔다.
      gAxis.removeAttribute('opacity');
      caption.textContent = captionText(scene);

      const geom = geomOf(scene);
      gWorld.setAttribute('transform', `translate(0, ${geom === null ? 0 : geom.worldDy})`);
      if (geom === null) {
        return { geom: null, nodes: [], knife: null, brackets: null, curve: null, cut: null, bands: [] };
      }

      const tones = tonesOf(scene);
      const knifeAt = scene.exhausted ? null : cutAt(scene, scene.tried - 1);

      drawBaseLine(scene, geom);
      drawTriedMarks(scene, geom, knifeAt);
      const nodes = scene.shown ? drawNodes(scene, geom, tones) : [];
      const knife = knifeAt === null ? null : makeKnife(geom, knifeAt);
      const brackets = knifeAt === null ? null : makeBrackets(scene, geom, knifeAt);
      drawAxis(scene, geom);
      const curve = scene.curve ? drawCurve(scene, geom) : null;
      const cut = scene.cut === null ? null : makeCutLine(geom, scene.cut);
      const bands = scene.split ? drawBands(scene, geom, tones) : [];
      return { geom, nodes, knife, brackets, curve, cut, bands };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /** 점 하나를 그 높이에 세운다. 정적 그리기와 같은 셈을 쓴다. */
    function placeNode(g: Geom, node: DrawnNode, h: number): void {
      const y = worldY(g, h);
      node.dot.setAttribute('transform', `translate(${node.cx}, ${y})`);
      node.stem?.setAttribute('y2', String(y));
    }

    /** 점들이 위에서 내려앉으며 줄 위에 선다. 차례로 조금씩 늦게. */
    function flowLine(drawn: Drawn, mine: number): Promise<void> {
      const nodes = drawn.nodes;
      if (nodes.length === 0) return Promise.resolve();
      return tween(LINE_MS, mine, (p) => {
        const e = easeOut(p);
        nodes.forEach((node, i) => {
          const start = Math.min(0.5, i * 0.08);
          const q = clamp01((e - start) / 0.5);
          node.dot.setAttribute('opacity', String(q));
          node.dot.setAttribute(
            'transform',
            `translate(${node.cx}, ${node.cy - DROP_IN * (1 - q)})`,
          );
        });
      });
    }

    /**
     * 칼이 그 자리에 선다. 첫 자리면 위에서 내려오고, 아니면 앞 자리에서 미끄러진다.
     *
     * 출발 자리는 `step.from` 이 말한다 — 칼의 `x1` 을 되읽으면 되짚은 직후에
     * 옛 화면의 자리에서 출발한다 (S-scene).
     */
    async function flowCut(
      scene: KernelLiftsScene,
      drawn: Drawn,
      step: { kind: 'cut'; from: number | null },
      mine: number,
    ): Promise<void> {
      const knife = drawn.knife;
      const geom = drawn.geom;
      if (knife === null || geom === null) return;
      const brackets = drawn.brackets;
      // 묶음표는 칼이 자리를 잡은 뒤에 걸린다.
      brackets?.setAttribute('opacity', '0');

      if (step.from === null) {
        knife.setAttribute('opacity', '0');
        await tween(KNIFE_MS, mine, (p) => {
          const e = easeOut(p);
          knife.setAttribute('opacity', String(e));
          knife.setAttribute('y1', String(KNIFE_TOP - KNIFE_RISE * (1 - e)));
          knife.setAttribute('y2', String(LINE_Y + KNIFE_DOWN - KNIFE_RISE * (1 - e)));
        });
      } else {
        const to = cutAt(scene, scene.tried - 1);
        if (to === null) return;
        const fromX = px(geom, step.from);
        const toX = px(geom, to);
        await tween(KNIFE_MS, mine, (p) => {
          const e = easeInOut(p);
          const x = String(fromX + (toX - fromX) * e);
          knife.setAttribute('x1', x);
          knife.setAttribute('x2', x);
        });
      }
      if (!alive(mine) || brackets === null) return;
      await tween(BRACKET_MS, mine, (p) => brackets.setAttribute('opacity', String(p)));
    }

    /**
     * 칼과 묶음표가 물러난다.
     *
     * 정적 그리기에는 둘이 없으므로 물러나는 모습만 잠깐 짓는다 — 지나가는 것이라
     * 멎은 화면에 남지 않는다. 짚어 본 표식은 그대로 남아 논증을 쥔다.
     */
    async function flowWithdraw(
      scene: KernelLiftsScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const geom = drawn.geom;
      const last = cutAt(scene, scene.tried - 1);
      if (geom === null || last === null) return;
      const knife = makeKnife(geom, last);
      const brackets = makeBrackets(scene, geom, last);
      await tween(WITHDRAW_MS, mine, (p) => {
        const e = easeOut(p);
        const fade = String(1 - e);
        knife.setAttribute('opacity', fade);
        knife.setAttribute('y1', String(KNIFE_TOP - KNIFE_FALL * e));
        knife.setAttribute('y2', String(LINE_Y + KNIFE_DOWN - KNIFE_FALL * e));
        brackets?.setAttribute('opacity', fade);
      });
      knife.remove();
      brackets?.remove();
    }

    /** 줄이 바닥으로 내려앉는다. 그 자리가 곧 위쪽이 열린 자리다. */
    async function flowOpen(mine: number): Promise<void> {
      gAxis.setAttribute('opacity', '0');
      gWorld.setAttribute('transform', 'translate(0, 0)');
      await tween(OPEN_MS, mine, (p) => {
        gWorld.setAttribute('transform', `translate(0, ${FLOOR_DY * easeOut(p)})`);
      });
      if (!alive(mine)) return;
      await tween(AXIS_MS, mine, (p) => gAxis.setAttribute('opacity', String(easeOut(p))));
    }

    /** 한 무리가 제 기둥을 밀며 함께 솟는다. 한 시계로 흐른다. */
    function flowRaise(scene: KernelLiftsScene, drawn: Drawn, mine: number): Promise<void> {
      const geom = drawn.geom;
      const rise = scene.risen[scene.risen.length - 1];
      if (geom === null || rise === undefined) return Promise.resolve();
      const group = drawn.nodes.filter((node) => rise.xs.includes(node.x));
      if (group.length === 0) return Promise.resolve();
      return tween(RISE_MS, mine, (p) => {
        const h = rise.height * easeOut(p);
        for (const node of group) placeNode(geom, node, h);
      });
    }

    /** 길이 왼쪽에서 오른쪽으로 그어진다. */
    async function flowCurve(
      scene: KernelLiftsScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const path = drawn.curve;
      const geom = drawn.geom;
      if (path === null || geom === null) return;
      const len = Math.max(1, chordLength(tipsOf(scene, geom)));
      path.setAttribute('stroke-dasharray', `${len} ${len}`);
      path.setAttribute('stroke-dashoffset', String(len));
      await tween(CURVE_MS, mine, (p) => {
        path.setAttribute('stroke-dashoffset', String(len * (1 - easeOut(p))));
      });
      // 되돌릴 값이 아니라 거둘 속성이다 — 끝 자리를 적어 두면 화면이 갈린다.
      path.removeAttribute('stroke-dasharray');
      path.removeAttribute('stroke-dashoffset');
    }

    /** 곧은 선이 위에서 내려와 그 높이에서 멈춘다. 수가 함께 내려온다. */
    function flowPlace(scene: KernelLiftsScene, drawn: Drawn, mine: number): Promise<void> {
      const geom = drawn.geom;
      const cut = drawn.cut;
      if (geom === null || cut === null || scene.cut === null) return Promise.resolve();
      const targetY = py(geom, scene.cut);
      return tween(PLACE_MS, mine, (p) => {
        const y = AXIS_TOP + (targetY - AXIS_TOP) * easeOut(p);
        cut.line.setAttribute('y1', String(y));
        cut.line.setAttribute('y2', String(y));
        cut.mark.setAttribute('y', String(y - CUT_MARK_DY));
      });
    }

    /** 위아래가 함께 물든다 — 한 판정이라 한 시계로 흐른다. */
    function flowVerify(drawn: Drawn, mine: number): Promise<void> {
      const bands = drawn.bands;
      if (bands.length === 0) return Promise.resolve();
      for (const band of bands) band.setAttribute('opacity', '0');
      return tween(BAND_MS, mine, (p) => {
        const v = String(easeOut(p));
        for (const band of bands) band.setAttribute('opacity', v);
      });
    }

    /**
     * 마지막으로 그 선을 한 번 두드린다.
     *
     * 삼각 맥으로 흐른다 — `Math.sin(Math.PI)` 는 0 이 아니라 1.2246e-16 이라
     * 끝자리가 흘러 흘려 세운 화면과 곧바로 세운 화면이 글자 하나 어긋난다.
     */
    function flowDone(drawn: Drawn, mine: number): Promise<void> {
      const cut = drawn.cut;
      if (cut === null) return Promise.resolve();
      return tween(SETTLE_MS, mine, (p) => {
        const swell = 1 - Math.abs(p * 2 - 1);
        cut.line.setAttribute('stroke-width', String(CUT_W + swell * CUT_SWELL));
      });
    }

    function flowFor(
      step: KernelStep,
      scene: KernelLiftsScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'line':
          return flowLine(drawn, mine);
        case 'cut':
          return flowCut(scene, drawn, step, mine);
        case 'exhausted':
          return flowWithdraw(scene, drawn, mine);
        case 'open':
          return flowOpen(mine);
        case 'raise':
          return flowRaise(scene, drawn, mine);
        case 'curve':
          return flowCurve(scene, drawn, mine);
        case 'place':
          return flowPlace(scene, drawn, mine);
        case 'verify':
          return flowVerify(drawn, mine);
        case 'done':
          return flowDone(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: KernelLiftsScene,
      _prev: KernelLiftsScene | null,
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
