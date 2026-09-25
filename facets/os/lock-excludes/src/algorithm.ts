/**
 * lockExcludes — 자물쇠 하나가 스레드 여럿을 한 번에 하나만 들이는 모습.
 *
 * 규약 (운영체제 · 동기화 배치의 공통 모형을 그대로 옮긴다):
 *  - CPU 는 하나. 한 틱 = 한 스레드가 제 프로그램의 한 줄을 실행하거나, 실행하려다 막힌다.
 *    막힌 시도도 한 틱이다.
 *  - 돌림: `threads` 차례로 돌며 준비된 스레드에게 한 줄씩 준다. 첫 틱은 목록 맨 앞,
 *    그 뒤로는 바로 앞 틱의 스레드 다음부터 찾는다. 잠든 스레드 · 끝난 스레드는 건너뛴다.
 *  - `lock(m)`: 비었으면 잡고 다음 줄로. 남이 쥐었으면 그 틱에 잠들어 m 의 줄 끝에 선다.
 *  - `unlock(m)`: 줄이 있으면 맨 앞에게 곧바로 넘긴다 — 넘겨받은 스레드는 깨어나 `lock(m)` 을
 *    다시 실행하지 않고 그다음 줄부터 이어 간다. 줄이 없으면 비운다. 놓는 틱과 넘겨받는 틱은 같다.
 *  - `work()`: 자물쇠를 쥐고 하는 일. 다음 줄로.
 *  - 준비된 스레드가 없는데 끝나지 않은 스레드가 있으면(교착) 이 조각이 말할 일이 아니므로 던진다.
 *
 * 이벤트 (전부 silent 아님 — 한 이벤트가 한 틱이자 한 걸음):
 *  - `take`    lock 을 실행해 비어 있던 자물쇠를 잡았다
 *  - `block`   lock 을 실행했으나 남이 쥐고 있어 줄 끝에 서서 잠들었다
 *  - `work`    work 를 실행했다
 *  - `release` unlock 을 실행했다. 줄 맨 앞에게 넘겼거나(to) 비웠다(to = null)
 *
 * payload (넷 공통):
 *   { tick: number        이 틱의 번호 (0 부터)
 *     who: string         이 틱에 달린 스레드
 *     line: number        실행한 줄 번호 (0 부터)
 *     owner: string|null  틱이 끝난 뒤 자물쇠의 주인
 *     queue: string[]     틱이 끝난 뒤 자물쇠 앞의 줄 (맨 앞이 0)
 *     pc: number[]        틱이 끝난 뒤 스레드마다 다음에 실행할 줄 (threads 차례. 줄 수와 같으면 끝남)
 *     to: string|null }   release 만 — 넘겨받은 스레드, 없으면 null
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (프로그램 · 빈 자물쇠). 그 화면에 읽을 것이
 * 있으므로 첫 틱 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface LockExcludesFacetData {
  type: 'lock-excludes';
  /** 자물쇠 이름 — 자료다. 번역하지 않는다. */
  lock: string;
  /** 스레드 식별자. 이 차례가 곧 돌림 차례다. */
  threads: string[];
  /** 스레드가 모두 도는 같은 프로그램 줄. */
  program: string[];
  stepMs: number;
}

export type LockOp =
  | { kind: 'lock'; name: string }
  | { kind: 'unlock'; name: string }
  | { kind: 'work' };

/** 프로그램 한 줄을 읽는다. 모르는 모양 · 선언되지 않은 자물쇠는 줄 번호를 담아 던진다. */
export function parseLockLine(text: string, index: number, lock: string): LockOp {
  const src = text.trim();
  if (src === 'work()') return { kind: 'work' };
  const m = /^(lock|unlock)\(([A-Za-z_][A-Za-z0-9_]*)\)$/.exec(src);
  if (m === null) {
    throw new Error(`lockExcludes: 줄 ${index} 의 모양을 모른다 — "${text}"`);
  }
  const name = m[2];
  if (name === undefined || name !== lock) {
    throw new Error(`lockExcludes: 줄 ${index} 의 자물쇠 "${String(name)}" 는 선언된 "${lock}" 가 아니다`);
  }
  return m[1] === 'lock' ? { kind: 'lock', name } : { kind: 'unlock', name };
}

