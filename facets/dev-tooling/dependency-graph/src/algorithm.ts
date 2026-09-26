/**
 * dependency-graph — 일꾼을 늘리면 빌드가 빨라지다가 가장 긴 기다림의 사슬에서 멈춘다.
 *
 * 대상마다 "대상 ← 입력들"(적힌 차례) 과 걸리는 초가 있다. 한 판은 일꾼 수 하나로 스케줄을
 * 끝까지 재생하고, 손잡이를 기다렸다가 받은 값으로 다시 재생한다.
 *
 * ## 스케줄 규약
 * - 시각 t 에 먼저 t 에 끝나는 것을 끝낸다 → 그다음 입력이 모두 끝난 대상 가운데 아직 시작 안 한 것을
 *   **데이터 차례대로** 빈 일꾼에 올린다 (빈 일꾼이 다 차면 그 시각의 올리기를 멈춘다).
 *   다음 시각 = 일하는 것 가운데 가장 이른 끝 시각. 시간은 정수 초.
 * - **동률 규칙** — 준비된 것이 빈 일꾼보다 많으면 데이터 차례가 앞선 것이 먼저 오른다. 이 데이터에서
 *   실제로 걸린다: 일꾼 1 에서 t=0 · 3 · 7 · 9, 일꾼 2 에서 t=0 · 3, 일꾼 3 에서 t=0
 *   (codegen.o 가 데이터 차례 넷째라 기다린다). 일꾼 4 · 6 에서는 걸리지 않는다.
 * - 일꾼 줄(화면 자리)은 빈 줄 가운데 번호가 가장 작은 것. payload 의 lane 은 0 부터, 화면은 1 부터.
 * - 가장 긴 사슬 = 입력을 따라 이은 길 가운데 걸리는 초의 합이 가장 큰 것. 동률이면 데이터 차례가
 *   앞선 끝 대상 · 앞선 입력 (이 데이터에서는 동률 없음).
 * - 입력 이름이 대상 목록에 없으면 · 고리가 있으면 · 시작할 것이 없는데 남은 대상이 있으면 던진다.
 *
 * ## 이벤트 (걸음 = 시각 하나)
 * - `round`  걸음 0. payload `{ workers: number; laneMax: number; axisMax: number;
 *            targets: { id: string; seconds: number; needs: string[] }[];
 *            chain: { id: string; seconds: number }[]; chainSeconds: number; workSum: number }`
 *            chain 은 입력 쪽(잎)에서 끝 대상 쪽으로.
 * - `tick`   시각 하나. payload `{ t: number; finished: string[];
 *            started: { id: string; lane: number; start: number; end: number }[];
 *            waiting: string[]; running: number }` — waiting 은 준비됐지만 빈 일꾼이 없어 못 오른 것
 * - `stop`   끝 시각 선이 멈추는 걸음. payload `{ finishTime: number; finished: string[]; chainSeconds: number; gap: number }`
 *            finished 는 끝 시각에 끝나는 대상
 *            gap = 끝 시각 − 가장 긴 사슬 (0 이면 바닥에 닿았다)
 * - `phase`  silent. payload `{ phase }`
 *
 * ## phase 어휘 (irs.ts 와 같은 집합)
 * - `start`  대상을 일꾼에 올렸다 — 한 시각 걸음에 올림이 있으면 이것이 마지막으로 켜진다
 * - `finish` 대상이 끝났다 — 올림 없이 끝남만 있는 시각
 * - `done`   끝 시각에 이르렀다
 *
 * ## 계기 (회차마다 값, 누적 금지 — 지금 값을 들고 차이만 보낸다)
 * - `finish-time` 끝 시각(초). 걸음 0 에 0, stop 걸음에 끝 시각
 * - `busy-max`    동시에 일한 최대. 걸음 0 에 0, 올리는 걸음마다 지금까지의 최대
 * - `work-sum`    일의 합(초). 걸음 0 에 셈해 보낸다
 *
 * ## 입력
 * - `workers`         payload.value ∈ workerLadder
 * - `codegen-seconds` payload.value ∈ secondsLadder (secondsTarget 의 걸리는 초를 바꾼다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DependencyGraphTarget = { id: string; needs: string[]; seconds: number };

export type DependencyGraphData = {
  type: 'dependency-graph';
  stepMs: number;
  targets: DependencyGraphTarget[];
  workerLadder: number[];
  secondsTarget: string;
  secondsLadder: number[];
  defaultWorkers: number;
  defaultSeconds: number;
};

export type ScheduledStart = { id: string; lane: number; start: number; end: number };

export type ScheduleTick = {
  t: number;
  finished: string[];
  started: ScheduledStart[];
  waiting: string[];
  running: number;
};

export type Schedule = {
  ticks: ScheduleTick[];
  finishTime: number;
  /** 끝 시각에 끝나는 대상 — stop 걸음이 끝낸다 */
  lastFinished: string[];
  busyMax: number;
  /** 데이터 차례의 대상마다 시작 시각 — IR 의 startAt 버퍼와 견준다 */
  startAt: number[];
};

