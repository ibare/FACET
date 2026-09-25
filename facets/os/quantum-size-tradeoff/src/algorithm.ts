/**
 * quantum-size-tradeoff — 같은 일감을 라운드 로빈의 두 몫으로 나란히 돌린다.
 *
 * 몫마다 틱 모형을 실제로 돌려(한 몫씩 따로) 틱별 CPU 주인 · 바뀜 · 첫 응답을 얻고,
 * 두 쪽을 한 틱씩 함께 내보낸다.
 *
 * 틱 경계 t 에서의 차례 (common.md 의 모형):
 *   1. 돌던 것의 남은 양이 0 이면 t 에 끝난다 (끝이 먼저)
 *   2. 몫을 다 썼는데 남은 양이 있으면 CPU 에서 내려온다 (아직 줄에 서지 않는다)
 *   3. t 에 도착한 것들이 목록 차례대로 줄 끝에 선다
 *   4. 2 에서 내려온 것이 그 뒤에 선다 (같은 틱이면 도착이 먼저)
 *   5. (선점 없음 — 라운드 로빈은 몫 끝에서만 내려온다)
 *   6. CPU 가 비었으면 줄 앞에서 하나를 고른다
 *   7. 한 틱을 돈다
 * 바뀜 = CPU 에 오른 것이 바로 앞에 돈 것과 다를 때 하나. 첫 오름은 세지 않고,
 * 몫이 끝났는데 줄이 비어 같은 것이 다시 오르면 바뀜이 아니다.
 * 첫 응답 = 처음 오른 틱 − 도착.
 *
 * 이벤트 (전부 await):
 *   init  (silent) { ticks: number }
 *         — 두 쪽 가운데 긴 쪽의 틱 수. 걸음 0 의 바탕(띠의 칸 수)을 정한다
 *   tick           { tick: number, runs: Array<{ pid: string | null, switched: boolean, from: string | null, response: number | null }> }
 *         — 틱 tick 동안 쪽마다(quanta 차례) 돈 것. pid 가 null 이면 빈 CPU (한쪽이 먼저 끝났을 때도).
 *           switched 는 그 틱에 오르며 바뀜이 일어났는가, from 은 바뀜일 때 내려온 것(아니면 null),
 *           response 는 그 틱이 첫 오름이면 첫 응답(아니면 null)
 *   done           { sides: Array<{ switches: number, respSum: number, count: number }> }
 *         — 끝. 쪽마다 바뀜 수와 첫 응답의 합 · 개수 (평균은 표시할 때만 나눈다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type QuantumProc = { id: string; arrival: number; burst: number };

export type QuantumSizeTradeoffFacetData = {
  type: 'quantum-size-tradeoff';
  procs: QuantumProc[];
  quanta: number[];
  stepMs: number;
};

type TickRun = { pid: string | null; switched: boolean; from: string | null; response: number | null };

type SideRun = { ticks: TickRun[]; switches: number; respSum: number; count: number };

function checkData(data: QuantumSizeTradeoffFacetData): void {
  if (!Array.isArray(data.procs) || data.procs.length === 0) {
    throw new Error('quantum-size-tradeoff: procs 가 비었다');
  }
  const seen = new Set<string>();
  for (const p of data.procs) {
    if (typeof p.id !== 'string' || p.id === '') throw new Error('quantum-size-tradeoff: 식별자가 없는 프로세스');
    if (seen.has(p.id)) throw new Error(`quantum-size-tradeoff: 식별자 ${p.id} 가 겹친다`);
    seen.add(p.id);
    if (!Number.isInteger(p.arrival) || p.arrival < 0) {
      throw new Error(`quantum-size-tradeoff: ${p.id} 의 도착이 0 이상의 정수가 아니다`);
    }
    if (!Number.isInteger(p.burst) || p.burst < 1) {
      throw new Error(`quantum-size-tradeoff: ${p.id} 의 길이가 1 이상의 정수가 아니다`);
    }
  }
  if (!Array.isArray(data.quanta) || data.quanta.length !== 2) {
    throw new Error('quantum-size-tradeoff: 몫은 둘이어야 한다');
  }
  for (const q of data.quanta) {
    if (!Number.isInteger(q) || q < 1) throw new Error(`quantum-size-tradeoff: 몫 ${String(q)} 이 1 이상의 정수가 아니다`);
  }
}

/** 한 몫으로 틱 모형을 돌린다. 걸음표를 적지 않고 규약에서 셈한다. */
function roundRobin(procs: QuantumProc[], quantum: number): SideRun {
  const rem = new Map<string, number>();
  const start = new Map<string, number>();
  for (const p of procs) rem.set(p.id, p.burst);
  const arrivalOf = (id: string): number => {
    const p = procs.find((x) => x.id === id);
    if (p === undefined) throw new Error(`quantum-size-tradeoff: 모르는 식별자 ${id}`);
    return p.arrival;
  };
  const remOf = (id: string): number => {
    const r = rem.get(id);
    if (r === undefined) throw new Error(`quantum-size-tradeoff: 모르는 식별자 ${id}`);
    return r;
  };

  const limit = Math.max(...procs.map((p) => p.arrival)) + procs.reduce((s, p) => s + p.burst, 0) + 1;
  const ready: string[] = [];
  const ticks: TickRun[] = [];
  const finished = new Set<string>();
  let running: string | null = null;
  let used = 0;
  let lastRan: string | null = null;
  let switches = 0;

  for (let tick = 0; tick <= limit; tick += 1) {
    let expired: string | null = null;
    if (running !== null) {
      if (remOf(running) === 0) {
        finished.add(running);
        running = null;
      } else if (used === quantum) {
        expired = running;
        running = null;
      }
    }
    for (const p of procs) if (p.arrival === tick) ready.push(p.id);
    if (expired !== null) ready.push(expired);

    let switched = false;
    let from: string | null = null;
    let response: number | null = null;
    if (running === null && ready.length > 0) {
      const pick = ready.shift() as string;
      running = pick;
      used = 0;
      if (!start.has(pick)) {
        start.set(pick, tick);
        response = tick - arrivalOf(pick);
      }
      if (lastRan !== null && lastRan !== pick) {
        switched = true;
        from = lastRan;
        switches += 1;
      }
      lastRan = pick;
    }
    if (finished.size === procs.length) {
      let respSum = 0;
      for (const p of procs) {
        const s = start.get(p.id);
        if (s === undefined) throw new Error(`quantum-size-tradeoff: ${p.id} 가 한 번도 오르지 않았다`);
        respSum += s - p.arrival;
      }
      return { ticks, switches, respSum, count: procs.length };
    }
    ticks.push({ pid: running, switched, from, response });
    if (running !== null) {
      rem.set(running, remOf(running) - 1);
      used += 1;
    }
  }
  throw new Error(`quantum-size-tradeoff: 몫 ${quantum} 에서 지평 ${limit} 안에 끝나지 않았다`);
}

export async function quantumSizeTradeoff(
  context: FacetContext<QuantumSizeTradeoffFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<QuantumSizeTradeoffFacetData>;
  const data = ctx.data;
  checkData(data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const sides = data.quanta.map((q) => roundRobin(data.procs, q));
  const ticks = Math.max(...sides.map((s) => s.ticks.length));

  await ctx.emit({ type: 'init', payload: { ticks }, silent: true });

  for (let tick = 0; tick < ticks; tick += 1) {
    // 걸음 0 은 이미 읽을 것(세 일감 · 빈 두 띠)이 있는 화면이라 첫 발신 앞에도 쉰다
    if (!(await pause())) return;
    const runs = sides.map((s) => s.ticks[tick] ?? { pid: null, switched: false, from: null, response: null });
    await ctx.emit({ type: 'tick', payload: { tick, runs } });
  }

  if (!(await pause())) return;
  await ctx.emit({
    type: 'done',
    payload: { sides: sides.map((s) => ({ switches: s.switches, respSum: s.respSum, count: s.count })) },
  });
}