/** 틱이 끝없이 늘지 않게 거는 상한. 넘으면 셈이 잘못된 것이다. */
const TICK_LIMIT = 1000;

export async function lockExcludes(rawCtx: FacetContext<LockExcludesFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<LockExcludesFacetData>;
  const { lock, threads, program, stepMs } = ctx.data;
  if (threads.length === 0) throw new Error('lockExcludes: 스레드가 없다');
  if (new Set(threads).size !== threads.length) throw new Error('lockExcludes: 스레드 식별자가 겹친다');
  const ops = program.map((text, i) => parseLockLine(text, i, lock));

  const pc = threads.map(() => 0);
  const asleep = threads.map(() => false);
  let owner: string | null = null;
  const queue: string[] = [];
  let last: number | null = null;
  let tick = 0;

  const indexOf = (id: string): number => {
    const i = threads.indexOf(id);
    if (i < 0) throw new Error(`lockExcludes: 없는 스레드 "${id}"`);
    return i;
  };
  const isDone = (i: number): boolean => {
    const at = pc[i];
    if (at === undefined) throw new Error(`lockExcludes: 스레드 ${i} 의 줄 번호가 없다`);
    return at >= ops.length;
  };
  const isReady = (i: number): boolean => !isDone(i) && asleep[i] !== true;

  function pick(): number | null {
    const start = last === null ? 0 : last + 1;
    for (let k = 0; k < threads.length; k += 1) {
      const i = (start + k) % threads.length;
      if (isReady(i)) return i;
    }
    return null;
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const snapshot = () => ({ owner, queue: [...queue], pc: [...pc] });

  while (!threads.every((_, i) => isDone(i))) {
    if (!(await pause())) return;
    if (tick >= TICK_LIMIT) throw new Error(`lockExcludes: 틱 ${TICK_LIMIT} 안에 끝나지 않는다`);
    const i = pick();
    if (i === null) {
      throw new Error(`lockExcludes: 틱 ${tick} 에 준비된 스레드가 없다 (교착)`);
    }
    const who = threads[i];
    const line = pc[i];
    if (who === undefined || line === undefined) throw new Error(`lockExcludes: 스레드 ${i} 의 상태가 없다`);
    const op = ops[line];
    if (op === undefined) throw new Error(`lockExcludes: ${who} 의 줄 ${line} 이 없다`);
    last = i;

    if (op.kind === 'lock') {
      if (owner === null) {
        owner = who;
        pc[i] = line + 1;
        await ctx.emit({ type: 'take', payload: { tick, who, line, ...snapshot() } });
      } else {
        if (owner === who) throw new Error(`lockExcludes: ${who} 가 이미 쥔 ${lock} 을 다시 잡으려 한다 (줄 ${line})`);
        asleep[i] = true;
        queue.push(who);
        await ctx.emit({ type: 'block', payload: { tick, who, line, ...snapshot() } });
      }
    } else if (op.kind === 'unlock') {
      if (owner !== who) {
        throw new Error(`lockExcludes: ${who} 는 ${lock} 의 주인이 아닌데 놓으려 한다 (줄 ${line})`);
      }
      pc[i] = line + 1;
      const next = queue.shift();
      let to: string | null = null;
      if (next === undefined) {
        owner = null;
      } else {
        const j = indexOf(next);
        const wait = pc[j];
        if (wait === undefined) throw new Error(`lockExcludes: ${next} 의 줄 번호가 없다`);
        owner = next;
        asleep[j] = false;
        // 넘겨받은 스레드는 lock 을 다시 실행하지 않는다 — 막혔던 줄 다음부터 이어 간다
        pc[j] = wait + 1;
        to = next;
      }
      await ctx.emit({ type: 'release', payload: { tick, who, line, to, ...snapshot() } });
    } else {
      pc[i] = line + 1;
      await ctx.emit({ type: 'work', payload: { tick, who, line, ...snapshot() } });
    }
    tick += 1;
  }
}
