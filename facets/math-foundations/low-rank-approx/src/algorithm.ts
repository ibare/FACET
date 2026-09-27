/**
 * 저랭크 근사 — 수의 표 A 를 특이값 순서의 겹 σᵢuᵢvᵢᵀ 로 가른 뒤, 가장 작은 겹부터 한 겹씩 버린다.
 *
 * SVD 는 여기서 셈한다: AAᵀ 를 순환 야코비로 고유분해(대각 밖 제곱합 < 1e−24 에서 멈춤) →
 * 고유값 큰 것부터, σᵢ = √λᵢ, uᵢ = 그 고유벡터(길이 1). 겹 i = uᵢ(uᵢᵀA) = σᵢuᵢvᵢᵀ.
 * A_k = 앞 k 겹의 합 = U_k U_kᵀ A — u 의 부호와 무관하다.
 *
 * 이벤트 (발신 차례대로)
 *
 * - `init` (silent) — 걸음 0 의 바탕. 겹을 모두 더한 표가 원래 표와 1e−9 안에서 같은지 확인한 뒤 보낸다
 *   payload: {
 *     layers: number[][][]   // 겹 여섯, σ 큰 것부터. layers[i][r][c]
 *     sigmas: number[]       // σ 큰 것부터
 *     scale: number          // 모든 걸음의 표와 모든 겹을 통틀어 가장 큰 |칸 값| — 칸을 칠하는 잣대
 *     table: number[][]      // 겹을 모두 더한 표 = 원래 표 (정수 그대로)
 *     errorPct: number       // 0
 *     same: number           // 반올림해 원래와 같은 칸 수
 *     changed: boolean[][]   // 반올림해 원래와 다른 칸
 *   }
 *
 * - `drop` — 남은 겹 가운데 가장 작은 것을 버렸다 (걸음 하나)
 *   payload: {
 *     index: number          // 버린 겹의 자리 (0 부터, σ 큰 것부터 센 차례)
 *     sigma: number          // 버린 겹의 σ
 *     kept: number           // 남은 겹 수
 *     table: number[][]      // A_kept
 *     errorPct: number       // ‖A − A_k‖ / ‖A‖ × 100 (프로베니우스)
 *     same: number
 *     changed: boolean[][]
 *   }
 *
 * 겹 하나(A_1)에서 멈춘다 — 겹을 모두 버리지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LowRankApproxFacetData = {
  type: 'low-rank-approx';
  /** 수의 표 A. 행 차례, 0..9 의 정수 */
  table: number[][];
  stepMs: number;
};

/** 같음 판정의 허용 오차 */
export const EPS = 1e-9;

/** 값이 수의 행렬(직사각형)인지 보고 베낀다. 어긋나면 필드 경로를 담아 던진다. */
export function asMatrix(v: unknown, path: string): number[][] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${path}: 비지 않은 배열이어야 한다`);
  let width = -1;
  return v.map((row: unknown, r) => {
    if (!Array.isArray(row) || row.length === 0) throw new Error(`${path}[${r}]: 비지 않은 배열이어야 한다`);
    if (width === -1) width = row.length;
    if (row.length !== width) throw new Error(`${path}[${r}]: 열 수가 ${width} 가 아니다`);
    return row.map((x: unknown, c) => {
      if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${path}[${r}][${c}]: 유한한 수가 아니다`);
      return x;
    });
  });
}

