/**
 * noise-left-out-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다 (S-scene).
 *
 * 화면은 넷이다.
 *   위 머리표    방법 둘. 활성 표시가 옆으로 미끄러지는 것이 방법이 바뀌는 신호다.
 *   왼쪽 판      같은 점 열여섯. 두 방법이 차례로 이 위에 걸린다.
 *   오른쪽 선반  "남겨진 것" — 밀도가 남긴 것을 받아 적는 자리. 줄마다 **밀도가 남긴
 *                까닭**(이웃 수)과 **가까운 쪽이 뻗은 거리**가 나란히 앉는다.
 *   아래 자      점판과 **같은 축척**. eps 를 한 도막으로 깔아 두고, 무리가 뻗어야
 *                했던 거리를 그 위에 막대와 눈금으로 재 준다.
 *
 * 이 조각의 동사는 "남겨진다" 다. 그래서 남는 점은 끝까지 제자리에 있다 — 움직이는
 * 것은 번짐(선이 자라는 것) · 뻗음(선이 자라는 것) · 중심(미끄러지는 것) · 방법
 * 머리표(옆으로 미는 것)이고, 두 선의 길이 차이가 곧 논증이다.
 *
 * ── 이행이 고친 화면 — 뒤엣답이 앞엣답을 지우고 있었다
 *
 * 이 조각의 주장은 *견줌*이다. 밀도는 "어디에도 넣지 않는다" 고 답하고 가까운 쪽은
 * "아무리 멀어도 넣는다" 고 답한다. **양쪽 답이 한 화면에 함께 서야 주장이 선다.**
 * 그런데 옛 화면은 세 자리에서 앞엣답을 지웠다.
 *
 * - 남은 점의 **점선 고리가 접혔다** (`ring.setAttribute('r','0')`). 고리가 곧 "밀도가
 *   이것을 남겼다" 는 표식인데, 가까운 쪽이 데려가는 순간 그 표식이 사라져 완주
 *   화면에서는 그 점이 그냥 무리의 일원으로 보였다.
 * - 선반 줄의 **이웃 수가 뻗은 거리로 갈아 끼워졌다** (`value.textContent = …`).
 *   "이웃이 하나뿐이라 남았다" 가 "4.42 를 뻗어 들어갔다" 로 덮였다.
 * - 선반 머리의 수가 **하나씩 줄어 0 이 되었다.** 밀도의 답(넷)이 가까운 쪽의
 *   답(영)으로 덮였다.
 *
 * 지금은 어휘를 갈라 둘이 부딪히지 않게 한다.
 *
 * - **채움(fill) = 형편** — 빈 바탕색은 아직 어느 무리도 아니다, 짙은 색은 그 무리에
 *   들었다, 옅은 색은 가장자리로 들었다. 남은 점이 가까운 쪽에 데려가지면 채움이
 *   그 무리의 색이 된다.
 * - **점선 고리 = 표식** — "밀도가 이것을 남겼다." **끝까지 남는다.** 그래서 완주
 *   화면의 그 점은 *가까운 쪽 무리의 색으로 차 있으면서 밀도가 남긴 고리를 두르고
 *   있다* — 두 답이 한 점 위에 함께 선다.
 * - **점의 크기·선 굵기 = 속의 표식** — 문턱을 넘은 점만 굵고 크다. 옛 화면은
 *   가장자리 점에도 `stroke-width` 2.2 를 남겨 한 축에 값 셋을 욱여넣었다. 가장자리는
 *   채움(옅은 색)으로만 말하게 갈랐다.
 * - **선반 줄 = 두 답의 나란함** — 윗줄에 이웃 수(밀도가 남긴 까닭), 아랫줄에 뻗은
 *   거리(가까운 쪽이 치른 값). 줄을 흐리게 만들지 않는다.
 * - **선반 머리 = 두 답의 나란함** — 밀도가 남긴 수와 가까운 쪽이 남긴 수를 화살표로
 *   이어 한 자리에 세운다. 왼쪽 수는 끝까지 그대로고 오른쪽 수만 줄어 0 이 된다.
 *
 * 자 위의 **눈금도 걷지 않는다.** 막대는 하나만 남기지만(쌓이면 길이를 못 읽는다)
 * 눈금은 네 뻗음이 다 남아 eps 도막과 한눈에 견주어진다 — 옛 화면도 눈금만은 쌓이게
 * 두었고, 그것이 버그가 아니라 정보였다.
 *
 * ── CSS transition 을 쓰지 않는다
 *
 * 옛 stage 는 `move()` 가 `style.transition` 을 걸고 한 틱 뒤에 값을 바꾸는 짜임이었다.
 * 되짚기는 `animate:false` 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게
 * 하므로 흔들림 축을 구조적으로 통과할 수 없다 (S-scene MUST NOT). 전부 `tween` 보간으로
 * 옮겼다. 벽시계는 `setTimeout` 으로 재고 rAF 를 쓰지 않는다 — 걸음이 프레임 없는
 * 자리에서도 돌아야 하기 때문이다.
 *
 * ── 척도는 적어 두지 않는다
 *
 * 연속 좌표의 척도(`unit` · `originX` · `originY`)를 `mount` 이 한 번 셈해 클로저에
 * 적어 두면 척도를 정하는 자리와 쓰는 자리가 갈라진다. 여기서는 바탕의 점과 eps 에서
 * **매번** 셈한다 — 장면이 담는 것은 픽셀이 아니라 값이다 (S-piece).
 *
 * 색판도 바탕에서 한 번에 센다. `categorical` 은 인자가 바뀌면 hue 간격이 통째로
 * 갈리므로 *지금까지 드러난 무리의 수*로 정하면 안 된다.
 *
 * 세로는 이 파일이 상수로 갖고 마운트한 뒤 바뀌지 않는다 (S-view). 가로는 러너가
 * `PIECE_CANVAS_W` 로 준다.
 *
 * 걸어 둔 타이머는 집합에 담아 `destroy` 에서 일괄로 거두고 기다리던 promise 도 함께
 * 깨운다 — 그러지 않으면 unmount 뒤에도 `render` 의 `await` 가 영영 안 돌아온다
 * (S-piece).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  borderRows,
  centroidsNow,
  claimOf,
  clusterSizes,
  coreIndices,
  isCore,
  labelsOf,
  labelsUpTo,
  leftOutOf,
  letterOf,
  ratioOf,
  reachOf,
  remainingOf,
  type NoiseLeftOutScene,
  type NoiseStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 내용이 정하는 값이라 그림 곁에 둔다 (S-view). */
