/**
 * 갱신 손실 — 두 스레드가 각자 더했는데 한쪽이 더한 몫만 남는다.
 *
 * 모형 (공통 안내문 · 사양의 규약 줄을 옮긴다)
 *   - CPU 는 하나. 한 걸음 = 한 스레드가 제 프로그램의 한 줄을 실행한다
 *   - 차례는 데이터(`order`)의 글자 그대로. 이 조각은 돌림 모형을 쓰지 않는다
 *   - `mine` 은 스레드마다 따로 있다
 *   - "있어야 할 값" = 같은 스레드들을 목록 차례로 한 스레드씩 끝까지 돌린 결과
 *     (A A B B). 같은 셈(`execute`)으로 한 번 더 돌려 얻는다
 *
 * 줄 두 모양
 *   read              `let mine = <shared>`        mine ← 공유 값
 *   write(add)        `<shared> = mine + <add>`    공유 값 ← mine + add
 *
 * 셈할 수 없는 상태는 던진다 (C6) — 모르는 스레드 · 줄이 모자란 스레드 · 읽기 전 쓰기 ·
 * 모르는 줄 모양 · 차례가 끝났는데 남은 줄.
 *
 * 이벤트 (전부 silent 아님)
 *   read     { thread: string; line: number; value: number }
 *            thread 가 line 번째 줄(0 부터)에서 공유 값 value 를 제 mine 에 옮겼다
 *   write    { thread: string; line: number; before: number; mine: number; add: number;
 *              after: number; stale: boolean }
 *            thread 가 공유 값 before 위에 after(= mine + add) 를 썼다.
 *            stale = 읽어 둔 mine 이 쓰기 직전의 공유 값과 다르다 — 그사이 남이 쓴 값을 덮었다
 *   compare  { final: number; expected: number; lost: number }
 *            남은 값 · 있어야 할 값 · 사라진 몫(expected − final)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LostUpdateLine = { kind: 'read' } | { kind: 'write'; add: number };

export type LostUpdateThread = { id: string; lines: LostUpdateLine[] };

export type LostUpdateFacetData = {
  type: 'lost-update';
  /** 공유 값의 이름 (코드 글자에 그대로 뜬다) */
  shared: string;
  /** 스레드마다 따로 있는 칸의 이름 (코드 글자에 그대로 뜬다) */
  local: string;
  /** 공유 값의 처음 값 */
  start: number;
  threads: LostUpdateThread[];
  /** 실행 차례 — 스레드 식별자의 줄 */
  order: string[];
  stepMs: number;
};

export type LostUpdateResult =
  | { kind: 'read'; thread: string; line: number; value: number }
  | {
      kind: 'write';
      thread: string;
      line: number;
      before: number;
      mine: number;
      add: number;
      after: number;
      stale: boolean;
    };

/** 차례 하나를 끝까지 돌린다. 걸음마다의 결과와 남은 공유 값. */
export function execute(
  data: LostUpdateFacetData,
  order: readonly string[],
): { steps: LostUpdateResult[]; final: number } {
  if (!Number.isFinite(data.start)) throw new Error(`처음 값이 수가 아니다: ${String(data.start)}`);
  let shared = data.start;
  const pcs = new Map<string, number>();
  const mine = new Map<string, number>();
  for (const th of data.threads) {
    if (pcs.has(th.id)) throw new Error(`스레드 식별자가 겹친다: ${th.id}`);
    pcs.set(th.id, 0);
  }
  const steps: LostUpdateResult[] = [];
  for (const id of order) {
    const th = data.threads.find((x) => x.id === id);
    if (th === undefined) throw new Error(`차례에 모르는 스레드: ${id}`);
    const pc = pcs.get(id);
    if (pc === undefined) throw new Error(`스레드 ${id} 의 줄 위치가 없다`);
    const line = th.lines[pc];
    if (line === undefined) throw new Error(`스레드 ${id} 에 ${pc} 번째 줄이 없다 — 차례가 줄보다 많다`);
    pcs.set(id, pc + 1);
    if (line.kind === 'read') {
      mine.set(id, shared);
      steps.push({ kind: 'read', thread: id, line: pc, value: shared });
    } else if (line.kind === 'write') {
      const m = mine.get(id);
      if (m === undefined) throw new Error(`스레드 ${id} 의 ${pc} 번째 줄: 읽기 전에 쓴다`);
      if (!Number.isFinite(line.add)) throw new Error(`스레드 ${id} 의 ${pc} 번째 줄: 더할 값이 수가 아니다`);
      const before = shared;
      shared = m + line.add;
      steps.push({
        kind: 'write',
        thread: id,
        line: pc,
        before,
        mine: m,
        add: line.add,
        after: shared,
        stale: m !== before,
      });
    } else {
      throw new Error(`스레드 ${id} 의 ${pc} 번째 줄: 모르는 줄 모양 ${JSON.stringify(line)}`);
    }
  }
  for (const th of data.threads) {
    if (pcs.get(th.id) !== th.lines.length) {
      throw new Error(`스레드 ${th.id} 의 줄이 남았다 — 차례가 모자란다`);
    }
  }
  return { steps, final: shared };
}

/** 한 스레드씩 끝까지 — 목록 차례. */
export function serialOrder(data: LostUpdateFacetData): string[] {
  return data.threads.flatMap((th) => th.lines.map(() => th.id));
}

export async function lostUpdate(ctx0: FacetContext<LostUpdateFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<LostUpdateFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const run = execute(data, data.order);
  const expected = execute(data, serialOrder(data)).final;

  // 걸음 0 은 두 프로그램과 처음 값을 이미 보인다 — 읽을 틈을 둔다
  for (const s of run.steps) {
    if (!(await pause())) return;
    if (s.kind === 'read') {
      await ctx.emit({
        type: 'read',
        payload: { thread: s.thread, line: s.line, value: s.value },
      });
    } else {
      await ctx.emit({
        type: 'write',
        payload: {
          thread: s.thread,
          line: s.line,
          before: s.before,
          mine: s.mine,
          add: s.add,
          after: s.after,
          stale: s.stale,
        },
      });
    }
  }
  if (!(await pause())) return;
  await ctx.emit({
    type: 'compare',
    payload: { final: run.final, expected, lost: expected - run.final },
  });
}
