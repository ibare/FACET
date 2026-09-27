/**
 * gradient — 한 점에서 방향을 정해 그 방향으로 자른 단면의 기울기를 재고, 두 편미분으로 만든 ∇f 와 견준다.
 *
 * 함수는 항 목록 `[[계수, x 지수, y 지수], …]` (f = x² + 3y²). 함숫값은 항마다 계수를 double 로 두고
 * x 를 지수 번, 이어 y 를 지수 번 곱해 더한다 — IR `evalAt` 과 같은 차례 (`Math.pow` 를 쓰지 않는다).
 *
 * - 방향 기울기 s 는 **가운데 차분으로 잰다** — (f(p + δu) − f(p − δu)) / (2δ). u 는 정수 쌍을 `sqrt` 로 길이 1 로.
 *   ∇f · u 로 셈하지 않는다 (주장이 제 꼬리를 문다).
 * - ∇f 는 항 목록을 **거듭제곱 규칙**으로 미분해 셈한다 (계수 × 지수, 지수 − 1). 그래서 "0° 칸 = ∂f/∂x" 가 발견이 된다.
 * - 각(°)은 IR 밖, 여기서만 셈한다 (IR 에 삼각 함수가 없다).
 *
 * 손잡이 (reactive):
 *   point     — 점 순번 0..4 (`initialData.points`)
 *   direction — 재는 방향 도 (`initialData.dirLadder`, 같은 차례의 정수 쌍은 `initialData.directions`)
 *
 * 이벤트 (한 판 네 걸음, 걸음 0 포함):
 *   init (silent) — 판 머리. payload:
 *     { pointIndex: number, p: [x, y], pText: string, f: number, fText: string, levels: number[],
 *       contours: { level: number, levelText: string, pts: [x, y][] }[],
 *       mapBounds: { xMin, xMax, yMin, yMax }, arrowScale: number,
 *       sectionT: [tMin, tMax], sectionTicks: { t, text, origin }[], sectionRange: [gMin, gMax], barMax: number }
 *   cut — 걸음 1. payload:
 *     { deg: number, degText: string, u: [ux, uy], cutHalf: number, cutEnds: [[x, y], [x, y]], section: [t, g][] }
 *   slope — 걸음 2. payload:
 *     { s: number, sText: string, tangent: [[t, g], [t, g]], tip: [x, y] }   // tip = p + arrowScale · s · u
 *   gradient — 걸음 3. payload:
 *     { grad: [gx, gy], gradText: string, mag: number, magText: string, angle: number, angleText: string,
 *       s: number, sText: string, axis: 'x' | 'y' | 'none', partial: number | null, partialText: string | null,
 *       arrowTip: [x, y], circle: { cx, cy, r } }   // circle: ∇f 를 지름으로 하는 원 (s·u 의 끝이 그 위에 있다)
 *   phase (silent) — { phase: 'unit' | 'diff' }
 *
 * phase 어휘: `unit` (걸음 1 — 방향을 길이 1 로) · `diff` (걸음 2 — 가운데 차분). 걸음 3 은 새 phase 없이 `diff` 가 남는다.
 *
 * 계기 (음이 아닌 정수):
 *   point-level       — 점의 높이 f(p). 판 머리에서.
 *   angle-to-gradient — 재는 방향과 ∇f 사이 각 0..180, 반올림 정수. 판 머리 0, 걸음 3 에서 값.
 *
 * 동률 규칙: "가장 큰 칸" 을 고르지 않으므로 동률 판정이 없다. 표시값은 toFixed 한 곳(`fmt`)에서.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GradientData = {
  type: 'gradient';
  stepMs: number;
  /** 항 목록 [[계수, x 지수, y 지수], …] */
  terms: number[][];
  points: number[][];
  point: number;
  dirLadder: number[];
  directions: number[][];
  direction: number;
  delta: number;
  levels: number[];
  sectionT: number[];
};

