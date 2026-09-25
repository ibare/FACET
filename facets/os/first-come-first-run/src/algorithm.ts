/**
 * first-come-first-run — FCFS 에서 각 프로세스는 언제 시작하는가.
 *
 * 프로세스 목록을 **틱 단위로 실제로 돌려** CPU 에서 무엇이 시작되거나 CPU 가 비는 틱 경계를
 * 모으고, 그 경계 하나를 걸음 하나로 발신한다. 도착은 걸음을 만들지 않는다.
 *
 * 틱 경계 tick 에서 일어나는 차례 (공통 모형):
 *   1. 돌던 것의 남은 양이 0 이면 tick 에 끝난다 (끝이 먼저)
 *   2. tick 에 도착한 것들이 줄 끝에 선다 — 같은 틱 도착끼리는 목록 차례
 *   3. CPU 가 비었으면 줄 맨 앞을 올린다 (FCFS 라 선점도 몫도 없다)
 *   4. 한 틱을 돈다
 * 그래서 tick 에 끝난 자리에 tick 에 도착한 것이 바로 그 tick 에 오르고, 빈 틱이 생기지 않는다.
 *
 * 이벤트
 *   init   (silent) { horizon: number }  마지막 끝 틱 — 시간축의 길이. 걸음 0 을 갈아 끼운다
 *   start           { id: string; tick: number; arrival: number; prevEnd: number; end: number }
 *                   id 가 tick 에 CPU 에 오른다. prevEnd 는 앞에서 끝난 것의 끝 틱(처음이면 0),
 *                   tick 은 도착과 prevEnd 가운데 늦은 쪽이다. end = tick + 길이 (선점이 없어 오를 때 정해진다)
 *   idle            { tick: number; next: string; arrival: number }  tick 에 CPU 가 빈다 (돌던 것이 끝났고 줄에 아무도 없다).
 *                   next 는 아직 오지 않은 것 가운데 가장 먼저 올 것(같은 틱이면 목록 차례), arrival 은 그 도착 틱
 *   done            { id: string; tick: number }  마지막 프로세스 id 가 tick 에 끝나 모두 끝난다
 *
 * 데이터에 없는 프로세스 · 도착을 지어내지 않는다. 지평 안에 끝나지 않거나 모양이 틀린 데이터는 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FcfsProc = { id: string; arrival: number; length: number };

export type FirstComeFirstRunFacetData = {
  type: 'first-come-first-run';
  stepMs: number;
  procs: FcfsProc[];
};

type Boundary =
  | { kind: 'start'; id: string; tick: number; arrival: number; prevEnd: number; end: number }
  | { kind: 'idle'; tick: number; next: string; arrival: number }
  | { kind: 'done'; id: string; tick: number };

function readProcs(data: unknown): FcfsProc[] {
  if (typeof data !== 'object' || data === null) throw new Error('first-come-first-run: 데이터가 없다');
  const raw = (data as { procs?: unknown }).procs;
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('first-come-first-run: procs 가 비었다');
  const seen = new Set<string>();
  return raw.map((p: unknown, i: number) => {
    if (typeof p !== 'object' || p === null) throw new Error(`first-come-first-run: procs[${i}] 모양이 틀렸다`);
    const { id, arrival, length } = p as { id?: unknown; arrival?: unknown; length?: unknown };
    if (typeof id !== 'string' || id === '') throw new Error(`first-come-first-run: procs[${i}].id 가 없다`);
    if (seen.has(id)) throw new Error(`first-come-first-run: 식별자 ${id} 가 겹친다`);
    seen.add(id);
    if (typeof arrival !== 'number' || !Number.isInteger(arrival) || arrival < 0) {
      throw new Error(`first-come-first-run: ${id} 의 도착이 0 이상 정수가 아니다`);
    }
    if (typeof length !== 'number' || !Number.isInteger(length) || length < 1) {
      throw new Error(`first-come-first-run: ${id} 의 길이가 1 이상 정수가 아니다`);
    }
    return { id, arrival, length };
  });
}

/** 틱 단위로 FCFS 를 돌려 걸음이 될 경계를 모은다. */
function runFcfs(procs: FcfsProc[]): Boundary[] {
  const horizonLimit = procs.reduce((s, p) => Math.max(s, p.arrival), 0) + procs.reduce((s, p) => s + p.length, 0);
  const queue: FcfsProc[] = [];
  const out: Boundary[] = [];
  let running: { proc: FcfsProc; left: number } | null = null;
  let prevEnd = 0;
  let finished = 0;
  let idleOpen = false;

  for (let tick = 0; ; tick += 1) {
    if (tick > horizonLimit) throw new Error(`first-come-first-run: 틱 ${horizonLimit} 안에 끝나지 않았다`);
    // 1. 끝이 먼저
    let justEnded: FcfsProc | null = null;
    if (running !== null && running.left === 0) {
      justEnded = running.proc;
      prevEnd = tick;
      finished += 1;
      running = null;
    }
    if (finished === procs.length) {
      if (justEnded === null) throw new Error('first-come-first-run: 끝난 것 없이 모두 끝났다');
      out.push({ kind: 'done', id: justEnded.id, tick });
      return out;
    }
    // 2. 도착이 줄 끝에 선다 (목록 차례)
    for (const p of procs) if (p.arrival === tick) queue.push(p);
    // 3. CPU 가 비었으면 줄 맨 앞
    if (running === null) {
      const next = queue.shift();
      if (next !== undefined) {
        running = { proc: next, left: next.length };
        idleOpen = false;
        out.push({ kind: 'start', id: next.id, tick, arrival: next.arrival, prevEnd, end: tick + next.length });
      } else if (!idleOpen && justEnded !== null) {
        idleOpen = true;
        let next: FcfsProc | null = null;
        for (const p of procs) if (p.arrival > tick && (next === null || p.arrival < next.arrival)) next = p;
        if (next === null) throw new Error(`first-come-first-run: 틱 ${tick} 에 CPU 가 비었는데 올 것이 없다`);
        out.push({ kind: 'idle', tick, next: next.id, arrival: next.arrival });
      }
    }
    // 4. 한 틱을 돈다
    if (running !== null) running.left -= 1;
  }
}

export async function firstComeFirstRun(
  context: FacetContext<FirstComeFirstRunFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<FirstComeFirstRunFacetData>;
  const stepMs = ctx.data.stepMs;
  if (typeof stepMs !== 'number' || stepMs <= 0) throw new Error('first-come-first-run: stepMs 가 없다');
  const boundaries = runFcfs(readProcs(ctx.data));
  const last = boundaries[boundaries.length - 1];
  if (last === undefined || last.kind !== 'done') throw new Error('first-come-first-run: 끝 경계가 없다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { horizon: last.tick }, silent: true });

  // 걸음 0 은 도착 표시가 이미 읽을 것이라, 첫 발신 앞에도 stepMs 를 둔다.
  for (const b of boundaries) {
    if (!(await pause())) return;
    switch (b.kind) {
      case 'start':
        await ctx.emit({
          type: 'start',
          payload: { id: b.id, tick: b.tick, arrival: b.arrival, prevEnd: b.prevEnd, end: b.end },
        });
        break;
      case 'idle':
        await ctx.emit({ type: 'idle', payload: { tick: b.tick, next: b.next, arrival: b.arrival } });
        break;
      case 'done':
        await ctx.emit({ type: 'done', payload: { id: b.id, tick: b.tick } });
        break;
    }
  }
}
