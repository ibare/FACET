/**
 * 아직 안 나온 값 — 뒤 명령어가 앞 명령어의 결과를 기다리며 ID 에 붙들린다.
 *
 * 모형: 다섯 단계(IF · ID · EX · MEM · WB), 순서대로, 포워딩 없음. 레지스터는 ID 에서
 * 읽고 WB 에서 쓴다. 레지스터 파일은 한 사이클의 앞 반에 쓰고 뒤 반에 읽는다 — WB 와
 * 같은 사이클의 ID 는 새 값을 읽는다. ID 에서 읽을 원천이 아직 안 쓰였으면 그 명령어는
 * ID 에 머물고 그 뒤 명령어는 IF 에 머문다. 머무는 동안 EX 로는 빈 칸이 들어간다.
 *
 * 사이클 표는 사양이 주지 않는다 — `simulate` 가 위 규약에서 셈한다.
 *
 * 이벤트 (모두 silent 아님, 걸음 하나 = 사이클 하나):
 *   cycle  payload: CyclePayload
 *     cycle   사이클 번호 (1 부터)
 *     slots   [IF, ID, EX, MEM, WB] 의 자리 — { kind: 'instr', i } | { kind: 'bubble', born } | null
 *             bubble 의 born 은 그 빈 칸이 EX 로 들어간 사이클 (빈 칸의 이름)
 *     write   이 사이클 앞 반의 쓰기 { i, reg, value } | null
 *     read    이 사이클 뒤 반의 읽기 { i, values: 원천 순서대로 } | null
 *     exec    이 사이클 EX 의 셈 { i, value } | null
 *     stall   ID 에서 읽지 못한 명령어 { i, reg, writer, stale, wrong } | null
 *             stale 은 지금 읽었다면 가져갔을 옛 값, wrong 은 그 값으로 셈했을 결과
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Op = 'add' | 'sub' | 'and' | 'or' | 'xor';

export type Instr = {
  /** 어셈블리 표기 그대로 (자료) */
  text: string;
  op: Op;
  dst: string;
  srcs: string[];
};

export type ReadBeforeWriteFacetData = {
  type: 'read-before-write';
  stepMs: number;
  /** 처음 값이 알려진 레지스터만 */
  registers: Record<string, number>;
  /** 명령어 글자 */
  program: string[];
};

export type Token = { kind: 'instr'; i: number } | { kind: 'bubble'; born: number };

export type Stall = { i: number; reg: string; writer: number; stale: number | null; wrong: number | null };

export type CyclePayload = {
  cycle: number;
  slots: (Token | null)[];
  write: { i: number; reg: string; value: number } | null;
  read: { i: number; values: number[] } | null;
  exec: { i: number; value: number } | null;
  stall: Stall | null;
};

const OPS: readonly Op[] = ['add', 'sub', 'and', 'or', 'xor'];

/** `add r1, r2, r3` → { op, dst, srcs }. 모르는 꼴은 던진다 — 지어 채우지 않는다. */
export function parseInstr(text: string): Instr {
  const m = /^\s*([a-z]+)\s+(r\d+)\s*,\s*(r\d+)\s*,\s*(r\d+)\s*$/.exec(text);
  const op = m?.[1] as Op | undefined;
  if (!m || !op || !OPS.includes(op)) throw new Error(`read-before-write: 읽을 수 없는 명령어 ${text}`);
  return { text: text.trim(), op, dst: m[2]!, srcs: [m[3]!, m[4]!] };
}

export function applyOp(op: Op, a: number, b: number): number {
  switch (op) {
    case 'add':
      return a + b;
    case 'sub':
      return a - b;
    case 'and':
      return a & b;
    case 'or':
      return a | b;
    case 'xor':
      return a ^ b;
  }
}

