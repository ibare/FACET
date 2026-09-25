/**
 * 가상 메모리와 스래싱 — 프레임 12 를 박고 프로세스 수를 돌리며 CPU 이용률을 틱 단위로 잰다.
 *
 * 모형 (한 틱 안에서 이 차례):
 *   ① 디스크가 일을 마치면 그 페이지를 프레임에 올린다. 빈 프레임은 번호 낮은 것부터, 없으면 모든 프로세스를
 *      통틀어 마지막 쓴 때가 가장 이른 프레임을 비우고 그 자리에(전역 LRU). 동률이면 번호 낮은 프레임 —
 *      이 데이터의 열다섯 판에서 동률은 한 번도 걸리지 않는다(`simulateVirtualMemory` 의 `lruTies` 가 센다).
 *      올린 페이지의 마지막 쓴 때 = 지금. 기다리던 프로세스는 준비 줄 끝으로
 *   ② 디스크가 놀고 디스크 줄에 요청이 있으면 맨 앞 것을 시작 (faultTicks 틱)
 *   ③ 입출력 중인 프로세스의 남은 틱을 하나 줄이고, 0 이 된 것을 번호 차례로 준비 줄 끝에
 *   ④ CPU — 준비 줄 맨 앞을 꺼낸다. 다음 페이지(참조 번호 % 작업 집합)가 프레임에 있으면 한 틱 쓴다(쓸모 있는 틱).
 *      refsPerBurst 번째 참조마다 입출력(ioTicks 틱)에 들어가고, 아니면 준비 줄 끝으로. 없으면 폴트 — 그 틱은 잃고
 *      요청이 디스크 줄 끝에 선다. 준비 줄이 비었으면 CPU 는 논다
 *   처음: 프레임은 모두 비었고, 프로세스는 모두 준비 줄에 번호 차례로, 참조 번호 0.
 *   CPU 이용률 = (쓸모 있는 틱 × 100 + 지난 틱 // 2) // 지난 틱 (반올림 정수).
 *
 * 이벤트 (silent 없음 — 둘 다 걸음이다. phase 는 내지 않는다: IR 과 코드 패널이 없다)
 *   'run-start'  판 시작 (#0). payload:
 *       { procCount: number, workingSet: number, frames: number, ticks: number, chunkTicks: number,
 *         processes: string[]            — 이 판에 오른 프로세스 식별자 (p1..)
 *         ladder: number[]               — procLadder
 *         curve: number[] }              — ladder 의 프로세스 수마다 지금 작업 집합으로 셈한 판 끝 이용률 (%)
 *   'chunk'      걸음 하나 = chunkTicks 틱. payload:
 *       { step: number (1 부터), from: number, to: number,
 *         cpu: { kind: 'run' | 'fault' | 'idle', proc: number }[]   — 틱마다. proc 는 0.. 색인, idle 이면 -1
 *         disk: number[]                                           — 틱마다 올리는 중인 프로세스 색인, 놀면 -1
 *         loads: { tick, frame, proc, page, evictedProc, evictedPage }[]  — 올림 차례대로, 밀어냄 없으면 evicted* = -1
 *         useful: number, faults: number, evicted: number           — 판 처음부터 지금까지
 *         queue: number                                            — 디스크 줄(올리는 중인 하나 포함)
 *         usePct: number }                                         — 지금까지의 이용률
 *
 * 계기 (판이 시작할 때 셋 다 0 으로 되돌리고, 걸음마다 지금 값과의 차이만 보낸다)
 *   useful-ticks  쓸모 있는 틱 (누적)
 *   page-faults   폴트 (누적)
 *   cpu-use       지금까지의 CPU 이용률 %
 *
 * 손잡이 — procCount (procLadder), workingSet (wsLadder). 한 판을 끝까지 재생한 뒤 waitForInput 으로 받는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type VirtualMemoryData = {
  type: 'virtual-memory';
  stepMs: number;
  motionMs: number;
  frames: number;
  ticks: number;
  chunkTicks: number;
  refsPerBurst: number;
  ioTicks: number;
  faultTicks: number;
  processes: string[];
  procLadder: number[];
  wsLadder: number[];
  procCount: number;
  workingSet: number;
};

export type CpuTick = { kind: 'run' | 'fault' | 'idle'; proc: number };

export type FrameLoad = {
  tick: number;
  frame: number;
  proc: number;
  page: number;
  evictedProc: number;
  evictedPage: number;
};

export type VmChunk = {
  step: number;
  from: number;
  to: number;
  cpu: CpuTick[];
  disk: number[];
  loads: FrameLoad[];
  useful: number;
  faults: number;
  evicted: number;
  queue: number;
  usePct: number;
};

export type VmRun = {
  useful: number;
  faults: number;
  evicted: number;
  lruTies: number;
  diskBusy: number;
  idle: number;
  usePct: number;
  chunks: VmChunk[];
};

/** 반올림 백분율 — 정수로만 셈한다. */
export function percent(x: number, n: number): number {
  if (!(n > 0)) throw new Error(`virtual-memory: 백분율의 분모가 0 이하다 (${n})`);
  return Math.floor((x * 100 + Math.floor(n / 2)) / n);
}

