/**
 * edit-script — 두 파일의 차이를 손질 목록 하나로 적는다.
 *
 * 두 파일(A · B)을 읽는 자리가 위에서 아래로 내려가며 목록이 한 줄씩 자란다.
 * 차례는 걷는 diff 다 — 자리 (i, j) 에서 A[i] == B[j] 면 남김, 아니면
 * L[i+1][j] >= L[i][j+1] 일 때 지움(동률이면 지움 먼저), 그 밖이면 넣음.
 * 다 적은 뒤 목록에서 남김 · 지움 줄만 골라 A 를, 남김 · 넣음 줄만 골라 B 를 다시 읽는다.
 *
 * 이벤트 (전부 silent 아님 — 한 걸음씩):
 *   write     payload { op: 'keep' | 'del' | 'ins'; ai: number | null; bi: number | null }
 *             목록에 한 줄을 붙인다. ai · bi 는 그 줄이 읽은 A · B 의 줄 자리 (0 기반).
 *             keep 은 둘 다, del 은 ai 만, ins 는 bi 만 수이고 나머지는 null.
 *   readBack  payload { side: 'a' | 'b'; rows: number[] }
 *             다 적은 목록에서 한 쪽을 다시 읽는다. rows 는 고른 목록 줄의 자리 (0 기반).
 *             side 'a' 는 남김 · 지움 줄, 'b' 는 남김 · 넣음 줄. 고른 줄의 글자가 원래 파일과
 *             같지 않으면 던진다 (C6).
 *
 * 걸음 0 은 initialData 의 두 파일 그대로다 (init 이벤트 없음).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EditOp = 'keep' | 'del' | 'ins';

export type EditScriptMarks = { keep: string; del: string; ins: string };

export type EditScriptFacetData = {
  type: 'edit-script';
  /** 고치기 전 파일의 줄. 글자 그대로 견준다 (앞 빈칸 포함). */
  a: string[];
  /** 고친 뒤 파일의 줄. */
  b: string[];
  /** 목록 줄 앞 표식 — 번역하지 않는 자료 (unified diff 의 모양). */
  marks: EditScriptMarks;
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
};

export type EditEntry = { op: EditOp; ai: number | null; bi: number | null };

/** L[i][j] = a[i:] 와 b[j:] 의 최장 공통 부분 수열 길이. 뒤에서부터 채운다. */
export function lcsSuffix(a: readonly string[], b: readonly string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const table: number[][] = [];
  for (let i = 0; i <= n; i += 1) table.push(new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = table[i]!;
    const below = table[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? below[j + 1]! + 1 : Math.max(below[j]!, row[j + 1]!);
    }
  }
  return table;
}

/** 걷는 diff — 목록의 차례를 하나로 정한다. */
export function walkDiff(a: readonly string[], b: readonly string[]): EditEntry[] {
  const table = lcsSuffix(a, b);
  const out: EditEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      out.push({ op: 'keep', ai: i, bi: j });
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && table[i + 1]![j]! >= table[i]![j + 1]!)) {
      out.push({ op: 'del', ai: i, bi: null });
      i += 1;
    } else {
      out.push({ op: 'ins', ai: null, bi: j });
      j += 1;
    }
  }
  const kept = out.filter((e) => e.op === 'keep').length;
  if (kept !== table[0]![0]) {
    throw new Error(`edit-script: 남김 ${kept} 이 최장 공통 부분 수열 ${table[0]![0]} 과 다르다`);
  }
  return out;
}

/** 목록 줄의 글자 — 원래 파일 줄 그대로. */
export function entryText(entry: EditEntry, a: readonly string[], b: readonly string[]): string {
  if (entry.op === 'ins') {
    if (entry.bi === null || b[entry.bi] === undefined) {
      throw new Error(`edit-script: 넣음 줄의 B 자리 ${String(entry.bi)} 가 파일 밖이다`);
    }
    return b[entry.bi];
  }
  if (entry.ai === null || a[entry.ai] === undefined) {
    throw new Error(`edit-script: ${entry.op} 줄의 A 자리 ${String(entry.ai)} 가 파일 밖이다`);
  }
  return a[entry.ai];
}

/** 한 쪽을 다시 읽을 때 고르는 손질. */
export function sideOps(side: 'a' | 'b'): readonly EditOp[] {
  return side === 'a' ? ['keep', 'del'] : ['keep', 'ins'];
}

function isLines(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** initialData 좁히개 — 모르는 모양은 필드 경로를 담아 던진다. */
export function narrowEditScriptData(raw: unknown): EditScriptFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('edit-script: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'edit-script') throw new Error(`edit-script: initialData.type 이 ${String(r.type)} 이다`);
  if (!isLines(r.a)) throw new Error('edit-script: initialData.a 가 줄 목록이 아니다');
  if (!isLines(r.b)) throw new Error('edit-script: initialData.b 가 줄 목록이 아니다');
  const m = r.marks;
  if (typeof m !== 'object' || m === null) throw new Error('edit-script: initialData.marks 가 없다');
  const mk = m as Record<string, unknown>;
  for (const key of ['keep', 'del', 'ins'] as const) {
    if (typeof mk[key] !== 'string') throw new Error(`edit-script: initialData.marks.${key} 가 글자가 아니다`);
  }
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) throw new Error('edit-script: initialData.stepMs 가 양수가 아니다');
  return {
    type: 'edit-script',
    a: [...r.a],
    b: [...r.b],
    marks: { keep: mk.keep as string, del: mk.del as string, ins: mk.ins as string },
    stepMs: r.stepMs,
  };
}

export async function editScript(context: FacetContext<EditScriptFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<EditScriptFacetData>;
  const data = narrowEditScriptData(ctx.data);
  const { a, b, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const list = walkDiff(a, b);

  // 걸음 0 은 이미 두 파일이 선 화면이다 — 읽을 틈을 두고 첫 줄을 적는다.
  for (const entry of list) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'write', payload: { op: entry.op, ai: entry.ai, bi: entry.bi } });
  }

  for (const side of ['a', 'b'] as const) {
    if (!(await pause())) return;
    const ops = sideOps(side);
    const rows: number[] = [];
    list.forEach((entry, k) => {
      if (ops.includes(entry.op)) rows.push(k);
    });
    const original = side === 'a' ? a : b;
    const back = rows.map((k) => entryText(list[k]!, a, b));
    if (back.length !== original.length || back.some((line, k) => line !== original[k])) {
      throw new Error(`edit-script: 목록에서 다시 읽은 ${side} 가 원래 파일과 다르다`);
    }
    await ctx.emit({ type: 'readBack', payload: { side, rows } });
  }
}
