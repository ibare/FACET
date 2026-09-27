/**
 * matrixAsTransform — 행렬 하나를 평면 전체에 건다. 격자 점이 모두 한꺼번에 옮겨 가고,
 * 옮긴 뒤에도 남는 것(원점 · 곧은 줄 · 고른 간격)을 하나씩 짚는다.
 *
 * 점은 `gridPoints(values)` 차례(y 가 바깥, x 가 안쪽)로 번호가 붙는다. 줄은 `gridLines(values)` 차례.
 * 점 p 가 가는 자리 = A p (A 는 행 차례, p 는 세로 벡터). 모든 이벤트에 target 은 없다.
 *
 * 이벤트
 *  - init (silent)  { extent: number }
 *      옮기기 전 · 뒤를 통틀어 가장 큰 좌표의 절댓값. 평면의 축척이 걸음마다 바뀌지 않게 걸음 0 에 싣는다.
 *  - move           { from: [x, y][]; to: [x, y][]; changed: number; total: number }
 *      점 전부가 한 걸음에 옮겨 간다. from 은 옮기기 전(장면 대조용), to 는 A p. changed 는 자리가 바뀐 점의 수.
 *  - origin         { index: number; from: [x, y]; to: [x, y]; dist: number }
 *      원점과 그 옮긴 자리, 움직인 거리 |A p − p|.
 *  - distance       { near: { dist: number; points: number[] }; far: { dist: number; points: number[] }; kinds: number[] }
 *      자리가 바뀐 점 가운데 가장 가까이 · 가장 멀리 간 점들과 그 거리, 움직인 거리의 종류(오름차순, 0 제외).
 *  - straight       { lines: { id: string; ok: boolean }[]; count: number; total: number }
 *      옮긴 뒤 줄마다 점 다섯이 한 직선 위에 있는가 (첫 두 점의 차와 나머지 차의 외적이 0).
 *  - even           { lines: { id: string; ok: boolean }[]; count: number; total: number }
 *      옮긴 뒤 줄마다 이웃한 두 점의 차가 모두 같은가.
 *
 * silent 는 init 하나뿐이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];
/** 2×2 행렬. 행 차례 — [[a, b], [c, d]] 는 윗줄 a b · 아랫줄 c d. */
export type Mat2 = readonly [Vec2, Vec2];

export type MatrixAsTransformFacetData = {
  type: 'matrix-as-transform';
  stepMs: number;
  matrix: Mat2;
  /** 격자의 좌표 값. x · y 가 각각 이 값들을 지난다. 오름차순. */
  values: readonly number[];
};

export type GridLine = {
  id: string;
  axis: 'h' | 'v';
  /** 가로 줄이면 y, 세로 줄이면 x */
  at: number;
  /** 줄 위의 점 번호 — 가로 줄은 x 오름차순, 세로 줄은 y 오름차순 */
  members: readonly number[];
};

function fail(path: string, why: string): never {
  throw new Error(`matrixAsTransform: ${path} — ${why}`);
}

function readNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function readRow(v: unknown, path: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) fail(path, '칸 둘인 줄이 아니다');
  return [readNumber(v[0], `${path}[0]`), readNumber(v[1], `${path}[1]`)];
}

/** `ctx.data` · `initialData` 의 좁히개. 모양이 어긋나면 던진다. */
export function readMatrixAsTransformData(raw: unknown): MatrixAsTransformFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'matrix-as-transform') fail('data.type', `'matrix-as-transform' 가 아니다`);
  const stepMs = readNumber(d.stepMs, 'data.stepMs');
  if (stepMs <= 0) fail('data.stepMs', '0 보다 커야 한다');
  const m = d.matrix;
  if (!Array.isArray(m) || m.length !== 2) fail('data.matrix', '줄 둘인 행렬이 아니다');
  const matrix: Mat2 = [readRow(m[0], 'data.matrix[0]'), readRow(m[1], 'data.matrix[1]')];
  const vs = d.values;
  if (!Array.isArray(vs) || vs.length < 3) fail('data.values', '값 셋 이상인 배열이 아니다');
  const values = vs.map((v, i) => readNumber(v, `data.values[${i}]`));
  for (let i = 1; i < values.length; i += 1) {
    if (!(values[i]! > values[i - 1]!)) fail(`data.values[${i}]`, '오름차순이 아니다');
  }
  if (!values.includes(0)) fail('data.values', '원점을 지나는 값 0 이 없다');
  return { type: 'matrix-as-transform', stepMs, matrix, values };
}

/** 격자 점. y 가 바깥, x 가 안쪽 — 번호 = yi · n + xi. */
export function gridPoints(values: readonly number[]): Vec2[] {
  const out: Vec2[] = [];
  for (const y of values) for (const x of values) out.push([x, y]);
  return out;
}

/** 격자 줄. 가로 줄(y 차례) 다음 세로 줄(x 차례). */
export function gridLines(values: readonly number[]): GridLine[] {
  const n = values.length;
  const lines: GridLine[] = [];
  values.forEach((y, yi) => {
    lines.push({ id: `h${yi}`, axis: 'h', at: y, members: values.map((_, xi) => yi * n + xi) });
  });
  values.forEach((x, xi) => {
    lines.push({ id: `v${xi}`, axis: 'v', at: x, members: values.map((_, yi) => yi * n + xi) });
  });
  return lines;
}

