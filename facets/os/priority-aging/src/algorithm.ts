/**
 * priority-aging — 우선순위와 에이징 (비선점).
 *
 * CPU 하나를 프로세스 여럿이 나눠 쓴다. 줄에서 고르는 열쇠는 **실효 순위**다.
 *   실효 순위 = 순위 + (지금 틱 − 줄에 선 틱) // 간격     (간격 0 = 에이징 없음 → 순위 그대로)
 * 순위는 **수가 클수록 높다.** 고름 = 줄에 있는 것 가운데 실효 순위가 가장 큰 것.
 * **동률이면 seq 가 작은 것** — 줄에 먼저 선 것이 이긴다. 이 데이터에서는 에이징이 있는 다섯 판 모두
 * 보고서가 오르는 그 틱에 보고서의 실효 순위가 막 온 J 의 순위와 같아, 끼어듦이 전부 이 동률로 정해진다.
 * 비선점 — 한 번 오른 것은 끝까지 돈다. CPU 에 있는 것은 줄에 없으니 더 오르지 않는다.
 *
 * 틱 경계 t 의 차례 (IR 의 틱 반복 안 문 차례와 같다)
 *   1. 돌던 것의 남은 양이 0 이면 t 에 끝난다 (finish)
 *   2. t 에 도착한 것들이 데이터 목록 차례로 줄 끝에 선다 — seq 를 새로 받고 since = t (arrive)
 *   3. 줄에 있는 것 가운데 since 뒤로 간격의 배수만큼 틱이 지난 것의 실효 순위가 하나 오른다 (age — 화면의 사건,
 *      IR 에서는 effective 의 셈이다)
 *   4. CPU 가 비었으면 고른다 (dispatch)
 *   5. 한 틱을 돈다
 *
 * 걸음 — 사건이 있는 틱 경계 하나가 걸음 하나다. 이 완제품에는 CPU 를 비우는 사건(몫 다 씀 · 밀어냄)이 없으니
 * 경계 안의 사건(끝 · 도착 · 오름)은 모두 그 경계의 걸음 하나에 접힌다. 걸음의 phase 는 고름이 있으면 `dispatch`,
 * 없으면 그 경계의 마지막 사건의 phase 다. 걸음은 다음 사건 경계까지 CPU 가 도는 것을 품는다.
 * 모두 끝난 경계의 걸음이 판의 마지막이고 phase 는 `finish` 다.
 *
 * 이벤트
 *   setup     (한 번)   { procs: { id, arrive, burst, prio }[], levels: number, horizon: number }
 *                        levels = 사다리의 모든 값에서 실효 순위가 닿는 가장 큰 수 (눈금의 꼭대기)
 *                        horizon = 모두 끝나는 틱 (빈 틱이 없어 길이의 합)
 *   round     (판마다)  { interval: number, procs: ProcSnapshot[] }   — 모두 도착 전
 *   step      (걸음마다) { tick, until, phase, finished: string | null, arrived: string[],
 *                          aged: { id, from, to }[], dispatched: string | null, tie: string[],
 *                          level: number | null, procs: ProcSnapshot[], run: string | null }
 *                        until = 이 걸음이 품는 CPU 가 도는 끝 틱 (마지막 걸음은 tick 과 같다)
 *                        level = 고른 것의 실효 순위, tie = 고른 것과 실효 순위가 같았던 줄의 식별자들
 *                        run = tick..until 동안 CPU 에서 도는 것
 *                        ProcSnapshot = { id, state: 'pending'|'queued'|'running'|'done', eff, seq, wait, doneAt }
 *                        wait = 그 걸음 끝(until)까지 기다린 틱 · doneAt = 끝난 틱 (아직이면 −1)
 *   roundEnd  (판 끝)   { interval, reportStart, reportWait, highWait, overtaken }
 *   phase     silent    { phase: 'age' | 'arrive' | 'dispatch' | 'finish' }
 *
 * phase 어휘 — `age` · `arrive` · `dispatch` · `finish` (irs.ts 와 정확히 같다)
 *
 * 계기 — 판이 시작하면 0 으로 되돌리고 걸음마다 그 걸음 끝까지 지난 틱의 누적값을 보인다
 *   low-wait   색인 0 (월말 보고서) 이 기다린 틱
 *   high-wait  나머지 J 들이 기다린 틱의 합
 *   overtaken  보고서보다 먼저 CPU 에 오른 J 의 수 (그 걸음 경계까지)
 *
 * 입력 — { type: 'interval', payload: { value } }. value 는 intervalLadder 안의 수여야 한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PriorityAgingProc = { id: string; arrive: number; burst: number; prio: number };

export type PriorityAgingData = {
  type: 'priority-aging';
  stepMs: number;
  procs: PriorityAgingProc[];
  intervalLadder: number[];
  interval: number;
};

export type ProcState = 'pending' | 'queued' | 'running' | 'done';

export type ProcSnapshot = { id: string; state: ProcState; eff: number; seq: number; wait: number; doneAt: number };

export type StepPhase = 'age' | 'arrive' | 'dispatch' | 'finish';

/** 사건이 있는 틱 경계 하나 — 사건 뒤의 상태를 함께 든다. */
type Boundary = {
  tick: number;
  finished: number;
  arrived: number[];
  aged: { i: number; from: number; to: number }[];
  dispatched: number;
  level: number;
  tie: number[];
  state: ProcState[];
  eff: number[];
  seq: number[];
};

