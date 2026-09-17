/**
 * squash-to-probability-stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이 말하는
 * 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요 없다
 * (S-scene).
 *
 * ── 무엇을 그리는가
 *
 * 위에는 **점수 축** 하나. 양 끝이 화살표로 캔버스 밖을 향하고 그 위에 −∞ · +∞
 * 가 붙는다. 아래에는 **확률의 띠** 하나. 0 과 1 두 벽에 갇혀 있고 그 사이가
 * 전부다. 둘 사이는 비어 있다가, 점수가 하나씩 내려앉을 때마다 **깔때기**가
 * 채워진다 — 축의 한 구간이 띠의 어느 구간으로 갔는지 이어 주는 띠 모양의 면.
 *
 * 이 그림의 값어치는 그 깔때기의 **일그러짐**에 있다. 축에서 −1 과 0 은 겨우
 * 28 픽셀 떨어져 있는데 띠에서는 117 픽셀로 벌어지고, 축에서 −8 과 −4 는 113
 * 픽셀 떨어져 있는데 띠에서는 9 픽셀로 오므라든다. 가운데 깔때기는 나팔처럼
 * 벌어지고 바깥 깔때기는 실처럼 눌린다. 같은 축의 거리가 같은 확률을 사지
 * 못한다는 말이 그 모양 자체다.
 *
 * ── 척도가 하나다
 *
 * 축이 보여 주는 범위 `zSpan` 은 장면의 **점수 목록 전체**에서 한 번에 잡는다
 * (`geomOf`). 내려앉은 것만으로 다시 잡으면 점이 하나 앉을 때마다 앞의 눈금이
 * 자리를 옮긴다. 옛 화면은 이 값을 stage 의 `let zSpan` 에 적어 두고 그 뒤로 모든
 * 가로 좌표를 거기서 냈다 — 척도를 정하는 자리와 쓰는 자리가 갈라져 있었다.
 *
 * 좌표는 전부 여기서 셈한다 (S-piece). 장면에서 오는 것은 점수 목록과 내려앉은
 * 확률뿐이고 픽셀은 하나도 없다.
 *
 * ── 채움과 테두리
 *
 * 이 그림에서 **채움은 값의 형편**이다 — 띠에 들어찬 깔때기 면(`accent`)이 "축의 이
 * 구간이 띠의 이만큼으로 갔다" 를 말하고, 자투리 면도 같은 잉크다. **표식은 잉크의
 * 세기**로 따로 말한다 — 자투리의 안쪽 끝 두 값만 `itemActive` 로 짚어, 끝없는
 * 반직선이 통째로 들어간 자리가 어디인지 다 끝난 화면에서도 읽힌다.
 *
 * 폭 강조(`gSeg`)만은 **지나가는 것**이라 마지막 걸음에 거둔다. 그것은 방금 얻은
 * 폭을 가리키는 손가락이지 화면이 남겨야 할 자취가 아니다.
 *
 * ── 세로
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 적지 않고, 세로는 그림이 정하는 값이라
 * 이 파일이 상수로 갖는다 (S-piece). 점수가 몇이든 축과 띠의 자리는 그대로고, 값
 * 라벨만 가로로 나뉜다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionFor,
  gainedSpan,
  readings,
  shownSpan,
  tailValues,
  type Reading,
  type SquashToProbabilityScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스
const STAGE_W = PIECE_CANVAS_W;
const STAGE_H = 308;
const PAD_X = 26;

// ── 점수 축
const FORMULA_Y = 20;
const ZLABEL_Y = 52;
const AXIS_Y = 68;
const AXIS_L = PAD_X;
const AXIS_R = STAGE_W - PAD_X;
const AXIS_C = STAGE_W / 2;
const AXIS_REACH = AXIS_C - AXIS_L;
const TICK_HALF = 5;
const ARROW_LEN = 9;
const ARROW_HALF = 4.5;
/** 데이터가 차지하는 축 범위의 몇 배까지 그릴지. 나머지가 자투리의 자리다. */
const AXIS_HEADROOM = 1.25;

