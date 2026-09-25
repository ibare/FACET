/**
 * processState — 다중 프로그래밍. 프로세스 하나가 입출력으로 잠든 사이 다른 것이 CPU 를 쓴다.
 *
 * 모형: CPU 하나. 프로세스마다 CPU `cpuBurst` 틱 → 입출력 `ioBurst` 틱을 되풀이한다. 입출력 장치는
 * 프로세스마다 따로다(장치 다툼 없음). 바꾸는 비용 0, 빼앗기 없음. 시작하면 모두 번호 차례로 준비 줄에
 * 선다(줄 선 틱 0). 지평 `horizon` 틱.
 *
 * 한 틱의 차례:
 *   1. 돌던 것이 몫을 다 썼으면 입출력을 걸고 잠든다 (남은 틱 = ioBurst)
 *   2. 남은 입출력 틱이 0 인 것이 깨어 준비 줄 끝에 선다 (같은 틱에 여럿이면 번호 차례)
 *   3. CPU 가 비었으면 준비 줄 맨 앞을 올린다 — 줄 선 틱이 가장 이른 것, 같으면 번호 작은 것 (동률 규칙)
 *   4. 도는 것의 남은 CPU 틱 −1 · 쓴 틱 +1 (없으면 빈 틱 +1)
 *   5. 준비 줄에 선 수만큼 줄 틱 +, 잠든 것의 남은 입출력 틱 −1
 * 이용률 = (쓴 틱 × 100 + horizon // 2) // horizon (반올림).
 *
 * 이벤트 (payload 스키마):
 *   - `round`  { count: number; processes: string[]; horizon: number }            걸음 0 — 준비 줄에 count 개가 선다
 *   - `tick`   { tick: number; blocked: string | null; woke: string[]; picked: string | null;
 *                running: string | null; ready: string[];                         (ready 는 맨 앞부터)
 *                cards: { pid: string; state: 'ready' | 'running' | 'waiting'; left: number | null }[];
 *                busy: number; readyWait: number }                                  틱 하나 (걸음 1..horizon)
 *   - `result` { busy: number; idle: number; horizon: number; pct: number }         끝 걸음
 *   - `phase`  { phase: string }                                                   silent: true
 *
 * phase 어휘 (irs.ts 와 같다): setup · block · wake · dispatch · run · idle · percent.
 * 틱 걸음에는 그 틱에 일어난 block → wake → dispatch 를 이 차례로 보내고, 셋 다 없을 때만 run / idle 을 보낸다.
 *
 * 계기 (그 판의 값 — 지금 값을 들고 차이만 보낸다):
 *   - `cpu-busy`         틱마다 그 틱까지 쓴 틱 누계
 *   - `ready-wait`       틱마다 준비 줄에서 보낸 틱 누계
 *   - `cpu-utilization`  끝 걸음에 선다
 *   판 처음에 셋 다 0 으로 되돌린다 (첫 판에도 한 번 보낸다).
 *
 * 손잡이: `count` — 프로세스 수. 한 판을 끝까지 재생한 뒤 입력을 기다리고 받은 값으로 다시 한 판.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ProcessStateData = {
  type: 'process-state';
  stepMs: number;
  countLadder: number[];
  count: number;
  processes: string[];
  cpuBurst: number;
  ioBurst: number;
  horizon: number;
};

export type CardState = 'ready' | 'running' | 'waiting';

export type ProcessCard = { pid: string; state: CardState; left: number | null };

export type TickRecord = {
  tick: number;
  blocked: string | null;
  woke: string[];
  picked: string | null;
  running: string | null;
  ready: string[];
  cards: ProcessCard[];
  busy: number;
  readyWait: number;
  idle: number;
};

export type RoundRecord = {
  count: number;
  processes: string[];
  ticks: TickRecord[];
  busy: number;
  idle: number;
  readyWait: number;
  pct: number;
};

const READY = 0;
const RUNNING = 1;
const WAITING = 2;

/** 자료가 셈할 수 있는 모양인지 본다. 아니면 던진다. */
export function validateProcessState(data: ProcessStateData): void {
  if (data.type !== 'process-state') throw new Error(`processState: 모르는 자료 type ${String(data.type)}`);
  if (!Array.isArray(data.countLadder) || data.countLadder.length === 0) {
    throw new Error('processState: countLadder 가 비었다');
  }
  for (const v of data.countLadder) {
    if (!Number.isInteger(v) || v < 1) throw new Error(`processState: 사다리 값 ${v} 가 1 이상의 정수가 아니다`);
  }
  const top = Math.max(...data.countLadder);
  if (!Array.isArray(data.processes) || data.processes.length < top) {
    throw new Error(`processState: processes 가 사다리 끝값 ${top} 보다 짧다`);
  }
  for (const [k, v] of [
    ['cpuBurst', data.cpuBurst],
    ['ioBurst', data.ioBurst],
    ['horizon', data.horizon],
  ] as const) {
    if (!Number.isInteger(v) || v < 1) throw new Error(`processState: ${k} 가 1 보다 작다 (${v})`);
  }
  if (!Number.isInteger(data.stepMs) || data.stepMs < 1) throw new Error('processState: stepMs 가 없다');
}

/** 손잡이 값이 사다리 안에 있는지 본다. 밖이면 던진다. */
export function assertOnLadder(data: ProcessStateData, n: number): void {
  if (!data.countLadder.includes(n)) {
    throw new Error(`processState: 프로세스 수 ${n} 가 사다리 [${data.countLadder.join(', ')}] 밖이다`);
  }
}