const H = 420;

const PAD = 24;
const GUTTER = 20;
/** 선반 폭 — 좌표 표기 한 줄이 들어가는 최소치. 남는 폭은 점판이 다 가진다. */
const BOARD_W = 192;
const PLOT_W = W - PAD * 2 - GUTTER - BOARD_W;
const PLOT_X = PAD;
const BOARD_X = PAD + PLOT_W + GUTTER;

const TAB_Y = 10;
const TAB_H = 22;
const TAB_GAP = 8;
const TAB_W = (PLOT_W - TAB_GAP) / 2;

const PLOT_Y = 40;
const PLOT_H = 288;

const BOARD_Y = PLOT_Y;
const BOARD_H = PLOT_H;
const BOARD_HEAD_H = 40;
const ROW_MAX_H = 48;

/** 자의 축선. 위쪽은 뻗은 거리, 아래쪽은 눈금과 eps 도막. */
const METER_Y = 368;
const METER_UNITS = 6;

const CAPTION_Y = 406;

const PT_R = 4.5;
const GHOST_R = 10;

/** 걸음마다 붙는 운동의 길이. 걸음 벽시계 = 이 값 + (문을 지나면) `stepMs` 다. */
const PLACE_MS = 260;
const DISC_MS = 300;
const TAG_MS = 140;
const CORE_MS = 200;
const EDGE_MS = 200;
const FILL_MS = 140;
const HALT_MS = 320;
const RING_MS = 220;
const ROW_MS = 240;
const SWITCH_MS = 300;
const SETTLE_MS = 320;
const VALUE_MS = 120;
const CLAIM_MS = 200;
/** 두 답을 나란히 놓는 걸음. 발신이 얇아(0ms 운동) 읽을 틈이 없었다 (함정 19). */
const CLOSE_MS = 260;
const FRAME_MS = 16;

/** 도형에 새겨지는 표식 — 번역 대상이 아니다 (C10 판정 1·3). */
const DASH = '—';
const EPS_SIGN = 'eps';
/** 두 답을 잇는 표식. 왼쪽이 밀도가 남긴 수, 오른쪽이 가까운 쪽이 남긴 수다. */
const ARROW = '→';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 토큰 hex 를 알파로 눕힌다. 색 리터럴이 아니라 순수 변환이다 (S-view 예외). */
function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.replace(/./g, (ch) => ch + ch) : raw;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const clamp01 = (p: number): number => (p < 0 ? 0 : p > 1 ? 1 : p);
const easeOut = (p: number): number => 1 - (1 - p) ** 3;
const easeInOut = (p: number): number => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/** 점판과 자가 함께 쓰는 축척. 바탕의 점과 eps 가 정하므로 걸음마다 같은 값이 나온다. */
type Scale = { unit: number; toX(v: number): number; toY(v: number): number };

/**
 * 거리가 논증이므로 가로세로를 다른 배율로 늘일 수 없다. 여백은 eps 하나만큼 —
 * 가장자리 점의 이웃 반지름이 판 밖으로 새지 않을 최소치다.
 */
function scaleOf(scene: NoiseLeftOutScene): Scale {
  const xs = scene.points.map((p) => p.x);
  const ys = scene.points.map((p) => p.y);
  const minX = xs.length > 0 ? Math.min(...xs) : 0;
  const maxX = xs.length > 0 ? Math.max(...xs) : 1;
  const minY = ys.length > 0 ? Math.min(...ys) : 0;
  const maxY = ys.length > 0 ? Math.max(...ys) : 1;
  const spanX = maxX - minX + scene.eps * 2;
  const spanY = maxY - minY + scene.eps * 2;
  const unit = Math.min(PLOT_W / spanX, PLOT_H / spanY);
  const originX = PLOT_X + (PLOT_W - spanX * unit) / 2 + (scene.eps - minX) * unit;
  const originY = PLOT_Y + PLOT_H - (PLOT_H - spanY * unit) / 2 - (scene.eps - minY) * unit;
  return {
    unit,
    toX: (v: number): number => originX + v * unit,
    toY: (v: number): number => originY - v * unit,
  };
}