/** 운동 길이(재생 속도 1 기준). 판 머리 sleep 과 무대 운동이 같은 값을 쓴다. */
export const GRADIENT_MOTION_MS = 700;

/** 단면 표본 수 (t −1 ~ 1). */
const SECTION_SAMPLES = 41;
/** 등고선 한 줄의 표본 수. */
const CONTOUR_SAMPLES = 72;
/** 지도에서 기울기 1 을 몇 칸으로 그리나 — 방향 기울기 끝 s·u 와 ∇f 화살표가 같은 축척. */
const ARROW_SCALE = 0.2;
/** 단면 접선을 긋는 t 반폭. */
const TANGENT_HALF = 0.5;

// ── 셈 ─────────────────────────────────────────────────────────

/** 평평한 항 목록 [계수, x 지수, y 지수, …] 로 편다 — IR 에 건네는 꼴. */
export function flattenTerms(terms: number[][]): number[] {
  const flat: number[] = [];
  for (const term of terms) {
    if (term.length !== 3) throw new Error(`gradient: 항은 [계수, x 지수, y 지수] 여야 한다 — ${JSON.stringify(term)}`);
    const [c, a, b] = term as [number, number, number];
    if (!Number.isInteger(c) || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      throw new Error(`gradient: 계수와 지수는 정수, 지수는 음이 아니어야 한다 — ${JSON.stringify(term)}`);
    }
    flat.push(c, a, b);
  }
  return flat;
}

/** 함숫값 — IR `evalAt` 과 같은 차례 (계수를 double 로, x 먼저 y 다음 반복 곱). */
export function evalAt(flat: number[], x: number, y: number): number {
  let total = 0.0;
  for (let i = 0; i < Math.floor(flat.length / 3); i++) {
    let term = flat[3 * i] as number;
    const ax = flat[3 * i + 1] as number;
    const ay = flat[3 * i + 2] as number;
    for (let k = 0; k < ax; k++) term = term * x;
    for (let k = 0; k < ay; k++) term = term * y;
    total = total + term;
  }
  return total;
}

/** 길이 1 로 만든 방향 — IR 과 같은 `sqrt` 정규화. */
export function unitOf(dx: number, dy: number): [number, number] {
  const sq = dx * dx + dy * dy;
  if (sq === 0) throw new Error('gradient: 방향 (0, 0) 은 잴 수 없다');
  const norm = Math.sqrt(sq);
  return [dx / norm, dy / norm];
}

/** 방향 기울기 — 가운데 차분 (IR `dirSlope` 과 같은 길). */
export function dirSlope(flat: number[], x: number, y: number, dx: number, dy: number, d: number): number {
  const [ux, uy] = unitOf(dx, dy);
  return (evalAt(flat, x + d * ux, y + d * uy) - evalAt(flat, x - d * ux, y - d * uy)) / (2 * d);
}

/** ∇f — 거듭제곱 규칙으로 미분한 두 편미분을 점에서 셈한다. */
export function gradientAt(terms: number[][], x: number, y: number): [number, number] {
  const flat = flattenTerms(terms);
  const dxTerms: number[] = [];
  const dyTerms: number[] = [];
  for (let i = 0; i < flat.length; i += 3) {
    const c = flat[i] as number;
    const a = flat[i + 1] as number;
    const b = flat[i + 2] as number;
    if (a > 0) dxTerms.push(c * a, a - 1, b);
    if (b > 0) dyTerms.push(c * b, a, b - 1);
  }
  return [evalAt(dxTerms, x, y), evalAt(dyTerms, x, y)];
}

/** 각(도) — +x 축에서 시계 반대로 0 ~ 360. */
export function angleDeg(vx: number, vy: number): number {
  const a = (Math.atan2(vy, vx) * 180) / Math.PI;
  return a < 0 ? a + 360 : a;
}

