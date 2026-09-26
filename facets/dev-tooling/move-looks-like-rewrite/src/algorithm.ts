/**
 * move-looks-like-rewrite — 줄 몇 개를 옮기기만 한 두 파일을 두 눈으로 본다.
 *
 * 사람의 눈은 데이터의 `moves`(사람이 한 옮김)를 그대로 읽는다. 줄의 눈은 걷는 diff 다 —
 * `L[i][j]` 는 A 의 i 줄부터 끝까지와 B 의 j 줄부터 끝까지의 최장 공통 부분 수열 길이이고,
 * 자리 (i, j) 에서 글자가 같으면 남김, 아니면 `L[i+1][j] >= L[i][j+1]` 일 때 지움(동률이면
 * 지움 먼저), 아니면 넣음. 줄 비교는 글자 그대로다 (앞 빈칸 포함).
 *
 * 걸음 0 은 장면의 `initial()` 이 데이터에서 세운다 (두 파일). 이미 읽을 것이 있는 화면이라
 * 첫 발신 앞에 `stepMs` 를 둔다.
 *
 * 이벤트 (모두 silent 아님, 한 발신이 한 걸음)
 * - `move`    { moves: { from: number; count: number; to: number }[] }
 *             사람의 눈. A 의 from 줄부터 count 줄 덩이가 B 의 to 자리로 한 번에 간다 (0 기반)
 * - `keep`    { pairs: [a: number, b: number][] }
 *             줄의 눈이 남긴 짝 (0 기반, A 차례)
 * - `cross`   { tries: { a: number; b: number; crosses: [a: number, b: number][] }[] }
 *             글자가 같은 짝이 건너편에 있는데 남기지 못한 줄. crosses 는 그 짝을 이으면
 *             엇갈리는 남김 짝들 (0 기반)
 * - `delete`  { lines: number[] }   A 쪽에서 지움으로 떨어진 줄 (0 기반)
 * - `insert`  { lines: number[] }   B 쪽에서 넣음으로 떨어진 줄 (0 기반)
 * - `compare` { moves: number; deletes: number; inserts: number }
 *             두 눈이 센 손질
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MoveOp = { from: number; count: number; to: number };

export type MoveLooksLikeRewriteFacetData = {
  type: 'move-looks-like-rewrite';
  stepMs: number;
  /** 옮기기 전 파일의 줄 */
  a: string[];
  /** 옮긴 뒤 파일의 줄 */
  b: string[];
  /** 사람이 한 옮김 (0 기반). A 의 from 줄부터 count 줄 덩이를 B 의 to 자리로 */
  moves: MoveOp[];
  /** diff 표식 — 번역하지 않는 자료 */
  marks: { keep: string; del: string; ins: string };
};

export type DiffOp =
  | { kind: 'keep'; a: number; b: number }
  | { kind: 'del'; a: number }
  | { kind: 'ins'; b: number };

/** 뒤에서부터 채운 최장 공통 부분 수열 표. `L[i][j]` = a[i:] 와 b[j:] 의 LCS 길이. */
export function lcsSuffix(a: readonly string[], b: readonly string[]): number[][] {
  const L: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) L.push(new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      L[i]![j] = a[i] === b[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
    }
  }
  return L;
}

/** 걷는 diff — 공통 규약 그대로. */
export function walkDiff(a: readonly string[], b: readonly string[]): DiffOp[] {
  const L = lcsSuffix(a, b);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push({ kind: 'keep', a: i, b: j });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && L[i + 1]![j]! >= L[i]![j + 1]!)) {
      ops.push({ kind: 'del', a: i });
      i += 1;
    } else {
      ops.push({ kind: 'ins', b: j });
      j += 1;
    }
  }
  const kept = ops.filter((o) => o.kind === 'keep').length;
  if (kept !== L[0]![0]) {
    throw new Error(`walkDiff: 남김 ${kept} 이 최장 공통 부분 수열 ${L[0]![0]} 과 다르다`);
  }
  return ops;
}