/** 자와 뻗음이 같은 시간 감각을 쓰도록, 길이에서 재생 시간을 뽑는다. */
const reachMs = (d: number, unit: number): number => Math.round(200 + d * unit * 1.8);

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  scale: Scale;
  tone(k: number): string;
  /** 점 손잡이. 아직 놓이지 않았으면 빈 열이다. */
  dots: SVGCircleElement[];
  /** eps 원반. 가까운 쪽으로 넘어간 뒤에는 짓지 않는다. */
  discs: SVGCircleElement[];
  /** 이웃 수 딱지. 원반과 함께 살고 함께 없어진다. */
  tags: SVGTextElement[];
  /** 남은 점의 점선 고리 — 밀도가 남겼다는 표식. 끝까지 남는다. */
  rings: Map<number, SVGCircleElement>;
  /** 번짐 선 전부. 방법이 바뀔 때 함께 흐려진다. */
  edgesAll: SVGLineElement[];
  /**
   * 마지막 물결의 선. 자라는 운동에 쓴다.
   *
   * 두 끝의 자리를 선과 함께 쥔다 — 운동이 `getAttribute` 로 화면을 되읽지 않게
   * 하려고 여기서 장면의 좌표를 그대로 넘긴다 (함정 28).
   */
  edgesLast: { line: SVGLineElement; ax: number; ay: number; bx: number; by: number }[];
  /** 중심 글리프. */
  glyphs: SVGGElement[];
  tabMark: SVGRectElement;
  /** 선반 머리의 두 답. */
  headPair: SVGTextElement;
  /** 선반 줄 묶음. 적히는 걸음에 미끄러져 들어온다. */
  rowGroups: SVGGElement[];
  /** 남은 점 → 그 줄의 뻗은 거리 글자. 데려가진 줄에만 있다. */
  rowReach: Map<number, SVGTextElement>;
  /** 마지막 뻗음의 선. */
  tether: SVGLineElement | null;
  /** 마지막 뻗음을 자 위에 재는 막대와 그 값. */
  meterBar: SVGLineElement | null;
  meterValue: SVGTextElement | null;
};

