/**
 * demote-on-overuse — 여러 단의 줄(다단계 피드백 큐)에서 몫을 다 쓴 프로세스가 아래 줄로 내려앉는다.
 *
 * 모형 (틱 단위 · CPU 하나 · 입출력 없음 · 바꾸는 비용 0 · 선점 없음 · 승급 없음):
 *   - 줄 k 의 몫은 quanta[k]. 맨 아래 줄은 더 내려가지 않는다
 *   - 고름 = 가장 위의 비지 않은 줄의 맨 앞. 같은 줄 안은 먼저 선 것이 먼저
 *   - 틱 경계 tick 에서 일어나는 차례 (이 차례가 t8 의 도착과 몫 다 씀을 가른다):
 *       1. 돌던 것의 남은 양이 0 이면 tick 에 끝난다 (끝이 먼저)
 *       2. 몫을 다 썼는데 남은 양이 있으면 CPU 에서 내려와 한 단 아래 줄로 정해진다 (아직 서지 않는다)
 *       3. tick 에 도착한 것들이 줄 0 끝에 선다 (같은 틱끼리는 목록 차례)
 *       4. 2 에서 내려온 것이 제 줄 끝에 선다
 *       5. CPU 가 비었으면 고른다
 *       6. 한 틱을 돈다
 *
 * 이벤트
 *   boundary — 사건이 있는 틱 경계 하나 = 걸음 하나. silent 아님.
 *     payload {
 *       tick: number
 *       finished: { id: string; level: number; used: number } | null
 *           — 이 틱에 끝난 것. used = 마지막으로 오른 뒤 쓴 틱 수 (몫 안)
 *       demoted: { id: string; from: number; to: number; used: number; left: number } | null
 *           — 몫을 다 써 내려온 것. from === to 면 맨 아래라 그 줄 끝에 그대로. left = 남은 양
 *       arrived: string[]          — 이 틱에 도착해 줄 0 에 선 것 (목록 차례)
 *       ran: { id: string; level: number } | null — 이 틱에 CPU 에 오른 것과 그 줄
 *       queues: string[][]         — 이 걸음이 끝난 뒤 줄마다 서 있는 차례 (오른 것은 빠진 뒤)
 *     }
 *
 * 걸음 0 은 빈 줄 셋이다 — 장면의 initial() 이 initialData 에서 세운다. 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DemoteProc = {
  id: string;
  arrive: number;
  burst: number;
};

export type DemoteOnOveruseFacetData = {
  type: 'demote-on-overuse';
  stepMs: number;
  /** 줄마다의 몫 (틱). 0 이 맨 위 */
  quanta: number[];
  /** 목록 차례가 같은 틱 도착의 줄 서는 차례 */
  procs: DemoteProc[];
};

function isCount(n: unknown, min: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min;
}

/** 자료를 확인한다. 셈할 수 없는 모양은 던진다 (C6). 장면도 같은 확인을 쓴다. */
export function checkDemoteData(data: unknown): DemoteOnOveruseFacetData {
  if (typeof data !== 'object' || data === null) throw new Error('demote-on-overuse: 자료가 없다');
  const d = data as Record<string, unknown>;
  const quanta = d['quanta'];
  const procs = d['procs'];
  const stepMs = d['stepMs'];
  if (!isCount(stepMs, 0)) throw new Error('demote-on-overuse: stepMs 가 0 이상의 정수가 아니다');
  if (!Array.isArray(quanta) || quanta.length === 0) throw new Error('demote-on-overuse: quanta 가 비었다');
  quanta.forEach((q, i) => {
    if (!isCount(q, 1)) throw new Error(`demote-on-overuse: 줄 ${i} 의 몫이 1 이상의 정수가 아니다`);
  });
  if (!Array.isArray(procs) || procs.length === 0) throw new Error('demote-on-overuse: procs 가 비었다');
  const seen = new Set<string>();
  const list: DemoteProc[] = procs.map((p, i) => {
    if (typeof p !== 'object' || p === null) throw new Error(`demote-on-overuse: procs[${i}] 가 객체가 아니다`);
    const r = p as Record<string, unknown>;
    const id = r['id'];
    const arrive = r['arrive'];
    const burst = r['burst'];
    if (typeof id !== 'string' || id === '') throw new Error(`demote-on-overuse: procs[${i}] 의 id 가 없다`);
    if (seen.has(id)) throw new Error(`demote-on-overuse: id ${id} 가 겹친다`);
    seen.add(id);
    if (!isCount(arrive, 0)) throw new Error(`demote-on-overuse: ${id} 의 도착이 0 이상의 정수가 아니다`);
    if (!isCount(burst, 1)) throw new Error(`demote-on-overuse: ${id} 의 길이가 1 이상의 정수가 아니다`);
    return { id, arrive, burst };
  });
  return {
    type: 'demote-on-overuse',
    stepMs,
    quanta: (quanta as number[]).slice(),
    procs: list,
  };
}

