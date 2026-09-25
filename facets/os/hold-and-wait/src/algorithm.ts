/**
 * hold-and-wait 알고리즘 — 스레드 셋과 자물쇠 둘을 한 틱씩 실제로 돌린다.
 *
 * 규약 (공통 안내문 · 사양 그대로):
 * - CPU 는 하나. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행하거나 실행하려다 막힌다. 막힌 시도도 한 틱이다.
 * - 돌림: 스레드 목록 차례로 돌며 준비된 스레드에게 한 줄씩. 잠든 · 끝난 · 아직 오지 않은 스레드는 건너뛴다.
 *   첫 틱은 목록 맨 앞(준비된 것 가운데). 온 스레드는 온 틱부터 차례에 든다.
 * - lock(m): 비었으면 잡고 다음 줄로. 남이 쥐었으면 그 틱에 잠들어 m 의 줄 끝에 선다.
 * - unlock(m): 줄이 있으면 맨 앞에게 곧바로 넘긴다 — 넘겨받은 스레드는 깨어나 lock 다음 줄부터 이어 간다.
 *   줄이 없으면 비운다. 놓는 틱과 넘겨받는 틱은 같은 틱이다.
 * - work(): 그 스레드가 쥔 자물쇠를 모두 쓰는 줄로 본다.
 * - 준비된 스레드가 없는데 끝나지 않은 스레드가 있으면 셈할 수 없다 — 던진다 (이 조각의 자료에는 고리가 없다).
 *   아직 오지 않은 스레드를 기다리는 빈 틱도 모형 밖이라 던진다.
 *
 * 이벤트:
 * - `tick` (silent 아님) — 한 틱에 한 번. 걸음 k (k ≥ 1) = 틱 k−1.
 *   payload: {
 *     tick: number,                 // 0 부터
 *     thread: string,               // 이 틱을 받은 스레드
 *     was: string | null,           // 앞 틱을 받은 스레드 (첫 틱은 null)
 *     line: number,                 // 실행(또는 시도)한 줄 번호, 0 부터
 *     kind: 'take' | 'block' | 'work' | 'release',
 *     lock: string | null,          // take · block · release 의 자물쇠
 *     owner: string | null,         // block 일 때 그 자물쇠의 주인
 *     to: string | null,            // release 가 넘겨준 스레드 (비웠으면 null)
 *     arrived: string[],            // 이 틱에 온 스레드
 *     threads: { id: string, state: 'new' | 'ready' | 'blocked' | 'done', pc: number, waited: number }[],
 *     locks: { id: string, owner: string | null, queue: string[], idle: number, used: number }[],
 *   }
 *   waited = 그 스레드가 잠든 채 지난 틱 수, idle = 주인이 잠든 채 쥐고 있던 틱 수, used = 쥔 채 work() 가 돈 틱 수.
 *   모두 이 틱을 마친 뒤의 값이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HoldAndWaitThread = {
  id: string;
  arrive: number;
  lines: string[];
};

export type HoldAndWaitFacetData = {
  type: 'hold-and-wait';
  stepMs: number;
  locks: string[];
  threads: HoldAndWaitThread[];
};

type Op = { op: 'lock' | 'unlock'; lock: string } | { op: 'work' };
type ThreadState = 'new' | 'ready' | 'blocked' | 'done';

const TICK_LIMIT = 200;

/** 줄 글자 하나를 연산으로 읽는다. 모르는 모양은 줄 번호를 담아 던진다. */
export function parseLine(text: string, thread: string, index: number, locks: readonly string[]): Op {
  const m = /^(lock|unlock)\((\w+)\)$/.exec(text);
  if (m) {
    const name = m[2];
    if (name === undefined || !locks.includes(name)) {
      throw new Error(`hold-and-wait: ${thread} 줄 ${index}: 없는 자물쇠 "${text}"`);
    }
    return { op: m[1] === 'lock' ? 'lock' : 'unlock', lock: name };
  }
  if (text === 'work()') return { op: 'work' };
  throw new Error(`hold-and-wait: ${thread} 줄 ${index}: 모르는 줄 "${text}"`);
}