function applyMatrix(m: Mat2, p: Vec2): Vec2 {
  return [m[0][0] * p[0] + m[0][1] * p[1], m[1][0] * p[0] + m[1][1] * p[1]];
}

function at<T>(xs: readonly T[], i: number, path: string): T {
  const v = xs[i];
  if (v === undefined) fail(path, `${i} 번째가 없다`);
  return v;
}

/** 옮긴 줄의 점들이 한 직선 위에 있는가 — 첫 두 점의 차와 나머지 차의 외적이 정확히 0. */
function isStraight(pts: readonly Vec2[], id: string): boolean {
  const q0 = at(pts, 0, `line ${id}`);
  const q1 = at(pts, 1, `line ${id}`);
  const ux = q1[0] - q0[0];
  const uy = q1[1] - q0[1];
  if (ux === 0 && uy === 0) fail(`line ${id}`, '첫 두 점이 포개져 방향을 정할 수 없다');
  return pts.every((q) => ux * (q[1] - q0[1]) - uy * (q[0] - q0[0]) === 0);
}

/** 옮긴 줄의 이웃한 두 점의 차가 모두 같은가. */
function isEven(pts: readonly Vec2[], id: string): boolean {
  const q0 = at(pts, 0, `line ${id}`);
  const q1 = at(pts, 1, `line ${id}`);
  const gx = q1[0] - q0[0];
  const gy = q1[1] - q0[1];
  for (let k = 1; k < pts.length; k += 1) {
    const a = at(pts, k - 1, `line ${id}`);
    const b = at(pts, k, `line ${id}`);
    if (b[0] - a[0] !== gx || b[1] - a[1] !== gy) return false;
  }
  return true;
}

export async function matrixAsTransform(ctx: FacetContext<MatrixAsTransformFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MatrixAsTransformFacetData>;
  const data = readMatrixAsTransformData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const before = gridPoints(data.values);
  const after = before.map((p) => applyMatrix(data.matrix, p));
  const lines = gridLines(data.values);

  let extent = 0;
  for (const p of [...before, ...after]) extent = Math.max(extent, Math.abs(p[0]), Math.abs(p[1]));

  // 걸음 0 — 행렬과 격자가 이미 서 있다. 축척만 싣고 읽을 틈을 둔다.
  await ctx.emit({ type: 'init', silent: true, payload: { extent } });
  if (!(await pause())) return;

  // 걸음 1 — 한꺼번에 옮겨 간다
  const d2 = before.map((p, i) => {
    const q = at(after, i, 'after');
    return (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
  });
  const changed = d2.filter((v) => v !== 0).length;
  await ctx.emit({
    type: 'move',
    payload: {
      from: before.map((p) => [p[0], p[1]]),
      to: after.map((q) => [q[0], q[1]]),
      changed,
      total: before.length,
    },
  });
  if (!(await pause())) return;

  // 걸음 2 — 원점
  const oi = before.findIndex((p) => p[0] === 0 && p[1] === 0);
  if (oi < 0) fail('before', '원점이 격자에 없다');
  const oq = at(after, oi, 'after');
  await ctx.emit({
    type: 'origin',
    payload: { index: oi, from: [0, 0], to: [oq[0], oq[1]], dist: Math.sqrt(at(d2, oi, 'd2')) },
  });
  if (!(await pause())) return;

  // 걸음 3 — 움직인 거리
  const movedD2 = d2.filter((v) => v !== 0);
  if (movedD2.length === 0) fail('d2', '자리가 바뀐 점이 없다');
  const minD2 = Math.min(...movedD2);
  const maxD2 = Math.max(...movedD2);
  const pick = (target: number): number[] =>
    d2.flatMap((v, i) => (v === target ? [i] : []));
  const kinds = [...new Set(movedD2)].sort((a, b) => a - b).map((v) => Math.sqrt(v));
  await ctx.emit({
    type: 'distance',
    payload: {
      near: { dist: Math.sqrt(minD2), points: pick(minD2) },
      far: { dist: Math.sqrt(maxD2), points: pick(maxD2) },
      kinds,
    },
  });
  if (!(await pause())) return;

  // 걸음 4 — 곧은 줄
  const moved = (ln: GridLine): Vec2[] => ln.members.map((i) => at(after, i, `line ${ln.id}`));
  const straight = lines.map((ln) => ({ id: ln.id, ok: isStraight(moved(ln), ln.id) }));
  await ctx.emit({
    type: 'straight',
    payload: { lines: straight, count: straight.filter((l) => l.ok).length, total: lines.length },
  });
  if (!(await pause())) return;

  // 걸음 5 — 고른 간격
  const even = lines.map((ln) => ({ id: ln.id, ok: isEven(moved(ln), ln.id) }));
  await ctx.emit({
    type: 'even',
    payload: { lines: even, count: even.filter((l) => l.ok).length, total: lines.length },
  });
}