function assertModel(d: VirtualMemoryData): void {
  const ints: [string, number][] = [
    ['frames', d.frames],
    ['ticks', d.ticks],
    ['chunkTicks', d.chunkTicks],
    ['refsPerBurst', d.refsPerBurst],
    ['ioTicks', d.ioTicks],
    ['faultTicks', d.faultTicks],
  ];
  for (const [k, v] of ints) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      throw new Error(`virtual-memory: ${k} 는 양의 정수여야 한다 (${String(v)})`);
    }
  }
  if (d.ticks % d.chunkTicks !== 0) {
    throw new Error(`virtual-memory: ticks(${d.ticks}) 가 chunkTicks(${d.chunkTicks}) 로 나누어떨어지지 않는다`);
  }
}

/** 한 판 전체를 틱 단위로 셈한다. 화면 · 계기 · 곡선의 값이 모두 여기서 나온다. */
export function simulateVirtualMemory(d: VirtualMemoryData, n: number, ws: number): VmRun {
  assertModel(d);
  if (!d.procLadder.includes(n)) throw new Error(`virtual-memory: 프로세스 수 ${n} 이 사다리 [${d.procLadder.join(', ')}] 밖이다`);
  if (!d.wsLadder.includes(ws)) throw new Error(`virtual-memory: 작업 집합 ${ws} 이 사다리 [${d.wsLadder.join(', ')}] 밖이다`);
  if (n > d.processes.length) throw new Error(`virtual-memory: 프로세스 ${n} 개에 식별자가 ${d.processes.length} 개뿐이다`);

  const F = d.frames;
  const fProc: number[] = new Array<number>(F).fill(-1);
  const fPage: number[] = new Array<number>(F).fill(-1);
  const fUsed: number[] = new Array<number>(F).fill(0);
  const pos: number[] = new Array<number>(n).fill(0);
  const since: number[] = new Array<number>(n).fill(0);
  const state: ('ready' | 'io' | 'fault')[] = new Array<'ready' | 'io' | 'fault'>(n).fill('ready');
  const timer: number[] = new Array<number>(n).fill(0);
  const ready: number[] = [];
  for (let i = 0; i < n; i += 1) ready.push(i);
  const diskQ: { proc: number; page: number }[] = [];
  let busy: { proc: number; page: number } | null = null;
  let left = 0;
  let useful = 0;
  let faults = 0;
  let evicted = 0;
  let lruTies = 0;
  let diskBusy = 0;
  let idle = 0;

  const chunks: VmChunk[] = [];
  let cpu: CpuTick[] = [];
  let disk: number[] = [];
  let loads: FrameLoad[] = [];

  for (let tick = 0; tick < d.ticks; tick += 1) {
    // ① 디스크가 일을 마친다
    if (busy !== null) {
      left -= 1;
      if (left === 0) {
        const { proc, page } = busy;
        let slot = -1;
        for (let f = 0; f < F; f += 1) {
          if (slot === -1 && fProc[f] === -1) slot = f;
        }
        let evProc = -1;
        let evPage = -1;
        if (slot === -1) {
          slot = 0;
          for (let f = 1; f < F; f += 1) {
            if (fUsed[f]! < fUsed[slot]!) slot = f;
          }
          let same = 0;
          for (let f = 0; f < F; f += 1) if (fUsed[f] === fUsed[slot]) same += 1;
          if (same > 1) lruTies += 1;
          evProc = fProc[slot]!;
          evPage = fPage[slot]!;
          evicted += 1;
        }
        fProc[slot] = proc;
        fPage[slot] = page;
        fUsed[slot] = tick;
        loads.push({ tick, frame: slot, proc, page, evictedProc: evProc, evictedPage: evPage });
        if (state[proc] !== 'fault') throw new Error(`virtual-memory: 틱 ${tick} 에 올린 페이지의 프로세스 ${proc} 가 폴트로 기다리지 않았다`);
        state[proc] = 'ready';
        ready.push(proc);
        busy = null;
      }
    }
    // ② 디스크가 다음 요청을 시작한다
    if (busy === null && diskQ.length > 0) {
      busy = diskQ.shift()!;
      left = d.faultTicks;
    }
    disk.push(busy !== null ? busy.proc : -1);
    if (busy !== null) diskBusy += 1;
    // ③ 입출력 타이머
    for (let i = 0; i < n; i += 1) {
      if (state[i] === 'io') {
        timer[i] = timer[i]! - 1;
        if (timer[i] === 0) {
          state[i] = 'ready';
          ready.push(i);
        }
      }
    }
    // ④ CPU
    const i = ready.shift();
    if (i === undefined) {
      cpu.push({ kind: 'idle', proc: -1 });
      idle += 1;
    } else {
      const page = pos[i]! % ws;
      let at = -1;
      for (let f = 0; f < F; f += 1) {
        if (fProc[f] === i && fPage[f] === page) at = f;
      }
      if (at >= 0) {
        fUsed[at] = tick;
        pos[i] = pos[i]! + 1;
        useful += 1;
        since[i] = since[i]! + 1;
        cpu.push({ kind: 'run', proc: i });
        if (since[i] === d.refsPerBurst) {
          since[i] = 0;
          state[i] = 'io';
          timer[i] = d.ioTicks;
        } else {
          ready.push(i);
        }
      } else {
        faults += 1;
        state[i] = 'fault';
        diskQ.push({ proc: i, page });
        cpu.push({ kind: 'fault', proc: i });
      }
    }

    if ((tick + 1) % d.chunkTicks === 0) {
      const to = tick + 1;
      chunks.push({
        step: chunks.length + 1,
        from: to - d.chunkTicks,
        to,
        cpu,
        disk,
        loads,
        useful,
        faults,
        evicted,
        queue: diskQ.length + (busy !== null ? 1 : 0),
        usePct: percent(useful, to),
      });
      cpu = [];
      disk = [];
      loads = [];
    }
  }

  return { useful, faults, evicted, lruTies, diskBusy, idle, usePct: percent(useful, d.ticks), chunks };
}

