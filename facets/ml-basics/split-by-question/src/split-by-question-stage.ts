/**
 * split-by-question stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 화면의 짜임
 *
 *   캡션
 *   두 땅        자름선이 가른 양쪽. 옅은 음영이다.
 *   두 레일      가로 · 세로. 자름선이 손잡이를 걸고 미끄러지는 자리.
 *   눈금         그 축에서 해 볼 자름 자리. 짚어 본 것은 굵어진다.
 *   유령 칼금    그어 보고 버린 자리. 점선이다.
 *   점 열        제 값 자리에 선다. 이름표 색으로 칠한다.
 *   자름선       지금 선 칼날 하나. 실선이다.
 *   저울 둘      양쪽에 담긴 이름표의 수와 비율.
 *
 * ── 어휘를 가른다 — 헛걸음과 살아 있는 자국
 *
 * 한 화면에 "그어 보고 버린 자리" 와 "끝내 고른 자리" 가 함께 선다. 같은 모양으로
 * 그리면 둘이 부딪히므로 축을 나눈다 (프로토콜 4 절).
 *
 * - **채움 · 칠 = 값의 형편** — 점의 이름표 색, 두 땅의 음영, 저울 칸의 비율,
 *   그리고 칼날의 칠(`risingMarker` 따지는 중 / `accent` 갈렸다).
 * - **테두리 · 점선 = 견줌 · 짚음의 표식** — 짚어 본 눈금은 굵어지고, 그어 보고
 *   버린 칼금은 **점선 유령**으로 남고, 다 써 버린 축의 레일도 **점선**이 된다.
 *   살아 있는 칼날만 실선이다.
 *
 * 옛 화면은 눈금의 `stroke` 하나에 짚음과 갈림 두 뜻을 실었다 (`pure ? accent :
 * risingMarker`). 그래서 "여기를 짚어 봤다" 와 "여기서 갈렸다" 가 같은 축에 겹쳐
 * 어느 쪽도 제대로 읽히지 않았다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 척도는 `let xMin`…`yMax` 에, 칼날의 지금 자리는 `let bladeState` 라는 **DOM 의
 * 거울**에, 어느 축에 섰나는 `Math.abs(angle) < 45` 라는 **각도 되읽기**에, 짚어
 * 본 자리는 눈금의 칠에, 해 본 자리의 수는 `ghostNodes.length` 에, 갈렸다는 사실은
 * `blade` 의 칠에 있었다. 지금은 `picked` · `tried` · `exhausted` · `done` 넷이
 * 말하고 좌표와 칠은 전부 거기서 파생되므로, 화면을 되읽을 자리가 없다.
 *
 * ── 좌표
 *
 * 전부 여기서 셈한다. 장면에는 점의 값과 자름 자리라는 구조만 있고 자리는 그림의
 * 몫이다 (S-piece). 척도(`domainOf`)도 바탕 자료에서 매번 새로 낸다 — 걸음이 실어
 * 온 것을 적어 두는 자리가 없다. 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지
 * 않고 세로만 여기 둔다. 색은 전부 design-tokens 경유다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { SideTally } from './algorithm.js';
import {
  captionOf,
  currentAxis,
  currentCut,
  cutsOn,
  ghostCuts,
  isPure,
  lastCutOn,
  previousCut,
  tallyAt,
  type SplitAxis,
  type SplitByQuestionScene,
  type SplitStep,
  type TriedCut,
} from './scene.js';

const NS = 'http://www.w3.org/2000/svg';

/** 세로 rail 과 눈금 글자가 들어갈 왼쪽 자리. */
const SIDE_L = 52;
const SIDE_R = 26;
const PLOT_T = 50;
const PLOT_H = 208;
/** 레일이 그림에서 떨어진 거리. */
const RAIL_GAP = 16;
const RAIL_Y_X = 30;
const TICK_LEN = 12;
const CANVAS_H = 300;

/** 저울의 최대 가로 — 점을 전부 담았을 때. 나머지는 캔버스에서 역산한다. */
const CHIP_MAX_W = 112;
const CHIP_BAR_H = 13;
/** 저울 한 덩이(막대 + 비율 글자)의 절반 높이. */
const CHIP_HALF_H = 13;
const CHIP_GAP = 14;
const CHIP_GAP_V = 13;

const POINT_R = 5;

