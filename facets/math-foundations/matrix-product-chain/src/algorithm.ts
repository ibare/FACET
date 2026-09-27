/**
 * matrix-product-chain — 행렬 곱 = 변환의 합성.
 *
 * 점 셋이 먼저 H 로, 이어 S 로 두 번 뛴다. 곱 SH 로 처음 자리에서 한 번에 뛰면
 * 셋 모두 두 번 간 자리에 닿는다. 차례를 바꾼 곱 HS 로 뛰면 다른 곳에 닿는다.
 *
 * 규약: 행렬은 행 차례 `[a b ; c d]` → cells `[a, b, c, d]`. 점은 열 벡터이고 행렬은
 * 왼쪽에서 곱한다. "first 먼저, second 다음" 은 second · first 이고 점에는
 * second (first p) = (second first) p 로 걸린다. 같음은 정확한 같음(`===`)이다.
 *
 * 이벤트 (발신 차례대로)
 *   init      silent  { start: Pt[], bounds: { xMin, xMax, yMin, yMax } }
 *                     걸음 0 의 바탕. bounds 는 이 조각에 나오는 모든 자리
 *                     (처음 · 두 번 뛴 길 · 두 곱의 도착)의 좌표 범위
 *   hop               { by: 'first' | 'second', from: Pt[], to: Pt[] }
 *                     한 변환으로 점 셋이 함께 뛴다. to[i] = M from[i]
 *   compose           { order: 'kept', name: string, cells: Cells }
 *                     곱 second · first 를 셈했다 (name 은 두 기호를 곱의 차례로 이은 것)
 *   leap              { order: 'kept', from: Pt[], to: Pt[], same: number, total: number }
 *                     곱 second · first 로 처음 자리에서 한 번에 뛴다.
 *                     same = 두 번 뛴 자리와 정확히 같은 점의 수
 *   swapLeap          { order: 'swapped', name: string, cells: Cells,
 *                       from: Pt[], to: Pt[], same: number, total: number }
 *                     차례를 바꾼 곱 first · second 를 셈하고 그것으로 한 번에 뛴다
 *
 *   Pt = { x: number, y: number } · Cells = [a, b, c, d]
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = { readonly x: number; readonly y: number };
export type Cells = readonly [number, number, number, number];
export type MatrixSpec = { readonly symbol: string; readonly cells: Cells };
export type Bounds = {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
};

export type MatrixProductChainFacetData = {
  type: 'matrix-product-chain';
  stepMs: number;
  /** 먼저 거는 변환 */
  first: MatrixSpec;
  /** 다음에 거는 변환 */
  second: MatrixSpec;
  /** 뛰는 점들 — [x, y] */
  points: readonly (readonly [number, number])[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`matrix-product-chain: ${path} 는 유한한 수여야 한다`);
  }
  return v;
}

/** 행 차례 칸 넷을 좁힌다. */
export function readCells(v: unknown, path: string): Cells {
  if (!Array.isArray(v) || v.length !== 4) {
    throw new Error(`matrix-product-chain: ${path} 는 칸 넷(2×2 행 차례)이어야 한다`);
  }
  return [
    readNumber(v[0], `${path}[0]`),
    readNumber(v[1], `${path}[1]`),
    readNumber(v[2], `${path}[2]`),
    readNumber(v[3], `${path}[3]`),
  ];
}

function readMatrix(v: unknown, path: string): MatrixSpec {
  if (!isRecord(v)) throw new Error(`matrix-product-chain: ${path} 는 객체여야 한다`);
  const symbol = v['symbol'];
  if (typeof symbol !== 'string' || symbol.length === 0) {
    throw new Error(`matrix-product-chain: ${path}.symbol 은 빈 글자가 아니어야 한다`);
  }
  return { symbol, cells: readCells(v['cells'], `${path}.cells`) };
}

/** 점 목록을 좁힌다 — `{ x, y }` 꼴. */
export function readPts(v: unknown, path: string): Pt[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`matrix-product-chain: ${path} 는 비지 않은 점 목록이어야 한다`);
  }
  return v.map((p, i) => {
    if (!isRecord(p)) throw new Error(`matrix-product-chain: ${path}[${i}] 는 점이어야 한다`);
    return { x: readNumber(p['x'], `${path}[${i}].x`), y: readNumber(p['y'], `${path}[${i}].y`) };
  });
}

