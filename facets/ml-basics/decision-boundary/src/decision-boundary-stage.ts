/**
 * decision-boundary stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * 화면은 둘로 나뉜다. 왼쪽은 입력 평면이고 오른쪽은 **확률자**다. 산점도는
 * 주인공이 아니라 무대다 — 이 조각의 주인공은 확률이고, 평면은 그 확률이
 * 매겨지는 자리다.
 *
 *   점 하나를 물으면  평면의 점이 확률 색으로 물들고, 같은 값이 확률자로
 *                      날아가 꽂힌다 (자리가 옮겨 가는 운동).
 *   여덟이 끝나면      확률자 위에서 두 뭉치 사이의 빈 구간이 위아래에서
 *                      조여 들어와 "반 근처에는 아무것도 없다" 를 보인다.
 *   평면을 훑으면      쓸개바가 왼쪽에서 오른쪽으로 지나가며 격자가 확률
 *                      농도로 물든다. 경계 부근은 옅어 저절로 흰 이음매가 된다.
 *   넘나드는 칸        그 이음매의 칸들이 부풀었다 제자리로 오므라들며 뜬다.
 *   선                 **마지막에** 한쪽 끝에서 다른 끝으로 그어진다.
 *
 * ── 채움과 테두리를 갈랐다
 *
 * 옛 화면은 넘나드는 칸을 **accent 로 채우고 격자 전체를 0.3 으로 눌렀다**.
 * 그러면 칸 하나에 불을 켜는 대가로 **평면 전체의 확률 농도가 함께 물러난다** —
 * "자리마다 확률이 다르다" 가 이 조각의 앞 절반인데 그것이 끝 화면에서 흐려졌고,
 * 불 켠 칸은 하필 농도가 가장 옅은 이음매를 덮어 그 자리의 값을 지웠다
 * (프로토콜 4 절 — 한 축에 값을 둘 이상 욱여넣지 않는다).
 *
 * - **채움 = 값의 형편** — 격자 칸의 색과 농도, 점의 물듦, 꽂힌 확률.
 * - **테두리 = 짚음의 표식** — 넘나드는 칸의 테, 이미 물어 본 점의 잉크.
 *
 * 두 축이 부딪히지 않으므로 완주 화면에 **확률의 농도**와 **넘나드는 칸**과
 * **선** 셋이 함께 선다. 격자는 이제 눌리지 않는다.
 *
 * 좌표는 전부 여기서 캔버스로부터 역산한다 (S-piece). 장면이 주는 것은
 * 구조뿐이다 — 무게 · 치우침 · 점 · 입력 공간의 범위 · 격자 해상도.
 *
 * 화면의 글자는 전부 표식이다 (C10 판정 1·3) — 축 이름 `x` / `y`, 확률자의
 * 눈금 `0` / `0.5` / `1`, 기호 `p`, 그리고 `z = x + y − 5.5` 같은 수식 표기.
 * 문장은 캡션 하나뿐이고 그것은 `params.t` 로 조회한다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  boundaryReading,
  captionFor,
  cellProbability,
  convictionOf,
  lastReading,
  probedProbabilities,
  readingAt,
  sideOf,
  spreadOf,
  type DecisionBoundaryScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 PIECE_CANVAS_W 로 정한다 (S-view). */
const H = 360;
const W = PIECE_CANVAS_W;
const PAD_R = 20;

// ── 왼쪽: 입력 평면 ──────────────────────────────────────────────────────
const PLOT_L = 34;
const PLOT_T = 18;
const PLOT_B = 302;
/** 두 축의 축척이 같아야 선이 정직하게 보인다 — 정사각으로 잡는다. */
const PLOT_SIDE = PLOT_B - PLOT_T;
const PLOT_R = PLOT_L + PLOT_SIDE;

// ── 오른쪽: 확률자 ───────────────────────────────────────────────────────
const CARD_X = 344;
const CARD_Y = 18;
const CARD_H = 84;
const CARD_PAD = 14;

const RULER_TOP = 134;
const RULER_BOT = PLOT_B;
const RULER_X = 384;
const RULER_W = 64;
/** 눈금 글자는 자의 왼쪽에 붙는다. */
const TICK_X = RULER_X - 6;
/** 꽂힌 확률이 앉는 첫 자리. 겹치면 오른쪽으로 한 칸씩 밀린다. */
const PIN_X0 = RULER_X + RULER_W + 18;
const PIN_GAP = 22;
const PIN_R = 6;
/** 같은 높이로 보는 한계. 이보다 가까우면 옆으로 민다. */
const PIN_MIN_DY = 13;
/** 빈 구간을 재는 I-빔의 자리. */
const GAP_X0 = 534;
const GAP_X1 = W - PAD_R - 2;

