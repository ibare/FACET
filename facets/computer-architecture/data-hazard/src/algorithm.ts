/**
 * data-hazard — 뒤 명령어가 앞 명령어의 결과를 읽을 때 무엇을 치르는가.
 *
 * 다섯 단계 파이프라인(IF · ID · EX · MEM · WB)에 명령어 다섯을 순서대로 흘린다.
 * 손잡이 `plan` 이 대처를 고른다 — 안 기다림 · 기다림 · 포워딩 · 포워딩 + 순서 바꿈.
 * 한 판을 끝까지 재생하고 입력을 기다렸다가, 받은 대처로 다시 재생한다 (reactive).
 *
 * ── 규약 (사양 그대로)
 *
 *   첫 명령어 EX = 3. i 번째 EX 의 하한 = 앞 명령어 EX + 1.
 *   생산자 p (실행 순서에서 앞선 것 중 가장 가까운, 그 레지스터를 쓰는 것) 가 있으면
 *     wait     EX_i ≥ EX_p + 3
 *     forward  EX_i ≥ EX_p + 1 (산술) · EX_p + 2 (적재)
 *     none     제약 없음. ID(EX_i − 1) 가 WB(EX_p + 2) 보다 이르면 옛 값
 *   박자 = 마지막 EX + 2 · 멈춤 = 박자 − (n + 4)
 *   멈춘 명령어는 ID 에, 그 뒤는 IF 에 머문다 → IF 시작 = 앞의 ID 시작, ID 시작 = 앞의 EX
 *
 * ── 이벤트 (전부 silent 아님, phase 만 silent)
 *
 *   plan     { plan: number, rule: 'none'|'wait'|'forward', order: number[],
 *              reordered: boolean, columns: number }
 *            대처가 정해졌다. 행이 실행 순서로 자리를 옮긴다. columns = 네 대처 중 가장 긴 박자
 *            순서 바꿈이면 moved · before (프로그램 순번) · shared (건너뛴 것들과 함께 쓰는 레지스터 수)
 *   place    { index, pos, ifStart, idStart, ex }
 *            명령어 index(프로그램 순번) 가 실행 순서 pos 에 들어선다. ex 는 순서만 본 하한
 *   write    { index, pos, reg, value, correct, wb }
 *            WB 박자에 레지스터 파일에 쓴다. 쓰기는 박자 순서로 흘린다 — 뒤 명령어가 읽는
 *            박자보다 늦은 쓰기는 그 읽기 뒤에 온다 (옛 값을 읽는 자리가 화면에서 참이도록)
 *   lookup   { index, reg, producer }
 *            원천 reg 의 생산자를 찾았다 (실행 순서에서 앞선 것 중 가장 가까운)
 *   operand  { index, pos, slot: 'a'|'b', reg, producer, producerPos, producerEx,
 *              producerLoad: boolean, kind: 'wait'|'forward'|'stale'|'fresh',
 *              value, correct, readCycle, ex }
 *            원천 하나를 읽는다. ex 는 이 원천까지 본 EX (밀려난 자리)
 *   done     { rule, reordered, cycles, stalls, staleReads, written, wrong: { reg, value, correct }[] }
 *
 * ── phase (kind: 'issue' | 'find-producer' | 'wait' | 'forward' | 'stale-read' | 'finish')
 *
 * ── metrics
 *
 *   cycle-count       지금까지 놓인 명령어 중 마지막 WB 박자
 *   stall-count       cycle-count − (놓인 수 + 4)
 *   stale-read-count  옛 값을 읽은 원천 피연산자 수
 *
 *   셋 다 "지금 보이는 값" 을 들고 차이만 보낸다. 판이 바뀌면 0 으로 되돌린다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DataHazardRule = 'none' | 'wait' | 'forward';

export type DataHazardInstruction = {
  /** 어셈블리 글 — 자료라 번역하지 않는다. */
  text: string;
  op: 'lw' | 'add' | 'sub';
  dst: number;
  srcA: number;
  /** 없으면 −1. */
  srcB: number;
  /** 적재의 변위. 산술은 0. */
  offset: number;
};

export type DataHazardPlan = {
  rule: DataHazardRule;
  /** 실행 순서 — 프로그램 순번의 나열. 순서 바꿈은 컴파일러의 결정이라 자료다. */
  order: number[];
};

