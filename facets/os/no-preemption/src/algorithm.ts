/**
 * 비선점 — 우선순위가 높은 스레드는 CPU 를 빼앗지만, 남이 쥔 자물쇠는 빼앗지 못한다.
 *
 * 모형 (운영체제 · 동기화 배치 공통 규약 + 이 조각의 규약):
 * - CPU 는 하나. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행하거나 실행하려다 막힌다.
 *   막힌 시도도 한 틱이다.
 * - 누가 틱을 받는가 — 돌림이 아니라 **우선순위**. 틱마다 준비된 스레드(와 있고 · 잠들지 않고 ·
 *   끝나지 않은) 가운데 우선순위가 가장 높은 것이 한 줄을 실행한다 (틱 경계에서 CPU 를 빼앗는다).
 *   우선순위가 같으면 스레드 목록 차례가 앞선 쪽.
 * - `lock(m)`: 비었으면 잡고 다음 줄로. 남이 쥐었으면 그 틱에 잠들어 m 의 줄 끝에 선다.
 * - `unlock(m)`: 줄이 있으면 맨 앞에게 곧바로 넘긴다 — 넘겨받은 쪽은 깨어나 `lock(m)` 을 다시
 *   실행하지 않고 그다음 줄부터 이어 간다. 줄이 없으면 비운다. 놓는 틱과 넘겨받는 틱은 같은 틱이다.
 * - `work()`: 한 줄 실행.
 * - CPU 넘어감 = 이웃한 두 틱의 실행 스레드가 다른 자리.
 * - 자물쇠 주인 바뀜 = 한 스레드의 손에서 다른 스레드의 손으로 곧바로 옮겨 간 자리 (넘겨주기).
 * - 셈할 수 없는 상태는 던진다 — 모르는 줄 모양 · 없는 자물쇠 · 주인 아닌 스레드의 unlock ·
 *   준비된 스레드가 없는 틱(교착 · 빈 틱. 이 조각은 그리지 않는다).
 *
 * 이벤트 (모두 silent 아님, 한 틱에 하나):
 * - `tick` — payload:
 *   {
 *     tick: number,                 // 0 부터
 *     thread: string,               // 이 틱에 CPU 를 받은 스레드
 *     line: number,                 // 실행한 줄 (0 부터)
 *     op: 'take' | 'block' | 'work' | 'handoff' | 'release',
 *     lock: string | null,          // 이 줄이 건드린 자물쇠
 *     cpuFrom: string | null,       // 앞 틱에 CPU 를 쥐었던 스레드 (첫 틱이면 null)
 *     cpuFromLine: number | null,   // 앞 틱에 그 스레드가 실행한 줄
 *     lockFrom: string | null,      // 이 틱 앞 lock 의 주인
 *     lockTo: string | null,        // 이 틱 뒤 lock 의 주인
 *     arrived: string[],            // 이 틱에 온 스레드
 *     owners: [string, string | null][],   // 틱 뒤 자물쇠마다 주인
 *     queues: [string, string[]][],        // 틱 뒤 자물쇠마다 줄
 *     pcs: [string, number][],             // 틱 뒤 스레드마다 다음 줄
 *     asleep: string[], done: string[], present: string[],  // 틱 뒤 잠든 · 끝난 · 와 있는 스레드
 *     sleepTicks: [string, number][],      // 스레드마다 지금까지 잠들어 있던 틱 수
 *     switches: number,             // 지금까지 CPU 넘어감 수
 *     ownerChanges: number,         // 지금까지 자물쇠 주인 바뀜 수
 *   }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NoPreemptionThread = {
  id: string;
  priority: number;
  arrive: number;
  lines: string[];
};

export interface NoPreemptionFacetData {
  type: 'no-preemption';
  stepMs: number;
  locks: string[];
  threads: NoPreemptionThread[];
}

type Op =
  | { kind: 'lock'; lock: string }
  | { kind: 'unlock'; lock: string }
  | { kind: 'work' };

/** 줄 글자를 한 가지 동작으로 읽는다. 모르는 모양은 던진다. */
export function parseNoPreemptionLine(text: string, threadId: string, line: number): Op {
  const s = text.trim();
  if (s === 'work()') return { kind: 'work' };
  const m = /^(lock|unlock)\(([A-Za-z_][A-Za-z0-9_]*)\)$/.exec(s);
  if (m) {
    const lock = m[2];
    if (lock === undefined) throw new Error(`no-preemption: ${threadId} 줄 ${line} — 자물쇠 이름이 없다`);
    return m[1] === 'lock' ? { kind: 'lock', lock } : { kind: 'unlock', lock };
  }
  throw new Error(`no-preemption: ${threadId} 줄 ${line} — 모르는 줄 모양 "${text}"`);
}

