/**
 * 수동 해제 — free 로 돌려준 덩이가 빈 자리 목록으로 갔다가 다음 빌림에 다시 나간다.
 *
 * 줄 목록(`lines`)의 구조를 해석해 줄마다 한 걸음을 낸다. 할당기는 셋을 가진다 —
 * 빌려 준 덩이, 빈 자리 목록(앞이 가장 최근), 새 땅 끝(처음 `heapBase`).
 *   - `allocate(n)` 은 빈 자리 목록을 앞에서부터 보아 칸 수가 n 인 첫 덩이를 꺼내 주고,
 *     없으면 새 땅 끝에서 n 칸을 떼어 주고 끝을 n 만큼 민다
 *   - `free(p)` 는 p 에서 시작하는 덩이를 빈 자리 목록 맨 앞에 넣는다. 이름의 칸은 지우지 않는다.
 *     검사하지 않는 장난감 할당기다
 *
 * 이벤트
 *   init  (silent) { lines: string[]; indents: number[]; names: string[]; base: number; span: number }
 *         lines — 줄 글자, indents — 줄의 들여쓰기 단계, names — 바깥 틀의 이름(줄 차례), base — 새 땅의 시작,
 *         span — 재생 내내 새 땅에서 뗀 칸 수의 최댓값 (그림이 칸 폭을 한 번에 정한다)
 *   line  { line: number;
 *           set?: { name: string; value: number };
 *           alloc?: { addr: number; size: number; from: 'fresh' | 'reuse'; end: number };
 *           free?: { addr: number; size: number; name: string } }
 *         line — 밟은 줄(0 부터). set — 값을 받은 이름. alloc — 이 줄의 allocate (end 는 뒤의 새 땅 끝).
 *         free — 이 줄의 free (name 은 인자로 쓴 이름)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MfExpr =
  | { num: number }
  | { var: string }
  | { call: string; args: MfExpr[] };

export type MfStmt =
  | { k: 'assign'; to: string; declare?: boolean; value: MfExpr }
  | { k: 'expr'; value: MfExpr };

export type MfLine = { indent: number; text: string; stmt: MfStmt };

export type ManualFreeFacetData = {
  type: 'manual-free';
  stepMs: number;
  /** 힙 칸 주소의 시작 (예로 정한 값) */
  heapBase: number;
  lines: MfLine[];
};

export type MfAlloc = { addr: number; size: number; from: 'fresh' | 'reuse'; end: number };
export type MfFree = { addr: number; size: number; name: string };
export type MfStep = {
  line: number;
  set?: { name: string; value: number };
  alloc?: MfAlloc;
  free?: MfFree;
};

/** 프로그램을 끝까지 밟아 줄 걸음을 셈한다. 순수 함수. */
export function traceManualFree(data: ManualFreeFacetData): {
  names: string[];
  span: number;
  steps: MfStep[];
} {
  const names: string[] = [];
  for (const l of data.lines) {
    if (l.stmt.k === 'assign' && l.stmt.declare === true && !names.includes(l.stmt.to)) names.push(l.stmt.to);
  }
  const slots = new Map<string, number>();
  const sizeOf = new Map<number, number>();
  const borrowed = new Set<number>();
  let freeList: { addr: number; size: number }[] = [];
  let end = data.heapBase;
  const steps: MfStep[] = [];

  /** 줄 번호(L1 부터)를 실어 던진다. */
  function fail(line: number, msg: string): never {
    throw new Error(`manual-free L${line + 1}: ${msg}`);
  }

  function onlyArg(e: { call: string; args: MfExpr[] }, line: number): MfExpr {
    const [arg] = e.args;
    if (e.args.length !== 1 || arg === undefined) fail(line, `${e.call} 는 인자 하나를 받는다 (받은 수 ${e.args.length})`);
    return arg;
  }

  function evalExpr(e: MfExpr, step: MfStep, line: number): number {
    if ('num' in e) return e.num;
    if ('var' in e) {
      const v = slots.get(e.var);
      if (v === undefined) fail(line, `값이 없는 이름 ${e.var}`);
      return v;
    }
    if (e.call === 'allocate') {
      const n = evalExpr(onlyArg(e, line), step, line);
      const at = freeList.findIndex((b) => b.size === n);
      if (at >= 0) {
        const got = freeList[at]!;
        freeList = freeList.filter((_, i) => i !== at);
        borrowed.add(got.addr);
        step.alloc = { addr: got.addr, size: n, from: 'reuse', end };
        return got.addr;
      }
      const addr = end;
      end += n;
      sizeOf.set(addr, n);
      borrowed.add(addr);
      step.alloc = { addr, size: n, from: 'fresh', end };
      return addr;
    }
    if (e.call === 'free') {
      const arg = onlyArg(e, line);
      if (!('var' in arg)) fail(line, 'free 의 인자는 이름이어야 한다');
      const addr = evalExpr(arg, step, line);
      const size = sizeOf.get(addr);
      if (size === undefined) fail(line, `뗀 적 없는 덩이 ${addr}`);
      borrowed.delete(addr);
      freeList = [{ addr, size }, ...freeList];
      step.free = { addr, size, name: arg.var };
      return 0;
    }
    return fail(line, `모르는 부르기 ${e.call}`);
  }

  data.lines.forEach((l, i) => {
    const step: MfStep = { line: i };
    const v = evalExpr(l.stmt.value, step, i);
    if (l.stmt.k === 'assign') {
      if (!names.includes(l.stmt.to)) fail(i, `선언되지 않은 이름 ${l.stmt.to}`);
      slots.set(l.stmt.to, v);
      step.set = { name: l.stmt.to, value: v };
    }
    steps.push(step);
  });
  return { names, span: end - data.heapBase, steps };
}

export async function manualFree(ctx: FacetContext<ManualFreeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ManualFreeFacetData>;
  const data = rctx.data;
  const stepMs = data.stepMs;
  const { names, span, steps } = traceManualFree(data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      lines: data.lines.map((l) => l.text),
      indents: data.lines.map((l) => l.indent),
      names,
      base: data.heapBase,
      span,
    },
  });

  for (const s of steps) {
    if (!(await pause())) return;
    await rctx.emit({ type: 'line', payload: s });
  }
}