const CAPTION_Y = H - 12;

// ── 확률 색 ──────────────────────────────────────────────────────────────
// 두 진영을 가리키는 식별 색이므로 categorical(2) 다 (S-view 결정 순서 3).
// 색판의 크기는 **진영의 수**에서 오지 드러난 수에서 오지 않는다 (함정 12).
// 농도는 색이 아니라 불투명도로 준다 — |p − 0.5| 가 0 에 가까울수록 옅어져
// 경계가 저절로 옅은 이음매로 드러난다. 선을 그어 만든 것이 아니다.
const CLASS_TONES = categorical(2, 'vivid');
/** p < 0.5 쪽. */
const CLASS_LOW = 0;
/** p > 0.5 쪽. */
const CLASS_HIGH = 1;
const FIELD_MAX_ALPHA = 0.62;
const POINT_MIN_ALPHA = 0.35;

/** 넘나드는 칸의 테 — 표식이 사는 축이다. */
const CROSS_STROKE_W = 1.4;
const BOUNDARY_STROKE_W = 2.6;
const HALF_STROKE_W = 1.4;

// ── 걸음마다의 운동 길이 ─────────────────────────────────────────────────
const PROBE_MS = 270;
const SPREAD_MS = 420;
const SCAN_MS = 440;
const CROSS_MS = 420;
const LINE_MS = 640;
/**
 * 마침 걸음의 짚기.
 *
 * 이 걸음은 캡션만 갈리고 그릴 것이 없어 벽시계가 `stepMs` 하나뿐이었다
 * (800ms 미만 — 프로토콜 4 절 얇은 걸음). 걸음이 하는 말이 "선이 앉은 자리가
 * 곧 p 가 반인 자리다" 이므로 **짚는** 동사를 골라, 선과 확률자의 반 눈금을
 * 한 시계로 함께 굵혔다 편다. 진폭이 양 끝에서 0 이라 멎은 화면은 어느 걸음에서
 * 오든 같다 (함정 30).
 */
const SETTLE_MS = 260;
const FRAME_MS = 16;

/** 확률자 눈금 — 표식이라 상수로 둔다 (C10). */
const TICKS: ReadonlyArray<{ p: number; text: string }> = [
  { p: 1, text: '1' },
  { p: 0.5, text: '0.5' },
  { p: 0, text: '0' },
];

/** 축 이름을 마지막 눈금 자리에 세운다. 그 앞의 눈금만 숫자로 적는다. */
const AXIS_TICKS: readonly number[] = [0, 2, 4];
const AXIS_MAX_LABEL_X = 'x';
const AXIS_MAX_LABEL_Y = 'y';
const PLACEHOLDER = '—';
const ARROW = '→';
const MINUS = '−';

/** 그라디언트 id 가 한 문서 안에서 겹치지 않게 하는 일련번호. */
let gradientSeq = 0;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 소수 꼬리를 떼고 짧게. 축·수식에 쓰는 표식용. */
function f(n: number): string {
  const s = Math.abs(n) < 1e-9 ? '0' : String(Number(n.toFixed(4)));
  return s.replace('-', MINUS);
}

/** 무게 1 은 곱셈 기호 없이 변수만 적는다 — `1·x` 는 수식이 아니라 잡음이다. */
function term(w: number, name: string): string {
  const a = Math.abs(w);
  return a === 1 ? name : `${f(a)}·${name}`;
}

function signed(n: number, digits: number): string {
  const v = n.toFixed(digits);
  return n < 0 ? v.replace('-', MINUS) : `+${v}`;
}

function signOf(w: number): string {
  return w < 0 ? MINUS : '+';
}

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/**
 * 자리를 **먼저 한 번에 셈하고 그 다음에 그린다.**
 *
 * 그리면서 이웃의 지금 좌표를 읽으면 순회 순서가 곧 숨은 상태가 된다
 * (프로토콜 4 절).
 */
type Geom = {
  cellW: number;
  cellH: number;
  px: (x: number) => number;
  py: (y: number) => number;
  rulerY: (p: number) => number;
};

