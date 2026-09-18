/**
 * branch-flush — 분기의 갈래를 틀리게 짐작하면 채운 것을 비운다.
 *
 * 다섯 단계 파이프라인(IF · ID · EX · MEM · WB)을 한 사이클씩 굴린다. 가져오기는
 * 언제나 "안 탄다" 로 짐작해 다음 주소를 가져오고, 분기 판정은 분기가 EX 에 있는
 * 사이클의 끝에 난다. 짐작이 틀렸으면 EX 앞의 칸(IF · ID)에 든 것을 버리고 그 칸을
 * 비우며, 다음 사이클에 목표 주소를 가져온다.
 *
 * 걸음표는 사람이 적은 배열이 아니라 이 셈의 결과다. 사이클 수 · 버린 것 · 끝난
 * 사이클 · 잃은 사이클은 전부 여기서 센다.
 *
 * 이벤트 (전부 silent 아님 — 하나하나가 걸음이다)
 *
 *   init     { program: Instr[]; registers: { name: string; value: number }[]; depth: number }
 *            명령어를 해독해 한 번 싣는다. Instr = { id; text; op; dest; srcs; label; target }
 *            (target 은 분기 목표 명령어의 순번, 분기가 아니면 null)
 *   cycle    { n: number; slots: Slot[]; pc: number }
 *            n 번째 사이클이 지난 뒤의 칸 차림. Slot = { i } (명령어 순번) | { b } (빈 칸 번호) | null
 *            pc 는 다음에 가져올 명령어 순번
 *   resolve  { at: number; a: number; b: number; taken: boolean; cycle: number }
 *            분기 at 이 EX 끝에서 판정됐다. a · b 는 비교한 두 레지스터 값
 *   flush    { dropped: { i: number; slot: number }[]; bubbles: { b: number; slot: number }[]; target: number }
 *            짐작이 틀려 EX 앞 칸의 명령어를 버리고 그 칸을 비웠다
 *   done     { lost: number; finish: number; last: number }
 *            잃은 사이클(비운 칸 수)과, 마지막으로 WB 를 지난 명령어(last)와 그 사이클(finish)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BranchFlushFacetData = {
  type: 'branch-flush';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 값이 알려진 레지스터. 분기 판정이 읽는다 */
  registers: { name: string; value: number }[];
  /** 명령어. text 는 어셈블리 표기 그대로, label 은 그 주소에 붙은 이름 */
  program: { id: string; text: string; label?: string }[];
};

export type Instr = {
  id: string;
  text: string;
  op: string;
  /** 결과를 쓰는 레지스터. 분기는 null */
  dest: string | null;
  srcs: string[];
  label: string | null;
  /** 분기 목표 명령어의 순번. 분기가 아니면 null */
  target: number | null;
};

export type Slot = { i: number } | { b: number } | null;

/** 단계 수와 판정이 나는 단계. 모형(공통 안내문)의 것이다 */
const DEPTH = 5;
const EX = 2;

/** 조건 분기 — 두 레지스터가 같으면 탄다 */
const BRANCH_OPS = new Set(['beq']);

function decode(
  raw: BranchFlushFacetData['program'][number],
  labels: Map<string, number>,
): Instr {
  const text = raw.text.trim();
  const space = text.search(/\s/);
  const op = (space < 0 ? text : text.slice(0, space)).toLowerCase();
  const args = space < 0 ? [] : text.slice(space + 1).split(',').map((s) => s.trim());
  if (BRANCH_OPS.has(op)) {
    const target = labels.get(args[2] ?? '');
    if (target === undefined) throw new Error(`branch-flush: 목표 이름 ${args[2]} 이 없다`);
    return { id: raw.id, text, op, dest: null, srcs: args.slice(0, 2), label: raw.label ?? null, target };
  }
  return { id: raw.id, text, op, dest: args[0] ?? null, srcs: args.slice(1), label: raw.label ?? null, target: null };
}

function isInstr(s: Slot): s is { i: number } {
  return s !== null && 'i' in s;
}

export async function branchFlush(context: FacetContext<BranchFlushFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BranchFlushFacetData>;
  const { stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const labels = new Map<string, number>();
  ctx.data.program.forEach((p, k) => {
    if (p.label) labels.set(p.label, k);
  });
  const program = ctx.data.program.map((p) => decode(p, labels));
  const registers = ctx.data.registers.map((r) => ({ name: r.name, value: r.value }));
  const regs = new Map(registers.map((r) => [r.name, r.value]));

  // 첫 걸음은 문 밖에 — 마운트 직후 빈 화면을 두지 않는다
  await ctx.emit({ type: 'init', payload: { program, registers, depth: DEPTH } });

  const slots: Slot[] = Array.from({ length: DEPTH }, () => null);
  let pc = 0;
  let n = 0;
  let bubbleSeq = 0;
  let lost = 0;
  let finish = 0;
  let last = 0;

  // 가져올 것이 남았거나, 다음 사이클에도 파이프 안에 남을 명령어가 있으면 한 사이클 더
  while (pc < program.length || slots.slice(0, DEPTH - 1).some(isInstr)) {
    if (!(await pause())) return;
    n += 1;
    slots.splice(DEPTH - 1, 1);
    slots.unshift(pc < program.length ? { i: pc } : null);
    if (pc < program.length) pc += 1;
    const wb = slots[DEPTH - 1] ?? null;
    if (isInstr(wb)) {
      finish = n;
      last = wb.i;
    }
    await ctx.emit({ type: 'cycle', payload: { n, slots: slots.map((s) => (s ? { ...s } : null)), pc } });

    const ex = slots[EX] ?? null;
    if (!isInstr(ex)) continue;
    const ins = program[ex.i];
    if (!ins || ins.target === null) continue;

    const a = regs.get(ins.srcs[0] ?? '');
    const b = regs.get(ins.srcs[1] ?? '');
    if (a === undefined || b === undefined) throw new Error(`branch-flush: ${ins.id} 가 읽는 레지스터 값이 없다`);
    const taken = a === b;
    if (!(await pause())) return;
    await ctx.emit({ type: 'resolve', payload: { at: ex.i, a, b, taken, cycle: n } });

    // 짐작은 언제나 "안 탄다" — 탔다면 틀린 것이다
    if (!taken) continue;
    if (!(await pause())) return;
    const dropped: { i: number; slot: number }[] = [];
    const bubbles: { b: number; slot: number }[] = [];
    for (let k = 0; k < EX; k += 1) {
      if (ctx.cancelled) return;
      const s = slots[k] ?? null;
      if (isInstr(s)) dropped.push({ i: s.i, slot: k });
      slots[k] = { b: bubbleSeq };
      bubbles.push({ b: bubbleSeq, slot: k });
      bubbleSeq += 1;
      lost += 1;
    }
    pc = ins.target;
    await ctx.emit({ type: 'flush', payload: { dropped, bubbles, target: ins.target } });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { lost, finish, last } });
}
