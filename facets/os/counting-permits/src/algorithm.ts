/**
 * countingPermits — 세마포어가 표를 세어 그만큼만 들이는 것을, 스레드 넷의 프로그램을
 * 실제로 돌려 틱마다 보인다.
 *
 * 모형 (운영체제 · 동기화 공통 모형):
 *   - CPU 는 하나. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행하거나 실행하려다 막힌다.
 *     막힌 시도도 한 틱이다. 틱 번호는 0 부터.
 *   - 돌림: 스레드 목록 차례로 돌며 준비된 스레드에게 한 줄씩 준다. 첫 틱은 목록 맨 앞,
 *     그다음은 방금 달린 스레드의 다음 차례부터 찾는다. 잠든 · 끝난 스레드는 건너뛴다.
 *   - `acquire(s)`: 표 수가 0 보다 크면 하나 줄이고 다음 줄로. 0 이면 그 틱에 잠들어 s 의 줄 끝에 선다.
 *   - `release(s)`: 줄이 있으면 표를 줄 맨 앞에게 곧장 건넨다 — 표 수는 그대로, 받은 스레드는 깨어나
 *     `acquire` 를 다시 실행하지 않고 그다음 줄부터 이어 간다. 줄이 없으면 표 수 +1.
 *     놓는 틱과 넘겨받는 틱은 같은 틱이다. 표를 누가 쥐었는지는 세지 않는다 — 수만 센다.
 *   - 준비된 스레드가 없는데 끝나지 않은 스레드가 있으면 셈할 수 없으므로 던진다.
 *
 * 이 조각이 그리는 프로그램 모양은 `acquire(s)` · `work()` 여럿 · `release(s)` 하나뿐이다.
 * 다른 모양은 줄 번호를 담아 던진다.
 *
 * 이벤트 (전부 silent 아님. 한 이벤트 = 한 틱):
 *   - `take`  { tick, who, line, count, queue }          표를 받아 들어갔다
 *   - `block` { tick, who, line, count, queue }          표가 없어 줄 끝에서 잠들었다
 *   - `work`  { tick, who, line, count, queue }          안에서 일 한 줄
 *   - `hand`  { tick, who, line, to, resume, count, queue } 표를 줄 맨 앞(to)에게 건넸다.
 *                                                          resume = to 가 이어 갈 줄
 *   - `back`  { tick, who, line, count, queue }          줄이 비어 표 수가 늘었다
 *   tick: number · who: string (스레드 식별자) · line: number (실행한 줄, 0 부터)
 *   count: number (그 틱 뒤의 표 수) · queue: string[] (그 틱 뒤의 줄, 맨 앞부터)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CountingPermitsThread = { id: string; lines: string[] };

export type CountingPermitsFacetData = {
  type: 'counting-permits';
  stepMs: number;
  /** 세마포어 이름 (자료 — 번역하지 않는다) */
  sem: string;
  /** 처음 표 수 */
  permits: number;
  /** 돌림 차례대로 */
  threads: CountingPermitsThread[];
};

type Op = { kind: 'acquire' } | { kind: 'work' } | { kind: 'release' };

/** 한 줄을 읽는다. 모르는 모양 · 다른 세마포어 이름은 던진다. */
function parseLine(text: string, sem: string, who: string, line: number): Op {
  const m = /^(acquire|release)\((\w+)\)$/.exec(text.trim());
  if (m) {
    if (m[2] !== sem) {
      throw new Error(`countingPermits: ${who} 줄 ${line} — 모르는 세마포어 '${m[2]}'`);
    }
    return m[1] === 'acquire' ? { kind: 'acquire' } : { kind: 'release' };
  }
  if (text.trim() === 'work()') return { kind: 'work' };
  throw new Error(`countingPermits: ${who} 줄 ${line} — 모르는 줄 '${text}'`);
}