type Live = { id: string; arrive: number; left: number; level: number; ended: boolean };

export async function demoteOnOveruse(
  context: FacetContext<DemoteOnOveruseFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DemoteOnOveruseFacetData>;
  const data = checkDemoteData(ctx.data);
  const { quanta, stepMs } = data;
  const bottom = quanta.length - 1;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const live: Live[] = data.procs.map((p) => ({
    id: p.id,
    arrive: p.arrive,
    left: p.burst,
    level: 0,
    ended: false,
  }));
  const byId = new Map(live.map((p) => [p.id, p]));
  const queues: string[][] = quanta.map(() => []);
  const find = (id: string): Live => {
    const p = byId.get(id);
    if (p === undefined) throw new Error(`demote-on-overuse: 모르는 식별자 ${id}`);
    return p;
  };

  // 지평 — 모두가 끝나야 하는 마지막 틱. 넘으면 셈이 틀린 것이다
  const horizon =
    Math.max(...data.procs.map((p) => p.arrive)) + data.procs.reduce((s, p) => s + p.burst, 0);

  let running: string | null = null;
  let used = 0;

  for (let tick = 0; ; tick += 1) {
    if (ctx.cancelled) return;
    if (tick > horizon) throw new Error(`demote-on-overuse: 틱 ${horizon} 안에 끝나지 않는다`);

    let finished: { id: string; level: number; used: number } | null = null;
    let demoted: { id: string; from: number; to: number; used: number; left: number } | null = null;

    // 1 · 2 — 끝, 몫 다 씀
    if (running !== null) {
      const p = find(running);
      const quantum = quanta[p.level];
      if (quantum === undefined) throw new Error(`demote-on-overuse: 줄 ${p.level} 이 없다`);
      if (p.left === 0) {
        p.ended = true;
        finished = { id: p.id, level: p.level, used };
        running = null;
      } else if (used === quantum) {
        const from = p.level;
        p.level = Math.min(from + 1, bottom);
        demoted = { id: p.id, from, to: p.level, used, left: p.left };
        running = null;
      }
    }

    // 3 — 도착은 줄 0 끝에
    const arrived: string[] = [];
    for (const p of live) {
      if (p.arrive !== tick) continue;
      p.level = 0;
      queues[0]!.push(p.id);
      arrived.push(p.id);
    }

    // 4 — 내려온 것은 제 줄 끝에
    if (demoted !== null) {
      const q = queues[demoted.to];
      if (q === undefined) throw new Error(`demote-on-overuse: 줄 ${demoted.to} 이 없다`);
      q.push(demoted.id);
    }

    // 5 — 가장 위의 비지 않은 줄의 맨 앞
    let ran: { id: string; level: number } | null = null;
    if (running === null) {
      const level = queues.findIndex((q) => q.length > 0);
      if (level >= 0) {
        const id = queues[level]!.shift();
        if (id === undefined) throw new Error('demote-on-overuse: 빈 줄에서 골랐다');
        running = id;
        used = 0;
        ran = { id, level };
      }
    }

    if (finished !== null || demoted !== null || arrived.length > 0 || ran !== null) {
      if (!(await pause())) return;
      await ctx.emit({
        type: 'boundary',
        payload: {
          tick,
          finished,
          demoted,
          arrived,
          ran,
          queues: queues.map((q) => q.slice()),
        },
      });
    }

    if (live.every((p) => p.ended)) return;

    // 6 — 한 틱을 돈다
    if (running !== null) {
      const p = find(running);
      p.left -= 1;
      used += 1;
    }
  }
}
