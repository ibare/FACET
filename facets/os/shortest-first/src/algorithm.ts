/**
 * shortest-first — 같은 일감을 짧은 것부터 보내면 평균 대기가 왜 주는가.
 *
 * 모형 (공통 안내문의 틱 모형):
 *   - 시각의 단위는 틱. CPU 하나 · 입출력 없음 · 바꾸는 비용 0.
 *   - 틱 경계 t 의 차례: 돌던 것의 남은 양이 0 이면 t 에 끝난다 → t 에 도착한 것들이 줄 끝에 선다
 *     (같은 틱 도착은 목록 차례) → CPU 가 비었으면 줄에서 하나를 고른다 → 한 틱을 돈다.
 *   - 비선점. 한 번 오르면 끝까지 돈다.
 *   - SJF 의 열쇠는 길이. 동률이면 줄에 먼저 선 것이 이긴다 (엄격히 짧을 때만 앞선다).
 *   - 대기 = 줄에 서 있던 틱 수. 틱마다 실제로 돌려서 센다.
 *
 * 이 조각은 넷 다 틱 0 에 와 있는 한 번의 줄 세우기만 다룬다. 중간 걸음의 차례는
 * "SJF 가 이미 고른 것들 + 남은 것은 도착 차례" 이고, 그 차례로 틱을 돌려 대기를 센다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   order   { order: string[]; waits: Record<string, number>; total: number }
 *           도착 차례(FCFS)로 선 차례와 각자의 대기, 대기 합
 *   pull    { id: string; slot: number; order: string[]; waits: Record<string, number>; total: number }
 *           SJF 가 고른 id 가 slot(0 부터) 자리로 당겨진 뒤의 차례 · 대기 · 대기 합
 *   compare { fcfsTotal: number; sjfTotal: number }
 *           두 차례의 대기 합을 나란히
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ShortestFirstProc = { id: string; arrive: number; burst: number };

export type ShortestFirstFacetData = {
  type: 'shortest-first';
  stepMs: number;
  procs: ShortestFirstProc[];
};

type RunResult = { picks: string[]; waits: Record<string, number>; total: number };

/**
 * 비선점 스케줄을 틱 단위로 돌린다. `choose` 는 줄(선 차례대로)을 받아 오를 것의 자리를 돌려준다.
 */
function runTicks(
  procs: readonly ShortestFirstProc[],
  choose: (queue: readonly ShortestFirstProc[]) => number,
): RunResult {
  const horizon = procs.reduce((s, p) => s + p.burst, 0) + Math.max(...procs.map((p) => p.arrive)) + 1;
  const waits: Record<string, number> = {};
  for (const p of procs) waits[p.id] = 0;
  const picks: string[] = [];
  const queue: ShortestFirstProc[] = [];
  let running: ShortestFirstProc | null = null;
  let left = 0;
  let done = 0;
  for (let tick = 0; tick <= horizon; tick += 1) {
    // 1. 끝이 먼저
    if (running !== null && left === 0) {
      running = null;
      done += 1;
    }
    // 2. 도착은 목록 차례로 줄 끝에
    for (const p of procs) {
      if (p.arrive === tick) queue.push(p);
    }
    // 3. CPU 가 비었으면 고른다
    if (running === null && queue.length > 0) {
      const at = choose(queue);
      const picked = queue[at];
      if (picked === undefined) throw new Error(`shortest-first: 틱 ${tick} 에 고른 자리 ${at} 가 줄 밖이다`);
      queue.splice(at, 1);
      running = picked;
      left = picked.burst;
      picks.push(picked.id);
    }
    if (done === procs.length) {
      const total = procs.reduce((s, p) => s + (waits[p.id] as number), 0);
      return { picks, waits, total };
    }
    // 4. 한 틱을 돈다 — 줄에 선 것은 한 틱을 기다린다
    for (const q of queue) waits[q.id] = (waits[q.id] as number) + 1;
    if (running !== null) left -= 1;
  }
  throw new Error(`shortest-first: 지평 ${horizon} 틱 안에 끝나지 않는 프로세스가 있다`);
}

/** 가장 짧은 것. 동률이면 줄에 먼저 선 것 (엄격히 짧을 때만 바꾼다). */
function shortestAt(queue: readonly ShortestFirstProc[]): number {
  let best = 0;
  for (let i = 1; i < queue.length; i += 1) {
    if ((queue[i] as ShortestFirstProc).burst < (queue[best] as ShortestFirstProc).burst) best = i;
  }
  return best;
}

/** 정해진 차례를 따라 오르게 한다 (중간 걸음의 대기를 틱으로 세는 데 쓴다). */
function planned(plan: readonly string[]): (queue: readonly ShortestFirstProc[]) => number {
  let next = 0;
  return (queue) => {
    const want = plan[next];
    const at = queue.findIndex((p) => p.id === want);
    if (at < 0) throw new Error(`shortest-first: 차례의 ${String(want)} 가 줄에 없다`);
    next += 1;
    return at;
  };
}

export async function shortestFirst(ctxIn: FacetContext<ShortestFirstFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<ShortestFirstFacetData>;
  const { procs, stepMs } = ctx.data;
  if (!Array.isArray(procs) || procs.length === 0) throw new Error('shortest-first: procs 가 비었다');
  for (const p of procs) {
    if (p.arrive !== 0) throw new Error(`shortest-first: ${p.id} 의 도착이 0 이 아니다 — 이 조각은 한 번의 줄 세우기만 다룬다`);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const arrival = procs.map((p) => p.id);
  const fcfs = runTicks(procs, () => 0);
  const sjf = runTicks(procs, shortestAt);

  // 걸음 0 은 길이가 보이는 넷 — 읽을 틈을 먼저 준다
  if (!(await pause())) return;
  await ctx.emit({ type: 'order', payload: { order: fcfs.picks, waits: fcfs.waits, total: fcfs.total } });

  let last = fcfs;
  for (let slot = 0; slot < sjf.picks.length; slot += 1) {
    if (!(await pause())) return;
    const fixed = sjf.picks.slice(0, slot + 1);
    const plan = [...fixed, ...arrival.filter((id) => !fixed.includes(id))];
    last = runTicks(procs, planned(plan));
    await ctx.emit({
      type: 'pull',
      payload: { id: sjf.picks[slot], slot, order: last.picks, waits: last.waits, total: last.total },
    });
  }
  if (last.total !== sjf.total) throw new Error('shortest-first: 마지막 차례의 대기 합이 SJF 와 다르다');

  if (!(await pause())) return;
  await ctx.emit({ type: 'compare', payload: { fcfsTotal: fcfs.total, sjfTotal: sjf.total } });
}