/** 화면에 늘어놓을 레지스터 이름 — 처음 값이 있는 것과 명령어가 부르는 것, 번호 순. */
export function listRegisters(registers: Record<string, number>, program: Instr[]): string[] {
  const set = new Set<string>(Object.keys(registers));
  for (const ins of program) {
    set.add(ins.dst);
    for (const s of ins.srcs) set.add(s);
  }
  return [...set].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

type Timing = { ifStart: number; idStart: number; idEnd: number; ex: number; mem: number; wb: number };

/** 규약에서 사이클 표를 셈한다. */
export function schedule(program: Instr[]): Timing[] {
  const out: Timing[] = [];
  program.forEach((ins, k) => {
    const prev = out[k - 1];
    const ifStart = prev ? prev.idStart : 1;
    const idStart = prev ? Math.max(ifStart + 1, prev.idEnd + 1) : ifStart + 1;
    let idEnd = idStart;
    for (const src of ins.srcs) {
      const w = lastWriter(program, k, src);
      if (w >= 0) idEnd = Math.max(idEnd, out[w]!.wb);
    }
    out.push({ ifStart, idStart, idEnd, ex: idEnd + 1, mem: idEnd + 2, wb: idEnd + 3 });
  });
  return out;
}

/** k 앞에서 reg 를 마지막으로 쓰는 명령어. 없으면 -1. */
function lastWriter(program: Instr[], k: number, reg: string): number {
  for (let j = k - 1; j >= 0; j -= 1) if (program[j]!.dst === reg) return j;
  return -1;
}

/** 사이클마다의 발신을 셈한다. */
export function simulate(data: ReadBeforeWriteFacetData): CyclePayload[] {
  const program = data.program.map(parseInstr);
  const times = schedule(program);
  const regs = new Map<string, number>(Object.entries(data.registers));
  const readVals: (number[] | null)[] = program.map(() => null);
  const last = times.reduce((m, tm) => Math.max(m, tm.wb), 0);
  const stalledAt = (c: number): boolean => times.some((tm) => tm.idStart <= c && c < tm.idEnd);
  const out: CyclePayload[] = [];

  for (let c = 1; c <= last; c += 1) {
    const slots: (Token | null)[] = [null, null, null, null, null];
    times.forEach((tm, i) => {
      if (tm.ifStart <= c && c < tm.idStart) slots[0] = { kind: 'instr', i };
      else if (tm.idStart <= c && c <= tm.idEnd) slots[1] = { kind: 'instr', i };
      else if (c === tm.ex) slots[2] = { kind: 'instr', i };
      else if (c === tm.mem) slots[3] = { kind: 'instr', i };
      else if (c === tm.wb) slots[4] = { kind: 'instr', i };
    });
    // 빈 칸은 ID 가 머문 다음 사이클에 EX 로 들어가 한 칸씩 흘러간다.
    if (!slots[2] && stalledAt(c - 1)) slots[2] = { kind: 'bubble', born: c };
    if (!slots[3] && !times.some((tm) => tm.ex === c - 1) && stalledAt(c - 2)) slots[3] = { kind: 'bubble', born: c - 1 };
    if (!slots[4] && !times.some((tm) => tm.ex === c - 2) && stalledAt(c - 3)) slots[4] = { kind: 'bubble', born: c - 2 };

    // 앞 반: 쓰기
    let write: CyclePayload['write'] = null;
    const wi = times.findIndex((tm) => tm.wb === c);
    if (wi >= 0) {
      const vals = readVals[wi]!;
      const value = applyOp(program[wi]!.op, vals[0]!, vals[1]!);
      regs.set(program[wi]!.dst, value);
      write = { i: wi, reg: program[wi]!.dst, value };
    }

    // 뒤 반: 읽기 — 또는 읽지 못하고 머묾
    let read: CyclePayload['read'] = null;
    let stall: Stall | null = null;
    const ri = times.findIndex((tm) => tm.idEnd === c);
    if (ri >= 0) {
      const values = program[ri]!.srcs.map((s) => regs.get(s) ?? Number.NaN);
      readVals[ri] = values;
      read = { i: ri, values };
    }
    const si = times.findIndex((tm) => tm.idStart <= c && c < tm.idEnd);
    if (si >= 0) {
      const ins = program[si]!;
      const reg = ins.srcs.find((s) => {
        const w = lastWriter(program, si, s);
        return w >= 0 && times[w]!.wb > c;
      })!;
      const stales = ins.srcs.map((s) => regs.get(s));
      const known = stales.every((v): v is number => v !== undefined);
      stall = {
        i: si,
        reg,
        writer: lastWriter(program, si, reg),
        stale: regs.get(reg) ?? null,
        wrong: known ? applyOp(ins.op, stales[0]!, stales[1]!) : null,
      };
    }

    let exec: CyclePayload['exec'] = null;
    const ei = times.findIndex((tm) => tm.ex === c);
    if (ei >= 0) {
      const vals = readVals[ei]!;
      exec = { i: ei, value: applyOp(program[ei]!.op, vals[0]!, vals[1]!) };
    }

    out.push({ cycle: c, slots, write, read, exec, stall });
  }
  return out;
}

export async function readBeforeWrite(ctx: FacetContext<ReadBeforeWriteFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<ReadBeforeWriteFacetData>;
  const stepMs = rc.data.stepMs;
  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const cycles = simulate(rc.data);
  for (const [k, payload] of cycles.entries()) {
    if (rc.cancelled) return;
    // 첫 사이클은 문 밖 — 마운트 직후 빈 화면을 두지 않는다.
    if (k > 0 && !(await pause())) return;
    await rc.emit({ type: 'cycle', payload });
  }
}