/** 표시 도우미 — toFixed 한 곳, 빼기는 U+2212, 반올림 글자가 0 이면 부호를 뗀다. */
export function fmt(value: number, digits: number): string {
  if (!Number.isFinite(value)) throw new Error(`gradient: 표시할 수 없는 값 ${value}`);
  const s = value.toFixed(digits);
  if (Number(s) === 0) return s.replace('-', '');
  return s.replace('-', '−');
}

/** 정수 표시 — 정수가 아니면 던진다. */
export function fmtInt(value: number): string {
  const r = Math.round(value);
  if (Math.abs(value - r) > 1e-9) throw new Error(`gradient: 정수여야 할 값 ${value}`);
  return r === 0 ? '0' : String(r).replace('-', '−');
}

/** 점 좌표 글자 — `(2, 1)` · `(−1, 1)`. */
export function pointText(p: readonly number[]): string {
  return `(${fmtInt(p[0] as number)}, ${fmtInt(p[1] as number)})`;
}

/** 지도 좌표 → 화면 좌표 (바탕에서 정해지는 좌표 변환). 수학 좌표 — 위가 +y. */
export function mapToScreen(
  x: number,
  y: number,
  b: { xMin: number; xMax: number; yMin: number; yMax: number },
  box: { x: number; y: number; w: number; h: number },
): [number, number] {
  return [box.x + ((x - b.xMin) / (b.xMax - b.xMin)) * box.w, box.y + ((b.yMax - y) / (b.yMax - b.yMin)) * box.h];
}

// ── 한 칸의 셈 (알고리즘 · 테스트가 함께 쓴다) ──────────────────

export type Cell = {
  p: [number, number];
  f: number;
  deg: number;
  u: [number, number];
  s: number;
  grad: [number, number];
  mag: number;
  angle: number;
  /** 재는 방향과 ∇f 사이 각 0..180 (반올림 전) */
  between: number;
  axis: 'x' | 'y' | 'none';
};

export function cellOf(data: GradientData, pointIndex: number, dirIndex: number): Cell {
  const pt = data.points[pointIndex];
  const dir = data.directions[dirIndex];
  const deg = data.dirLadder[dirIndex];
  if (!pt || pt.length !== 2 || !dir || dir.length !== 2 || typeof deg !== 'number') {
    throw new Error(`gradient: 점 ${pointIndex} · 방향 ${dirIndex} 이 자료에 없다`);
  }
  const p: [number, number] = [pt[0] as number, pt[1] as number];
  const flat = flattenTerms(data.terms);
  const [dx, dy] = [dir[0] as number, dir[1] as number];
  const u = unitOf(dx, dy);
  const s = dirSlope(flat, p[0], p[1], dx, dy, data.delta);
  const grad = gradientAt(data.terms, p[0], p[1]);
  const mag = Math.sqrt(grad[0] * grad[0] + grad[1] * grad[1]);
  const angle = angleDeg(grad[0], grad[1]);
  let diff = Math.abs(deg - angle) % 360;
  if (diff > 180) diff = 360 - diff;
  // 0° · 90° 칸 표지 — 정수 쌍으로 가른다 (무대가 방향 값을 보고 가르지 않는다)
  const axis: Cell['axis'] = dx > 0 && dy === 0 ? 'x' : dx === 0 && dy > 0 ? 'y' : 'none';
  return { p, f: evalAt(flat, p[0], p[1]), deg, u, s, grad, mag, angle, between: diff, axis };
}

function sectionSamples(data: GradientData, p: [number, number], u: [number, number]): [number, number][] {
  const flat = flattenTerms(data.terms);
  const [t0, t1] = [data.sectionT[0] as number, data.sectionT[1] as number];
  const out: [number, number][] = [];
  for (let k = 0; k < SECTION_SAMPLES; k++) {
    const t = t0 + ((t1 - t0) * k) / (SECTION_SAMPLES - 1);
    out.push([t, evalAt(flat, p[0] + t * u[0], p[1] + t * u[1])]);
  }
  return out;
}