export async function holdAndWait(ctx0: FacetContext<HoldAndWaitFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<HoldAndWaitFacetData>;
  const { stepMs, locks, threads } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const order = threads.map((th) => th.id);
  const programs = new Map<string, Op[]>();
  for (const th of threads) {
    programs.set(th.id, th.lines.map((text, i) => parseLine(text, th.id, i, locks)));
  }
  const arriveAt = new Map(threads.map((th) => [th.id, th.arrive] as const));
  const state = new Map<string, ThreadState>(order.map((id) => [id, 'new']));
  const pc = new Map<string, number>(order.map((id) => [id, 0]));
  const waited = new Map<string, number>(order.map((id) => [id, 0]));
  const owner = new Map<string, string | null>(locks.map((m) => [m, null]));
  const queue = new Map<string, string[]>(locks.map((m) => [m, []]));
  const idle = new Map<string, number>(locks.map((m) => [m, 0]));
  const used = new Map<string, number>(locks.map((m) => [m, 0]));

  function need<V>(map: Map<string, V>, key: string, what: string): V {
    const v = map.get(key);
    if (v === undefined) throw new Error(`hold-and-wait: ${what} "${key}" 없음`);
    return v;
  }

  function admit(tick: number): string[] {
    const came: string[] = [];
    for (const id of order) {
      if (need(state, id, '스레드') === 'new' && need(arriveAt, id, '도착') <= tick) {
        state.set(id, 'ready');
        came.push(id);
      }
    }
    return came;
  }

  function pick(last: string | null): string | null {
    const ready = order.filter((id) => state.get(id) === 'ready');
    if (ready.length === 0) return null;
    if (last === null) return ready[0] ?? null;
    const at = order.indexOf(last);
    for (let k = 1; k <= order.length; k += 1) {
      const id = order[(at + k) % order.length];
      if (id !== undefined && state.get(id) === 'ready') return id;
    }
    throw new Error('hold-and-wait: 준비된 스레드를 돌림에서 찾지 못함');
  }

  /** 놓기. 줄 맨 앞에게 넘기면 그 스레드를 돌려준다. */
  function release(m: string, who: string): string | null {
    if (owner.get(m) !== who) throw new Error(`hold-and-wait: ${who} 가 쥐지 않은 ${m} 를 놓으려 함`);
    const q = need(queue, m, '자물쇠');
    const next = q.shift();
    if (next === undefined) {
      owner.set(m, null);
      return null;
    }
    owner.set(m, next);
    state.set(next, 'ready');
    pc.set(next, need(pc, next, '스레드') + 1);
    return next;
  }

  let last: string | null = null;
  // 처음부터 있는 스레드(도착 틱 0 이하)는 걸음 0 에 이미 준비돼 있다 — 틱 0 의 "온 스레드" 로 세지 않는다.
  admit(0);

  // 걸음 0 은 이미 읽을 것(세 프로그램)이 있는 화면이다 — 첫 틱 앞에 읽을 틈을 둔다.
  if (!(await pause())) return;

  for (let tick = 0; ; tick += 1) {
    if (ctx.cancelled) return;
    if (order.every((id) => state.get(id) === 'done')) return;
    if (tick >= TICK_LIMIT) throw new Error('hold-and-wait: 틱 한도를 넘음');
    const arrived = admit(tick);
    const who = pick(last);
    if (who === null) {
      if (order.some((id) => state.get(id) === 'new')) throw new Error(`hold-and-wait: 틱 ${tick} 에 준비된 스레드 없음 (도착 전 빈 틱)`);
      throw new Error(`hold-and-wait: 틱 ${tick} 에 모두 잠듦 — 이 자료는 교착하지 않아야 한다`);
    }
    const prog = need(programs, who, '프로그램');
    const line = need(pc, who, '스레드');
    const op = prog[line];
    if (op === undefined) throw new Error(`hold-and-wait: ${who} 줄 ${line} 없음`);

    let kind: 'take' | 'block' | 'work' | 'release';
    let lock: string | null = null;
    let lockOwner: string | null = null;
    let to: string | null = null;

    if (op.op === 'lock') {
      lock = op.lock;
      const holder = owner.get(op.lock);
      if (holder === undefined) throw new Error(`hold-and-wait: 자물쇠 ${op.lock} 없음`);
      if (holder === null) {
        owner.set(op.lock, who);
        pc.set(who, line + 1);
        kind = 'take';
      } else {
        if (holder === who) throw new Error(`hold-and-wait: ${who} 가 이미 쥔 ${op.lock} 를 다시 잡음`);
        state.set(who, 'blocked');
        need(queue, op.lock, '자물쇠').push(who);
        lockOwner = holder;
        kind = 'block';
      }
    } else if (op.op === 'unlock') {
      lock = op.lock;
      pc.set(who, line + 1);
      to = release(op.lock, who);
      kind = 'release';
    } else {
      pc.set(who, line + 1);
      for (const m of locks) {
        if (owner.get(m) === who) used.set(m, need(used, m, '자물쇠') + 1);
      }
      kind = 'work';
    }

    if (need(pc, who, '스레드') >= prog.length && state.get(who) === 'ready') state.set(who, 'done');
    for (const id of order) {
      if (state.get(id) === 'blocked') waited.set(id, need(waited, id, '스레드') + 1);
    }
    for (const m of locks) {
      const holder = owner.get(m);
      if (holder !== null && holder !== undefined && state.get(holder) === 'blocked') {
        idle.set(m, need(idle, m, '자물쇠') + 1);
      }
    }

    await ctx.emit({
      type: 'tick',
      payload: {
        tick,
        thread: who,
        was: last,
        line,
        kind,
        lock,
        owner: lockOwner,
        to,
        arrived,
        threads: order.map((id) => ({
          id,
          state: need(state, id, '스레드'),
          pc: need(pc, id, '스레드'),
          waited: need(waited, id, '스레드'),
        })),
        locks: locks.map((m) => ({
          id: m,
          owner: need(owner, m, '자물쇠'),
          queue: [...need(queue, m, '자물쇠')],
          idle: need(idle, m, '자물쇠'),
          used: need(used, m, '자물쇠'),
        })),
      },
    });
    last = who;
    if (!(await pause())) return;
  }
}
