/**
 * microtask-cuts-in — 태스크 줄과 마이크로태스크 줄의 앞지르기.
 *
 * 이벤트 (모두 silent 아님):
 *   'log'            { id: string; lines: number[] }
 *     최상위 문의 console.log 가 곧바로 실행됐다. 출력 줄 끝에 id 가 붙는다.
 *   'schedule-timer'  { id: string; lines: number[] }
 *     setTimeout(…, 0) 문이 실행됐다. 만기가 지금이라 곧바로 태스크 줄 끝에 선다.
 *   'schedule-chain'  { first: string; firstLine: number; waiting: { id: string; after: string; line: number }[]; lines: number[] }
 *     Promise.resolve().then(...).then(...) 사슬이 실행됐다. 이미 이루어진 약속이라
 *     첫 콜백(first)은 곧바로 마이크로태스크 줄 끝에 선다. 나머지(waiting)는 앞
 *     콜백(after)의 약속이 풀릴 때까지 줄에 서지 않는다.
 *   'run-microtask'   { id: string; line: number; promoted: string[] }
 *     스택이 비어 마이크로태스크 줄 앞머리가 실행됐다. 그 콜백의 약속이 풀려
 *     대기 중이던 다음 콜백(promoted)이 있으면 마이크로태스크 줄 끝에 새로 선다.
 *   'run-task'        { id: string; line: number }
 *     마이크로태스크 줄이 비어 태스크 줄 앞머리가 실행됐다.
 *
 * 이 조각은 6줄짜리 고정 스크립트를 구조 데이터(statements)로 받아, 태스크 줄 +
 * 마이크로태스크 줄 + then-사슬의 약속 풀림을 그대로 흉내 내는 작은 이벤트 루프를
 * 돌려 걸음을 셈한다 — 걸음표를 손으로 적지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LogStatement = { op: 'log'; id: string; line: number };
export type TimeoutStatement = { op: 'timeout'; id: string; delay: number; line: number };
export type ThenChainStatement = { op: 'thenChain'; ids: string[]; lines: number[]; callbackLines: number[] };
export type Statement = LogStatement | TimeoutStatement | ThenChainStatement;

export type MicrotaskCutsInFacetData = {
  type: 'microtaskCutsIn';
  code: string[];
  statements: Statement[];
  stepMs: number;
};

export function microtaskCutsIn(ctx: FacetContext<MicrotaskCutsInFacetData>): Promise<void> {
  return run(ctx as ReactiveContext<MicrotaskCutsInFacetData>);
}

async function run(rc: ReactiveContext<MicrotaskCutsInFacetData>): Promise<void> {
  const { statements, stepMs } = rc.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const taskQueue: string[] = [];
  const microQueue: string[] = [];
  /** afterId → 그 약속이 풀리면 마이크로태스크 줄에 서는 다음 콜백 id. */
  const waitingAfter = new Map<string, string>();
  /** id → 그 콜백이 실행될 때 밝힐 소스 줄. */
  const callbackLine = new Map<string, number>();

  // ── 1. 최상위 문을 차례로 실행한다 (스크립트 자체가 도는 동안).
  for (const stmt of statements) {
    if (!(await pause())) return;
    if (stmt.op === 'log') {
      await rc.emit({ type: 'log', payload: { id: stmt.id, lines: [stmt.line] } });
    } else if (stmt.op === 'timeout') {
      taskQueue.push(stmt.id);
      callbackLine.set(stmt.id, stmt.line);
      await rc.emit({ type: 'schedule-timer', payload: { id: stmt.id, lines: [stmt.line] } });
    } else if (stmt.op === 'thenChain') {
      const [first, ...rest] = stmt.ids;
      if (first === undefined) throw new Error('microtask-cuts-in: thenChain 문에 콜백 id 가 없다');
      microQueue.push(first);
      const waiting: { id: string; after: string; line: number }[] = [];
      let prev = first;
      for (let i = 0; i < rest.length; i += 1) {
        const id = rest[i];
        if (id === undefined) throw new Error('microtask-cuts-in: thenChain 사슬 중간에 빈 자리가 있다');
        waitingAfter.set(prev, id);
        const line = stmt.callbackLines[i + 1];
        if (line === undefined) throw new Error(`microtask-cuts-in: ${id} 의 콜백 줄이 없다`);
        callbackLine.set(id, line);
        waiting.push({ id, after: prev, line });
        prev = id;
      }
      const firstLine = stmt.callbackLines[0];
      if (firstLine === undefined) throw new Error(`microtask-cuts-in: ${first} 의 콜백 줄이 없다`);
      callbackLine.set(first, firstLine);
      await rc.emit({
        type: 'schedule-chain',
        payload: { first, firstLine, waiting, lines: stmt.lines },
      });
    } else {
      const unknown: never = stmt;
      throw new Error(`microtask-cuts-in: 모르는 문 종류 ${JSON.stringify(unknown)}`);
    }
  }

  // ── 2. 마이크로태스크 줄이 빌 때까지 드레인한다. 도는 도중 새로 서는 것도 같이 돈다.
  async function drainMicrotasks(): Promise<boolean> {
    while (microQueue.length > 0) {
      if (!(await pause())) return false;
      const id = microQueue.shift();
      if (id === undefined) throw new Error('microtask-cuts-in: 빈 마이크로태스크 줄에서 꺼냈다');
      const line = callbackLine.get(id);
      if (line === undefined) throw new Error(`microtask-cuts-in: ${id} 의 콜백 줄 정보가 없다`);
      const promoted: string[] = [];
      const next = waitingAfter.get(id);
      if (next !== undefined) {
        microQueue.push(next);
        promoted.push(next);
      }
      await rc.emit({ type: 'run-microtask', payload: { id, line, promoted } });
    }
    return true;
  }

  if (!(await drainMicrotasks())) return;

  // ── 3. 태스크 줄에 남은 것을 하나씩 돌린다. 태스크가 끝날 때마다 다시 드레인한다.
  while (taskQueue.length > 0) {
    if (!(await pause())) return;
    const id = taskQueue.shift();
    if (id === undefined) throw new Error('microtask-cuts-in: 빈 태스크 줄에서 꺼냈다');
    const line = callbackLine.get(id);
    if (line === undefined) throw new Error(`microtask-cuts-in: ${id} 의 콜백 줄 정보가 없다`);
    await rc.emit({ type: 'run-task', payload: { id, line } });
    if (!(await drainMicrotasks())) return;
  }
}