export type Chain = { path: { id: string; seconds: number }[]; seconds: number };

/** 입력 이름을 데이터 차례의 번호로 바꾼다. 모르는 이름이면 던진다. */
export function needIndices(targets: DependencyGraphTarget[]): number[][] {
  const index = new Map<string, number>();
  targets.forEach((tg, i) => {
    if (index.has(tg.id)) throw new Error(`dependency-graph: 대상 이름이 겹친다 — ${tg.id}`);
    index.set(tg.id, i);
  });
  return targets.map((tg) =>
    tg.needs.map((name) => {
      const j = index.get(name);
      if (j === undefined) throw new Error(`dependency-graph: ${tg.id} 의 입력 ${name} 이 규칙에도 소스에도 없다`);
      return j;
    }),
  );
}

/** 목록 스케줄링 — 머리말의 규약 그대로. */
export function planSchedule(targets: DependencyGraphTarget[], workers: number): Schedule {
  if (!Number.isInteger(workers) || workers < 1) throw new Error(`dependency-graph: 일꾼 수가 1 이상의 정수가 아니다 — ${workers}`);
  const n = targets.length;
  const needs = needIndices(targets);
  const state = targets.map(() => 0); // 0 안 시작 · 1 일하는 중 · 2 끝남
  const startAt = targets.map(() => 0);
  const endAt = targets.map(() => 0);
  const laneOf = targets.map(() => -1);
  const laneBusy: boolean[] = Array.from({ length: workers }, () => false);
  const ticks: ScheduleTick[] = [];
  let t = 0;
  let doneCount = 0;
  let running = 0;
  let busyMax = 0;
  while (doneCount < n) {
    const finished: string[] = [];
    for (let i = 0; i < n; i += 1) {
      if (state[i] === 1 && endAt[i] === t) {
        state[i] = 2;
        doneCount += 1;
        running -= 1;
        laneBusy[laneOf[i]!] = false;
        finished.push(targets[i]!.id);
      }
    }
    const started: ScheduledStart[] = [];
    const waiting: string[] = [];
    for (let i = 0; i < n; i += 1) {
      if (state[i] !== 0) continue;
      const ready = needs[i]!.every((j) => state[j] === 2);
      if (!ready) continue;
      if (running >= workers) {
        waiting.push(targets[i]!.id);
        continue;
      }
      const lane = laneBusy.indexOf(false);
      if (lane < 0) throw new Error('dependency-graph: 일하는 수와 빈 줄이 맞지 않는다');
      laneBusy[lane] = true;
      laneOf[i] = lane;
      state[i] = 1;
      startAt[i] = t;
      endAt[i] = t + targets[i]!.seconds;
      running += 1;
      started.push({ id: targets[i]!.id, lane, start: t, end: endAt[i]! });
    }
    busyMax = Math.max(busyMax, running);
    ticks.push({ t, finished, started, waiting, running });
    if (doneCount < n) {
      if (running === 0) throw new Error(`dependency-graph: 시각 ${t} 에 시작할 것이 없는데 남은 대상이 있다 (고리?)`);
      let soonest = -1;
      for (let i = 0; i < n; i += 1) {
        if (state[i] === 1 && (soonest < 0 || endAt[i]! < soonest)) soonest = endAt[i]!;
      }
      t = soonest;
    }
  }
  // 마지막 tick 은 끝남만 있는 시각 — 끝 시각 자체라 걸음으로 두지 않고 stop 걸음이 맡는다
  const last = ticks[ticks.length - 1];
  if (!last || last.started.length > 0) throw new Error('dependency-graph: 마지막 시각에 올림이 있다');
  ticks.pop();
  return { ticks, finishTime: t, lastFinished: last.finished, busyMax, startAt };
}

/** 가장 긴 사슬 — 입력을 따라 이은 길 가운데 초의 합이 가장 큰 것. 동률이면 데이터 차례가 앞선 것. */
export function longestChain(targets: DependencyGraphTarget[]): Chain {
  const needs = needIndices(targets);
  const best: (number | undefined)[] = targets.map(() => undefined);
  const via: number[] = targets.map(() => -1);
  const visiting = new Set<number>();
  const walk = (i: number): number => {
    const known = best[i];
    if (known !== undefined) return known;
    if (visiting.has(i)) throw new Error(`dependency-graph: 고리 — ${targets[i]!.id}`);
    visiting.add(i);
    let top = 0;
    for (const j of needs[i]!) {
      const v = walk(j);
      if (v > top) {
        top = v;
        via[i] = j;
      }
    }
    visiting.delete(i);
    const total = top + targets[i]!.seconds;
    best[i] = total;
    return total;
  };
  let end = -1;
  let seconds = 0;
  targets.forEach((_, i) => {
    const v = walk(i);
    if (v > seconds) {
      seconds = v;
      end = i;
    }
  });
  if (end < 0) throw new Error('dependency-graph: 대상이 없다');
  const path: { id: string; seconds: number }[] = [];
  for (let i = end; i >= 0; i = via[i]!) path.unshift({ id: targets[i]!.id, seconds: targets[i]!.seconds });
  return { path, seconds };
}

