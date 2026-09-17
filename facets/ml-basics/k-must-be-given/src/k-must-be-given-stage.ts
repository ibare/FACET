/**
 * k-must-be-given stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * ── 무엇이 어디에 있는가
 *
 *   왼쪽 좁고 긴 칸   점 열둘. 자료는 그대로고 **자르는 선만** 바뀐다. k 를 정할 때
 *                     테두리가 한 덩이로 되돌아오고, 답이 나오면 그 한 덩이가 k 조각
 *                     으로 찢어진다. 점은 움직이지 않는다 — 움직이는 것은 나눔이다.
 *   오른쪽 위 세 줄   k 마다의 답이 쌓인다. 열두 칸이 열두 점의 소속이고 무리마다
 *                     크기를 얹는다. **먼저 나온 답을 지우지 않는다.**
 *   오른쪽 아래       흩어짐 합. k 가 커질수록 늘 내려간다. 줄어든 폭을 계단으로 재고,
 *                     첫 점과 끝 점을 잇는 곧은 선을 그어 가운데 점이 그 선 위에
 *                     놓이는 것을 보인다 — 꺾이는 자리가 없다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**이다 — 점의 칠과 줄 칸의 칠은 그 점이 지금 어느 무리에 들었나
 * 이고, 눈금의 점은 재어 낸 흩어짐이다. 아직 무리에 안 든 점은 옅은 바탕색이다.
 * **테두리는 견줌·짚음의 표식**이다 — 아직 답이 안 온 줄은 점선 테두리만 서 있고,
 * 곧은 선 위에 놓인 가운데 점만 고리를 얻으며(채움 없는 테두리), 겹쳐 남은 테두리
 * 셋은 선 모양으로 어느 k 의 답인지 말한다. 두 축을 갈라 두면 "어느 무리였나" 와
 * "그 자리를 짚어 보았나" 가 서로를 지우지 않는다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 흩어짐 눈금의 꼭대기(`scatterTop`)를 stage 의 `let` 에 적어 두면 척도를 정하는
 * 자리와 쓰는 자리가 갈라진다. 여기서는 **담긴 흩어짐 값에서 매번** 셈한다
 * (`scatterTopOf`) — 장면이 담는 것은 픽셀이 아니라 값의 범위다 (S-piece).
 * 점의 가로세로 축척도 바탕의 점에서 매번 셈한다.
 *
 * 색판은 선언의 `ks` 에서 한 번에 센다 — `categorical` 은 인자가 바뀌면 hue 간격이
 * 통째로 갈리므로 *지금까지 드러난 무리 수*로 정하면 안 된다 (함정 12).
 *
 * 테두리의 여백은 k 가 클수록 좁고 선 모양(점선 간격)도 k 마다 다르다. 마지막에 세
 * 답을 겹쳐 그릴 때 큰 k 가 안쪽으로 들어와 서로를 가리지 않게 하려는 것이고, 그
 * 선 모양이 줄 머리의 견본과 짝이 된다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 준다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fonts,
  fontSizes,
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
  activeRun,
  activeSlot,
  captionOf,
  dropsOf,
  kAt,
  membersOf,
  scatterTopOf,
  scattersOf,
  settledAt,
  sizesOf,
  type KMustBeGivenScene,
  type KStep,
  type ScenePoint,
  type SettledRun,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 가로는 러너가 정한다 (S-piece). */
const H = 380;

// ── 왼쪽: 점 무리
const PLOT_X = 16;
const PLOT_W = 150;
const PLOT_TOP = 34;
const PLOT_BOT = 336;
const DIVIDER_X = 176;
const POINT_R = 5;
const SEED_R = 9;
const CENTRE_R = 5.5;
const HULL_PAD_WIDEST = 22;
const HULL_PAD_STEP = 8;
const HULL_PAD_MIN = 6;
/** 첫 k 를 물을 때 테두리가 이만큼 밖에서 조여 온다. */
const MERGE_OVERSHOOT = 16;

// ── 오른쪽 위: 답이 쌓이는 줄
const LX = 188;
const HEAD_Y = 24;
const ROWS_TOP = 34;
const ROW_PITCH = 42;
const CELL_H = 20;
const CELL_GAP = 3;
const CELL_MAX_W = 30;
const SWATCH_W = 26;
const STRIP_X = 226;
const CURSOR_X = 180;
const BADGE_W = 17;
const BADGE_H = 15;

// ── 오른쪽 아래: 흩어짐 합
const AXIS_X = 194;
const ELBOW_L = 250;
const ELBOW_R = 584;
const AXIS_HEADROOM = 6;
const MARK_R = 4.5;

const CAPTION_Y = 362;

// ── 걸음마다의 움직임 길이 (ms). 걸음 벽시계 = 이 값 + (문을 지나면) `stepMs` 다.
const CLOUD_MS = 480;
const MERGE_MS = 340;
const SEED_MS = 320;
const SPLIT_MS = 560;
const DROP_MS = 420;
const CHORD_MS = 420;
const BLOOM_MS = 560;
const FRAME_MS = 16;

/** 무리 크기를 나란히 적는 표기. 수와 가운뎃점뿐이라 표식이다 (C10). */
const SIZE_JOIN = ' · ';

