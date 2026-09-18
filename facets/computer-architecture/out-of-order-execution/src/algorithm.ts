/**
 * 비순차 실행 — 창이 넓으면 준비된 뒤 명령어가 앞을 앞질러 시작하고, 커밋은 끝까지 원래 순서다.
 *
 * 규약 (한 박자 안의 순서)
 *   1. 커밋 — 가장 오래된 것부터 순서대로. 끝난 박자 **다음 박자부터**. 한 박자에 여럿 가능.
 *   2. 시작 — 창(커밋 안 된 것 중 가장 오래된 w 개) 안을 오래된 것부터 훑어 준비된 것을 폭 개까지.
 *      준비 = 생산자가 모두 시작했고 그 끝난 박자 < 지금 박자.
 *   끝난 박자 = 시작 + 지연 − 1. 생산자 = 앞 명령어 중 가장 가까운, 그 원천을 쓰는 것.
 *   박자 = 마지막 커밋 박자. IPC % = (n*100 + 박자//2) // 박자.
 *   앞지름 = 자기보다 오래된 것 중 나중에 시작한 것이 있는 명령어 수.
 *
 * 이벤트 (전부 silent 아님 — phase 만 silent)
 *   run-begin  { window: number; width: number; count: number; rulerCycles: number }
 *              한 판의 시작. rulerCycles 는 사다리 전체에서 가장 긴 박자 수 (눈금 자리).
 *   cycle      { cycle: number; oldest: number; windowEnd: number }
 *              박자 하나의 시작. oldest..windowEnd-1 이 이번 박자 시작 판정의 창 (커밋 뒤).
 *   commit     { index: number; cycle: number }
 *   issue      { index: number; cycle: number; rank: number; done: number; passed: number[] }
 *              rank = 이 판에서 몇 번째로 시작했는가 (0 부터). passed = 아직 시작 못 한 앞 명령어들.
 *   complete   { index: number; cycle: number }   실행이 이 박자 끝에 끝났다 (done === cycle).
 *   run-end    { cycles: number; ipcPercent: number; overtakes: number }
 *   phase      { phase } silent
 *
 * phase 어휘: 'advance-cycle' | 'commit' | 'check-ready' | 'issue' | 'finish'
 *
 * 메트릭 (지금 보이는 값을 들고 차이만 보낸다 — 판이 바뀌어도 쌓이지 않는다)
 *   cycle-count     지금 박자 (판이 끝나면 마지막 커밋 박자)
 *   ipc-percent     판이 끝나면 셈한다. 도중에는 0
 *   overtake-count  앞지른 명령어 수
 *
 * 입력: 'window' { value: number } — 사다리(data.windows)에 든 값만 받는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OutOfOrderExecutionData = {
  type: 'out-of-order-execution';
  /** 명령어 글. 첫 레지스터가 목적지, 나머지가 원천이다 (자료 — 번역하지 않는다). */
  instructions: string[];
  /** 연산 이름 → 실행 지연(박자). */
  latency: Record<string, number>;
  /** 손잡이 사다리 — facet.ts 의 segments[].value 와 같다. */
  windows: number[];
  /** 처음 창 크기 — segments 의 default 와 같다. */
  initialWindow: number;
  /** 한 박자에 시작할 수 있는 수. */
  width: number;
  /** 박자 하나의 재생 간격(ms). */
  stepMs: number;
};

export type DecodedInstruction = {
  op: string;
  dst: number;
  srcs: number[];
  latency: number;
};

/** 명령어 글 하나를 연산 · 목적지 · 원천 · 지연으로 푼다. 이 데이터에는 저장(store)이 없다. */
export function decodeInstruction(asm: string, latency: Record<string, number>): DecodedInstruction {
  const op = asm.trim().split(/\s+/)[0] ?? '';
  const regs = [...asm.matchAll(/r(\d+)/g)].map((m) => Number(m[1]));
  const lat = latency[op];
  if (typeof lat !== 'number' || regs.length === 0) {
    throw new Error(`명령어를 풀 수 없다: ${asm}`);
  }
  return { op, dst: regs[0]!, srcs: regs.slice(1), latency: lat };
}

export type OutOfOrderIssue = { index: number; rank: number; done: number; passed: number[] };

export type OutOfOrderStep = {
  cycle: number;
  oldest: number;
  windowEnd: number;
  commits: number[];
  issues: OutOfOrderIssue[];
  completes: number[];
};

export type OutOfOrderResult = {
  start: number[];
  done: number[];
  commit: number[];
  cycles: number;
  ipcPercent: number;
  overtakes: number;
  trace: OutOfOrderStep[];
};

/** 박자 수가 이것을 넘으면 규약이 어긋난 것이다 — 끝없는 루프를 막는다. */
const CYCLE_LIMIT = 1000;

