/**
 * swapInOut — 메모리가 가득 찼을 때 기다리는 프로세스를 통째로 디스크로 내려보내고,
 * 나중에 빈 자리로 다시 올리는 스와핑.
 *
 * 값은 모두 예로 정한 것이다. 사용자 메모리 크기 · 자리 · 프로세스 · 일의 차례는 실제
 * 시스템에서 잰 것이 아니다. 크기 단위는 KiB.
 *
 * 규약 (사양 그대로)
 *   - 메모리는 같은 크기의 자리로 나뉜다 (자리 수 = memoryKiB / slotKiB). 프로세스 하나가 자리 하나.
 *     프로세스 크기가 자리 크기와 다르면 던진다.
 *   - 빈 자리는 번호가 낮은 것부터 채운다.
 *   - 내려보낼 프로세스 = 메모리에 있는 **기다림** 상태인 것. 둘 이상이면 가장 오래 기다린 것.
 *     실행 · 준비인 것은 내려보내지 않는다. 기다리는 것이 없으면 들어올 것은 제자리에서 기다린다.
 *   - 메모리 밖(디스크 · 막 도착)에 있는 준비된 프로세스는 자리가 나는 즉시 올라온다.
 *     디스크에 있는 것이 먼저, 그다음 막 도착한 것. 각각 먼저 온 차례.
 *   - 프로세스 단위로 통째 오간다 (페이지 단위가 아니다).
 *   - 셈할 수 없는 일(모르는 프로세스 · 기다리지 않는데 입출력 끝 · 메모리에 없는데 끝남)은 던진다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 *   arrive   { pid: string; free: number }
 *            — 새 프로세스가 준비 상태로 도착했다. free = 그때 빈 자리 수.
 *   swapOut  { pid: string; slot: number; diskIndex: number }
 *            — 기다리던 pid 가 자리 slot 에서 디스크로 내려갔다. diskIndex = 디스크 줄에서 선 자리.
 *   swapIn   { pid: string; slot: number; from: 'arrival' | 'disk'; fromIndex: number }
 *            — pid 가 from 줄의 fromIndex 번째에서 자리 slot 으로 올라왔다.
 *   ioDone   { pid: string; where: 'memory' | 'disk' }
 *            — 기다리던 pid 의 입출력이 끝나 준비 상태가 되었다. where = 그때 있던 곳.
 *   exit     { pid: string; slot: number; was: 'running' | 'ready' | 'waiting' }
 *            — 메모리 자리 slot 의 pid 가 끝나 자리를 비웠다. was = 끝나기 직전 상태.
 *
 * 걸음 사이 간격은 initialData.stepMs. 걸음 0(처음 장면)은 이미 읽을 것이 있어 첫 발신 앞에도 쉰다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ProcState = 'running' | 'ready' | 'waiting';

export type SwapJob = { kind: 'arrive' | 'ioDone' | 'exit'; pid: string };

export type SwapStart = { slot: number; pid: string; state: ProcState };

export type SwapInOutFacetData = {
  type: 'swap-in-out';
  stepMs: number;
  memoryKiB: number;
  slotKiB: number;
  processes: { id: string; sizeKiB: number }[];
  start: SwapStart[];
  jobs: SwapJob[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function posInt(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`swapInOut: ${what} 는 양의 정수여야 한다 (받은 값: ${String(v)})`);
  }
  return v;
}

function isState(v: unknown): v is ProcState {
  return v === 'running' || v === 'ready' || v === 'waiting';
}

function isJobKind(v: unknown): v is SwapJob['kind'] {
  return v === 'arrive' || v === 'ioDone' || v === 'exit';
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다. 장면도 같은 좁히개를 쓴다. */
export function readSwapData(raw: unknown): SwapInOutFacetData {
  if (!isRecord(raw)) throw new Error('swapInOut: initialData 가 객체가 아니다');
  if (raw.type !== 'swap-in-out') throw new Error('swapInOut: initialData.type 이 swap-in-out 이 아니다');
  const stepMs = posInt(raw.stepMs, 'stepMs');
  const memoryKiB = posInt(raw.memoryKiB, 'memoryKiB');
  const slotKiB = posInt(raw.slotKiB, 'slotKiB');
  if (memoryKiB % slotKiB !== 0) throw new Error('swapInOut: memoryKiB 가 slotKiB 로 나누어떨어지지 않는다');
  const slotCount = memoryKiB / slotKiB;

  if (!Array.isArray(raw.processes)) throw new Error('swapInOut: processes 가 배열이 아니다');
  const processes = raw.processes.map((p, i) => {
    if (!isRecord(p) || typeof p.id !== 'string' || p.id === '') {
      throw new Error(`swapInOut: processes[${i}] 의 id 가 없다`);
    }
    const sizeKiB = posInt(p.sizeKiB, `processes[${i}].sizeKiB`);
    if (sizeKiB !== slotKiB) {
      throw new Error(`swapInOut: ${p.id} 의 크기 ${sizeKiB} KiB 가 자리 크기 ${slotKiB} KiB 와 다르다`);
    }
    return { id: p.id, sizeKiB };
  });
  const ids = new Set(processes.map((p) => p.id));
  if (ids.size !== processes.length) throw new Error('swapInOut: 프로세스 id 가 겹친다');

  if (!Array.isArray(raw.start)) throw new Error('swapInOut: start 가 배열이 아니다');
  const usedSlots = new Set<number>();
  const start = raw.start.map((s, i): SwapStart => {
    if (!isRecord(s) || typeof s.pid !== 'string' || !ids.has(s.pid)) {
      throw new Error(`swapInOut: start[${i}] 의 pid 가 processes 에 없다`);
    }
    if (typeof s.slot !== 'number' || !Number.isInteger(s.slot) || s.slot < 0 || s.slot >= slotCount) {
      throw new Error(`swapInOut: start[${i}] 의 slot 이 0..${slotCount - 1} 밖이다`);
    }
    if (usedSlots.has(s.slot)) throw new Error(`swapInOut: 자리 ${s.slot} 에 둘이 있다`);
    usedSlots.add(s.slot);
    if (!isState(s.state)) throw new Error(`swapInOut: start[${i}] 의 state 를 모른다`);
    return { slot: s.slot, pid: s.pid, state: s.state };
  });

  if (!Array.isArray(raw.jobs)) throw new Error('swapInOut: jobs 가 배열이 아니다');
  const jobs = raw.jobs.map((j, i): SwapJob => {
    if (!isRecord(j) || !isJobKind(j.kind)) throw new Error(`swapInOut: jobs[${i}] 의 kind 를 모른다`);
    if (typeof j.pid !== 'string' || !ids.has(j.pid)) {
      throw new Error(`swapInOut: jobs[${i}] 의 pid 가 processes 에 없다`);
    }
    return { kind: j.kind, pid: j.pid };
  });

  return { type: 'swap-in-out', stepMs, memoryKiB, slotKiB, processes, start, jobs };
}