/** 프로그램이 acquire · work… · release 모양인지 본다. 아니면 줄 번호와 함께 던진다. */
function readProgram(th: CountingPermitsThread, sem: string): Op[] {
  const ops = th.lines.map((text, i) => parseLine(text, sem, th.id, i));
  if (ops.length < 2) throw new Error(`countingPermits: ${th.id} — 줄이 둘보다 적다`);
  ops.forEach((op, i) => {
    const want = i === 0 ? 'acquire' : i === ops.length - 1 ? 'release' : 'work';
    if (op.kind !== want) {
      throw new Error(`countingPermits: ${th.id} 줄 ${i} — '${want}' 자리에 '${op.kind}'`);
    }
  });
  return ops;
}

export async function countingPermits(
  rawCtx: FacetContext<CountingPermitsFacetData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<CountingPermitsFacetData>;
  const { sem, permits, threads, stepMs } = ctx.data;
  if (!Number.isInteger(permits) || permits < 0) {
    throw new Error(`countingPermits: 표 수가 셀 수 없는 값 '${String(permits)}'`);
  }
  const ids = threads.map((th) => th.id);
  if (new Set(ids).size !== ids.length) throw new Error('countingPermits: 스레드 식별자가 겹친다');
  const progs = new Map(threads.map((th) => [th.id, readProgram(th, sem)] as const));

  const pc = new Map<string, number>(ids.map((id) => [id, 0]));
  const state = new Map<string, 'ready' | 'blocked' | 'done'>(ids.map((id) => [id, 'ready']));
  const queue: string[] = [];
  let count = permits;
  let last: string | null = null;
  let tick = 0;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function pick(): string {
    const start = last === null ? -1 : ids.indexOf(last);
    for (let k = 1; k <= ids.length; k += 1) {
      const id = ids[(start + k) % ids.length];
      if (id !== undefined && state.get(id) === 'ready') return id;
    }
    throw new Error(`countingPermits: 틱 ${tick} — 준비된 스레드가 없는데 끝나지 않은 스레드가 있다`);
  }

  // 걸음 0 은 프로그램 넷과 표가 이미 선 화면이라 첫 발신 앞에도 stepMs 를 둔다.
  while (ids.some((id) => state.get(id) !== 'done')) {
    if (!(await pause())) return;
    const who = pick();
    const prog = progs.get(who);
    const line = pc.get(who);
    if (prog === undefined || line === undefined) throw new Error(`countingPermits: 모르는 스레드 ${who}`);
    const op = prog[line];
    if (op === undefined) throw new Error(`countingPermits: ${who} 줄 ${line} — 프로그램 밖`);

    if (op.kind === 'acquire') {
      if (count > 0) {
        count -= 1;
        pc.set(who, line + 1);
        await ctx.emit({ type: 'take', payload: { tick, who, line, count, queue: [...queue] } });
      } else {
        state.set(who, 'blocked');
        queue.push(who);
        await ctx.emit({ type: 'block', payload: { tick, who, line, count, queue: [...queue] } });
      }
    } else if (op.kind === 'work') {
      pc.set(who, line + 1);
      await ctx.emit({ type: 'work', payload: { tick, who, line, count, queue: [...queue] } });
    } else {
      pc.set(who, line + 1);
      if (line + 1 === prog.length) state.set(who, 'done');
      const to = queue.shift();
      if (to !== undefined) {
        const toLine = pc.get(to);
        if (toLine === undefined || state.get(to) !== 'blocked') {
          throw new Error(`countingPermits: 틱 ${tick} — 줄 맨 앞 ${to} 가 잠들어 있지 않다`);
        }
        const resume = toLine + 1;
        pc.set(to, resume);
        state.set(to, 'ready');
        await ctx.emit({
          type: 'hand',
          payload: { tick, who, line, to, resume, count, queue: [...queue] },
        });
      } else {
        count += 1;
        await ctx.emit({ type: 'back', payload: { tick, who, line, count, queue: [...queue] } });
      }
    }
    last = who;
    tick += 1;
  }
}