/** 사람의 옮김을 A 에 적용한 결과. 덩이가 파일 밖이면 던진다. */
export function applyMove(a: readonly string[], move: MoveOp): string[] {
  if (move.count < 1 || move.from < 0 || move.from + move.count > a.length) {
    throw new Error(`applyMove: 덩이 ${move.from}..${move.from + move.count - 1} 가 A(${a.length} 줄) 밖이다`);
  }
  const block = a.slice(move.from, move.from + move.count);
  const rest = [...a.slice(0, move.from), ...a.slice(move.from + move.count)];
  if (move.to < 0 || move.to > rest.length) {
    throw new Error(`applyMove: 옮길 자리 ${move.to} 가 남은 ${rest.length} 줄 밖이다`);
  }
  return [...rest.slice(0, move.to), ...block, ...rest.slice(move.to)];
}

type Pair = [number, number];

/** 지운 줄 i 와 글자가 같은 넣은 줄을 하나 고른다. 없거나 둘 이상이면 던진다. */
function partnerOf(a: readonly string[], b: readonly string[], i: number, inserted: readonly number[]): number {
  const found = inserted.filter((j) => b[j] === a[i]);
  if (found.length !== 1) {
    throw new Error(
      `partnerOf: 지운 줄 A${i + 1} 과 글자가 같은 넣은 줄이 ${found.length} 개다 — 이 조각은 짝이 하나인 옮김만 말한다`,
    );
  }
  return found[0]!;
}

export async function moveLooksLikeRewrite(
  context: FacetContext<MoveLooksLikeRewriteFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<MoveLooksLikeRewriteFacetData>;
  const { a, b, moves, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  if (moves.length !== 1) {
    throw new Error(`moveLooksLikeRewrite: 사람의 옮김이 ${moves.length} 개다 — 이 조각은 한 번 옮긴 것만 그린다`);
  }
  let moved: string[] = [...a];
  for (const m of moves) {
    if (ctx.cancelled) return;
    moved = applyMove(moved, m);
  }
  if (moved.length !== b.length || moved.some((line, k) => line !== b[k])) {
    throw new Error('moveLooksLikeRewrite: 사람의 옮김을 A 에 적용한 결과가 B 와 다르다');
  }

  const ops = walkDiff(a, b);
  const pairs: Pair[] = [];
  const deleted: number[] = [];
  const inserted: number[] = [];
  for (const op of ops) {
    if (ctx.cancelled) return;
    if (op.kind === 'keep') pairs.push([op.a, op.b]);
    else if (op.kind === 'del') deleted.push(op.a);
    else inserted.push(op.b);
  }

  const tries: { a: number; b: number; crosses: Pair[] }[] = [];
  for (const i of deleted) {
    if (ctx.cancelled) return;
    const j = partnerOf(a, b, i, inserted);
    const crosses = pairs.filter(([pi, pj]) => (pi - i) * (pj - j) < 0);
    if (crosses.length === 0) {
      throw new Error(`moveLooksLikeRewrite: A${i + 1}=B${j + 1} 는 어느 남김 짝과도 엇갈리지 않는데 남지 못했다`);
    }
    tries.push({ a: i, b: j, crosses });
  }

  // 걸음 0 은 두 파일이 이미 서 있다 — 읽을 틈을 준다
  if (!(await pause())) return;
  await ctx.emit({ type: 'move', payload: { moves: moves.map((m) => ({ ...m })) } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'keep', payload: { pairs } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'cross', payload: { tries } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'delete', payload: { lines: deleted } });
  if (!(await pause())) return;
  await ctx.emit({ type: 'insert', payload: { lines: inserted } });
  if (!(await pause())) return;
  await ctx.emit({
    type: 'compare',
    payload: { moves: moves.length, deletes: deleted.length, inserts: inserted.length },
  });
}