export type DataHazardData = {
  type: 'data-hazard';
  instructions: DataHazardInstruction[];
  /** 레지스터 번호 → 처음 값. 0 번은 쓰지 않는다. */
  registers: number[];
  memory: { address: number; value: number }[];
  /** 손잡이 값(0..) 마다의 계획. segments[].value 와 같은 사다리다. */
  plans: DataHazardPlan[];
  /** 처음 재생할 계획 — segments 의 default 와 같다. */
  plan: number;
  stepMs: number;
};

export type OperandKind = 'initial' | 'wait' | 'forward' | 'stale' | 'fresh';

export type OperandRead = {
  slot: 'a' | 'b';
  reg: number;
  /** 생산자의 프로그램 순번. 없으면 −1. */
  producer: number;
  /** 생산자의 실행 순서 자리. 없으면 −1. */
  producerPos: number;
  kind: OperandKind;
  /** 실제로 읽힌 값. */
  value: number;
  /** 프로그램 순서대로 돌렸을 때의 값. */
  correct: number;
  /** 읽는 박자 — ID 의 마지막 박자 (포워딩이면 EX 에서 받는다). */
  readCycle: number;
  /** 이 원천까지 본 EX. */
  exAfter: number;
};

export type ScheduledInstruction = {
  index: number;
  pos: number;
  ifStart: number;
  idStart: number;
  /** 순서만 본 EX 하한. */
  exOrder: number;
  ex: number;
  reads: OperandRead[];
  result: number;
  correct: number;
};

export type DataHazardSchedule = {
  rule: DataHazardRule;
  order: number[];
  reordered: boolean;
  rows: ScheduledInstruction[];
  cycles: number;
  stalls: number;
  staleReads: number;
  /** 끝난 뒤의 레지스터 파일. */
  registers: number[];
  /** 프로그램 순서대로 돌렸을 때의 레지스터 파일. */
  correctRegisters: number[];
  wrong: { reg: number; value: number; correct: number }[];
};

function readMemory(data: DataHazardData, address: number): number {
  for (const m of data.memory) if (m.address === address) return m.value;
  return 0;
}

function execute(data: DataHazardData, ins: DataHazardInstruction, a: number, b: number): number {
  if (ins.op === 'lw') return readMemory(data, a + ins.offset);
  if (ins.op === 'add') return a + b;
  return a - b;
}

/** 프로그램 순서대로 한 줄씩 — "옳은 값" 의 기준. */
function runSequential(data: DataHazardData): { results: number[]; registers: number[] } {
  const regs = data.registers.slice();
  const results: number[] = [];
  for (const ins of data.instructions) {
    const a = regs[ins.srcA] ?? 0;
    const b = ins.srcB >= 0 ? (regs[ins.srcB] ?? 0) : 0;
    const r = execute(data, ins, a, b);
    regs[ins.dst] = r;
    results.push(r);
  }
  return { results, registers: regs };
}

/**
 * 한 계획의 박자 표를 셈한다 — 순수 함수. 알고리즘과 검사가 함께 쓴다.
 */
