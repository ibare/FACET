/**
 * 결정 경계 stage view.
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
 * 좌표는 전부 여기서 캔버스로부터 역산한다 (S-piece). 선언이 주는 것은
 * 구조뿐이다 — 무게 · 치우침 · 점 · 입력 공간의 범위 · 격자 해상도.
 *
 * 화면의 글자는 전부 표식이다 (C10 판정 1·3) — 축 이름 `x` / `y`, 확률자의
 * 눈금 `0` / `0.5` / `1`, 기호 `p`, 그리고 `z = x + y − 5.5` 같은 수식 표기.
 * 문장은 캡션 하나뿐이고 그것은 projector 가 `t` 로 조회해 넘긴다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

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
// 농도는 색이 아니라 불투명도로 준다 — |p − 0.5| 가 0 에 가까울수록 옅어져
// 경계가 저절로 옅은 이음매로 드러난다. 선을 그어 만든 것이 아니다.
const CLASS_TONES = categorical(2, 'vivid');
/** p < 0.5 쪽. */
const CLASS_LOW = 0;
/** p > 0.5 쪽. */
const CLASS_HIGH = 1;
const FIELD_MAX_ALPHA = 0.62;
const POINT_MIN_ALPHA = 0.35;
/** 넘나드는 칸이 뜨면 나머지 밭은 이만큼으로 물러난다. */
const FIELD_DIM = 0.3;

// ── 걸음마다의 운동 길이 ─────────────────────────────────────────────────
const PROBE_MS = 270;
const SPREAD_MS = 420;
const SCAN_MS = 440;
const CROSS_MS = 420;
const LINE_MS = 640;
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
/** 경계를 정의하는 확률. 카드가 마지막에 이 값을 내건다. */
const HALF_P = 0.5;
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

export type ProbeInfo = {
  index: number;
  total: number;
  x: number;
  y: number;
  z: number;
  p: number;
};
export type SpreadInfo = { low: number; high: number; threshold: number };
export type ScanInfo = { col0: number; cols: number; rows: number; values: number[] };
export type CrossInfo = { cells: number[]; total: number };
export type BoundaryInfo = { wx: number; wy: number; bias: number };

export type DecisionBoundaryStage = ViewInstance & {
  reset(): void;
  setCaption(text: string): void;
  probePoint(info: ProbeInfo): Promise<void>;
  noteSpread(info: SpreadInfo): Promise<void>;
  scanField(info: ScanInfo): Promise<void>;
  markCrossings(info: CrossInfo): Promise<void>;
  revealBoundary(info: BoundaryInfo): Promise<void>;
};

type StageConfig = {
  weights: { x: number; y: number };
  bias: number;
  points: Array<{ x: number; y: number }>;
  domain: { min: number; max: number };
  grid: { cols: number; rows: number };
};

/** 선언이 없거나 모양이 어긋나면 그림이 설 자리가 없다 — 여기서 좁힌다 (C9). */
function readConfig(raw: Record<string, unknown> | undefined): StageConfig {
  const d = raw ?? {};
  const w = d.weights as { x?: unknown; y?: unknown } | undefined;
  const dom = d.domain as { min?: unknown; max?: unknown } | undefined;
  const g = d.grid as { cols?: unknown; rows?: unknown } | undefined;
  const pts = Array.isArray(d.points) ? d.points : [];
  const points: Array<{ x: number; y: number }> = [];
  for (const raw2 of pts) {
    const p = raw2 as { x?: unknown; y?: unknown };
    if (typeof p?.x === 'number' && typeof p?.y === 'number') points.push({ x: p.x, y: p.y });
  }
  return {
    weights: {
      x: typeof w?.x === 'number' ? w.x : 1,
      y: typeof w?.y === 'number' ? w.y : 1,
    },
    bias: typeof d.bias === 'number' ? d.bias : 0,
    points,
    domain: {
      min: typeof dom?.min === 'number' ? dom.min : 0,
      max: typeof dom?.max === 'number' ? dom.max : 1,
    },
    grid: {
      cols: typeof g?.cols === 'number' && g.cols > 0 ? Math.floor(g.cols) : 1,
      rows: typeof g?.rows === 'number' && g.rows > 0 ? Math.floor(g.rows) : 1,
    },
  };
}