// ── 확률의 띠
/** 띠 바깥에 0 · 1 을 적을 만큼만 남기고 폭을 채운다 (S-piece). */
const BAND_SIDE = 56;
const BAND_L = BAND_SIDE;
const BAND_R = STAGE_W - BAND_SIDE;
const BAND_W = BAND_R - BAND_L;
const BAND_TOP = 198;
const BAND_BOT = 232;
const WALL_TOP = 189;
const WALL_BOT = 241;
const WALL_GROW = 6;
const WALL_LABEL_DX = 13;

// ── 깔때기
/** 3차 곡선의 제어점 깊이. 축에서 수직으로 떠나 띠에 수직으로 닿게 한다. */
const CURVE_K = 54;
const SAMPLES = 36;
/**
 * 깔때기 면의 투명도. 어두운 테마에서는 같은 값이 훨씬 무겁게 얹혀 노랑 덩어리가
 * 그림을 삼키므로 한 단계 묽게 쓴다. 색은 토큰에서 오고 여기서 정하는 것은
 * 얼마나 얹느냐뿐이다.
 */
const RIBBON_ALPHA_LIGHT = 0.18;
const RIBBON_ALPHA_DARK = 0.11;
const SEG_ALPHA = 0.5;

// ── 값 라벨과 캡션
const LEAD_Y = 250;
const SLOT_Y = 262;
const CAPTION_Y = 290;
const VALUE_DIGITS = 4;

// ── 걸음마다의 지속시간
const AXIS_MS = 480;
const BAND_MS = 420;
const DROP_MS = 380;
const DRIVE_MS = 240;
const TAILS_MS = 560;
const SETTLE_MS = 220;

/** 도형에 새겨진 표식 — 번역 대상이 아니다 (C10). */
const FORMULA = 'σ(z) = 1 / (1 + e^(−z))';
const NEG_INFINITY = '−∞';
const POS_INFINITY = '+∞';
const MINUS = '−';

/** 확률은 넷째 자리까지 보인다. −8 과 8 이 벽에서 떨어져 있는 것이 거기서 보인다. */
const PROBABILITY_DIGITS = 4;

type Chute = { x0: number; x1: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function textNode(value: string, attrs: Record<string, string | number>): SVGTextElement {
  const node = el('text', attrs);
  node.textContent = value;
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((2 - 2 * t) * (2 - 2 * t)) / 2;
}

/** 3차 곡선의 x. 제어점이 P0.x = P1.x, P2.x = P3.x 라 두 항으로 접힌다. */
function chuteX(x0: number, x1: number, t: number): number {
  const u = 1 - t;
  return (u * u * u + 3 * u * u * t) * x0 + (3 * u * t * t + t * t * t) * x1;
}

/** 3차 곡선의 y. x 와 무관하게 축 → 띠 위쪽으로 단조 증가한다. */
function chuteY(t: number): number {
  const u = 1 - t;
  return (
    u * u * u * AXIS_Y +
    3 * u * u * t * (AXIS_Y + CURVE_K) +
    3 * u * t * t * (BAND_TOP - CURVE_K) +
    t * t * t * BAND_TOP
  );
}

/**
 * 곡선을 깊이 `q` 까지 잘라 점으로 뜬다.
 *
 * `getTotalLength` 류의 SVG 기하 API 를 쓰지 않는다 — 러너 밖 검사 환경에는
 * 그것이 없어서 그리기가 통째로 멎는다. 점을 직접 셈하면 어디서든 같다.
 */
function chutePoints(x0: number, x1: number, q: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = (q * i) / SAMPLES;
    out.push(`${chuteX(x0, x1, t).toFixed(2)} ${chuteY(t).toFixed(2)}`);
  }
  return out;
}

function chutePath(x0: number, x1: number, q: number): string {
  return `M ${chutePoints(x0, x1, q).join(' L ')}`;
}

/** 두 곡선 사이의 면. 위에서 아래로 `q` 만큼 자라난다. */
function ribbonPath(left: Chute, right: Chute, q: number): string {
  const down = chutePoints(left.x0, left.x1, q);
  const up = chutePoints(right.x0, right.x1, q).reverse();
  return `M ${down.join(' L ')} L ${up.join(' L ')} Z`;
}

