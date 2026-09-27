/**
 * 변환의 합성 — 같은 세 변환(늘임 · 회전 · 옮김)이라도 곱하는 **순서**가 도착지를 정한다.
 *
 * 동차 3×3 행렬이라 옮김까지 한 행렬 곱에 들어가고, 그래서 뒤에 오는 변환이 앞의 옮김을
 * 휘말리게 한다. 손잡이 둘(순서 · 회전 중심)을 돌리면 한 판을 다시 재생한다.
 *
 * 좌표 규약: 평면, x 오른쪽 · y 위(수학 좌표). 행렬은 행의 목록(9 칸, 행 우선)이고 열 벡터에
 * 왼쪽에서 곱한다(p′ = M·p). 걸음 k 의 합성 M_k = F_k · M_{k−1} — 뒤에 걸리는 것이 왼쪽이다.
 * 걸음 k 의 꼭짓점은 늘 **처음 도형에** M_k 를 곱한 것이다. 회전은 반시계 90° 의 배수로 묶어
 * cos · sin 을 정수 표에서 꺼낸다(삼각함수를 부르지 않는다). 회전 중심은 세계에 박힌 점이다.
 * 셈은 모두 정수라 반올림도 동률도 없다. 셈할 수 없는 상태(셋째 칸이 1 이 아님 · 창 밖 ·
 * 모르는 변환 id · 사다리 밖 손잡이 값)는 던진다.
 *
 * ── 이벤트 ────────────────────────────────────────────────────────────────
 *   round    (silent)  판 머리. 걸음 0 을 갈아 끼운다.
 *     payload { orderIndex: number, pivotIndex: number, motionMs: number,   // 무대 운동 길이 (속도 1)
 *               window: { xMin, xMax, yMin, yMax },
 *               shape: { id: string, x: number, y: number }[],      // 처음 L 자
 *               pivot: { id: string, x: number, y: number },
 *               factors: FactorView[],                              // 걸리는 차례
 *               matrix: number[9] }                                 // 단위 행렬
 *     FactorView = { id: 'scale', sx, sy } | { id: 'rotate', degrees, px, py } | { id: 'shift', dx, dy }
 *   compose  (걸음 1..3)  인수 하나를 왼쪽에 곱한다.
 *     payload { step: number (1..), factorIndex: number (0..), factor: string,
 *               matrix: number[9],                                  // M_k
 *               points: { id, x, y }[],                             // M_k · 처음 도형
 *               arc: { px, py, degrees } | null,                    // 회전이면 중심 둘레의 호
 *               shiftX: number, shiftY: number }                    // M_k 의 이동 열
 *   apply    (걸음 4)  합성 행렬 한 번의 곱으로 처음 도형 → 도착.
 *     payload { step: number, matrix: number[9], points: { id, x, y }[],
 *               same: number,    // 걸음 3 의 자리와 견주어 같은 꼭짓점 수
 *               unitW: number,   // 셋째 칸이 1 인 점 수
 *               total: number }  // 꼭짓점 수
 *   phase    (silent)  payload { phase: 'compose' | 'apply' } — 그 걸음의 발신 바로 앞
 *
 * ── phase 어휘 ─────────────────────────────────────────────────────────────
 *   compose · apply  (irs.ts 와 정확히 같다)
 *
 * ── 계기 (누적 채널 — 지금 값을 들고 차이만 보낸다) ─────────────────────────
 *   shift-x · shift-y  그 걸음까지의 합성 행렬 이동 열. 판 머리에서 0, 걸음 1..3 에서 갱신,
 *                      걸음 4 는 그대로.
 *
 * ── 재생 길이 ──────────────────────────────────────────────────────────────
 *   판 머리 뒤와 걸음 1..3 뒤에 sleep(stepMs + motionMs) — 넷이라 기본값 4 × 2.3 = 9.2 초.
 *   걸음 4 뒤는 입력 대기다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FactorId = 'scale' | 'rotate' | 'shift';

export type ScaleRotateTranslatePoint = { id: string; x: number; y: number };

export type ScaleRotateTranslateData = {
  type: 'scale-rotate-translate';
  stepMs: number;
  motionMs: number;
  shape: ScaleRotateTranslatePoint[];
  scale: { sx: number; sy: number };
  rotate: { quarterTurns: number };
  shift: { dx: number; dy: number };
  orders: FactorId[][];
  pivots: ScaleRotateTranslatePoint[];
  window: { xMin: number; xMax: number; yMin: number; yMax: number };
};

/** 행 우선 9 칸 행렬 */
export type Mat3 = number[];

