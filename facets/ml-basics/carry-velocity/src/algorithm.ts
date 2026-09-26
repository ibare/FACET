/**
 * carry-velocity — 모멘텀이 이어 받은 몫만으로 기울기 0 인 평지를 건너가는가.
 *
 * 무게 하나 w, 손실은 꺾인 선(구간마다 L = intercept + slope·w, 경계는 왼쪽 닫힘).
 * 갱신 규약 (사양 그대로): v ← β·v − η·g ; w ← w + v. g 는 갱신 전 자리에서 셈한다.
 * "이어 받은 몫" = β·v(앞) · "새로 민 몫" = −η·g.
 *
 * 이벤트
 *   init   (silent) — 걸음 0 의 셈한 바탕
 *     payload: { loss0: number, lo: number, hi: number, updates: number }
 *       loss0   처음 자리 w0 의 손실
 *       lo, hi  w 축 범위 (자취 전체와 구간 경계를 담는 가장 작은 폭)
 *       updates 갱신 수
 *   update — 갱신 한 번 (한 걸음)
 *     payload: { k: number, from: number, vPrev: number, g: number,
 *                carried: number, push: number, v: number, to: number, loss: number }
 *       k        몇 번째 갱신 (1 부터)
 *       from     갱신 전 자리 w
 *       vPrev    앞 움직임 v
 *       g        from 에서 셈한 기울기
 *       carried  이어 받은 몫 β·vPrev
 *       push     새로 민 몫 −η·g
 *       v        새 움직임 carried + push
 *       to       갱신 뒤 자리 from + v
 *       loss     to 의 손실
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 손실의 한 구간 — L = intercept + slope·w, g = slope. */
export type CarryVelocityPiece = { intercept: number; slope: number };

export type CarryVelocityFacetData = {
  type: 'carry-velocity';
  stepMs: number;
  /** 구간 경계. pieces 보다 하나 적고 오름차순. 구간 i 는 [breaks[i-1], breaks[i]) */
  breaks: number[];
  pieces: CarryVelocityPiece[];
  beta: number;
  eta: number;
  w0: number;
  v0: number;
  updates: number;
};

export type CarryVelocityRow = {
  k: number;
  from: number;
  vPrev: number;
  g: number;
  carried: number;
  push: number;
  v: number;
  to: number;
  loss: number;
};

export type CarryVelocityRun = {
  loss0: number;
  lo: number;
  hi: number;
  rows: CarryVelocityRow[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function finite(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error(`carry-velocity: ${path} 가 유한한 수가 아니다`);
  }
  return x;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowCarryVelocityData(raw: unknown): CarryVelocityFacetData {
  if (!isRecord(raw)) throw new Error('carry-velocity: 자료가 객체가 아니다');
  if (raw.type !== 'carry-velocity') throw new Error('carry-velocity: type 이 carry-velocity 가 아니다');
  const stepMs = finite(raw.stepMs, 'stepMs');
  if (!Array.isArray(raw.breaks)) throw new Error('carry-velocity: breaks 가 배열이 아니다');
  if (!Array.isArray(raw.pieces)) throw new Error('carry-velocity: pieces 가 배열이 아니다');
  const breaks = raw.breaks.map((b, i) => finite(b, `breaks[${i}]`));
  for (let i = 1; i < breaks.length; i += 1) {
    if (!(breaks[i]! > breaks[i - 1]!)) throw new Error(`carry-velocity: breaks[${i}] 가 앞보다 크지 않다`);
  }
  const pieces = raw.pieces.map((p, i): CarryVelocityPiece => {
    if (!isRecord(p)) throw new Error(`carry-velocity: pieces[${i}] 가 객체가 아니다`);
    return { intercept: finite(p.intercept, `pieces[${i}].intercept`), slope: finite(p.slope, `pieces[${i}].slope`) };
  });
  if (pieces.length !== breaks.length + 1) {
    throw new Error('carry-velocity: pieces 는 breaks 보다 하나 많아야 한다');
  }
  const updates = finite(raw.updates, 'updates');
  if (!Number.isInteger(updates) || updates < 1) throw new Error('carry-velocity: updates 가 1 이상의 정수가 아니다');
  return {
    type: 'carry-velocity',
    stepMs,
    breaks,
    pieces,
    beta: finite(raw.beta, 'beta'),
    eta: finite(raw.eta, 'eta'),
    w0: finite(raw.w0, 'w0'),
    v0: finite(raw.v0, 'v0'),
    updates,
  };
}

/** w 가 드는 구간 번호 — 경계는 왼쪽 닫힘 (경계값은 오른쪽 구간에 든다). */
export function pieceIndexAt(breaks: readonly number[], w: number): number {
  let i = 0;
  while (i < breaks.length && w >= breaks[i]!) i += 1;
  return i;
}

function pieceAt(data: CarryVelocityFacetData, w: number): CarryVelocityPiece {
  const p = data.pieces[pieceIndexAt(data.breaks, w)];
  if (!p) throw new Error(`carry-velocity: w=${w} 의 구간이 없다`);
  return p;
}

export function lossAt(data: CarryVelocityFacetData, w: number): number {
  const p = pieceAt(data, w);
  return p.intercept + p.slope * w;
}

export function gradAt(data: CarryVelocityFacetData, w: number): number {
  return pieceAt(data, w).slope;
}

/** 갱신 전부를 셈한다 — 순수. 축 범위도 여기서 정한다. */
export function runCarryVelocity(data: CarryVelocityFacetData): CarryVelocityRun {
  let w = data.w0;
  let v = data.v0;
  const rows: CarryVelocityRow[] = [];
  for (let k = 1; k <= data.updates; k += 1) {
    const g = gradAt(data, w);
    const carried = data.beta * v;
    const push = -data.eta * g;
    const vn = carried + push;
    const to = w + vn;
    rows.push({ k, from: w, vPrev: v, g, carried, push, v: vn, to, loss: lossAt(data, to) });
    w = to;
    v = vn;
  }
  const ws = [data.w0, ...rows.map((r) => r.to), ...data.breaks];
  return { loss0: lossAt(data, data.w0), lo: Math.min(...ws), hi: Math.max(...ws), rows };
}

/** 화면 표시 — toFixed 에 음수 기호만 바꾼다. -0 표시는 셈이 경계에 걸린 것이라 던진다. */
export function fmtNum(x: number, digits = 2): string {
  if (!Number.isFinite(x)) throw new Error(`carry-velocity: 표시할 수 없는 값 ${x}`);
  const s = x.toFixed(digits);
  if (/^-0\.?0*$/.test(s)) throw new Error(`carry-velocity: ${x} 가 -0 으로 찍힌다`);
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}

export async function carryVelocity(ctx: FacetContext<CarryVelocityFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CarryVelocityFacetData>;
  const data = narrowCarryVelocityData(rctx.data);
  const run = runCarryVelocity(data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: { loss0: run.loss0, lo: run.lo, hi: run.hi, updates: data.updates },
  });

  // 걸음 0 은 이미 읽을 것(구간 · 처음 자리)이 있는 화면이라 첫 갱신 앞에도 문을 둔다
  for (const row of run.rows) {
    if (!(await pause())) return;
    await rctx.emit({
      type: 'update',
      payload: {
        k: row.k,
        from: row.from,
        vPrev: row.vPrev,
        g: row.g,
        carried: row.carried,
        push: row.push,
        v: row.v,
        to: row.to,
        loss: row.loss,
      },
    });
  }
}
