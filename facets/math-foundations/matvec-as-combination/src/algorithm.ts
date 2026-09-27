/**
 * matvec-as-combination — 행렬 곱하기 벡터는 열들의 가중합이다.
 *
 * 벡터 v 의 수 v_j 를 행렬 A 의 열 j 에 무게로 걸어(스칼라배) 열 1 → 2 → … 차례로
 * 합에 더한다. 합은 (0, 0) 에서 출발하고, 열을 다 더한 합이 곧 A v 다.
 *
 * 발신 이벤트
 *   init   (silent) { lo: number; hi: number; sum: [number, number] }
 *          lo · hi — 그림에 들어갈 모든 값(열 · 무게 건 열 · 합의 자취)과 0 의 최소 · 최대.
 *          sum — 합의 출발점 (0 벡터).
 *   weigh  { col: number; weight: number; effect: 'stretch' | 'flip' | 'shrink';
 *            column: [number, number]; scaled: [number, number];
 *            before: [number, number]; after: [number, number] }
 *          col 은 0 부터. scaled = weight · column, after = before + scaled.
 *   result { av: [number, number]; count: number }
 *          av — 열을 다 더한 합 = A v. count — 더한 열의 수.
 *
 * 걸음: 0 처음(A · v · 합) → 열마다 weigh 하나 → result. silent 는 init 뿐이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = [number, number];

export type MatvecAsCombinationFacetData = {
  type: 'matvec-as-combination';
  /** 행 차례로 적은 행렬. 줄 둘, 줄마다 칸 수가 같다. */
  matrix: number[][];
  /** 무게. 수의 개수가 행렬의 열 수와 같다. */
  vector: number[];
  stepMs: number;
};

export type WeightEffect = 'stretch' | 'flip' | 'shrink';

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** initialData 좁히개. 알고리즘 · 장면 · 무대가 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowMatvecData(raw: unknown): MatvecAsCombinationFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('matvec-as-combination: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'matvec-as-combination') {
    throw new Error(`matvec-as-combination: initialData.type 이 어긋났다 (${String(r.type)})`);
  }
  if (!isFiniteNumber(r.stepMs) || r.stepMs < 0) {
    throw new Error('matvec-as-combination: initialData.stepMs 가 0 이상의 수가 아니다');
  }
  if (!Array.isArray(r.matrix) || r.matrix.length !== 2) {
    throw new Error('matvec-as-combination: initialData.matrix 는 줄 둘이어야 한다');
  }
  const rows: number[][] = [];
  r.matrix.forEach((row: unknown, i: number) => {
    if (!Array.isArray(row) || row.length === 0) {
      throw new Error(`matvec-as-combination: initialData.matrix[${i}] 가 비었거나 배열이 아니다`);
    }
    row.forEach((cell: unknown, j: number) => {
      if (!isFiniteNumber(cell)) {
        throw new Error(`matvec-as-combination: initialData.matrix[${i}][${j}] 가 수가 아니다`);
      }
    });
    rows.push([...(row as number[])]);
  });
  const n = rows[0]!.length;
  if (rows[1]!.length !== n) {
    throw new Error('matvec-as-combination: initialData.matrix 의 두 줄의 칸 수가 다르다');
  }
  if (!Array.isArray(r.vector) || r.vector.length !== n) {
    throw new Error(
      `matvec-as-combination: initialData.vector 의 수 개수가 열 수(${n})와 다르다`,
    );
  }
  r.vector.forEach((w: unknown, j: number) => {
    if (!isFiniteNumber(w)) {
      throw new Error(`matvec-as-combination: initialData.vector[${j}] 가 수가 아니다`);
    }
  });
  return {
    type: 'matvec-as-combination',
    matrix: rows,
    vector: [...(r.vector as number[])],
    stepMs: r.stepMs,
  };
}

/** 행 차례로 적은 행렬에서 열 j 를 꺼낸다. */
export function columnOf(matrix: number[][], j: number): Vec2 {
  const a = matrix[0]?.[j];
  const b = matrix[1]?.[j];
  if (a === undefined || b === undefined) {
    throw new Error(`matvec-as-combination: 열 ${j + 1} 이 행렬에 없다`);
  }
  return [a, b];
}

/** 무게가 열에 하는 일. 이 조각이 말하는 셋 밖의 무게는 던진다 — 문안이 없다. */
export function effectOf(weight: number): WeightEffect {
  if (weight > 1) return 'stretch';
  if (weight > 0 && weight < 1) return 'shrink';
  if (weight === -1) return 'flip';
  throw new Error(
    `matvec-as-combination: 무게 ${weight} 는 늘기 · 뒤집기 · 줄기 어느 것도 아니다`,
  );
}

/** 수 표기 — 정수는 정수로, 0.5 의 배수는 소수 한 자리. 빼기는 U+2212. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`matvec-as-combination: 수가 아니다 (${n})`);
  const v = Object.is(n, -0) ? 0 : n;
  let s: string;
  if (Number.isInteger(v)) s = String(v);
  else if (Number.isInteger(v * 2)) s = v.toFixed(1);
  else throw new Error(`matvec-as-combination: 표기 규약 밖의 수 (${n})`);
  return s.replace('-', '−');
}

/** 벡터 표기 (x, y). */
export function formatVec(v: Vec2): string {
  return '(' + formatNumber(v[0]) + ', ' + formatNumber(v[1]) + ')';
}

export async function matvecAsCombination(
  ctx: FacetContext<MatvecAsCombinationFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<MatvecAsCombinationFacetData>;
  const data = narrowMatvecData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const n = data.vector.length;

  // 합의 자취를 먼저 셈해 그림의 범위를 정한다 (걸음의 값과 같은 셈을 한 번만 한다).
  type Move = {
    col: number;
    weight: number;
    effect: WeightEffect;
    column: Vec2;
    scaled: Vec2;
    before: Vec2;
    after: Vec2;
  };
  const moves: Move[] = [];
  let sum: Vec2 = [0, 0];
  const start: Vec2 = [sum[0], sum[1]];
  for (let j = 0; j < n; j += 1) {
    if (rctx.cancelled) return;
    const weight = data.vector[j]!;
    const column = columnOf(data.matrix, j);
    const scaled: Vec2 = [weight * column[0], weight * column[1]];
    const after: Vec2 = [sum[0] + scaled[0], sum[1] + scaled[1]];
    moves.push({ col: j, weight, effect: effectOf(weight), column, scaled, before: sum, after });
    sum = after;
  }
  const values: number[] = [0];
  for (const m of moves) {
    if (rctx.cancelled) return;
    values.push(...m.column, ...m.scaled, ...m.after);
  }
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  await rctx.emit({ type: 'init', silent: true, payload: { lo, hi, sum: start } });

  for (const m of moves) {
    // 걸음 0 에 이미 읽을 것(A · v · 합)이 있어 첫 무게 앞에도 stepMs 를 둔다.
    if (!(await pause())) return;
    await rctx.emit({
      type: 'weigh',
      payload: {
        col: m.col,
        weight: m.weight,
        effect: m.effect,
        column: m.column,
        scaled: m.scaled,
        before: m.before,
        after: m.after,
      },
    });
  }

  if (!(await pause())) return;
  await rctx.emit({ type: 'result', payload: { av: sum, count: moves.length } });
}