/** 칼날의 굵기. 못 박은 뒤가 더 굵다. */
const BLADE_W = 3;
const BLADE_W_DONE = 4;
const KNOB_R = 5;
const KNOB_R_DONE = 6;

/** 유령 칼금 — 헛걸음의 표식. */
const GHOST_W = 1.5;
const GHOST_FADE_HERE = 0.55;
const GHOST_FADE_AWAY = 0.28;

/** 눈금 — 짚어 본 자리는 굵어진다. */
const TICK_W = 2;
const TICK_W_TRIED = 3;

/** 다 써 버린 축의 레일에 다는 표식. */
const SPENT_DASH = '3 5';
const GHOST_DASH = '4 5';

/**
 * 축을 가리키는 기호. 수식 표기라 번역하지 않는다 (C10 표식 판정 3).
 */
const AXIS_MARK = { x: 'x', y: 'y' } as const;

/**
 * 두 이름표의 식별 색을 뽑는 자리 (S-view 결정 트리 3 — categorical).
 * 이 시드를 다른 view 가 같은 뜻으로 재현할 일이 없으므로 인덱스는 view-local 이다.
 * 수를 **바탕 자료의 이름표 종류**(언제나 둘)에서 잡으므로 걸음이 늘어도 hue 가
 * 갈리지 않는다.
 */
const CLASS_LOW_INDEX = 0;
const CLASS_HIGH_INDEX = 1;

const MOVE_MS = 520;
const ROTATE_MS = 780;
const RAISE_MS = 380;
const SWEEP_MS = 760;
const LABEL_MS = 180;
const FRAME_MS = 16;

/** 값의 범위. 바탕 자료에서 매번 새로 낸다 — 적어 두는 자리가 없다. */
type Domain = { xMin: number; xMax: number; yMin: number; yMax: number };

/**
 * 자름선의 기하.
 *
 * 각도 0 은 세로로 선 것, -90 은 눕힌 것이다. 부호가 음인 것은 손잡이 때문이다 —
 * 방향벡터를 (sin, cos) 로 두면 0 에서 아래 끝, -90 에서 왼 끝이 **같은 끝**이라
 * 손잡이가 도는 내내 날에 붙어 있다. +90 으로 돌리면 손잡이가 반대 끝으로
 * 건너뛰어야 해서 중간에 날에서 떨어져 나간다.
 *
 * knobOut 은 날 끝에서 레일까지의 거리다.
 *
 * **상태가 아니다.** 장면이 말하는 축과 자름 자리에서 그때그때 셈해 낸 값이고,
 * 어디에도 적어 두지 않는다 — 옛 `let bladeState` 가 DOM 의 거울이던 자리다.
 */
type Blade = {
  cx: number;
  cy: number;
  angle: number;
  len: number;
  knobOut: number;
};

type Chip = {
  group: SVGGElement;
  partA: SVGRectElement;
  partB: SVGRectElement;
  frame: SVGRectElement;
  ratio: SVGTextElement;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  regionLow: SVGRectElement | null;
  regionHigh: SVGRectElement | null;
  ghosts: Array<{ cut: TriedCut; node: SVGLineElement }>;
  blade: SVGLineElement | null;
  knob: SVGCircleElement | null;
  chipLow: Chip | null;
  chipHigh: Chip | null;
};

const EMPTY_SIDE: SideTally = { a: 0, b: 0 };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

/**
 * 값의 범위. 점과 시도할 자름 자리를 전부 품고 조금 넉넉하게 잡는다.
 *
 * 옛 stage 는 이것을 `setup` 에서 한 번 셈해 `let` 넷에 적어 두었고 화면의 모든
 * 좌표가 거기서 나왔다. 지금은 바탕 자료를 받아 매번 낸다 — 같은 자료면 같은 값이다.
 */
function domainOf(scene: SplitByQuestionScene): Domain {
  const xs = [...scene.points.map((p) => p.x), ...scene.xCuts];
  const ys = [...scene.points.map((p) => p.y), ...scene.yCuts];
  const xLo = xs.length > 0 ? Math.min(...xs) : 0;
  const xHi = xs.length > 0 ? Math.max(...xs) : 1;
  const yLo = ys.length > 0 ? Math.min(...ys) : 0;
  const yHi = ys.length > 0 ? Math.max(...ys) : 1;
  const xPad = Math.max(0.4, (xHi - xLo) * 0.12);
  const yPad = Math.max(0.4, (yHi - yLo) * 0.12);
  return { xMin: xLo - xPad, xMax: xHi + xPad, yMin: yLo - yPad, yMax: yHi + yPad };
}

