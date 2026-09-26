/**
 * 서킷 브레이커 — 문턱과 열림 기다림을 손잡이로 두고, 틱마다 부름 하나가 브레이커를 지나
 * 서비스(`inventory`)로 가는 한 판을 재생한다.
 *
 * 모형 (사양 그대로)
 *   - 시각은 틱(정수). 틱 0..ticks−1, 틱마다 부름 하나 — 틱 = 부름 차례. 망의 지연은 0, 재시도 없음.
 *   - 서비스 건강: 삐끗 `blip`(그 부름은 실패하나 서비스는 산다) · 죽음 `down` 닫힌 구간 [downFrom, downTo] ·
 *     나머지 `up`. 되살아나는 틱 back = downTo + 1 은 여기서 셈한다.
 *   - 상태 `closed` · `open` · `half_open`. 처음 닫힘 · 잇단 실패 0. 한 틱의 차례:
 *       ① 열림이고 지금 − 열린 틱 ≥ 기다림이면 반열림으로
 *       ② 부름 — 열림이면 막힘(서비스에 가지 않는다).
 *          닫힘이면 서비스에 닿는다: up 이면 잇단 실패 0, blip · down 이면 +1, 문턱에 닿으면 그 부름에서 열림.
 *          반열림이면 그 부름이 시험 부름: up 이면 닫힘 · 잇단 실패 0, 아니면 다시 열림(열린 틱 = 지금).
 *   - 셈: 죽은 곳에 닿음(down 틱에 서비스까지 간 부름, 시험 부름 포함) · 삐끗에 열림(blip 틱 부름에서 열린 수) ·
 *     살아난 뒤 닫힘까지(back 부터 처음으로 부름 뒤 상태가 닫힘인 틱까지의 틱 수) · 닿은 부름 · 막은 부름.
 *   - 판 안에 다시 닫히지 않거나 모르는 건강이면 던진다 (IR 은 −1).
 *   - 동률이 걸릴 자리는 없다 — 틱마다 부름은 하나다.
 *
 * 이벤트 (algorithm → projector)
 *   - `breaker-init` (silent) — 판 머리, 걸음 0 을 갈아 끼운다.
 *       { service: string, ticks: number, health: ('up'|'blip'|'down')[], back: number,
 *         threshold: number, wait: number, maxWait: number, motionMs: number }
 *   - `phase` (silent) — { phase: string }. 걸음 이벤트 바로 앞에 하나.
 *   - `call` (걸음) — 부름 하나.
 *       { tick: number, health: 'up'|'blip'|'down', halfOpened: boolean, probe: boolean,
 *         outcome: 'answered'|'timeout'|'blocked', state: 'closed'|'open'|'half_open',
 *         fails: number, fill: number, back: number, closedAgain: boolean, recovered: boolean }
 *       fill = 부름 뒤 기다림 막대의 찬 칸 (열림일 때 지금 − 열린 틱, 아니면 0).
 *       halfOpened 이면 무대는 막대를 기다림까지 채운 뒤 fill 로 옮긴다.
 *       closedAgain = 이 부름에서 되살아난 뒤 처음으로 닫힘이 되었다.
 *
 * phase 어휘 (irs.ts 와 같다) — 걸음마다 그 부름의 결과 하나
 *   `reset` · `count` · `trip` · `block` · `probe-ok` · `probe-fail`
 *
 * 계기 (판마다 0 에서 다시 센다 — 지금 값을 들고 차이만 보낸다)
 *   `dead-hits` · `blocked-calls` · `blip-trips` · `close-lag`(닫히는 걸음에서 보낸다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Health = 'up' | 'blip' | 'down';
export type BreakerState = 'closed' | 'open' | 'half_open';
export type CallPhase = 'reset' | 'count' | 'trip' | 'block' | 'probe-ok' | 'probe-fail';

export type CircuitBreakerData = {
  type: 'circuit-breaker';
  stepMs: number;
  motionMs: number;
  service: string;
  ticks: number;
  blip: number[];
  downFrom: number;
  downTo: number;
  thresholds: number[];
  waits: number[];
  defaults: { threshold: number; wait: number };
};

export type BreakerStep = {
  tick: number;
  health: Health;
  halfOpened: boolean;
  probe: boolean;
  phase: CallPhase;
  outcome: 'answered' | 'timeout' | 'blocked';
  state: BreakerState;
  fails: number;
  fill: number;
  closedAgain: boolean;
};

export type BreakerRun = {
  steps: BreakerStep[];
  deadHits: number;
  blipTrips: number;
  closeLag: number;
  reached: number;
  blocked: number;
};

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function intList(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every(isInt)) throw new Error(`circuit-breaker: ${what} 가 정수 목록이 아니다`);
  return [...v];
}

/** `ctx.data` 좁히개 — 모양이 어긋나면 무엇이 없는지 담아 던진다. */
export function readCircuitBreakerData(raw: unknown): CircuitBreakerData {
  if (typeof raw !== 'object' || raw === null) throw new Error('circuit-breaker: 데이터가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'circuit-breaker') throw new Error(`circuit-breaker: type 이 다르다 (${String(r.type)})`);
  for (const k of ['stepMs', 'motionMs', 'ticks', 'downFrom', 'downTo'] as const) {
    if (!isInt(r[k])) throw new Error(`circuit-breaker: ${k} 가 정수가 아니다`);
  }
  if (typeof r.service !== 'string' || r.service === '') throw new Error('circuit-breaker: service 가 없다');
  const d = r.defaults;
  if (typeof d !== 'object' || d === null) throw new Error('circuit-breaker: defaults 가 없다');
  const dd = d as Record<string, unknown>;
  if (!isInt(dd.threshold) || !isInt(dd.wait)) throw new Error('circuit-breaker: defaults 의 threshold · wait 가 정수가 아니다');
  const data: CircuitBreakerData = {
    type: 'circuit-breaker',
    stepMs: r.stepMs as number,
    motionMs: r.motionMs as number,
    service: r.service,
    ticks: r.ticks as number,
    blip: intList(r.blip, 'blip'),
    downFrom: r.downFrom as number,
    downTo: r.downTo as number,
    thresholds: intList(r.thresholds, 'thresholds'),
    waits: intList(r.waits, 'waits'),
    defaults: { threshold: dd.threshold, wait: dd.wait },
  };
  if (data.ticks <= 0) throw new Error('circuit-breaker: ticks 가 0 이하다');
  if (!(data.downFrom >= 0 && data.downFrom <= data.downTo && data.downTo < data.ticks - 1)) {
    throw new Error('circuit-breaker: 죽음 구간이 판 안에 있지 않거나 되살아날 틱이 없다');
  }
  if (!data.blip.every((b) => b >= 0 && b < data.ticks && (b < data.downFrom || b > data.downTo))) {
    throw new Error('circuit-breaker: 삐끗 틱이 판 밖이거나 죽음 구간과 겹친다');
  }
  if (data.thresholds.length === 0 || data.thresholds.some((x) => x < 1)) throw new Error('circuit-breaker: 문턱 사다리가 비었거나 1 미만이 있다');
  if (data.waits.length === 0 || data.waits.some((x) => x < 1)) throw new Error('circuit-breaker: 기다림 사다리가 비었거나 1 미만이 있다');
  if (!data.thresholds.includes(data.defaults.threshold)) throw new Error('circuit-breaker: 기본 문턱이 사다리에 없다');
  if (!data.waits.includes(data.defaults.wait)) throw new Error('circuit-breaker: 기본 기다림이 사다리에 없다');
  return data;
}

/** 구간으로 적은 건강을 틱마다의 열로 편다. */
export function healthColumn(data: CircuitBreakerData): Health[] {
  const out: Health[] = [];
  for (let tick = 0; tick < data.ticks; tick += 1) {
    if (tick >= data.downFrom && tick <= data.downTo) out.push('down');
    else if (data.blip.includes(tick)) out.push('blip');
    else out.push('up');
  }
  return out;
}

/** 되살아나는 틱 — 죽음의 닫힌 구간 끝 다음. */
export function backTick(data: CircuitBreakerData): number {
  return data.downTo + 1;
}

/**
 * 한 판을 끝까지 셈한다 (순수). 판 안에 다시 닫히지 않거나 모르는 건강이면 던진다.
 * IR `runBreaker` 와 한 줄씩 같다.
 */
export function simulateBreaker(health: readonly string[], back: number, threshold: number, wait: number): BreakerRun {
  let state: BreakerState = 'closed';
  let fails = 0;
  let opened = 0;
  let deadHits = 0;
  let blipTrips = 0;
  let reached = 0;
  let blocked = 0;
  let lag = -1;
  const steps: BreakerStep[] = [];
  for (let tick = 0; tick < health.length; tick += 1) {
    const h = health[tick];
    if (h !== 'up' && h !== 'blip' && h !== 'down') throw new Error(`circuit-breaker: 틱 ${tick} 의 건강을 모른다 (${String(h)})`);
    let halfOpened = false;
    if (state === 'open' && tick - opened >= wait) {
      state = 'half_open';
      halfOpened = true;
    }
    let phase: CallPhase;
    let outcome: BreakerStep['outcome'];
    const probe = state === 'half_open';
    if (state === 'open') {
      blocked += 1;
      phase = 'block';
      outcome = 'blocked';
    } else {
      reached += 1;
      if (h === 'down') deadHits += 1;
      outcome = h === 'up' ? 'answered' : 'timeout';
      if (state === 'half_open') {
        if (h === 'up') {
          state = 'closed';
          fails = 0;
          phase = 'probe-ok';
        } else {
          state = 'open';
          opened = tick;
          phase = 'probe-fail';
        }
      } else if (h === 'up') {
        fails = 0;
        phase = 'reset';
      } else {
        fails += 1;
        if (fails >= threshold) {
          state = 'open';
          opened = tick;
          phase = 'trip';
          if (h === 'blip') blipTrips += 1;
        } else {
          phase = 'count';
        }
      }
    }
    let closedAgain = false;
    if (lag === -1 && tick >= back && state === 'closed') {
      lag = tick - back;
      closedAgain = true;
    }
    steps.push({
      tick,
      health: h,
      halfOpened,
      probe,
      phase,
      outcome,
      state,
      fails,
      fill: state === 'open' ? tick - opened : 0,
      closedAgain,
    });
  }
  if (lag === -1) throw new Error('circuit-breaker: 판 안에 다시 닫히지 않았다');
  return { steps, deadHits, blipTrips, closeLag: lag, reached, blocked };
}

export async function circuitBreakerAlgorithm(ctx: FacetContext<CircuitBreakerData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CircuitBreakerData>;
  const data = readCircuitBreakerData(ctx.data);
  const health = healthColumn(data);
  const back = backTick(data);
  const maxWait = Math.max(...data.waits);
  let threshold = data.defaults.threshold;
  let wait = data.defaults.wait;

  const shown = new Map<string, number>();
  const show = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    ctx.metric(name, prev === undefined ? value : value - prev);
  };
  const phase = (name: CallPhase): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판을 재생한다. 취소되면 false. */
  const play = async (): Promise<boolean> => {
    const run = simulateBreaker(health, back, threshold, wait);
    // 사양의 불변식 — 이 데이터의 스무 조합 모두에서 선다 (다른 건강 열에서는 서지 않을 수 있어 순수 셈에는 두지 않는다)
    if (run.closeLag > wait - 1) throw new Error(`circuit-breaker: 닫힘까지 ${run.closeLag} 가 기다림 − 1 (${wait - 1}) 을 넘는다`);
    await ctx.emit({
      type: 'breaker-init',
      payload: { service: data.service, ticks: data.ticks, health, back, threshold, wait, maxWait, motionMs: data.motionMs },
      silent: true,
    });
    show('dead-hits', 0);
    show('blocked-calls', 0);
    show('blip-trips', 0);
    show('close-lag', 0);
    let deadHits = 0;
    let blocked = 0;
    let blipTrips = 0;
    for (const step of run.steps) {
      if (ctx.cancelled) return false;
      // 걸음 경계 — 앞 걸음의 운동이 끝난 뒤 stepMs 를 쉰다 (걸음 0 도 같은 벽시계)
      if (!(await rctx.sleep(data.stepMs + data.motionMs))) return false;
      await phase(step.phase);
      await ctx.emit({
        type: 'call',
        payload: {
          tick: step.tick,
          health: step.health,
          halfOpened: step.halfOpened,
          probe: step.probe,
          outcome: step.outcome,
          state: step.state,
          fails: step.fails,
          fill: step.fill,
          back,
          closedAgain: step.closedAgain,
          recovered: step.tick >= back,
        },
      });
      if (step.health === 'down' && step.outcome !== 'blocked') {
        deadHits += 1;
        show('dead-hits', deadHits);
      }
      if (step.outcome === 'blocked') {
        blocked += 1;
        show('blocked-calls', blocked);
      }
      if (step.phase === 'trip' && step.health === 'blip') {
        blipTrips += 1;
        show('blip-trips', blipTrips);
      }
      if (step.closedAgain) show('close-lag', step.tick - back);
    }
    if (deadHits !== run.deadHits || blocked !== run.blocked || blipTrips !== run.blipTrips) {
      throw new Error('circuit-breaker: 재생한 수가 셈과 다르다');
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await play())) return;
      // 손잡이 입력을 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (input.type === 'threshold') {
          if (typeof value !== 'number' || !data.thresholds.includes(value)) continue;
          threshold = value;
          break;
        }
        if (input.type === 'wait') {
          if (typeof value !== 'number' || !data.waits.includes(value)) continue;
          wait = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
