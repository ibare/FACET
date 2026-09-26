/**
 * keep-the-common — 남길 것을 정하면 고칠 것이 정해진다.
 *
 * 두 파일 A(고치기 전) · B(고친 뒤) 를 앞에서부터 걷는 diff 로 견준다. 글자가 같은 줄이
 * 위에서부터 하나씩 짝으로 이어지고, 짝 하나마다 고칠 것(지움 + 넣음)이 둘씩 준다.
 * 짝이 다 이어진 뒤 짝 없는 A 줄은 지움으로, 짝 없는 B 줄은 넣음으로 떨어진다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (두 파일 · 고칠 것 = A 줄 수 + B 줄 수).
 *
 * 이벤트 (모두 silent 아님, 걸음 하나씩):
 *   - `pair`    { a: number; b: number; from: number; to: number }
 *                 A 의 a 번째 줄(0 기반)과 B 의 b 번째 줄이 짝으로 이어진다.
 *                 from · to = 이 짝 앞뒤의 고칠 것의 수
 *   - `delete`  { rows: number[] }
 *                 짝 없는 A 줄(0 기반)이 지움으로 떨어진다
 *   - `insert`  { rows: number[]; del: number; total: number }
 *                 짝 없는 B 줄(0 기반)이 넣음으로 떨어진다. del = 지움의 수, total = 고칠 것
 *
 * 줄 비교는 글자 그대로다 (앞 빈칸 포함). 바꿈은 없다.
 * 두 쪽에 다 있는 줄이 한쪽에 두 번 이상 나오면 짝 고르기가 열리므로 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KeepTheCommonFacetData = {
  type: 'keep-the-common';
  stepMs: number;
  /** A — 고치기 전 파일의 줄 */
  a: string[];
  /** B — 고친 뒤 파일의 줄 */
  b: string[];
  /** diff 표식 — 번역하지 않는 자료 */
  marks: { del: string; ins: string };
};

export type DiffOp =
  | { op: 'keep'; a: number; b: number }
  | { op: 'del'; a: number }
  | { op: 'ins'; b: number };

/** 고칠 것 = (A 줄 수 − 남김) + (B 줄 수 − 남김). 바꿈이 없으니 이것이 전부다. */
export function editCount(n: number, m: number, kept: number): number {
  return n - kept + (m - kept);
}

/** L[i][j] = a[i:] 와 b[j:] 의 최장 공통 부분 수열 길이 (뒤에서부터 채운다). */
function lcsSuffix(a: readonly string[], b: readonly string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i += 1) L.push(new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = L[i]!;
    const below = L[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? below[j + 1]! + 1 : Math.max(below[j]!, row[j + 1]!);
    }
  }
  return L;
}

/**
 * 앞에서부터 걷는 diff. 같으면 남김, 다르면 L[i+1][j] >= L[i][j+1] 일 때 지움 먼저, 아니면 넣음.
 * 한쪽이 끝나면 남은 쪽을 모두 지움 또는 넣음.
 */
export function walkDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
  for (const line of a.filter((x) => b.includes(x))) {
    const inA = a.filter((x) => x === line).length;
    const inB = b.filter((x) => x === line).length;
    if (inA !== 1 || inB !== 1) {
      throw new Error(
        `keep-the-common: 두 쪽에 다 있는 줄 ${JSON.stringify(line)} 이 A 에 ${inA} 번, B 에 ${inB} 번 나온다 — 짝 고르기가 열린다`,
      );
    }
  }
  const L = lcsSuffix(a, b);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ op: 'keep', a: i, b: j });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && L[i + 1]![j]! >= L[i]![j + 1]!)) {
      ops.push({ op: 'del', a: i });
      i += 1;
    } else {
      ops.push({ op: 'ins', b: j });
      j += 1;
    }
  }
  const kept = ops.filter((o) => o.op === 'keep').length;
  if (kept !== L[0]![0]!) {
    throw new Error(`keep-the-common: 남김 ${kept} 이 최장 공통 부분 수열 ${L[0]![0]!} 과 다르다`);
  }
  return ops;
}

export async function keepTheCommon(context: FacetContext<KeepTheCommonFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<KeepTheCommonFacetData>;
  const { a, b, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const ops = walkDiff(a, b);
  const n = a.length;
  const m = b.length;

  // 걸음 0 은 두 파일과 고칠 것 전부가 이미 보이는 화면이다 — 읽을 틈을 두고 첫 짝으로 간다.
  const pairs = ops.flatMap((o) => (o.op === 'keep' ? [o] : []));
  let kept = 0;
  for (const pair of pairs) {
    if (!(await pause())) return;
    const from = editCount(n, m, kept);
    kept += 1;
    await ctx.emit({
      type: 'pair',
      payload: { a: pair.a, b: pair.b, from, to: editCount(n, m, kept) },
    });
  }

  const dels = ops.flatMap((o) => (o.op === 'del' ? [o.a] : []));
  const ins = ops.flatMap((o) => (o.op === 'ins' ? [o.b] : []));

  if (!(await pause())) return;
  await ctx.emit({ type: 'delete', payload: { rows: dels } });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'insert',
    payload: { rows: ins, del: dels.length, total: dels.length + ins.length },
  });
}
