/**
 * determinantZeroCollapse — 행렬식이 0 인 행렬로 점 여섯을 하나씩 옮기면 도착 자리가 포개진다.
 *
 * 점 p 가 가는 자리 = A p (열 벡터, 왼쪽 곱). 행렬식 = ad − bc. 한 자리에 먼저 와 있던 점의
 * 수를 세어 "여기 온 점" 이 1 → 2 → 3 으로 오르는 것을 보인다.
 *
 * 이벤트 (차례대로)
 *   init  (silent: true) — 알고리즘이 셈한 바탕. 걸음 0 을 갈아 끼운다.
 *     payload: {
 *       images: [number, number][]   점마다 옮긴 자리 A p (점 차례)
 *       spotOf: number[]             점마다 도착 자리의 번호 (spots 의 첨자)
 *       spots: [number, number][]    서로 다른 도착 자리 (처음 도착한 차례)
 *       totals: number[]             자리마다 끝내 올 점의 수
 *       sourceSpots: number          옮기기 전 서로 다른 자리의 수
 *       det: number                  ad − bc
 *       line: [number, number]       도착 자리가 모두 놓인 직선의 방향 (0 이 아닌 첫 열)
 *       bounds: { minX, maxX, minY, maxY }  원점 · 점 · 도착 자리를 모두 담는 범위
 *     }
 *   move  — 점 하나를 옮긴다 (걸음 1..n)
 *     payload: { i: number; spot: number; count: number }
 *       i 점 번호 · spot 도착 자리 번호 · count 이 걸음까지 그 자리에 온 점의 수
 *   done  — 점 수 · 자리 수 · 행렬식을 적는다 (마지막 걸음)
 *     payload: { points: number; spots: number; det: number }
 *
 * ctx.metric 은 부르지 않는다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = readonly [number, number];

/** 행 차례 [a, b, c, d] — 윗줄 a b · 아랫줄 c d. */
export type Mat2 = readonly [number, number, number, number];

export type DeterminantZeroCollapseFacetData = {
  type: 'determinant-zero-collapse';
  stepMs: number;
  /** 행 차례로 적은 2×2 행렬 — [[a, b], [c, d]] */
  matrix: readonly (readonly number[])[];
  /** 옮길 차례대로 적은 점 */
  points: readonly (readonly number[])[];
};

export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

export type CollapseInput = {
  stepMs: number;
  matrix: Mat2;
  points: Pt[];
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 수 둘짜리 배열을 점으로 좁힌다. 어긋나면 필드 경로를 담아 던진다. */
export function readPt(raw: unknown, path: string): Pt {
  if (!Array.isArray(raw) || raw.length !== 2) {
    throw new Error(`determinantZeroCollapse: ${path} 는 수 둘짜리 배열이어야 한다`);
  }
  const [x, y] = raw as unknown[];
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    throw new Error(`determinantZeroCollapse: ${path} 의 칸이 유한한 수가 아니다`);
  }
  return [x, y];
}

/** 좁히개 — 알고리즘과 장면의 initial 이 함께 부른다. */
export function readCollapseInput(raw: unknown): CollapseInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('determinantZeroCollapse: 자료가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'determinant-zero-collapse') {
    throw new Error(`determinantZeroCollapse: type 이 어긋난다 (${String(r.type)})`);
  }
  if (!isFiniteNumber(r.stepMs) || r.stepMs <= 0) {
    throw new Error('determinantZeroCollapse: stepMs 는 양수여야 한다');
  }
  if (!Array.isArray(r.matrix) || r.matrix.length !== 2) {
    throw new Error('determinantZeroCollapse: matrix 는 줄 둘이어야 한다');
  }
  const row0 = readPt(r.matrix[0], 'matrix[0]');
  const row1 = readPt(r.matrix[1], 'matrix[1]');
  if (!Array.isArray(r.points) || r.points.length === 0) {
    throw new Error('determinantZeroCollapse: points 가 비었다');
  }
  const points = r.points.map((p, i) => readPt(p, `points[${i}]`));
  return { stepMs: r.stepMs, matrix: [row0[0], row0[1], row1[0], row1[1]], points };
}

/** 점 p 가 가는 자리 A p. */
export function apply(m: Mat2, p: Pt): Pt {
  const [a, b, c, d] = m;
  return [a * p[0] + b * p[1], c * p[0] + d * p[1]];
}