export async function noPreemption(
  context: FacetContext<NoPreemptionFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<NoPreemptionFacetData>;
  const { stepMs, locks, threads } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const ops = new Map<string, Op[]>();
  for (const th of threads) {
    ops.set(th.id, th.lines.map((text, i) => parseNoPreemptionLine(text, th.id, i)));
  }

  const owner = new Map<string, string | null>();
  const queue = new Map<string, string[]>();
  for (const name of locks) {
    owner.set(name, null);
    queue.set(name, []);
  }
  const pc = new Map<string, number>();
  const sleepTicks = new Map<string, number>();
  for (const th of threads) {
    pc.set(th.id, 0);
    sleepTicks.set(th.id, 0);
  }
  const asleep = new Set<string>();
  const done = new Set<string>();
  const present = new Set<string>();

  let prevRunner: string | null = null;
  let prevLine: number | null = null;
  let switches = 0;
  let ownerChanges = 0;

  function lockOf(name: string, threadId: string, line: number): void {
    if (!owner.has(name)) {
      throw new Error(`no-preemption: ${threadId} 줄 ${line} — 없는 자물쇠 "${name}"`);
    }
  }

  // 걸음 0(두 스레드의 프로그램 · 빈 자물쇠)이 이미 읽을 화면이라 첫 틱 앞에도 틈을 둔다.
  for (let tick = 0; ; tick += 1) {
    if (ctx.cancelled) return;
    if (threads.every((th) => done.has(th.id))) return;
    if (!(await pause())) return;

    const arrived: string[] = [];
    for (const th of threads) {
      if (th.arrive === tick) {
        present.add(th.id);
        arrived.push(th.id);
      }
    }

    let runner: NoPreemptionThread | null = null;
    for (const th of threads) {
      if (!present.has(th.id) || asleep.has(th.id) || done.has(th.id)) continue;
      if (runner === null || th.priority > runner.priority) runner = th;
    }
    if (runner === null) {
      throw new Error(`no-preemption: 틱 ${tick} — 준비된 스레드가 없다 (교착 또는 빈 틱은 그리지 않는다)`);
    }

    const id = runner.id;
    const line = pc.get(id);
    const prog = ops.get(id);
    if (line === undefined || prog === undefined) throw new Error(`no-preemption: 스레드 ${id} 의 자리가 없다`);
    const op = prog[line];
    if (op === undefined) throw new Error(`no-preemption: ${id} 줄 ${line} — 줄이 없다`);

    let kind: 'take' | 'block' | 'work' | 'handoff' | 'release';
    let lockName: string | null = null;
    let lockFrom: string | null = null;
    let lockTo: string | null = null;

    if (op.kind === 'work') {
      kind = 'work';
      pc.set(id, line + 1);
    } else if (op.kind === 'lock') {
      lockOf(op.lock, id, line);
      lockName = op.lock;
      const holder = owner.get(op.lock) ?? null;
      lockFrom = holder;
      if (holder === null) {
        owner.set(op.lock, id);
        lockTo = id;
        kind = 'take';
        pc.set(id, line + 1);
      } else {
        if (holder === id) throw new Error(`no-preemption: ${id} 줄 ${line} — 이미 쥔 자물쇠를 다시 잡는다`);
        const q = queue.get(op.lock);
        if (q === undefined) throw new Error(`no-preemption: 자물쇠 ${op.lock} 의 줄이 없다`);
        q.push(id);
        asleep.add(id);
        lockTo = holder;
        kind = 'block';
      }
    } else {
      lockOf(op.lock, id, line);
      lockName = op.lock;
      const holder = owner.get(op.lock) ?? null;
      if (holder !== id) {
        throw new Error(`no-preemption: ${id} 줄 ${line} — 주인 아닌 스레드의 unlock(${op.lock})`);
      }
      lockFrom = holder;
      pc.set(id, line + 1);
      const q = queue.get(op.lock);
      if (q === undefined) throw new Error(`no-preemption: 자물쇠 ${op.lock} 의 줄이 없다`);
      const next = q.shift();
      if (next === undefined) {
        owner.set(op.lock, null);
        lockTo = null;
        kind = 'release';
      } else {
        owner.set(op.lock, next);
        asleep.delete(next);
        const npc = pc.get(next);
        if (npc === undefined) throw new Error(`no-preemption: 스레드 ${next} 의 자리가 없다`);
        pc.set(next, npc + 1);
        lockTo = next;
        ownerChanges += 1;
        kind = 'handoff';
      }
    }

    const after = pc.get(id);
    if (after === undefined) throw new Error(`no-preemption: 스레드 ${id} 의 자리가 없다`);
    if (after >= prog.length) done.add(id);

    if (prevRunner !== null && prevRunner !== id) switches += 1;
    const cpuFrom = prevRunner;
    const cpuFromLine = prevLine;
    prevRunner = id;
    prevLine = line;

    // 잠든 틱 — 이 틱이 끝날 때 잠들어 있는 스레드마다 하나 (막힌 시도의 틱도 센다).
    for (const s of asleep) {
      const n = sleepTicks.get(s);
      if (n === undefined) throw new Error(`no-preemption: 스레드 ${s} 의 잠든 틱 수가 없다`);
      sleepTicks.set(s, n + 1);
    }

    await ctx.emit({
      type: 'tick',
      payload: {
        tick,
        thread: id,
        line,
        op: kind,
        lock: lockName,
        cpuFrom,
        cpuFromLine,
        lockFrom,
        lockTo,
        arrived,
        owners: [...owner.entries()],
        queues: [...queue.entries()].map(([k, v]) => [k, [...v]]),
        pcs: [...pc.entries()],
        asleep: [...asleep],
        done: [...done],
        present: [...present],
        sleepTicks: [...sleepTicks.entries()],
        switches,
        ownerChanges,
      },
    });
  }
}