/** 지금 작업 집합으로, 사다리의 프로세스 수마다 판 끝 이용률. */
export function utilizationCurve(d: VirtualMemoryData, ws: number): number[] {
  return d.procLadder.map((n) => simulateVirtualMemory(d, n, ws).usePct);
}

export async function virtualMemoryAlgorithm(baseCtx: FacetContext<VirtualMemoryData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<VirtualMemoryData>;
  const d = ctx.data;
  if (!d.procLadder.includes(d.procCount)) throw new Error(`virtual-memory: 첫 procCount ${d.procCount} 이 사다리 밖이다`);
  if (!d.wsLadder.includes(d.workingSet)) throw new Error(`virtual-memory: 첫 workingSet ${d.workingSet} 이 사다리 밖이다`);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다
  const shown = { useful: 0, faults: 0, use: 0 };
  let firstShow = true;
  const show = (useful: number, faults: number, use: number): void => {
    const force = firstShow;
    firstShow = false;
    if (force || useful !== shown.useful) ctx.metric('useful-ticks', useful - shown.useful);
    if (force || faults !== shown.faults) ctx.metric('page-faults', faults - shown.faults);
    if (force || use !== shown.use) ctx.metric('cpu-use', use - shown.use);
    shown.useful = useful;
    shown.faults = faults;
    shown.use = use;
  };

  const pace = d.stepMs + d.motionMs;
  let n = d.procCount;
  let ws = d.workingSet;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = simulateVirtualMemory(d, n, ws);
      await ctx.emit({
        type: 'run-start',
        payload: {
          procCount: n,
          workingSet: ws,
          frames: d.frames,
          ticks: d.ticks,
          chunkTicks: d.chunkTicks,
          processes: d.processes.slice(0, n),
          ladder: d.procLadder.slice(),
          curve: utilizationCurve(d, ws),
        },
      });
      show(0, 0, 0);
      if (!(await ctx.sleep(pace))) return;

      for (const c of run.chunks) {
        if (ctx.cancelled) return;
        await ctx.emit({ type: 'chunk', payload: c });
        show(c.useful, c.faults, c.usePct);
        if (!(await ctx.sleep(pace))) return;
      }

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'procCount' && input.type !== 'workingSet') continue;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') throw new Error(`virtual-memory: ${input.type} 입력의 value 가 수가 아니다`);
        if (input.type === 'procCount') {
          if (!d.procLadder.includes(value)) throw new Error(`virtual-memory: procCount ${value} 이 사다리 밖이다`);
          n = value;
        } else {
          if (!d.wsLadder.includes(value)) throw new Error(`virtual-memory: workingSet ${value} 이 사다리 밖이다`);
          ws = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