/** 손잡이 값으로 대상 목록을 만든다 — secondsTarget 의 초만 바꾼다. */
export function targetsWith(data: DependencyGraphData, seconds: number): DependencyGraphTarget[] {
  if (!data.targets.some((tg) => tg.id === data.secondsTarget)) {
    throw new Error(`dependency-graph: 바꿀 대상 ${data.secondsTarget} 이 대상 목록에 없다`);
  }
  return data.targets.map((tg) => (tg.id === data.secondsTarget ? { ...tg, seconds } : { ...tg, needs: [...tg.needs] }));
}

type MetricName = 'finish-time' | 'busy-max' | 'work-sum';

export async function dependencyGraphAlgorithm(ctx: FacetContext<DependencyGraphData>): Promise<void> {
  const rc = ctx as ReactiveContext<DependencyGraphData>;
  const data = ctx.data;
  if (!data.workerLadder.includes(data.defaultWorkers)) throw new Error('dependency-graph: 기본 일꾼 수가 사다리에 없다');
  if (!data.secondsLadder.includes(data.defaultSeconds)) throw new Error('dependency-graph: 기본 초가 사다리에 없다');
  const laneMax = Math.max(...data.workerLadder);
  // 축 끝 = 어느 손잡이 값에서도 끝 시각이 넘지 않는 값 (끝 시각 ≤ 일의 합)
  const axisMax = Math.max(...data.secondsLadder.map((s) => targetsWith(data, s).reduce((a, tg) => a + tg.seconds, 0)));

  const shown: Record<MetricName, number> = { 'finish-time': 0, 'busy-max': 0, 'work-sum': 0 };
  const setMetric = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let workers = data.defaultWorkers;
  let seconds = data.defaultSeconds;

  const play = async (): Promise<boolean> => {
    const targets = targetsWith(data, seconds);
    const schedule = planSchedule(targets, workers);
    const chain = longestChain(targets);
    const workSum = targets.reduce((a, tg) => a + tg.seconds, 0);

    await ctx.emit({
      type: 'round',
      payload: {
        workers,
        laneMax,
        axisMax,
        targets: targets.map((tg) => ({ id: tg.id, seconds: tg.seconds, needs: [...tg.needs] })),
        chain: chain.path,
        chainSeconds: chain.seconds,
        workSum,
      },
    });
    setMetric('finish-time', 0);
    setMetric('busy-max', 0);
    setMetric('work-sum', workSum);
    if (!(await rc.sleep(data.stepMs))) return false;

    let busy = 0;
    for (const tick of schedule.ticks) {
      if (ctx.cancelled) return false;
      await ctx.emit({
        type: 'tick',
        payload: {
          t: tick.t,
          finished: tick.finished,
          started: tick.started,
          waiting: tick.waiting,
          running: tick.running,
        },
      });
      if (tick.finished.length > 0) await phase('finish');
      if (tick.started.length > 0) {
        busy = Math.max(busy, tick.running);
        setMetric('busy-max', busy);
        await phase('start');
      }
      if (!(await rc.sleep(data.stepMs))) return false;
    }
    if (busy !== schedule.busyMax) throw new Error('dependency-graph: 동시 최대가 스케줄과 다르다');

    await ctx.emit({
      type: 'stop',
      payload: {
        finishTime: schedule.finishTime,
        finished: schedule.lastFinished,
        chainSeconds: chain.seconds, gap: schedule.finishTime - chain.seconds,
      },
    });
    await phase('done');
    setMetric('finish-time', schedule.finishTime);
    return true;
  };

  try {
    if (!(await play())) return;
    while (!ctx.cancelled) {
      const input = await rc.waitForInput();
      if (ctx.cancelled) return;
      const p = input.payload;
      const value = typeof p === 'object' && p !== null && 'value' in p ? (p as { value?: unknown }).value : undefined;
      if (input.type === 'workers') {
        if (typeof value !== 'number' || !data.workerLadder.includes(value)) throw new Error(`dependency-graph: 일꾼 수 ${String(value)} 가 사다리에 없다`);
        workers = value;
      } else if (input.type === 'codegen-seconds') {
        if (typeof value !== 'number' || !data.secondsLadder.includes(value)) throw new Error(`dependency-graph: 초 ${String(value)} 가 사다리에 없다`);
        seconds = value;
      } else {
        continue;
      }
      if (!(await play())) return;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
