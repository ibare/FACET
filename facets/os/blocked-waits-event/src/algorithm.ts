/**
 * blocked-waits-event — 잠든 프로세스를 깨우는 것은 사건이다.
 *
 * 프로세스 몇이 CPU 하나를 나눠 쓴다. CPU 할 일을 다 쓰면 다음 할 일로 넘어가는데,
 * 그것이 "사건 기다림" 이면 그 사건의 대기 줄 끝에 선다. 사건이 도착하면 **그 사건의 줄**
 * 맨 앞 하나만 준비 줄 끝으로 옮겨 간다.
 *
 * 규약 (사양 그대로 — 하나라도 다르게 짜면 걸음 수 · 차례가 달라진다):
 *   - 시간은 틱(단위 없는 정수). CPU 는 하나. 준비 줄 · 대기 줄은 온 차례
 *   - 빼앗기 없음. CPU 할 일을 다 쓰거나 잠들 때만 CPU 를 내놓는다
 *   - 대기 줄은 사건마다 하나. 사건 하나는 제 줄 맨 앞 **하나**를 깨운다
 *   - 깬 프로세스는 준비 줄 끝으로 간다 (곧장 실행으로 가지 않는다)
 *   - 같은 틱의 차례: (1) 실행 중인 것이 이 틱에 제 몫을 다 썼으면 다음 할 일로
 *     (잠들거나 끝난다) → (2) 이 틱에 도착한 사건이 제 줄을 깨운다 (도착 차례, 같은 틱이면
 *     데이터에 적힌 사건 차례) → (3) CPU 가 비었으면 준비 줄 맨 앞을 올린다
 *   - 사건의 도착: `at` 은 바깥에서 정한 틱, `after` 는 기다림을 건 틱 + after
 *   - 한 걸음 = 무언가 일어나는 틱 하나 (그 틱의 일 전부). 일이 없는 틱은 걸음이 아니다
 *
 * 이벤트
 *   - `init` (silent) — payload `{ horizon: number }`
 *       마지막 틱. 그림이 CPU 띠의 칸 수를 정하는 데 쓴다
 *   - `tick` — payload `{ tick: number; idle: number; happenings: Happening[] }`
 *       `idle` 은 앞 걸음 뒤로 이 틱 앞까지 CPU 가 비어 있던 틱 수.
 *       `happenings` 는 그 틱에 일어난 일, 일어난 차례대로:
 *         `{ kind: 'done';  proc: string }`
 *         `{ kind: 'sleep'; proc: string; event: string; due: number | null }`
 *             `due` — `after` 사건이면 도착할 틱, `at` 사건이면 null (이미 정해져 있다)
 *         `{ kind: 'wake';  proc: string; event: string; slept: number }`
 *             `slept` — 잠들어 있던 틱 수
 *         `{ kind: 'run';   proc: string }`
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WorkItem = { do: 'cpu'; ticks: number } | { do: 'wait'; event: string };

export type ProcSpec = { id: string; work: WorkItem[] };

/** 사건 — `at`(바깥에서 정한 틱) 과 `after`(기다림을 건 틱에서 몇 틱 뒤) 중 하나만. */
export type EventSpec = { id: string; at?: number; after?: number };

export type BlockedWaitsEventFacetData = {
  type: 'blocked-waits-event';
  stepMs: number;
  procs: ProcSpec[];
  events: EventSpec[];
};

export type Happening =
  | { kind: 'done'; proc: string }
  | { kind: 'sleep'; proc: string; event: string; due: number | null }
  | { kind: 'wake'; proc: string; event: string; slept: number }
  | { kind: 'run'; proc: string };

export type TickRecord = { tick: number; idle: number; happenings: Happening[] };

/** 이 틱 안에 끝나지 않으면 데이터가 틀린 것으로 본다. */
const TICK_LIMIT = 500;

/**
 * 데이터와 규약만으로 틱을 굴려 걸음표를 얻는다. 순수 셈이다.
 * 모형에 없는 모양(cpu 뒤 cpu · 기다리는 것 없는 사건 · 모르는 사건)은 던진다.
 */
