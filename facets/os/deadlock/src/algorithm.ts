/**
 * 교착 상태 — 스레드 셋이 자물쇠 둘씩을 고리 모양으로 나눠 잡는다.
 *
 * 모형 (synchronization/common.md 그대로, 돌림 몫 k 만 더함):
 *   - CPU 하나. 한 틱 = 한 스레드의 한 줄. 막힌 시도도 한 틱이다.
 *   - 돌림 — 목록 차례로 준비된 스레드에게 몫 k 틱까지. 첫 틱은 목록 맨 앞. 잠든 · 끝난 스레드는
 *     건너뛴다. 잠드는 틱에 곧바로 차례를 넘긴다. 자기만 남으면 다시 자기(새 몫).
 *   - 넘겨주기 — `unlock(m)` 은 줄이 있으면 맨 앞에게 곧바로 건넨다. 넘겨받은 쪽은 `lock` 을 다시
 *     실행하지 않고 그다음 줄부터. 놓는 틱과 넘겨받는 틱은 같다.
 *   - 교착 판정 — 준비된 스레드가 없는데 끝나지 않은 스레드가 있으면 멈춘다. 멈춘 뒤 화살을 따라가
 *     고리를 셈한다.
 *   - 스레드 i 의 프로그램 (쌍 [a, b], 사이 일 g):
 *     `lock(a)` · `work()` × g · `lock(b)` · `work()` · `unlock(b)` · `unlock(a)`.
 *     잠금 순서가 번호 차례(order = 1)면 a · b 를 번호 순으로 바꿔 쓴다 — 이 파일이 정렬해 얻는다.
 *   - 화살 = 잠든 스레드 → 그 스레드가 기다리는 자물쇠의 지금 주인.
 *   - 지도 — 판마다 지금 잠금 순서로 몫 × 사이 일 스무 칸을 **같은 셈(`simulate`)으로** 모두 돌린다.
 *   - 동률 규칙은 없다 — 차례는 목록 차례 하나로 정해진다.
 *
 * 걸음 = 한 토막 (CPU 가 한 스레드에 머문 이어진 틱들). 판 하나는 `round` 1 + 토막 T + `result` 1 걸음.
 *
 * 이벤트 (모두 걸음 경계 — silent 없음. IR 이 없어 phase 도 없다):
 *   round   { slice: number, gap: number, order: number,
 *             threads: string[], locks: string[],
 *             programs: string[][]                 — 스레드마다 줄 글자 (가상 표기)
 *             sliceLadder: number[], gapLadder: number[],
 *             cells: { slice: number, gap: number, deadlock: boolean, ticks: number }[] }
 *   chunk   { thread: number, from: number, to: number,        — 틱 번호 (0 부터)
 *             lines: { tick: number, line: number, outcome: 'ran' | 'blocked' }[],
 *             notes: { kind: 'blocked' | 'handoff' | 'done', thread: number, lock: number, to: number }[]
 *                    — blocked: thread 가 lock 앞에서 잠듦, to = 그 주인 / handoff: thread 가 lock 을 to 에게 /
 *                      done: thread 가 끝남 (lock · to 는 -1)
 *             pc: number[], states: ('running' | 'ready' | 'asleep' | 'done')[],
 *             held: number[][]                     — 스레드마다 쥔 자물쇠 색인 (잡은 차례)
 *             arrows: { from: number, to: number, lock: number }[] }
 *   result  { deadlock: boolean, ticks: number, cycle: number[] }   — cycle 은 교착일 때 고리의 스레드 차례
 *
 * 계기 (그 판 하나의 값 — 판마다 되돌린다):
 *   ticks          교착이면 멈춘 틱, 끝이면 끝난 틱 수
 *   blocked-tries  막힌 시도 수
 *   stuck-threads  교착에 묶인 스레드 수 (끝이면 0)
 *   deadlock-cells 지금 잠금 순서의 지도에서 교착 칸 수
 *
 * 손잡이 (reactive): slice · gap · order — payload.value 가 사다리에 있어야 받는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DeadlockData = {
  type: 'deadlock';
  stepMs: number;
  sliceLadder: number[];
  slice: number;
  gapLadder: number[];
  gap: number;
  orderLadder: number[];
  order: number;
  threads: string[];
  locks: string[];
  pairs: number[][];
};

export type Op = { kind: 'lock' | 'unlock' | 'work'; lock: number };

export type TickRecord = {
  tick: number;
  thread: number;
  line: number;
  outcome: 'ran' | 'blocked';
  notes: Note[];
  pc: number[];
  asleep: boolean[];
  held: number[][];
  owner: number[];
  waitq: number[][];
};

export type Note = { kind: 'blocked' | 'handoff' | 'done'; thread: number; lock: number; to: number };

export type RunResult = {
  deadlock: boolean;
  ticks: number;
  blocked: number;
  log: TickRecord[];
};

export type Arrow = { from: number; to: number; lock: number };

const HORIZON = 200;

/** 스레드 i 의 프로그램. 번호 차례면 두 자물쇠를 색인 순으로 바꿔 쓴다. */
export function programOf(data: DeadlockData, i: number, gap: number, ordered: boolean): Op[] {
  const pair = data.pairs[i];
  if (pair === undefined || pair.length !== 2) throw new Error(`스레드 ${i} 의 자물쇠 쌍이 둘이 아니다`);
  let [a, b] = pair as [number, number];
  for (const m of [a, b]) {
    if (!Number.isInteger(m) || m < 0 || m >= data.locks.length) throw new Error(`모르는 자물쇠 색인 ${m}`);
  }
  if (a === b) throw new Error(`스레드 ${i} 가 같은 자물쇠를 둘 잡는다`);
  if (ordered && a > b) [a, b] = [b, a];
  const ops: Op[] = [{ kind: 'lock', lock: a }];
  for (let w = 0; w < gap; w += 1) ops.push({ kind: 'work', lock: -1 });
  ops.push({ kind: 'lock', lock: b }, { kind: 'work', lock: -1 }, { kind: 'unlock', lock: b }, { kind: 'unlock', lock: a });
  return ops;
}

