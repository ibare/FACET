/**
 * wait-cycle 알고리즘 — 스레드 셋이 자물쇠 둘씩을 차례로 잡다가, 잠드는 스레드마다
 * "누구를 기다린다" 는 화살이 이어져 고리로 닫히는 것을 틱 단위로 돌린다.
 *
 * 모형 (사양의 규약 줄을 그대로 옮김):
 *  - CPU 는 하나. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행하거나 실행하려다 막힌다.
 *    막힌 시도도 한 틱이다.
 *  - 돌림: 스레드 목록 차례로 돌며 준비된 스레드에게 한 줄씩 준다. 잠든 · 끝난 스레드는
 *    건너뛴다. 첫 틱은 목록 맨 앞.
 *  - `lock(m)`: 비었으면 잡고 다음 줄로. 남이 쥐었으면 그 틱에 잠들어 m 의 줄 끝에 선다.
 *  - `unlock(m)`: 줄이 있으면 맨 앞에게 곧바로 넘긴다 — 넘겨받은 스레드는 깨어나 그다음
 *    줄부터 이어 간다 (놓는 틱과 넘겨받는 틱은 같은 틱). 줄이 없으면 비운다.
 *  - 화살 = 잡기에 실패해 잠든 스레드 → 그 자물쇠의 주인.
 *  - 고리 판정 = 막힌 스레드에서 화살을 따라가 그 스레드로 돌아오는가.
 *  - 준비된 스레드가 없으면 멈춘다 (끝나지 않은 스레드가 있으면 교착).
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *  - `tick`  한 틱.
 *    payload: {
 *      tick: number,                 // 0 부터
 *      thread: string,               // 이 틱을 받은 스레드
 *      line: number,                 // 실행(또는 시도)한 줄 번호, 0 부터
 *      outcome: 'took' | 'blocked' | 'ran' | 'released' | 'handed',
 *      lock: string | null,          // lock · unlock 의 대상, work 면 null
 *      other: string | null,         // blocked 면 자물쇠 주인, handed 면 넘겨받은 스레드
 *      owners: { lock: string; owner: string | null }[],    // 틱 뒤 주인
 *      pcs: { thread: string; pc: number }[],               // 틱 뒤 다음 줄
 *      status: { thread: string; status: 'ready' | 'asleep' | 'done' }[],
 *      waits: { from: string; lock: string; to: string }[], // 틱 뒤 기다림 화살
 *      ring: string[],               // 이 틱에 닫힌 고리 (출발 스레드부터). 없으면 []
 *    }
 *  - `halt`  준비된 스레드가 없어 다음 틱을 줄 곳이 없다.
 *    payload: { tick: number, ready: number, asleep: number, done: number }
 *             (tick = 받을 이가 없던 그 틱 번호)
 *
 * `ctx.metric` 은 부르지 않는다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WaitCycleOp =
  | { op: 'lock'; lock: string }
  | { op: 'unlock'; lock: string }
  | { op: 'work' };

export type WaitCycleThread = { id: string; program: WaitCycleOp[] };

export type WaitCycleFacetData = {
  type: 'wait-cycle';
  stepMs: number;
  locks: string[];
  threads: WaitCycleThread[];
};

export type WaitCycleStatus = 'ready' | 'asleep' | 'done';
export type WaitCycleOutcome = 'took' | 'blocked' | 'ran' | 'released' | 'handed';
export type WaitCycleEdge = { from: string; lock: string; to: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readOp(raw: unknown, where: string, locks: readonly string[]): WaitCycleOp {
  if (!isRecord(raw)) throw new Error(`wait-cycle: ${where} 줄이 객체가 아니다`);
  const op = raw['op'];
  if (op === 'work') return { op: 'work' };
  if (op === 'lock' || op === 'unlock') {
    const lock = raw['lock'];
    if (typeof lock !== 'string' || !locks.includes(lock)) {
      throw new Error(`wait-cycle: ${where} 줄의 자물쇠 '${String(lock)}' 가 자물쇠 목록에 없다`);
    }
    return op === 'lock' ? { op: 'lock', lock } : { op: 'unlock', lock };
  }
  throw new Error(`wait-cycle: ${where} 줄의 모양 '${String(op)}' 을 모른다`);
}

/** initialData 를 좁혀 베낀다. 셈할 수 없는 모양이면 던진다 (C6). */
export function readWaitCycleData(raw: unknown): WaitCycleFacetData {
  if (!isRecord(raw)) throw new Error('wait-cycle: initialData 가 객체가 아니다');
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs >= 0)) {
    throw new Error('wait-cycle: stepMs 가 0 이상의 수가 아니다');
  }
  const rawLocks = raw['locks'];
  if (!Array.isArray(rawLocks) || rawLocks.length === 0) {
    throw new Error('wait-cycle: locks 가 비었거나 배열이 아니다');
  }
  const locks: string[] = [];
  for (const l of rawLocks) {
    if (typeof l !== 'string' || l === '' || locks.includes(l)) {
      throw new Error(`wait-cycle: 자물쇠 이름 '${String(l)}' 이 비었거나 겹친다`);
    }
    locks.push(l);
  }
  const rawThreads = raw['threads'];
  if (!Array.isArray(rawThreads) || rawThreads.length === 0) {
    throw new Error('wait-cycle: threads 가 비었거나 배열이 아니다');
  }
  const threads: WaitCycleThread[] = [];
  for (const t0 of rawThreads) {
    if (!isRecord(t0)) throw new Error('wait-cycle: 스레드가 객체가 아니다');
    const id = t0['id'];
    if (typeof id !== 'string' || id === '' || threads.some((x) => x.id === id)) {
      throw new Error(`wait-cycle: 스레드 식별자 '${String(id)}' 가 비었거나 겹친다`);
    }
    const prog = t0['program'];
    if (!Array.isArray(prog) || prog.length === 0) {
      throw new Error(`wait-cycle: 스레드 ${id} 의 프로그램이 비었다`);
    }
    const program = prog.map((p, i) => readOp(p, `${id} 의 ${i} 번`, locks));
    threads.push({ id, program });
  }
  return { type: 'wait-cycle', stepMs, locks, threads };
}