export const FACTOR_IDS: readonly FactorId[] = ['scale', 'rotate', 'shift'];

/** 반시계 90° 의 횟수 → (cos, sin). 삼각함수를 부르지 않는다 */
const QUARTER_COS_SIN: Record<number, readonly [number, number]> = {
  0: [1, 0],
  1: [0, 1],
  2: [-1, 0],
  3: [0, -1],
};

// ── 좁히개 ─────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function int(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`scale-rotate-translate: ${where} 는 정수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`scale-rotate-translate: ${where} 는 수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

function rec(v: unknown, where: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`scale-rotate-translate: ${where} 가 객체가 아니다`);
  return v;
}

function points(v: unknown, where: string): ScaleRotateTranslatePoint[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`scale-rotate-translate: ${where} 가 비었거나 배열이 아니다`);
  }
  return v.map((raw, i) => {
    const p = rec(raw, `${where}[${i}]`);
    if (typeof p.id !== 'string' || p.id === '') {
      throw new Error(`scale-rotate-translate: ${where}[${i}].id 가 없다`);
    }
    return { id: p.id, x: int(p.x, `${where}[${i}].x`), y: int(p.y, `${where}[${i}].y`) };
  });
}

function isFactorId(v: unknown): v is FactorId {
  return v === 'scale' || v === 'rotate' || v === 'shift';
}

export function readScaleRotateTranslateData(raw: unknown): ScaleRotateTranslateData {
  const d = rec(raw, 'data');
  if (d.type !== 'scale-rotate-translate') {
    throw new Error(`scale-rotate-translate: data.type 이 다르다 (${String(d.type)})`);
  }
  const scale = rec(d.scale, 'scale');
  const rotate = rec(d.rotate, 'rotate');
  const shift = rec(d.shift, 'shift');
  const win = rec(d.window, 'window');
  if (!Array.isArray(d.orders) || d.orders.length === 0) {
    throw new Error('scale-rotate-translate: orders 가 비었다');
  }
  const orders = d.orders.map((o, i) => {
    if (!Array.isArray(o) || o.length === 0) {
      throw new Error(`scale-rotate-translate: orders[${i}] 가 비었다`);
    }
    return o.map((id, j) => {
      if (!isFactorId(id)) {
        throw new Error(`scale-rotate-translate: orders[${i}][${j}] 는 모르는 변환이다 (${String(id)})`);
      }
      return id;
    });
  });
  const window = {
    xMin: num(win.xMin, 'window.xMin'),
    xMax: num(win.xMax, 'window.xMax'),
    yMin: num(win.yMin, 'window.yMin'),
    yMax: num(win.yMax, 'window.yMax'),
  };
  if (!(window.xMin < window.xMax && window.yMin < window.yMax)) {
    throw new Error('scale-rotate-translate: window 의 범위가 비었다');
  }
  const stepMs = num(d.stepMs, 'stepMs');
  const motionMs = num(d.motionMs, 'motionMs');
  if (stepMs <= 0 || motionMs < 0) throw new Error('scale-rotate-translate: stepMs · motionMs 가 음수다');
  return {
    type: 'scale-rotate-translate',
    stepMs,
    motionMs,
    shape: points(d.shape, 'shape'),
    scale: { sx: int(scale.sx, 'scale.sx'), sy: int(scale.sy, 'scale.sy') },
    rotate: { quarterTurns: int(rotate.quarterTurns, 'rotate.quarterTurns') },
    shift: { dx: int(shift.dx, 'shift.dx'), dy: int(shift.dy, 'shift.dy') },
    orders,
    pivots: points(d.pivots, 'pivots'),
    window,
  };
}