export function scheduleDataHazard(data: DataHazardData, planIndex: number): DataHazardSchedule {
  const plan = data.plans[planIndex]!;
  const order = plan.order;
  const rule = plan.rule;
  const seq = runSequential(data);
  const rows: ScheduledInstruction[] = [];

  for (let i = 0; i < order.length; i += 1) {
    const index = order[i]!;
    const ins = data.instructions[index]!;
    const prev = rows[i - 1];
    const exOrder = prev ? prev.ex + 1 : 3;
    const ifStart = prev ? prev.idStart : 1;
    const idStart = prev ? prev.ex : 2;
    let ex = exOrder;
    const reads: OperandRead[] = [];

    const sources: ['a' | 'b', number][] = [['a', ins.srcA]];
    if (ins.srcB >= 0) sources.push(['b', ins.srcB]);

    // 순서 바꿈은 뜻을 바꾸지 않으므로 "옳은 값" 은 프로그램 순서의 생산자에서 온다.
    const correctOf = (reg: number): number => {
      let v = data.registers[reg] ?? 0;
      for (let k = 0; k < index; k += 1) {
        if (data.instructions[k]!.dst === reg) v = seq.results[k]!;
      }
      return v;
    };

    const values: number[] = [];
    for (const [slot, reg] of sources) {
      let p = -1;
      for (let j = 0; j < i; j += 1) {
        if (data.instructions[order[j]!]!.dst === reg) p = j;
      }
      const correct = correctOf(reg);
      if (p < 0) {
        const value = data.registers[reg] ?? 0;
        values.push(value);
        reads.push({ slot, reg, producer: -1, producerPos: -1, kind: 'initial', value, correct, readCycle: ex - 1, exAfter: ex });
        continue;
      }
      const prod = rows[p]!;
      const prodIns = data.instructions[prod.index]!;
      if (rule === 'wait') {
        ex = Math.max(ex, prod.ex + 3);
        values.push(prod.result);
        reads.push({ slot, reg, producer: prod.index, producerPos: p, kind: 'wait', value: prod.result, correct, readCycle: ex - 1, exAfter: ex });
      } else if (rule === 'forward') {
        ex = Math.max(ex, prod.ex + (prodIns.op === 'lw' ? 2 : 1));
        values.push(prod.result);
        reads.push({ slot, reg, producer: prod.index, producerPos: p, kind: 'forward', value: prod.result, correct, readCycle: ex, exAfter: ex });
      } else {
        const id = ex - 1;
        if (id < prod.ex + 2) {
          // 레지스터 파일에 그 박자까지 쓰인 것 중 가장 늦은 값 — 없으면 처음 값.
          let value = data.registers[reg] ?? 0;
          for (let q = 0; q < p; q += 1) {
            const w = rows[q]!;
            if (data.instructions[w.index]!.dst === reg && w.ex + 2 <= id) value = w.result;
          }
          values.push(value);
          reads.push({ slot, reg, producer: prod.index, producerPos: p, kind: 'stale', value, correct, readCycle: id, exAfter: ex });
        } else {
          values.push(prod.result);
          reads.push({ slot, reg, producer: prod.index, producerPos: p, kind: 'fresh', value: prod.result, correct, readCycle: id, exAfter: ex });
        }
      }
    }

    const result = execute(data, ins, values[0] ?? 0, values[1] ?? 0);
    rows.push({ index, pos: i, ifStart, idStart, exOrder, ex, reads, result, correct: seq.results[index]! });
  }

  const last = rows[rows.length - 1]!;
  const cycles = last.ex + 2;
  const stalls = cycles - (rows.length + 4);
  let staleReads = 0;
  for (const r of rows) for (const rd of r.reads) if (rd.kind === 'stale') staleReads += 1;

  const regs = data.registers.slice();
  for (const r of [...rows].sort((x, y) => x.ex - y.ex)) regs[data.instructions[r.index]!.dst] = r.result;

  const wrong: { reg: number; value: number; correct: number }[] = [];
  for (let reg = 0; reg < regs.length; reg += 1) {
    if (regs[reg] !== seq.registers[reg]) wrong.push({ reg, value: regs[reg]!, correct: seq.registers[reg]! });
  }

  const reordered = order.some((v, k) => v !== k);
  return { rule, order, reordered, rows, cycles, stalls, staleReads, registers: regs, correctRegisters: seq.registers, wrong };
}

/**
 * 순서 바꿈이 무엇을 옮겼는가 — 처음으로 자리가 어긋난 곳에서 앞당겨진 명령어(moved),
 * 원래 그 자리에 있던 명령어(before), 앞당겨진 명령어가 건너뛴 명령어들과 함께 쓰는
 * 레지스터 수(shared). 순서가 그대로면 셋 다 −1 · −1 · 0.
 */
export function reorderFacts(data: DataHazardData, order: number[]): { moved: number; before: number; shared: number } {
  let k = 0;
  while (k < order.length && order[k] === k) k += 1;
  if (k >= order.length) return { moved: -1, before: -1, shared: 0 };
  const moved = order[k]!;
  const regsOf = (i: DataHazardInstruction): number[] => [i.dst, i.srcA, i.srcB].filter((r) => r >= 0);
  const mine = new Set(regsOf(data.instructions[moved]!));
  const shared = new Set<number>();
  // 프로그램 순서에서 moved 앞에 있었으나 실행 순서에서 뒤로 밀린 것들
  for (let j = k + 1; j < order.length; j += 1) {
    const other = order[j]!;
    if (other >= moved) continue;
    for (const r of regsOf(data.instructions[other]!)) if (mine.has(r)) shared.add(r);
  }
  return { moved, before: k, shared: shared.size };
}

function readPlanValue(payload: unknown, count: number): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < 0 || v >= count) return null;
  return v;
}

