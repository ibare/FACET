/**
 * mutex — 틀리는지는 끊기는 자리가 정하고, 자물쇠는 그 운을 지운다.
 *
 * 두 스레드가 같은 프로그램으로 공유 값 `count` 를 두 번씩 올린다. CPU 하나를 돌림 몫 k 틱까지 목록 차례로
 * 나눠 준다. 알고리즘이 프로그램을 규약대로 실제로 돌려 합친 실행 차례 · 덮은 쓰기 · 막힌 시도를 셈하고,
 * 그 기록을 **토막**(CPU 가 한 스레드에 머문 이어진 틱들) 단위로 걸음마다 내보낸다.
 *
 * 규약 (synchronization/common.md 그대로 — 몫 k 만 더함)
 *   - 한 틱 = 한 스레드가 제 프로그램의 한 줄. 막힌 `lock` 시도도 한 틱이고, 잠드는 틱에 곧바로 차례를 넘긴다.
 *   - 돌림: 목록 차례로 준비된 스레드에게 k 틱까지. 첫 틱은 목록 맨 앞. 잠든 · 끝난 스레드는 건너뛴다.
 *     자기만 남으면 다시 자기(새 몫).
 *   - `unlock` 은 줄이 있으면 맨 앞에게 곧바로 넘긴다 — 넘겨받은 스레드는 `lock` 다음 줄부터. 놓는 틱과
 *     넘겨받는 틱은 같다. 줄이 없으면 비운다.
 *   - 덮은 쓰기: 쓰기 하나가 `count` 를 옛 값에서 새 값으로 바꿀 때 새 값 − 옛 값 < 1 이면 남이 더한 것을
 *     덮은 것이고, 그 자리에서 잃은 수 = 1 − (새 값 − 옛 값). "먼저 쓴 쪽이 덮였다" 로 세지 않는다.
 *   - 있어야 할 값 = 두 스레드의 쓰기 줄 수의 합(프로그램에서 센다). 잃은 수의 합은 (있어야 할 값 − 끝값) 과
 *     같아야 한다 — 갈리면 던진다.
 *   - 동률 규칙은 없다 (정수만 다룬다).
 *
 * 던지는 자리 (C6): 모르는 줄 op · 주인 아닌 스레드의 unlock · 차례에 잠든 스레드가 옴 · 준비된 스레드가 없는데
 * 안 끝난 스레드가 있음 · 지평(200 틱) 안에 끝나지 않음 · 사다리 밖 손잡이 값 · 잃은 수 두 셈이 갈림.
 *
 * 이벤트 (모두 걸음 경계 앞에서 보낸다. silent 인 것은 없다)
 *   - `round` — 판의 시작 (걸음 0).
 *     payload { slice: number, useLock: number, threads: string[], program: string[] (줄 글자, 두 스레드 같음),
 *               shared: string, register: string, lock: string | null (자물쇠 없음이면 null), start: number,
 *               expected: number }
 *   - `chunk` — 한 토막 (걸음 1..T).
 *     payload { thread: number, from: number, to: number,
 *               ticks: { tick: number, thread: number, line: number, text: string, nth: number,
 *                        blocked: boolean, lost: { old: number, new: number } | null, owner: number | null,
 *                        holder: number | null }[],
 *               count: number, regs: (number | null)[], pcs: number[], asleep: boolean[], finished: boolean[],
 *               owner: number | null, queue: number[] }
 *     `nth` 는 그 스레드가 이 판에서 같은 줄 글자를 몇 번째로 실행했는가(1 부터). `owner` 는 그 틱 뒤의 자물쇠 주인,
 *     `holder` 는 그 줄을 도는 동안의 주인(lock 잡는 틱 · unlock 틱은 도는 스레드, 그 밖은 틱 이전의 주인).
 *   - `done` — 판의 끝 (마지막 걸음).
 *     payload { count: number, expected: number, lost: number, ticks: number, blocked: number }
 *
 * phase 어휘 — 없다. 코드 패널을 두지 않는다 (irs.ts 의 주석).
 *
 * 계기 (그 판 하나의 값 — 판 처음에 0 으로 되돌린다)
 *   - `final-count`   지금 `count` (쓰기마다 따라간다 — 끝 걸음에서 끝값)
 *   - `lost-updates`  덮은 쓰기에서 잃은 수의 합
 *   - `ticks`         지금까지 흐른 틱 수
 *   - `blocked-tries` 막힌 `lock` 시도 수
 *
 * 손잡이 (reactive): `slice` (돌림 몫, sliceLadder) · `useLock` (0 없음 / 1 있음, lockLadder).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MutexLine = { op: string; text: string };

export type MutexData = {
  type: 'mutex';
  stepMs: number;
  sliceLadder: number[];
  slice: number;
  lockLadder: number[];
  useLock: number;
  threads: string[];
  shared: string;
  register: string;
  lock: string;
  start: number;
  /** 색인 = useLock. 두 스레드가 같은 프로그램을 돈다. */
  programs: MutexLine[][];
};