/** 1차 데이터의 수를 적힌 그대로 — 정수면 정수, 빼기는 U+2212 */
function dataText(v: number): string {
  return Number.isInteger(v) ? fmtInt(v) : String(v).replace('-', '−');
}

/** 단면 창 t 축 눈금 — 두 끝과, 범위 안에 있으면 0 (점 p 자리). */
export function sectionTicks(data: GradientData): { t: number; text: string; origin: boolean }[] {
  const [t0, t1] = [data.sectionT[0] as number, data.sectionT[1] as number];
  if (!(t0 < t1)) throw new Error(`gradient: sectionT 는 [작은 값, 큰 값] — ${t0}, ${t1}`);
  const ticks = [{ t: t0, text: dataText(t0), origin: t0 === 0 }];
  if (t0 < 0 && 0 < t1) ticks.push({ t: 0, text: '0', origin: true });
  ticks.push({ t: t1, text: dataText(t1), origin: t1 === 0 });
  return ticks;
}

/** 등고선 x² + 3y² = c 의 표본 — 이 함수 꼴(ax² + by², a · b > 0)에서만 셈한다. */
function contourSamples(data: GradientData): { level: number; pts: [number, number][] }[] {
  let ax = 0;
  let by = 0;
  for (const term of data.terms) {
    const [c, a, b] = term as [number, number, number];
    if (a === 2 && b === 0) ax += c;
    else if (a === 0 && b === 2) by += c;
    else throw new Error(`gradient: 등고선은 ax² + by² 꼴에서만 싣는다 — ${JSON.stringify(term)}`);
  }
  if (ax <= 0 || by <= 0) throw new Error('gradient: 등고선은 두 계수가 양수일 때만 타원이다');
  return data.levels.map((level) => {
    if (!(level > 0)) throw new Error(`gradient: 등고선 수준은 양수여야 한다 — ${level}`);
    const rx = Math.sqrt(level / ax);
    const ry = Math.sqrt(level / by);
    const pts: [number, number][] = [];
    for (let k = 0; k < CONTOUR_SAMPLES; k++) {
      const th = (2 * Math.PI * k) / CONTOUR_SAMPLES;
      pts.push([rx * Math.cos(th), ry * Math.sin(th)]);
    }
    return { level, pts };
  });
}

/** 판마다 같은 바탕 — 지도 범위 · 단면 창 세로 · 막대 축척 (다섯 점 · 여덟 방향 전체에서). */
export function boardFrame(data: GradientData) {
  const contours = contourSamples(data);
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  const take = (x: number, y: number) => {
    xMin = Math.min(xMin, x);
    xMax = Math.max(xMax, x);
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  };
  for (const c of contours) for (const [x, y] of c.pts) take(x, y);
  let gMin = Infinity;
  let gMax = -Infinity;
  let barMax = 0;
  for (let pi = 0; pi < data.points.length; pi++) {
    for (let di = 0; di < data.directions.length; di++) {
      const cell = cellOf(data, pi, di);
      take(cell.p[0], cell.p[1]);
      take(cell.p[0] + ARROW_SCALE * cell.grad[0], cell.p[1] + ARROW_SCALE * cell.grad[1]);
      barMax = Math.max(barMax, cell.mag, Math.abs(cell.s));
      for (const [, g] of sectionSamples(data, cell.p, cell.u)) {
        gMin = Math.min(gMin, g);
        gMax = Math.max(gMax, g);
      }
      for (const g of [cell.f - TANGENT_HALF * cell.s, cell.f + TANGENT_HALF * cell.s]) {
        gMin = Math.min(gMin, g);
        gMax = Math.max(gMax, g);
      }
    }
  }
  const pad = 0.35;
  return {
    contours,
    mapBounds: { xMin: xMin - pad, xMax: xMax + pad, yMin: yMin - pad, yMax: yMax + pad },
    sectionRange: [gMin, gMax] as [number, number],
    barMax,
    // 자르는 선의 반길이 — 지도 대각선이면 어느 점 어느 방향에서도 지도를 가로지른다
    cutHalf: Math.hypot(xMax - xMin, yMax - yMin) + 2 * pad,
  };
}

