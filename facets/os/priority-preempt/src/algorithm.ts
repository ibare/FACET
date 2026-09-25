/**
 * priority-preempt — 순위가 더 높은 것이 도착하면 돌던 것을 CPU 에서 밀어낸다.
 *
 * 모형 (틱 단위 · CPU 하나 · 입출력 없음 · 바꾸는 비용 0). 순위는 수가 클수록 높다.
 * 틱 경계 tick 에서 일어나는 차례:
 *   1. 돌던 것의 남은 양이 0 이면 tick 에 끝난다 (끝이 먼저)
 *   2. tick 에 도착한 것들이 줄 끝에 선다 — 같은 틱 도착끼리는 데이터 목록 차례
 *   3. 선점 판정 — 줄에서 가장 높은 것이 돌던 것보다 **엄격히** 높을 때만 밀어낸다.
 *      밀려난 것은 쓰다 만 남은 양을 쥐고 줄 끝에 선다
 *   4. CPU 가 비었으면 줄에서 가장 높은 것을 고른다 (동률이면 줄에서 앞선 것)
 *   5. 한 틱을 돈다
 * 몫(시간 조각)은 없다 — 오른 것은 끝나거나 밀려날 때까지 돈다. 순위는 끝까지 그대로다.
 *
 * 이벤트 (걸음 = 사건이 있는 틱 경계 하나)
 *   boundary  (silent 아님) — 한 틱 경계에서 일어난 일 전부
 *     payload: {
 *       tick: number                     이 경계의 틱
 *       arrive: string[]                 이 틱에 도착한 식별자 (목록 차례)
 *       held: string[]                   도착했지만 CPU 를 얻지 못하고 줄에 남은 것
 *       finish: string | null            이 틱에 끝난 것
 *       preempt: { out: string; by: string; left: number } | null
 *                                        밀려난 것 · 밀어낸 것 · 밀려난 것의 남은 양
 *       pick: string | null              이 틱에 CPU 에 오른 것
 *       run: string | null               경계를 지난 뒤 CPU 의 주인
 *       queue: string[]                  경계를 지난 뒤의 줄 (앞에서부터)
 *       left: Record<string, number>     경계 시점의 남은 양 (모든 프로세스, 목록 차례)
 *       end: boolean                     모두 끝났는가
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 로 세운다 (빈 CPU 와 순위 표시).
 * 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface PriorityPreemptProc {
  id: string;
  arrive: number;
  length: number;
  prio: number;
}

export interface PriorityPreemptFacetData {
  type: 'priority-preempt';
  stepMs: number;
  procs: PriorityPreemptProc[];
}

export interface PriorityPreemptPayload {
  tick: number;
  arrive: string[];
  held: string[];
  finish: string | null;
  preempt: { out: string; by: string; left: number } | null;
  pick: string | null;
  run: string | null;
  queue: string[];
  left: Record<string, number>;
  end: boolean;
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** initialData 를 좁힌다. 모르는 모양은 던진다. 장면과 그림이 같은 좁히개를 쓴다. */
export function readPriorityPreemptProcs(data: unknown): PriorityPreemptProc[] {
  if (typeof data !== 'object' || data === null) {
    throw new Error('priority-preempt: initialData 가 객체가 아니다');
  }
  const raw = (data as { procs?: unknown }).procs;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('priority-preempt: procs 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  return raw.map((p: unknown, i: number) => {
    if (typeof p !== 'object' || p === null) {
      throw new Error(`priority-preempt: procs[${i}] 가 객체가 아니다`);
    }
    const { id, arrive, length, prio } = p as Record<string, unknown>;
    if (typeof id !== 'string' || id === '') {
      throw new Error(`priority-preempt: procs[${i}].id 가 없다`);
    }
    if (seen.has(id)) throw new Error(`priority-preempt: 식별자 ${id} 가 겹친다`);
    seen.add(id);
    if (!isInt(arrive) || arrive < 0) {
      throw new Error(`priority-preempt: ${id} 의 도착이 0 이상 정수가 아니다`);
    }
    if (!isInt(length) || length < 1) {
      throw new Error(`priority-preempt: ${id} 의 길이가 1 이상 정수가 아니다`);
    }
    if (!isInt(prio)) throw new Error(`priority-preempt: ${id} 의 순위가 정수가 아니다`);
    return { id, arrive, length, prio };
  });
}