export type MutexTick = {
  tick: number;
  thread: number;
  line: number;
  text: string;
  nth: number;
  blocked: boolean;
  lost: { old: number; new: number } | null;
  owner: number | null;
  /** 그 줄을 도는 동안의 주인 — lock 을 잡는 틱과 unlock 틱은 도는 스레드, 그 밖(막힌 시도 포함)은 틱 이전의 주인. */
  holder: number | null;
};

export type MutexChunk = {
  thread: number;
  from: number;
  to: number;
  ticks: MutexTick[];
  count: number;
  regs: (number | null)[];
  pcs: number[];
  asleep: boolean[];
  finished: boolean[];
  owner: number | null;
  queue: number[];
  lostSoFar: number;
  blockedSoFar: number;
};

export type MutexRun = {
  chunks: MutexChunk[];
  ticks: number;
  count: number;
  expected: number;
  lost: number;
  blocked: number;
  order: string;
};

const HORIZON = 200;

/** 프로그램을 규약대로 돌린다. 합친 차례를 토막으로 묶어 돌려준다. */
export function runMutex(data: MutexData, slice: number, useLock: number): MutexRun {
  if (!data.sliceLadder.includes(slice)) throw new Error(`돌림 몫 ${slice} 이 사다리에 없다`);
  if (!data.lockLadder.includes(useLock)) throw new Error(`자물쇠 값 ${useLock} 이 사다리에 없다`);
  const program = data.programs[useLock];
  if (!program) throw new Error(`useLock ${useLock} 의 프로그램이 없다`);
  const n = data.threads.length;
  if (n === 0) throw new Error('스레드가 없다');
  const k = slice;

  const pc = new Array<number>(n).fill(0);
  const reg = new Array<number | null>(n).fill(null);
  const asleep = new Array<boolean>(n).fill(false);
  const seen: Map<string, number>[] = data.threads.map(() => new Map());
  let shared = data.start;
  let owner: number | null = null;
  const queue: number[] = [];
  let cur = 0;
  let used = 0;
  let blocked = 0;
  let lostSum = 0;
  let lastStore = data.start;
  const expected = n * program.filter((l) => l.op === 'store').length;
  const chunks: MutexChunk[] = [];
  let order = '';

  const snapshot = (c: MutexChunk): void => {
    c.count = shared;
    c.regs = [...reg];
    c.pcs = [...pc];
    c.asleep = [...asleep];
    c.finished = pc.map((p) => p >= program.length);
    c.owner = owner;
    c.queue = [...queue];
    c.lostSoFar = lostSum;
    c.blockedSoFar = blocked;
  };

  for (let tick = 0; tick < HORIZON; tick += 1) {
    const alive = pc.map((p, i) => (p < program.length ? i : -1)).filter((i) => i >= 0);
    if (alive.length === 0) {
      if (lostSum !== expected - shared) {
        throw new Error(`잃은 수 두 셈이 갈린다: 덮은 쓰기 ${lostSum} · 있어야 할 값 − 끝값 ${expected - shared}`);
      }
      return { chunks, ticks: tick, count: shared, expected, lost: lostSum, blocked, order };
    }
    const runnable = alive.filter((i) => !asleep[i]);
    if (runnable.length === 0) throw new Error(`틱 ${tick}: 준비된 스레드가 없는데 안 끝난 스레드가 있다`);
    if (tick === 0) {
      cur = runnable[0]!;
      used = 0;
    } else if (!runnable.includes(cur) || used >= k) {
      let found = false;
      for (let s = 1; s <= n; s += 1) {
        const cand = (cur + s) % n;
        if (runnable.includes(cand)) {
          cur = cand;
          found = true;
          break;
        }
      }
      if (!found) throw new Error(`틱 ${tick}: 다음 스레드를 찾지 못했다`);
      used = 0;
    }
    const i = cur;
    if (asleep[i]) throw new Error(`틱 ${tick}: 차례에 잠든 스레드 ${data.threads[i]} 가 왔다`);
    const line = pc[i]!;
    const op = program[line];
    if (!op) throw new Error(`틱 ${tick}: 스레드 ${data.threads[i]} 의 줄 ${line} 이 없다`);
    used += 1;
    const nth = (seen[i]!.get(op.text) ?? 0) + 1;
    seen[i]!.set(op.text, nth);
    let isBlocked = false;
    let lost: MutexTick['lost'] = null;
    let holder: number | null = owner;
    switch (op.op) {
      case 'load':
        reg[i] = shared;
        pc[i] = line + 1;
        break;
      case 'add': {
        const r = reg[i];
        if (r === null || r === undefined) throw new Error(`틱 ${tick}: ${data.register} 를 읽기 전에 더한다`);
        reg[i] = r + 1;
        pc[i] = line + 1;
        break;
      }
      case 'store': {
        const r = reg[i];
        if (r === null || r === undefined) throw new Error(`틱 ${tick}: ${data.register} 를 읽기 전에 쓴다`);
        const old = lastStore;
        shared = r;
        const loss = 1 - (r - old);
        if (loss < 0) throw new Error(`틱 ${tick}: 쓰기 하나가 1 보다 많이 올렸다 (${old} → ${r})`);
        if (loss > 0) {
          lost = { old, new: r };
          lostSum += loss;
        }
        lastStore = r;
        pc[i] = line + 1;
        break;
      }
      case 'lock':
        if (owner === null) {
          owner = i;
          holder = i;
          pc[i] = line + 1;
        } else {
          asleep[i] = true;
          queue.push(i);
          blocked += 1;
          used = k;
          isBlocked = true;
        }
        break;
      case 'unlock': {
        if (owner !== i) throw new Error(`틱 ${tick}: 주인 아닌 스레드 ${data.threads[i]} 가 unlock 한다`);
        holder = i;
        const next = queue.shift();
        if (next !== undefined) {
          owner = next;
          asleep[next] = false;
          pc[next] = pc[next]! + 1;
        } else {
          owner = null;
        }
        pc[i] = line + 1;
        break;
      }
      default:
        throw new Error(`모르는 줄 op: ${op.op}`);
    }
    order += data.threads[i];
    const rec: MutexTick = { tick, thread: i, line, text: op.text, nth, blocked: isBlocked, lost, owner, holder };
    const last = chunks[chunks.length - 1];
    if (last && last.thread === i) {
      last.ticks.push(rec);
      last.to = tick;
      snapshot(last);
    } else {
      const c: MutexChunk = {
        thread: i, from: tick, to: tick, ticks: [rec],
        count: 0, regs: [], pcs: [], asleep: [], finished: [], owner: null, queue: [], lostSoFar: 0, blockedSoFar: 0,
      };
      snapshot(c);
      chunks.push(c);
    }
  }
  throw new Error(`지평 ${HORIZON} 틱 안에 끝나지 않았다`);
}

