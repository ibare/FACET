/**
 * 고유벡터 — 한 행렬을 여러 방향의 벡터에 한 번씩 곱해, 벡터마다 얼마나 도는지 잰다.
 *
 * 곱은 벡터마다 **한 번**이다. 거듭 곱하지 않는다. 돈 각은 v 에서 Av 까지의 부호 있는
 * 각(반시계 +)이고, 외적 v × Av 가 0 이면 Av 는 v 의 직선 위에 있다 — 그때 λ = (v · Av) / (v · v).
 *
 * 이벤트
 *
 *   init   (silent) 바탕 — 무대가 담아야 할 틀과 돈 각의 폭. 걸음 0 을 갈아 끼운다
 *          payload: {
 *            bounds: { minX: number; maxX: number; minY: number; maxY: number };  // 모든 v · Av 의 좌표 범위
 *            spinMin: number; spinMax: number;                                     // 돈 각(도)의 최소 · 최대
 *          }
 *
 *   apply  벡터 하나에 A 를 곱했다 (걸음 하나)
 *          payload: {
 *            index: number;                 // 훑는 차례 (0부터)
 *            v: [number, number];           // 곱하기 전
 *            av: [number, number];          // 곱한 뒤
 *            vDeg: number; avDeg: number;   // +x 축에서 반시계로 잰 각, [0, 360)
 *            spinDeg: number;               // atan2(v × Av, v · Av), 도
 *            factor: number;                // |Av| / |v|
 *            cross: number;                 // v × Av = v.x·Av.y − v.y·Av.x
 *            onLine: boolean;               // |cross| < 1e−9
 *            lambda: number | null;         // onLine 일 때 (v · Av) / (v · v), 아니면 null
 *          }
 *
 * metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = [number, number];
export type Mat2 = [Vec2, Vec2];

export type EigenvectorDirectionFacetData = {
  type: 'eigenvector-direction';
  stepMs: number;
  /** 행 차례 — [[a, b], [c, d]] */
  matrix: Mat2;
  /** 훑을 벡터, 차례대로 */
  vectors: Vec2[];
};

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

/** 같음 판정의 허용 오차 */
export const ON_LINE_EPS = 1e-9;

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function narrowVec(raw: unknown, path: string): Vec2 {
  if (!Array.isArray(raw) || raw.length !== 2 || !isNum(raw[0]) || !isNum(raw[1])) {
    throw new Error(`eigenvector-direction: ${path} 는 수 둘의 배열이어야 한다`);
  }
  return [raw[0], raw[1]];
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowEigenvectorDirectionData(raw: unknown): EigenvectorDirectionFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('eigenvector-direction: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'eigenvector-direction') {
    throw new Error(`eigenvector-direction: type 이 'eigenvector-direction' 이 아니다 (${String(r.type)})`);
  }
  if (!isNum(r.stepMs) || r.stepMs <= 0) {
    throw new Error('eigenvector-direction: stepMs 는 양수여야 한다');
  }
  const m = r.matrix;
  if (!Array.isArray(m) || m.length !== 2) {
    throw new Error('eigenvector-direction: matrix 는 두 행이어야 한다');
  }
  const matrix: Mat2 = [narrowVec(m[0], 'matrix[0]'), narrowVec(m[1], 'matrix[1]')];
  const vs = r.vectors;
  if (!Array.isArray(vs) || vs.length === 0) {
    throw new Error('eigenvector-direction: vectors 는 비지 않은 배열이어야 한다');
  }
  const vectors = vs.map((v, i) => {
    const vec = narrowVec(v, `vectors[${i}]`);
    if (vec[0] === 0 && vec[1] === 0) {
      throw new Error(`eigenvector-direction: vectors[${i}] 가 영벡터다 — 방향이 없다`);
    }
    return vec;
  });
  // 훑는 차례는 v 의 각이 오르는 차례다 — 자료가 그 차례가 아니면 던진다
  for (let i = 1; i < vectors.length; i += 1) {
    if (polarDeg(vectors[i]!) <= polarDeg(vectors[i - 1]!)) {
      throw new Error(`eigenvector-direction: vectors[${i}] 의 각이 앞 벡터보다 크지 않다 — 각이 오르는 차례여야 한다`);
    }
  }
  return { type: 'eigenvector-direction', stepMs: r.stepMs, matrix, vectors };
}

/** A·v — 행 차례 행렬을 세로 벡터에 곱한다 */
export function applyMatrix(m: Mat2, v: Vec2): Vec2 {
  return [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]];
}

/** +x 축에서 반시계로 잰 각, 도, [0, 360) */
function polarDeg(v: Vec2): number {
  const d = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  return d < 0 ? d + 360 : d;
}

export type Probe = {
  index: number;
  v: Vec2;
  av: Vec2;
  vDeg: number;
  avDeg: number;
  spinDeg: number;
  factor: number;
  cross: number;
  onLine: boolean;
  lambda: number | null;
};

function probe(m: Mat2, v: Vec2, index: number): Probe {
  const av = applyMatrix(m, v);
  const cross = v[0] * av[1] - v[1] * av[0];
  const dot = v[0] * av[0] + v[1] * av[1];
  const spinDeg = (Math.atan2(cross, dot) * 180) / Math.PI;
  const factor = Math.hypot(av[0], av[1]) / Math.hypot(v[0], v[1]);
  const onLine = Math.abs(cross) < ON_LINE_EPS;
  const lambda = onLine ? dot / (v[0] * v[0] + v[1] * v[1]) : null;
  return { index, v, av, vDeg: polarDeg(v), avDeg: polarDeg(av), spinDeg, factor, cross, onLine, lambda };
}

export async function eigenvectorDirection(
  context: FacetContext<EigenvectorDirectionFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<EigenvectorDirectionFacetData>;
  const data = narrowEigenvectorDirectionData(ctx.data);
  const { matrix, vectors, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const probes = vectors.map((v, i) => probe(matrix, v, i));

  const xs = probes.flatMap((p) => [p.v[0], p.av[0]]);
  const ys = probes.flatMap((p) => [p.v[1], p.av[1]]);
  const spins = probes.map((p) => p.spinDeg);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      bounds: {
        minX: Math.min(0, ...xs),
        maxX: Math.max(0, ...xs),
        minY: Math.min(0, ...ys),
        maxY: Math.max(0, ...ys),
      },
      spinMin: Math.min(0, ...spins),
      spinMax: Math.max(0, ...spins),
    },
  });

  for (const p of probes) {
    // 걸음 0 에 행렬과 훑을 벡터가 이미 있어 읽을 틈을 먼저 둔다
    if (!(await pause())) return;
    await ctx.emit({
      type: 'apply',
      payload: {
        index: p.index,
        v: [p.v[0], p.v[1]],
        av: [p.av[0], p.av[1]],
        vDeg: p.vDeg,
        avDeg: p.avDeg,
        spinDeg: p.spinDeg,
        factor: p.factor,
        cross: p.cross,
        onLine: p.onLine,
        lambda: p.lambda,
      },
    });
  }
}