// ── 셈 (IR 의 compose · applyPoint 와 같은 식) ──────────────────────────────

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** 인수 행렬 하나. 회전은 중심 p 둘레 T(p)·R·T(−p) */
export function factorMatrix(
  id: FactorId,
  data: ScaleRotateTranslateData,
  pivot: ScaleRotateTranslatePoint,
): Mat3 {
  switch (id) {
    case 'scale':
      return [data.scale.sx, 0, 0, 0, data.scale.sy, 0, 0, 0, 1];
    case 'shift':
      return [1, 0, data.shift.dx, 0, 1, data.shift.dy, 0, 0, 1];
    case 'rotate': {
      const q = ((data.rotate.quarterTurns % 4) + 4) % 4;
      const cs = QUARTER_COS_SIN[q];
      if (cs === undefined) throw new Error(`scale-rotate-translate: 회전 횟수 ${q} 의 cos · sin 이 없다`);
      const [c, s] = cs;
      const px = pivot.x;
      const py = pivot.y;
      return [c, -s, px - c * px + s * py, s, c, py - s * px - c * py, 0, 0, 1];
    }
  }
}

/** tmp[i*3+j] = Σ_k f[i*3+k] · m[k*3+j] — 인수를 왼쪽에 곱한다 */
export function composeLeft(f: Mat3, m: Mat3): Mat3 {
  if (f.length !== 9 || m.length !== 9) throw new Error('scale-rotate-translate: 행렬은 9 칸이어야 한다');
  const res: Mat3 = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let acc = 0;
      for (let k = 0; k < 3; k++) acc += (f[i * 3 + k] as number) * (m[k * 3 + j] as number);
      res.push(acc);
    }
  }
  return res;
}

/** m 의 세 행 · (x, y, 1) */
export function applyPoint(m: Mat3, x: number, y: number): [number, number, number] {
  const row = (r: number): number =>
    (m[r * 3] as number) * x + (m[r * 3 + 1] as number) * y + (m[r * 3 + 2] as number);
  return [row(0), row(1), row(2)];
}

/** 처음 도형에 합성 행렬을 곱한다. 셋째 칸이 1 이 아니면 던진다 */
export function transformShape(
  m: Mat3,
  shape: readonly ScaleRotateTranslatePoint[],
): ScaleRotateTranslatePoint[] {
  return shape.map((p) => {
    const [x, y, w] = applyPoint(m, p.x, p.y);
    if (w !== 1) {
      throw new Error(`scale-rotate-translate: 꼭짓점 ${p.id} 의 셋째 칸이 1 이 아니다 (${w}) — affine 이 아니다`);
    }
    return { id: p.id, x, y };
  });
}

/** 한 판의 인수 행렬들 (걸리는 차례) */
export function factorsFor(
  data: ScaleRotateTranslateData,
  orderIndex: number,
  pivotIndex: number,
): { id: FactorId; matrix: Mat3 }[] {
  const order = data.orders[orderIndex];
  const pivot = data.pivots[pivotIndex];
  if (order === undefined) throw new Error(`scale-rotate-translate: 순서 ${orderIndex} 가 사다리에 없다`);
  if (pivot === undefined) throw new Error(`scale-rotate-translate: 중심 ${pivotIndex} 이 사다리에 없다`);
  return order.map((id) => ({ id, matrix: factorMatrix(id, data, pivot) }));
}

/** 걸음 k(1..) 까지의 합성 행렬 */
export function composeUpTo(factors: readonly { matrix: Mat3 }[], k: number): Mat3 {
  let m = IDENTITY;
  for (let i = 0; i < k; i++) {
    const f = factors[i];
    if (f === undefined) throw new Error(`scale-rotate-translate: 인수 ${i} 가 없다`);
    m = composeLeft(f.matrix, m);
  }
  return m;
}

function assertInWindow(pts: readonly ScaleRotateTranslatePoint[], data: ScaleRotateTranslateData): void {
  const w = data.window;
  for (const p of pts) {
    if (p.x < w.xMin || p.x > w.xMax || p.y < w.yMin || p.y > w.yMax) {
      throw new Error(`scale-rotate-translate: 꼭짓점 ${p.id} (${p.x}, ${p.y}) 가 창 밖이다`);
    }
  }
}

function readKnob(payload: unknown, size: number, name: string): number {
  if (!isRecord(payload) || typeof payload.value !== 'number') {
    throw new Error(`scale-rotate-translate: ${name} 입력에 value 가 없다`);
  }
  const v = payload.value;
  if (!Number.isInteger(v) || v < 0 || v >= size) {
    throw new Error(`scale-rotate-translate: ${name} 값 ${v} 가 사다리(0..${size - 1}) 밖이다`);
  }
  return v;
}

