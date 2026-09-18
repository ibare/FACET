/**
 * 포워딩 — 뒤 명령어가 앞 명령어의 결과를 레지스터 파일을 거치지 않고 받는다.
 *
 * 모형: 다섯 단계(IF · ID · EX · MEM · WB), 단계마다 한 사이클, 순서대로 한 사이클에 하나씩
 * 가져온다. 레지스터 파일은 한 사이클의 앞 반에 쓰고 뒤 반에 읽는다. 건네는 길은 하나 —
 * EX/MEM 단계 레지스터에서 다음 사이클의 EX 입구로. 그러니 뒤 명령어의 EX 가 앞 명령어의
 * EX 바로 다음 사이클이면 건네받고, 아니면 앞 명령어의 WB 까지 ID 에서 기다린다.
 *
 * 사이클 표는 이 규약에서 셈한다(`timing`). 포워딩이 없을 때의 끝(`slowEnd`)도 같은 셈에서
 * 길만 빼고 얻는다.
 *
 * 이벤트 (모두 silent 아님 — 하나하나가 걸음이다)
 *
 *   init   { stages: StageName[]; program: Instr[]; registers: Reg[]; end: number; slowEnd: number }
 *          단계 이름 차례, 명령어와 레지스터 파일의 처음 값, 끝나는 사이클 둘
 *   cycle  { cycle: number;
 *            moves:    { i; from: Where; to: Where }[]          단계를 옮긴 명령어
 *            writes:   { i; reg; value; was }[]                 WB — 레지스터 파일에 씀 (앞 반)
 *            reads:    { i; slot: 'a'|'b'; reg; value }[]       ID 의 마지막 사이클 — 파일에서 읽음 (뒤 반)
 *            forwards: { from; to; slot; reg; value; replaced }[] EX/MEM → EX 입구로 건넴
 *            alu:      { i; a; b; value }[]                      EX — 셈 }
 *   done   { end: number; slowEnd: number; count: number; stalls: number }
 *          stalls = end − (명령어 수 + 단계 수 − 1) — 멈춤 없는 파이프라인의 끝과의 차이
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'] as const;
export type StageName = (typeof STAGES)[number];
/** 아직 가져오지 않았으면 `wait`, WB 를 마쳤으면 `out`. */
export type Where = StageName | 'wait' | 'out';

export type Op = 'add' | 'sub';
export type Instr = { op: Op; rd: string; rs: string; rt: string };
export type Reg = { name: string; value: number | null };
export type Slot = 'a' | 'b';

export type Move = { i: number; from: Where; to: Where };
export type Write = { i: number; reg: string; value: number; was: number | null };
export type Read = { i: number; slot: Slot; reg: string; value: number | null };
export type Forward = { from: number; to: number; slot: Slot; reg: string; value: number; replaced: number | null };
export type Alu = { i: number; a: number; b: number; value: number };

export type InitPayload = { stages: StageName[]; program: Instr[]; registers: Reg[]; end: number; slowEnd: number };
export type CyclePayload = {
  cycle: number;
  moves: Move[];
  writes: Write[];
  reads: Read[];
  forwards: Forward[];
  alu: Alu[];
};
/** `count` 명령어 수, `stalls` 포워딩이 있을 때 멈춘 사이클 수. */
export type DonePayload = { end: number; slowEnd: number; count: number; stalls: number };

/** 앞 명령어 가운데 `reg` 를 마지막으로 쓰는 것. 없으면 -1. */
export function producerOf(program: readonly Instr[], i: number, reg: string): number {
  for (let j = i - 1; j >= 0; j -= 1) if (program[j]!.rd === reg) return j;
  return -1;
}

export type OperandForwardingFacetData = {
  type: 'operand-forwarding';
  stepMs: number;
  registers: Reg[];
  program: Instr[];
};

type Timing = Record<StageName, number>;