function geomOf(scene: DecisionBoundaryScene): Geom {
  const span = scene.domain.max - scene.domain.min;
  const scale = PLOT_SIDE / span;
  return {
    cellW: PLOT_SIDE / scene.grid.cols,
    cellH: PLOT_SIDE / scene.grid.rows,
    px: (x) => PLOT_L + (x - scene.domain.min) * scale,
    py: (y) => PLOT_B - (y - scene.domain.min) * scale,
    rulerY: (p) => RULER_BOT - p * (RULER_BOT - RULER_TOP),
  };
}

/**
 * 꽂힌 확률들이 앉는 자리.
 *
 * 옛 화면은 이미 꽂은 것들의 표(`pinned`)를 들고 **제가 꽂아 둔 것을 도로 읽어**
 * 다음 칸을 정했다. 여기서는 꽂힌 목록 전체를 받아 매번 처음부터 나누므로 어느
 * 걸음에서 와도 같은 자리가 나온다.
 */
function pinPlaces(
  probabilities: readonly number[],
  rulerY: (p: number) => number,
): Array<{ x: number; y: number }> {
  const taken: Array<{ y: number; slot: number }> = [];
  const out: Array<{ x: number; y: number }> = [];
  for (const p of probabilities) {
    const y = rulerY(p);
    let slot = 0;
    for (;;) {
      const clash = taken.some((q) => q.slot === slot && Math.abs(q.y - y) < PIN_MIN_DY);
      if (!clash) break;
      slot += 1;
    }
    taken.push({ y, slot });
    out.push({ x: PIN_X0 + slot * PIN_GAP, y });
  }
  return out;
}

/** 입력 공간의 네 변과 만나는 두 점 — 선이 어디서 어디까지인지. */
function clipLine(scene: DecisionBoundaryScene): Array<{ x: number; y: number }> {
  const wx = scene.weights.x;
  const wy = scene.weights.y;
  const bias = scene.bias;
  const lo = scene.domain.min;
  const hi = scene.domain.max;
  const hits: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number): void => {
    if (x < lo - 1e-9 || x > hi + 1e-9 || y < lo - 1e-9 || y > hi + 1e-9) return;
    if (hits.some((q) => Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6)) return;
    hits.push({ x, y });
  };
  if (Math.abs(wy) > 1e-9) {
    push(lo, -(bias + wx * lo) / wy);
    push(hi, -(bias + wx * hi) / wy);
  }
  if (Math.abs(wx) > 1e-9) {
    push(-(bias + wy * lo) / wx, lo);
    push(-(bias + wy * hi) / wx, hi);
  }
  return hits.slice(0, 2);
}

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  geom: Geom;
  /** 훑어 칠한 칸. 자리 번호가 곧 열 번호이고 아직 안 훑은 열은 없다. */
  columns: SVGRectElement[][];
  /** 넘나드는 칸의 테. `scene.crossings` 와 차례가 같다. */
  marks: Array<{ node: SVGRectElement; x: number; y: number }>;
  /** 확률자에 꽂힌 것들. 자리 번호가 곧 점의 번호다. */
  pins: SVGCircleElement[];
  pinAt: Array<{ x: number; y: number }>;
  /** 빈 구간을 재는 반 눈금 선. 아직 안 쟀으면 없다. */
  halfLine: SVGLineElement | null;
  armTop: SVGLineElement | null;
  armBot: SVGLineElement | null;
  beam: SVGLineElement | null;
  /** 경계선과 그 길이. 아직 안 그었으면 없다. */
  boundary: SVGLineElement | null;
  boundaryLen: number;
};

