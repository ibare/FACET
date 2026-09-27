/**
 * 행렬의 열과 기저 — 규칙만 알 때 그 행렬을 적는다.
 *
 * 알고리즘은 규칙을 **행렬 없이** 점 하나를 옮기는 함수로 갖는다(`applyRule`).
 * 행렬은 그 함수를 표준 기저 (1, 0) · (0, 1) 에만 걸어 얻은 두 자리를 열로 세워 만든다.
 * 다 채운 행렬 M 으로 시험 점 p 를 옮긴 자리 M p 가 규칙으로 옮긴 자리와 정확히 같은지 본다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   - `rule-apply`   { basis: number; from: [number, number]; to: [number, number] }
 *                    규칙이 기저 `basis` 번(0 부터)을 옮겼다. from = 그 기저, to = 규칙이 옮긴 자리
 *   - `column-fill`  { col: number; value: [number, number] }
 *                    행렬의 `col` 열(0 부터)에 value 가 내려앉았다 (value = 위 칸, 아래 칸)
 *   - `test-rule`    { from: [number, number]; to: [number, number] }
 *                    시험 점을 규칙으로 옮겼다
 *   - `test-matrix`  { from: [number, number]; to: [number, number]; same: boolean }
 *                    시험 점을 다 채운 행렬로 옮겼다. same = 규칙으로 옮긴 자리와 두 좌표가 정확히 같은가
 *                    (다르면 알고리즘이 던지므로 실제로는 늘 true)
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData(규칙 · 시험 점)로 세운다 — 행렬 네 칸은 비어 있다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];

/** 이 조각이 아는 규칙 식별자. 표시 이름은 messages 가 가진다. */
export type RuleId = 'rotate-quarter-ccw';

export type MatrixColumnsAreBasisFacetData = {
  type: 'matrix-columns-are-basis';
  rule: RuleId;
  test: Vec2;
  stepMs: number;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 두 수짜리 배열을 좁힌다. 어긋나면 필드 경로를 담아 던진다. */
export function readVec2(raw: unknown, path: string): Vec2 {
  if (!Array.isArray(raw) || raw.length !== 2) {
    throw new Error(`${path}: 수 두 개짜리 배열이어야 한다`);
  }
  const [x, y] = raw as unknown[];
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
    throw new Error(`${path}: 두 칸 모두 유한한 수여야 한다`);
  }
  return [x, y];
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. */
export function readColumnsData(raw: unknown): MatrixColumnsAreBasisFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('initialData: 객체가 아니다');
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== 'matrix-columns-are-basis') {
    throw new Error(`initialData.type: 'matrix-columns-are-basis' 가 아니다 (${String(o.type)})`);
  }
  if (o.rule !== 'rotate-quarter-ccw') {
    throw new Error(`initialData.rule: 모르는 규칙이다 (${String(o.rule)})`);
  }
  if (!isFiniteNumber(o.stepMs) || o.stepMs <= 0) {
    throw new Error('initialData.stepMs: 양수여야 한다');
  }
  return {
    type: 'matrix-columns-are-basis',
    rule: o.rule,
    test: readVec2(o.test, 'initialData.test'),
    stepMs: o.stepMs,
  };
}

/** -0 을 0 으로. 좌표 글자가 −0 으로 갈리지 않게 한다. */
function unsign(n: number): number {
  return n === 0 ? 0 : n;
}

/**
 * 규칙 — 행렬 없이 점 하나를 옮긴다.
 * rotate-quarter-ccw: (x, y) → (−y, x)
 */
export function applyRule(rule: RuleId, p: Vec2): Vec2 {
  switch (rule) {
    case 'rotate-quarter-ccw':
      return [unsign(-p[1]), unsign(p[0])];
    default: {
      const never: never = rule;
      throw new Error(`applyRule: 모르는 규칙이다 (${String(never)})`);
    }
  }
}

/** n 차원 표준 기저 — i 번째는 i 칸만 1 이다. */
export function standardBasis(n: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const e: number[] = [];
    for (let j = 0; j < n; j += 1) e.push(j === i ? 1 : 0);
    out.push(e);
  }
  return out;
}

/** 행렬(행 차례)을 열 둘로 세운다. m[r][c] = cols[c][r] */
export function matrixFromColumns(cols: readonly Vec2[]): number[][] {
  if (cols.length !== 2) throw new Error(`matrixFromColumns: 열이 둘이어야 한다 (${cols.length})`);
  return [
    [cols[0]![0], cols[1]![0]],
    [cols[0]![1], cols[1]![1]],
  ];
}

/** M p — 행렬을 왼쪽에서 곱한다. */
export function matVec(m: readonly (readonly number[])[], p: Vec2): Vec2 {
  if (m.length !== 2 || m.some((row) => row.length !== 2)) {
    throw new Error('matVec: 2×2 행렬이어야 한다');
  }
  const [r0, r1] = m as [readonly number[], readonly number[]];
  return [unsign(r0[0]! * p[0] + r0[1]! * p[1]), unsign(r1[0]! * p[0] + r1[1]! * p[1])];
}

export function sameVec(a: Vec2, b: Vec2): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** 수 하나를 화면 글자로 — 정수는 정수, 그 밖은 소수 한 자리. 빼기는 U+2212. */
export function formatNum(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`formatNum: 유한하지 않은 수 (${n})`);
  const body = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
  return n < 0 ? `−${body}` : body;
}

/** 점을 `(x, y)` 로. */
export function formatPoint(p: Vec2): string {
  return `(${formatNum(p[0])}, ${formatNum(p[1])})`;
}

export async function matrixColumnsAreBasis(
  context: FacetContext<MatrixColumnsAreBasisFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<MatrixColumnsAreBasisFacetData>;
  const data = readColumnsData(ctx.data);
  const { rule, test, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 (규칙 · 빈 행렬) 을 읽을 틈
  if (!(await pause())) return;

  const columns: Vec2[] = [];
  const basis = standardBasis(2);
  for (let i = 0; i < basis.length; i += 1) {
    if (ctx.cancelled) return;
    const e = readVec2(basis[i], `basis[${i}]`);
    const image = applyRule(rule, e);
    await ctx.emit({ type: 'rule-apply', payload: { basis: i, from: [e[0], e[1]], to: [image[0], image[1]] } });
    if (!(await pause())) return;

    columns.push(image);
    await ctx.emit({ type: 'column-fill', payload: { col: i, value: [image[0], image[1]] } });
    if (!(await pause())) return;
  }

  const m = matrixFromColumns(columns);

  const byRule = applyRule(rule, test);
  await ctx.emit({ type: 'test-rule', payload: { from: [test[0], test[1]], to: [byRule[0], byRule[1]] } });
  if (!(await pause())) return;

  const byMatrix = matVec(m, test);
  const same = sameVec(byRule, byMatrix);
  if (!same) {
    throw new Error(
      `행렬로 옮긴 자리 ${formatPoint(byMatrix)} 가 규칙으로 옮긴 자리 ${formatPoint(byRule)} 와 다르다`,
    );
  }
  await ctx.emit({
    type: 'test-matrix',
    payload: { from: [test[0], test[1]], to: [byMatrix[0], byMatrix[1]], same },
  });
}