export async function swapInOut(rawCtx: FacetContext<SwapInOutFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<SwapInOutFacetData>;
  const data = readSwapData(ctx.data);
  const stepMs = data.stepMs;
  const slotCount = data.memoryKiB / data.slotKiB;

  const slots: (string | null)[] = Array.from({ length: slotCount }, () => null);
  const states = new Map<string, ProcState>();
  /** 기다림에 든 차례 — 작을수록 오래 기다렸다. */
  const waitSince = new Map<string, number>();
  let clock = 0;
  const disk: string[] = [];
  const arrival: string[] = [];

  for (const s of data.start) {
    slots[s.slot] = s.pid;
    states.set(s.pid, s.state);
    if (s.state === 'waiting') waitSince.set(s.pid, (clock += 1));
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function stateOf(pid: string): ProcState {
    const s = states.get(pid);
    if (s === undefined) throw new Error(`swapInOut: ${pid} 는 아직 없거나 이미 끝났다`);
    return s;
  }

  /** 메모리 밖에서 준비된 것 하나 — 디스크가 먼저, 그다음 막 도착한 것. */
  function readyOutside(): { pid: string; from: 'disk' | 'arrival'; fromIndex: number } | null {
    const d = disk.findIndex((p) => stateOf(p) === 'ready');
    if (d >= 0) return { pid: disk[d] as string, from: 'disk', fromIndex: d };
    const a = arrival.findIndex((p) => stateOf(p) === 'ready');
    if (a >= 0) return { pid: arrival[a] as string, from: 'arrival', fromIndex: a };
    return null;
  }

  /** 메모리에서 가장 오래 기다린 것. 없으면 null. */
  function longestWaiting(): { pid: string; slot: number } | null {
    let best: { pid: string; slot: number; since: number } | null = null;
    for (let slot = 0; slot < slots.length; slot += 1) {
      const pid = slots[slot];
      if (pid === null || pid === undefined || stateOf(pid) !== 'waiting') continue;
      const since = waitSince.get(pid);
      if (since === undefined) throw new Error(`swapInOut: ${pid} 의 기다림 시작이 없다`);
      if (best === null || since < best.since) best = { pid, slot, since };
    }
    return best === null ? null : { pid: best.pid, slot: best.slot };
  }

  /** 자리가 나는 대로 준비된 것을 올리고, 자리가 없으면 기다리는 것을 내려보낸다. */
  async function settle(): Promise<boolean> {
    for (;;) {
      if (ctx.cancelled) return false;
      const next = readyOutside();
      if (next === null) return true;
      let slot = slots.indexOf(null);
      if (slot < 0) {
        const victim = longestWaiting();
        if (victim === null) return true;
        slot = victim.slot;
        slots[slot] = null;
        disk.push(victim.pid);
        if (!(await pause())) return false;
        await ctx.emit({
          type: 'swapOut',
          payload: { pid: victim.pid, slot, diskIndex: disk.length - 1 },
        });
      }
      const line = next.from === 'disk' ? disk : arrival;
      line.splice(next.fromIndex, 1);
      slots[slot] = next.pid;
      if (!(await pause())) return false;
      await ctx.emit({
        type: 'swapIn',
        payload: { pid: next.pid, slot, from: next.from, fromIndex: next.fromIndex },
      });
    }
  }

  for (const job of data.jobs) {
    if (ctx.cancelled) return;
    const pid = job.pid;
    if (job.kind === 'arrive') {
      if (states.has(pid)) throw new Error(`swapInOut: ${pid} 는 이미 있다`);
      states.set(pid, 'ready');
      arrival.push(pid);
      const free = slots.filter((p) => p === null).length;
      if (!(await pause())) return;
      await ctx.emit({ type: 'arrive', payload: { pid, free } });
    } else if (job.kind === 'ioDone') {
      if (stateOf(pid) !== 'waiting') throw new Error(`swapInOut: ${pid} 는 기다리고 있지 않다`);
      let where: 'memory' | 'disk';
      if (slots.includes(pid)) where = 'memory';
      else if (disk.includes(pid)) where = 'disk';
      else throw new Error(`swapInOut: ${pid} 가 메모리에도 디스크에도 없다`);
      states.set(pid, 'ready');
      waitSince.delete(pid);
      if (!(await pause())) return;
      await ctx.emit({ type: 'ioDone', payload: { pid, where } });
    } else {
      const slot = slots.indexOf(pid);
      if (slot < 0) throw new Error(`swapInOut: ${pid} 가 메모리에 없는데 끝났다`);
      const was = stateOf(pid);
      slots[slot] = null;
      states.delete(pid);
      waitSince.delete(pid);
      if (!(await pause())) return;
      await ctx.emit({ type: 'exit', payload: { pid, slot, was } });
    }
    if (!(await settle())) return;
  }
}