/**
 * 척도. **먼저 한 번에 셈하고 그 다음에 그린다** — 그리면서 이웃의 지금 좌표를 읽으면
 * 순회 순서가 곧 숨은 상태가 된다 (프로토콜 4 절).
 */
type Geom = {
  /** 점수의 수. 값 라벨이 나눠 앉는 칸 수다. */
  n: number;
  /** 축이 보여 주는 범위. 가장 큰 |z| 에서 역산한다. */
  zSpan: number;
};

function geomOf(scores: readonly number[]): Geom {
  let reach = 1;
  for (const z of scores) reach = Math.max(reach, Math.abs(z));
  return { n: scores.length, zSpan: reach * AXIS_HEADROOM };
}

const xTop = (geom: Geom, z: number): number => AXIS_C + (z / geom.zSpan) * AXIS_REACH;
const xBand = (p: number): number => BAND_L + p * BAND_W;
const slotX = (geom: Geom, index: number): number =>
  PAD_X + ((index + 0.5) * (STAGE_W - 2 * PAD_X)) / Math.max(1, geom.n);

const chuteOf = (geom: Geom, at: { z: number; p: number }): Chute => ({
  x0: xTop(geom, at.z),
  x1: xBand(at.p),
});

/** 내려앉은 것 하나가 세운 손잡이들. `render` 안에서만 살고 밖으로 새지 않는다. */
type DrawnDrop = {
  reading: Reading;
  chute: SVGPathElement;
  /** 견줄 이웃이 없었으면 리본도 없다. */
  ribbon: SVGPathElement | null;
  bandTick: SVGLineElement;
  dot: SVGCircleElement;
  lead: SVGLineElement;
  value: SVGTextElement;
};

/** 정적 그리기가 세워 둔 손잡이. */
type Drawn = {
  geom: Geom;
  axisLine: SVGLineElement | null;
  arrowL: SVGPathElement | null;
  arrowR: SVGPathElement | null;
  /** 축 눈금과 값 라벨. 자리 번호가 오름차순 점수 목록의 자리다. */
  ticks: SVGLineElement[];
  zLabels: SVGTextElement[];
  infL: SVGTextElement | null;
  infR: SVGTextElement | null;
  bandRect: SVGRectElement | null;
  /** 0 쪽 · 1 쪽 두 벽. */
  walls: SVGLineElement[];
  /** 0 · 1 두 글자. */
  wallLabels: SVGTextElement[];
  /** 내려앉은 차례대로. */
  drops: DrawnDrop[];
  /** 자투리 면 둘과 그 바깥 테두리 둘. 눌리기 전에는 비어 있다. */
  tailFaces: SVGPathElement[];
  tailEdges: SVGPathElement[];
  /** 마지막으로 얻은 폭의 강조. 거둔 뒤에는 없다. */
  seg: SVGRectElement | null;
};

