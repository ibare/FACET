/**
 * spill-to-memory — 레지스터가 모자라는 순간, 값은 어디로 가는가.
 *
 * 할당 전 명령 열(임시 이름 t1 · t2 …)을 앞에서부터 한 줄씩 훑으며 레지스터 K 개를 준다.
 * 빈 레지스터가 없으면 쥔 값들과 새 값 가운데 마지막 읽기가 가장 먼 값을 스택 칸으로 밀어내고
 * (그 줄 앞에 `store [sp+칸], r`), 밀려난 값을 읽는 줄 앞에서 빈 레지스터로 되불러온다
 * (그 줄 앞에 `load r, [sp+칸]`).
 *
 * 줄 하나의 차례: (1) 밀려난 값을 읽으면 되불러옴 → (2) 이 줄이 마지막 읽기인 값의 레지스터를
 * 풀어 줌 → (3) 이 줄이 정의하는 값에 가장 낮은 번호의 빈 레지스터 (없으면 밀어냄).
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 * - `reload` — 밀려난 값을 되불러온다. 원래 줄 `before` 바로 앞에 한 줄이 끼어든다.
 *   payload `{ v: string; reg: string; slot: number; before: number; last: number }`
 *   (`last` = 그 값의 마지막 읽기 줄)
 *
 * - `line` — 원래 줄 하나를 할당한다.
 *   payload `{
 *     line: number;                                   // 원래 줄 번호 (1 부터)
 *     names: Record<string, string>;                  // 이 줄 글자의 임시 → 레지스터
 *     freed: { v: string; reg: string }[];            // 이 줄에서 풀린 값
 *     got: { v: string; reg: string; last: number } | null;   // 이 줄이 정의한 값이 받은 레지스터
 *     spill: { v: string; reg: string; slot: number; last: number;
 *              cands: { v: string; last: number }[] } | null; // 넘쳐 밀어낸 값 (last = 그 값의 마지막 읽기, cands = 견준 후보)
 *     live: number;                                   // 줄을 마친 직후 산 값 수
 *   }`
 *
 * 걸음 0 은 장면의 `initial()` 이 명령 열에서 세운다 (init 이벤트 없음).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 명령 구조 — 화면 글자는 여기서 찍어 낸다. */
export type Instr = {
  op: 'load' | 'store' | 'add' | 'sub' | 'mul' | 'addi';
  dst: string | null;
  srcs: string[];
  mem: string | null;
  imm: number | null;
};

export type SpillToMemoryFacetData = {
  type: 'spill-to-memory';
  stepMs: number;
  /** 레지스터 수 */
  k: number;
  program: Instr[];
};

const OPS = new Set(['load', 'store', 'add', 'sub', 'mul', 'addi']);

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 명령 하나를 좁힌다. 모르는 모양은 줄 번호를 담아 던진다. */
function readInstr(raw: unknown, line: number): Instr {
  if (!isRecord(raw)) throw new Error(`spill-to-memory: L${line} 명령이 객체가 아니다`);
  const { op, dst, srcs, mem, imm } = raw;
  if (typeof op !== 'string' || !OPS.has(op)) throw new Error(`spill-to-memory: L${line} 모르는 명령 ${String(op)}`);
  if (dst !== null && typeof dst !== 'string') throw new Error(`spill-to-memory: L${line} dst 가 이름이 아니다`);
  if (!Array.isArray(srcs) || !srcs.every((s): s is string => typeof s === 'string')) {
    throw new Error(`spill-to-memory: L${line} srcs 가 이름 목록이 아니다`);
  }
  if (mem !== null && typeof mem !== 'string') throw new Error(`spill-to-memory: L${line} mem 이 이름이 아니다`);
  if (imm !== null && typeof imm !== 'number') throw new Error(`spill-to-memory: L${line} imm 이 수가 아니다`);
  return { op: op as Instr['op'], dst, srcs: [...srcs], mem, imm };
}

