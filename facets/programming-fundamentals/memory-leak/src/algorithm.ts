/**
 * 메모리 누수 — 반복마다 buf 가 새 덩이를 빌리고, 앞 덩이의 주소는 buf 칸에서 덮여 사라진다.
 *
 * 줄 구조(`lines`)를 작은 해석기로 밟아 줄 걸음마다 기계의 모습을 셈한다. 셈은 여기서만 한다 —
 * 장면은 받은 모습을 잇기만 한다.
 *
 * 기계 모형 (공통 규약):
 *   - 이름 칸: 시작에서 맨 바깥의 이름(`let` · `for` 의 이름)을 글자 차례로 한꺼번에 잡는다. 처음엔 비어 있다
 *   - 할당기: 빌려 준 덩이 · 빈 자리 목록(앞이 가장 최근) · 새 땅 끝(처음 `heapBase`)
 *     `allocate(n)` 은 목록에서 칸 수가 n 인 첫 덩이를, 없으면 새 땅에서 n 칸을 준다.
 *     `free(p)` 는 p 에서 시작하는 덩이를 목록 맨 앞에 넣는다 (검사하지 않는다. 칸 내용은 지우지 않는다)
 *   - 주소를 잃은 덩이: 빌린 덩이 가운데 시작 주소가 어느 이름 칸에도 없는 것 (`for` 의 이름 칸은 빼고 본다)
 *
 * 이벤트:
 *   start  (silent) — 걸음 0 의 모습. payload: Snapshot 에서 kind · line · from 을 뺀 것
 *                     { cells, blocks, free, newEnd, lost }
 *   step            — 밟은 줄 하나. payload: Snapshot
 *     kind   'declare' | 'assign' | 'iter' | 'exit' | 'alloc' | 'store' | 'free'
 *     line   밟은 줄의 차례 (0 부터)
 *     from   앞 걸음에 밟은 줄의 차례, 없으면 null
 *     name?  값이 바뀐 이름 (declare · assign · alloc · iter), 값을 꺼낸 이름 (store · free)
 *     addr?  빌린 덩이 · 넣은 칸 · 돌려준 덩이의 주소 (alloc · store · free)
 *     was?   그 이름 칸의 앞 값 (alloc · assign) — Val
 *     value? 새로 들어간 값 (declare · assign · iter · store) — Val
 *     cells  [{ name, value: Val, ptr: boolean }] — ptr 은 주소를 쥘 수 있는 이름인가 (`for` 의 이름이 아니다)
 *     blocks [{ addr, cells: Val[], out: boolean }] — 새 땅에서 뗀 차례. out 은 지금 빌려 준 상태인가
 *     free   number[] — 빈 자리 목록의 시작 주소들, 앞이 가장 최근
 *     newEnd number — 새 땅 끝
 *     lost   number[] — 주소를 잃은 덩이의 시작 주소, 오름차순
 *   Val = { k: 'empty' } | { k: 'null' } | { k: 'num', n: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Expr =
  | { num: number }
  | { null: true }
  | { var: string }
  | { call: string; args: Expr[] }
  | { op: '+' | '-'; l: Expr; r: Expr };

export type Stmt =
  | { k: 'assign'; to: string; value: Expr; declare?: boolean }
  | { k: 'store'; addr: Expr; value: Expr }
  | { k: 'expr'; value: Expr }
  | { k: 'for'; var: string; from: Expr; to: Expr };

export interface CodeLine {
  indent: number;
  text: string;
  stmt: Stmt;
}

export interface MemoryLeakFacetData {
  type: 'memory-leak';
  stepMs: number;
  /** 힙 칸 주소의 시작 (예로 정한 값) */
  heapBase: number;
  lines: CodeLine[];
}

export type Val = { k: 'empty' } | { k: 'null' } | { k: 'num'; n: number };

export interface Machine {
  /** ptr — 주소를 쥘 수 있는 이름인가 (`for` 의 이름은 아니다) */
  cells: { name: string; value: Val; ptr: boolean }[];
  blocks: { addr: number; cells: Val[]; out: boolean }[];
  free: number[];
  newEnd: number;
  lost: number[];
}

export type StepKind = 'declare' | 'assign' | 'iter' | 'exit' | 'alloc' | 'store' | 'free';

export interface Snapshot extends Machine {
  kind: StepKind;
  line: number;
  from: number | null;
  name?: string;
  addr?: number;
  was?: Val;
  value?: Val;
}

const EMPTY: Val = { k: 'empty' };