/** 값이 참거짓 행렬인지 보고 베낀다. */
export function asFlags(v: unknown, path: string): boolean[][] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${path}: 비지 않은 배열이어야 한다`);
  return v.map((row: unknown, r) => {
    if (!Array.isArray(row)) throw new Error(`${path}[${r}]: 배열이어야 한다`);
    return row.map((x: unknown, c) => {
      if (typeof x !== 'boolean') throw new Error(`${path}[${r}][${c}]: 참거짓이 아니다`);
      return x;
    });
  });
}

/** ctx.data · initialData 의 좁히개. 장면의 initial 도 이것을 부른다. */
export function narrowLowRankApproxData(data: unknown): LowRankApproxFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('low-rank-approx: 자료가 객체가 아니다');
  const d = data as Record<string, unknown>;
  if (d.type !== 'low-rank-approx') throw new Error(`low-rank-approx: type 이 'low-rank-approx' 가 아니다`);
  const table = asMatrix(d.table, 'table');
  table.forEach((row, r) =>
    row.forEach((x, c) => {
      if (!Number.isInteger(x) || x < 0 || x > 9) throw new Error(`table[${r}][${c}]: 0..9 의 정수가 아니다 (${x})`);
    }),
  );
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('stepMs: 양수여야 한다');
  return { type: 'low-rank-approx', table, stepMs: d.stepMs };
}

function cell(m: number[][], r: number, c: number): number {
  const row = m[r];
  if (row === undefined) throw new Error(`행 ${r} 이 없다`);
  const x = row[c];
  if (x === undefined) throw new Error(`칸 [${r}][${c}] 이 없다`);
  return x;
}

function at(list: number[], i: number): number {
  const x = list[i];
  if (x === undefined) throw new Error(`자리 ${i} 가 없다`);
  return x;
}

/** 대칭 행렬의 순환 야코비 고유분해. 고유값 큰 것부터, 고유벡터는 길이 1. */
function jacobiEigen(sym: number[][]): { values: number[]; vectors: number[][] } {
  const n = sym.length;
  const m = sym.map((row) => [...row]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j): number => (i === j ? 1 : 0)));
  const offSum = (): number => {
    let s = 0;
    for (let p = 0; p < n; p += 1) {
      for (let q = 0; q < n; q += 1) if (p !== q) s += cell(m, p, q) ** 2;
    }
    return s;
  };
  let sweeps = 0;
  while (offSum() >= 1e-24) {
    sweeps += 1;
    if (sweeps > 100) throw new Error('야코비가 100 바퀴 안에 모이지 않았다');
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = cell(m, p, q);
        if (apq === 0) continue;
        const theta = (cell(m, q, q) - cell(m, p, p)) / (2 * apq);
        const tan = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const cos = 1 / Math.sqrt(tan * tan + 1);
        const sin = tan * cos;
        for (let k = 0; k < n; k += 1) {
          const mk = m[k];
          if (mk === undefined) throw new Error(`행 ${k} 이 없다`);
          const kp = cell(m, k, p);
          const kq = cell(m, k, q);
          mk[p] = cos * kp - sin * kq;
          mk[q] = sin * kp + cos * kq;
        }
        const mp = m[p];
        const mq = m[q];
        if (mp === undefined || mq === undefined) throw new Error(`행 ${p} · ${q} 이 없다`);
        for (let k = 0; k < n; k += 1) {
          const pk = cell(m, p, k);
          const qk = cell(m, q, k);
          mp[k] = cos * pk - sin * qk;
          mq[k] = sin * pk + cos * qk;
        }
        for (let k = 0; k < n; k += 1) {
          const vk = v[k];
          if (vk === undefined) throw new Error(`행 ${k} 이 없다`);
          const kp = cell(v, k, p);
          const kq = cell(v, k, q);
          vk[p] = cos * kp - sin * kq;
          vk[q] = sin * kp + cos * kq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => cell(m, b, b) - cell(m, a, a));
  return {
    values: order.map((i) => cell(m, i, i)),
    vectors: order.map((i) => Array.from({ length: n }, (_, r) => cell(v, r, i))),
  };
}

export type LowRankSvd = {
  sigmas: number[];
  layers: number[][][];
  /** tables[k] = A_k (k = 0 은 빈 합이라 쓰지 않는다 — 1..겹 수) */
  tables: number[][][];
  norm: number;
};

/** 표를 겹으로 가른다. 다른 셈과 맞지 않으면 던진다. */
export function decompose(a: number[][]): LowRankSvd {
  const rows = a.length;
  const first = a[0];
  if (first === undefined) throw new Error('표가 비었다');
  const cols = first.length;
  const aat = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: rows }, (_, j) => {
      let s = 0;
      for (let c = 0; c < cols; c += 1) s += cell(a, i, c) * cell(a, j, c);
      return s;
    }),
  );
  const { values, vectors } = jacobiEigen(aat);
  const count = Math.min(rows, cols);
  const sigmas: number[] = [];
  const layers: number[][][] = [];
  for (let i = 0; i < count; i += 1) {
    const lambda = values[i];
    const u = vectors[i];
    if (lambda === undefined || u === undefined) throw new Error(`고유값 ${i} 이 없다`);
    if (!(lambda > EPS)) throw new Error(`고유값 ${i} 가 0 이하다 (${lambda}) — 겹이 모자란다`);
    const sigma = Math.sqrt(lambda);
    const w = Array.from({ length: cols }, (_, c) => {
      let s = 0;
      for (let r = 0; r < rows; r += 1) s += cell(vectors, i, r) * cell(a, r, c);
      return s;
    });
    const wNorm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
    if (Math.abs(wNorm - sigma) > EPS) throw new Error(`겹 ${i}: ‖uᵀA‖ 가 σ 와 다르다`);
    sigmas.push(sigma);
    layers.push(u.map((ur) => w.map((wc) => ur * wc)));
  }
  for (let i = 1; i < count; i += 1) {
    if (at(sigmas, i) >= at(sigmas, i - 1)) throw new Error(`σ 가 큰 것부터가 아니다 (자리 ${i})`);
  }
  const tables: number[][][] = [];
  let acc = a.map((row) => row.map(() => 0));
  for (let k = 0; k < count; k += 1) {
    const layer = layers[k];
    if (layer === undefined) throw new Error(`겹 ${k} 이 없다`);
    acc = acc.map((row, r) => row.map((x, c) => x + cell(layer, r, c)));
    tables[k + 1] = acc;
  }
  const norm = Math.sqrt(a.reduce((s, row) => s + row.reduce((t, x) => t + x * x, 0), 0));
  return { sigmas, layers, tables, norm };
}

function frobDiff(a: number[][], b: number[][]): number {
  let s = 0;
  a.forEach((row, r) => row.forEach((x, c) => (s += (x - cell(b, r, c)) ** 2)));
  return Math.sqrt(s);
}

/** 반올림해 원래와 다른 칸. x.5 로 떨어지는 칸이 있으면 던진다. */
function roundCheck(original: number[][], table: number[][]): { same: number; changed: boolean[][] } {
  let same = 0;
  const changed = table.map((row, r) =>
    row.map((x, c) => {
      if (Math.abs(x - Math.floor(x) - 0.5) < EPS) throw new Error(`칸 [${r}][${c}] 이 x.5 에 떨어진다 (${x})`);
      const ok = Math.round(x) === cell(original, r, c);
      if (ok) same += 1;
      return !ok;
    }),
  );
  return { same, changed };
}

export async function lowRankApprox(ctx: FacetContext<LowRankApproxFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LowRankApproxFacetData>;
  const data = narrowLowRankApproxData(rctx.data);
  const stepMs = data.stepMs;
  const original = data.table;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const { sigmas, layers, tables, norm } = decompose(original);
  const count = sigmas.length;
  const full = tables[count];
  if (full === undefined) throw new Error('겹을 모두 더한 표가 없다');
  if (frobDiff(full, original) > EPS) throw new Error('겹을 모두 더해도 원래 표가 되지 않는다');

  let scale = 0;
  for (const m of [...tables.slice(1), ...layers]) {
    for (const row of m) for (const x of row) scale = Math.max(scale, Math.abs(x));
  }

  const start = roundCheck(original, original);
  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      layers,
      sigmas,
      scale,
      table: original.map((row) => [...row]),
      errorPct: 0,
      same: start.same,
      changed: start.changed,
    },
  });

  for (let kept = count - 1; kept >= 1; kept -= 1) {
    if (!(await pause())) return;
    const table = tables[kept];
    if (table === undefined) throw new Error(`A_${kept} 가 없다`);
    const droppedSq = sigmas.slice(kept).reduce((s, x) => s + x * x, 0);
    const err = frobDiff(original, table);
    if (Math.abs(err - Math.sqrt(droppedSq)) > EPS) throw new Error(`A_${kept}: 오차가 버린 σ 의 제곱합과 다르다`);
    const { same, changed } = roundCheck(original, table);
    await rctx.emit({
      type: 'drop',
      payload: {
        index: kept,
        sigma: at(sigmas, kept),
        kept,
        table,
        errorPct: (err / norm) * 100,
        same,
        changed,
      },
    });
  }
}