type Rect = { x: number; y: number; w: number; h: number };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** k 가 클수록 테두리가 바짝 붙는다 — 겹쳐 그릴 때 안쪽으로 들어오게. */
function hullPad(k: number): number {
  return Math.max(HULL_PAD_MIN, HULL_PAD_WIDEST - (k - 2) * HULL_PAD_STEP);
}

/**
 * 무리마다의 색 자리.
 *
 * 색은 무리 **번호**가 아니라 그 무리가 자료의 어디쯤에서 시작하는가로 정한다.
 * 번호로 정하면 k=2 의 둘째 무리(위쪽 여섯)와 k=3 의 둘째 무리(오른아래 셋)가
 * 같은 색을 얻어, 줄이 서로 다른 답인데 같은 것을 가리키는 것처럼 읽힌다.
 * 자리로 정하면 위쪽은 k 가 무엇이든 같은 색이다.
 *
 * 자리가 겹치면 빈 자리로 밀어 준다 — 무리 수가 자리 수를 넘지 않으므로 반드시 빈다.
 */
function hueSlots(assign: readonly number[], groups: number, slots: number): number[] {
  const taken = new Set<number>();
  const out: number[] = [];
  const span = Math.max(assign.length, 1);
  for (let g = 0; g < groups; g += 1) {
    const first = assign.indexOf(g);
    let slot = first < 0 ? g % slots : Math.floor((first * slots) / span);
    while (taken.has(slot)) slot = (slot + 1) % slots;
    taken.add(slot);
    out.push(slot);
  }
  return out;
}

