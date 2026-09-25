/**
 * lock-ordering — 모든 스레드가 번호 작은 자물쇠부터 잡으면 기다림이 위로만 뻗는다.
 *
 * 규약 (사양 · 공통 안내문 그대로):
 * - CPU 하나. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행하거나, 잡으려다 막힌다 (막힌 시도도 한 틱).
 * - 돌림: 스레드 목록 차례로 돌며 준비된 스레드에게 한 줄씩. 잠든 · 끝난 스레드는 건너뛴다. 첫 틱은 목록 맨 앞.
 * - lock(m): 비었으면 잡고 다음 줄로. 남이 쥐었으면 그 틱에 잠들어 m 의 줄 끝에 선다.
 * - unlock(m): 줄이 있으면 맨 앞에게 곧바로 넘긴다 — 넘겨받은 스레드는 깨어나 lock 다음 줄부터 이어 간다.
 *   줄이 없으면 비운다. 놓는 틱과 넘겨받는 틱은 같은 틱이다.
 * - 규칙 걸기: 스레드마다 잡기 줄의 자물쇠를 번호(이름 끝 숫자) 오름차순으로, 놓기 줄은 그 거꾸로 다시 쓴다.
 * - "위로" 판정: 잠드는 순간 그 스레드가 쥔 자물쇠 번호 전부보다 기다리는 번호가 크다 (쥔 것이 없으면 참).
 * - 교착 판정: 준비된 스레드가 없는데 끝나지 않은 스레드가 있으면 멈춘다 (발신 없이 돌아온다).
 *
 * 이벤트 (전부 silent 아님):
 * - `rule`  { changes: { thread: string; before: Line[]; after: Line[] }[] }
 *           규칙을 걸어 줄 차례가 바뀐 스레드들. 걸음 1.
 * - `tick`  { tick: number; thread: string; line: number;
 *             kind: 'take' | 'block' | 'work' | 'release';
 *             lock: string | null;          — take · block · release 의 자물쇠
 *             holder: string | null;        — block: 그 자물쇠의 주인
 *             to: string | null;            — release: 넘겨받은 스레드 (없으면 null)
 *             held: string[];               — 이 틱 앞에 그 스레드가 쥐고 있던 자물쇠 (번호 차례)
 *             upward: boolean | null;       — block: 위로 판정. 그 밖은 null
 *             owners: { lock: string; owner: string | null }[];   — 틱 뒤 (자물쇠 목록 차례)
 *             waits: { thread: string; lock: string }[];          — 틱 뒤 잠든 스레드와 기다리는 자물쇠
 *             pc: { thread: string; pc: number }[];               — 틱 뒤 다음에 실행할 줄
 *             done: string[] }                                     — 틱 뒤까지 끝난 차례
 *
 * Line = { op: 'lock' | 'unlock'; lock: string } | { op: 'work' }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Line = { op: 'lock'; lock: string } | { op: 'unlock'; lock: string } | { op: 'work' };

export type ThreadData = { id: string; program: Line[] };

export type LockOrderingFacetData = {
  type: 'lock-ordering';
  stepMs: number;
  locks: string[];
  threads: ThreadData[];
};

/** 자물쇠 번호 = 이름 끝 숫자. 숫자가 없으면 셈할 수 없으므로 던진다. */
export function lockRank(lock: string): number {
  const m = /(\d+)$/.exec(lock);
  if (m === null) throw new Error(`lock-ordering: 자물쇠 이름 "${lock}" 에 끝 번호가 없다`);
  return Number(m[1]);
}

/** 규칙을 건 프로그램 — 잡기 줄 자리에 번호 오름차순, 놓기 줄 자리에 그 거꾸로. */
function ordered(thread: ThreadData): Line[] {
  const takes: string[] = [];
  const drops: string[] = [];
  for (const line of thread.program) {
    if (line.op === 'lock') takes.push(line.lock);
    else if (line.op === 'unlock') drops.push(line.lock);
  }
  const sameSet =
    takes.length === drops.length &&
    new Set(takes).size === takes.length &&
    takes.every((l) => drops.includes(l));
  if (!sameSet) {
    throw new Error(`lock-ordering: ${thread.id} 의 잡기와 놓기가 같은 자물쇠 묶음이 아니다`);
  }
  const up = [...takes].sort((a, b) => lockRank(a) - lockRank(b));
  const down = [...up].reverse();
  let ti = 0;
  let di = 0;
  return thread.program.map((line): Line => {
    if (line.op === 'lock') {
      const lock = up[ti];
      ti += 1;
      if (lock === undefined) throw new Error(`lock-ordering: ${thread.id} 의 잡기 줄 셈이 어긋났다`);
      return { op: 'lock', lock };
    }
    if (line.op === 'unlock') {
      const lock = down[di];
      di += 1;
      if (lock === undefined) throw new Error(`lock-ordering: ${thread.id} 의 놓기 줄 셈이 어긋났다`);
      return { op: 'unlock', lock };
    }
    return { op: 'work' };
  });
}

function sameProgram(a: Line[], b: Line[]): boolean {
  return (
    a.length === b.length &&
    a.every((l, i) => {
      const o = b[i];
      if (o === undefined || o.op !== l.op) return false;
      if (l.op === 'work' || o.op === 'work') return true;
      return l.lock === o.lock;
    })
  );
}