export async function dataHazardAlgorithm(ctxBase: FacetContext<DataHazardData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<DataHazardData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown = new Map<string, number>();
  const gauge = (name: string, v: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === v) return;
    ctx.metric(name, v - (prev ?? 0));
    shown.set(name, v);
  };

  let columns = 0;
  for (let k = 0; k < data.plans.length; k += 1) columns = Math.max(columns, scheduleDataHazard(data, k).cycles);

  let planIndex = readPlanValue({ value: data.plan }, data.plans.length) ?? 0;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const s = scheduleDataHazard(data, planIndex);

      gauge('cycle-count', 0);
      gauge('stall-count', 0);
      gauge('stale-read-count', 0);
      await ctx.emit({
        type: 'plan',
        payload: {
          plan: planIndex,
          rule: s.rule,
          order: s.order.slice(),
          reordered: s.reordered,
          columns,
          ...reorderFacts(data, s.order),
        },
      });
      if (!(await ctx.sleep(stepMs))) return;

      let stale = 0;
      let written = 0;
      const pending: ScheduledInstruction[] = [];

      /** WB 박자가 `until` 이하인 쓰기를 박자 순서로 흘린다. */
      const flushWrites = async (until: number): Promise<boolean> => {
        pending.sort((x, y) => x.ex - y.ex);
        while (pending.length > 0 && pending[0]!.ex + 2 <= until) {
          if (ctx.cancelled) return false;
          const w = pending.shift()!;
          const ins = data.instructions[w.index]!;
          await ctx.emit({
            type: 'write',
            payload: { index: w.index, pos: w.pos, reg: ins.dst, value: w.result, correct: w.correct, wb: w.ex + 2 },
          });
          written += 1;
          if (!(await ctx.sleep(stepMs))) return false;
        }
        return true;
      };

      for (const row of s.rows) {
        if (ctx.cancelled) return;
        await phase('issue');
        await ctx.emit({
          type: 'place',
          payload: { index: row.index, pos: row.pos, ifStart: row.ifStart, idStart: row.idStart, ex: row.exOrder },
        });
        gauge('cycle-count', row.exOrder + 2);
        gauge('stall-count', row.exOrder + 2 - (row.pos + 1 + 4));
        if (!(await ctx.sleep(stepMs))) return;

        // 이 명령어가 읽는 박자까지 끝난 쓰기를 먼저 흘린다.
        if (!(await flushWrites(row.ex - 1))) return;

        for (const rd of row.reads) {
          if (ctx.cancelled) return;
          // 생산자가 없는 원천은 걸음을 두지 않는다 — 처음 값을 그대로 읽을 뿐이다.
          if (rd.producer < 0) continue;
          // 생산자 찾기를 한 걸음으로 세운다. 대처 phase 와 한 걸음에 겹치면 코드 패널에
          // 마지막 것만 남아 producerOf 가 한 번도 밝혀지지 않는다.
          await phase('find-producer');
          await ctx.emit({
            type: 'lookup',
            payload: { index: row.index, reg: rd.reg, producer: rd.producer },
          });
          if (!(await ctx.sleep(stepMs))) return;
          if (rd.kind === 'wait') await phase('wait');
          else if (rd.kind === 'forward') await phase('forward');
          else if (rd.kind === 'stale') await phase('stale-read');
          const prod = s.rows[rd.producerPos]!;
          await ctx.emit({
            type: 'operand',
            payload: {
              index: row.index,
              pos: row.pos,
              slot: rd.slot,
              reg: rd.reg,
              producer: rd.producer,
              producerPos: rd.producerPos,
              producerEx: prod.ex,
              producerLoad: data.instructions[prod.index]!.op === 'lw',
              kind: rd.kind,
              value: rd.value,
              correct: rd.correct,
              readCycle: rd.readCycle,
              ex: rd.exAfter,
            },
          });
          if (rd.kind === 'stale') stale += 1;
          gauge('cycle-count', rd.exAfter + 2);
          gauge('stall-count', rd.exAfter + 2 - (row.pos + 1 + 4));
          gauge('stale-read-count', stale);
          if (!(await ctx.sleep(stepMs))) return;
        }
        pending.push(row);
      }

      if (!(await flushWrites(Number.MAX_SAFE_INTEGER))) return;

      await phase('finish');
      gauge('cycle-count', s.cycles);
      gauge('stall-count', s.stalls);
      gauge('stale-read-count', s.staleReads);
      await ctx.emit({
        type: 'done',
        payload: {
          rule: s.rule,
          reordered: s.reordered,
          cycles: s.cycles,
          stalls: s.stalls,
          staleReads: s.staleReads,
          written,
          wrong: s.wrong.map((w) => ({ ...w })),
        },
      });

      // 입력을 기다린다 — 손잡이가 아닌 입력은 흘린다.
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'plan') continue;
        next = readPlanValue(input.payload, data.plans.length);
      }
      planIndex = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