export const decisionBoundaryStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 러너가
    // 먼저 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const c = getColors(params.theme);
    const cfg = readConfig(params.initialData);
    const span = Math.max(1e-9, cfg.domain.max - cfg.domain.min);
    const scale = PLOT_SIDE / span;
    const cellW = PLOT_SIDE / cfg.grid.cols;
    const cellH = PLOT_SIDE / cfg.grid.rows;

    const px = (x: number): number => PLOT_L + (x - cfg.domain.min) * scale;
    const py = (y: number): number => PLOT_B - (y - cfg.domain.min) * scale;
    const rulerY = (p: number): number => RULER_BOT - p * (RULER_BOT - RULER_TOP);
    const classOf = (p: number): string =>
      CLASS_TONES[p >= 0.5 ? CLASS_HIGH : CLASS_LOW] ?? c.text;
    /** 반에서 멀수록 짙다. 경계 부근은 저절로 옅어진다. */
    const conviction = (p: number): number => Math.min(1, Math.abs(p - 0.5) * 2);

    // ── 시간 ────────────────────────────────────────────────────────────
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function tween(ms: number, onStep: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        let id: ReturnType<typeof setTimeout> | null = null;
        const finish = (): void => {
          waiters.delete(finish);
          if (id !== null) {
            timers.delete(id);
            clearTimeout(id);
          }
          resolve();
        };
        waiters.add(finish);
        const frame = (): void => {
          if (id !== null) timers.delete(id);
          if (destroyed) return finish();
          const t = Math.min(1, (Date.now() - started) / ms);
          onStep(t);
          if (t >= 1) return finish();
          id = setTimeout(frame, FRAME_MS);
          timers.add(id);
        };
        onStep(0);
        id = setTimeout(frame, FRAME_MS);
        timers.add(id);
      });
    }

    const easeOut = (t: number): number => 1 - (1 - t) ** 3;

    // ── 층 ──────────────────────────────────────────────────────────────
    const defs = el('defs');
    const fieldLayer = el('g');
    const crossLayer = el('g');
    const axisLayer = el('g');
    const boundaryLayer = el('g');
    const pointLayer = el('g');
    const fxLayer = el('g');
    const panelLayer = el('g');
    const rulerLayer = el('g');
    const captionLayer = el('g');
    for (const layer of [
      defs, fieldLayer, crossLayer, axisLayer, boundaryLayer,
      pointLayer, fxLayer, panelLayer, rulerLayer, captionLayer,
    ]) svg.appendChild(layer);

    // ── 평면의 틀 ───────────────────────────────────────────────────────
    axisLayer.appendChild(el('rect', {
      x: PLOT_L, y: PLOT_T, width: PLOT_SIDE, height: PLOT_SIDE,
      fill: 'none', stroke: c.border, 'stroke-width': 1,
    }));
    for (const v of AXIS_TICKS) {
      axisLayer.appendChild(el('text', {
        x: px(v), y: PLOT_B + 16, fill: c.textMuted,
        'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'middle',
      })).textContent = f(v);
      axisLayer.appendChild(el('text', {
        x: PLOT_L - 8, y: py(v) + 4, fill: c.textMuted,
        'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'end',
      })).textContent = f(v);
    }
    axisLayer.appendChild(el('text', {
      x: PLOT_R, y: PLOT_B + 16, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'middle',
    })).textContent = AXIS_MAX_LABEL_X;
    axisLayer.appendChild(el('text', {
      x: PLOT_L - 8, y: PLOT_T + 4, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.sm, 'text-anchor': 'end',
    })).textContent = AXIS_MAX_LABEL_Y;

    // ── 점 여덟 ─────────────────────────────────────────────────────────
    const dots: SVGCircleElement[] = cfg.points.map((p) => {
      const node = el('circle', { cx: px(p.x), cy: py(p.y), r: 6, 'stroke-width': 1.6 });
      pointLayer.appendChild(node);
      return node;
    });

    // ── 셈 카드 ─────────────────────────────────────────────────────────
    panelLayer.appendChild(el('rect', {
      x: CARD_X, y: CARD_Y, width: W - CARD_X - PAD_R, height: CARD_H,
      rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1,
    }));
    const modelText = el('text', {
      x: CARD_X + CARD_PAD, y: CARD_Y + 22, fill: c.textMuted,
      'font-family': fonts.mono, 'font-size': fontSizes.sm,
    });
    const zText = el('text', {
      x: CARD_X + CARD_PAD, y: CARD_Y + 46, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.md,
    });
    const pText = el('text', {
      x: CARD_X + CARD_PAD, y: CARD_Y + 74, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.xl, 'font-weight': 600,
    });
    panelLayer.append(modelText, zText, pText);

    const signOf = (w: number): string => (w < 0 ? MINUS : '+');
    modelText.textContent =
      `z = ${term(cfg.weights.x, 'x')} ${signOf(cfg.weights.y)} ${term(cfg.weights.y, 'y')}`
      + ` ${signOf(cfg.bias)} ${f(Math.abs(cfg.bias))}`;

    // ── 확률자 ──────────────────────────────────────────────────────────
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

    panelLayer.appendChild(el('rect', {
      x: RULER_X, y: RULER_TOP, width: RULER_W, height: RULER_BOT - RULER_TOP,
      fill: `url(#${gradId})`, stroke: c.border, 'stroke-width': 1,
    }));
    panelLayer.appendChild(el('text', {
      x: RULER_X + RULER_W / 2, y: RULER_TOP - 8, fill: c.text,
      'font-family': fonts.mono, 'font-size': fontSizes.md, 'text-anchor': 'middle',
    })).textContent = 'p';
    for (const tick of TICKS) {
      panelLayer.appendChild(el('text', {
        x: TICK_X, y: rulerY(tick.p) + 4, fill: c.textMuted,
        'font-family': fonts.mono, 'font-size': fontSizes.xs, 'text-anchor': 'end',
      })).textContent = tick.text;
    }

    // ── 캡션 ────────────────────────────────────────────────────────────
    const caption = el('text', {
      x: W / 2, y: CAPTION_Y, fill: c.text,
      'font-family': fonts.body, 'font-size': fontSizes.md, 'text-anchor': 'middle',
    });
    captionLayer.appendChild(caption);

    // ── 되풀이되는 상태 ─────────────────────────────────────────────────
    /** 확률자에 이미 꽂힌 것들의 높이 — 겹침을 옆으로 미는 데 쓴다. */
    const pinned: Array<{ y: number; slot: number }> = [];

    function clearLayer(layer: SVGGElement): void {
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    function reset(): void {
      clearLayer(fieldLayer);
      clearLayer(crossLayer);
      clearLayer(boundaryLayer);
      clearLayer(fxLayer);
      clearLayer(rulerLayer);
      fieldLayer.setAttribute('opacity', '1');
      pinned.length = 0;
      for (const dot of dots) {
        dot.setAttribute('fill', c.bg);
        dot.setAttribute('fill-opacity', '1');
        dot.setAttribute('stroke', c.textMuted);
      }
      zText.textContent = `z = ${PLACEHOLDER}`;
      pText.textContent = `p = ${PLACEHOLDER}`;
      caption.textContent = '';
    }

    reset();

    // ── 걸음 ────────────────────────────────────────────────────────────

    function pinSlot(y: number): number {
      let slot = 0;
      for (;;) {
        const clash = pinned.some((q) => q.slot === slot && Math.abs(q.y - y) < PIN_MIN_DY);
        if (!clash) return slot;
        slot += 1;
      }
    }

    async function probePoint(info: ProbeInfo): Promise<void> {
      const dot = dots[info.index];
      const tone = classOf(info.p);
      const alpha = Math.max(POINT_MIN_ALPHA, conviction(info.p));
      const sx = px(info.x);
      const sy = py(info.y);

      zText.textContent =
        `z = ${term(cfg.weights.x, f(info.x))} ${signOf(cfg.weights.y)} `
        + `${term(cfg.weights.y, f(info.y))} ${signOf(cfg.bias)} ${f(Math.abs(cfg.bias))}`
        + ` = ${signed(info.z, 2)}`;
      pText.textContent = `p = ${info.p.toFixed(3)}`;

      if (dot) {
        dot.setAttribute('fill', tone);
        dot.setAttribute('fill-opacity', String(alpha));
        dot.setAttribute('stroke', c.text);
      }

      const slot = pinSlot(rulerY(info.p));
      pinned.push({ y: rulerY(info.p), slot });
      const tx = PIN_X0 + slot * PIN_GAP;
      const ty = rulerY(info.p);

      // 물음의 파문 + 값이 확률자로 옮겨 앉는 운동. 둘을 겹쳐 돌린다.
      const ring = el('circle', {
        cx: sx, cy: sy, r: 6, fill: 'none', stroke: tone, 'stroke-width': 2,
      });
      const flyer = el('circle', {
        cx: sx, cy: sy, r: PIN_R, fill: tone, stroke: c.text, 'stroke-width': 1.2,
      });
      fxLayer.append(ring, flyer);

      await tween(PROBE_MS, (t) => {
        const e = easeOut(t);
        ring.setAttribute('r', String(6 + 20 * e));
        ring.setAttribute('opacity', String(0.85 * (1 - t)));
        flyer.setAttribute('cx', String(sx + (tx - sx) * e));
        flyer.setAttribute('cy', String(sy + (ty - sy) * e));
      });

      ring.remove();
      flyer.remove();
      rulerLayer.appendChild(el('circle', {
        cx: tx, cy: ty, r: PIN_R, fill: tone, stroke: c.text, 'stroke-width': 1.2,
      }));
    }

    async function noteSpread(info: SpreadInfo): Promise<void> {
      // 낱점 하나를 셈하던 국면이 끝났다 — 카드에서 그 수를 내린다.
      zText.textContent = `z = ${PLACEHOLDER}`;
      pText.textContent = `p = ${PLACEHOLDER}`;
      const yLow = rulerY(info.low);
      const yHigh = rulerY(info.high);
      const yHalf = rulerY(info.threshold);

      const half = el('line', {
        x1: RULER_X, y1: yHalf, x2: RULER_X, y2: yHalf,
        stroke: c.text, 'stroke-width': 1.4, 'stroke-dasharray': '5 4',
      });
      const armTop = el('line', {
        x1: GAP_X0, y1: RULER_TOP, x2: GAP_X1, y2: RULER_TOP,
        stroke: c.textMuted, 'stroke-width': 1.6,
      });
      const armBot = el('line', {
        x1: GAP_X0, y1: RULER_BOT, x2: GAP_X1, y2: RULER_BOT,
        stroke: c.textMuted, 'stroke-width': 1.6,
      });
      const beam = el('line', {
        x1: (GAP_X0 + GAP_X1) / 2, y1: RULER_TOP, x2: (GAP_X0 + GAP_X1) / 2, y2: RULER_BOT,
        stroke: c.textMuted, 'stroke-width': 1.2, 'stroke-dasharray': '3 3',
      });
      rulerLayer.append(half, armTop, armBot, beam);

      // 빈 구간이 위아래에서 조여 온다. 그 안에 0.5 가 들어 있다.
      await tween(SPREAD_MS, (t) => {
        const e = easeOut(t);
        half.setAttribute('x2', String(RULER_X + (GAP_X1 - RULER_X) * e));
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

    async function scanField(info: ScanInfo): Promise<void> {
      const made: SVGRectElement[][] = [];
      for (let i = 0; i < info.cols; i += 1) {
        const col = info.col0 + i;
        const column: SVGRectElement[] = [];
        for (let r = 0; r < info.rows; r += 1) {
          const p = info.values[i * info.rows + r] ?? 0.5;
          const rect = el('rect', {
            x: PLOT_L + col * cellW,
            y: PLOT_B - (r + 1) * cellH,
            width: cellW + 0.5,
            height: cellH + 0.5,
            fill: classOf(p),
            'fill-opacity': 0,
          });
          rect.dataset.alpha = String(FIELD_MAX_ALPHA * conviction(p));
          fieldLayer.appendChild(rect);
          column.push(rect);
        }
        made.push(column);
      }

      const x0 = PLOT_L + info.col0 * cellW;
      const x1 = x0 + info.cols * cellW;
      const sweep = el('line', {
        x1: x0, y1: PLOT_T, x2: x0, y2: PLOT_B,
        stroke: c.accent, 'stroke-width': 2.5,
      });
      fxLayer.appendChild(sweep);

      const reveal = (i: number): void => {
        for (const rect of made[i] ?? []) {
          rect.setAttribute('fill-opacity', rect.dataset.alpha ?? '0');
        }
      };

      let shown = 0;
      await tween(SCAN_MS, (t) => {
        const sx = x0 + (x1 - x0) * t;
        sweep.setAttribute('x1', String(sx));
        sweep.setAttribute('x2', String(sx));
        const want = Math.min(info.cols, Math.ceil(((sx - x0) / cellW) + 1e-6));
        while (shown < want) reveal(shown++);
      });
      while (shown < info.cols) reveal(shown++);
      sweep.remove();
    }

    async function markCrossings(info: CrossInfo): Promise<void> {
      const rows = cfg.grid.rows;
      const marks: Array<{ node: SVGRectElement; x: number; y: number }> = [];
      for (const idx of info.cells) {
        const col = Math.floor(idx / rows);
        const row = idx % rows;
        const x = PLOT_L + col * cellW;
        const y = PLOT_B - (row + 1) * cellH;
        const node = el('rect', {
          x, y, width: cellW + 0.5, height: cellH + 0.5,
          fill: c.accent, 'fill-opacity': 0,
        });
        crossLayer.appendChild(node);
        marks.push({ node, x, y });
      }

      // 부풀었다 제자리로 오므라들며 뜬다. 뒤의 밭은 뒤로 물러난다.
      const grow = 4;
      await tween(CROSS_MS, (t) => {
        const e = easeOut(t);
        fieldLayer.setAttribute('opacity', String(1 - (1 - FIELD_DIM) * e));
        const g = grow * (1 - e);
        for (const m of marks) {
          m.node.setAttribute('x', String(m.x - g));
          m.node.setAttribute('y', String(m.y - g));
          m.node.setAttribute('width', String(cellW + 0.5 + g * 2));
          m.node.setAttribute('height', String(cellH + 0.5 + g * 2));
          m.node.setAttribute('fill-opacity', String(0.88 * e));
        }
      });
    }

    /** 입력 공간의 네 변과 만나는 두 점 — 선이 어디서 어디까지인지. */
    function clipLine(
      wx: number, wy: number, bias: number,
    ): Array<{ x: number; y: number }> {
      const lo = cfg.domain.min;
      const hi = cfg.domain.max;
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

    async function revealBoundary(info: BoundaryInfo): Promise<void> {
      const hits = clipLine(info.wx, info.wy, info.bias);
      if (hits.length < 2) return;
      const a = hits[0]!;
      const b = hits[1]!;
      const ax = px(a.x);
      const ay = py(a.y);
      const bx = px(b.x);
      const by = py(b.y);
      const len = Math.hypot(bx - ax, by - ay);

      const line = el('line', {
        x1: ax, y1: ay, x2: bx, y2: by,
        stroke: c.text, 'stroke-width': 2.6, 'stroke-linecap': 'round',
        'stroke-dasharray': `${len} ${len}`, 'stroke-dashoffset': len,
      });
      boundaryLayer.appendChild(line);

      // 평면에는 이름표를 두지 않는다. 45° 선 곁에 판을 놓으면 어느 쪽에
      // 두든 모서리가 선이나 점을 문다. 선의 정체는 낱점의 z 와 p 를 재던
      // 바로 그 카드가 말한다 — 같은 자리에서 답이 닫히는 편이 낫다.
      zText.textContent =
        `z = 0 ${ARROW} ${term(info.wx, 'x')} ${signOf(info.wy)} `
        + `${term(info.wy, 'y')} = ${f(-info.bias)}`;
      pText.textContent = `p = ${HALF_P.toFixed(3)}`;

      await tween(LINE_MS, (t) => {
        line.setAttribute('stroke-dashoffset', String(len * (1 - easeOut(t))));
      });
    }

    const stage: DecisionBoundaryStage = {
      reset,
      setCaption(text: string): void {
        caption.textContent = text;
      },
      probePoint,
      noteSpread,
      scanField,
      markCrossings,
      revealBoundary,
      destroy(): void {
        destroyed = true;
        // 걸어 둔 것을 먼저 거두고,
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 projector 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
    return stage;
  },
};