export type AgingRun = {
  interval: number;
  boundaries: Boundary[];
  /** ranAt[tick] = tick..tick+1 동안 돈 것의 색인 */
  ranAt: number[];
  start: number[];
  finish: number[];
};

export type AgingStep = {
  phase: StepPhase;
  tick: number;
  until: number;
  boundary: Boundary;
  run: number;
};

/** 지평 — 이 안에 끝나지 않으면 던진다. */
const HORIZON = 200;

/** 실효 순위. IR 의 effective 와 같은 식이다. `//` 의 두 쪽은 음수가 아니다. */
export function effective(prio: number, since: number, tick: number, interval: number): number {
  if (interval > 0) return prio + Math.floor((tick - since) / interval);
  return prio;
}

function validate(data: PriorityAgingData): void {
  if (data.type !== 'priority-aging') throw new Error(`priority-aging: 모르는 자료 ${String(data.type)}`);
  const { procs } = data;
  if (procs.length < 2) throw new Error('priority-aging: 프로세스가 둘 이상이어야 한다');
  for (const p of procs) {
    for (const v of [p.arrive, p.burst, p.prio]) {
      if (!Number.isInteger(v) || v < 0) throw new Error(`priority-aging: ${p.id} 의 수가 음수가 아닌 정수가 아니다`);
    }
    if (p.burst < 1) throw new Error(`priority-aging: ${p.id} 의 길이가 0 이다`);
  }
  const low = procs[0]!;
  for (let i = 1; i < procs.length; i += 1) {
    if (!(procs[i]!.prio > low.prio)) throw new Error('priority-aging: 색인 0 이 순위가 가장 낮은 것이어야 한다');
  }
  for (const v of data.intervalLadder) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`priority-aging: 사다리 값 ${v} 이 음수가 아닌 정수가 아니다`);
  }
  if (!data.intervalLadder.includes(data.interval)) throw new Error(`priority-aging: 기본 간격 ${data.interval} 이 사다리에 없다`);
}

/** 한 판을 틱 단위로 끝까지 돌린다. */
export function simulate(procs: PriorityAgingProc[], interval: number): AgingRun {
  const n = procs.length;
  const remain = procs.map((p) => p.burst);
  const queued = new Array<number>(n).fill(0);
  const seq = new Array<number>(n).fill(0);
  const since = new Array<number>(n).fill(0);
  const start = new Array<number>(n).fill(-1);
  const finish = new Array<number>(n).fill(-1);
  const state: ProcState[] = procs.map(() => 'pending');
  const boundaries: Boundary[] = [];
  const ranAt: number[] = [];
  let nextSeq = 0;
  let running = -1;
  let done = 0;
  let tick = 0;
  const effOf = (i: number): number => effective(procs[i]!.prio, since[i]!, tick, interval);
  while (done < n) {
    if (tick > HORIZON) throw new Error(`priority-aging: 간격 ${interval} 에서 ${HORIZON} 틱 안에 끝나지 않는다`);
    let finished = -1;
    if (running >= 0) {
      if (remain[running] === 0) {
        finish[running] = tick;
        state[running] = 'done';
        finished = running;
        done += 1;
        running = -1;
      }
    }
    const arrived: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (procs[i]!.arrive === tick) {
        queued[i] = 1;
        seq[i] = nextSeq;
        nextSeq += 1;
        since[i] = tick;
        state[i] = 'queued';
        arrived.push(i);
      }
    }
    const aged: { i: number; from: number; to: number }[] = [];
    if (interval > 0) {
      for (let i = 0; i < n; i += 1) {
        if (queued[i] === 1 && tick > since[i]! && (tick - since[i]!) % interval === 0) {
          const to = effOf(i);
          aged.push({ i, from: to - 1, to });
        }
      }
    }
    let dispatched = -1;
    let level = -1;
    const tie: number[] = [];
    if (running < 0 && done < n) {
      let best = -1;
      for (let i = 0; i < n; i += 1) {
        if (queued[i] !== 1) continue;
        if (best < 0) {
          best = i;
        } else {
          const ei = effOf(i);
          const eb = effOf(best);
          if (ei > eb || (ei === eb && seq[i]! < seq[best]!)) best = i;
        }
      }
      if (best < 0) throw new Error(`priority-aging: 틱 ${tick} 에 CPU 가 논다 — 이 데이터에는 빈 틱이 없어야 한다`);
      level = effOf(best);
      for (let i = 0; i < n; i += 1) {
        if (queued[i] === 1 && i !== best && effOf(i) === level) tie.push(i);
      }
      queued[best] = 0;
      state[best] = 'running';
      running = best;
      if (start[best]! < 0) start[best] = tick;
      dispatched = best;
    }
    if (finished >= 0 || arrived.length > 0 || aged.length > 0 || dispatched >= 0) {
      boundaries.push({
        tick,
        finished,
        arrived,
        aged,
        dispatched,
        level,
        tie,
        state: [...state],
        // 실효 순위는 줄에 있는 동안만 오른다 — 돌고 있는 것 · 끝난 것은 제 순위로 둔다 (화면은 그 값을 쓰지 않는다)
        eff: procs.map((_, i) => (queued[i] === 1 ? effOf(i) : procs[i]!.prio)),
        seq: [...seq],
      });
    }
    if (done === n) break;
    remain[running] = remain[running]! - 1;
    ranAt.push(running);
    tick += 1;
  }
  return { interval, boundaries, ranAt, start, finish };
}