// ── 알고리즘 ────────────────────────────────────────────────────────────────

export async function scaleRotateTranslateAlgorithm(
  ctx: FacetContext<ScaleRotateTranslateData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ScaleRotateTranslateData>;
  const data = readScaleRotateTranslateData(ctx.data);

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const meter = { x: 0, y: 0 };
  const showShift = (x: number, y: number): void => {
    ctx.metric('shift-x', x - meter.x);
    ctx.metric('shift-y', y - meter.y);
    meter.x = x;
    meter.y = y;
  };

  /** 한 판. 취소되면 false */
  const playRound = async (orderIndex: number, pivotIndex: number): Promise<boolean> => {
    const pivot = data.pivots[pivotIndex];
    if (pivot === undefined) throw new Error(`scale-rotate-translate: 중심 ${pivotIndex} 이 사다리에 없다`);
    const factors = factorsFor(data, orderIndex, pivotIndex);
    const pause = data.stepMs + data.motionMs;
    const degrees = 90 * data.rotate.quarterTurns;

    await ctx.emit({
      type: 'round',
      silent: true,
      payload: {
        orderIndex,
        pivotIndex,
        motionMs: data.motionMs,
        window: { ...data.window },
        shape: data.shape.map((p) => ({ ...p })),
        pivot: { ...pivot },
        factors: factors.map((f) => {
          switch (f.id) {
            case 'scale':
              return { id: 'scale', sx: data.scale.sx, sy: data.scale.sy };
            case 'rotate':
              return { id: 'rotate', degrees, px: pivot.x, py: pivot.y };
            case 'shift':
              return { id: 'shift', dx: data.shift.dx, dy: data.shift.dy };
          }
        }),
        matrix: [...IDENTITY],
      },
    });
    showShift(0, 0);
    if (!(await rctx.sleep(pause))) return false;

    let m = IDENTITY;
    let last: ScaleRotateTranslatePoint[] = data.shape;
    for (let k = 0; k < factors.length; k++) {
      if (ctx.cancelled) return false;
      const f = factors[k];
      if (f === undefined) throw new Error(`scale-rotate-translate: 인수 ${k} 가 없다`);
      m = composeLeft(f.matrix, m);
      const pts = transformShape(m, data.shape);
      assertInWindow(pts, data);
      const shiftX = m[2] as number;
      const shiftY = m[5] as number;
      await phase('compose');
      await ctx.emit({
        type: 'compose',
        payload: {
          step: k + 1,
          factorIndex: k,
          factor: f.id,
          matrix: [...m],
          points: pts,
          arc: f.id === 'rotate' ? { px: pivot.x, py: pivot.y, degrees } : null,
          shiftX,
          shiftY,
        },
      });
      showShift(shiftX, shiftY);
      last = pts;
      if (!(await rctx.sleep(pause))) return false;
    }

    if (ctx.cancelled) return false;
    // 걸음 4 — 합성 행렬 한 번의 곱. 셋째 칸을 따로 세고 걸음 3 의 자리와 견준다
    let unitW = 0;
    const arrived = data.shape.map((p) => {
      const [x, y, w] = applyPoint(m, p.x, p.y);
      if (w !== 1) {
        throw new Error(`scale-rotate-translate: 꼭짓점 ${p.id} 의 셋째 칸이 1 이 아니다 (${w})`);
      }
      unitW += 1;
      return { id: p.id, x, y };
    });
    let same = 0;
    for (const p of arrived) {
      const q = last.find((l) => l.id === p.id);
      if (q === undefined) throw new Error(`scale-rotate-translate: 걸음 3 에 꼭짓점 ${p.id} 가 없다`);
      if (q.x === p.x && q.y === p.y) same += 1;
    }
    await phase('apply');
    await ctx.emit({
      type: 'apply',
      payload: { step: factors.length + 1, matrix: [...m], points: arrived, same, unitW, total: arrived.length },
    });
    return true;
  };

  let orderIndex = 0;
  let pivotIndex = 0;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(orderIndex, pivotIndex))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'order') {
          orderIndex = readKnob(input.payload, data.orders.length, 'order');
          break;
        }
        if (input.type === 'pivot') {
          pivotIndex = readKnob(input.payload, data.pivots.length, 'pivot');
          break;
        }
        // 우리 손잡이가 아닌 입력은 흘린다
        continue;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