/** 한 판을 틱마다 밟아 셈한다. 표를 옮겨 적지 않는다. */
export function simulateProcessState(data: ProcessStateData, n: number): RoundRecord {
  validateProcessState(data);
  assertOnLadder(data, n);
  const names = data.processes.slice(0, n);
  const state: number[] = names.map(() => READY);
  const left: number[] = names.map(() => data.cpuBurst);
  const queuedAt: number[] = names.map(() => 0);
  let running = -1;
  let busy = 0;
  let readyWait = 0;
  let idle = 0;
  const ticks: TickRecord[] = [];

  for (let tick = 0; tick < data.horizon; tick += 1) {
    let blocked: string | null = null;
    const woke: string[] = [];
    let picked: string | null = null;

    // 1. 몫을 다 썼으면 잠든다
    if (running >= 0 && left[running] === 0) {
      state[running] = WAITING;
      left[running] = data.ioBurst;
      blocked = names[running];
      running = -1;
    }
    // 2. 입출력이 끝난 것이 깬다 (번호 차례)
    for (let i = 0; i < n; i += 1) {
      if (state[i] === WAITING && left[i] === 0) {
        state[i] = READY;
        left[i] = data.cpuBurst;
        queuedAt[i] = tick;
        woke.push(names[i]);
      }
    }
    // 3. CPU 가 비었으면 준비 줄 맨 앞
    if (running < 0) {
      let pick = -1;
      for (let i = 0; i < n; i += 1) {
        if (state[i] !== READY) continue;
        if (pick < 0 || queuedAt[i] < queuedAt[pick]) pick = i;
      }
      if (pick >= 0) {
        running = pick;
        state[pick] = RUNNING;
        picked = names[pick];
      }
    }
    // 4. 한 틱 돌기
    if (running >= 0) {
      left[running] -= 1;
      busy += 1;
    } else {
      idle += 1;
    }
    // 5. 줄 틱 · 입출력 틱
    for (let i = 0; i < n; i += 1) {
      if (state[i] === READY) readyWait += 1;
      if (state[i] === WAITING) left[i] -= 1;
    }
    for (let i = 0; i < n; i += 1) {
      if (left[i] < 0) throw new Error(`processState: 틱 ${tick} 에 ${names[i]} 의 남은 틱이 음수다`);
    }

    const readyIdx = names
      .map((_, i) => i)
      .filter((i) => state[i] === READY)
      .sort((a, b) => queuedAt[a] - queuedAt[b] || a - b);
    ticks.push({
      tick,
      blocked,
      woke,
      picked,
      running: running >= 0 ? names[running] : null,
      ready: readyIdx.map((i) => names[i]),
      cards: names.map((pid, i) => ({
        pid,
        state: state[i] === READY ? 'ready' : state[i] === RUNNING ? 'running' : 'waiting',
        left: state[i] === READY ? null : left[i],
      })),
      busy,
      readyWait,
      idle,
    });
  }
  const pct = Math.floor((busy * 100 + Math.floor(data.horizon / 2)) / data.horizon);
  return { count: n, processes: names, ticks, busy, idle, readyWait, pct };
}

type MetricName = 'cpu-busy' | 'cpu-utilization' | 'ready-wait';

export async function processStateAlgorithm(ctx: FacetContext<ProcessStateData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ProcessStateData>;
  const data = ctx.data;
  validateProcessState(data);
  let count = data.count;
  assertOnLadder(data, count);

  const shown: Record<MetricName, number | null> = {
    'cpu-busy': null,
    'cpu-utilization': null,
    'ready-wait': null,
  };
  /** 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다. */
  const setMetric = (name: MetricName, value: number): void => {
    const prev = shown[name];
    if (prev === null) ctx.metric(name, value);
    else if (prev !== value) ctx.metric(name, value - prev);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = simulateProcessState(data, count);

      // 걸음 0 — 준비 줄에 n 개가 선다
      await phase('setup');
      setMetric('cpu-busy', 0);
      setMetric('ready-wait', 0);
      setMetric('cpu-utilization', 0);
      await ctx.emit({
        type: 'round',
        payload: { count: round.count, processes: round.processes, horizon: data.horizon },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 1..horizon — 틱 하나씩
      for (const rec of round.ticks) {
        if (ctx.cancelled) return;
        let happened = false;
        if (rec.blocked !== null) {
          await phase('block');
          happened = true;
        }
        if (rec.woke.length > 0) {
          await phase('wake');
          happened = true;
        }
        if (rec.picked !== null) {
          await phase('dispatch');
          happened = true;
        }
        if (!happened) {
          if (rec.running !== null) await phase('run');
          else await phase('idle');
        }
        await ctx.emit({
          type: 'tick',
          payload: {
            tick: rec.tick,
            blocked: rec.blocked,
            woke: rec.woke,
            picked: rec.picked,
            running: rec.running,
            ready: rec.ready,
            cards: rec.cards,
            busy: rec.busy,
            readyWait: rec.readyWait,
          },
        });
        setMetric('cpu-busy', rec.busy);
        setMetric('ready-wait', rec.readyWait);
        if (!(await rctx.sleep(data.stepMs))) return;
      }

      // 끝 걸음 — 이용률이 선다
      await phase('percent');
      await ctx.emit({
        type: 'result',
        payload: { busy: round.busy, idle: round.idle, horizon: data.horizon, pct: round.pct },
      });
      setMetric('cpu-utilization', round.pct);

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'count') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        assertOnLadder(data, value);
        count = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