export function lineText(op: Op, locks: string[]): string {
  if (op.kind === 'work') return 'work()';
  const name = locks[op.lock];
  if (name === undefined) throw new Error(`모르는 자물쇠 색인 ${op.lock}`);
  return op.kind === 'lock' ? `lock(${name})` : `unlock(${name})`;
}

/** 돌림 · 넘겨주기 모형으로 끝까지 돌린다. 지평 안에 끝나지도 멈추지도 않으면 던진다. */
export function simulate(progs: Op[][], nLocks: number, k: number, horizon = HORIZON): RunResult {
  const n = progs.length;
  const pc = new Array<number>(n).fill(0);
  const asleep = new Array<boolean>(n).fill(false);
  const held: number[][] = progs.map(() => []);
  const owner = new Array<number>(nLocks).fill(-1);
  const waitq: number[][] = Array.from({ length: nLocks }, () => []);
  let cur = 0;
  let used = 0;
  let blocked = 0;
  const log: TickRecord[] = [];
  for (let tick = 0; tick < horizon; tick += 1) {
    const alive = progs.map((_, i) => i).filter((i) => pc[i]! < progs[i]!.length);
    if (alive.length === 0) return { deadlock: false, ticks: tick, blocked, log };
    const runnable = alive.filter((i) => !asleep[i]);
    if (runnable.length === 0) return { deadlock: true, ticks: tick, blocked, log };
    if (tick === 0) {
      cur = runnable[0]!;
      used = 0;
    } else if (!runnable.includes(cur) || used >= k) {
      for (let s = 1; s <= n; s += 1) {
        const cand = (cur + s) % n;
        if (runnable.includes(cand)) {
          cur = cand;
          break;
        }
      }
      used = 0;
    }
    const i = cur;
    if (asleep[i]) throw new Error(`차례에 잠든 스레드 ${i} 가 왔다`);
    const line = pc[i]!;
    const op = progs[i]![line];
    if (op === undefined) throw new Error(`스레드 ${i} 의 줄 ${line} 이 없다`);
    used += 1;
    let outcome: 'ran' | 'blocked' = 'ran';
    const notes: Note[] = [];
    if (op.kind === 'lock') {
      const m = op.lock;
      if (owner[m] === undefined) throw new Error(`모르는 자물쇠 색인 ${m}`);
      if (owner[m] === -1) {
        owner[m] = i;
        held[i]!.push(m);
        pc[i] = line + 1;
      } else {
        asleep[i] = true;
        waitq[m]!.push(i);
        blocked += 1;
        used = k;
        outcome = 'blocked';
        notes.push({ kind: 'blocked', thread: i, lock: m, to: owner[m]! });
      }
    } else if (op.kind === 'unlock') {
      const m = op.lock;
      if (owner[m] !== i) throw new Error(`주인 아닌 unlock — 스레드 ${i}, 자물쇠 ${m}`);
      held[i] = held[i]!.filter((x) => x !== m);
      const q = waitq[m]!;
      const j = q.shift();
      if (j !== undefined) {
        owner[m] = j;
        asleep[j] = false;
        held[j]!.push(m);
        pc[j] = pc[j]! + 1;
        notes.push({ kind: 'handoff', thread: i, lock: m, to: j });
      } else {
        owner[m] = -1;
      }
      pc[i] = line + 1;
    } else if (op.kind === 'work') {
      pc[i] = line + 1;
    } else {
      throw new Error(`모르는 줄 ${String((op as { kind: unknown }).kind)}`);
    }
    if (pc[i] === progs[i]!.length) notes.push({ kind: 'done', thread: i, lock: -1, to: -1 });
    log.push({
      tick,
      thread: i,
      line,
      outcome,
      notes,
      pc: pc.slice(),
      asleep: asleep.slice(),
      held: held.map((h) => h.slice()),
      owner: owner.slice(),
      waitq: waitq.map((q) => q.slice()),
    });
  }
  throw new Error(`지평 ${horizon} 틱 안에 끝나지도 멈추지도 않았다`);
}