/** 화살을 따라가 출발 스레드로 돌아오면 그 고리(출발부터)를, 아니면 [] 를 돌려준다. */
function followArrows(start: string, waits: readonly WaitCycleEdge[]): string[] {
  const ring = [start];
  let cur = start;
  for (let hop = 0; hop <= waits.length; hop += 1) {
    const edge = waits.find((e) => e.from === cur);
    if (!edge) return [];
    if (edge.to === start) return ring;
    if (ring.includes(edge.to)) return [];
    ring.push(edge.to);
    cur = edge.to;
  }
  return [];
}

export async function waitCycle(context: FacetContext<WaitCycleFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<WaitCycleFacetData>;
  const data = readWaitCycleData(ctx.data);
  const { stepMs, threads, locks } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const owner = new Map<string, string | null>(locks.map((l) => [l, null]));
  const queue = new Map<string, string[]>(locks.map((l) => [l, []]));
  const pc = new Map<string, number>(threads.map((th) => [th.id, 0]));
  const status = new Map<string, WaitCycleStatus>(threads.map((th) => [th.id, 'ready']));

  function waitsNow(): WaitCycleEdge[] {
    const out: WaitCycleEdge[] = [];
    for (const l of locks) {
      const who = owner.get(l);
      for (const w of must(queue, l, '자물쇠 줄')) {
        if (typeof who !== 'string') throw new Error(`wait-cycle: 줄이 선 자물쇠 ${l} 에 주인이 없다`);
        out.push({ from: w, lock: l, to: who });
      }
    }
    // 잠든 차례대로가 아니라 스레드 목록 차례로 — 같은 상태면 같은 배열
    out.sort(
      (a, b) =>
        threads.findIndex((th) => th.id === a.from) - threads.findIndex((th) => th.id === b.from),
    );
    return out;
  }

  function must<K, V>(map: Map<K, V>, key: K, what: string): V {
    const v = map.get(key);
    if (v === undefined) throw new Error(`wait-cycle: ${what} '${String(key)}' 의 기록이 없다`);
    return v;
  }

  function snapshot() {
    return {
      owners: locks.map((l) => ({ lock: l, owner: must(owner, l, '자물쇠') })),
      pcs: threads.map((th) => ({ thread: th.id, pc: must(pc, th.id, '줄 번호') })),
      status: threads.map((th) => ({ thread: th.id, status: must(status, th.id, '상태') })),
      waits: waitsNow(),
    };
  }

  function advance(th: WaitCycleThread): void {
    const next = must(pc, th.id, '줄 번호') + 1;
    pc.set(th.id, next);
    if (next >= th.program.length) status.set(th.id, 'done');
  }

  // 걸음 0 (프로그램 셋 · 빈 자물쇠) 을 읽을 틈
  if (!(await pause())) return;

  const limit = threads.reduce((n, th) => n + th.program.length, 0) + 1;
  let cursor = 0;
  for (let tick = 0; tick <= limit; tick += 1) {
    if (ctx.cancelled) return;

    let picked: WaitCycleThread | null = null;
    for (let k = 0; k < threads.length; k += 1) {
      const cand = threads[(cursor + k) % threads.length];
      if (cand && status.get(cand.id) === 'ready') {
        picked = cand;
        cursor = (cursor + k + 1) % threads.length;
        break;
      }
    }

    if (!picked) {
      const count = (s: WaitCycleStatus) => threads.filter((th) => status.get(th.id) === s).length;
      await ctx.emit({
        type: 'halt',
        payload: { tick, ready: count('ready'), asleep: count('asleep'), done: count('done') },
      });
      await pause();
      return;
    }

    const th = picked;
    const line = pc.get(th.id);
    if (line === undefined) throw new Error(`wait-cycle: 스레드 ${th.id} 의 줄 번호가 없다`);
    const op = th.program[line];
    if (!op) throw new Error(`wait-cycle: 스레드 ${th.id} 의 ${line} 번 줄이 없다`);

    let outcome: WaitCycleOutcome;
    let lock: string | null = null;
    let other: string | null = null;
    let ring: string[] = [];

    if (op.op === 'lock') {
      lock = op.lock;
      const who = owner.get(op.lock);
      if (who === th.id) throw new Error(`wait-cycle: ${th.id} 가 이미 쥔 ${op.lock} 을 다시 잡는다 (틱 ${tick})`);
      if (who === null) {
        owner.set(op.lock, th.id);
        outcome = 'took';
        advance(th);
      } else if (typeof who === 'string') {
        must(queue, op.lock, '자물쇠 줄').push(th.id);
        status.set(th.id, 'asleep');
        outcome = 'blocked';
        other = who;
        ring = followArrows(th.id, waitsNow());
      } else {
        throw new Error(`wait-cycle: 자물쇠 ${op.lock} 의 주인 기록이 없다`);
      }
    } else if (op.op === 'unlock') {
      lock = op.lock;
      if (owner.get(op.lock) !== th.id) {
        throw new Error(`wait-cycle: ${th.id} 는 ${op.lock} 의 주인이 아닌데 놓는다 (틱 ${tick})`);
      }
      const q = queue.get(op.lock);
      if (!q) throw new Error(`wait-cycle: 자물쇠 ${op.lock} 의 줄이 없다`);
      const heir = q.shift();
      if (heir !== undefined) {
        const heirThread = threads.find((x) => x.id === heir);
        if (!heirThread) throw new Error(`wait-cycle: 줄에 선 ${heir} 가 스레드 목록에 없다`);
        owner.set(op.lock, heir);
        status.set(heir, 'ready');
        advance(heirThread);
        outcome = 'handed';
        other = heir;
      } else {
        owner.set(op.lock, null);
        outcome = 'released';
      }
      advance(th);
    } else {
      outcome = 'ran';
      advance(th);
    }

    await ctx.emit({
      type: 'tick',
      payload: { tick, thread: th.id, line, outcome, lock, other, ...snapshot(), ring },
    });
    if (!(await pause())) return;
  }
  throw new Error(`wait-cycle: 틱이 ${limit} 을 넘었다 — 멈추지 않는 프로그램`);
}