export const noiseLeftOutStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<NoiseLeftOutScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);
    // 비우는 것은 캔버스 안쪽이다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다.
    const gTab = el('g');
    const gPlot = el('g');
    const gDisc = el('g');
    const gFlow = el('g');
    const gEdge = el('g');
    const gTether = el('g');
    const gDot = el('g');
    const gTag = el('g');
    const gCentroid = el('g');
    const gBoard = el('g');
    const gMeter = el('g');
    const gCaption = el('g');
    const layers = [
      gTab,
      gPlot,
      gDisc,
      gFlow,
      gEdge,
      gTether,
      gDot,
      gTag,
      gCentroid,
      gBoard,
      gMeter,
      gCaption,
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
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
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

    // ── 글자 ─────────────────────────────────────────────────────────────

    function label(x: number, y: number, value: string, attrs: Attrs = {}): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.text,
        ...attrs,
      });
      node.textContent = value;
      return node;
    }

    function prose(x: number, y: number, value: string, attrs: Attrs = {}): SVGTextElement {
      return label(x, y, value, { 'font-family': fonts.body, ...attrs });
    }

    // ── 캡션 ─────────────────────────────────────────────────────────────

    /** 남았던 점 하나가 들어간 걸음이 하는 말. 수는 전부 좌표와 자취에서 나온다. */
    function claimCaption(scene: NoiseLeftOutScene): string {
      const claim = scene.claims[scene.claims.length - 1];
      if (claim === undefined) return '';
      const d = reachOf(scene, claim).toFixed(2);
      const rank = scene.claims.length;
      const total = leftOutOf(scene).length;
      // 거리 오름차순으로 오므로 마지막이 가장 먼 것이다. 그 한 걸음이 이 조각의
      // 논증이라 문안을 따로 쓴다.
      if (rank === total && total > 1) {
        return t(
          'caption.claimFar',
          'Far from every blob, yet it joins. Distance {d}, or {r} times eps.',
          { d, r: ratioOf(scene, claim).toFixed(1) },
        );
      }
      return t('caption.claim', 'It joined a group whose nearest member sits {d} away.', { d });
    }

    function captionFor(scene: NoiseLeftOutScene): string {
      const step = scene.step;
      if (step === null) return '';
      switch (step.kind) {
        case 'place':
          return t('caption.points', 'Sixteen points, one dataset, two methods.');
        case 'radius':
          return t(
            'caption.radius',
            'Count the neighbors inside the radius. The core threshold is {m}.',
            { m: scene.minPts },
          );
        case 'cores':
          return t('caption.core', 'Points dense enough to be cores: {n}.', {
            n: coreIndices(scene).length,
          });
        case 'spread':
          return t('caption.spread', 'A group spreads from core to core.');
        case 'halt':
          return t('caption.halted', 'The spread stops. Group sizes: {sizes}.', {
            sizes: clusterSizes(scene).join(' · '),
          });
        case 'list':
          return t('caption.leftOut', 'Nothing reached these. They stay where they are: {n}.', {
            n: leftOutOf(scene).length,
          });
        case 'begin':
          return t(
            'caption.nearest',
            'Same points. Now pick two centers and attach each to the nearer one.',
          );
        case 'settle':
          return t('caption.centroids', 'The two centers settle. Rounds taken: {r}.', {
            r: scene.settled?.rounds ?? 0,
          });
        case 'claim':
          return claimCaption(scene);
        case 'close':
          return t('caption.done', 'Density left {a} out. The nearer side left {b} out.', {
            a: leftOutOf(scene).length,
            b: remainingOf(scene),
          });
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 방법 머리표 둘. 활성 표시의 자리가 지금 어느 방법을 걸고 있나를 말한다. */
    function drawTabs(scene: NoiseLeftOutScene): SVGRectElement {
      const tabMark = el('rect', {
        x: PLOT_X + (scene.begun ? TAB_W + TAB_GAP : 0),
        y: TAB_Y,
        width: TAB_W,
        height: TAB_H,
        rx: 5,
        fill: hexToRgba(c.text, 0.07),
      });
      gTab.appendChild(tabMark);
      gTab.appendChild(
        prose(PLOT_X + TAB_W / 2, TAB_Y + 15, t('tab.density', 'Group by density'), {
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
          fill: scene.begun ? c.textMuted : c.text,
        }),
      );
      gTab.appendChild(
        prose(
          PLOT_X + TAB_W + TAB_GAP + TAB_W / 2,
          TAB_Y + 15,
          t('tab.nearest', 'Attach to the nearer side'),
          {
            'font-size': fontSizes.sm,
            'text-anchor': 'middle',
            fill: scene.begun ? c.text : c.textMuted,
          },
        ),
      );
      return tabMark;
    }

    /**
     * 선반. 첫 걸음부터 빈 채로 놓인다 — 무엇이 남을 것인가를 먼저 묻는다.
     *
     * 머리의 수가 **두 답을 나란히** 세운다. 왼쪽은 밀도가 남긴 수로 끝까지 그대로고,
     * 오른쪽은 가까운 쪽이 아직 데려가지 않은 수라 0 까지 줄어든다. 두 수 다 같은
     * 자취에서 나오므로 갈릴 자리가 없다.
     */
    function drawBoard(
      scene: NoiseLeftOutScene,
      leftOut: readonly number[],
      tone: (k: number) => string,
    ): { headPair: SVGTextElement; rowGroups: SVGGElement[]; rowReach: Map<number, SVGTextElement> } {
      gBoard.appendChild(
        el('rect', {
          x: BOARD_X,
          y: BOARD_Y,
          width: BOARD_W,
          height: BOARD_H,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
      gBoard.appendChild(
        prose(BOARD_X + 14, BOARD_Y + 26, t('board.title', 'Left out'), {
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        }),
      );

      const density = leftOut.length;
      const headText = !scene.listed
        ? DASH
        : scene.begun
          ? `${density} ${ARROW} ${remainingOf(scene)}`
          : String(density);
      const headPair = label(BOARD_X + BOARD_W - 14, BOARD_Y + 28, headText, {
        'font-size': fontSizes.xl,
        'text-anchor': 'end',
        fill: scene.listed ? c.text : c.textMuted,
      });
      gBoard.appendChild(headPair);
      gBoard.appendChild(
        el('line', {
          x1: BOARD_X + 12,
          y1: BOARD_Y + BOARD_HEAD_H,
          x2: BOARD_X + BOARD_W - 12,
          y2: BOARD_Y + BOARD_HEAD_H,
          stroke: c.border,
        }),
      );

      const rowGroups: SVGGElement[] = [];
      const rowReach = new Map<number, SVGTextElement>();
      if (leftOut.length === 0) return { headPair, rowGroups, rowReach };

      const area = BOARD_H - BOARD_HEAD_H - 12;
      const rowH = Math.min(ROW_MAX_H, area / leftOut.length);
      const top = BOARD_Y + BOARD_HEAD_H + 8 + (area - rowH * leftOut.length) / 2;

      leftOut.forEach((index, i) => {
        const point = scene.points[index];
        if (point === undefined) return;
        const mark = letterOf(scene, index);
        const mid = top + rowH * i + rowH / 2;
        const row = el('g');
        row.appendChild(
          el('circle', {
            cx: BOARD_X + 26,
            cy: mid,
            r: 10,
            fill: 'none',
            stroke: c.ghostOutline,
          }),
        );
        row.appendChild(
          label(BOARD_X + 26, mid + 4, mark, { 'text-anchor': 'middle', fill: c.text }),
        );
        // 좌표 표기는 표식이다 (C10 판정 3).
        row.appendChild(
          label(BOARD_X + 46, mid - 3, `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`),
        );
        // 윗줄 — 밀도가 이것을 남긴 까닭. 데려가진 뒤에도 그대로 남는다.
        row.appendChild(
          label(
            BOARD_X + BOARD_W - 14,
            mid - 3,
            t('board.neighbors', 'nbrs {n}', { n: scene.counts[index] ?? 0 }),
            { 'text-anchor': 'end', fill: c.textMuted },
          ),
        );
        // 아랫줄 — 가까운 쪽이 치른 값. 데려가진 줄에만 짓는다 (숨기는 것과 다르다).
        const claim = claimOf(scene, index);
        if (claim !== null) {
          const reach = label(
            BOARD_X + BOARD_W - 14,
            mid + 14,
            t('board.reach', 'reach {d}', { d: reachOf(scene, claim).toFixed(2) }),
            { 'text-anchor': 'end', fill: tone(claim.cluster) },
          );
          row.appendChild(reach);
          rowReach.set(index, reach);
        }
        rowGroups.push(row);
        gBoard.appendChild(row);
      });
      return { headPair, rowGroups, rowReach };
    }

    /**
     * 아래 자. 눈금은 점판과 같은 단위이고, eps 도막이 견줌의 기준이다.
     *
     * 지나간 뻗음의 눈금은 **걷지 않는다** — 넷이 다 남아 eps 도막과 견주어지는 것이
     * 이 조각의 논증이다. 막대는 마지막 하나만 남긴다 (쌓이면 길이를 못 읽는다).
     */
    function drawMeter(
      scene: NoiseLeftOutScene,
      scale: Scale,
      tone: (k: number) => string,
    ): { bar: SVGLineElement | null; value: SVGTextElement | null } {
      const axisLen = METER_UNITS * scale.unit;
      gMeter.appendChild(
        el('line', { x1: PAD, y1: METER_Y, x2: PAD + axisLen, y2: METER_Y, stroke: c.border }),
      );
      for (let u = 0; u <= METER_UNITS; u += 1) {
        gMeter.appendChild(
          el('line', {
            x1: PAD + u * scale.unit,
            y1: METER_Y,
            x2: PAD + u * scale.unit,
            y2: METER_Y + 3,
            stroke: c.border,
          }),
        );
      }
      gMeter.appendChild(
        el('rect', { x: PAD, y: METER_Y + 6, width: scene.eps * scale.unit, height: 5, fill: c.text }),
      );
      // `eps = 1.2` 는 수식 표기라 표식으로 둔다 (C10 판정 3). 도막 바로 옆에 붙여
      // 두어야 그 검은 도막이 무엇인지가 한눈에 잡힌다.
      gMeter.appendChild(
        label(PAD + scene.eps * scale.unit + 8, METER_Y + 12, `${EPS_SIGN} = ${scene.eps}`, {
          fill: c.textMuted,
        }),
      );
      gMeter.appendChild(
        prose(
          PAD + axisLen + 24,
          METER_Y + 4,
          t('meter.note', 'How far a group had to reach, measured against eps.'),
          { fill: c.textMuted },
        ),
      );

      let bar: SVGLineElement | null = null;
      let value: SVGTextElement | null = null;
      scene.claims.forEach((claim, i) => {
        const end = PAD + reachOf(scene, claim) * scale.unit;
        gMeter.appendChild(
          el('line', {
            x1: end,
            y1: METER_Y - 5,
            x2: end,
            y2: METER_Y + 1,
            stroke: tone(claim.cluster),
            'stroke-width': 2,
          }),
        );
        if (i < scene.claims.length - 1) return;
        bar = el('line', {
          x1: PAD,
          y1: METER_Y - 7,
          x2: end,
          y2: METER_Y - 7,
          stroke: tone(claim.cluster),
          'stroke-width': 3,
          'stroke-linecap': 'round',
        });
        gMeter.appendChild(bar);
        // 막대 끝에 그 점의 표식과 잰 값을 함께 적어 판·선반·자를 잇는다.
        value = label(
          end + 4,
          METER_Y - 13,
          `${letterOf(scene, claim.index)} ${reachOf(scene, claim).toFixed(2)}`,
          { fill: tone(claim.cluster) },
        );
        gMeter.appendChild(value);
      });
      return { bar, value };
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: NoiseLeftOutScene): Drawn {
      rewind();

      // ── 색판. 바탕에서 한 번에 센다 — 드러난 무리의 수로 정하지 않는다 (함정 12).
      const shades = Math.max(2, scene.seeds.length);
      const hue = categorical(shades, 'vivid');
      const soft = categorical(shades, 'pastel');
      const tone = (k: number): string => hue[Math.max(0, k) % hue.length] ?? c.text;
      const softTone = (k: number): string => soft[Math.max(0, k) % soft.length] ?? c.textMuted;

      // ── 척도. 바탕의 점이 정하므로 걸음마다 같은 값이 나온다.
      const scale = scaleOf(scene);

      // ── 자취에서 셈해지는 것들. 여기 한 번 셈하고 그 다음에 그린다 (함정 13).
      const labels = labelsOf(scene);
      const leftOut = scene.listed ? leftOutOf(scene) : [];
      const borderOf = new Map<number, number>();
      if (scene.halted) for (const row of borderRows(scene)) borderOf.set(row.index, row.cluster);

      gPlot.appendChild(
        el('rect', {
          x: PLOT_X,
          y: PLOT_Y,
          width: PLOT_W,
          height: PLOT_H,
          rx: 6,
          fill: c.bg,
          stroke: c.border,
        }),
      );

      const tabMark = drawTabs(scene);

      // ── eps 원반과 이웃 수. 방법이 바뀐 뒤에는 짓지 않는다 (숨기는 것과 다르다).
      const discs: SVGCircleElement[] = [];
      const tags: SVGTextElement[] = [];
      if (scene.counts.length > 0 && !scene.begun) {
        scene.points.forEach((p, i) => {
          const thin = scene.cored && !isCore(scene, i);
          discs.push(
            gDisc.appendChild(
              el('circle', {
                cx: scale.toX(p.x),
                cy: scale.toY(p.y),
                r: scene.eps * scale.unit,
                fill: thin ? 'none' : hexToRgba(c.text, 0.05),
                stroke: thin ? c.ghostOutline : c.border,
                ...(thin ? { 'stroke-dasharray': '3 3' } : {}),
              }),
            ),
          );
          tags.push(
            gTag.appendChild(
              label(scale.toX(p.x) + 9, scale.toY(p.y) - 8, String(scene.counts[i] ?? 0), {
                fill: c.textMuted,
              }),
            ),
          );
        });
      }

      // ── 번짐. 물결마다의 선. 방법이 바뀌면 통째로 흐려진다.
      const edgesAll: SVGLineElement[] = [];
      const edgesLast: Drawn['edgesLast'] = [];
      scene.waves.forEach((wave, w) => {
        const last = w === scene.waves.length - 1;
        for (const [a, b] of wave) {
          const pa = scene.points[a];
          const pb = scene.points[b];
          if (pa === undefined || pb === undefined) continue;
          const ax = scale.toX(pa.x);
          const ay = scale.toY(pa.y);
          const bx = scale.toX(pb.x);
          const by = scale.toY(pb.y);
          const line = gEdge.appendChild(
            el('line', {
              x1: ax,
              y1: ay,
              x2: bx,
              y2: by,
              stroke: tone(labels[a] ?? 0),
              'stroke-width': 2,
              'stroke-linecap': 'round',
              opacity: scene.begun ? 0.22 : 0.7,
            }),
          );
          edgesAll.push(line);
          if (last) edgesLast.push({ line, ax, ay, bx, by });
        }
      });

      // ── 뻗음. 남았던 점과 그 닻을 잇는 선.
      let tether: SVGLineElement | null = null;
      scene.claims.forEach((claim, i) => {
        const from = scene.points[claim.anchor];
        const to = scene.points[claim.index];
        if (from === undefined || to === undefined) return;
        const line = gTether.appendChild(
          el('line', {
            x1: scale.toX(from.x),
            y1: scale.toY(from.y),
            x2: scale.toX(to.x),
            y2: scale.toY(to.y),
            stroke: tone(claim.cluster),
            'stroke-width': 1.8,
            'stroke-linecap': 'round',
            opacity: 0.85,
          }),
        );
        if (i === scene.claims.length - 1) tether = line;
      });

      // ── 점. 채움은 형편, 크기와 선 굵기는 속의 표식이다.
      const dots: SVGCircleElement[] = [];
      if (scene.placed) {
        scene.points.forEach((p, i) => {
          const group = labels[i] ?? -1;
          const claim = claimOf(scene, i);
          const border = borderOf.get(i);
          const core = scene.cored && isCore(scene, i);
          const fill =
            claim !== null
              ? tone(claim.cluster)
              : border !== undefined
                ? softTone(border)
                : group >= 0
                  ? tone(group)
                  : c.bg;
          const stroke =
            claim !== null ? tone(claim.cluster) : group >= 0 ? tone(group) : c.text;
          dots.push(
            gDot.appendChild(
              el('circle', {
                cx: scale.toX(p.x),
                cy: scale.toY(p.y),
                r: core ? PT_R + 1.5 : claim !== null ? PT_R + 1 : PT_R,
                fill,
                stroke,
                'stroke-width': core ? 2.4 : 1.6,
              }),
            ),
          );
        });
      }

      // ── 남은 점의 점선 고리 — 밀도가 남겼다는 표식. 데려가진 뒤에도 남는다.
      const rings = new Map<number, SVGCircleElement>();
      for (const index of leftOut) {
        const p = scene.points[index];
        if (p === undefined) continue;
        rings.set(
          index,
          gDisc.appendChild(
            el('circle', {
              cx: scale.toX(p.x),
              cy: scale.toY(p.y),
              r: GHOST_R,
              fill: 'none',
              stroke: c.ghostOutline,
              'stroke-width': 1.6,
              'stroke-dasharray': '3 3',
            }),
          ),
        );
        gTag.appendChild(
          label(scale.toX(p.x) + 12, scale.toY(p.y) - 10, letterOf(scene, index), {
            fill: c.text,
          }),
        );
      }

      // ── 중심. 수렴하기 전에는 선언의 시작 중심에 서 있다.
      const glyphs: SVGGElement[] = [];
      if (scene.begun) {
        centroidsNow(scene).forEach((centre, k) => {
          const glyph = el('g', {
            transform: `translate(${scale.toX(centre.x).toFixed(2)} ${scale.toY(centre.y).toFixed(2)})`,
          });
          glyph.appendChild(
            el('path', {
              d: 'M0,-9 L9,0 L0,9 L-9,0 Z',
              fill: c.bg,
              stroke: tone(k),
              'stroke-width': 2.2,
            }),
          );
          glyph.appendChild(el('circle', { cx: 0, cy: 0, r: 2, fill: tone(k) }));
          glyphs.push(gCentroid.appendChild(glyph));
        });
      }

      const board = drawBoard(scene, leftOut, tone);
      const meter =
        scene.counts.length > 0 ? drawMeter(scene, scale, tone) : { bar: null, value: null };

      // ── 캡션. 지금 화면에서 무슨 일이 일어나는지만 말한다 (S-piece).
      gCaption.appendChild(
        prose(PAD, CAPTION_Y, captionFor(scene), { 'font-size': fontSizes.md, fill: c.text }),
      );

      return {
        scale,
        tone,
        dots,
        discs,
        tags,
        rings,
        edgesAll,
        edgesLast,
        glyphs,
        tabMark,
        headPair: board.headPair,
        rowGroups: board.rowGroups,
        rowReach: board.rowReach,
        tether,
        meterBar: meter.bar,
        meterValue: meter.value,
      };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이고, 끝나면 마지막 정적 그리기가 통째로 걷어 간다.

    /** 점이 돋는다. */
    function flowPlace(drawn: Drawn, mine: number): Promise<void> {
      return tween(PLACE_MS, mine, (p) => {
        const r = (PT_R * easeOut(p)).toFixed(2);
        for (const dot of drawn.dots) dot.setAttribute('r', r);
      });
    }

    /** 이웃 반지름이 펴지고 그 안에 든 수가 뒤따라 적힌다. 한 뜻이라 시계는 하나다. */
    function flowRadius(scene: NoiseLeftOutScene, drawn: Drawn, mine: number): Promise<void> {
      const full = scene.eps * drawn.scale.unit;
      const total = DISC_MS + TAG_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;
        const grown = easeOut(clamp01(ms / DISC_MS));
        const r = (full * grown).toFixed(2);
        for (const disc of drawn.discs) disc.setAttribute('r', r);
        const shown = clamp01((ms - DISC_MS) / TAG_MS);
        for (const tag of drawn.tags) {
          if (shown >= 1) tag.removeAttribute('opacity');
          else tag.setAttribute('opacity', shown.toFixed(3));
        }
      });
    }

    /** 문턱을 넘은 점이 굵고 크게 자란다. */
    function flowCores(scene: NoiseLeftOutScene, drawn: Drawn, mine: number): Promise<void> {
      const dense = coreIndices(scene)
        .map((i) => drawn.dots[i])
        .filter((node): node is SVGCircleElement => node !== undefined);
      return tween(CORE_MS, mine, (p) => {
        const e = easeOut(p);
        for (const dot of dense) {
          dot.setAttribute('r', (PT_R + 1.5 * e).toFixed(2));
          dot.setAttribute('stroke-width', (1.6 + 0.8 * e).toFixed(2));
        }
      });
    }

    /**
     * 번짐 한 물결. 선이 속에서 새 점으로 자라고, 닿은 점이 그 무리의 색을 받는다.
     *
     * 닿기 전의 칠은 **물결 한 칸을 물려** 셈한다 — `prev` 를 들추지 않는다 (S-scene).
     */
    function flowSpread(scene: NoiseLeftOutScene, drawn: Drawn, mine: number): Promise<void> {
      const wave = scene.waves[scene.waves.length - 1];
      if (wave === undefined) return Promise.resolve();

      // 닿기 전의 칠은 물결 한 칸을 물려 셈한다. 닿은 뒤의 칠도 장면이 말하는 무리
      // 번호에서 나오므로 화면의 `stroke` 를 되읽지 않는다 (함정 28).
      const before = labelsUpTo(scene, scene.waves.length - 1);
      const after = labelsOf(scene);
      const fresh: { dot: SVGCircleElement; tint: string }[] = [];
      const seen = new Set<number>();
      for (const index of wave.flat()) {
        if (seen.has(index) || (before[index] ?? -1) >= 0) continue;
        seen.add(index);
        const dot = drawn.dots[index];
        if (dot === undefined) continue;
        fresh.push({ dot, tint: drawn.tone(after[index] ?? 0) });
      }

      const total = EDGE_MS + FILL_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;
        const reach = easeOut(clamp01(ms / EDGE_MS));
        for (const g of drawn.edgesLast) {
          g.line.setAttribute('x2', (g.ax + (g.bx - g.ax) * reach).toFixed(2));
          g.line.setAttribute('y2', (g.ay + (g.by - g.ay) * reach).toFixed(2));
        }
        // 선이 다 닿기 전에는 새로 든 점이 아직 빈 채로 있다.
        const filled = ms >= EDGE_MS;
        for (const item of fresh) item.dot.setAttribute('fill', filled ? item.tint : c.bg);
      });
    }

    /**
     * 번짐이 멎는다. 멎은 자리가 한 번 부풀었다 앉는다.
     *
     * 이 걸음은 논증의 축이라 색만 바꾸고 지나가면 캡션만 바뀐 것이 된다. 왜 멎었나는
     * 그 점 곁에 적힌 이웃 수가 말한다 — 문턱에 모자라 다음 물결을 잇지 못했다.
     */
    function flowHalt(scene: NoiseLeftOutScene, drawn: Drawn, mine: number): Promise<void> {
      const edge = borderRows(scene)
        .map((row) => drawn.dots[row.index])
        .filter((node): node is SVGCircleElement => node !== undefined);
      if (edge.length === 0) return Promise.resolve();
      return tween(HALT_MS, mine, (p) => {
        const r = (PT_R + 3 * Math.sin(Math.PI * p)).toFixed(2);
        for (const dot of edge) dot.setAttribute('r', r);
      });
    }

    /** 남겨진 것이 드러난다. 점 둘레에 고리가 펴지고 선반 줄이 미끄러져 들어온다. */
    function flowList(drawn: Drawn, mine: number): Promise<void> {
      const rings = [...drawn.rings.values()];
      const total = RING_MS + ROW_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;
        const spread = easeOut(clamp01(ms / RING_MS));
        const r = (GHOST_R * spread).toFixed(2);
        for (const ring of rings) ring.setAttribute('r', r);
        const slid = easeOut(clamp01((ms - RING_MS) / ROW_MS));
        for (const row of drawn.rowGroups) {
          if (slid >= 1) {
            row.removeAttribute('opacity');
            row.removeAttribute('transform');
            continue;
          }
          row.setAttribute('opacity', slid.toFixed(3));
          row.setAttribute('transform', `translate(${(-14 * (1 - slid)).toFixed(2)} 0)`);
        }
      });
    }

    /**
     * 방법이 바뀐다 — 한 박자다. 머리표가 미끄러지는 동안 eps 원반과 이웃 수가 걷히고
     * 중심이 들어서고 번짐이 흐려진다. 순차로 두면 같은 사건이 넷으로 쪼개져 보인다.
     *
     * 원반과 딱지는 정적 그림에 **없는** 것들이라 운동 동안만 임시로 짓는다. 자에
     * 깔린 eps 도막만 견줌의 기준으로 남는다.
     */
    function flowBegin(scene: NoiseLeftOutScene, drawn: Drawn, mine: number): Promise<void> {
      const full = scene.eps * drawn.scale.unit;
      const ghostDiscs: SVGCircleElement[] = [];
      const ghostTags: SVGTextElement[] = [];
      scene.points.forEach((p, i) => {
        const thin = !isCore(scene, i);
        ghostDiscs.push(
          gFlow.appendChild(
            el('circle', {
              cx: drawn.scale.toX(p.x),
              cy: drawn.scale.toY(p.y),
              r: full,
              fill: thin ? 'none' : hexToRgba(c.text, 0.05),
              stroke: thin ? c.ghostOutline : c.border,
              ...(thin ? { 'stroke-dasharray': '3 3' } : {}),
            }),
          ),
        );
        ghostTags.push(
          gFlow.appendChild(
            label(drawn.scale.toX(p.x) + 9, drawn.scale.toY(p.y) - 8, String(scene.counts[i] ?? 0), {
              fill: c.textMuted,
            }),
          ),
        );
      });

      const shift = TAB_W + TAB_GAP;
      return tween(SWITCH_MS, mine, (p) => {
        const e = easeOut(p);
        drawn.tabMark.setAttribute('x', (PLOT_X + shift * e).toFixed(2));
        const r = (full * (1 - e)).toFixed(2);
        for (const disc of ghostDiscs) disc.setAttribute('r', r);
        const fade = (1 - e).toFixed(3);
        for (const tag of ghostTags) tag.setAttribute('opacity', fade);
        for (const glyph of drawn.glyphs) glyph.setAttribute('opacity', e.toFixed(3));
        for (const line of drawn.edgesAll) {
          line.setAttribute('opacity', (0.7 - 0.48 * e).toFixed(3));
        }
        if (p < 1) return;
        // 끝에서는 보간값 대신 목표값을 그대로 쓴다 (함정 6).
        drawn.tabMark.setAttribute('x', String(PLOT_X + shift));
        for (const glyph of drawn.glyphs) glyph.removeAttribute('opacity');
        for (const line of drawn.edgesAll) line.setAttribute('opacity', '0.22');
        for (const node of [...ghostDiscs, ...ghostTags]) node.remove();
      });
    }

    /** 중심이 시작 자리에서 수렴한 자리로 미끄러진다. 출발도 바탕이 말한다. */
    function flowSettle(scene: NoiseLeftOutScene, drawn: Drawn, mine: number): Promise<void> {
      const moves = drawn.glyphs
        .map((glyph, k) => {
          const from = scene.seeds[k];
          const to = scene.settled?.centroids[k];
          if (from === undefined || to === undefined) return null;
          return { glyph, from, to };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
      if (moves.length === 0) return Promise.resolve();
      return tween(SETTLE_MS, mine, (p) => {
        const e = easeInOut(p);
        for (const m of moves) {
          const x = drawn.scale.toX(m.from.x + (m.to.x - m.from.x) * e);
          const y = drawn.scale.toY(m.from.y + (m.to.y - m.from.y) * e);
          m.glyph.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        }
      });
    }

    /**
     * 남았던 점 하나가 무리에 든다.
     *
     * 무리가 뻗는 것과 자가 재는 것이 같은 걸음이다 — 시계를 하나만 두어 둘이 나란히
     * 흐른다 (S-scene). 뻗음이 닿으면 점이 그 무리의 색을 받고, 점선 고리는 **접히지
     * 않고 한 번 두드려진다** — 밀도가 남겼다는 표식이 그대로 남아야 두 답이 한 점
     * 위에 함께 선다.
     */
    function flowClaim(scene: NoiseLeftOutScene, drawn: Drawn, mine: number): Promise<void> {
      const claim = scene.claims[scene.claims.length - 1];
      if (claim === undefined) return Promise.resolve();
      const from = scene.points[claim.anchor];
      const to = scene.points[claim.index];
      if (from === undefined || to === undefined) return Promise.resolve();

      const reach = reachOf(scene, claim);
      const ax = drawn.scale.toX(from.x);
      const ay = drawn.scale.toY(from.y);
      const bx = drawn.scale.toX(to.x);
      const by = drawn.scale.toY(to.y);
      const barEnd = PAD + reach * drawn.scale.unit;

      const tether = drawn.tether;
      const bar = drawn.meterBar;
      const value = drawn.meterValue;
      const dot = drawn.dots[claim.index];
      const ring = drawn.rings.get(claim.index);
      const row = drawn.rowReach.get(claim.index);
      const tint = drawn.tone(claim.cluster);

      const growMs = reachMs(reach, drawn.scale.unit);
      const total = growMs + VALUE_MS + CLAIM_MS;
      return tween(total, mine, (p) => {
        const ms = p * total;

        const grown = clamp01(ms / growMs);
        tether?.setAttribute('x2', (ax + (bx - ax) * grown).toFixed(2));
        tether?.setAttribute('y2', (ay + (by - ay) * grown).toFixed(2));
        bar?.setAttribute('x2', (PAD + (barEnd - PAD) * grown).toFixed(2));

        const shown = clamp01((ms - growMs) / VALUE_MS);
        if (value !== null) {
          if (shown >= 1) value.removeAttribute('opacity');
          else value.setAttribute('opacity', shown.toFixed(3));
        }

        const held = clamp01((ms - growMs - VALUE_MS) / CLAIM_MS);
        if (dot !== undefined) {
          // 뻗음이 닿는 그 순간에 채움과 테두리가 함께 그 무리의 색을 받는다.
          dot.setAttribute('fill', held > 0 ? tint : c.bg);
          dot.setAttribute('stroke', held > 0 ? tint : c.text);
          dot.setAttribute('r', (PT_R + (1 + 1.4 * Math.sin(Math.PI * held)) * held).toFixed(2));
        }
        // 고리는 접히지 않는다 — 한 번 넓어졌다 제자리로 돌아온다.
        ring?.setAttribute('r', (GHOST_R + 3 * Math.sin(Math.PI * held)).toFixed(2));
        if (row !== undefined) {
          if (held >= 1) row.removeAttribute('opacity');
          else row.setAttribute('opacity', held.toFixed(3));
        }
        if (p < 1) return;
        // 끝에서는 보간값 대신 목표값을 그대로 쓴다 (함정 6·35).
        if (dot !== undefined) {
          dot.setAttribute('fill', tint);
          dot.setAttribute('stroke', tint);
          dot.setAttribute('r', String(PT_R + 1));
        }
        ring?.setAttribute('r', String(GHOST_R));
      });
    }

    /**
     * 두 답이 나란히 선다.
     *
     * 발신이 운동을 하나도 안 달고 있어 걸음 벽시계가 `stepMs` 뿐이었다 (600ms —
     * 읽을 틈이 없다). 걸음이 하는 말이 *견줌*이므로 두 수를 한 번에 두드려 눈이
     * 그 쌍으로 가게 한다 (함정 19).
     */
    function flowClose(drawn: Drawn, mine: number): Promise<void> {
      const anchorX = BOARD_X + BOARD_W - 14;
      const anchorY = BOARD_Y + 28;
      return tween(CLOSE_MS, mine, (p) => {
        if (p >= 1) {
          drawn.headPair.removeAttribute('transform');
          return;
        }
        const s = 1 + 0.22 * Math.sin(Math.PI * p);
        drawn.headPair.setAttribute(
          'transform',
          `translate(${anchorX} ${anchorY}) scale(${s.toFixed(3)}) translate(${-anchorX} ${-anchorY})`,
        );
      });
    }

    function flowFor(
      step: NoiseStep,
      scene: NoiseLeftOutScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'place':
          return flowPlace(drawn, mine);
        case 'radius':
          return flowRadius(scene, drawn, mine);
        case 'cores':
          return flowCores(scene, drawn, mine);
        case 'spread':
          return flowSpread(scene, drawn, mine);
        case 'halt':
          return flowHalt(scene, drawn, mine);
        case 'list':
          return flowList(drawn, mine);
        case 'begin':
          return flowBegin(scene, drawn, mine);
        case 'settle':
          return flowSettle(scene, drawn, mine);
        case 'claim':
          return flowClaim(scene, drawn, mine);
        case 'close':
          return flowClose(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: NoiseLeftOutScene,
      _prev: NoiseLeftOutScene | null,
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
