/**
 * inverse-undoes — 행렬 A 로 옮긴 점 셋을 A⁻¹ 로 옮기면 떠나기 전 자리로 돌아온다.
 *
 * 1차 데이터는 행렬 A 의 칸 넷(행 차례 a b c d)과 점 셋뿐이다. 옮긴 자리 · 행렬식 ·
 * 역행렬 · 남은 거리 · A⁻¹A 는 모두 여기서 셈한다. 이 수들은 정수이거나 0.5 의
 * 배수라 배정도에서 정확하다 — 같음은 `===` 로 판정한다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나)
 *   leave    { from: Pt[]; to: Pt[]; away: number }
 *            A 를 점 셋에 건다. to[i] = A · from[i]. away = to 가 from 과 다른 점의 수.
 *   invert   { det: number; adj: M; inv: M }
 *            det = ad − bc, adj = [d −b ; −c a], inv = adj / det.
 *   return   { from: Pt[]; to: Pt[]; homeFlags: boolean[]; home: number; residual: number }
 *            A⁻¹ 를 옮긴 점 셋에 건다. to[i] = A⁻¹ · from[i].
 *            homeFlags[i] = to[i] 가 처음 자리와 정확히 같은가,
 *            home = homeFlags 가운데 참의 수,
 *            residual = 처음 자리까지 남은 거리 가운데 가장 큰 것.
 *   compose  { product: M; moved: number }
 *            product = A⁻¹ · A. moved = product 가 옮기는 처음 점의 수.
 *
 * Pt = [x, y], M = [a, b, c, d] (행 차례).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = readonly [number, number];
export type M = readonly [number, number, number, number];

export type InverseUndoesFacetData = {
  type: 'inverse-undoes';
  stepMs: number;
  /** A 의 칸 넷, 행 차례 (a b ; c d) */
  matrix: M;
  points: readonly Pt[];
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowPt(v: unknown, path: string): Pt {
  if (!Array.isArray(v) || v.length !== 2 || !isNum(v[0]) || !isNum(v[1])) {
    throw new Error(`inverse-undoes: ${path} 는 수 둘의 배열이어야 한다`);
  }
  return [v[0], v[1]];
}

export function narrowMatrix(v: unknown, path: string): M {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(isNum)) {
    throw new Error(`inverse-undoes: ${path} 는 수 넷의 배열(행 차례)이어야 한다`);
  }
  return [v[0], v[1], v[2], v[3]];
}

export function narrowPoints(v: unknown, path: string): Pt[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`inverse-undoes: ${path} 는 점이 하나 이상인 배열이어야 한다`);
  }
  return v.map((p, i) => narrowPt(p, `${path}[${i}]`));
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. */
export function narrowInverseUndoesData(raw: unknown): InverseUndoesFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('inverse-undoes: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'inverse-undoes') {
    throw new Error(`inverse-undoes: type 이 'inverse-undoes' 가 아니다 (${String(r.type)})`);
  }
  if (!isNum(r.stepMs) || r.stepMs <= 0) {
    throw new Error('inverse-undoes: stepMs 는 양수여야 한다');
  }
  return {
    type: 'inverse-undoes',
    stepMs: r.stepMs,
    matrix: narrowMatrix(r.matrix, 'matrix'),
    points: narrowPoints(r.points, 'points'),
  };
}

/** 행렬을 점에 건다 — 세로 벡터, 왼쪽에서 곱한다. */
export function applyMatrix(m: M, p: Pt): Pt {
  return [m[0] * p[0] + m[1] * p[1], m[2] * p[0] + m[3] * p[1]];
}

export function mulMatrix(l: M, r: M): M {
  return [
    l[0] * r[0] + l[1] * r[2],
    l[0] * r[1] + l[1] * r[3],
    l[2] * r[0] + l[3] * r[2],
    l[2] * r[1] + l[3] * r[3],
  ];
}

export function samePt(p: Pt, q: Pt): boolean {
  return p[0] === q[0] && p[1] === q[1];
}

/**
 * 수 표기 — 정수는 정수로, 0.5 의 배수는 소수 한 자리. 빼기는 U+2212, −0 은 0.
 * 그 밖의 수는 이 조각에 나오지 않으므로 던진다.
 */
export function formatNum(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`inverse-undoes: 수가 아니다 (${v})`);
  if (Number.isInteger(v * 2) === false) {
    throw new Error(`inverse-undoes: 0.5 의 배수가 아닌 수 (${v})`);
  }
  const abs = Math.abs(v);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return v < 0 ? `−${body}` : body;
}

export function formatPt(p: Pt): string {
  return `(${formatNum(p[0])}, ${formatNum(p[1])})`;
}

export async function inverseUndoes(ctx: FacetContext<InverseUndoesFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<InverseUndoesFacetData>;
  const data = narrowInverseUndoesData(rctx.data);
  const { stepMs, matrix: a, points } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 에 이미 점과 A 가 있다 — 읽을 틈을 둔다.
  if (!(await pause())) return;

  // 걸음 1 — A 로 떠난다.
  const moved = points.map((p) => applyMatrix(a, p));
  const away = moved.filter((q, i) => !samePt(q, points[i]!)).length;
  await rctx.emit({ type: 'leave', payload: { from: points, to: moved, away } });
  if (!(await pause())) return;

  // 걸음 2 — A⁻¹ 를 셈한다.
  const det = a[0] * a[3] - a[1] * a[2];
  if (det === 0) {
    throw new Error('inverse-undoes: det A 가 0 이라 역행렬이 없다 — 이 조각의 자료가 아니다');
  }
  const adj: M = [a[3], -a[1], -a[2], a[0]];
  const inv: M = [adj[0] / det, adj[1] / det, adj[2] / det, adj[3] / det];
  await rctx.emit({ type: 'invert', payload: { det, adj, inv } });
  if (!(await pause())) return;

  // 걸음 3 — A⁻¹ 로 돌아온다.
  const back = moved.map((q) => applyMatrix(inv, q));
  const homeFlags = back.map((q, i) => samePt(q, points[i]!));
  const home = homeFlags.filter((f) => f).length;
  const residual = Math.max(
    ...back.map((q, i) => Math.hypot(q[0] - points[i]![0], q[1] - points[i]![1])),
  );
  await rctx.emit({ type: 'return', payload: { from: moved, to: back, homeFlags, home, residual } });
  if (!(await pause())) return;

  // 걸음 4 — A⁻¹A 를 한 행렬로.
  const product = mulMatrix(inv, a);
  const stillMoved = points.filter((p) => !samePt(applyMatrix(product, p), p)).length;
  await rctx.emit({ type: 'compose', payload: { product, moved: stillMoved } });
}