export async function lockOrdering(ctx0: FacetContext<LockOrderingFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<LockOrderingFacetData>;
  const { stepMs, locks, threads } = ctx.data;

  async function pause(ms: number = stepMs): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(ms)) && !ctx.cancelled;
  }

  for (const th of threads) {
    for (const line of th.program) {
      if (line.op !== 'work' && !locks.includes(line.lock)) {
        throw new Error(`lock-ordering: ${th.id} 가 목록에 없는 자물쇠 ${line.lock} 를 쓴다`);
      }
    }
  }

  // 걸음 0 은 처음 쓰인 프로그램 전체라 읽을 것이 있다 — 첫 발신 앞에 틈을 둔다.
  // 운동이 없는 걸음이라 틈이 곧 벽시계다. 걸음 하한 800ms 를 밑돌지 않게 한다.
  if (!(await pause(Math.max(stepMs, 800)))) return;

  const programs = new Map<string, Line[]>();
  const changes: { thread: string; before: Line[]; after: Line[] }[] = [];
  for (const th of threads) {
    const after = ordered(th);
    programs.set(th.id, after);
    if (!sameProgram(th.program, after)) {
      changes.push({ thread: th.id, before: th.program.map((l) => ({ ...l })), after });
    }
  }
  await ctx.emit({ type: 'rule', payload: { changes } });

  const order = threads.map((th) => th.id);
  const pc = new Map<string, number>(order.map((id) => [id, 0]));
  const state = new Map<string, 'ready' | 'blocked' | 'done'>(order.map((id) => [id, 'ready']));
  const owner = new Map<string, string | null>(locks.map((l) => [l, null]));
  const queue = new Map<string, string[]>(locks.map((l) => [l, []]));
  const waiting = new Map<string, string>();
  const done: string[] = [];
  let last: string | null = null;

  const programOf = (id: string): Line[] => {
    const p = programs.get(id);
    if (p === undefined) throw new Error(`lock-ordering: ${id} 의 프로그램이 없다`);
    return p;
  };
  const pcOf = (id: string): number => {
    const v = pc.get(id);
    if (v === undefined) throw new Error(`lock-ordering: ${id} 의 줄 번호가 없다`);
    return v;
  };
  const heldBy = (id: string): string[] =>
    locks.filter((l) => owner.get(l) === id).sort((a, b) => lockRank(a) - lockRank(b));

  const pick = (): string | null => {
    const start = last === null ? 0 : order.indexOf(last) + 1;
    for (let k = 0; k < order.length; k += 1) {
      const id = order[(start + k) % order.length];
      if (id !== undefined && state.get(id) === 'ready') return id;
    }
    return null;
  };

  // 틱마다 줄 하나가 나아가거나 스레드 하나가 잠든다. 잠든 스레드는 넘겨받을 때만 깨어나며
  // 그때 줄이 나아가므로 틱 수는 줄 수의 두 배를 넘지 않는다.
  const limit = 2 * threads.reduce((s, th) => s + th.program.length, 0);
  for (let tick = 0; tick < limit; tick += 1) {
    if (!(await pause())) return;
    if (order.every((id) => state.get(id) === 'done')) return;
    const n = pick();
    if (n === null) return; // 교착 — 규약대로 멈춘다
    last = n;
    const prog = programOf(n);
    const at = pcOf(n);
    const line = prog[at];
    if (line === undefined) throw new Error(`lock-ordering: ${n} 의 줄 ${at} 이 없다`);
    const held = heldBy(n);

    let kind: 'take' | 'block' | 'work' | 'release';
    let lock: string | null = null;
    let holder: string | null = null;
    let to: string | null = null;
    let upward: boolean | null = null;

    if (line.op === 'lock') {
      lock = line.lock;
      const cur = owner.get(lock);
      if (cur === undefined) throw new Error(`lock-ordering: 자물쇠 ${lock} 가 없다`);
      if (cur === null) {
        owner.set(lock, n);
        pc.set(n, at + 1);
        kind = 'take';
      } else {
        if (cur === n) throw new Error(`lock-ordering: ${n} 가 이미 쥔 ${lock} 를 다시 잡는다`);
        const want = lockRank(lock);
        upward = held.every((h) => want > lockRank(h));
        state.set(n, 'blocked');
        queue.get(lock)?.push(n);
        waiting.set(n, lock);
        holder = cur;
        kind = 'block';
      }
    } else if (line.op === 'unlock') {
      lock = line.lock;
      if (owner.get(lock) !== n) throw new Error(`lock-ordering: ${n} 가 쥐지 않은 ${lock} 를 놓는다`);
      pc.set(n, at + 1);
      const q = queue.get(lock);
      if (q === undefined) throw new Error(`lock-ordering: 자물쇠 ${lock} 의 줄이 없다`);
      const next = q.shift();
      if (next === undefined) {
        owner.set(lock, null);
      } else {
        owner.set(lock, next);
        state.set(next, 'ready');
        waiting.delete(next);
        pc.set(next, pcOf(next) + 1);
        to = next;
      }
      kind = 'release';
    } else {
      pc.set(n, at + 1);
      kind = 'work';
    }
    if (pcOf(n) >= prog.length && state.get(n) === 'ready') {
      state.set(n, 'done');
      done.push(n);
    }

    await ctx.emit({
      type: 'tick',
      payload: {
        tick,
        thread: n,
        line: at,
        kind,
        lock,
        holder,
        to,
        held,
        upward,
        owners: locks.map((l) => ({ lock: l, owner: owner.get(l) ?? null })),
        waits: order.flatMap((id) => {
          const w = waiting.get(id);
          return w === undefined ? [] : [{ thread: id, lock: w }];
        }),
        pc: order.map((id) => ({ thread: id, pc: pcOf(id) })),
        done: [...done],
      },
    });
    if (order.every((id) => state.get(id) === 'done')) return;
  }
  throw new Error('lock-ordering: 틱 상한을 넘었다');
}