/** 축을 겹치지 않게 훑는 차례. `picked` 의 순서를 지킨다. */
function axesSeen(scene: SplitByQuestionScene): SplitAxis[] {
  const out: SplitAxis[] = [];
  for (const axis of scene.picked) if (!out.includes(axis)) out.push(axis);
  return out;
}

export const splitByQuestionStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SplitByQuestionScene> {
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const canvas = params.canvas;
    // 러너가 붙여 준 캔버스는 그대로 두고 **안쪽만** 비운다 (S-view).
    canvas.textContent = '';

    const classPalette = categorical(2, 'vivid');
    const colorLow = classPalette[CLASS_LOW_INDEX] ?? c.itemDefault;
    const colorHigh = classPalette[CLASS_HIGH_INDEX] ?? c.itemDefault;

    const W = PIECE_CANVAS_W;
    const plotL = SIDE_L;
    const plotR = W - SIDE_R;
    const plotW = plotR - plotL;
    const plotB = PLOT_T + PLOT_H;
    const railXY = plotB + RAIL_GAP;
    const midX = (plotL + plotR) / 2;
    const midY = PLOT_T + PLOT_H / 2;

    // ── 층. 그리는 순서가 곧 겹치는 순서다. 걸음마다 통째로 다시 세운다.
    const gRegions = el('g', {});
    const gRails = el('g', {});
    const gGhosts = el('g', {});
    const gPoints = el('g', {});
    const gBlade = el('g', {});
    const gChips = el('g', {});
    const gCaption = el('g', {});
    const layers = [gRegions, gRails, gGhosts, gPoints, gBlade, gChips, gCaption];
    for (const g of layers) canvas.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 걸음 하나가 타이머를 여러 번 지난다. 가운데에 되짚기나 `destroy` 가 끼어들면
     * 남은 프레임이 **이미 새로 선 화면**을 덮을 수 있으므로, 마디마다 자기 번호가
     * 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면
     * 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 운동은 `setTimeout` 으로 흐른다. rAF 가 아닌 까닭은 검사 때문이다 — 프레임이
     * 돌지 않는 환경에서는 "흘려 세운 화면" 과 "곧바로 세운 화면" 이 같아지는 것이
     * 당연해져 검사가 이빨을 잃는다.
     */
    function tween(
      duration: number,
      eased: boolean,
      mine: number,
      draw: (e: number) => void,
    ): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : Math.min(1, (Date.now() - started) / duration);
          draw(eased ? easeInOut(p) : p);
          if (p >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 좌표 ──────────────────────────────────────────────────────────────

    const xPix = (d: Domain, v: number): number =>
      plotL + ((v - d.xMin) / (d.xMax - d.xMin)) * plotW;
    const yPix = (d: Domain, v: number): number =>
      plotB - ((v - d.yMin) / (d.yMax - d.yMin)) * PLOT_H;

    /** 그 축의 집 자리 — 아직 아무 데도 긋지 않았을 때 칼날이 서는 곳. */
    function bladeHome(d: Domain, axis: SplitAxis): Blade {
      return axis === 'x' ? bladeAt(d, 'x', d.xMin) : bladeAt(d, 'y', d.yMax);
    }

    function bladeAt(d: Domain, axis: SplitAxis, value: number): Blade {
      if (axis === 'x') {
        return { cx: xPix(d, value), cy: midY, angle: 0, len: PLOT_H, knobOut: RAIL_GAP };
      }
      return { cx: midX, cy: yPix(d, value), angle: -90, len: plotW, knobOut: plotL - RAIL_Y_X };
    }

    /** 그 칼금 위의 칼날. 칼금이 없으면 집 자리다. */
    function bladeFor(d: Domain, axis: SplitAxis, cut: TriedCut | null): Blade {
      return cut === null ? bladeHome(d, axis) : bladeAt(d, cut.axis, cut.threshold);
    }

    /**
     * 그림 안에 담기는 반길이. 도는 동안 날이 그림 밖으로 삐져나가 캡션까지
     * 가로지르는 것을 막는다. 눕거나 선 상태에서는 원래 길이 그대로다.
     */
    function fitHalf(cx: number, cy: number, dx: number, dy: number, halfMax: number): number {
      let half = halfMax;
      const limit = (pos: number, comp: number, lo: number, hi: number): void => {
        if (Math.abs(comp) < 1e-6) return;
        half = Math.min(half, Math.abs(((comp > 0 ? hi : lo) - pos) / comp));
        half = Math.min(half, Math.abs(((comp > 0 ? lo : hi) - pos) / comp));
      };
      limit(cx, dx, plotL, plotR);
      limit(cy, dy, PLOT_T, plotB);
      return Math.max(0, half);
    }

    /** 날의 두 끝과 손잡이 자리. 각도에서 곧바로 나오는 기하다. */
    function edgeOf(blade: Blade): {
      dx: number;
      dy: number;
      half: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      kx: number;
      ky: number;
    } {
      const rad = (blade.angle * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = Math.cos(rad);
      const half = fitHalf(blade.cx, blade.cy, dx, dy, blade.len / 2);
      return {
        dx,
        dy,
        half,
        x1: blade.cx - dx * half,
        y1: blade.cy - dy * half,
        x2: blade.cx + dx * half,
        y2: blade.cy + dy * half,
        kx: blade.cx + dx * (half + blade.knobOut),
        ky: blade.cy + dy * (half + blade.knobOut),
      };
    }

    /** 날이 눕고 있는가. 장면이 아니라 **날 자신의 각도**가 정한다. */
    function lyingFlat(blade: Blade): boolean {
      return Math.abs(blade.angle) >= 45;
    }

    // ── 칠하기. 정적 그리기와 운동이 함께 쓴다 ────────────────────────────

    function paintBlade(drawn: Drawn, blade: Blade, regions: boolean): void {
      const e = edgeOf(blade);
      if (drawn.blade !== null) {
        drawn.blade.setAttribute('x1', String(e.x1));
        drawn.blade.setAttribute('y1', String(e.y1));
        drawn.blade.setAttribute('x2', String(e.x2));
        drawn.blade.setAttribute('y2', String(e.y2));
      }
      if (drawn.knob !== null) {
        drawn.knob.setAttribute('cx', String(e.kx));
        drawn.knob.setAttribute('cy', String(e.ky));
      }
      const low = drawn.regionLow;
      const high = drawn.regionHigh;
      if (low === null || high === null) return;
      if (!regions) {
        low.setAttribute('width', '0');
        high.setAttribute('width', '0');
        return;
      }
      if (!lyingFlat(blade)) {
        low.setAttribute('x', String(plotL));
        low.setAttribute('y', String(PLOT_T));
        low.setAttribute('width', String(Math.max(0, blade.cx - plotL)));
        low.setAttribute('height', String(PLOT_H));
        high.setAttribute('x', String(blade.cx));
        high.setAttribute('y', String(PLOT_T));
        high.setAttribute('width', String(Math.max(0, plotR - blade.cx)));
        high.setAttribute('height', String(PLOT_H));
        return;
      }
      low.setAttribute('x', String(plotL));
      low.setAttribute('y', String(blade.cy));
      low.setAttribute('width', String(plotW));
      low.setAttribute('height', String(Math.max(0, plotB - blade.cy)));
      high.setAttribute('x', String(plotL));
      high.setAttribute('y', String(PLOT_T));
      high.setAttribute('width', String(plotW));
      high.setAttribute('height', String(Math.max(0, blade.cy - PLOT_T)));
    }

    function chipWidth(count: number, total: number): number {
      return (count / (total > 0 ? total : 1)) * CHIP_MAX_W;
    }

    /** 저울 하나를 칼날 곁에 매단다. 폭은 담긴 수, 나뉜 자리는 이름표 비율이다. */
    function paintChip(
      chip: Chip | null,
      blade: Blade,
      side: SideTally,
      which: 'low' | 'high',
      total: number,
    ): void {
      if (chip === null) return;
      const count = side.a + side.b;
      if (count <= 0.02) {
        chip.group.setAttribute('opacity', '0');
        return;
      }
      chip.group.setAttribute('opacity', '1');
      const barW = chipWidth(count, total);
      let cx: number;
      let cy: number;
      if (!lyingFlat(blade)) {
        const dir = which === 'low' ? -1 : 1;
        cx = clamp(blade.cx + dir * (CHIP_GAP + barW / 2), plotL + barW / 2 + 2, plotR - barW / 2 - 2);
        cy = midY;
      } else {
        // 눕힌 자름선에서는 low 가 아래쪽 — 화면 좌표로는 cy 가 큰 쪽이다.
        const dir = which === 'low' ? 1 : -1;
        cx = midX;
        cy = clamp(
          blade.cy + dir * (CHIP_GAP_V + CHIP_HALF_H),
          PLOT_T + CHIP_HALF_H + 2,
          plotB - CHIP_HALF_H + 4,
        );
      }
      const left = cx - barW / 2;
      const top = cy - CHIP_HALF_H;
      const aW = (side.a / count) * barW;
      chip.partA.setAttribute('x', String(left));
      chip.partA.setAttribute('y', String(top));
      chip.partA.setAttribute('width', String(Math.max(0, aW)));
      chip.partB.setAttribute('x', String(left + aW));
      chip.partB.setAttribute('y', String(top));
      chip.partB.setAttribute('width', String(Math.max(0, barW - aW)));
      chip.frame.setAttribute('x', String(left));
      chip.frame.setAttribute('y', String(top));
      chip.frame.setAttribute('width', String(Math.max(0, barW)));
      chip.ratio.setAttribute('x', String(cx));
      chip.ratio.setAttribute('y', String(cy + 11));
    }

    function paintChips(
      drawn: Drawn,
      blade: Blade,
      low: SideTally,
      high: SideTally,
      total: number,
    ): void {
      paintChip(drawn.chipLow, blade, low, 'low', total);
      paintChip(drawn.chipHigh, blade, high, 'high', total);
    }

    function setRatioOpacity(drawn: Drawn, value: string): void {
      drawn.chipLow?.ratio.setAttribute('opacity', value);
      drawn.chipHigh?.ratio.setAttribute('opacity', value);
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    function makeChip(): Chip {
      const group = el('g', { opacity: 0 });
      const partA = el('rect', { x: 0, y: 0, width: 0, height: CHIP_BAR_H, fill: colorLow });
      const partB = el('rect', { x: 0, y: 0, width: 0, height: CHIP_BAR_H, fill: colorHigh });
      const frame = el('rect', {
        x: 0, y: 0, width: 0, height: CHIP_BAR_H, rx: 2,
        fill: 'none', stroke: c.border, 'stroke-width': 1,
      });
      const ratio = el('text', {
        x: 0, y: 0, 'text-anchor': 'middle',
        fill: c.textMuted, 'font-family': fonts.mono, 'font-size': fontSizes.xs,
      });
      group.append(partA, partB, frame, ratio);
      gChips.appendChild(group);
      return { group, partA, partB, frame, ratio };
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: SplitByQuestionScene): Drawn {
      rewind();
      const d = domainOf(scene);
      const axis = currentAxis(scene);
      const cut = currentCut(scene);
      const pure = cut !== null && isPure(scene, cut);
      const drawn: Drawn = {
        regionLow: null,
        regionHigh: null,
        ghosts: [],
        blade: null,
        knob: null,
        chipLow: null,
        chipHigh: null,
      };

      // ── 두 땅. 칼날이 서야 갈린다.
      if (axis !== null) {
        drawn.regionLow = el('rect', {
          x: plotL, y: PLOT_T, width: 0, height: PLOT_H, fill: c.subtreeShadeLeft,
        });
        drawn.regionHigh = el('rect', {
          x: plotL, y: PLOT_T, width: 0, height: PLOT_H, fill: c.subtreeShadeRight,
        });
        gRegions.append(drawn.regionLow, drawn.regionHigh);
      }

      // ── 레일 둘. 다 써 버린 축은 점선이 된다 (버림의 표식).
      for (const rail of ['x', 'y'] as const) {
        const live = axis === rail;
        const spent = scene.exhausted.includes(rail);
        const attrs: Record<string, string | number> =
          rail === 'x'
            ? { x1: plotL, y1: railXY, x2: plotR, y2: railXY }
            : { x1: RAIL_Y_X, y1: PLOT_T, x2: RAIL_Y_X, y2: plotB };
        const line = el('line', {
          ...attrs,
          stroke: live ? (scene.done ? c.accent : c.risingMarker) : c.border,
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        if (spent && !live) line.setAttribute('stroke-dasharray', SPENT_DASH);
        const mark =
          rail === 'x'
            ? el('text', { x: plotR + 10, y: railXY + 4, 'text-anchor': 'middle' })
            : el('text', { x: RAIL_Y_X, y: PLOT_T - 9, 'text-anchor': 'middle' });
        mark.setAttribute('fill', live ? c.text : c.textMuted);
        mark.setAttribute('font-family', fonts.mono);
        mark.setAttribute('font-size', fontSizes.sm);
        mark.textContent = AXIS_MARK[rail];
        gRails.append(line, mark);
      }

      // ── 눈금. 세워 본 축의 자름 자리를 전부 깔고, 짚어 본 것은 굵어진다 (표식).
      for (const seen of axesSeen(scene)) {
        const triedValues = scene.tried.filter((one) => one.axis === seen).map((one) => one.threshold);
        for (const value of cutsOn(scene, seen)) {
          const marked = triedValues.includes(value);
          const line =
            seen === 'x'
              ? el('line', {
                  x1: xPix(d, value), y1: railXY - TICK_LEN / 2,
                  x2: xPix(d, value), y2: railXY + TICK_LEN / 2,
                })
              : el('line', {
                  x1: RAIL_Y_X - TICK_LEN / 2, y1: yPix(d, value),
                  x2: RAIL_Y_X + TICK_LEN / 2, y2: yPix(d, value),
                });
          line.setAttribute('stroke', marked ? c.text : c.border);
          line.setAttribute('stroke-width', String(marked ? TICK_W_TRIED : TICK_W));
          const label =
            seen === 'x'
              ? el('text', { x: xPix(d, value), y: railXY + 20, 'text-anchor': 'middle' })
              : el('text', { x: RAIL_Y_X - 7, y: yPix(d, value) + 4, 'text-anchor': 'end' });
          label.setAttribute('fill', c.textMuted);
          label.setAttribute('font-family', fonts.mono);
          label.setAttribute('font-size', fontSizes.xs);
          // 눈금값 — 수 표기라 표식이다 (C10).
          label.textContent = String(value);
          gRails.append(line, label);
        }
      }

      // ── 유령 칼금. 그어 보고 버린 자리 — 점선이라 살아 있는 칼날과 부딪히지 않는다.
      for (const ghost of ghostCuts(scene)) {
        const e = edgeOf(bladeAt(d, ghost.axis, ghost.threshold));
        const node = el('line', {
          x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2,
          stroke: c.ghostOutline, 'stroke-width': GHOST_W,
          'stroke-dasharray': GHOST_DASH,
          opacity: ghost.axis === axis ? GHOST_FADE_HERE : GHOST_FADE_AWAY,
        });
        gGhosts.appendChild(node);
        drawn.ghosts.push({ cut: ghost, node });
      }

      // ── 점. 제 값 자리에 선다.
      for (const p of scene.points) {
        gPoints.appendChild(
          el('circle', {
            cx: xPix(d, p.x), cy: yPix(d, p.y), r: POINT_R,
            fill: p.label === scene.classes[0] ? colorLow : colorHigh,
          }),
        );
      }
      // 이름표는 무리 곁에 직접 붙인다 — 범례 상자를 따로 두지 않는다.
      const groups: Array<[string, string]> = [
        [scene.classes[0], colorLow],
        [scene.classes[1], colorHigh],
      ];
      for (const [label, fill] of groups) {
        const ys = scene.points.filter((p) => p.label === label).map((p) => p.y);
        if (ys.length === 0) continue;
        const centerY = ys.reduce((a, b) => a + b, 0) / ys.length;
        const mark = el('text', {
          x: plotL + 12, y: yPix(d, centerY) + 5, 'text-anchor': 'middle',
          fill, 'font-family': fonts.body, 'font-size': fontSizes.md, 'font-weight': 600,
        });
        // 이름표는 선언이 준 값이다 — 코드에 박은 문안이 아니다.
        mark.textContent = label;
        gPoints.appendChild(mark);
      }

      // ── 자름선. 아직 세우지 않았으면 **짓지 않는다** (숨기지 않는다).
      if (axis !== null) {
        drawn.blade = el('line', {
          x1: 0, y1: 0, x2: 0, y2: 0,
          stroke: pure ? c.accent : c.risingMarker,
          'stroke-width': scene.done ? BLADE_W_DONE : BLADE_W,
          'stroke-linecap': 'round',
        });
        drawn.knob = el('circle', {
          cx: 0, cy: 0,
          r: scene.done ? KNOB_R_DONE : KNOB_R,
          fill: pure ? c.accent : c.risingMarker,
        });
        gBlade.append(drawn.blade, drawn.knob);
      }

      // ── 저울 둘. 칼금이 있어야 담긴 것이 있다.
      const blade = axis === null ? null : bladeFor(d, axis, cut);
      if (blade !== null && cut !== null) {
        drawn.chipLow = makeChip();
        drawn.chipHigh = makeChip();
        const { low, high } = tallyAt(scene, cut);
        paintChips(drawn, blade, low, high, scene.points.length);
        // 수 두 개와 콜론뿐이라 문안이 아니라 표식이다 (C10 표식 판정 3).
        drawn.chipLow.ratio.textContent = `${low.a} : ${low.b}`;
        drawn.chipHigh.ratio.textContent = `${high.a} : ${high.b}`;
        for (const chip of [drawn.chipLow, drawn.chipHigh]) {
          // 테두리는 견줌의 표식 — 양쪽이 한 이름표씩으로 갈렸나.
          chip.frame.setAttribute('stroke', pure ? c.accent : c.border);
          chip.frame.setAttribute('stroke-width', pure ? '2' : '1');
          chip.ratio.setAttribute('fill', pure ? c.text : c.textMuted);
        }
      }
      // 칼날이 서 있으면 두 땅도 갈려 있다 — 갈아 세우는 동안에만 잠시 접힌다.
      if (blade !== null) paintBlade(drawn, blade, true);

      drawCaption(scene);
      return drawn;
    }

    /** 캡션. 장면은 무엇을 말할지만 말하고 문자는 여기서 만든다 (C10). */
    function drawCaption(scene: SplitByQuestionScene): void {
      const node = el('text', {
        x: W / 2, y: 24, 'text-anchor': 'middle',
        fill: c.text, 'font-family': fonts.body, 'font-size': fontSizes.md,
      });
      const say = captionOf(scene);
      switch (say.kind) {
        case 'start':
          node.textContent = t('caption.start', 'Every point carries a label. A sits low, B sits high.');
          break;
        case 'axis':
          node.textContent =
            say.axis === 'x'
              ? t('caption.axisX', 'Stand one cut line on the horizontal axis.')
              : t('caption.axisY', 'Turn the cut line over onto the vertical axis.');
          break;
        case 'cut':
          node.textContent = say.pure
            ? t('caption.pure', 'Cut at {t}. One side is all A, the other all B.', {
                t: String(say.threshold),
              })
            : t('caption.mixed', 'Cut at {t}. Each side is still half A, half B.', {
                t: String(say.threshold),
              });
          break;
        case 'exhausted':
          node.textContent = t(
            'caption.exhausted',
            'Positions tried on this axis: {n}. Sliding never separates them.',
            { n: String(say.tried) },
          );
          break;
        case 'done':
          node.textContent = t('caption.done', 'What separated them was the axis, not the position.');
          break;
      }
      gCaption.appendChild(node);
    }

    // ── 운동. 정적 그리기가 정본이므로 여기서는 **아직 못 온 만큼을 되돌린다** ──

    /** 처음 세우는 자름선 — 레일에서 길이가 자라나며 선다. */
    function flowRaise(drawn: Drawn, target: Blade, mine: number): Promise<void> {
      return tween(RAISE_MS, true, mine, (e) => {
        paintBlade(drawn, { ...target, len: target.len * e }, false);
      });
    }

    /** 갈아 세운다 — 돌면서 길이가 바뀌고 손잡이가 한 레일을 떠나 다른 레일에 앉는다. */
    function flowTurn(drawn: Drawn, from: Blade, target: Blade, mine: number): Promise<void> {
      return tween(ROTATE_MS, true, mine, (e) => {
        paintBlade(
          drawn,
          {
            cx: lerp(from.cx, target.cx, e),
            cy: lerp(from.cy, target.cy, e),
            angle: lerp(from.angle, target.angle, e),
            len: lerp(from.len, target.len, e),
            knobOut: lerp(from.knobOut, target.knobOut, e),
          },
          false,
        );
      });
    }

    /**
     * 미끄러진다 — 칼날이 다음 자리로 옮겨 가고 저울이 함께 기운다.
     *
     * 칼날과 저울은 **한 시계**로 흐른다. 자리를 옮겨도 나뉜 자리가 꿈쩍하지 않는
     * 것이 이 조각의 주장이라, 시계를 나누면 둘이 우연히 맞아 든 그림이 된다.
     */
    async function flowCut(
      drawn: Drawn,
      scene: SplitByQuestionScene,
      d: Domain,
      mine: number,
    ): Promise<void> {
      const axis = currentAxis(scene);
      const cut = currentCut(scene);
      if (axis === null || cut === null) return;
      const target = bladeAt(d, axis, cut.threshold);
      const before = previousCut(scene);
      const from = bladeFor(d, axis, before);
      const fromLow = before === null ? EMPTY_SIDE : tallyAt(scene, before).low;
      const fromHigh = before === null ? EMPTY_SIDE : tallyAt(scene, before).high;
      const to = tallyAt(scene, cut);
      const total = scene.points.length;

      // 비율 글자는 칼날이 멎은 뒤에 뜬다 — 옮기는 중에 읽히면 셈이 흔들려 보인다.
      setRatioOpacity(drawn, '0');
      await tween(MOVE_MS, true, mine, (e) => {
        const blade: Blade = {
          ...target,
          cx: lerp(from.cx, target.cx, e),
          cy: lerp(from.cy, target.cy, e),
        };
        paintBlade(drawn, blade, true);
        paintChips(
          drawn,
          blade,
          { a: lerp(fromLow.a, to.low.a, e), b: lerp(fromLow.b, to.low.b, e) },
          { a: lerp(fromHigh.a, to.high.a, e), b: lerp(fromHigh.b, to.high.b, e) },
          total,
        );
      });
      if (!alive(mine)) return;
      await tween(LABEL_MS, false, mine, (e) => {
        setRatioOpacity(drawn, String(e));
      });
    }

    /** 훑고 지나간 자리를 순서대로 되짚는다 — "다 해 봤다" 를 한 번에 보인다. */
    function flowSweep(
      drawn: Drawn,
      scene: SplitByQuestionScene,
      mine: number,
    ): Promise<void> {
      const axis = currentAxis(scene);
      if (axis === null) return Promise.resolve();
      const marks: Array<{ node: SVGElement; base: number }> = [];
      for (const ghost of drawn.ghosts) {
        if (ghost.cut.axis === axis) marks.push({ node: ghost.node, base: GHOST_W });
      }
      // 지금 선 칼날도 이 축에서 짚은 한 자리다. 되짚기는 그 위에서 끝난다.
      if (drawn.blade !== null) marks.push({ node: drawn.blade, base: BLADE_W });
      const n = marks.length;
      if (n === 0) return Promise.resolve();
      return tween(SWEEP_MS, false, mine, (p) => {
        marks.forEach((mark, i) => {
          const center = (i + 0.5) / n;
          const k = Math.max(0, 1 - Math.abs(p - center) * n * 1.6);
          mark.node.setAttribute('opacity', String(0.5 + 0.5 * k));
          mark.node.setAttribute('stroke-width', String(mark.base + 2.4 * k));
        });
      });
    }

    /** 갈린 자리를 못 박는다 — 칼날이 굵어지고 손잡이가 커진다. */
    function flowDone(drawn: Drawn, mine: number): Promise<void> {
      const blade = drawn.blade;
      const knob = drawn.knob;
      if (blade === null || knob === null) return Promise.resolve();
      return tween(RAISE_MS, true, mine, (e) => {
        blade.setAttribute('stroke-width', String(lerp(BLADE_W, BLADE_W_DONE, e)));
        knob.setAttribute('r', String(lerp(KNOB_R, KNOB_R_DONE, e)));
      });
    }

    function flowFor(
      step: SplitStep,
      drawn: Drawn,
      scene: SplitByQuestionScene,
      mine: number,
    ): Promise<void> {
      const d = domainOf(scene);
      const axis = currentAxis(scene);
      switch (step.kind) {
        case 'axis': {
          if (axis === null) return Promise.resolve();
          const target = bladeFor(d, axis, currentCut(scene));
          if (step.from === null) return flowRaise(drawn, target, mine);
          return flowTurn(drawn, bladeFor(d, step.from, lastCutOn(scene, step.from)), target, mine);
        }
        case 'cut':
          return flowCut(drawn, scene, d, mine);
        case 'sweep':
          return flowSweep(drawn, scene, mine);
        case 'done':
          return flowDone(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: SplitByQuestionScene,
      _prev: SplitByQuestionScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 opacity 가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawScene(next);
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
        canvas.textContent = '';
      },
    };
  },
};