// ── 알고리즘 ─────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isNumList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function isNumTable(v: unknown, width: number): v is number[][] {
  return Array.isArray(v) && v.every((row) => isNumList(row) && row.length === width);
}

function readData(raw: unknown): GradientData {
  if (!isRecord(raw)) throw new Error('gradient: ctx.data 가 객체가 아니다');
  const { type, stepMs, terms, points, point, dirLadder, directions, direction, delta, levels, sectionT } = raw;
  if (type !== 'gradient') throw new Error(`gradient: data.type 이 'gradient' 가 아니다 — ${String(type)}`);
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('gradient: stepMs 가 양수가 아니다');
  if (!isNumTable(terms, 3) || terms.length === 0) throw new Error('gradient: terms 는 [[계수, x 지수, y 지수], …]');
  if (!isNumTable(points, 2) || points.length === 0) throw new Error('gradient: points 는 [[x, y], …]');
  if (typeof point !== 'number' || !Number.isInteger(point) || point < 0 || point >= points.length) {
    throw new Error(`gradient: point 순번이 points 밖이다 — ${String(point)}`);
  }
  if (!isNumList(dirLadder) || dirLadder.length === 0) throw new Error('gradient: dirLadder 는 도 목록');
  if (!isNumTable(directions, 2) || directions.length !== dirLadder.length) {
    throw new Error('gradient: directions 는 dirLadder 와 같은 길이의 정수 쌍 목록');
  }
  if (typeof direction !== 'number' || !dirLadder.includes(direction)) {
    throw new Error(`gradient: direction 이 dirLadder 에 없다 — ${String(direction)}`);
  }
  if (typeof delta !== 'number' || !(delta > 0)) throw new Error('gradient: delta 가 양수가 아니다');
  if (!isNumList(levels) || levels.length === 0) throw new Error('gradient: levels 는 수 목록');
  if (!isNumList(sectionT) || sectionT.length !== 2) throw new Error('gradient: sectionT 는 [tMin, tMax]');
  return {
    type: 'gradient',
    stepMs,
    terms,
    points,
    point,
    dirLadder,
    directions,
    direction,
    delta,
    levels,
    sectionT,
  };
}

