/**
 * registers-are-few — 할당 전 명령 열을 앞에서부터 한 줄씩 훑으며 레지스터를 준다.
 *
 * 값(임시 이름 t1 …)이 마지막으로 읽히는 줄에서 제 레지스터를 풀고, 그 줄이 정의하는 값이
 * 가장 낮은 번호의 빈 레지스터에 들어앉는다. 이 조각의 데이터에서는 빈 레지스터가 늘 있다 —
 * 모자라면 던진다 (밀어냄은 이 조각의 말이 아니다).
 *
 * 이벤트
 *   init    silent. 바탕 셈
 *           { values: number, lines: number }
 *             values — 값(임시 이름)의 수, lines — 명령 줄 수
 *   assign  silent 아님. 명령 한 줄 = 한 걸음
 *           {
 *             line: number,                       1 부터
 *             freed: { v: string, r: string }[],  이 줄이 마지막 읽기라 풀린 값과 그 레지스터 (읽은 차례)
 *             got: { v: string, r: string } | null, 이 줄이 정의한 값과 받은 레지스터 (store 는 null)
 *             names: Record<string, string>,      이 줄의 글자를 찍을 임시 → 레지스터 (풀기 전 레지스터로)
 *             live: number,                       이 줄을 마친 직후 산 값의 수
 *             peak: number,                       지금까지 live 의 가장 큰 값
 *             emitted: number,                    지금까지 낸 명령 수
 *           }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Op = 'load' | 'store' | 'add' | 'sub' | 'mul';

/** 할당 전 기계 명령 하나. 레지스터 자리에 임시 이름이 있다. */
export type Instr = {
  op: Op;
  dst?: string;
  srcs?: string[];
  mem?: string;
  imm?: number;
};

export type RegistersAreFewFacetData = {
  type: 'registers-are-few';
  stepMs: number;
  /** 레지스터 수 K */
  registers: number;
  program: Instr[];
};

const OPS: readonly Op[] = ['load', 'store', 'add', 'sub', 'mul'];

function isOp(x: unknown): x is Op {
  return typeof x === 'string' && (OPS as readonly string[]).includes(x);
}

/** 명령 하나를 좁힌다. 모르는 모양은 줄 번호를 담아 던진다. */
function readInstr(raw: unknown, line: number): Instr {
  if (typeof raw !== 'object' || raw === null) throw new Error(`L${line}: 명령이 객체가 아니다`);
  const o = raw as Record<string, unknown>;
  if (!isOp(o.op)) throw new Error(`L${line}: 모르는 명령 ${String(o.op)}`);
  const ins: Instr = { op: o.op };
  if (o.dst !== undefined) {
    if (typeof o.dst !== 'string') throw new Error(`L${line}: dst 가 글자가 아니다`);
    ins.dst = o.dst;
  }
  if (o.srcs !== undefined) {
    if (!Array.isArray(o.srcs) || !o.srcs.every((s): s is string => typeof s === 'string')) {
      throw new Error(`L${line}: srcs 가 글자 목록이 아니다`);
    }
    ins.srcs = [...o.srcs];
  }
  if (o.mem !== undefined) {
    if (typeof o.mem !== 'string') throw new Error(`L${line}: mem 이 글자가 아니다`);
    ins.mem = o.mem;
  }
  if (o.imm !== undefined) {
    if (typeof o.imm !== 'number') throw new Error(`L${line}: imm 이 수가 아니다`);
    ins.imm = o.imm;
  }
  // 모양 검사 — 명령마다 있어야 할 칸
  const srcs = ins.srcs ?? [];
  if (ins.op === 'load' && (ins.dst === undefined || ins.mem === undefined || srcs.length !== 0)) {
    throw new Error(`L${line}: load 는 dst · mem 을 쥐고 읽는 값이 없다`);
  }
  if (ins.op === 'store' && (ins.dst !== undefined || ins.mem === undefined || srcs.length !== 1)) {
    throw new Error(`L${line}: store 는 mem 과 읽는 값 하나를 쥔다`);
  }
  if (ins.op === 'add' || ins.op === 'sub' || ins.op === 'mul') {
    const need = ins.imm === undefined ? 2 : 1;
    if (ins.dst === undefined || srcs.length !== need) {
      throw new Error(`L${line}: ${ins.op} 는 dst 와 읽는 값 ${need} 을 쥔다`);
    }
  }
  return ins;
}

/** initialData 의 명령 열 · 레지스터 수를 좁힌다. stage 는 쓰지 않는다 — 장면이 쓴다. */
export function readRegistersData(raw: unknown): { stepMs: number; registers: number; program: Instr[] } {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData 가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (typeof o.stepMs !== 'number' || !Number.isFinite(o.stepMs) || o.stepMs < 0) {
    throw new Error('stepMs 는 0 이상의 수여야 한다');
  }
  if (typeof o.registers !== 'number' || !Number.isInteger(o.registers) || o.registers < 1) {
    throw new Error('registers 는 1 이상의 정수여야 한다');
  }
  if (!Array.isArray(o.program) || o.program.length === 0) throw new Error('program 이 비었다');
  const program = o.program.map((ins, i) => readInstr(ins, i + 1));
  return { stepMs: o.stepMs, registers: o.registers, program };
}