/** 행렬식 ad − bc. */
export function determinant(m: Mat2): number {
  const [a, b, c, d] = m;
  return a * d - b * c;
}

/** 수 표기 — 정수는 정수, 0.5 의 배수는 소수 한 자리. 빼기는 U+2212. */
export function formatNum(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`determinantZeroCollapse: 적을 수 없는 수 ${v}`);
  const n = Object.is(v, -0) ? 0 : v;
  let body: string;
  if (Number.isInteger(n)) body = String(Math.abs(n));
  else if (Number.isInteger(n * 2)) body = Math.abs(n).toFixed(1);
  else throw new Error(`determinantZeroCollapse: 0.5 의 배수가 아닌 수 ${v}`);
  return n < 0 ? `−${body}` : body;
}

/** 좌표 표기 "(x, y)". */
export function formatPt(p: Pt): string {
  return `(${formatNum(p[0])}, ${formatNum(p[1])})`;
}

function samePt(p: Pt, q: Pt): boolean {
  return p[0] === q[0] && p[1] === q[1];
}

export type CollapseSetup = {
  images: Pt[];
  spotOf: number[];
  spots: Pt[];
  totals: number[];
  sourceSpots: number;
  det: number;
  line: Pt;
  bounds: Bounds;
};

/** 바탕 셈 — 옮긴 자리 · 서로 다른 도착 자리 · 행렬식 · 직선 방향 · 범위. */
export function computeSetup(input: CollapseInput): CollapseSetup {
  const { matrix, points } = input;
  const det = determinant(matrix);
  if (det !== 0) {
    throw new Error(`determinantZeroCollapse: 행렬식이 0 이 아니다 (${det}) — 점이 포개지지 않는다`);
  }
  const [a, b, c, d] = matrix;
  let line: Pt;
  if (a !== 0 || c !== 0) line = [a, c];
  else if (b !== 0 || d !== 0) line = [b, d];
  else throw new Error('determinantZeroCollapse: 영행렬은 도착 자리가 직선이 아니라 점 하나다');

  const images = points.map((p) => apply(matrix, p));
  const spots: Pt[] = [];
  const totals: number[] = [];
  const spotOf = images.map((q) => {
    const k = spots.findIndex((s) => samePt(s, q));
    if (k >= 0) {
      totals[k] = (totals[k] as number) + 1;
      return k;
    }
    spots.push(q);
    totals.push(1);
    return spots.length - 1;
  });

  const distinctSources: Pt[] = [];
  for (const p of points) {
    if (!distinctSources.some((s) => samePt(s, p))) distinctSources.push(p);
  }

  const all: Pt[] = [[0, 0], ...points, ...images];
  const bounds: Bounds = {
    minX: Math.min(...all.map((p) => p[0])),
    maxX: Math.max(...all.map((p) => p[0])),
    minY: Math.min(...all.map((p) => p[1])),
    maxY: Math.max(...all.map((p) => p[1])),
  };

  return { images, spotOf, spots, totals, sourceSpots: distinctSources.length, det, line, bounds };
}

export async function determinantZeroCollapse(
  ctx: FacetContext<DeterminantZeroCollapseFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<DeterminantZeroCollapseFacetData>;
  const input = readCollapseInput(ctx.data);
  const { stepMs, points } = input;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const setup = computeSetup(input);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      images: setup.images.map((p) => [p[0], p[1]]),
      spotOf: [...setup.spotOf],
      spots: setup.spots.map((p) => [p[0], p[1]]),
      totals: [...setup.totals],
      sourceSpots: setup.sourceSpots,
      det: setup.det,
      line: [setup.line[0], setup.line[1]],
      bounds: { ...setup.bounds },
    },
  });

  // 걸음 0 에 이미 행렬과 점 여섯이 있다 — 읽을 틈을 준다
  if (!(await pause())) return;

  const counts = setup.spots.map(() => 0);
  for (let i = 0; i < points.length; i += 1) {
    if (ctx.cancelled) return;
    const spot = setup.spotOf[i];
    if (spot === undefined) throw new Error(`determinantZeroCollapse: 점 ${i} 의 도착 자리가 없다`);
    const count = (counts[spot] as number) + 1;
    counts[spot] = count;
    await ctx.emit({ type: 'move', payload: { i, spot, count } });
    if (!(await pause())) return;
  }

  await ctx.emit({
    type: 'done',
    payload: { points: points.length, spots: setup.spots.length, det: setup.det },
  });
  await pause();
}
