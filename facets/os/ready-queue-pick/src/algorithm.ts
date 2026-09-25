/**
 * ready-queue-pick — 준비 큐에 서고, CPU 가 비는 순간에만 앞에서 빠져 오른다.
 *
 * 모형 (운영체제 · 스케줄링 공통 규약):
 *   - 시각의 단위는 틱(정수). 틱 경계 tick 에서 한 틱을 돈다 = tick 에서 tick+1 까지 CPU 를 쓴다.
 *   - CPU 하나 · 입출력 없음 · 바꾸는 비용 0. 정책 FCFS(줄 맨 앞을 고른다), 선점 없음.
 *   - 틱 경계에서 겹친 일의 차례:
 *       1. 돌던 것의 남은 양이 0 이면 그 틱에 끝난다 (끝이 먼저)
 *       2. 그 틱에 도착한 것들이 줄 끝에 선다 — 같은 틱 도착끼리는 데이터 목록 차례
 *       3. CPU 가 비었으면 줄 맨 앞이 빠져 오른다
 *       4. 한 틱을 돈다
 *     그래서 끝난 자리에 같은 틱 도착이 바로 오를 수 있고, 도착했을 때 줄과 CPU 가 다 비었으면
 *     줄에 섰다가 곧바로 빠지는 것이 곧장 오르는 것이 된다.
 *
 * 걸음 = 줄이나 CPU 자리가 바뀐 틱 경계 하나. 바뀐 것이 없는 틱은 걸음이 아니다.
 *
 * 이벤트
 *   - `boundary` (silent 아님) — 한 틱 경계에서 일어난 일
 *       payload: {
 *         tick: number;               // 틱 경계
 *         finished: string | null;    // 이 틱에 끝나 CPU 에서 내려온 것
 *         arrived: string[];          // 이 틱에 도착해 줄 끝에 선 것들 (목록 차례)
 *         picked: string | null;      // 줄 맨 앞에서 빠져 CPU 에 오른 것
 *       }
 *
 * `ctx.metric` 은 부르지 않는다. 자동 재생이 끝나면 그냥 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReadyQueueProc = {
  /** 식별자. 화면에는 대문자 기호로 보인다 (`p1` → `P1`). */
  id: string;
  /** 도착 틱 */
  arrive: number;
  /** CPU 를 써야 하는 틱 수 */
  burst: number;
};

export type ReadyQueuePickFacetData = {
  type: 'ready-queue-pick';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 프로세스 목록. 목록 차례가 곧 같은 틱 도착의 줄 서는 차례다. */
  procs: ReadyQueueProc[];
};

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** 자료를 확인한다. 셈할 수 없는 모양은 조용히 넘기지 않고 던진다. */
function checkProcs(procs: unknown): ReadyQueueProc[] {
  if (!Array.isArray(procs) || procs.length === 0) {
    throw new Error('ready-queue-pick: procs 가 비었거나 배열이 아니다');
  }
  const seen = new Set<string>();
  return procs.map((raw: unknown, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`ready-queue-pick: procs[${i}] 가 객체가 아니다`);
    }
    const rec = raw as Record<string, unknown>;
    const { id, arrive, burst } = rec;
    if (typeof id !== 'string' || id === '') {
      throw new Error(`ready-queue-pick: procs[${i}].id 가 없다`);
    }
    if (seen.has(id)) throw new Error(`ready-queue-pick: 식별자 ${id} 가 겹친다`);
    seen.add(id);
    if (!isNonNegInt(arrive)) throw new Error(`ready-queue-pick: ${id} 의 도착이 0 이상의 정수가 아니다`);
    if (!isNonNegInt(burst) || burst < 1) throw new Error(`ready-queue-pick: ${id} 의 길이가 1 이상의 정수가 아니다`);
    return { id, arrive, burst };
  });
}

export async function readyQueuePick(
  baseCtx: FacetContext<ReadyQueuePickFacetData>,
): Promise<void> {
  const ctx = baseCtx as ReactiveContext<ReadyQueuePickFacetData>;
  const { stepMs } = ctx.data;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('ready-queue-pick: stepMs 가 양수가 아니다');
  }
  const procs = checkProcs(ctx.data.procs);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 모두가 끝나려면 이 틱을 넘길 수 없다 — 넘기면 모형이 어긋난 것이다.
  let horizon = 0;
  for (const p of procs) horizon = Math.max(horizon, p.arrive);
  for (const p of procs) horizon += p.burst;

  const left = new Map<string, number>();
  for (const p of procs) left.set(p.id, p.burst);
  const queue: string[] = [];
  let running: string | null = null;
  let doneCount = 0;

  // 걸음 0(빈 줄 · 빈 CPU · 아직 오지 않은 것들)은 읽을 것이 있는 화면이라 틈을 준다.
  if (!(await pause())) return;

  for (let tick = 0; doneCount < procs.length; tick += 1) {
    if (ctx.cancelled) return;
    if (tick > horizon) {
      throw new Error(`ready-queue-pick: 틱 ${horizon} 안에 끝나지 않았다`);
    }

    // 1. 끝
    let finished: string | null = null;
    if (running !== null) {
      const rest = left.get(running);
      if (rest === undefined) throw new Error(`ready-queue-pick: 모르는 식별자 ${running}`);
      if (rest === 0) {
        finished = running;
        running = null;
        doneCount += 1;
      }
    }

    // 2. 도착 — 줄 끝에 선다
    const arrived: string[] = [];
    for (const p of procs) {
      if (p.arrive === tick) {
        queue.push(p.id);
        arrived.push(p.id);
      }
    }

    // 3. 고름 — CPU 가 비었을 때만 줄 맨 앞
    let picked: string | null = null;
    if (running === null) {
      const front = queue.shift();
      if (front !== undefined) {
        picked = front;
        running = front;
      }
    }

    if (finished !== null || arrived.length > 0 || picked !== null) {
      await ctx.emit({ type: 'boundary', payload: { tick, finished, arrived, picked } });
      if (!(await pause())) return;
    }

    // 4. 한 틱을 돈다
    if (running !== null) {
      const rest = left.get(running);
      if (rest === undefined) throw new Error(`ready-queue-pick: 모르는 식별자 ${running}`);
      left.set(running, rest - 1);
    }
  }
}