/** `ctx.data` · `initialData` 좁히개. 장면의 `initial` 도 이것을 부른다. */
export function narrowData(raw: unknown): MatrixProductChainFacetData {
  if (!isRecord(raw)) throw new Error('matrix-product-chain: initialData 는 객체여야 한다');
  if (raw['type'] !== 'matrix-product-chain') {
    throw new Error('matrix-product-chain: initialData.type 이 matrix-product-chain 이 아니다');
  }
  const stepMs = readNumber(raw['stepMs'], 'initialData.stepMs');
  const first = readMatrix(raw['first'], 'initialData.first');
  const second = readMatrix(raw['second'], 'initialData.second');
  const rawPoints = raw['points'];
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
    throw new Error('matrix-product-chain: initialData.points 는 비지 않은 목록이어야 한다');
  }
  const points = rawPoints.map((p, i): readonly [number, number] => {
    if (!Array.isArray(p) || p.length !== 2) {
      throw new Error(`matrix-product-chain: initialData.points[${i}] 는 [x, y] 여야 한다`);
    }
    return [readNumber(p[0], `initialData.points[${i}][0]`), readNumber(p[1], `initialData.points[${i}][1]`)];
  });
  return { type: 'matrix-product-chain', stepMs, first, second, points };
}

/** 행렬 곱 A B — 칸마다 A 의 행과 B 의 열을 맞물린다. */
export function multiply(a: Cells, b: Cells): Cells {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

/** 점 p 가 가는 자리 = M p. */
export function apply(m: Cells, p: Pt): Pt {
  return { x: m[0] * p.x + m[1] * p.y, y: m[2] * p.x + m[3] * p.y };
}

/** 두 점 목록에서 자리가 정확히 같은 점의 수. */
function countSame(a: readonly Pt[], b: readonly Pt[]): number {
  if (a.length !== b.length) throw new Error('matrix-product-chain: 견줄 점 목록의 길이가 다르다');
  let same = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].x === b[i].x && a[i].y === b[i].y) same += 1;
  }
  return same;
}

function boundsOf(groups: readonly (readonly Pt[])[]): Bounds {
  const all = groups.flat();
  return {
    xMin: Math.min(...all.map((p) => p.x)),
    xMax: Math.max(...all.map((p) => p.x)),
    yMin: Math.min(...all.map((p) => p.y)),
    yMax: Math.max(...all.map((p) => p.y)),
  };
}

/** 수 표기 — 정수는 정수로, 0.5 의 배수는 소수 한 자리, 빼기는 U+2212. */
export function formatNumber(n: number): string {
  if (n === 0) return '0';
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (Number.isInteger(abs)) return sign + String(abs);
  if (Number.isInteger(abs * 2)) return sign + abs.toFixed(1);
  throw new Error(`matrix-product-chain: 표기할 수 없는 수 ${n}`);
}

/** 좌표 표기 `(x, y)`. */
export function formatPoint(p: Pt): string {
  return '(' + formatNumber(p.x) + ', ' + formatNumber(p.y) + ')';
}

/** 점 목록 표기 — `(x, y) · (x, y) · …`. */
export function formatPoints(pts: readonly Pt[]): string {
  return pts.map(formatPoint).join(' · ');
}

export async function matrixProductChain(
  ctx: FacetContext<MatrixProductChainFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<MatrixProductChainFacetData>;
  const data = narrowData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const start: Pt[] = data.points.map(([x, y]) => ({ x, y }));
  const afterFirst = start.map((p) => apply(data.first.cells, p));
  const afterSecond = afterFirst.map((p) => apply(data.second.cells, p));

  // 곱의 차례: 오른쪽에 쓴 것이 먼저 걸린다
  const kept = multiply(data.second.cells, data.first.cells);
  const swapped = multiply(data.first.cells, data.second.cells);
  const keptLanding = start.map((p) => apply(kept, p));
  const swappedLanding = start.map((p) => apply(swapped, p));

  const keptSame = countSame(keptLanding, afterSecond);
  if (keptSame !== start.length) {
    throw new Error('matrix-product-chain: 곱으로 한 번에 뛴 자리가 두 번 뛴 자리와 다르다');
  }
  const swappedSame = countSame(swappedLanding, afterSecond);

  const bounds = boundsOf([start, afterFirst, afterSecond, keptLanding, swappedLanding]);

  await rctx.emit({ type: 'init', silent: true, payload: { start, bounds } });

  if (!(await pause())) return;
  await rctx.emit({ type: 'hop', payload: { by: 'first', from: start, to: afterFirst } });

  if (!(await pause())) return;
  await rctx.emit({ type: 'hop', payload: { by: 'second', from: afterFirst, to: afterSecond } });

  if (!(await pause())) return;
  await rctx.emit({
    type: 'compose',
    payload: { order: 'kept', name: data.second.symbol + data.first.symbol, cells: kept },
  });

  if (!(await pause())) return;
  await rctx.emit({
    type: 'leap',
    payload: { order: 'kept', from: start, to: keptLanding, same: keptSame, total: start.length },
  });

  if (!(await pause())) return;
  await rctx.emit({
    type: 'swapLeap',
    payload: {
      order: 'swapped',
      name: data.first.symbol + data.second.symbol,
      cells: swapped,
      from: start,
      to: swappedLanding,
      same: swappedSame,
      total: start.length,
    },
  });
}