/** 규약에서 사이클 표를 셈한다. `forwarding` 이 거짓이면 건네는 길이 없다. */
export function timing(program: readonly Instr[], forwarding: boolean): Timing[] {
  const out: Timing[] = [];
  program.forEach((ins, i) => {
    const prev = out[i - 1];
    const IF = prev ? prev.IF + 1 : 1;
    // 앞 명령어가 ID 를 비워야 들어가고, EX 를 비워야 들어간다.
    let ID = Math.max(IF + 1, prev ? prev.EX : 0);
    let EX = Math.max(ID + 1, prev ? prev.MEM : 0);
    for (const reg of [ins.rs, ins.rt]) {
      const j = producerOf(program, i, reg);
      if (j < 0) continue;
      const p = out[j]!;
      if (forwarding && EX === p.EX + 1) continue;
      // 레지스터 파일에서 읽어야 한다 — 쓰는 사이클(WB)의 뒤 반에 읽을 수 있다.
      ID = Math.max(ID, p.WB);
      EX = Math.max(EX, ID + 1);
    }
    out.push({ IF, ID, EX, MEM: EX + 1, WB: EX + 2 });
  });
  return out;
}

function whereAt(t: Timing, c: number): Where {
  if (c < t.IF) return 'wait';
  if (c > t.WB) return 'out';
  let w: StageName = 'IF';
  for (const s of STAGES) if (t[s] <= c) w = s;
  return w;
}

function apply(op: Instr['op'], a: number, b: number): number {
  return op === 'add' ? a + b : a - b;
}

export async function operandForwarding(ctx: FacetContext<OperandForwardingFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<OperandForwardingFacetData>;
  const { stepMs, registers, program } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const fast = timing(program, true);
  const slow = timing(program, false);
  const end = Math.max(...fast.map((t) => t.WB));
  const slowEnd = Math.max(...slow.map((t) => t.WB));

  const regs = new Map<string, number | null>(registers.map((r) => [r.name, r.value]));
  const held = program.map(() => ({ a: null as number | null, b: null as number | null, result: null as number | null }));

  await rc.emit({
    type: 'init',
    payload: {
      stages: [...STAGES],
      program: program.map((x) => ({ ...x })),
      registers: registers.map((r) => ({ ...r })),
      end,
      slowEnd,
    },
  });

  for (let c = 1; c <= end; c += 1) {
    if (!(await pause())) return;

    const moves: Move[] = [];
    const writes: Write[] = [];
    const reads: Read[] = [];
    const forwards: Forward[] = [];
    const alu: Alu[] = [];

    program.forEach((ins, i) => {
      const t = fast[i]!;
      const from = whereAt(t, c - 1);
      const to = whereAt(t, c);
      if (from !== to) moves.push({ i, from, to });

      // 앞 반 — WB 가 레지스터 파일에 쓴다.
      if (t.WB === c) {
        const value = held[i]!.result;
        if (value === null) throw new Error(`operand-forwarding: I${i + 1} 가 결과 없이 WB 에 왔다`);
        writes.push({ i, reg: ins.rd, value, was: regs.get(ins.rd) ?? null });
        regs.set(ins.rd, value);
      }
    });

    program.forEach((ins, i) => {
      const t = fast[i]!;
      // 뒤 반 — ID 의 마지막 사이클에 레지스터 파일을 읽는다.
      if (t.EX - 1 === c) {
        const pairs: [Slot, string][] = [['a', ins.rs], ['b', ins.rt]];
        for (const [slot, reg] of pairs) {
          const value = regs.get(reg) ?? null;
          held[i]![slot] = value;
          reads.push({ i, slot, reg, value });
        }
      }
      if (t.EX === c) {
        const pairs: [Slot, string][] = [['a', ins.rs], ['b', ins.rt]];
        for (const [slot, reg] of pairs) {
          const j = producerOf(program, i, reg);
          if (j < 0 || fast[j]!.EX !== c - 1) continue;
          const value = held[j]!.result;
          if (value === null) throw new Error(`operand-forwarding: I${j + 1} 의 결과가 EX/MEM 에 없다`);
          forwards.push({ from: j, to: i, slot, reg, value, replaced: held[i]![slot] });
          held[i]![slot] = value;
        }
        const { a, b } = held[i]!;
        if (a === null || b === null) throw new Error(`operand-forwarding: I${i + 1} 의 피연산자에 값이 없다`);
        const value = apply(ins.op, a, b);
        held[i]!.result = value;
        alu.push({ i, a, b, value });
      }
    });

    await rc.emit({ type: 'cycle', payload: { cycle: c, moves, writes, reads, forwards, alu } });
  }

  if (!(await pause())) return;
  const count = program.length;
  const stalls = end - (count + STAGES.length - 1);
  await rc.emit({ type: 'done', payload: { end, slowEnd, count, stalls } });
}