/** 화살 — 잠든 스레드 → 그 스레드가 기다리는 자물쇠의 지금 주인. 스레드 번호 차례. */
export function arrowsOf(owner: number[], waitq: number[][]): Arrow[] {
  const out: Arrow[] = [];
  waitq.forEach((q, m) => {
    for (const j of q) {
      const o = owner[m];
      if (o === undefined || o < 0) throw new Error(`자물쇠 ${m} 에 줄이 있는데 주인이 없다`);
      out.push({ from: j, to: o, lock: m });
    }
  });
  return out.sort((x, y) => x.from - y.from);
}

/** 화살을 따라가 출발 스레드로 돌아오는 첫 고리. 없으면 빈 배열. */
export function cycleOf(arrows: Arrow[], n: number): number[] {
  const next = new Map<number, number>();
  for (const a of arrows) next.set(a.from, a.to);
  for (let s = 0; s < n; s += 1) {
    if (!next.has(s)) continue;
    const path = [s];
    let x = next.get(s)!;
    for (let hop = 0; hop <= n; hop += 1) {
      if (x === s) return path;
      const nx = next.get(x);
      if (nx === undefined) break;
      path.push(x);
      x = nx;
    }
  }
  return [];
}

/** 한 칸을 돌린다 — 판과 지도가 같은 셈을 쓴다. */
export function runCell(data: DeadlockData, slice: number, gap: number, order: number): RunResult & { progs: Op[][] } {
  if (data.pairs.length !== data.threads.length) throw new Error('스레드 수와 자물쇠 쌍 수가 다르다');
  const progs = data.threads.map((_, i) => programOf(data, i, gap, order === 1));
  const r = simulate(progs, data.locks.length, slice);
  return { ...r, progs };
}

export type Cell = { slice: number; gap: number; deadlock: boolean; ticks: number };

export function mapOf(data: DeadlockData, order: number): Cell[] {
  const cells: Cell[] = [];
  for (const k of data.sliceLadder) {
    for (const g of data.gapLadder) {
      const r = runCell(data, k, g, order);
      cells.push({ slice: k, gap: g, deadlock: r.deadlock, ticks: r.ticks });
    }
  }
  return cells;
}

/** 토막 — CPU 가 한 스레드에 머문 이어진 틱들. */
export function chunksOf(log: TickRecord[]): TickRecord[][] {
  const out: TickRecord[][] = [];
  for (const rec of log) {
    const last = out[out.length - 1];
    if (last !== undefined && last[0]!.thread === rec.thread) last.push(rec);
    else out.push([rec]);
  }
  return out;
}