/** 줄 구조를 밟아 시작의 모습과 줄 걸음마다의 모습을 셈한다. */
export function interpret(data: MemoryLeakFacetData): { start: Machine; steps: Snapshot[] } {
  const lines = data.lines;
  const cells = new Map<string, Val>();
  const loopVars = new Set<string>();
  for (const l of lines) {
    if (l.stmt.k === 'assign' && l.stmt.declare && !cells.has(l.stmt.to)) cells.set(l.stmt.to, EMPTY);
    if (l.stmt.k === 'for') {
      loopVars.add(l.stmt.var);
      if (!cells.has(l.stmt.var)) cells.set(l.stmt.var, EMPTY);
    }
  }
  const blocks: { addr: number; cells: Val[]; out: boolean }[] = [];
  let free: number[] = [];
  let newEnd = data.heapBase;
  const steps: Snapshot[] = [];
  let lastLine: number | null = null;

  function lostNow(): number[] {
    const held = new Set<number>();
    for (const [name, v] of cells) if (!loopVars.has(name) && v.k === 'num') held.add(v.n);
    return blocks.filter((b) => b.out && !held.has(b.addr)).map((b) => b.addr).sort((a, b) => a - b);
  }

  function machine(): Machine {
    return {
      cells: [...cells].map(([name, value]) => ({ name, value, ptr: !loopVars.has(name) })),
      blocks: blocks.map((b) => ({ addr: b.addr, cells: [...b.cells], out: b.out })),
      free: [...free],
      newEnd,
      lost: lostNow(),
    };
  }

  function record(line: number, kind: StepKind, extra: Partial<Snapshot>): void {
    steps.push({ ...machine(), ...extra, kind, line, from: lastLine });
    lastLine = line;
  }

  /** 지금 밟는 줄의 차례 — 오류 메시지의 `L<n>` */
  let cur = 0;

  function fail(msg: string): never {
    throw new Error(`memory-leak: L${cur + 1} ${msg}`);
  }

  function num(v: Val): number {
    if (v.k !== 'num') fail(`수가 아닌 값(${v.k})을 셈에 썼다`);
    return v.n;
  }

  function allocate(n: number): number {
    const at = free.findIndex((a) => blocks.find((b) => b.addr === a)?.cells.length === n);
    if (at >= 0) {
      const addr = free[at];
      free = free.filter((_, k) => k !== at);
      const b = blocks.find((x) => x.addr === addr);
      if (b) b.out = true;
      return addr;
    }
    const addr = newEnd;
    blocks.push({ addr, cells: Array.from({ length: n }, () => EMPTY), out: true });
    newEnd += n;
    return addr;
  }

  function readName(name: string): Val {
    const v = cells.get(name);
    if (v === undefined) fail(`선언되지 않은 이름 ${name}`);
    return v;
  }

  function oneArg(call: string, args: Expr[]): Expr {
    if (args.length !== 1) fail(`${call} 의 인자 수가 1 이 아니다 (${args.length})`);
    return args[0];
  }

  function evaluate(e: Expr): Val {
    if ('num' in e && typeof e.num === 'number') return { k: 'num', n: e.num };
    if ('null' in e && e.null === true) return { k: 'null' };
    if ('var' in e && typeof e.var === 'string') return readName(e.var);
    if ('op' in e) {
      if (e.op !== '+' && e.op !== '-') fail(`모르는 연산 ${String(e.op)}`);
      const l = num(evaluate(e.l));
      const r = num(evaluate(e.r));
      return { k: 'num', n: e.op === '+' ? l + r : l - r };
    }
    if ('call' in e && Array.isArray(e.args)) {
      if (e.call === 'allocate') return { k: 'num', n: allocate(num(evaluate(oneArg(e.call, e.args)))) };
      if (e.call === 'free') {
        const addr = num(evaluate(oneArg(e.call, e.args)));
        free = [addr, ...free];
        const b = blocks.find((x) => x.addr === addr);
        if (b) b.out = false;
        return EMPTY;
      }
      fail(`모르는 부르기 ${e.call}`);
    }
    fail(`모르는 식 모양 ${JSON.stringify(e)}`);
  }

  function bodyEnd(i: number): number {
    let j = i + 1;
    while (j < lines.length && lines[j].indent > lines[i].indent) j += 1;
    return j;
  }

  function isAlloc(e: Expr): boolean {
    return 'call' in e && e.call === 'allocate';
  }

  function exec(from: number, to: number): void {
    let i = from;
    while (i < to) {
      cur = i;
      const s = lines[i].stmt;
      if (s.k === 'for') {
        const end = bodyEnd(i);
        readName(s.var);
        const a = num(evaluate(s.from));
        const b = num(evaluate(s.to));
        for (let v = a; v <= b; v += 1) {
          cur = i;
          const value: Val = { k: 'num', n: v };
          cells.set(s.var, value);
          record(i, 'iter', { name: s.var, value });
          exec(i + 1, end);
        }
        cur = i;
        record(i, 'exit', {});
        i = end;
        continue;
      }
      if (s.k === 'assign') {
        const was = readName(s.to);
        const value = evaluate(s.value);
        cells.set(s.to, value);
        if (isAlloc(s.value)) record(i, 'alloc', { name: s.to, addr: num(value), was });
        else record(i, s.declare ? 'declare' : 'assign', { name: s.to, was, value });
      } else if (s.k === 'store') {
        const addr = num(evaluate(s.addr));
        const value = evaluate(s.value);
        const b = blocks.find((x) => addr >= x.addr && addr < x.addr + x.cells.length);
        if (!b) fail(`빌린 칸이 아닌 ${addr} 에 넣었다`);
        b.cells[addr - b.addr] = value;
        record(i, 'store', { addr, value, ...('var' in s.value ? { name: s.value.var } : {}) });
      } else if (s.k === 'expr' && 'call' in s.value && s.value.call === 'free') {
        const arg = oneArg('free', s.value.args);
        const addr = num(evaluate(arg));
        evaluate(s.value);
        record(i, 'free', { addr, ...('var' in arg ? { name: arg.var } : {}) });
      } else {
        fail(`모르는 문 ${(s as { k: unknown }).k}`);
      }
      i += 1;
    }
  }

  const start = machine();
  exec(0, lines.length);
  return { start, steps };
}

export async function memoryLeak(ctxIn: FacetContext<MemoryLeakFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<MemoryLeakFacetData>;
  const stepMs = ctx.data.stepMs;
  const { start, steps } = interpret(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'start', silent: true, payload: start });
  // 걸음 0 은 프로그램 전체가 보이는 화면이라 첫 걸음 앞에도 읽을 틈을 둔다.
  for (const s of steps) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'step', payload: s });
  }
}
