/**
 * one-turn-at-a-time — 태스크 큐: 앞의 태스크가 도는 도중 새 태스크가 와도 번갈아 돌지 않는다.
 *
 * 줄 맨 앞 태스크가 꺼내져 제 단위를 하나씩 끝까지 돌고, 그 뒤에야 다음 태스크가
 * 꺼내진다. 도는 도중 새로 온 태스크는 줄 맨 뒤에 선다 — 도는 것 사이로 끼어들지 않는다.
 *
 * 이벤트
 *   'unit'  payload: { id: string; u: number; total: number; arrived: string | null }
 *           태스크 id 의 단위 u/total 번째가 돈다. arrived 는 이 단위가 도는 동안 줄
 *           뒤에 선 태스크의 id (없으면 null). silent 아님 — 단위 하나가 곧 걸음 하나다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OneTurnAtATimeTask = { id: string; units: number };
export type OneTurnAtATimeArrival = { id: string; duringTask: string; duringUnit: number };

export type OneTurnAtATimeFacetData = {
  type: 'oneTurnAtATime';
  stepMs: number;
  /** 처음 줄 (앞에서부터). */
  queue: string[];
  tasks: OneTurnAtATimeTask[];
  /** duringTask 의 duringUnit 번째 단위가 도는 동안 id 가 도착해 줄 뒤에 선다. */
  arrivals: OneTurnAtATimeArrival[];
};

/**
 * initialData 를 구조로 좁힌다. 알고리즘과 장면이 같은 모양 읽기를 쓰도록 여기 하나만
 * 둔다 — 장면의 `initial` 도 이 함수를 그대로 부른다 (셈을 다시 하는 것이 아니라
 * 구조를 읽는 것뿐이다).
 */
export function parseOneTurnAtATimeData(data: unknown): OneTurnAtATimeFacetData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('oneTurnAtATime: initialData 가 객체가 아니다');
  }
  const d = data as Record<string, unknown>;
  if (d.type !== 'oneTurnAtATime') throw new Error(`oneTurnAtATime: type 이 다르다: ${String(d.type)}`);
  if (typeof d.stepMs !== 'number') throw new Error('oneTurnAtATime: stepMs 가 수가 아니다');
  if (!Array.isArray(d.queue) || d.queue.some((v) => typeof v !== 'string')) {
    throw new Error('oneTurnAtATime: queue 가 문자열 배열이 아니다');
  }
  if (!Array.isArray(d.tasks)) throw new Error('oneTurnAtATime: tasks 가 배열이 아니다');
  const tasks: OneTurnAtATimeTask[] = d.tasks.map((t, i) => {
    if (typeof t !== 'object' || t === null) throw new Error(`oneTurnAtATime: tasks[${i}] 가 객체가 아니다`);
    const rt = t as Record<string, unknown>;
    if (typeof rt.id !== 'string') throw new Error(`oneTurnAtATime: tasks[${i}].id 가 문자열이 아니다`);
    if (typeof rt.units !== 'number' || rt.units < 1) {
      throw new Error(`oneTurnAtATime: tasks[${i}].units 가 올바르지 않다`);
    }
    return { id: rt.id, units: rt.units };
  });
  if (!Array.isArray(d.arrivals)) throw new Error('oneTurnAtATime: arrivals 가 배열이 아니다');
  const arrivals: OneTurnAtATimeArrival[] = d.arrivals.map((a, i) => {
    if (typeof a !== 'object' || a === null) throw new Error(`oneTurnAtATime: arrivals[${i}] 가 객체가 아니다`);
    const ra = a as Record<string, unknown>;
    if (typeof ra.id !== 'string') throw new Error(`oneTurnAtATime: arrivals[${i}].id 가 문자열이 아니다`);
    if (typeof ra.duringTask !== 'string') throw new Error(`oneTurnAtATime: arrivals[${i}].duringTask 가 문자열이 아니다`);
    if (typeof ra.duringUnit !== 'number') throw new Error(`oneTurnAtATime: arrivals[${i}].duringUnit 가 수가 아니다`);
    return { id: ra.id, duringTask: ra.duringTask, duringUnit: ra.duringUnit };
  });
  return {
    type: 'oneTurnAtATime',
    stepMs: d.stepMs,
    queue: [...d.queue] as string[],
    tasks,
    arrivals,
  };
}

export async function oneTurnAtATime(ctx: FacetContext<OneTurnAtATimeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<OneTurnAtATimeFacetData>;
  const data = parseOneTurnAtATimeData(rctx.data);
  const totals = new Map(data.tasks.map((t) => [t.id, t.units]));

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(data.stepMs)) && !rctx.cancelled;
  }

  const queue = [...data.queue];
  let running: { id: string; done: number; total: number } | null = null;

  while (queue.length > 0 || running !== null) {
    if (!(await pause())) return;
    if (!running) {
      const id = queue.shift();
      if (id === undefined) throw new Error('oneTurnAtATime: 빈 줄에서 꺼내려 했다');
      const total = totals.get(id);
      if (total === undefined) throw new Error(`oneTurnAtATime: 알 수 없는 태스크 id: ${id}`);
      running = { id, done: 0, total };
    }
    running.done += 1;
    const finishedNow = running.done === running.total;
    const arrival = data.arrivals.find((a) => a.duringTask === running!.id && a.duringUnit === running!.done);
    if (arrival) {
      if (!totals.has(arrival.id)) throw new Error(`oneTurnAtATime: 알 수 없는 도착 태스크 id: ${arrival.id}`);
      queue.push(arrival.id);
    }
    await ctx.emit({
      type: 'unit',
      payload: {
        id: running.id,
        u: running.done,
        total: running.total,
        arrived: arrival ? arrival.id : null,
      },
    });
    if (finishedNow) running = null;
  }
}