/** 사건 경계를 걸음으로 — 경계 하나가 걸음 하나, 다음 사건 경계까지 CPU 가 도는 것을 품는다. */
export function toSteps(run: AgingRun): AgingStep[] {
  const steps: AgingStep[] = [];
  const bs = run.boundaries;
  for (let k = 0; k < bs.length; k += 1) {
    const b = bs[k]!;
    const last = k === bs.length - 1;
    const until = last ? b.tick : bs[k + 1]!.tick;
    let phase: StepPhase;
    if (last) {
      if (b.finished < 0) throw new Error('priority-aging: 마지막 걸음이 끝이 아니다');
      phase = 'finish';
    } else if (b.dispatched >= 0) phase = 'dispatch';
    else if (b.aged.length > 0) phase = 'age';
    else if (b.arrived.length > 0) phase = 'arrive';
    else throw new Error(`priority-aging: 틱 ${b.tick} 의 걸음이 끝으로만 이루어졌는데 판이 이어진다`);
    const run0 = last ? -1 : run.ranAt[b.tick]!;
    steps.push({ phase, tick: b.tick, until, boundary: b, run: run0 });
  }
  return steps;
}

/** 틱 0..end-1 가운데 와 있고 끝나지 않았는데 돌지 않은 틱 수. */
export function waitsUntil(procs: PriorityAgingProc[], run: AgingRun, end: number): number[] {
  return procs.map((p, i) => {
    let w = 0;
    for (let tk = 0; tk < end; tk += 1) {
      const fin = run.finish[i]!;
      if (p.arrive <= tk && (fin < 0 || tk < fin) && run.ranAt[tk] !== i) w += 1;
    }
    return w;
  });
}

/** 걸음 끝의 계기 — 사양의 걸음표가 적은 값. */
export function stepMetrics(
  procs: PriorityAgingProc[],
  run: AgingRun,
  step: AgingStep,
): { lowWait: number; highWait: number; overtaken: number } {
  const w = waitsUntil(procs, run, step.until);
  let high = 0;
  for (let i = 1; i < w.length; i += 1) high += w[i]!;
  const rs = run.start[0]!;
  let over = 0;
  for (let i = 1; i < procs.length; i += 1) {
    const s = run.start[i]!;
    if (s >= 0 && s <= step.tick && (rs < 0 || s < rs)) over += 1;
  }
  return { lowWait: w[0]!, highWait: high, overtaken: over };
}

/** 판 끝의 값 — 보고서의 시작 · 대기, J 대기 합, 앞질러 간 J. */
export function roundSummary(
  procs: PriorityAgingProc[],
  run: AgingRun,
): { reportStart: number; reportWait: number; highWait: number; overtaken: number } {
  const wait = procs.map((p, i) => run.finish[i]! - p.arrive - p.burst);
  let high = 0;
  let over = 0;
  for (let i = 1; i < procs.length; i += 1) {
    high += wait[i]!;
    if (run.start[i]! < run.start[0]!) over += 1;
  }
  return { reportStart: run.start[0]!, reportWait: wait[0]!, highWait: high, overtaken: over };
}

