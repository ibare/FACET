/**
 * starvationOfLong — 비선점 SJF 를 틱 단위로 돌려, 고를 때마다 건너뛰어진 것을 센다.
 *
 * 모형 (공통 규약):
 *   - 시각은 틱(정수). CPU 하나 · 입출력 없음 · 바꾸는 비용 0.
 *   - 틱 경계 tick 에서의 차례: 1) 돌던 것의 남은 양이 0 이면 tick 에 끝난다
 *     3) tick 에 도착한 것들이 목록 차례로 줄 끝에 선다  6) CPU 가 비었으면 줄에서 하나를 고른다
 *     7) 한 틱을 돈다. (2 · 4 · 5 — 몫 · 선점 — 는 비선점 SJF 에 없다)
 *   - 고르는 열쇠는 길이. 동률이면 줄에 먼저 선 것.
 *   - 대기 = 줄에 서 있던 틱 수. 반환 = 끝 − 도착.
 *   - 건너뜀 = 고르는 순간 줄에 있었는데 고르지 않은 것마다 하나.
 *
 * 이벤트:
 *   init   (silent) { tick: number; procs: { id: string; arrival: number; burst: number }[];
 *                     queue: string[] }
 *          — 첫 틱 경계의 줄. 걸음 0 을 갈아 끼운다.
 *   pick   { tick: number; finished: string | null; arrived: string[]; picked: string;
 *            passed: string[]; waits: Record<string, number> }
 *          — 고름 하나가 걸음 하나. finished 는 이 틱에 끝난 것, arrived 는 앞 걸음 뒤 도착한 것
 *            (목록 차례), passed 는 고르는 순간 줄에 남은 것(줄 차례), waits 는 그 순간까지 셈한 대기
 *            (줄에 남은 것과 고른 것).
 *   finish { tick: number; id: string; wait: number; turnaround: number }
 *          — 끝난 뒤 곧바로 고를 것이 없는 틱. 이 조각에서는 마지막 걸음이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StarvationProc = { id: string; arrival: number; burst: number };

export type StarvationOfLongFacetData = {
  type: 'starvation-of-long';
  stepMs: number;
  procs: StarvationProc[];
};

/** 프로세스 목록을 좁힌다. 모르는 모양은 던진다 (C6). */
export function readProcs(raw: unknown): StarvationProc[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('starvation-of-long: procs 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  return raw.map((item: unknown, i) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`starvation-of-long: procs[${i}] 가 객체가 아니다`);
    }
    const rec = item as Record<string, unknown>;
    const { id, arrival, burst } = rec;
    if (typeof id !== 'string' || id === '') {
      throw new Error(`starvation-of-long: procs[${i}].id 가 없다`);
    }
    if (seen.has(id)) throw new Error(`starvation-of-long: 식별자 ${id} 가 겹친다`);
    seen.add(id);
    if (typeof arrival !== 'number' || !Number.isInteger(arrival) || arrival < 0) {
      throw new Error(`starvation-of-long: ${id} 의 도착이 0 이상 정수가 아니다`);
    }
    if (typeof burst !== 'number' || !Number.isInteger(burst) || burst <= 0) {
      throw new Error(`starvation-of-long: ${id} 의 길이가 양의 정수가 아니다`);
    }
    return { id, arrival, burst };
  });
}

export async function starvationOfLong(
  ctxBase: FacetContext<StarvationOfLongFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<StarvationOfLongFacetData>;
  const procs = readProcs(ctx.data.procs);
  const stepMs = ctx.data.stepMs;
  if (typeof stepMs !== 'number' || stepMs <= 0) {
    throw new Error('starvation-of-long: stepMs 가 양수가 아니다');
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 모두가 끝날 수 있는 가장 늦은 틱. 이 너머까지 남으면 셈이 틀린 것이다.
  const horizon =
    Math.max(...procs.map((p) => p.arrival)) + procs.reduce((s, p) => s + p.burst, 0);

  const remaining = new Map<string, number>(procs.map((p) => [p.id, p.burst]));
  const waits = new Map<string, number>(procs.map((p) => [p.id, 0]));
  const byId = new Map<string, StarvationProc>(procs.map((p) => [p.id, p]));
  const queue: string[] = [];
  let running: string | null = null;
  let doneCount = 0;
  let pendingArrived: string[] = [];
  let first = true;

  for (let tick = 0; ; tick += 1) {
    if (ctx.cancelled) return;
    if (tick > horizon) {
      throw new Error(`starvation-of-long: 틱 ${horizon} 안에 끝나지 않은 프로세스가 있다`);
    }

    // 1) 끝이 먼저
    let finished: string | null = null;
    if (running !== null && remaining.get(running) === 0) {
      finished = running;
      running = null;
      doneCount += 1;
    }

    // 3) 이 틱에 도착한 것들이 목록 차례로 줄 끝에 선다
    for (const p of procs) {
      if (p.arrival === tick) {
        queue.push(p.id);
        pendingArrived.push(p.id);
      }
    }

    if (first) {
      first = false;
      await ctx.emit({
        type: 'init',
        silent: true,
        payload: { tick, procs: procs.map((p) => ({ ...p })), queue: [...queue] },
      });
      pendingArrived = [];
    }

    // 6) CPU 가 비었으면 줄에서 가장 짧은 것 — 동률이면 줄에서 앞선 것
    if (running === null && queue.length > 0) {
      let best = 0;
      for (let i = 1; i < queue.length; i += 1) {
        const cand = byId.get(queue[i] as string);
        const cur = byId.get(queue[best] as string);
        if (cand === undefined || cur === undefined) {
          throw new Error('starvation-of-long: 줄에 모르는 식별자가 있다');
        }
        if (cand.burst < cur.burst) best = i;
      }
      const [picked] = queue.splice(best, 1);
      if (picked === undefined) throw new Error('starvation-of-long: 고를 것이 사라졌다');
      running = picked;
      const passed = [...queue];
      const waitRec: Record<string, number> = {};
      for (const id of [picked, ...passed]) {
        const w = waits.get(id);
        if (w === undefined) throw new Error(`starvation-of-long: ${id} 의 대기가 없다`);
        waitRec[id] = w;
      }
      if (!(await pause())) return;
      await ctx.emit({
        type: 'pick',
        payload: { tick, finished, arrived: pendingArrived, picked, passed, waits: waitRec },
      });
      pendingArrived = [];
    } else if (finished !== null) {
      const p = byId.get(finished);
      const w = waits.get(finished);
      if (p === undefined || w === undefined) {
        throw new Error(`starvation-of-long: 끝난 ${finished} 를 모른다`);
      }
      if (!(await pause())) return;
      await ctx.emit({
        type: 'finish',
        payload: { tick, id: finished, wait: w, turnaround: tick - p.arrival },
      });
    }

    if (doneCount === procs.length) return;

    // 7) 한 틱을 돈다 — 줄에 선 것은 모두 한 틱 기다린다
    if (running !== null) {
      const r = remaining.get(running);
      if (r === undefined) throw new Error(`starvation-of-long: ${running} 의 남은 양이 없다`);
      remaining.set(running, r - 1);
    }
    for (const id of queue) {
      const w = waits.get(id);
      if (w === undefined) throw new Error(`starvation-of-long: ${id} 의 대기가 없다`);
      waits.set(id, w + 1);
    }
  }
}