/** 한 판을 셈한다. algorithm 과 검사가 같이 쓴다 (ctx 를 받지 않는 순수 함수 — C8 예외). */
export function simulateOutOfOrder(data: OutOfOrderExecutionData, window: number): OutOfOrderResult {
  const ins = data.instructions.map((a) => decodeInstruction(a, data.latency));
  const n = ins.length;
  const producerOf = (reg: number, before: number): number => {
    let p = -1;
    for (let j = 0; j < before; j += 1) if (ins[j]!.dst === reg) p = j;
    return p;
  };
  const start = new Array<number>(n).fill(0);
  const done = new Array<number>(n).fill(0);
  const commit = new Array<number>(n).fill(0);
  const trace: OutOfOrderStep[] = [];
  let oldest = 0;
  let cycle = 0;
  let rank = 0;
  while (oldest < n) {
    cycle += 1;
    if (cycle > CYCLE_LIMIT) throw new Error('박자가 끝나지 않는다');
    const commits: number[] = [];
    while (oldest < n && start[oldest]! > 0 && done[oldest]! < cycle) {
      commit[oldest] = cycle;
      commits.push(oldest);
      oldest += 1;
    }
    const windowEnd = Math.min(oldest + window, n);
    const issues: OutOfOrderIssue[] = [];
    for (let i = oldest; i < windowEnd; i += 1) {
      if (start[i]! !== 0 || issues.length >= data.width) continue;
      const ready = ins[i]!.srcs.every((reg) => {
        const p = producerOf(reg, i);
        return p < 0 || (start[p]! > 0 && done[p]! < cycle);
      });
      if (!ready) continue;
      start[i] = cycle;
      done[i] = cycle + ins[i]!.latency - 1;
      const passed: number[] = [];
      for (let j = 0; j < i; j += 1) if (start[j] === 0) passed.push(j);
      issues.push({ index: i, rank, done: done[i]!, passed });
      rank += 1;
    }
    const completes: number[] = [];
    for (let i = 0; i < n; i += 1) if (start[i]! > 0 && done[i] === cycle) completes.push(i);
    trace.push({ cycle, oldest, windowEnd, commits, issues, completes });
  }
  let overtakes = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (start[j]! > start[i]!) {
        overtakes += 1;
        break;
      }
    }
  }
  const ipcPercent = Math.floor((n * 100 + Math.floor(cycle / 2)) / cycle);
  return { start, done, commit, cycles: cycle, ipcPercent, overtakes, trace };
}

function readWindow(payload: unknown, ladder: number[]): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number' || !ladder.includes(value)) return null;
  return value;
}

export async function outOfOrderExecutionAlgorithm(
  base: FacetContext<OutOfOrderExecutionData>,
): Promise<void> {
  const ctx = base as ReactiveContext<OutOfOrderExecutionData>;
  const data = ctx.data;
  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 지금 보이는 값. 계기는 더하기만 하므로 차이를 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    ctx.metric(name, prev === undefined ? value : value - prev);
  };

  const rulerCycles = Math.max(...data.windows.map((w) => simulateOutOfOrder(data, w).cycles));

  /** 한 판을 재생한다. 끝까지 갔으면 true, 취소됐으면 false. */
  async function playRun(window: number): Promise<boolean> {
    const sim = simulateOutOfOrder(data, window);
    gauge('cycle-count', 0);
    gauge('ipc-percent', 0);
    gauge('overtake-count', 0);
    await ctx.emit({
      type: 'run-begin',
      payload: { window, width: data.width, count: data.instructions.length, rulerCycles },
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    let overtakes = 0;
    for (const step of sim.trace) {
      if (ctx.cancelled) return false;
      // 한 박자를 걸음 둘 또는 셋으로 나눈다 — 걸음 경계는 sleep 뿐이고 코드 패널은
      // 마지막 phase 만 남기므로, 나누지 않으면 커밋 루프가 한 번도 켜지지 않는다.
      //   ① 박자 시작 + 커밋   ② 준비 판정 + 시작   ③ 끝남 (있을 때만)
      const parts = step.completes.length > 0 ? 3 : 2;
      const part = Math.round(data.stepMs / parts);

      // ① 박자 시작. 커밋이 있으면 그 박자의 첫 걸음은 커밋 루프를 비춘다.
      await phase('advance-cycle');
      gauge('cycle-count', step.cycle);
      await ctx.emit({
        type: 'cycle',
        payload: { cycle: step.cycle, oldest: step.oldest, windowEnd: step.windowEnd },
      });
      if (step.commits.length > 0) await phase('commit');
      for (const index of step.commits) {
        // 한 박자 안의 커밋 여럿은 한 걸음이다 — 문을 두지 않고 여기서 취소를 본다.
        if (ctx.cancelled) return false;
        await ctx.emit({ type: 'commit', payload: { index, cycle: step.cycle } });
      }
      if (!(await ctx.sleep(part))) return false;

      // ② 창 안을 훑어 준비된 것을 시작한다.
      await phase('check-ready');
      for (const issue of step.issues) {
        // 한 박자 안의 시작 여럿도 한 걸음이다.
        if (ctx.cancelled) return false;
        await phase('issue');
        if (issue.passed.length > 0) {
          overtakes += 1;
          gauge('overtake-count', overtakes);
        }
        await ctx.emit({
          type: 'issue',
          payload: {
            index: issue.index,
            cycle: step.cycle,
            rank: issue.rank,
            done: issue.done,
            passed: issue.passed,
          },
        });
      }
      if (!(await ctx.sleep(part))) return false;

      // ③ 끝남은 박자의 끝이다 — 따로 걸음을 두어, 같은 박자에 시작하고 끝나는 지연 1
      // 명령어가 실행 줄에 서는 모습이 지워지지 않게 한다.
      if (step.completes.length === 0) continue;
      for (const index of step.completes) {
        if (ctx.cancelled) return false;
        await ctx.emit({ type: 'complete', payload: { index, cycle: step.cycle } });
      }
      if (!(await ctx.sleep(data.stepMs - 2 * part))) return false;
    }
    await phase('finish');
    gauge('ipc-percent', sim.ipcPercent);
    await ctx.emit({
      type: 'run-end',
      payload: { cycles: sim.cycles, ipcPercent: sim.ipcPercent, overtakes: sim.overtakes },
    });
    return true;
  }

  let window = data.initialWindow;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun(window))) return;
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'window') continue;
        next = readWindow(input.payload, data.windows);
      }
      window = next;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    if (!ctx.cancelled) throw err;
  }
}