/** k 마다의 선 모양. 줄 머리의 견본과 마지막 겹침이 이것으로 짝을 짓는다. */
function dashOf(index: number, total: number): string {
  if (index >= total - 1) return 'none';
  return index <= 0 ? '7 4' : '3 3';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/**
 * 한 장면의 자리 셈. **그리기 전에 한 번에 셈하고 그 다음에 그린다** (함정 13).
 *
 * 바탕(점 · `ks`)과 자취(담긴 흩어짐)에서만 나오므로 어느 걸음에서 와도 같은 값이다.
 */
type Metrics = {
  rowCount: number;
  ruleY: number;
  elbowHeadY: number;
  axisTop: number;
  kAxisY: number;
  axisBase: number;
  cellW: number;
  stripX: number;
  stripW: number;
  paletteSize: number;
  hue(slot: number): string;
  sx(x: number): number;
  sy(y: number): number;
  rowTop(index: number): number;
  cellX(index: number): number;
  elbowX(index: number): number;
  elbowY(value: number): number;
  hullOf(members: readonly number[], pad: number): Rect;
  spotAt(index: number): { x: number; y: number } | null;
  centreAt(centre: ScenePoint): { x: number; y: number };
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type DropDrawn = {
  ledge: SVGLineElement;
  fall: SVGLineElement;
  tag: SVGTextElement;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
};

type BloomDrawn = { node: SVGRectElement; seed: Rect; full: Rect; phase: number };

type Drawn = {
  m: Metrics;
  dots: SVGCircleElement[];
  /** 한 덩이로 서 있는 테두리. 물었는데 아직 답이 안 나온 동안만 선다. */
  merged: SVGRectElement | null;
  /** 지금 답의 조각 테두리들과 각각이 감싸는 자리. */
  pieces: SVGRectElement[];
  pieceRects: Rect[];
  /** 한 덩이일 때의 사각. 찢어짐의 출발이고 되돌아옴의 도착이다. */
  wholeRect: Rect | null;
  /** 시작 중심(또는 옮겨 간 중심)에 씌운 고리. 차례가 `seeds` 의 차례다. */
  rings: SVGCircleElement[];
  cursor: SVGRectElement | null;
  /** 지금 답의 줄 칸과 크기 배지. 앞선 답의 것은 손잡이로 들지 않는다. */
  cells: SVGRectElement[];
  badges: SVGGElement[];
  mark: SVGCircleElement | null;
  markLabel: SVGTextElement | null;
  markX: number;
  drops: DropDrawn[];
  chord: { node: SVGLineElement; x0: number; y0: number; x1: number; y1: number } | null;
  halos: SVGCircleElement[];
  blooms: BloomDrawn[];
};

export const kMustBeGivenStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<KMustBeGivenScene> {
    const colors = getColors(params.theme ?? 'light');
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 러너가 캔버스를 먼저 붙였다 (S-view).
    svg.textContent = '';

    const RX = W - 20;

    // ── 켜. 그리는 차례가 곧 겹치는 차례다. 여기 담기는 것은 걸음마다 통째로 다시 센다.
    const frameLayer = el('g');
    const hullLayer = el('g');
    const pointLayer = el('g');
    const centreLayer = el('g');
    const rowLayer = el('g');
    const elbowLayer = el('g');
    const captionLayer = el('g');
    const layers = [
      frameLayer,
      hullLayer,
      pointLayer,
      centreLayer,
      rowLayer,
      elbowLayer,
      captionLayer,
    ];
    for (const layer of layers) svg.appendChild(layer);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 여러 마디를 지난다. `destroy` 가 그 가운데 오면 남은 마디가 이미
     * 떨어져 나간 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고 물러난다.
     * `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다
     * (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디. 건네는 `p` 는 보간되지 않은 벽시계 비율이고 완만함은 걸음이 고른다.
     *
     * CSS `transition` 을 쓰지 않는다 — 되짚기는 `animate:false` 로 오는데 transition
     * 은 그 뒤에도 화면을 저 혼자 흘러가게 한다 (S-scene MUST NOT). 벽시계는
     * `setTimeout` 으로 재고 rAF 를 쓰지 않는다 — 걸음이 프레임 없는 자리에서도
     * 돌아야 하기 때문이다.
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

    function setRect(node: SVGRectElement, r: Rect): void {
      node.setAttribute('x', String(r.x));
      node.setAttribute('y', String(r.y));
      node.setAttribute('width', String(Math.max(0, r.w)));
      node.setAttribute('height', String(Math.max(0, r.h)));
    }

    function tweenRect(node: SVGRectElement, from: Rect, to: Rect, t01: number): void {
      setRect(node, {
        x: lerp(from.x, to.x, t01),
        y: lerp(from.y, to.y, t01),
        w: lerp(from.w, to.w, t01),
        h: lerp(from.h, to.h, t01),
      });
    }

    function write(
      x: number,
      y: number,
      content: string,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      family: string,
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-size': size,
        'font-family': family,
        fill,
        'text-anchor': anchor,
      });
      node.textContent = content;
      return node;
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function metricsOf(scene: KMustBeGivenScene): Metrics {
      const rowCount = Math.max(scene.ks.length, 1);
      const ruleY = ROWS_TOP + (rowCount - 1) * ROW_PITCH + CELL_H + 16;
      const elbowHeadY = ruleY + 20;
      const axisTop = ruleY + 36;
      const kAxisY = CAPTION_Y - 24;
      const axisBase = kAxisY - 18;

      // 색판은 선언의 `ks` 에서 한 번에 센다 — 드러난 무리 수로 정하지 않는다 (함정 12).
      const palette = categorical(Math.max(2, ...scene.ks), 'vivid');
      const hue = (slot: number): string =>
        palette[Math.abs(slot) % palette.length] ?? colors.text;

      // ── 점 자리. 가로세로 축척을 하나로 두어 거리가 뒤틀리지 않게 한다.
      const widestPad = scene.ks.length > 0 ? hullPad(Math.min(...scene.ks)) : HULL_PAD_WIDEST;
      const xs = scene.points.map((p) => p.x);
      const ys = scene.points.map((p) => p.y);
      const xMin = xs.length > 0 ? Math.min(...xs) : 0;
      const xMax = xs.length > 0 ? Math.max(...xs) : 1;
      const yMin = ys.length > 0 ? Math.min(...ys) : 0;
      const yMax = ys.length > 0 ? Math.max(...ys) : 1;
      const spanX = Math.max(xMax - xMin, 1e-6);
      const spanY = Math.max(yMax - yMin, 1e-6);
      const scale = Math.min(
        (PLOT_W - 2 * widestPad) / spanX,
        (PLOT_BOT - PLOT_TOP - 2 * widestPad) / spanY,
      );
      const originX = PLOT_X + (PLOT_W - spanX * scale) / 2;
      const originY = PLOT_TOP + (PLOT_BOT - PLOT_TOP - spanY * scale) / 2;
      const sx = (x: number): number => originX + (x - xMin) * scale;
      const sy = (y: number): number => originY + (yMax - y) * scale;

      // ── 칸 폭은 남는 자리에서 역산하고 상수로는 상한만 둔다 (S-piece).
      const cellCount = Math.max(scene.points.length, 1);
      const stripSpan = RX - STRIP_X;
      const cellW = Math.min(
        CELL_MAX_W,
        Math.floor((stripSpan - (cellCount - 1) * CELL_GAP) / cellCount),
      );
      const stripW = cellCount * cellW + (cellCount - 1) * CELL_GAP;
      const stripX = STRIP_X + Math.round((stripSpan - stripW) / 2);

      // ── 흩어짐 눈금. 꼭대기는 담긴 값에서 셈한다 — 적어 두지 않는다.
      const scatterTop = scatterTopOf(scene);

      return {
        rowCount,
        ruleY,
        elbowHeadY,
        axisTop,
        kAxisY,
        axisBase,
        cellW,
        stripX,
        stripW,
        paletteSize: palette.length,
        hue,
        sx,
        sy,
        rowTop: (index) => ROWS_TOP + Math.max(index, 0) * ROW_PITCH,
        cellX: (index) => stripX + index * (cellW + CELL_GAP),
        elbowX: (index) =>
          rowCount <= 1
            ? (ELBOW_L + ELBOW_R) / 2
            : ELBOW_L + ((ELBOW_R - ELBOW_L) * Math.max(index, 0)) / (rowCount - 1),
        elbowY: (value) => axisBase - (value / scatterTop) * (axisBase - axisTop - AXIS_HEADROOM),
        hullOf: (members, pad) => {
          let x1 = Infinity;
          let y1 = Infinity;
          let x2 = -Infinity;
          let y2 = -Infinity;
          for (const i of members) {
            const p = scene.points[i];
            if (p === undefined) continue;
            x1 = Math.min(x1, sx(p.x));
            x2 = Math.max(x2, sx(p.x));
            y1 = Math.min(y1, sy(p.y));
            y2 = Math.max(y2, sy(p.y));
          }
          if (!Number.isFinite(x1)) return { x: PLOT_X, y: PLOT_TOP, w: 0, h: 0 };
          return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + 2 * pad, h: y2 - y1 + 2 * pad };
        },
        spotAt: (index) => {
          const p = scene.points[index];
          return p === undefined ? null : { x: sx(p.x), y: sy(p.y) };
        },
        centreAt: (centre) => ({ x: sx(centre.x), y: sy(centre.y) }),
      };
    }

    /** 그 답에서 무리마다의 색 자리. 칸의 칠과 테두리의 칠이 같은 함수를 지난다. */
    function slotsOf(m: Metrics, run: SettledRun): number[] {
      return hueSlots(run.assign, run.centers.length, m.paletteSize);
    }

    /** 그 답이 감싸는 조각 사각들. 찢어짐의 도착이고 겹침의 도착이다. */
    function rectsOf(m: Metrics, run: SettledRun, k: number): Rect[] {
      const pad = hullPad(k);
      return run.centers.map((_, g) => m.hullOf(membersOf(run.assign, g), pad));
    }

    /** 고리가 옮겨 갈 자리 — 그 시작 중심이 든 무리의 중심이다. */
    function ringTargets(
      m: Metrics,
      seeds: readonly number[],
      run: SettledRun,
    ): Array<{ x: number; y: number } | null> {
      return seeds.map((seed) => {
        const group = run.assign[seed];
        if (group === undefined) return null;
        const centre = run.centers[group];
        return centre === undefined ? null : m.centreAt(centre);
      });
    }

    /** 화면에 세울 수 있는 시작 중심만 남긴다. */
    function seedsOf(scene: KMustBeGivenScene, slot: number): number[] {
      const chosen = scene.chosen[slot];
      if (chosen === undefined) return [];
      return chosen.seeds.filter((i) => i >= 0 && i < scene.points.length);
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /** 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece). */
    function captionText(scene: KMustBeGivenScene): string {
      const caption = captionOf(scene);
      switch (caption.kind) {
        case 'none':
          return '';
        case 'cloud':
          return t('caption.cloud', 'Twelve points, one cloud. Nothing is cut yet.');
        case 'chosen':
          return t('caption.chosen', 'Pick starting centres, farthest first. k = {k}.', {
            k: caption.k,
          });
        case 'split': {
          /*
           * 갈림의 캡션은 k 마다 다르다 — 같은 문장을 세 번 되풀이하면 걸음이 논증이
           * 아니라 나열이 된다. 무리 크기는 칸의 칠을 정하는 바로 그 배열에서 나온다.
           */
          const sizes = caption.sizes.join(SIZE_JOIN);
          if (caption.k <= 2) {
            return t('caption.split2', 'It cuts top from bottom. Group sizes: {sizes}.', { sizes });
          }
          if (caption.k === 3) {
            return t(
              'caption.split3',
              'Run it again and the lower half cuts in two. Group sizes: {sizes}.',
              { sizes },
            );
          }
          return t('caption.split4', 'Again, into four — this cut is real too. Group sizes: {sizes}.', {
            sizes,
          });
        }
        case 'drops':
          return t('caption.drops', 'Measure how far the scatter fell: {d1}, then {d2}.', {
            d1: (caption.drops[0] ?? 0).toFixed(2),
            d2: (caption.drops[1] ?? 0).toFixed(2),
          });
        case 'noKink':
          return t('caption.noKink', 'The later fall is the bigger one. There is no kink to pick.');
        case 'allAlive':
          return t('caption.allAlive', 'All three cuts stand. How many groups is given, not found.');
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 뼈대. 답이 들어올 자리를 미리 비워 두어 셋이 쌓인다는 것을 첫 걸음에서 알린다. */
    function drawScaffold(scene: KMustBeGivenScene, m: Metrics): void {
      frameLayer.appendChild(
        el('line', {
          x1: DIVIDER_X,
          y1: PLOT_TOP - 14,
          x2: DIVIDER_X,
          y2: PLOT_BOT,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      frameLayer.appendChild(
        write(
          LX,
          HEAD_Y,
          t('label.membership', 'group of each point'),
          fontSizes.xs,
          colors.textMuted,
          'start',
          fonts.body,
        ),
      );
      scene.ks.forEach((_k, i) => {
        frameLayer.appendChild(
          el('rect', {
            x: m.stripX,
            y: m.rowTop(i),
            width: m.stripW,
            height: CELL_H,
            rx: 3,
            fill: 'none',
            stroke: colors.border,
            'stroke-width': 1,
            'stroke-dasharray': '2 4',
          }),
        );
      });
      frameLayer.appendChild(
        el('line', {
          x1: LX,
          y1: m.ruleY,
          x2: RX,
          y2: m.ruleY,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      frameLayer.appendChild(
        write(
          LX,
          m.elbowHeadY,
          t('label.scatterSum', 'scatter sum'),
          fontSizes.xs,
          colors.textMuted,
          'start',
          fonts.body,
        ),
      );
      // 흩어짐 축. 밑변이 0 이고 위로 갈수록 흩어짐이 크다.
      frameLayer.appendChild(
        el('line', {
          x1: AXIS_X,
          y1: m.axisTop,
          x2: AXIS_X,
          y2: m.axisBase,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      frameLayer.appendChild(
        el('line', {
          x1: AXIS_X,
          y1: m.axisBase,
          x2: RX,
          y2: m.axisBase,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
      scene.ks.forEach((k, i) => {
        // 수식 표기는 표식이라 키를 두지 않는다 (C10).
        frameLayer.appendChild(
          write(m.elbowX(i), m.kAxisY, `k = ${k}`, fontSizes.xs, colors.textMuted, 'middle', fonts.mono),
        );
      });
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: KMustBeGivenScene): Drawn {
      rewind();
      const m = metricsOf(scene);
      const blank: Drawn = {
        m,
        dots: [],
        merged: null,
        pieces: [],
        pieceRects: [],
        wholeRect: null,
        rings: [],
        cursor: null,
        cells: [],
        badges: [],
        mark: null,
        markLabel: null,
        markX: AXIS_X,
        drops: [],
        chord: null,
        halos: [],
        blooms: [],
      };
      // 아직 점을 놓지 않았으면 화면에 아무것도 없다 — 숨기지 않고 짓지 않는다.
      if (!scene.placed) return blank;

      drawScaffold(scene, m);

      const slot = activeSlot(scene);
      const run = activeRun(scene);
      const slots = run === null ? [] : slotsOf(m, run);
      const activeK = kAt(scene, slot);
      const wholeRect =
        slot >= 0 && !scene.overlaid
          ? m.hullOf(
              scene.points.map((_p, i) => i),
              hullPad(activeK),
            )
          : null;

      // ── 테두리. 채움은 없고 선 모양이 어느 k 의 답인지 말한다.
      let merged: SVGRectElement | null = null;
      const pieces: SVGRectElement[] = [];
      let pieceRects: Rect[] = [];
      const blooms: BloomDrawn[] = [];

      if (scene.overlaid) {
        // 세 답이 함께 남는다 — 어느 답도 화면을 차지하지 않는다.
        scene.settled.forEach((logged, index) => {
          const loggedSlots = slotsOf(m, logged);
          rectsOf(m, logged, kAt(scene, index)).forEach((full, g) => {
            const node = el('rect', {
              x: full.x,
              y: full.y,
              width: Math.max(0, full.w),
              height: Math.max(0, full.h),
              rx: 10,
              fill: 'none',
              stroke: m.hue(loggedSlots[g] ?? g),
              'stroke-width': 2,
              'stroke-dasharray': dashOf(index, m.rowCount),
            });
            hullLayer.appendChild(node);
            const seed: Rect = { x: full.x + full.w / 2, y: full.y + full.h / 2, w: 0, h: 0 };
            // 안쪽(큰 k)부터 피어나 바깥으로 번진다.
            blooms.push({ node, seed, full, phase: scene.settled.length - 1 - index });
          });
        });
      } else if (run !== null && wholeRect !== null) {
        pieceRects = rectsOf(m, run, activeK);
        pieceRects.forEach((rect, g) => {
          const node = el('rect', {
            x: rect.x,
            y: rect.y,
            width: Math.max(0, rect.w),
            height: Math.max(0, rect.h),
            rx: 10,
            fill: 'none',
            stroke: m.hue(slots[g] ?? g),
            'stroke-width': 2,
            'stroke-dasharray': dashOf(slot, m.rowCount),
          });
          hullLayer.appendChild(node);
          pieces.push(node);
        });
      } else if (wholeRect !== null) {
        // 물었는데 아직 답이 없다 — 한 덩이로 되돌아온 채 서 있다.
        merged = el('rect', {
          x: wholeRect.x,
          y: wholeRect.y,
          width: Math.max(0, wholeRect.w),
          height: Math.max(0, wholeRect.h),
          rx: 12,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 2,
          'stroke-dasharray': '4 4',
        });
        hullLayer.appendChild(merged);
      }

      // ── 점. 채움이 지금 어느 무리에 들었나이고, 안 들었으면 옅은 바탕색이다.
      const dots = scene.points.map((p, i) => {
        const group = run === null ? -1 : (run.assign[i] ?? -1);
        const grouped = group >= 0 && group < slots.length;
        return el('circle', {
          cx: m.sx(p.x),
          cy: m.sy(p.y),
          r: POINT_R,
          fill: grouped ? m.hue(slots[group]) : colors.bgSubtle,
          stroke: grouped ? colors.stateInk : colors.textMuted,
          'stroke-width': 1.2,
        });
      });
      for (const dot of dots) pointLayer.appendChild(dot);

      // ── 시작 중심의 고리. 답이 나오면 무리의 중심으로 옮겨 가 작아진다.
      const rings: SVGCircleElement[] = [];
      if (slot >= 0 && !scene.overlaid) {
        const seeds = seedsOf(scene, slot);
        const targets = run === null ? null : ringTargets(m, seeds, run);
        seeds.forEach((seed, j) => {
          const home = m.spotAt(seed);
          if (home === null) return;
          const at = targets === null ? home : (targets[j] ?? home);
          rings.push(
            el('circle', {
              cx: at.x,
              cy: at.y,
              r: run === null ? SEED_R : CENTRE_R,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 2,
            }),
          );
        });
        for (const ring of rings) centreLayer.appendChild(ring);
      }

      // ── 줄. 물은 k 마다 머리와 견본이 서고, 답이 나온 k 마다 칸과 배지가 선다.
      let cursor: SVGRectElement | null = null;
      if (slot >= 0 && !scene.overlaid) {
        cursor = el('rect', {
          x: CURSOR_X,
          y: m.rowTop(slot),
          width: 3,
          height: CELL_H,
          rx: 1.5,
          fill: colors.accent,
        });
        frameLayer.appendChild(cursor);
      }

      scene.chosen.forEach((_chosen, i) => {
        // 수식 표기는 표식이라 키를 두지 않는다 (C10). 아래 견본은 마지막에 겹쳐
        // 그릴 테두리의 선 모양이라, 그때 어느 줄이 어느 테두리인지 잇는다.
        rowLayer.appendChild(
          write(
            LX,
            m.rowTop(i) + 11,
            `k = ${kAt(scene, i)}`,
            fontSizes.sm,
            colors.text,
            'start',
            fonts.mono,
          ),
        );
        rowLayer.appendChild(
          el('line', {
            x1: LX,
            y1: m.rowTop(i) + 18,
            x2: LX + SWATCH_W,
            y2: m.rowTop(i) + 18,
            stroke: colors.textMuted,
            'stroke-width': 2,
            'stroke-dasharray': dashOf(i, m.rowCount),
          }),
        );
      });

      const cells: SVGRectElement[] = [];
      const badges: SVGGElement[] = [];
      scene.settled.forEach((logged, i) => {
        const loggedSlots = slotsOf(m, logged);
        const rowY = m.rowTop(i);
        const mine = i === slot;
        logged.assign.forEach((g, j) => {
          const node = el('rect', {
            x: m.cellX(j),
            y: rowY,
            width: m.cellW,
            height: CELL_H,
            rx: 3,
            fill: m.hue(loggedSlots[g] ?? g),
          });
          rowLayer.appendChild(node);
          if (mine) cells.push(node);
        });
        // 무리 크기는 칸 위에 얹지 않고 작은 배지에 담는다 — 그냥 얹으면 칸에
        // 적힌 값처럼 읽힌다. 그 수는 칸의 칠을 정하는 배열을 세어 나온다.
        sizesOf(logged).forEach((size, g) => {
          const members = membersOf(logged.assign, g);
          const first = members.length > 0 ? members[0] : 0;
          const last = members.length > 0 ? members[members.length - 1] : 0;
          const midX = (m.cellX(first) + m.cellX(last) + m.cellW) / 2;
          const badge = el('g');
          badge.appendChild(
            el('rect', {
              x: midX - BADGE_W / 2,
              y: rowY + (CELL_H - BADGE_H) / 2,
              width: BADGE_W,
              height: BADGE_H,
              rx: BADGE_H / 2,
              fill: colors.bg,
            }),
          );
          const digits = write(
            midX,
            rowY + CELL_H / 2 + 4,
            String(size),
            fontSizes.sm,
            colors.text,
            'middle',
            fonts.mono,
          );
          digits.setAttribute('font-weight', '600');
          badge.appendChild(digits);
          rowLayer.appendChild(badge);
          if (mine) badges.push(badge);
        });
      });

      // ── 흩어짐 눈금. k 마다의 값이 나란히 남는다 — 지우지 않는다.
      let mark: SVGCircleElement | null = null;
      let markLabel: SVGTextElement | null = null;
      let markX = AXIS_X;
      const scatters = scattersOf(scene);
      scatters.forEach((scatter, i) => {
        const x = m.elbowX(i);
        const y = m.elbowY(scatter);
        const node = el('circle', { cx: x, cy: y, r: MARK_R, fill: colors.text });
        const label = write(
          x,
          y + 17,
          scatter.toFixed(2),
          fontSizes.xs,
          colors.text,
          'middle',
          fonts.mono,
        );
        elbowLayer.appendChild(node);
        elbowLayer.appendChild(label);
        if (i === slot) {
          mark = node;
          markLabel = label;
          markX = x;
        }
      });

      // ── 줄어든 폭. 계단의 높이와 곁의 수가 같은 뺄셈에서 나온다 (함정 34).
      const drops: DropDrawn[] = [];
      if (scene.measured) {
        dropsOf(scene).forEach((amount, i) => {
          if (i + 1 >= scatters.length) return;
          const x0 = m.elbowX(i);
          const x1 = m.elbowX(i + 1);
          const y0 = m.elbowY(scatters[i]);
          const y1 = m.elbowY(scatters[i + 1]);
          const ledge = el('line', {
            x1: x0,
            y1: y0,
            x2: x1,
            y2: y0,
            stroke: colors.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
          const fall = el('line', {
            x1,
            y1: y0,
            x2: x1,
            y2: y1,
            stroke: colors.danger,
            'stroke-width': 2,
          });
          const tag = write(
            x1 - 8,
            (y0 + y1) / 2 + 4,
            amount.toFixed(2),
            fontSizes.xs,
            colors.danger,
            'end',
            fonts.mono,
          );
          elbowLayer.appendChild(ledge);
          elbowLayer.appendChild(fall);
          elbowLayer.appendChild(tag);
          drops.push({ ledge, fall, tag, x0, x1, y0, y1 });
        });
      }

      // ── 곧은 선. 가운데 점이 그 위에 놓이는 것이 "꺾임이 없다" 는 증거다.
      let chord: Drawn['chord'] = null;
      const halos: SVGCircleElement[] = [];
      if (scene.chorded && scatters.length >= 2) {
        const x0 = m.elbowX(0);
        const y0 = m.elbowY(scatters[0]);
        const x1 = m.elbowX(scatters.length - 1);
        const y1 = m.elbowY(scatters[scatters.length - 1]);
        const node = el('line', {
          x1: x0,
          y1: y0,
          x2: x1,
          y2: y1,
          stroke: colors.accent,
          'stroke-width': 2.5,
          'stroke-dasharray': '6 4',
        });
        elbowLayer.appendChild(node);
        chord = { node, x0, y0, x1, y1 };
        // 짚어 본 자리는 채움이 아니라 테두리로 표시한다.
        scatters.slice(1, -1).forEach((scatter, i) => {
          const halo = el('circle', {
            cx: m.elbowX(i + 1),
            cy: m.elbowY(scatter),
            r: MARK_R,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2,
          });
          elbowLayer.appendChild(halo);
          halos.push(halo);
        });
      }

      // ── 캡션
      captionLayer.appendChild(
        write(
          W / 2,
          CAPTION_Y,
          captionText(scene),
          fontSizes.md,
          colors.text,
          'middle',
          fonts.body,
        ),
      );

      return {
        m,
        dots,
        merged,
        pieces,
        pieceRects,
        wholeRect,
        rings,
        cursor,
        cells,
        badges,
        mark,
        markLabel,
        markX,
        drops,
        chord,
        halos,
        blooms,
      };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이고, 끝나면 마지막 정적 그리기가 통째로 걷어 간다.

    /** 점 열둘이 차례로 돋는다. */
    function flowCloud(drawn: Drawn, mine: number): Promise<void> {
      const dots = drawn.dots;
      const n = Math.max(dots.length, 1);
      return tween(CLOUD_MS, mine, (raw) => {
        const p = raw >= 1 ? 1 : easeInOut(raw);
        dots.forEach((dot, i) => {
          dot.setAttribute('r', String(POINT_R * clamp01(p * (n + 3) - i)));
        });
      });
    }

    /**
     * 앞 답의 조각들이 한 덩이로 되돌아오고, 그러고 나서 시작 중심에 고리가 씌워진다.
     *
     * 둘이 한 뜻의 운동(이 k 는 처음부터 다시 도는 것이다)이라 **시계를 하나만 둔다** —
     * 마디를 나눠 따로 흘리면 이어짐이 우연히 맞는 꼴이 되고 하나를 `void` 로 던질
     * 여지가 생긴다 (S-scene).
     *
     * 되돌아오는 출발 사각은 **앞 k 의 답에서 셈한다.** 화면을 되읽지 않으므로
     * (`getAttribute`) 되짚어 세운 직후에도 같은 자리에서 조여 온다.
     */
    function flowChoose(scene: KMustBeGivenScene, drawn: Drawn, mine: number): Promise<void> {
      const whole = drawn.wholeRect;
      if (whole === null) return Promise.resolve();
      const slot = activeSlot(scene);
      const before = settledAt(scene, slot - 1);

      const starts: Rect[] =
        before === null
          ? [
              {
                x: whole.x - MERGE_OVERSHOOT,
                y: whole.y - MERGE_OVERSHOOT,
                w: whole.w + MERGE_OVERSHOOT * 2,
                h: whole.h + MERGE_OVERSHOOT * 2,
              },
            ]
          : rectsOf(drawn.m, before, kAt(scene, slot - 1));

      // 첫 조각은 정적 그리기가 세운 한 덩이가 그대로 맡고, 나머지는 사라질 몫이라
      // 운동 동안만 짓는다. 마지막 정적 그리기가 노드째 걷어 간다.
      const extras = starts.slice(1).map((rect) => {
        const node = el('rect', {
          x: rect.x,
          y: rect.y,
          width: Math.max(0, rect.w),
          height: Math.max(0, rect.h),
          rx: 12,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 2,
          'stroke-dasharray': '4 4',
        });
        hullLayer.appendChild(node);
        return node;
      });

      const merged = drawn.merged;
      const rings = drawn.rings;
      const count = rings.length;
      const total = MERGE_MS + SEED_MS;
      return tween(total, mine, (raw) => {
        const ms = raw * total;
        const closing = easeInOut(clamp01(ms / MERGE_MS));
        if (merged !== null) tweenRect(merged, starts[0], whole, closing);
        extras.forEach((node, i) => {
          tweenRect(node, starts[i + 1], whole, closing);
          node.setAttribute('opacity', String(1 - closing));
        });
        const blooming = easeInOut(clamp01((ms - MERGE_MS) / SEED_MS));
        rings.forEach((ring, j) => {
          const local = clamp01(blooming * (count + 1) - j);
          ring.setAttribute('r', String(SEED_R + 7 * (1 - local)));
          ring.setAttribute('opacity', String(local));
        });
      });
    }

    /**
     * 한 덩이가 k 조각으로 찢어진다. 조각마다 제 무리를 감싸는 자리로 가고, 고리는
     * 시작 자리에서 무게중심으로 옮겨 가며, 답이 줄에 적히고 흩어짐이 눈금에 찍힌다.
     *
     * 전부 한 뜻의 운동(이 k 의 답이 자리를 잡는다)이라 시계가 하나다.
     */
    function flowSplit(scene: KMustBeGivenScene, drawn: Drawn, mine: number): Promise<void> {
      const whole = drawn.wholeRect;
      const slot = activeSlot(scene);
      const run = settledAt(scene, slot);
      if (whole === null || run === null) return Promise.resolve();

      // 찢어지기 전의 한 덩이. 사라질 몫이라 운동 동안만 짓는다.
      const fading = el('rect', {
        x: whole.x,
        y: whole.y,
        width: Math.max(0, whole.w),
        height: Math.max(0, whole.h),
        rx: 12,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 2,
        'stroke-dasharray': '4 4',
      });
      hullLayer.appendChild(fading);

      const seeds = seedsOf(scene, slot);
      const homes = seeds.map((seed) => drawn.m.spotAt(seed));
      const targets = ringTargets(drawn.m, seeds, run);

      const pieces = drawn.pieces;
      const rects = drawn.pieceRects;
      const rings = drawn.rings;
      const cells = drawn.cells;
      const badges = drawn.badges;
      const mark = drawn.mark;
      const markLabel = drawn.markLabel;
      const markX = drawn.markX;
      const rowY = drawn.m.rowTop(slot);
      const steps = Math.max(cells.length, 1);

      return tween(SPLIT_MS, mine, (raw) => {
        const p = raw >= 1 ? 1 : easeInOut(raw);
        pieces.forEach((node, g) => {
          const rect = rects[g];
          if (rect !== undefined) tweenRect(node, whole, rect, p);
        });
        fading.setAttribute('opacity', String(1 - p));
        rings.forEach((ring, j) => {
          const home = homes[j];
          const to = targets[j];
          if (home == null) return;
          const at = to ?? home;
          ring.setAttribute('cx', String(lerp(home.x, at.x, p)));
          ring.setAttribute('cy', String(lerp(home.y, at.y, p)));
          ring.setAttribute('r', String(lerp(SEED_R, CENTRE_R, p)));
        });
        cells.forEach((node, i) => {
          const local = clamp01(p * (steps + 4) - i);
          node.setAttribute('height', String(CELL_H * local));
          node.setAttribute('y', String(rowY + (CELL_H * (1 - local)) / 2));
        });
        for (const badge of badges) badge.setAttribute('opacity', String(clamp01(p * 2 - 1)));
        mark?.setAttribute('cx', String(lerp(AXIS_X, markX, p)));
        markLabel?.setAttribute('opacity', String(clamp01(p * 2 - 1)));
      });
    }

    /** 계단이 옆으로 뻗고 나서 아래로 떨어지고, 잰 폭이 곁에 적힌다. */
    function flowDrops(drawn: Drawn, mine: number): Promise<void> {
      const marks = drawn.drops;
      if (marks.length === 0) return Promise.resolve();
      return tween(DROP_MS, mine, (raw) => {
        const p = raw >= 1 ? 1 : easeInOut(raw);
        for (const d of marks) {
          d.ledge.setAttribute('x2', String(lerp(d.x0, d.x1, clamp01(p * 2))));
          d.fall.setAttribute('y2', String(lerp(d.y0, d.y1, clamp01(p * 2 - 1))));
          d.tag.setAttribute('opacity', String(clamp01(p * 3 - 2)));
        }
      });
    }

    /** 곧은 선이 첫 점에서 끝 점까지 그어지고, 가운데 점이 고리를 얻는다. */
    function flowChord(drawn: Drawn, mine: number): Promise<void> {
      const chord = drawn.chord;
      if (chord === null) return Promise.resolve();
      const halos = drawn.halos;
      return tween(CHORD_MS, mine, (raw) => {
        const p = raw >= 1 ? 1 : easeInOut(raw);
        chord.node.setAttribute('x2', String(lerp(chord.x0, chord.x1, p)));
        chord.node.setAttribute('y2', String(lerp(chord.y0, chord.y1, p)));
        const late = clamp01(p * 2 - 1);
        for (const halo of halos) {
          halo.setAttribute('r', String(MARK_R + 8 * (1 - late)));
          halo.setAttribute('opacity', String(late));
        }
      });
    }

    /** 세 답의 테두리가 안쪽(큰 k)부터 피어 바깥으로 번진다. */
    function flowBloom(drawn: Drawn, mine: number): Promise<void> {
      const blooms = drawn.blooms;
      if (blooms.length === 0) return Promise.resolve();
      const phases = Math.max(...blooms.map((b) => b.phase)) + 1;
      return tween(BLOOM_MS, mine, (raw) => {
        const p = raw >= 1 ? 1 : easeInOut(raw);
        for (const b of blooms) {
          tweenRect(b.node, b.seed, b.full, clamp01(p * (phases + 1) - b.phase));
        }
      });
    }

    function flowFor(
      step: KStep,
      scene: KMustBeGivenScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'cloud':
          return flowCloud(drawn, mine);
        case 'choose':
          return flowChoose(scene, drawn, mine);
        case 'split':
          return flowSplit(scene, drawn, mine);
        case 'drops':
          return flowDrops(drawn, mine);
        case 'chord':
          return flowChord(drawn, mine);
        case 'bloom':
          return flowBloom(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: KMustBeGivenScene,
      _prev: KMustBeGivenScene | null,
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
        svg.textContent = '';
      },
    };
  },
};