export async function gradientAlgorithm(baseCtx: FacetContext<GradientData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<GradientData>;
  const data = readData(ctx.data);
  const frame = boardFrame(data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다 (처음 한 번은 0 이어도 보낸다)
  const shown = new Map<string, number>();
  const setMetric = (name: 'point-level' | 'angle-to-gradient', value: number) => {
    if (!Number.isInteger(value) || value < 0) throw new Error(`gradient: 계기 ${name} 는 음이 아닌 정수 — ${value}`);
    const before = shown.get(name);
    if (before === undefined || before !== value) {
      ctx.metric(name, value - (before ?? 0));
      shown.set(name, value);
    }
  };
  const setPointLevel = (v: number) => setMetric('point-level', v);
  const setAngle = (v: number) => setMetric('angle-to-gradient', v);

  let pointIndex = data.point;
  let dirIndex = data.dirLadder.indexOf(data.direction);

  const playRound = async (): Promise<boolean> => {
    const cell = cellOf(data, pointIndex, dirIndex);

    // 걸음 0 — 판 머리
    setPointLevel(Math.round(cell.f));
    setAngle(0);
    await ctx.emit({
      type: 'init',
      payload: {
        pointIndex,
        p: cell.p,
        pText: pointText(cell.p),
        f: cell.f,
        fText: fmtInt(cell.f),
        levels: [...data.levels],
        contours: frame.contours.map((ct) => ({ level: ct.level, levelText: fmtInt(ct.level), pts: ct.pts })),
        mapBounds: frame.mapBounds,
        arrowScale: ARROW_SCALE,
        sectionT: [data.sectionT[0], data.sectionT[1]],
        sectionTicks: sectionTicks(data),
        sectionRange: frame.sectionRange,
        barMax: frame.barMax,
      },
      silent: true,
    });
    if (!(await ctx.sleep(data.stepMs + GRADIENT_MOTION_MS))) return false;

    // 걸음 1 — 자르는 선과 단면
    if (ctx.cancelled) return false;
    await phase('unit');
    const cutHalf = frame.cutHalf;
    await ctx.emit({
      type: 'cut',
      payload: {
        deg: cell.deg,
        degText: `${fmtInt(cell.deg)}°`,
        u: cell.u,
        cutHalf,
        cutEnds: [
          [cell.p[0] - cutHalf * cell.u[0], cell.p[1] - cutHalf * cell.u[1]],
          [cell.p[0] + cutHalf * cell.u[0], cell.p[1] + cutHalf * cell.u[1]],
        ],
        section: sectionSamples(data, cell.p, cell.u),
      },
    });
    if (!(await ctx.sleep(data.stepMs + GRADIENT_MOTION_MS))) return false;

    // 걸음 2 — 단면 기울기 (∇f 를 모르는 채 가운데 차분으로 잰다)
    if (ctx.cancelled) return false;
    await phase('diff');
    await ctx.emit({
      type: 'slope',
      payload: {
        s: cell.s,
        sText: fmt(cell.s, 2),
        tangent: [
          [-TANGENT_HALF, cell.f - TANGENT_HALF * cell.s],
          [TANGENT_HALF, cell.f + TANGENT_HALF * cell.s],
        ],
        tip: [cell.p[0] + ARROW_SCALE * cell.s * cell.u[0], cell.p[1] + ARROW_SCALE * cell.s * cell.u[1]],
      },
    });
    if (!(await ctx.sleep(data.stepMs + GRADIENT_MOTION_MS))) return false;

    // 걸음 3 — ∇f 를 겹쳐 견준다 (새 phase 없음 — diff 가 남는다)
    if (ctx.cancelled) return false;
    const partial = cell.axis === 'x' ? cell.grad[0] : cell.axis === 'y' ? cell.grad[1] : null;
    await ctx.emit({
      type: 'gradient',
      payload: {
        grad: cell.grad,
        gradText: `(${fmtInt(cell.grad[0])}, ${fmtInt(cell.grad[1])})`,
        mag: cell.mag,
        magText: fmt(cell.mag, 2),
        angle: cell.angle,
        angleText: `${fmt(cell.angle, 1)}°`,
        s: cell.s,
        sText: fmt(cell.s, 2),
        axis: cell.axis,
        partial,
        partialText: partial === null ? null : fmtInt(partial),
        arrowTip: [cell.p[0] + ARROW_SCALE * cell.grad[0], cell.p[1] + ARROW_SCALE * cell.grad[1]],
        circle: {
          cx: cell.p[0] + (ARROW_SCALE * cell.grad[0]) / 2,
          cy: cell.p[1] + (ARROW_SCALE * cell.grad[1]) / 2,
          r: (ARROW_SCALE * cell.mag) / 2,
        },
      },
    });
    setAngle(Math.round(cell.between));
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound())) return;
      // 손잡이 입력을 기다린다 — 우리 것이 아닌 type 은 흘리고, 제 type 인데 값이 어긋나면 던진다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = isRecord(input.payload) ? input.payload : null;
        if (input.type === 'point') {
          const v = payload?.value;
          if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= data.points.length) {
            throw new Error(`gradient: point 값이 사다리 밖이다 — ${String(v)}`);
          }
          pointIndex = v;
          break;
        }
        if (input.type === 'direction') {
          const v = payload?.value;
          if (typeof v !== 'number' || !data.dirLadder.includes(v)) {
            throw new Error(`gradient: direction 값이 사다리 밖이다 — ${String(v)}`);
          }
          dirIndex = data.dirLadder.indexOf(v);
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