export const decisionBoundaryStageView: CanvasView = {
  canvas: { height: H },

  // 러너가 캔버스를 컨테이너에 먼저 붙이고 mount 를 부른다. 이 그림은 캔버스
  // 안쪽에만 그리므로 컨테이너를 건드리지 않는다 (S-view).
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<DecisionBoundaryScene> {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가
    // 먼저 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    // ── 층. 여기 담기는 것은 걸음마다 통째로 다시 세운다. `defs` 만 예외인데
    //    거기 든 그라디언트는 장면과 무관한 고정 색자라 다시 지을 것이 없다
    //    (다시 지으면 id 가 걸음마다 갈린다).
    const defs = el('defs');
    const gField = el('g');
    const gCross = el('g');
    const gAxis = el('g');
    const gBoundary = el('g');
    const gPoint = el('g');
    const gFx = el('g');
    const gPanel = el('g');
    const gRuler = el('g');
    const gCaption = el('g');
    const layers = [gField, gCross, gAxis, gBoundary, gPoint, gFx, gPanel, gRuler, gCaption];
    svg.appendChild(defs);
    for (const layer of layers) svg.appendChild(layer);

    // ── 확률자의 색자. 한 번만 짓는다.
    gradientSeq += 1;
    const gradId = `db-ruler-${gradientSeq}`;
    const grad = el('linearGradient', {
      id: gradId, x1: 0, y1: RULER_BOT, x2: 0, y2: RULER_TOP,
      gradientUnits: 'userSpaceOnUse',
    });
    const stops: ReadonlyArray<[number, number, number]> = [
      [0, CLASS_LOW, 0.85], [0.49, CLASS_LOW, 0.04],
      [0.51, CLASS_HIGH, 0.04], [1, CLASS_HIGH, 0.85],
    ];
    for (const [offset, tone, opacity] of stops) {
      grad.appendChild(el('stop', {
        offset, 'stop-color': CLASS_TONES[tone] ?? c.text, 'stop-opacity': opacity,
      }));
    }
    defs.appendChild(grad);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 함수가 `await` 를 지나므로 그 사이에 `destroy` 가 끼어들 수 있다.
     * 마디마다 자기 번호가 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이
     * 아니다 — 러너는 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 걸음마다의 운동. 걸음 안에서 시작하고 끝난다 — 벽시계로 도는 상시 루프가
     * 아니므로 되짚기가 흔들리지 않는다.
     *
     * 프레임 대신 `setTimeout` 으로 도는 것은 이 조각의 사정이다. 러너가 접혀도
     * `destroy` 가 타이머를 거두고 **기다리던 약속을 깨운다** — 취소된 타이머는
     * 아예 불리지 않으므로 그 길이 없으면 `render` 의 await 가 영영 안 돌아온다.
     */
    function tween(ms: number, mine: number, apply: (t: number) => void): Promise<void> {
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
          // 세운 화면을 다시 흐트러뜨린다. 기다리던 약속은 반드시 푼다.
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          apply(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            step();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 한 틱을 기다리면 그 사이에 끝 자리가 번쩍인다.
        step();
      });
    }

    // ── 값이 정하는 칠 ───────────────────────────────────────────────────

    /** 채움이 말하는 축 — 그 자리가 어느 진영인가. */
    function toneOf(p: number): string {
      return CLASS_TONES[sideOf(p) === 'high' ? CLASS_HIGH : CLASS_LOW] ?? c.text;
    }

    /** 격자 칸의 농도. 반에서 멀수록 짙다. */
    function cellAlpha(p: number): string {
      return String(FIELD_MAX_ALPHA * convictionOf(p));
    }

    function captionText(scene: DecisionBoundaryScene): string {
      const caption = captionFor(scene);
      if (caption === null) return '';
      switch (caption.kind) {
        case 'probe':
          return t(
            'caption.probe',
            'Ask each point for a probability, not a side — {k} of {n}.',
            { k: caption.k, n: caption.n },
          );
        case 'spread':
          return t('caption.spread', 'The eight fell to the two ends. Nothing landed near half.');
        case 'scan':
          return t('caption.scan', 'So ask every spot on the plane the same question.');
        case 'crossing':
          return t('caption.crossing', 'Light up the cells where the probability crosses half.');
        case 'boundary':
          return t('caption.boundary', 'Join them and the boundary appears. It was never drawn first.');
        case 'done':
          return t('caption.done', 'The line sits where p = 0.5 — not midway between the two clumps.');
      }
    }

    /** 카드의 가운뎃줄과 아랫줄. 한 자리에 세 뜻이 실려 있던 곳이다. */
    function cardLines(scene: DecisionBoundaryScene): { z: string; p: string } {
      if (scene.revealed) {
        // 평면에는 이름표를 두지 않는다. 45° 선 곁에 판을 놓으면 어느 쪽에 두든
        // 모서리가 선이나 점을 문다. 선의 정체는 낱점의 z 와 p 를 재던 바로 그
        // 카드가 말한다 — 같은 자리에서 답이 닫히는 편이 낫다.
        const b = boundaryReading(scene);
        return {
          z: `z = 0 ${ARROW} ${term(b.wx, 'x')} ${signOf(b.wy)} ${term(b.wy, 'y')} = ${f(b.rhs)}`,
          p: `p = ${b.p.toFixed(3)}`,
        };
      }
      // 낱점 하나를 셈하던 국면이 끝나면 카드에서 그 수를 내린다.
      const reading = scene.spread ? null : lastReading(scene);
      if (reading === null) return { z: `z = ${PLACEHOLDER}`, p: `p = ${PLACEHOLDER}` };
      return {
        z:
          `z = ${term(scene.weights.x, f(reading.x))} ${signOf(scene.weights.y)} `
          + `${term(scene.weights.y, f(reading.y))} ${signOf(scene.bias)} `
          + `${f(Math.abs(scene.bias))} = ${signed(reading.z, 2)}`,
        p: `p = ${reading.p.toFixed(3)}`,
      };
    }

    // ── 장면 세우기 ──────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: DecisionBoundaryScene): Drawn {
      rewind();
      const geom = geomOf(scene);
      const drawn: Drawn = {
        geom,
        columns: [],
        marks: [],
        pins: [],
        pinAt: [],
        halfLine: null,
        armTop: null,
        armBot: null,
        beam: null,
        boundary: null,
        boundaryLen: 0,
      };

      // ── 훑어 칠한 격자. **쌓이는 자취다** — 물결이 지나간 열은 남는다.
      //    아직 안 훑은 열은 숨기지 않고 짓지 않는다 (프로토콜 4 절 17).
      for (let col = 0; col < scene.scanned; col += 1) {
        const column: SVGRectElement[] = [];
        for (let row = 0; row < scene.grid.rows; row += 1) {
          const p = cellProbability(scene, col, row);
          const rect = el('rect', {
            x: PLOT_L + col * geom.cellW,
            y: PLOT_B - (row + 1) * geom.cellH,
            width: geom.cellW + 0.5,
            height: geom.cellH + 0.5,
            fill: toneOf(p),
            'fill-opacity': cellAlpha(p),
          });
          gField.appendChild(rect);
          column.push(rect);
        }
        drawn.columns.push(column);
      }

      // ── 넘나드는 칸. **테두리가 말하는 축**이라 아래의 농도를 덮지 않는다.
      if (scene.crossed) {
        for (const idx of scene.crossings) {
          const col = Math.floor(idx / scene.grid.rows);
          const row = idx % scene.grid.rows;
          const x = PLOT_L + col * geom.cellW;
          const y = PLOT_B - (row + 1) * geom.cellH;
          const node = el('rect', {
            x, y, width: geom.cellW + 0.5, height: geom.cellH + 0.5,
            fill: 'none', stroke: c.accent, 'stroke-width': CROSS_STROKE_W,
          });
          gCross.appendChild(node);
          drawn.marks.push({ node, x, y });
        }
      }

      // ── 평면의 틀.
      gAxis.appendChild(el('rect', {
        x: PLOT_L, y: PLOT_T, width: PLOT_SIDE, height: PLOT_SIDE,
        fill: 'none', stroke: c.border, 'stroke-width': 1,
      }));
      for (const v of AXIS_TICKS) {
        gAxis.appendChild(el('text', {
          x: geom.px(v), y: PLOT_B + 16, fill: c.textMuted,
          'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'middle',
        })).textContent = f(v);
        gAxis.appendChild(el('text', {
          x: PLOT_L - 8, y: geom.py(v) + 4, fill: c.textMuted,
          'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'end',
        })).textContent = f(v);
      }
      gAxis.appendChild(el('text', {
        x: PLOT_R, y: PLOT_B + 16, fill: c.text,
        'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'middle',
      })).textContent = AXIS_MAX_LABEL_X;
      gAxis.appendChild(el('text', {
        x: PLOT_L - 8, y: PLOT_T + 4, fill: c.text,
        'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'end',
      })).textContent = AXIS_MAX_LABEL_Y;

      // ── 경계선. 그었으면 끝 자리에 통째로 선다 — 운동은 뒤로 물려서 흐른다.
      if (scene.revealed) {
        const hits = clipLine(scene);
        const a = hits[0];
        const b = hits[1];
        if (a !== undefined && b !== undefined) {
          const ax = geom.px(a.x);
          const ay = geom.py(a.y);
          const bx = geom.px(b.x);
          const by = geom.py(b.y);
          const line = el('line', {
            x1: ax, y1: ay, x2: bx, y2: by,
            stroke: c.text, 'stroke-width': BOUNDARY_STROKE_W, 'stroke-linecap': 'round',
          });
          gBoundary.appendChild(line);
          drawn.boundary = line;
          drawn.boundaryLen = Math.hypot(bx - ax, by - ay);
        }
      }

      // ── 점. 채움이 그 점의 확률을, 테두리가 "이미 물었나" 를 말한다.
      for (let i = 0; i < scene.points.length; i += 1) {
        const reading = readingAt(scene, i);
        if (reading === null) continue;
        const asked = i < scene.probed;
        const node = el('circle', {
          cx: geom.px(reading.x), cy: geom.py(reading.y), r: 6, 'stroke-width': 1.6,
          fill: asked ? toneOf(reading.p) : c.bg,
          'fill-opacity': asked
            ? String(Math.max(POINT_MIN_ALPHA, convictionOf(reading.p)))
            : '1',
          stroke: asked ? c.text : c.textMuted,
        });
        gPoint.appendChild(node);
      }

      // ── 셈 카드.
      gPanel.appendChild(el('rect', {
        x: CARD_X, y: CARD_Y, width: W - CARD_X - PAD_R, height: CARD_H,
        rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1,
      }));
      const lines = cardLines(scene);
      gPanel.appendChild(el('text', {
        x: CARD_X + CARD_PAD, y: CARD_Y + 22, fill: c.textMuted,
        'font-family': fonts.mono, 'font-size': fontSizes.sm,
      })).textContent =
        `z = ${term(scene.weights.x, 'x')} ${signOf(scene.weights.y)} `
        + `${term(scene.weights.y, 'y')} ${signOf(scene.bias)} ${f(Math.abs(scene.bias))}`;
      gPanel.appendChild(el('text', {
        x: CARD_X + CARD_PAD, y: CARD_Y + 46, fill: c.text,
        'font-family': fonts.mono, 'font-size': fontSizes.md,
      })).textContent = lines.z;
      gPanel.appendChild(el('text', {
        x: CARD_X + CARD_PAD, y: CARD_Y + 74, fill: c.text,
        'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 600,
      })).textContent = lines.p;

      // ── 확률자.
      gPanel.appendChild(el('rect', {
        x: RULER_X, y: RULER_TOP, width: RULER_W, height: RULER_BOT - RULER_TOP,
        fill: `url(#${gradId})`, stroke: c.border, 'stroke-width': 1,
      }));
      gPanel.appendChild(el('text', {
        x: RULER_X + RULER_W / 2, y: RULER_TOP - 8, fill: c.text,
        'font-family': fonts.mono, 'font-size': fontSizes.md, 'text-anchor': 'middle',
      })).textContent = 'p';
      for (const tick of TICKS) {
        gPanel.appendChild(el('text', {
          x: TICK_X, y: geom.rulerY(tick.p) + 4, fill: c.textMuted,
          'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'end',
        })).textContent = tick.text;
      }

      // ── 빈 구간의 자. 재었으면 남는다 — "반 근처에 아무것도 없다" 가 이
      //    조각의 앞 절반이라 끝 화면에도 서 있어야 한다.
      if (scene.spread) {
        const gap = spreadOf(scene);
        const b = boundaryReading(scene);
        const yHalf = geom.rulerY(b.p);
        const yHigh = geom.rulerY(gap.high);
        const yLow = geom.rulerY(gap.low);
        drawn.halfLine = el('line', {
          x1: RULER_X, y1: yHalf, x2: GAP_X1, y2: yHalf,
          stroke: c.text, 'stroke-width': HALF_STROKE_W, 'stroke-dasharray': '5 4',
        });
        drawn.armTop = el('line', {
          x1: GAP_X0, y1: yHigh, x2: GAP_X1, y2: yHigh,
          stroke: c.textMuted, 'stroke-width': 1.6,
        });
        drawn.armBot = el('line', {
          x1: GAP_X0, y1: yLow, x2: GAP_X1, y2: yLow,
          stroke: c.textMuted, 'stroke-width': 1.6,
        });
        drawn.beam = el('line', {
          x1: (GAP_X0 + GAP_X1) / 2, y1: yHigh, x2: (GAP_X0 + GAP_X1) / 2, y2: yLow,
          stroke: c.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '3 3',
        });
        gRuler.append(drawn.halfLine, drawn.armTop, drawn.armBot, drawn.beam);
      }

      // ── 꽂힌 확률. 칸 나누기는 목록 전체에서 매번 다시 한다.
      const probabilities = probedProbabilities(scene);
      drawn.pinAt = pinPlaces(probabilities, geom.rulerY);
      for (let i = 0; i < probabilities.length; i += 1) {
        const at = drawn.pinAt[i];
        const p = probabilities[i];
        if (at === undefined || p === undefined) continue;
        const node = el('circle', {
          cx: at.x, cy: at.y, r: PIN_R,
          fill: toneOf(p), stroke: c.text, 'stroke-width': 1.2,
        });
        gRuler.appendChild(node);
        drawn.pins.push(node);
      }

      // ── 캡션. 할 말이 없어도 비워 세운다 — 재건 밖에 남는 글자가 없게.
      gCaption.appendChild(el('text', {
        x: W / 2, y: CAPTION_Y, fill: c.text,
        'font-family': fonts.body, 'font-size': fontSizes.md, 'text-anchor': 'middle',
      })).textContent = captionText(scene);

      return drawn;
    }

    // ── 걸음마다의 운동 ──────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이므로 요소는 이미 끝 자리에 서 있다. 운동은 **아직 못
    // 온 만큼을 뒤로 물리는** 꼴이고, 물림은 첫 프레임 전에 박아 두어야 끝 자리가
    // 번쩍이지 않는다.

    /** 물음의 파문과, 그 값이 확률자로 옮겨 앉는 운동. 한 시계로 함께 흐른다. */
    async function flowProbe(
      scene: DecisionBoundaryScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const i = scene.probed - 1;
      const reading = readingAt(scene, i);
      const pin = drawn.pins[i];
      const at = drawn.pinAt[i];
      if (reading === null || pin === undefined || at === undefined) return;

      const sx = drawn.geom.px(reading.x);
      const sy = drawn.geom.py(reading.y);
      const tone = toneOf(reading.p);
      const ring = el('circle', {
        cx: sx, cy: sy, r: 6, fill: 'none', stroke: tone, 'stroke-width': 2,
      });
      gFx.appendChild(ring);
      pin.setAttribute('cx', String(sx));
      pin.setAttribute('cy', String(sy));

      await tween(PROBE_MS, mine, (p) => {
        const e = easeOut(p);
        ring.setAttribute('r', String(6 + 20 * e));
        ring.setAttribute('opacity', String(0.85 * (1 - p)));
        pin.setAttribute('cx', String(sx + (at.x - sx) * e));
        pin.setAttribute('cy', String(sy + (at.y - sy) * e));
      });
    }

    /** 빈 구간이 위아래에서 조여 온다. 그 안에 반이 들어 있다. */
    async function flowSpread(
      scene: DecisionBoundaryScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const { halfLine, armTop, armBot, beam } = drawn;
      if (halfLine === null || armTop === null || armBot === null || beam === null) return;
      // 끝 자리는 화면에서 되읽지 않고 장면에서 다시 셈한다 — 정적 그리기가 쓴
      // 것과 같은 함수를 지나므로 두 자리에서 셀 일이 없다 (프로토콜 4 절 ④).
      const gap = spreadOf(scene);
      const yHigh = drawn.geom.rulerY(gap.high);
      const yLow = drawn.geom.rulerY(gap.low);
      halfLine.setAttribute('x2', String(RULER_X));
      armTop.setAttribute('y1', String(RULER_TOP));
      armTop.setAttribute('y2', String(RULER_TOP));
      armBot.setAttribute('y1', String(RULER_BOT));
      armBot.setAttribute('y2', String(RULER_BOT));
      beam.setAttribute('y1', String(RULER_TOP));
      beam.setAttribute('y2', String(RULER_BOT));

      await tween(SPREAD_MS, mine, (p) => {
        const e = easeOut(p);
        halfLine.setAttribute('x2', String(RULER_X + (GAP_X1 - RULER_X) * e));
        const top = RULER_TOP + (yHigh - RULER_TOP) * e;
        const bot = RULER_BOT + (yLow - RULER_BOT) * e;
        armTop.setAttribute('y1', String(top));
        armTop.setAttribute('y2', String(top));
        armBot.setAttribute('y1', String(bot));
        armBot.setAttribute('y2', String(bot));
        beam.setAttribute('y1', String(top));
        beam.setAttribute('y2', String(bot));
      });
    }

    /** 쓸개바가 지나가며 이번 물결의 열이 하나씩 물든다. */
    async function flowScan(
      scene: DecisionBoundaryScene,
      drawn: Drawn,
      from: number,
      mine: number,
    ): Promise<void> {
      const to = scene.scanned;
      const fresh: SVGRectElement[][] = [];
      for (let col = from; col < to; col += 1) {
        const column = drawn.columns[col];
        if (column !== undefined) fresh.push(column);
      }
      if (fresh.length === 0) return;
      for (const column of fresh) {
        for (const rect of column) rect.setAttribute('fill-opacity', '0');
      }

      const cellW = drawn.geom.cellW;
      const x0 = PLOT_L + from * cellW;
      const x1 = PLOT_L + to * cellW;
      const sweep = el('line', {
        x1: x0, y1: PLOT_T, x2: x0, y2: PLOT_B,
        stroke: c.accent, 'stroke-width': 2.5,
      });
      gFx.appendChild(sweep);

      const reveal = (i: number): void => {
        const column = fresh[i];
        if (column === undefined) return;
        for (let row = 0; row < column.length; row += 1) {
          column[row]?.setAttribute('fill-opacity', cellAlpha(cellProbability(scene, from + i, row)));
        }
      };

      let shown = 0;
      await tween(SCAN_MS, mine, (p) => {
        const sx = x0 + (x1 - x0) * p;
        sweep.setAttribute('x1', String(sx));
        sweep.setAttribute('x2', String(sx));
        const want = Math.min(fresh.length, Math.ceil((sx - x0) / cellW + 1e-6));
        while (shown < want) {
          reveal(shown);
          shown += 1;
        }
      });
    }

    /** 넘나드는 칸의 테가 부풀었다 제자리로 오므라들며 뜬다. */
    async function flowCross(drawn: Drawn, mine: number): Promise<void> {
      if (drawn.marks.length === 0) return;
      const { cellW, cellH } = drawn.geom;
      const grow = 4;
      for (const m of drawn.marks) m.node.setAttribute('opacity', '0');

      await tween(CROSS_MS, mine, (p) => {
        const e = easeOut(p);
        const g = grow * (1 - e);
        for (const m of drawn.marks) {
          m.node.setAttribute('x', String(m.x - g));
          m.node.setAttribute('y', String(m.y - g));
          m.node.setAttribute('width', String(cellW + 0.5 + g * 2));
          m.node.setAttribute('height', String(cellH + 0.5 + g * 2));
          m.node.setAttribute('opacity', String(e));
        }
      });
    }

    /** 선이 한쪽 끝에서 다른 끝으로 그어진다. */
    async function flowBoundary(drawn: Drawn, mine: number): Promise<void> {
      const line = drawn.boundary;
      if (line === null) return;
      const len = drawn.boundaryLen;
      line.setAttribute('stroke-dasharray', `${len} ${len}`);
      line.setAttribute('stroke-dashoffset', String(len));
      await tween(LINE_MS, mine, (p) => {
        line.setAttribute('stroke-dashoffset', String(len * (1 - easeOut(p))));
      });
    }

    /** 선이 앉은 자리와 확률자의 반을 한 번에 짚는다. 양 끝에서 진폭이 0 이다. */
    async function flowSettle(drawn: Drawn, mine: number): Promise<void> {
      const line = drawn.boundary;
      const half = drawn.halfLine;
      if (line === null && half === null) return;
      await tween(SETTLE_MS, mine, (p) => {
        const e = Math.sin(Math.PI * p);
        line?.setAttribute('stroke-width', String(BOUNDARY_STROKE_W + 1.4 * e));
        half?.setAttribute('stroke-width', String(HALF_STROKE_W + 1.2 * e));
      });
    }

    // ── 장면 그리기 ──────────────────────────────────────────────────────

    async function render(
      next: DecisionBoundaryScene,
      _prev: DecisionBoundaryScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'probe':
          await flowProbe(next, drawn, mine);
          break;
        case 'spread':
          await flowSpread(next, drawn, mine);
          break;
        case 'scan':
          await flowScan(next, drawn, step.from, mine);
          break;
        case 'cross':
          await flowCross(drawn, mine);
          break;
        case 'boundary':
          await flowBoundary(drawn, mine);
          break;
        case 'settle':
          await flowSettle(drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리 · dash · opacity 가 노드째 사라진다. 되돌릴
      // 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        // 걸어 둔 것을 먼저 거두고,
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 취소된 타이머는 아예 불리지 않으므로 여기서
        // 풀지 않으면 `render` 의 await 가 영영 안 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