export async function mutexAlgorithm(ctx: FacetContext<MutexData>): Promise<void> {
  const rctx = ctx as ReactiveContext<MutexData>;
  const data = ctx.data;
  let slice = data.slice;
  let useLock = data.useLock;

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    if (prev === undefined || value !== prev) ctx.metric(name, value - (prev ?? 0));
  };

  try {
    while (!ctx.cancelled) {
      const run = runMutex(data, slice, useLock);
      setMetric('final-count', 0);
      setMetric('lost-updates', 0);
      setMetric('ticks', 0);
      setMetric('blocked-tries', 0);

      await ctx.emit({
        type: 'round',
        payload: {
          slice,
          useLock,
          threads: [...data.threads],
          program: (data.programs[useLock] ?? []).map((l) => l.text),
          shared: data.shared,
          register: data.register,
          lock: useLock === 1 ? data.lock : null,
          start: data.start,
          expected: run.expected,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      for (const c of run.chunks) {
        if (ctx.cancelled) return;
        await ctx.emit({ type: 'chunk', payload: c });
        setMetric('final-count', c.count);
        setMetric('lost-updates', c.lostSoFar);
        setMetric('ticks', c.to + 1);
        setMetric('blocked-tries', c.blockedSoFar);
        if (!(await rctx.sleep(data.stepMs))) return;
      }

      await ctx.emit({
        type: 'done',
        payload: { count: run.count, expected: run.expected, lost: run.lost, ticks: run.ticks, blocked: run.blocked },
      });

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'slice' && input.type !== 'useLock') continue;
        const p = input.payload as { value?: unknown } | undefined;
        const value = p?.value;
        if (typeof value !== 'number') throw new Error(`${input.type} 의 값이 수가 아니다`);
        if (input.type === 'slice') {
          if (!data.sliceLadder.includes(value)) throw new Error(`돌림 몫 ${value} 이 사다리에 없다`);
          slice = value;
        } else {
          if (!data.lockLadder.includes(value)) throw new Error(`자물쇠 값 ${value} 이 사다리에 없다`);
          useLock = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
