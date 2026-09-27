/**
 * 집합 연산 — 두 모음 A · B 에서 교집합 · 합집합 · 차집합이 각각 어느 원소를 가져오는가.
 *
 * 연산 차례는 자료(`operations`)가 정한다. 연산 하나가 걸음 하나다. 원소의 소속은
 * A · B 목록에서 판정한다 — 교집합은 A 에 있고 B 에 있다, 합집합은 A 에 있거나 B 에
 * 있다, 차집합은 A 에 있고 B 에 없다. 결과 원소는 작은 수부터 적는다.
 *
 * 이벤트 (발신 차례대로)
 *
 * - `gather` (silent 아님) — 연산 하나. 걸음 앞에 `stepMs` 를 둔다 (걸음 0 이 이미
 *   A · B 를 보이므로 읽을 틈을 준다)
 *   payload: {
 *     op:      'intersection' | 'union' | 'difference'
 *     taken:   { value: number; from: 'a' | 'b' }[]   결과 모음으로 떠나는 사본들
 *                                                    (A 쪽을 먼저, 모음 안 차례대로)
 *     result:  { value: number; from: 'a' | 'b' | 'both' }[]   결과 원소 (작은 수부터).
 *                                                    from 은 그 원소의 사본이 어디서 왔는가
 *     merged:  number[]   양쪽에서 온 사본이 하나로 포개진 원소 (작은 수부터)
 *     removed: number[]   들어온 뒤 덜어져 나간 원소 — 차집합에서 B 에도 있는 A 의 원소
 *     idle:    number[]   덜 것이 없는 B 의 원소 — 차집합에서 A 에 없는 B 의 원소
 *   }
 *
 * init 이벤트는 없다 — 걸음 0(A · B 와 빈 결과 자리)은 장면의 `initial` 이 자료에서 세운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SetOperation = 'intersection' | 'union' | 'difference';

export const SET_OPERATIONS: readonly SetOperation[] = ['intersection', 'union', 'difference'];

export type SetOperationsFacetData = {
  type: 'set-operations';
  /** 두 모음. name 은 수식 기호(A · B), items 는 원소 (작은 수부터, 겹침 없음) */
  a: { name: string; items: number[] };
  b: { name: string; items: number[] };
  /** 연산 차례 */
  operations: SetOperation[];
  /** 연산 기호 (∩ · ∪ · −) */
  symbols: Record<SetOperation, string>;
  stepMs: number;
};

export type Origin = 'a' | 'b';

export type GatherResult = {
  op: SetOperation;
  taken: { value: number; from: Origin }[];
  result: { value: number; from: Origin | 'both' }[];
  merged: number[];
  removed: number[];
  idle: number[];
};

function isOperation(v: unknown): v is SetOperation {
  return typeof v === 'string' && (SET_OPERATIONS as readonly string[]).includes(v);
}

function narrowSet(v: unknown, path: string): { name: string; items: number[] } {
  if (typeof v !== 'object' || v === null) throw new Error(`set-operations: ${path} 가 객체가 아니다`);
  const o = v as Record<string, unknown>;
  if (typeof o.name !== 'string' || o.name.length === 0) {
    throw new Error(`set-operations: ${path}.name 이 비었거나 문자열이 아니다`);
  }
  if (!Array.isArray(o.items) || o.items.length === 0) {
    throw new Error(`set-operations: ${path}.items 가 비었거나 배열이 아니다`);
  }
  const items: number[] = [];
  o.items.forEach((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) {
      throw new Error(`set-operations: ${path}.items[${i}] 가 정수가 아니다`);
    }
    if (i > 0 && x <= items[i - 1]!) {
      throw new Error(`set-operations: ${path}.items[${i}] 가 앞 원소보다 크지 않다 (작은 수부터 · 겹침 없음)`);
    }
    items.push(x);
  });
  return { name: o.name, items };
}