export const squashToProbabilityStageView: CanvasView = {
  canvas: { height: STAGE_H },

  // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 이 그림은 캔버스
  // 안쪽에만 그리므로 컨테이너를 건드리지 않는다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SquashToProbabilityScene> {
    const canvas = params.canvas;
    const c = getColors(params.theme);
    const ribbonAlpha = params.theme === 'dark' ? RIBBON_ALPHA_DARK : RIBBON_ALPHA_LIGHT;
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 그림의 층위. 여기 담기는 것은 걸음마다 통째로 다시 세운다. 재건 밖에 남는
    //    요소가 없으므로 정적 경로가 못 덮는 속성도 없다 (프로토콜 4 절).
    const gRibbon = el('g');
    const gTail = el('g');
    const gChute = el('g');
    const gBand = el('g');
    const gSeg = el('g');
    const gTick = el('g');
    const gFrame = el('g');
    const gAxis = el('g');
    const gMark = el('g');
    const gLead = el('g');
    const gText = el('g');
    const layers = [
      gRibbon,
      gTail,
      gChute,
      gBand,
      gSeg,
      gTick,
      gFrame,
      gAxis,
      gMark,
      gLead,
      gText,
    ];
    for (const g of layers) canvas.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 한 걸음이 마디 둘(떨어짐 · 박힘)을 잇달아 지난다. 가운데에 `destroy` 가 끼어들면
     * 남은 프레임이 이미 떨어져 나간 화면에 쓰므로, 마디마다 자기 번호가 아직
     * 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서
     * 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 걸음마다의 운동. 걸음 안에서 시작하고 끝난다 — 벽시계로 도는 상시 루프가
     * 아니므로 되짚기가 흔들리지 않는다.
     */
    function tween(ms: number, mine: number, draw: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        if (!alive(mine)) {
          finish();
          return;
        }
        waiters.add(finish);
        const started = Date.now();
        const step = (): void => {
          // 접혔거나 세대가 바뀌었으면 그 자리에서 손을 뗀다. 끝 상태로 밀면 방금
          // 세운 화면을 다시 흐트러뜨린다. 기다리던 약속은 반드시 푼다 (S-piece).
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            step();
          });
          frames.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 프레임을 기다리면 그 사이에 끝 자리가 번쩍인다.
        step();
      });
    }

    /** 축 위의 수는 정수라 그대로. 음수만 조판용 빼기 기호로 바꾼다. */
    const showScore = (value: number): string =>
      value < 0 ? `${MINUS}${Math.abs(value)}` : String(value);

    const showProbability = (value: number): string => value.toFixed(PROBABILITY_DIGITS);

    function captionText(scene: SquashToProbabilityScene): string {
      const caption = captionFor(scene);
      if (caption === null) return '';
      switch (caption.kind) {
        case 'axis':
          return t('caption.axis', 'The score axis runs on without end, in both directions.');
        case 'band':
          return t('caption.band', 'A probability may only sit between two walls.');
        case 'center':
          return t('caption.center', 'The middle of the axis lands in the middle of the band: {p}.', {
            p: showProbability(caption.p),
          });
        case 'squash':
          return t(
            'caption.squash',
            'z = {z} lands at {p}. A step of {dz} along the axis buys {dp} of the band.',
            {
              z: showScore(caption.z),
              p: showProbability(caption.p),
              dz: showScore(caption.axisGap),
              dp: showProbability(caption.bandGap),
            },
          );
        case 'tails':
          return t(
            'caption.tails',
            'The rest of the axis presses into two slivers — and the walls stay out of reach: {lo} / {hi}.',
            { lo: showProbability(caption.lowP), hi: showProbability(caption.highP) },
          );
      }
    }

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) {
        while (g.firstChild) g.removeChild(g.firstChild);
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: SquashToProbabilityScene): Drawn {
      rewind();

      const geom = geomOf(scene.scores);
      const drawn: Drawn = {
        geom,
        axisLine: null,
        arrowL: null,
        arrowR: null,
        ticks: [],
        zLabels: [],
        infL: null,
        infR: null,
        bandRect: null,
        walls: [],
        wallLabels: [],
        drops: [],
        tailFaces: [],
        tailEdges: [],
        seg: null,
      };

      // ── 식과 캡션. 축이 없어도 매번 명시로 세운다 — 재건 밖에 남는 글자가 없게.
      gText.appendChild(
        textNode(FORMULA, {
          x: PAD_X,
          y: FORMULA_Y,
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
        }),
      );
      gText.appendChild(
        textNode(captionText(scene), {
          x: AXIS_C,
          y: CAPTION_Y,
          fill: c.text,
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'text-anchor': 'middle',
        }),
      );

      // 축이 뻗기 전에는 식 말고 아무것도 없다. 아직 없는 것은 숨기지 않고 짓지
      // 않는다 (프로토콜 4 절).
      if (!scene.axis) return drawn;

      // ── 점수 축
      drawn.axisLine = el('line', {
        x1: AXIS_L,
        y1: AXIS_Y,
        x2: AXIS_R,
        y2: AXIS_Y,
        stroke: c.text,
        'stroke-width': 1.5,
      });
      drawn.arrowL = el('path', {
        d: `M ${AXIS_L} ${AXIS_Y} L ${AXIS_L + ARROW_LEN} ${AXIS_Y - ARROW_HALF} L ${AXIS_L + ARROW_LEN} ${AXIS_Y + ARROW_HALF} Z`,
        fill: c.text,
      });
      drawn.arrowR = el('path', {
        d: `M ${AXIS_R} ${AXIS_Y} L ${AXIS_R - ARROW_LEN} ${AXIS_Y - ARROW_HALF} L ${AXIS_R - ARROW_LEN} ${AXIS_Y + ARROW_HALF} Z`,
        fill: c.text,
      });
      for (const node of [drawn.axisLine, drawn.arrowL, drawn.arrowR]) gAxis.appendChild(node);

      scene.scores.forEach((z, index) => {
        const x = xTop(geom, z);
        const tick = el('line', {
          x1: x,
          y1: AXIS_Y - TICK_HALF,
          x2: x,
          y2: AXIS_Y + TICK_HALF,
          stroke: c.text,
          'stroke-width': 1.5,
        });
        const label = textNode(showScore(z), {
          x,
          y: ZLABEL_Y,
          fill: c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        });
        drawn.ticks[index] = tick;
        drawn.zLabels[index] = label;
        gAxis.appendChild(tick);
        gAxis.appendChild(label);
      });

      drawn.infL = textNode(NEG_INFINITY, {
        x: AXIS_L,
        y: ZLABEL_Y,
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      drawn.infR = textNode(POS_INFINITY, {
        x: AXIS_R,
        y: ZLABEL_Y,
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        'text-anchor': 'middle',
      });
      gAxis.appendChild(drawn.infL);
      gAxis.appendChild(drawn.infR);

      // ── 확률의 띠. 벽은 꼬리가 눌린 만큼 위아래로 더 버틴다.
      if (scene.band) {
        drawn.bandRect = el('rect', {
          x: BAND_L,
          y: BAND_TOP,
          width: BAND_W,
          height: BAND_BOT - BAND_TOP,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        });
        gBand.appendChild(drawn.bandRect);

        const grow = scene.tails ? WALL_GROW : 0;
        for (const x of [BAND_L, BAND_R]) {
          const wall = el('line', {
            x1: x,
            y1: WALL_TOP - grow,
            x2: x,
            y2: WALL_BOT + grow,
            stroke: c.text,
            'stroke-width': 3,
          });
          drawn.walls.push(wall);
          gFrame.appendChild(wall);
        }
        // 도형에 새긴 0 · 1 은 벽의 이름이라 표식이다 — 키를 만들지 않는다 (C10).
        for (const [x, glyph] of [
          [BAND_L - WALL_LABEL_DX, '0'],
          [BAND_R + WALL_LABEL_DX, '1'],
        ] as const) {
          const label = textNode(glyph, {
            x,
            y: (WALL_TOP + WALL_BOT) / 2 + 4,
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            'text-anchor': 'middle',
          });
          drawn.wallLabels.push(label);
          gFrame.appendChild(label);
        }
      }

      // ── 내려앉은 점수들. 깔때기와 리본이 쌓여 남는다 — 같은 축의 거리가 같은
      //    확률을 사지 못한다는 것이 그 모양에서 읽히는 자리다.
      const tail = tailValues(scene);
      for (const reading of readings(scene)) {
        const mineChute = chuteOf(geom, reading);
        const to = mineChute.x1;

        const chute = el('path', {
          d: chutePath(mineChute.x0, to, 1),
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1,
        });
        gChute.appendChild(chute);

        let ribbon: SVGPathElement | null = null;
        if (reading.from !== null) {
          const other = chuteOf(geom, reading.from);
          const [a, b] = other.x0 < mineChute.x0 ? [other, mineChute] : [mineChute, other];
          ribbon = el('path', {
            d: ribbonPath(a, b, 1),
            fill: c.accent,
            'fill-opacity': ribbonAlpha,
          });
          gRibbon.appendChild(ribbon);
        }

        const bandTick = el('line', {
          x1: to,
          y1: BAND_TOP,
          x2: to,
          y2: BAND_BOT,
          stroke: c.text,
          'stroke-width': 2,
        });
        gTick.appendChild(bandTick);

        const dot = el('circle', { cx: to, cy: BAND_BOT, r: 3, fill: c.text });
        gMark.appendChild(dot);

        const slot = slotX(geom, reading.index);
        const lead = el('line', {
          x1: to,
          y1: BAND_BOT,
          x2: slot,
          y2: LEAD_Y,
          stroke: c.border,
          'stroke-width': 1,
        });
        // 자투리의 안쪽 끝 두 값만 짚는다 — 끝없는 반직선이 통째로 들어간 자리다.
        const edge =
          tail !== null &&
          scene.tails &&
          (reading.index === 0 || reading.index === geom.n - 1);
        const value = textNode(reading.p.toFixed(VALUE_DIGITS), {
          x: slot,
          y: SLOT_Y,
          fill: edge ? c.itemActive : c.text,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'text-anchor': 'middle',
        });
        gLead.appendChild(lead);
        gLead.appendChild(value);

        drawn.drops.push({ reading, chute, ribbon, bandTick, dot, lead, value });
      }

      // ── 양 끝 자투리. 축의 나머지 전부가 여기로 눌려 든다.
      if (scene.tails && tail !== null && geom.n > 0) {
        const lowInner: Chute = { x0: xTop(geom, scene.scores[0]), x1: xBand(tail.lowP) };
        const lowOuter: Chute = { x0: AXIS_L, x1: BAND_L };
        const highInner: Chute = {
          x0: xTop(geom, scene.scores[geom.n - 1]),
          x1: xBand(tail.highP),
        };
        const highOuter: Chute = { x0: AXIS_R, x1: BAND_R };

        for (const [a, b] of [
          [lowOuter, lowInner],
          [highInner, highOuter],
        ]) {
          const face = el('path', {
            d: ribbonPath(a, b, 1),
            fill: c.accent,
            'fill-opacity': ribbonAlpha,
          });
          drawn.tailFaces.push(face);
          gTail.appendChild(face);
        }
        for (const outer of [lowOuter, highOuter]) {
          const edge = el('path', {
            d: chutePath(outer.x0, outer.x1, 1),
            fill: 'none',
            stroke: c.textMuted,
            'stroke-width': 1,
            'stroke-dasharray': '3 3',
          });
          drawn.tailEdges.push(edge);
          gTail.appendChild(edge);
        }
      }

      // ── 마지막으로 얻은 폭. 거둔 뒤에는 없다 — 지나가는 강조다.
      const span = shownSpan(scene);
      if (span !== null) {
        const from = xBand(span.fromP);
        const to = xBand(span.toP);
        drawn.seg = el('rect', {
          x: Math.min(from, to),
          y: BAND_TOP,
          width: Math.abs(to - from),
          height: BAND_BOT - BAND_TOP,
          fill: c.accent,
          'fill-opacity': SEG_ALPHA,
        });
        gSeg.appendChild(drawn.seg);
      }

      return drawn;
    }

    // ── 걸음마다의 운동 ───────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 운동은 **아직 못 온 만큼을 뒤로
    // 물리는** 꼴이다. 물리는 일은 프레임을 기다리지 않고 곧바로 한다.

    /** 축이 한가운데에서 양쪽 끝까지 뻗어 나간다. */
    async function flowAxis(
      scene: SquashToProbabilityScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const { geom, axisLine, arrowL, arrowR, infL, infR } = drawn;
      if (axisLine === null || arrowL === null || arrowR === null) return;
      await tween(AXIS_MS, mine, (e) => {
        const reached = AXIS_REACH * e;
        axisLine.setAttribute('x1', String(AXIS_C - reached));
        axisLine.setAttribute('x2', String(AXIS_C + reached));
        arrowL.setAttribute('transform', `translate(${AXIS_REACH - reached} 0)`);
        arrowR.setAttribute('transform', `translate(${reached - AXIS_REACH} 0)`);
        scene.scores.forEach((z, index) => {
          const shown = Math.abs(xTop(geom, z) - AXIS_C) <= reached ? 1 : 0;
          drawn.ticks[index]?.setAttribute('opacity', String(shown));
          drawn.zLabels[index]?.setAttribute('opacity', String(shown));
        });
        const tail = Math.max(0, (e - 0.8) * 5);
        infL?.setAttribute('opacity', String(tail));
        infR?.setAttribute('opacity', String(tail));
      });
    }

    /** 띠가 한가운데에서 자라나 두 벽에 부딪혀 멈춘다. */
    async function flowBand(drawn: Drawn, mine: number): Promise<void> {
      const rect = drawn.bandRect;
      const [wallL, wallR] = drawn.walls;
      const [zero, one] = drawn.wallLabels;
      if (!rect || !wallL || !wallR || !zero || !one) return;
      await tween(BAND_MS, mine, (e) => {
        const half = (BAND_W / 2) * e;
        rect.setAttribute('x', String(AXIS_C - half));
        rect.setAttribute('width', String(half * 2));
        wallL.setAttribute('x1', String(AXIS_C - half));
        wallL.setAttribute('x2', String(AXIS_C - half));
        wallR.setAttribute('x1', String(AXIS_C + half));
        wallR.setAttribute('x2', String(AXIS_C + half));
        zero.setAttribute('x', String(AXIS_C - half - WALL_LABEL_DX));
        one.setAttribute('x', String(AXIS_C + half + WALL_LABEL_DX));
        const shown = Math.min(1, Math.max(0, (e - 0.7) * 3.4));
        zero.setAttribute('opacity', String(shown));
        one.setAttribute('opacity', String(shown));
      });
    }

    /**
     * 점수 하나가 축을 떠나 띠로 내려앉고, 이웃과의 사이에서 폭을 얻는다.
     *
     * 출발 자리는 `prev` 에서 꺼내지 않는다 — 축 위의 자리는 그 점수의 값이 정하고
     * 견줄 이웃은 자취가 말한다 (S-scene).
     */
    async function flowSquash(drawn: Drawn, mine: number): Promise<void> {
      const drop = drawn.drops[drawn.drops.length - 1];
      if (drop === undefined) return;
      const { geom } = drawn;
      const { reading } = drop;
      const mineChute = chuteOf(geom, reading);
      const from = mineChute.x0;
      const to = mineChute.x1;
      const slot = slotX(geom, reading.index);
      const seg = drawn.seg;
      const other = reading.from === null ? null : chuteOf(geom, reading.from);
      const claimFrom = other === null ? null : other.x1;
      const pair: [Chute, Chute] | null =
        other === null ? null : other.x0 < from ? [other, mineChute] : [mineChute, other];

      // ── 아직 안 온 만큼을 뒤로 물린다.
      drawn.ticks[reading.index]?.setAttribute('stroke', c.itemActive);
      drawn.zLabels[reading.index]?.setAttribute('fill', c.itemActive);
      drop.dot.setAttribute('r', '4');
      drop.dot.setAttribute('fill', c.itemActive);
      drop.bandTick.setAttribute('y2', String(BAND_TOP));
      drop.lead.setAttribute('x2', String(to));
      drop.lead.setAttribute('y2', String(BAND_BOT));
      drop.value.setAttribute('opacity', '0');
      if (seg !== null && claimFrom !== null) {
        seg.setAttribute('x', String(claimFrom));
        seg.setAttribute('width', '0');
      }

      await tween(DROP_MS, mine, (e) => {
        drop.chute.setAttribute('d', chutePath(from, to, e));
        drop.dot.setAttribute('cx', String(chuteX(from, to, e)));
        drop.dot.setAttribute('cy', String(chuteY(e)));
        if (drop.ribbon !== null && pair !== null) {
          drop.ribbon.setAttribute('d', ribbonPath(pair[0], pair[1], e));
        }
      });
      if (!alive(mine)) return;

      // 띠 안으로 박아 넣으면서 이웃과의 사이에 얻은 폭을 연다.
      await tween(DRIVE_MS, mine, (e) => {
        const depth = BAND_TOP + (BAND_BOT - BAND_TOP) * e;
        drop.bandTick.setAttribute('y2', String(depth));
        drop.dot.setAttribute('cy', String(depth));
        drop.lead.setAttribute('x2', String(to + (slot - to) * e));
        drop.lead.setAttribute('y2', String(BAND_BOT + (LEAD_Y - BAND_BOT) * e));
        drop.value.setAttribute('opacity', String(Math.max(0, e * 2 - 1)));
        if (seg !== null && claimFrom !== null) {
          const edge = claimFrom + (to - claimFrom) * e;
          seg.setAttribute('x', String(Math.min(claimFrom, edge)));
          seg.setAttribute('width', String(Math.abs(edge - claimFrom)));
        }
      });
    }

    /** 축의 나머지 전부가 양 끝 자투리로 눌려 든다. 벽은 그만큼 더 버틴다. */
    async function flowTails(
      scene: SquashToProbabilityScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const tail = tailValues(scene);
      const { geom } = drawn;
      if (tail === null || geom.n === 0 || drawn.tailFaces.length < 2) return;
      const lowInner: Chute = { x0: xTop(geom, scene.scores[0]), x1: xBand(tail.lowP) };
      const lowOuter: Chute = { x0: AXIS_L, x1: BAND_L };
      const highInner: Chute = {
        x0: xTop(geom, scene.scores[geom.n - 1]),
        x1: xBand(tail.highP),
      };
      const highOuter: Chute = { x0: AXIS_R, x1: BAND_R };
      const [lowFace, highFace] = drawn.tailFaces;
      const [lowEdge, highEdge] = drawn.tailEdges;

      await tween(TAILS_MS, mine, (e) => {
        lowFace?.setAttribute('d', ribbonPath(lowOuter, lowInner, e));
        highFace?.setAttribute('d', ribbonPath(highInner, highOuter, e));
        lowEdge?.setAttribute('d', chutePath(lowOuter.x0, lowOuter.x1, e));
        highEdge?.setAttribute('d', chutePath(highOuter.x0, highOuter.x1, e));
        const grow = WALL_GROW * e;
        for (const wall of drawn.walls) {
          wall.setAttribute('y1', String(WALL_TOP - grow));
          wall.setAttribute('y2', String(WALL_BOT + grow));
        }
      });
    }

    /**
     * 마지막으로 얻은 폭의 강조를 거둔다.
     *
     * 다 선 화면에는 없는 요소라 운동 동안에만 짓는다 — 정적 그리기가 숨겨 두면 앞
     * 걸음의 자리가 함께 남는다 (프로토콜 4 절 17).
     */
    async function flowSettle(
      scene: SquashToProbabilityScene,
      mine: number,
    ): Promise<void> {
      const span = gainedSpan(scene);
      if (span === null) return;
      const from = xBand(span.fromP);
      const to = xBand(span.toP);
      const rect = el('rect', {
        x: Math.min(from, to),
        y: BAND_TOP,
        width: Math.abs(to - from),
        height: BAND_BOT - BAND_TOP,
        fill: c.accent,
        'fill-opacity': SEG_ALPHA,
      });
      gSeg.appendChild(rect);
      await tween(SETTLE_MS, mine, (e) => {
        const edge = from + (to - from) * e;
        rect.setAttribute('x', String(Math.min(edge, to)));
        rect.setAttribute('width', String(Math.abs(to - edge)));
      });
      rect.remove();
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: SquashToProbabilityScene,
      _prev: SquashToProbabilityScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 프레임도 타이머도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'axis':
          await flowAxis(next, drawn, mine);
          break;
        case 'band':
          await flowBand(drawn, mine);
          break;
        case 'squash':
          await flowSquash(drawn, mine);
          break;
        case 'tails':
          await flowTails(next, drawn, mine);
          break;
        case 'settle':
          await flowSettle(next, mine);
          break;
      }
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
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 걸어 둔 것을 거둔 다음 기다리던 것을 깨운다. 취소된 프레임은 아예 불리지
        // 않으므로 여기서 풀지 않으면 `render` 의 await 가 영영 안 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const g of layers) g.remove();
      },
    };
  },
};
