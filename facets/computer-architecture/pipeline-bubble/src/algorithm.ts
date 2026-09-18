/**
 * 파이프라인 거품 — 포워딩으로도 못 메우는 틈이 빈 칸이 되어 흘러가는 것을 보인다.
 *
 * 다섯 단계(IF · ID · EX · MEM · WB)를 사이클마다 한 칸씩 민다. 규약은 사양의 것이다.
 *   - 포워딩은 MEM/WB → EX 만 있다
 *   - 적재(lw) 값은 MEM 끝에 나온다. 그래서 적재가 EX 에 있고 바로 뒤 명령어가 ID 에서
 *     그 값을 읽으려 하면 한 사이클 멈춘다 — ID 와 IF 는 머물고 EX 로 빈 칸이 들어간다
 *   - 레지스터 파일은 앞 반에 쓰고 뒤 반에 읽는다
 * 사이클 표는 이 규약에서 셈한다. 값(적재 값 · 더한 값)은 준 레지스터 · 메모리에서 셈하고,
 * 준 적이 없는 레지스터가 끼면 셈하지 않는다(null).
 *
 * 자리 이름: 명령어는 `i<순번>`, 빈 칸은 `b<순번>`. 단계 순서는 IF · ID · EX · MEM · WB.
 *
 * 이벤트 (전부 silent 아님 — 하나하나가 걸음이다)
 *   init   { instrs: { op, rd, rs: string[], imm: number | null }[] }
 *          가져오기를 기다리는 명령어들. 파이프라인은 비어 있다
 *   cycle  { cycle: number,
 *            slots: (string | null)[5],        이번 사이클에 각 단계에 선 것
 *            queue: string[],                  아직 가져오지 않은 명령어
 *            stalled: boolean,                 이번 사이클에 멈췄는가 (빈 칸이 EX 로 들어왔는가)
 *            held: string[],                   멈춰서 제자리에 머문 것
 *            hazard: { prod: string, cons: string, reg: string } | null   멈춘 까닭
 *            forward: { prod: string, cons: string, reg: string, value: number | null,
 *                       rd: string, result: number | null } | null         MEM/WB → EX 로 건넨 값
 *            retired: { who: string, cycle: number } | null }             WB 를 막 떠난 것과 그 사이클
 *   done   { retired: { who: string, cycle: number } | null,
 *            end: number,      마지막 명령어가 WB 를 마친 사이클
 *            ideal: number,    멈춤이 없었다면 마쳤을 사이클 (명령어 수 + 단계 수 − 1)
 *            stalls: number }  멈춘 사이클 수 (들어간 빈 칸 수)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PipelineOp = 'lw' | 'add' | 'sub' | 'or';

export type PipelineInstr = {
  op: PipelineOp;
  rd: string;
  /** 읽는 레지스터. lw 는 바탕 레지스터 하나 */
  rs: string[];
  /** lw 의 변위. 셈 명령어는 없다 */
  imm?: number;
};

export type PipelineBubbleFacetData = {
  type: 'pipeline-bubble';
  stepMs: number;
  instrs: PipelineInstr[];
  /** 처음부터 값이 알려진 레지스터 */
  regs: Record<string, number>;
  /** 주소 → 값 */
  memory: Record<string, number>;
};

export const PIPELINE_STAGES = 5;

type Slot = string | null;

/** 프로그램 순서대로 값을 셈한다. 알 수 없는 레지스터가 끼면 null. */
function resultsOf(data: PipelineBubbleFacetData): (number | null)[] {
  const known = new Map<string, number>(Object.entries(data.regs));
  return data.instrs.map((ins) => {
    const vals = ins.rs.map((r) => known.get(r));
    let v: number | null = null;
    if (vals.every((x): x is number => x !== undefined)) {
      const [a, b] = vals as number[];
      if (ins.op === 'lw') {
        const m = data.memory[String((a ?? 0) + (ins.imm ?? 0))];
        v = m === undefined ? null : m;
      } else if (a !== undefined && b !== undefined) {
        if (ins.op === 'add') v = a + b;
        else if (ins.op === 'sub') v = a - b;
        else v = a | b;
      }
    }
    if (v === null) known.delete(ins.rd);
    else known.set(ins.rd, v);
    return v;
  });
}

const idx = (who: Slot): number | null =>
  who !== null && who.startsWith('i') ? Number(who.slice(1)) : null;

export async function pipelineBubble(ctx: FacetContext<PipelineBubbleFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<PipelineBubbleFacetData>;
  const data = rc.data;
  const stepMs = data.stepMs;
  const instrs = data.instrs;
  const results = resultsOf(data);

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  await rc.emit({
    type: 'init',
    payload: {
      instrs: instrs.map((ins) => ({ op: ins.op, rd: ins.rd, rs: [...ins.rs], imm: ins.imm ?? null })),
    },
  });

  let slots: Slot[] = Array.from({ length: PIPELINE_STAGES }, () => null);
  const queue: string[] = instrs.map((_, i) => `i${i}`);
  let bubbles = 0;
  let cycle = 0;

  while (queue.length > 0 || slots.some((s) => s !== null)) {
    if (!(await pause())) return;
    const [fetch, decode, exec, mem, wb] = slots as [Slot, Slot, Slot, Slot, Slot];
    const retired = wb === null ? null : { who: wb, cycle };

    // 적재-사용 위험: EX 의 lw 가 쓸 레지스터를 ID 의 명령어가 읽는다
    const d = idx(decode);
    const e = idx(exec);
    let hazard: { prod: string; cons: string; reg: string } | null = null;
    if (d !== null && e !== null) {
      const prod = instrs[e];
      const cons = instrs[d];
      if (prod && cons && prod.op === 'lw' && cons.rs.includes(prod.rd)) {
        hazard = { prod: `i${e}`, cons: `i${d}`, reg: prod.rd };
      }
    }

    let held: string[] = [];
    if (hazard) {
      slots = [fetch, decode, `b${bubbles}`, exec, mem];
      bubbles += 1;
      held = [decode, fetch].filter((s): s is string => s !== null);
    } else {
      slots = [queue.shift() ?? null, fetch, decode, exec, mem];
    }
    cycle += 1;

    if (slots.every((s) => s === null)) {
      await rc.emit({
        type: 'done',
        payload: { retired, end: cycle - 1, ideal: instrs.length + PIPELINE_STAGES - 1, stalls: bubbles },
      });
      return;
    }

    // MEM/WB → EX 포워딩: WB 의 명령어가 쓸 레지스터를 EX 의 명령어가 읽는다
    let forward: {
      prod: string;
      cons: string;
      reg: string;
      value: number | null;
      rd: string;
      result: number | null;
    } | null = null;
    const x = idx(slots[2] ?? null);
    const p = idx(slots[4] ?? null);
    if (x !== null && p !== null) {
      const prod = instrs[p];
      const cons = instrs[x];
      if (prod && cons && cons.rs.includes(prod.rd)) {
        forward = {
          prod: `i${p}`,
          cons: `i${x}`,
          reg: prod.rd,
          value: results[p] ?? null,
          rd: cons.rd,
          result: results[x] ?? null,
        };
      }
    }

    await rc.emit({
      type: 'cycle',
      payload: {
        cycle,
        slots: [...slots],
        queue: [...queue],
        stalled: hazard !== null,
        held,
        hazard,
        forward,
        retired,
      },
    });
  }
}