/** `ctx.data` · `initialData` 의 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다. */
export function narrowSetOperationsData(data: unknown): SetOperationsFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('set-operations: 자료가 객체가 아니다');
  const d = data as Record<string, unknown>;
  if (d.type !== 'set-operations') throw new Error(`set-operations: type 이 'set-operations' 가 아니다`);
  const a = narrowSet(d.a, 'a');
  const b = narrowSet(d.b, 'b');
  if (a.name === b.name) throw new Error('set-operations: a.name 과 b.name 이 같다');
  if (!Array.isArray(d.operations) || d.operations.length === 0) {
    throw new Error('set-operations: operations 가 비었거나 배열이 아니다');
  }
  const operations: SetOperation[] = [];
  d.operations.forEach((op, i) => {
    if (!isOperation(op)) throw new Error(`set-operations: operations[${i}] 가 알 수 없는 연산이다`);
    if (operations.includes(op)) throw new Error(`set-operations: operations[${i}] 가 겹친다`);
    operations.push(op);
  });
  if (typeof d.symbols !== 'object' || d.symbols === null) throw new Error('set-operations: symbols 가 객체가 아니다');
  const rawSymbols = d.symbols as Record<string, unknown>;
  const symbols = {} as Record<SetOperation, string>;
  for (const op of SET_OPERATIONS) {
    const s = rawSymbols[op];
    if (typeof s !== 'string' || s.length === 0) throw new Error(`set-operations: symbols.${op} 가 비었거나 문자열이 아니다`);
    symbols[op] = s;
  }
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) throw new Error('set-operations: stepMs 가 양수가 아니다');
  return { type: 'set-operations', a, b, operations, symbols, stepMs: d.stepMs };
}

/** 연산 하나 — 어느 사본이 떠나고, 무엇이 포개지고, 무엇이 덜어지는가. */
export function gatherFor(op: SetOperation, a: readonly number[], b: readonly number[]): GatherResult {
  const inA = (x: number): boolean => a.includes(x);
  const inB = (x: number): boolean => b.includes(x);
  const byValue = (x: number, y: number): number => x - y;

  if (op === 'intersection') {
    const taken = [
      ...a.filter(inB).map((value) => ({ value, from: 'a' as const })),
      ...b.filter(inA).map((value) => ({ value, from: 'b' as const })),
    ];
    const both = a.filter(inB).sort(byValue);
    return {
      op,
      taken,
      result: both.map((value) => ({ value, from: 'both' as const })),
      merged: both,
      removed: [],
      idle: [],
    };
  }
  if (op === 'union') {
    const taken = [
      ...a.map((value) => ({ value, from: 'a' as const })),
      ...b.map((value) => ({ value, from: 'b' as const })),
    ];
    const values = [...new Set(taken.map((c) => c.value))].sort(byValue);
    const result = values.map((value) => {
      const from: Origin | 'both' = inA(value) && inB(value) ? 'both' : inA(value) ? 'a' : 'b';
      return { value, from };
    });
    return {
      op,
      taken,
      result,
      merged: result.filter((r) => r.from === 'both').map((r) => r.value),
      removed: [],
      idle: [],
    };
  }
  // difference — A 에 있고 B 에 없다
  const taken = a.map((value) => ({ value, from: 'a' as const }));
  return {
    op,
    taken,
    result: a.filter((x) => !inB(x)).sort(byValue).map((value) => ({ value, from: 'a' as const })),
    merged: [],
    removed: a.filter(inB).sort(byValue),
    idle: b.filter((x) => !inA(x)).sort(byValue),
  };
}

export async function setOperations(context: FacetContext<SetOperationsFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<SetOperationsFacetData>;
  const data = narrowSetOperationsData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (const op of data.operations) {
    if (!(await pause())) return;
    const g = gatherFor(op, data.a.items, data.b.items);
    await ctx.emit({
      type: 'gather',
      payload: {
        op: g.op,
        taken: g.taken,
        result: g.result,
        merged: g.merged,
        removed: g.removed,
        idle: g.idle,
      },
    });
  }
}