/** initialData 를 좁힌다. 틀린 데이터는 던진다. */
export function readSpillData(raw: unknown): SpillToMemoryFacetData {
  if (!isRecord(raw) || raw.type !== 'spill-to-memory') throw new Error('spill-to-memory: initialData.type 이 다르다');
  const { stepMs, k, program } = raw;
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('spill-to-memory: stepMs 가 없다');
  if (typeof k !== 'number' || !Number.isInteger(k) || k < 1) throw new Error('spill-to-memory: k 가 1 이상의 정수가 아니다');
  if (!Array.isArray(program) || program.length === 0) throw new Error('spill-to-memory: program 이 비었다');
  return { type: 'spill-to-memory', stepMs, k, program: program.map((p, i) => readInstr(p, i + 1)) };
}

/** 이름 바꾸기 — 없는 이름은 던진다. */
function renamer(names: Record<string, string> | null, line: number): (v: string) => string {
  return (v) => {
    if (names === null) return v;
    const r = names[v];
    if (r === undefined) throw new Error(`spill-to-memory: L${line} ${v} 의 레지스터가 없다`);
    return r;
  };
}

function src(ins: Instr, i: number, line: number): string {
  const s = ins.srcs[i];
  if (s === undefined) throw new Error(`spill-to-memory: L${line} ${ins.op} 의 ${i + 1} 번째 읽는 칸이 없다`);
  return s;
}

function need<T>(x: T | null, what: string, line: number): T {
  if (x === null) throw new Error(`spill-to-memory: L${line} ${what} 이 없다`);
  return x;
}

/**
 * 구조에서 명령 글자를 찍는다. `names` 가 null 이면 임시 이름 그대로 (할당 전).
 * 장면 · 그림이 같은 함수를 부른다.
 */
export function formatInstr(ins: Instr, names: Record<string, string> | null, line: number): string {
  const n = renamer(names, line);
  switch (ins.op) {
    case 'load':
      return `load ${n(need(ins.dst, 'dst', line))}, ${need(ins.mem, 'mem', line)}`;
    case 'store':
      return `store ${need(ins.mem, 'mem', line)}, ${n(src(ins, 0, line))}`;
    case 'add':
    case 'sub':
    case 'mul':
      if (ins.imm !== null) return `${ins.op} ${n(need(ins.dst, 'dst', line))}, ${n(src(ins, 0, line))}, ${ins.imm}`;
      return `${ins.op} ${n(need(ins.dst, 'dst', line))}, ${n(src(ins, 0, line))}, ${n(src(ins, 1, line))}`;
    case 'addi':
      return `addi ${n(need(ins.dst, 'dst', line))}, ${n(src(ins, 0, line))}, ${need(ins.imm, 'imm', line)}`;
  }
}

/** 끼어든 줄의 글자 — 밀어냄 */
export function formatSpill(slot: number, reg: string): string {
  return `store [sp+${slot}], ${reg}`;
}

/** 끼어든 줄의 글자 — 되불러옴 */
export function formatReload(slot: number, reg: string): string {
  return `load ${reg}, [sp+${slot}]`;
}

/** 값마다 [정의한 줄, 마지막으로 읽은 줄]. 정의 전 읽기 · 두 번 정의 · 읽히지 않는 값은 던진다. */
function intervals(program: Instr[]): Map<string, [number, number]> {
  const start = new Map<string, number>();
  const end = new Map<string, number>();
  program.forEach((ins, idx) => {
    const line = idx + 1;
    for (const v of ins.srcs) {
      if (!start.has(v)) throw new Error(`spill-to-memory: L${line} ${v} 가 정의 전에 읽혔다`);
      end.set(v, line);
    }
    if (ins.dst !== null) {
      if (start.has(ins.dst)) throw new Error(`spill-to-memory: L${line} ${ins.dst} 를 두 번 정의`);
      start.set(ins.dst, line);
    }
  });
  const iv = new Map<string, [number, number]>();
  for (const [v, s] of start) {
    const e = end.get(v);
    if (e === undefined) throw new Error(`spill-to-memory: ${v} 를 아무도 읽지 않는다`);
    iv.set(v, [s, e]);
  }
  return iv;
}

function valueNum(v: string): number {
  const m = /^t(\d+)$/.exec(v);
  if (m === null) throw new Error(`spill-to-memory: 임시 이름이 아니다 ${v}`);
  return Number(m[1]);
}