/** 레지스터 이름 r1 · r2 … (번호 차례) */
export function regNames(k: number): string[] {
  return Array.from({ length: k }, (_, i) => `r${i + 1}`);
}

/**
 * 구조에서 화면 글자를 찍는다. `name` 은 임시 → 표시 이름 (할당 전이면 그대로).
 * 알고리즘 · 장면 · 그림이 같은 함수를 부른다.
 */
export function formatInstr(ins: Instr, name: (v: string) => string): string {
  const srcs = ins.srcs ?? [];
  const at = (i: number): string => {
    const v = srcs[i];
    if (v === undefined) throw new Error(`${ins.op}: 읽는 값 ${i + 1} 이 없다`);
    return name(v);
  };
  const dst = (): string => {
    if (ins.dst === undefined) throw new Error(`${ins.op}: dst 가 없다`);
    return name(ins.dst);
  };
  const mem = (): string => {
    if (ins.mem === undefined) throw new Error(`${ins.op}: mem 이 없다`);
    return ins.mem;
  };
  switch (ins.op) {
    case 'load':
      return `load ${dst()}, ${mem()}`;
    case 'store':
      return `store ${mem()}, ${at(0)}`;
    case 'add':
    case 'sub':
    case 'mul':
      return ins.imm !== undefined
        ? `${ins.op} ${dst()}, ${at(0)}, ${ins.imm}`
        : `${ins.op} ${dst()}, ${at(0)}, ${at(1)}`;
  }
}

/** 값마다 (정의한 줄, 마지막으로 읽은 줄). 삽입 차례 = 정의 차례. */
function intervals(program: Instr[]): Map<string, { def: number; last: number }> {
  const def = new Map<string, number>();
  const last = new Map<string, number>();
  program.forEach((ins, idx) => {
    const line = idx + 1;
    for (const v of ins.srcs ?? []) {
      if (!def.has(v)) throw new Error(`L${line}: ${v} 가 정의 전에 읽혔다`);
      last.set(v, line);
    }
    if (ins.dst !== undefined) {
      if (def.has(ins.dst)) throw new Error(`L${line}: ${ins.dst} 를 두 번 정의`);
      def.set(ins.dst, line);
    }
  });
  const out = new Map<string, { def: number; last: number }>();
  for (const [v, d] of def) {
    const l = last.get(v);
    if (l === undefined) throw new Error(`${v} 를 아무도 읽지 않는다`);
    out.set(v, { def: d, last: l });
  }
  return out;
}

export async function registersAreFew(ctx: FacetContext<RegistersAreFewFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RegistersAreFewFacetData>;
  const { stepMs, registers, program } = readRegistersData(ctx.data);
  const iv = intervals(program);
  const regs = regNames(registers);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { values: iv.size, lines: program.length }, silent: true });

  const holder = new Map<string, string>(); // 레지스터 → 값
  const where = new Map<string, string>(); // 값 → 레지스터
  let peak = 0;
  let emitted = 0;

  for (let idx = 0; idx < program.length; idx += 1) {
    // 걸음 0 은 명령 열 전체가 보이는 화면이라, 첫 줄 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const line = idx + 1;
    const ins = program[idx];
    if (ins === undefined) throw new Error(`L${line}: 명령이 없다`);
    const srcs = ins.srcs ?? [];

    // 글자는 풀기 전 레지스터로 찍는다
    const names: Record<string, string> = {};
    for (const v of srcs) {
      const r = where.get(v);
      if (r === undefined) throw new Error(`L${line}: ${v} 가 레지스터에 없다`);
      names[v] = r;
    }

    // (2) 이 줄이 마지막 읽기인 값의 레지스터를 푼다 (읽은 차례, 같은 값은 한 번)
    const freed: { v: string; r: string }[] = [];
    for (const v of new Set(srcs)) {
      const span = iv.get(v);
      if (span === undefined) throw new Error(`L${line}: ${v} 의 산 구간이 없다`);
      if (span.last !== line) continue; // 아직 뒤에서 읽힌다 — 레지스터를 쥔 채로 둔다
      const r = where.get(v);
      if (r === undefined) throw new Error(`L${line}: ${v} 가 레지스터에 없다`);
      where.delete(v);
      holder.delete(r);
      freed.push({ v, r });
    }

    // (3) 이 줄이 정의하는 값에 가장 낮은 번호의 빈 레지스터
    let got: { v: string; r: string } | null = null;
    if (ins.dst !== undefined) {
      const r = regs.find((x) => !holder.has(x));
      if (r === undefined) throw new Error(`L${line}: ${ins.dst} 에 줄 빈 레지스터가 없다 — 이 조각의 규약 밖`);
      holder.set(r, ins.dst);
      where.set(ins.dst, r);
      names[ins.dst] = r;
      got = { v: ins.dst, r };
    }
    emitted += 1;

    // 대조 — 레지스터를 쥔 값의 수 = 산 구간 셈의 산 값 수
    let live = 0;
    for (const span of iv.values()) if (span.def <= line && line < span.last) live += 1;
    if (live !== holder.size) throw new Error(`L${line}: 산 값 ${live} 와 쥔 레지스터 ${holder.size} 가 다르다`);
    peak = Math.max(peak, live);

    await ctx.emit({
      type: 'assign',
      payload: { line, freed, got, names, live, peak, emitted },
    });
  }
}