function inLadder(ladder: number[], v: number, name: string): number {
  if (!ladder.includes(v)) throw new Error(`${name} 값 ${v} 가 사다리 [${ladder.join(', ')}] 밖이다`);
  return v;
}

export async function deadlockAlgorithm(ctx: FacetContext<DeadlockData>): Promise<void> {
  const rc = ctx as ReactiveContext<DeadlockData>;
  const data = rc.data;
  const stepMs = data.stepMs;
  let slice = inLadder(data.sliceLadder, data.slice, 'slice');
  let gap = inLadder(data.gapLadder, data.gap, 'gap');
  let order = inLadder(data.orderLadder, data.order, 'order');

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const show = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    rc.metric(name, prev === undefined ? value : value - prev);
  };

  const playRound = async (): Promise<boolean> => {
    const cells = mapOf(data, order);
    const run = runCell(data, slice, gap, order);
    const n = data.threads.length;
    show('ticks', 0);
    show('blocked-tries', 0);
    show('stuck-threads', 0);
    show('deadlock-cells', cells.filter((c) => c.deadlock).length);
    await rc.emit({
      type: 'round',
      payload: {
        slice,
        gap,
        order,
        threads: data.threads.slice(),
        locks: data.locks.slice(),
        programs: run.progs.map((p) => p.map((op) => lineText(op, data.locks))),
        sliceLadder: data.sliceLadder.slice(),
        gapLadder: data.gapLadder.slice(),
        cells,
      },
    });
    if (!(await rc.sleep(stepMs))) return false;

    let blockedSoFar = 0;
    for (const chunk of chunksOf(run.log)) {
      if (rc.cancelled) return false;
      const last = chunk[chunk.length - 1]!;
      const who = last.thread;
      const states = last.pc.map((p, i) => {
        if (p >= run.progs[i]!.length) return 'done';
        if (last.asleep[i]) return 'asleep';
        return i === who ? 'running' : 'ready';
      });
      blockedSoFar += chunk.filter((r) => r.outcome === 'blocked').length;
      show('ticks', last.tick + 1);
      show('blocked-tries', blockedSoFar);
      await rc.emit({
        type: 'chunk',
        payload: {
          thread: who,
          from: chunk[0]!.tick,
          to: last.tick,
          lines: chunk.map((r) => ({ tick: r.tick, line: r.line, outcome: r.outcome })),
          notes: chunk.flatMap((r) => r.notes),
          pc: last.pc,
          states,
          held: last.held,
          arrows: arrowsOf(last.owner, last.waitq),
        },
      });
      if (!(await rc.sleep(stepMs))) return false;
    }

    const lastRec = run.log[run.log.length - 1];
    let cycle: number[] = [];
    let stuck = 0;
    if (run.deadlock) {
      if (lastRec === undefined) throw new Error('멈췄는데 틱 기록이 없다');
      cycle = cycleOf(arrowsOf(lastRec.owner, lastRec.waitq), n);
      if (cycle.length === 0) throw new Error('멈췄는데 화살이 고리로 닫히지 않는다');
      stuck = lastRec.pc.filter((p, i) => p < run.progs[i]!.length).length;
    }
    if (run.blocked !== blockedSoFar) throw new Error('막힌 시도 수가 토막 합과 다르다');
    show('ticks', run.ticks);
    show('stuck-threads', stuck);
    await rc.emit({ type: 'result', payload: { deadlock: run.deadlock, ticks: run.ticks, cycle } });
    return true;
  };

  try {
    while (!rc.cancelled) {
      if (rc.cancelled) return;
      if (!(await playRound())) return;
      // 한 판을 끝냈다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (rc.cancelled) return;
        const input = await rc.waitForInput();
        if (rc.cancelled) return;
        const p = (input.payload ?? {}) as { value?: unknown };
        if (input.type !== 'slice' && input.type !== 'gap' && input.type !== 'order') continue;
        if (typeof p.value !== 'number') continue;
        if (input.type === 'slice') slice = inLadder(data.sliceLadder, p.value, 'slice');
        else if (input.type === 'gap') gap = inLadder(data.gapLadder, p.value, 'gap');
        else order = inLadder(data.orderLadder, p.value, 'order');
        break;
      }
    }
  } catch (err) {
    if (!rc.cancelled) throw err;
  }
}