export async function spillToMemory(rawCtx: FacetContext<SpillToMemoryFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<SpillToMemoryFacetData>;
  const data = readSpillData(ctx.data);
  const { stepMs, k, program } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const iv = intervals(program);
  const lastOf = (v: string): number => {
    const x = iv.get(v);
    if (x === undefined) throw new Error(`spill-to-memory: ${v} 의 산 구간이 없다`);
    return x[1];
  };
  const regs = Array.from({ length: k }, (_, i) => `r${i + 1}`);
  const holder = new Map<string, string>(); // 레지스터 → 값
  const where = new Map<string, string>(); // 값 → 레지스터
  const slotOf = new Map<string, number>(); // 밀려난 값 → 칸
  const freeRegs = (): string[] => regs.filter((r) => !holder.has(r));

  // 걸음 0 은 명령 열 전체가 이미 읽을 것이라 첫 발신 앞에도 틈을 둔다
  for (let idx = 0; idx < program.length; idx += 1) {
    if (ctx.cancelled) return;
    const ins = program[idx]!;
    const line = idx + 1;

    // (1) 되불러옴 — 되불러옴마다 한 걸음
    for (const v of ins.srcs) {
      if (ctx.cancelled) return;
      const slot = slotOf.get(v);
      if (slot === undefined || where.has(v)) continue; // 밀려나지 않았거나 이미 레지스터에 있다
      const fr = freeRegs()[0];
      if (fr === undefined) throw new Error(`spill-to-memory: L${line} ${v} 를 되불러올 빈 레지스터가 없다`);
      holder.set(fr, v);
      where.set(v, fr);
      if (!(await pause())) return;
      await ctx.emit({ type: 'reload', payload: { v, reg: fr, slot, before: line, last: lastOf(v) } });
    }

    // 글자는 풀기 전 레지스터로 찍는다
    const names: Record<string, string> = {};
    for (const v of ins.srcs) {
      const r = where.get(v);
      if (r === undefined) throw new Error(`spill-to-memory: L${line} ${v} 가 레지스터에 없다`);
      names[v] = r;
    }

    // (2) 풀기
    const freed: { v: string; reg: string }[] = [];
    for (const v of new Set(ins.srcs)) {
      if (ctx.cancelled) return;
      if (lastOf(v) !== line) continue; // 뒤에서 또 읽힌다 — 풀지 않는다
      const r = where.get(v);
      if (r === undefined) throw new Error(`spill-to-memory: L${line} ${v} 를 풀 레지스터가 없다`);
      where.delete(v);
      holder.delete(r);
      freed.push({ v, reg: r });
    }

    // (3) 주기
    let got: { v: string; reg: string; last: number } | null = null;
    let spill: { v: string; reg: string; slot: number; last: number; cands: { v: string; last: number }[] } | null = null;
    const d = ins.dst;
    if (d !== null) {
      let r = freeRegs()[0];
      if (r === undefined) {
        const cands = [...holder.values(), d]
          .map((v) => ({ v, last: lastOf(v) }))
          .sort((a, b) => valueNum(a.v) - valueNum(b.v));
        const far = Math.max(...cands.map((c) => c.last));
        const victim = cands.find((c) => c.last === far);
        if (victim === undefined) throw new Error(`spill-to-memory: L${line} 밀어낼 값을 못 골랐다`);
        if (victim.v === d) throw new Error(`spill-to-memory: L${line} 새 값 ${d} 자신이 뽑혔다 — 이 규약 밖`);
        const vr = where.get(victim.v);
        if (vr === undefined) throw new Error(`spill-to-memory: L${line} ${victim.v} 의 레지스터가 없다`);
        where.delete(victim.v);
        holder.delete(vr);
        const slot = 8 * slotOf.size;
        slotOf.set(victim.v, slot);
        spill = { v: victim.v, reg: vr, slot, last: victim.last, cands };
        r = vr;
      }
      holder.set(r, d);
      where.set(d, r);
      names[d] = r;
      got = { v: d, reg: r, last: lastOf(d) };
    }

    // 줄을 마친 직후 산 값 수 (정의 ≤ line < 마지막 읽기)
    let live = 0;
    for (const [s, e] of iv.values()) if (s <= line && line < e) live += 1;

    if (!(await pause())) return;
    await ctx.emit({ type: 'line', payload: { line, names, freed, got, spill, live } });
  }
}
