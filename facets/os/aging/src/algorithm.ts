/**
 * aging — 줄에서 기다리는 동안 낮은 것의 순위가 올라간다.
 *
 * 비선점 우선순위 스케줄링에 에이징을 더한 틱 모형을 실제로 한 틱씩 돌리며 틱 경계마다
 * 발신한다. 순위는 수가 클수록 높다. 실효 순위 = 처음 순위 + ⌊줄에서 기다린 틱 ÷ ageEvery⌋.
 * 줄에 있는 모두가 똑같이 에이징된다. CPU 에 오른 것은 더 기다리지 않는다.
 *
 * 틱 경계 tick 에서의 차례 (공통 모형):
 *   1. 돌던 것의 남은 양이 0 이면 tick 에 끝난다 (끝이 먼저)
 *   2. tick 에 도착한 것들이 줄 끝에 선다 — 같은 틱 도착끼리는 목록 차례
 *   3. CPU 가 비었으면 줄에서 실효 순위가 가장 높은 것을 고른다.
 *      **동률이면 줄에 먼저 선 것** (줄의 앞쪽). 선점하지 않는다
 *   4. 한 틱을 돈다 — 줄에 선 모두의 기다린 틱이 1 씩 는다
 * 이 데이터의 결정적 걸음(t6: 보고서 3 · J4 3 의 동률)이 3 의 동률 규칙에 걸려 있다.
 * 기다린 틱은 줄에 선 틱 경계부터 센다 (도착한 틱에 0).
 *
 * 멈춤: focus 로 정한 프로세스가 끝나는 틱 경계에서 멈춘다. horizon 틱 안에 끝나지 않으면 던진다.
 *
 * 이벤트 (차례대로):
 *   init  (silent) — 첫 틱 경계의 도착까지. 걸음 0 을 갈아 끼운다
 *     payload: { tick: number; low: number; high: number; cols: number;
 *                queue: Array<{ id: string; rank: number; waited: number }> }
 *       low · high  이 재생에서 보이는 순위의 아래 · 위 끝 (처음 순위의 최솟값 · 실효 순위의 최댓값)
 *       cols        틱 경계에서 줄이 가장 길었을 때의 길이 (고르기 전)
 *       queue       첫 틱 경계에 도착해 줄에 선 것들 (고르기 전)
 *   tick  — 틱 경계 하나. 첫 경계는 init 이 도착을 이미 보였으므로 arrived 가 비어 있다
 *     payload: { tick: number;
 *                finished: { id: string; start: number; waited: number } | null;
 *                arrived: string[];
 *                queue: Array<{ id: string; rank: number; waited: number }>;   // 에이징 뒤, 고르기 전
 *                rose: Array<{ id: string; from: number; to: number; waited: number }>;
 *                pick: { id: string; rank: number; tied: string[] } | null;    // tied = 같은 순위로 뒤에 선 것들
 *                cpu: { id: string; rank: number; left: number } | null }       // 고른 뒤 CPU 의 주인
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AgingProcess = {
  id: string;
  /** 도착 틱 */
  arrival: number;
  /** CPU 를 써야 하는 틱 수 */
  burst: number;
  /** 처음 순위 — 수가 클수록 높다 */
  rank: number;
};

export type AgingFacetData = {
  type: 'aging';
  stepMs: number;
  /** 줄에서 이 틱 수만큼 기다릴 때마다 순위 +1 */
  ageEvery: number;
  /** 이 프로세스가 끝나는 틱 경계에서 멈춘다 */
  focus: string;
  /** 목록 차례가 곧 같은 틱 도착의 줄 서는 차례 */
  processes: AgingProcess[];
};

export type AgingEntry = { id: string; rank: number; waited: number };
export type AgingFinish = { id: string; start: number; waited: number };
export type AgingRise = { id: string; from: number; to: number; waited: number };
export type AgingPick = { id: string; rank: number; tied: string[] };
export type AgingCpu = { id: string; rank: number; left: number };

export type AgingBoundary = {
  tick: number;
  finished: AgingFinish | null;
  arrived: string[];
  queue: AgingEntry[];
  rose: AgingRise[];
  pick: AgingPick | null;
  cpu: AgingCpu | null;
};

const HORIZON = 1000;

function isWholeNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** 데이터를 좁힌다. 셈할 수 없는 모양이면 던진다 (C6). */
export function readAgingData(raw: unknown): AgingFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('aging: initialData 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'aging') throw new Error(`aging: type 이 'aging' 이 아니다 (${String(r.type)})`);
  if (!isWholeNumber(r.stepMs)) throw new Error('aging: stepMs 가 0 이상의 정수가 아니다');
  if (!isWholeNumber(r.ageEvery) || r.ageEvery === 0) throw new Error('aging: ageEvery 가 양의 정수가 아니다');
  if (typeof r.focus !== 'string') throw new Error('aging: focus 가 문자열이 아니다');
  if (!Array.isArray(r.processes) || r.processes.length === 0) throw new Error('aging: processes 가 비어 있다');
  const seen = new Set<string>();
  const processes: AgingProcess[] = r.processes.map((p: unknown, i: number) => {
    if (typeof p !== 'object' || p === null) throw new Error(`aging: processes[${i}] 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id === '') throw new Error(`aging: processes[${i}].id 가 없다`);
    if (seen.has(q.id)) throw new Error(`aging: 식별자 ${q.id} 가 두 번 나온다`);
    seen.add(q.id);
    if (!isWholeNumber(q.arrival)) throw new Error(`aging: ${q.id}.arrival 이 0 이상의 정수가 아니다`);
    if (!isWholeNumber(q.burst) || q.burst === 0) throw new Error(`aging: ${q.id}.burst 가 양의 정수가 아니다`);
    if (!isWholeNumber(q.rank)) throw new Error(`aging: ${q.id}.rank 가 0 이상의 정수가 아니다`);
    return { id: q.id, arrival: q.arrival, burst: q.burst, rank: q.rank };
  });
  if (!seen.has(r.focus)) throw new Error(`aging: focus ${r.focus} 가 processes 에 없다`);
  return { type: 'aging', stepMs: r.stepMs, ageEvery: r.ageEvery, focus: r.focus, processes };
}

/**
 * 틱 모형을 focus 가 끝나는 경계까지 돌려 경계마다의 기록을 돌려준다. 순수하다.
 */
export function simulateAging(data: AgingFacetData): AgingBoundary[] {
  const byId = new Map(data.processes.map((p) => [p.id, p]));
  const left = new Map(data.processes.map((p) => [p.id, p.burst]));
  const waited = new Map(data.processes.map((p) => [p.id, 0]));
  const start = new Map<string, number>();
  const lastRank = new Map<string, number>();
  const queue: string[] = [];
  let running: string | null = null;
  let runningRank = 0;
  const out: AgingBoundary[] = [];

  const rankOf = (id: string): number => {
    const p = byId.get(id);
    const w = waited.get(id);
    if (p === undefined || w === undefined) throw new Error(`aging: 모르는 식별자 ${id}`);
    return p.rank + Math.floor(w / data.ageEvery);
  };
  const waitedOf = (id: string): number => {
    const w = waited.get(id);
    if (w === undefined) throw new Error(`aging: 모르는 식별자 ${id}`);
    return w;
  };
  const leftOf = (id: string): number => {
    const l = left.get(id);
    if (l === undefined) throw new Error(`aging: 모르는 식별자 ${id}`);
    return l;
  };

  for (let tick = 0; tick <= HORIZON; tick += 1) {
    // 1. 끝
    let finished: AgingFinish | null = null;
    if (running !== null && leftOf(running) === 0) {
      const s = start.get(running);
      if (s === undefined) throw new Error(`aging: ${running} 가 오른 적 없이 끝났다`);
      finished = { id: running, start: s, waited: waitedOf(running) };
      running = null;
    }
    // 2. 도착
    const arrived: string[] = [];
    for (const p of data.processes) {
      if (p.arrival === tick) {
        queue.push(p.id);
        arrived.push(p.id);
      }
    }
    // 에이징 — 이번 경계의 실효 순위와 앞 경계의 것을 견준다
    const entries: AgingEntry[] = queue.map((id) => ({ id, rank: rankOf(id), waited: waitedOf(id) }));
    const rose: AgingRise[] = [];
    for (const e of entries) {
      const was = lastRank.get(e.id);
      if (was !== undefined && e.rank > was) rose.push({ id: e.id, from: was, to: e.rank, waited: e.waited });
      lastRank.set(e.id, e.rank);
    }
    // 3. 고름 — 가장 높은 순위, 동률이면 줄의 앞
    let pick: AgingPick | null = null;
    if (running === null && entries.length > 0) {
      let best = entries[0];
      for (const e of entries) {
        if (best === undefined || e.rank > best.rank) best = e;
      }
      if (best === undefined) throw new Error('aging: 줄이 비었는데 고르려 했다');
      const chosen = best;
      const tied = entries.filter((e) => e.id !== chosen.id && e.rank === chosen.rank).map((e) => e.id);
      pick = { id: chosen.id, rank: chosen.rank, tied };
      queue.splice(queue.indexOf(chosen.id), 1);
      lastRank.delete(chosen.id);
      running = chosen.id;
      runningRank = chosen.rank;
      if (!start.has(chosen.id)) start.set(chosen.id, tick);
    }
    const cpu: AgingCpu | null = running === null ? null : { id: running, rank: runningRank, left: leftOf(running) };
    out.push({ tick, finished, arrived, queue: entries, rose, pick, cpu });
    if (finished !== null && finished.id === data.focus) return out;
    // 4. 한 틱을 돈다
    for (const id of queue) waited.set(id, waitedOf(id) + 1);
    if (running !== null) left.set(running, leftOf(running) - 1);
  }
  throw new Error(`aging: ${data.focus} 가 ${HORIZON} 틱 안에 끝나지 않았다`);
}

export async function aging(ctx: FacetContext<AgingFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<AgingFacetData>;
  const data = readAgingData(ctx.data);
  const stepMs = data.stepMs;
  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const boundaries = simulateAging(data);
  const first = boundaries[0];
  if (first === undefined) throw new Error('aging: 틱 경계가 하나도 없다');

  const low = Math.min(...data.processes.map((p) => p.rank));
  let high = low;
  let cols = 0;
  for (const b of boundaries) {
    cols = Math.max(cols, b.queue.length);
    for (const e of b.queue) high = Math.max(high, e.rank);
    if (b.cpu !== null) high = Math.max(high, b.cpu.rank);
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { tick: first.tick, low, high, cols, queue: first.queue },
  });

  for (let i = 0; i < boundaries.length; i += 1) {
    // 걸음 0 이 이미 도착을 보이므로 첫 발신 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    const b = boundaries[i];
    if (b === undefined) throw new Error(`aging: 경계 ${i} 가 없다`);
    await ctx.emit({
      type: 'tick',
      payload: {
        tick: b.tick,
        finished: b.finished,
        arrived: i === 0 ? [] : b.arrived,
        queue: b.queue,
        rose: b.rose,
        pick: b.pick,
        cpu: b.cpu,
      },
    });
  }
}