export function simulate(data: BlockedWaitsEventFacetData): { records: TickRecord[]; horizon: number } {
  const events = new Map<string, EventSpec>();
  for (const ev of data.events) {
    const hasAt = typeof ev.at === 'number';
    const hasAfter = typeof ev.after === 'number';
    if (hasAt === hasAfter) throw new Error(`사건 ${ev.id}: at 과 after 중 하나만 적는다`);
    if (events.has(ev.id)) throw new Error(`사건 ${ev.id} 가 두 번 적혔다`);
    events.set(ev.id, ev);
  }
  const procs = new Map<string, ProcSpec>();
  for (const p of data.procs) {
    if (procs.has(p.id)) throw new Error(`프로세스 ${p.id} 가 두 번 적혔다`);
    if (p.work.length === 0) throw new Error(`프로세스 ${p.id} 에 할 일이 없다`);
    for (const w of p.work) {
      if (w.do === 'wait' && !events.has(w.event)) throw new Error(`프로세스 ${p.id}: 모르는 사건 ${w.event}`);
      if (w.do === 'cpu' && !(Number.isInteger(w.ticks) && w.ticks > 0)) {
        throw new Error(`프로세스 ${p.id}: CPU 틱은 양의 정수여야 한다`);
      }
    }
    procs.set(p.id, p);
  }

  const pos = new Map<string, number>();
  const sleptAt = new Map<string, number>();
  const finished = new Set<string>();
  const ready: string[] = data.procs.map((p) => p.id);
  const waitq = new Map<string, string[]>(data.events.map((e) => [e.id, [] as string[]]));
  const pending: { event: string; at: number }[] = [];
  for (const ev of data.events) if (typeof ev.at === 'number') pending.push({ event: ev.id, at: ev.at });
  for (const p of data.procs) pos.set(p.id, 0);

  let running: string | null = null;
  let left = 0;
  let idle = 0;
  const records: TickRecord[] = [];

  function workOf(id: string): WorkItem {
    const spec = procs.get(id);
    const at = pos.get(id);
    if (spec === undefined || at === undefined) throw new Error(`모르는 프로세스 ${id}`);
    const w = spec.work[at];
    if (w === undefined) throw new Error(`프로세스 ${id}: ${at} 번째 할 일이 없다`);
    return w;
  }

  for (let tick = 0; tick <= TICK_LIMIT; tick += 1) {
    const happenings: Happening[] = [];

    // (1) 실행 중인 것이 제 몫을 이 틱에 다 썼으면 다음 할 일로
    if (running !== null && left === 0) {
      const p = running;
      running = null;
      const cur = pos.get(p);
      const spec = procs.get(p);
      if (cur === undefined || spec === undefined) throw new Error(`모르는 프로세스 ${p}`);
      const next = cur + 1;
      pos.set(p, next);
      if (next >= spec.work.length) {
        finished.add(p);
        happenings.push({ kind: 'done', proc: p });
      } else {
        const w = workOf(p);
        if (w.do !== 'wait') throw new Error(`프로세스 ${p}: cpu 뒤 cpu 는 이 모형에 없다`);
        const q = waitq.get(w.event);
        const ev = events.get(w.event);
        if (q === undefined || ev === undefined) throw new Error(`모르는 사건 ${w.event}`);
        q.push(p);
        sleptAt.set(p, tick);
        let due: number | null = null;
        if (typeof ev.after === 'number') {
          due = tick + ev.after;
          pending.push({ event: ev.id, at: due });
        }
        happenings.push({ kind: 'sleep', proc: p, event: w.event, due });
        pos.set(p, next + 1); // 깨면 다음 할 일(cpu)로
      }
    }

    // (2) 이 틱에 도착한 사건이 제 줄의 맨 앞 하나만 깨운다
    // 같은 틱에 온 사건은 데이터(`events`)에 적힌 차례로 깨운다
    const eventOrder = (id: string): number => data.events.findIndex((e) => e.id === id);
    const arriving = pending
      .filter((x) => x.at === tick)
      .sort((a, b) => eventOrder(a.event) - eventOrder(b.event));
    for (const arr of arriving) {
      pending.splice(pending.indexOf(arr), 1);
      const q = waitq.get(arr.event);
      if (q === undefined) throw new Error(`모르는 사건 ${arr.event}`);
      const p = q.shift();
      if (p === undefined) throw new Error(`틱 ${tick}: ${arr.event} 를 기다리는 것이 없다`);
      const since = sleptAt.get(p);
      if (since === undefined) throw new Error(`프로세스 ${p}: 잠든 틱이 없다`);
      sleptAt.delete(p);
      ready.push(p);
      happenings.push({ kind: 'wake', proc: p, event: arr.event, slept: tick - since });
    }

    // (3) CPU 가 비었으면 준비 줄 맨 앞을 올린다
    if (running === null) {
      const p = ready.shift();
      if (p !== undefined) {
        const w = workOf(p);
        if (w.do !== 'cpu') throw new Error(`프로세스 ${p}: 준비 줄의 것은 cpu 할 일이 앞에 있어야 한다`);
        running = p;
        left = w.ticks;
        happenings.push({ kind: 'run', proc: p });
      }
    }

    if (happenings.length > 0) {
      records.push({ tick, idle, happenings });
      idle = 0;
    }
    if (finished.size === procs.size) {
      if (pending.length > 0) throw new Error(`모두 끝났는데 오지 않은 사건이 남았다: ${pending[0]?.event}`);
      return { records, horizon: tick };
    }
    if (running === null) idle += 1;
    else left -= 1;
  }
  throw new Error(`${TICK_LIMIT} 틱 안에 끝나지 않았다`);
}

export async function blockedWaitsEvent(context: FacetContext<BlockedWaitsEventFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BlockedWaitsEventFacetData>;
  const { stepMs } = ctx.data;
  const { records, horizon } = simulate(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { horizon }, silent: true });

  // 걸음 0(셋이 준비 줄에 선 화면)을 읽을 틈을 두고 첫 틱으로 간다.
  for (const rec of records) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'tick',
      payload: { tick: rec.tick, idle: rec.idle, happenings: rec.happenings },
    });
  }
}