function readStepMs(data: unknown): number {
  const v = (data as { stepMs?: unknown }).stepMs;
  if (typeof v !== 'number' || !(v > 0)) {
    throw new Error('priority-preempt: stepMs 가 양수가 아니다');
  }
  return v;
}

export async function priorityPreempt(
  context: FacetContext<PriorityPreemptFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PriorityPreemptFacetData>;
  const procs = readPriorityPreemptProcs(ctx.data);
  const stepMs = readStepMs(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const prioOf = new Map<string, number>();
  const left = new Map<string, number>();
  for (const p of procs) {
    prioOf.set(p.id, p.prio);
    left.set(p.id, p.length);
  }
  function prio(id: string): number {
    const v = prioOf.get(id);
    if (v === undefined) throw new Error(`priority-preempt: 모르는 식별자 ${id}`);
    return v;
  }
  function leftOf(id: string): number {
    const v = left.get(id);
    if (v === undefined) throw new Error(`priority-preempt: 모르는 식별자 ${id}`);
    return v;
  }
  /** 줄에서 가장 높은 것의 자리. 동률이면 앞선 것 (엄격히 클 때만 바꾼다). */
  function bestIndex(queue: string[]): number {
    let best = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (ctx.cancelled) return best;
      if (prio(queue[i] as string) > prio(queue[best] as string)) best = i;
    }
    return best;
  }

  // 지평 — 마지막 도착 뒤 모든 길이를 다 돌아도 이 안에 끝난다. 넘으면 셈이 틀린 것이다.
  const horizon =
    Math.max(...procs.map((p) => p.arrive)) + procs.reduce((s, p) => s + p.length, 0);

  const queue: string[] = [];
  let running: string | null = null;
  let finished = 0;
  let tick = 0;

  while (finished < procs.length) {
    if (ctx.cancelled) return;
    if (tick > horizon) {
      throw new Error(`priority-preempt: 틱 ${horizon} 안에 끝나지 않았다`);
    }

    // 1. 끝
    let finish: string | null = null;
    if (running !== null && leftOf(running) === 0) {
      finish = running;
      running = null;
      finished += 1;
    }

    // 2. 도착
    const arrive: string[] = [];
    for (const p of procs) {
      if (ctx.cancelled) return;
      if (p.arrive === tick) {
        arrive.push(p.id);
        queue.push(p.id);
      }
    }

    // 3. 선점 — 엄격히 높을 때만
    let preempt: PriorityPreemptPayload['preempt'] = null;
    if (running !== null && queue.length > 0) {
      const top = queue[bestIndex(queue)] as string;
      if (prio(top) > prio(running)) {
        preempt = { out: running, by: top, left: leftOf(running) };
        queue.push(running);
        running = null;
      }
    }

    // 4. 고름
    let pick: string | null = null;
    if (running === null && queue.length > 0) {
      const [chosen] = queue.splice(bestIndex(queue), 1);
      if (chosen === undefined) throw new Error('priority-preempt: 줄이 비어 고를 수 없다');
      running = chosen;
      pick = chosen;
    }

    const held = arrive.filter((id) => queue.includes(id));

    if (finish !== null || arrive.length > 0 || preempt !== null || pick !== null) {
      if (!(await pause())) return;
      const leftRecord: Record<string, number> = {};
      for (const p of procs) leftRecord[p.id] = leftOf(p.id);
      await ctx.emit({
        type: 'boundary',
        payload: {
          tick,
          arrive,
          held,
          finish,
          preempt,
          pick,
          run: running,
          queue: [...queue],
          left: leftRecord,
          end: finished === procs.length,
        } satisfies PriorityPreemptPayload,
      });
    }

    // 5. 한 틱을 돈다
    if (running !== null) left.set(running, leftOf(running) - 1);
    tick += 1;
  }
}