/** 사다리의 모든 값에서 실효 순위가 닿는 가장 큰 수. */
function topLevel(procs: PriorityAgingProc[], ladder: number[]): number {
  let top = 0;
  for (const p of procs) top = Math.max(top, p.prio);
  for (const iv of ladder) {
    for (const b of simulate(procs, iv).boundaries) {
      for (let i = 0; i < procs.length; i += 1) {
        const s = b.state[i];
        if (s === 'queued') top = Math.max(top, b.eff[i]!);
      }
      if (b.dispatched >= 0) top = Math.max(top, b.level);
    }
  }
  return top;
}

function snapshot(
  procs: PriorityAgingProc[],
  b: Boundary | null,
  waits: number[] | null,
  finish: number[] | null,
  tick: number,
): ProcSnapshot[] {
  return procs.map((p, i) => {
    const state: ProcState = b ? b.state[i]! : 'pending';
    const fin = finish ? finish[i]! : -1;
    return {
      id: p.id,
      state,
      eff: b ? b.eff[i]! : p.prio,
      seq: b ? b.seq[i]! : 0,
      wait: waits ? waits[i]! : 0,
      doneAt: state === 'done' && fin >= 0 && fin <= tick ? fin : -1,
    };
  });
}

export async function priorityAgingAlgorithm(ctx: FacetContext<PriorityAgingData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PriorityAgingData>;
  const data = ctx.data;
  validate(data);
  const procs = data.procs;
  const ids = procs.map((p) => p.id);

  const shown: Record<string, number> = { 'low-wait': 0, 'high-wait': 0, overtaken: 0 };
  let firstSend = true;
  const show = (name: string, value: number): void => {
    const cur = shown[name];
    if (cur === undefined) throw new Error(`priority-aging: 모르는 계기 ${name}`);
    const delta = value - cur;
    if (delta !== 0 || firstSend) ctx.metric(name, delta);
    shown[name] = value;
  };
  const phase = (name: StepPhase) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const light = async (p: StepPhase): Promise<void> => {
    if (p === 'age') await phase('age');
    else if (p === 'arrive') await phase('arrive');
    else if (p === 'dispatch') await phase('dispatch');
    else await phase('finish');
  };

  let horizon = 0;
  for (const p of procs) horizon += p.burst;
  await ctx.emit({
    type: 'setup',
    payload: {
      procs: procs.map((p) => ({ id: p.id, arrive: p.arrive, burst: p.burst, prio: p.prio })),
      levels: topLevel(procs, data.intervalLadder),
      horizon,
    },
  });

  let interval = data.interval;
  for (;;) {
    if (ctx.cancelled) return;
    const run = simulate(procs, interval);
    const steps = toSteps(run);
    await ctx.emit({ type: 'round', payload: { interval, procs: snapshot(procs, null, null, null, 0) } });
    show('low-wait', 0);
    show('high-wait', 0);
    show('overtaken', 0);
    firstSend = false;

    for (let k = 0; k < steps.length; k += 1) {
      if (ctx.cancelled) return;
      const st = steps[k]!;
      const b = st.boundary;
      const last = k === steps.length - 1;
      const waits = waitsUntil(procs, run, st.until);
      await ctx.emit({
        type: 'step',
        payload: {
          tick: st.tick,
          until: st.until,
          phase: st.phase,
          finished: b.finished >= 0 ? ids[b.finished]! : null,
          arrived: b.arrived.map((i) => ids[i]!),
          aged: b.aged.map((a) => ({ id: ids[a.i]!, from: a.from, to: a.to })),
          dispatched: b.dispatched >= 0 ? ids[b.dispatched]! : null,
          tie: b.tie.map((i) => ids[i]!),
          level: b.dispatched >= 0 ? b.level : null,
          procs: snapshot(procs, b, waits, run.finish, st.tick),
          run: st.run >= 0 ? ids[st.run]! : null,
        },
      });
      const m = stepMetrics(procs, run, st);
      show('low-wait', m.lowWait);
      show('high-wait', m.highWait);
      show('overtaken', m.overtaken);
      if (last) {
        await ctx.emit({ type: 'roundEnd', payload: { interval, ...roundSummary(procs, run) } });
      }
      await light(st.phase);
      if (!last) {
        if (!(await rctx.sleep(data.stepMs))) return;
      }
    }

    let chosen: number | null = null;
    while (chosen === null) {
      if (ctx.cancelled) return;
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'interval') continue;
      const payload = input.payload;
      const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
      if (typeof value !== 'number') throw new Error('priority-aging: 간격 입력에 수가 없다');
      if (!data.intervalLadder.includes(value)) throw new Error(`priority-aging: 간격 ${value} 이 사다리에 없다`);
      chosen = value;
    }
    interval = chosen;
  }
}
