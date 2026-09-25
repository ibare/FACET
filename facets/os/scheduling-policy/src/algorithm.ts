/**
 * CPU 스케줄 정책 — 같은 일감을 네 정책(FCFS · SJF · SRTF · MLFQ)으로 다시 붙인다.
 *
 * 모형: 시각은 틱(정수). CPU 하나 · 입출력 없음 · 바꾸는 비용 0. 틱 경계 t 의 차례는
 *   1 돌던 것의 남은 양이 0 이면 t 에 끝난다
 *   2 (MLFQ) 몫을 다 쓴 것이 CPU 에서 내려온다 (아직 줄에 서지 않는다)
 *   3 t 에 도착한 것들이 줄 끝에 선다 (같은 틱 도착끼리는 데이터 목록 차례)
 *   4 2 에서 내려온 것이 그 뒤에 선다 (한 층 아래 — 맨 아래 층이면 그 층 그대로)
 *   5 (SRTF) 줄에서 가장 앞선 것의 남은 양이 돌던 것보다 **엄격히** 작으면 밀어낸다. 밀려난 것은 줄 끝
 *   6 CPU 가 비었으면 줄에서 하나를 고른다
 *   7 한 틱을 돈다
 * 줄에 설 때마다 새 번호 seq 를 받는다(0 부터). 고름 = 줄에 있는 것 가운데 (열쇠, seq) 가 가장 작은 것.
 * 열쇠: FCFS = seq · SJF = 길이 · SRTF = 남은 양 · MLFQ = 층(0 이 위). **동률은 seq 가 작은 것이 이긴다.**
 *
 * 걸음 — 사건이 있는 틱 경계만 걸음이 된다. 몫 다 씀(demote) · 밀어냄(preempt) 은 제 걸음을 갖고,
 * 끝(finish) · 도착(arrive) 은 같은 경계의 다음 걸음에 접힌다. 경계의 마지막 걸음은 고름이 있으면
 * dispatch, 없으면 접힐 곳이 없는 마지막 사건의 phase 이며, 다음 사건 경계까지 CPU 가 도는 것을 품는다.
 * 모두 끝난 경계의 걸음이 판의 마지막(phase finish)이다.
 *
 * 이벤트:
 *   round  (silent)  { policy: number, workload: number, procs: { id: string; arrive: number; burst: number }[],
 *                      quanta: number[], mlfq: boolean }
 *                    판이 시작한다. 이어서 걸음마다 phase 하나와 step 하나가 온다.
 *   step             { index: number, last: boolean, from: number, to: number,
 *                      events: { kind: 'finish'|'arrive'|'demote'|'preempt'|'dispatch'; proc: number;
 *                                fromLevel: number; toLevel: number; left: number; by: number; byLeft: number }[],
 *                      run: { proc: number; from: number; to: number } | null,
 *                      queue: number[]      줄에 선 것들 — (층, seq) 차례
 *                      levels: number[]     프로세스마다 지금 층 (MLFQ 가 아니면 모두 0)
 *                      running: number      CPU 에 있는 것 (없으면 -1)
 *                      done: number[]       끝난 차례
 *                      waits: number[]      그 걸음 끝까지 기다린 틱
 *                      totalWait: number }  기다린 틱 합 (마지막 걸음이면 판의 대기 합)
 *                    events 의 fromLevel · toLevel 은 demote 에서만, left · by · byLeft 는 preempt 에서만 뜻이
 *                    있고 나머지는 -1.
 *   phase  (silent)  { phase: 'arrive' | 'demote' | 'dispatch' | 'finish' | 'preempt' }
 *
 * phase 어휘(다섯) — irs.ts 와 정확히 같다: arrive · demote · dispatch · finish · preempt.
 * 걸음 경계(sleep)마다 켜지는 phase 는 그 걸음의 phase 하나다.
 *
 * 계기 (걸음마다 그 걸음 끝까지 지난 틱의 누적값, 판마다 0 에서 다시):
 *   total-wait  모든 프로세스의 기다린 틱 합
 *   max-wait    가장 오래 기다린 프로세스의 기다린 틱
 *   switches    바뀜 — CPU 에 오른 것이 마지막으로 돈 것과 다를 때 하나 (첫 오름은 세지 않는다)
 *
 * 손잡이: policy (0..3 = initialData.policies 의 순번) · workload (0..1 = initialData.workloads 의 순번).
 * 한 판을 끝까지 재생 → 입력을 기다림 → 받은 값으로 다시 재생.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SchedProc = { id: string; arrive: number; burst: number };
export type SchedWorkload = { id: string; procs: SchedProc[] };

export type SchedulingPolicyData = {
  type: 'scheduling-policy';
  stepMs: number;
  policies: string[];
  workloads: SchedWorkload[];
  mlfqQuanta: number[];
  policy: number;
  workload: number;
};

export type SchedPhase = 'arrive' | 'demote' | 'dispatch' | 'finish' | 'preempt';

export type SchedEvent = {
  kind: SchedPhase;
  proc: number;
  fromLevel: number;
  toLevel: number;
  left: number;
  by: number;
  byLeft: number;
};

export type SchedSnapshot = {
  queue: number[];
  levels: number[];
  running: number;
  done: number[];
};

export type SchedStep = {
  phase: SchedPhase;
  from: number;
  to: number;
  events: SchedEvent[];
  run: { proc: number; from: number; to: number } | null;
  snap: SchedSnapshot;
  waits: number[];
  switches: number;
};

export type SchedResult = {
  finish: number[];
  start: number[];
  wait: number[];
  totalWait: number;
  switches: number;
  ties: number;
  steps: SchedStep[];
  /** 틱마다 돈 프로세스 */
  ranAt: number[];
};

/** 지평 — 이 안에 끝나지 않으면 셈할 수 없는 상태로 보고 던진다. */
const HORIZON = 200;

/** 정책 이름 → IR 의 정책 번호. 열쇠를 고르는 번호다. */
export function policyCode(name: string): number {
  if (name === 'fcfs') return 0;
  if (name === 'sjf') return 1;
  if (name === 'srtf') return 2;
  if (name === 'mlfq') return 3;
  throw new Error(`scheduling-policy: 모르는 정책 '${name}'`);
}

function keyOf(code: number, i: number, burst: number[], remain: number[], level: number[], seq: number[]): number {
  if (code === 0) return seq[i];
  if (code === 1) return burst[i];
  if (code === 2) return remain[i];
  if (code === 3) return level[i];
  throw new Error(`scheduling-policy: 모르는 정책 번호 ${code}`);
}

function pickFrom(
  code: number,
  queued: number[],
  burst: number[],
  remain: number[],
  level: number[],
  seq: number[],
): number {
  let best = -1;
  for (let i = 0; i < queued.length; i += 1) {
    if (queued[i] !== 1) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const ki = keyOf(code, i, burst, remain, level, seq);
    const kb = keyOf(code, best, burst, remain, level, seq);
    if (ki < kb || (ki === kb && seq[i] < seq[best])) best = i;
  }
  return best;
}

type Boundary = { tick: number; events: { ev: SchedEvent; snap: SchedSnapshot }[]; ran: number | null };

function blankEvent(kind: SchedPhase, proc: number): SchedEvent {
  return { kind, proc, fromLevel: -1, toLevel: -1, left: -1, by: -1, byLeft: -1 };
}

/**
 * 틱 모형을 끝까지 돌려 걸음으로 접는다. 정책 번호는 policyCode 의 것.
 * 셈할 수 없는 상태(지평 초과 · CPU 가 노는 틱 · 모르는 정책)는 던진다.
 */
export function simulateSchedule(code: number, procs: SchedProc[], quanta: number[]): SchedResult {
  if (code < 0 || code > 3) throw new Error(`scheduling-policy: 모르는 정책 번호 ${code}`);
  const n = procs.length;
  if (n === 0) throw new Error('scheduling-policy: 프로세스가 없다');
  if (quanta.length === 0) throw new Error('scheduling-policy: MLFQ 층의 몫이 없다');
  const arrive = procs.map((p) => p.arrive);
  const burst = procs.map((p) => p.burst);
  for (let i = 0; i < n; i += 1) {
    if (!Number.isInteger(arrive[i]) || arrive[i] < 0 || !Number.isInteger(burst[i]) || burst[i] <= 0) {
      throw new Error(`scheduling-policy: 프로세스 '${procs[i].id}' 의 도착 · 길이가 틱 수가 아니다`);
    }
  }
  const remain = burst.slice();
  const level = new Array<number>(n).fill(0);
  const queued = new Array<number>(n).fill(0);
  const seq = new Array<number>(n).fill(0);
  const finish = new Array<number>(n).fill(-1);
  const start = new Array<number>(n).fill(-1);
  const doneOrder: number[] = [];
  let nextSeq = 0;
  let running = -1;
  let used = 0;
  let done = 0;
  let tick = 0;
  let ties = 0;
  const boundaries: Boundary[] = [];
  const ranAt: number[] = [];

  const snapshot = (): SchedSnapshot => {
    const q: number[] = [];
    for (let i = 0; i < n; i += 1) if (queued[i] === 1) q.push(i);
    q.sort((a, b) => (level[a] !== level[b] ? level[a] - level[b] : seq[a] - seq[b]));
    return { queue: q, levels: level.slice(), running, done: doneOrder.slice() };
  };

  while (done < n) {
    if (tick > HORIZON) throw new Error(`scheduling-policy: ${HORIZON} 틱 안에 끝나지 않았다`);
    const b: Boundary = { tick, events: [], ran: null };
    const push = (ev: SchedEvent): void => {
      b.events.push({ ev, snap: snapshot() });
    };
    // 1 끝
    if (running >= 0 && remain[running] === 0) {
      finish[running] = tick;
      done += 1;
      doneOrder.push(running);
      const who = running;
      running = -1;
      push(blankEvent('finish', who));
    }
    // 2 몫 다 씀 (MLFQ)
    let down = -1;
    if (running >= 0 && code === 3 && used >= quanta[level[running]]) {
      down = running;
      running = -1;
    }
    // 3 도착
    for (let i = 0; i < n; i += 1) {
      if (arrive[i] !== tick) continue;
      queued[i] = 1;
      seq[i] = nextSeq;
      nextSeq += 1;
      push(blankEvent('arrive', i));
    }
    // 4 내려온 것이 그 뒤에 선다
    if (down >= 0) {
      const fromLevel = level[down];
      if (level[down] < quanta.length - 1) level[down] += 1;
      queued[down] = 1;
      seq[down] = nextSeq;
      nextSeq += 1;
      push({ ...blankEvent('demote', down), fromLevel, toLevel: level[down] });
    }
    // 5 선점 (SRTF) — 엄격히 작을 때만
    if (running >= 0 && code === 2) {
      const cand = pickFrom(code, queued, burst, remain, level, seq);
      if (cand >= 0 && remain[cand] < remain[running]) {
        const who = running;
        queued[who] = 1;
        seq[who] = nextSeq;
        nextSeq += 1;
        running = -1;
        push({ ...blankEvent('preempt', who), left: remain[who], by: cand, byLeft: remain[cand] });
      }
    }
    // 6 고름
    if (running < 0 && done < n) {
      const best = pickFrom(code, queued, burst, remain, level, seq);
      if (best >= 0) {
        const kb = keyOf(code, best, burst, remain, level, seq);
        for (let j = 0; j < n; j += 1) {
          if (j !== best && queued[j] === 1 && keyOf(code, j, burst, remain, level, seq) === kb) {
            ties += 1;
            break;
          }
        }
        queued[best] = 0;
        running = best;
        used = 0;
        if (start[best] < 0) start[best] = tick;
        push(blankEvent('dispatch', best));
      }
    }
    // 7 한 틱
    if (done === n) {
      boundaries.push(b);
      break;
    }
    if (running < 0) throw new Error(`scheduling-policy: 틱 ${tick} 에 CPU 가 논다 — 이 모형은 빈 틱을 셈하지 않는다`);
    b.ran = running;
    ranAt.push(running);
    remain[running] -= 1;
    used += 1;
    boundaries.push(b);
    tick += 1;
  }

  const wait = procs.map((_, i) => finish[i] - arrive[i] - burst[i]);
  const waitsUntil = (end: number): number[] =>
    procs.map((_, i) => {
      let w = 0;
      for (let k = 0; k < end; k += 1) {
        if (arrive[i] <= k && k < finish[i] && ranAt[k] !== i) w += 1;
      }
      return w;
    });
  const switchesUntil = (end: number): number => {
    let prev = -1;
    let sw = 0;
    for (let k = 0; k < end; k += 1) {
      if (prev >= 0 && prev !== ranAt[k]) sw += 1;
      prev = ranAt[k];
    }
    return sw;
  };

  // 걸음으로 접는다
  const steps: SchedStep[] = [];
  const byTick = new Map<number, Boundary>();
  for (const b of boundaries) if (b.events.length > 0) byTick.set(b.tick, b);
  const eventTicks = [...byTick.keys()].sort((a, c) => a - c);
  for (let e = 0; e < eventTicks.length; e += 1) {
    const b = byTick.get(eventTicks[e]);
    if (!b) throw new Error('scheduling-policy: 사건 경계를 잃었다');
    let carry: SchedEvent[] = [];
    let lastSnap: SchedSnapshot | null = null;
    for (const { ev, snap } of b.events) {
      carry.push(ev);
      lastSnap = snap;
      if (ev.kind === 'demote' || ev.kind === 'preempt') {
        steps.push({ phase: ev.kind, from: b.tick, to: b.tick, events: carry, run: null, snap, waits: [], switches: 0 });
        carry = [];
      }
    }
    if (!lastSnap) throw new Error('scheduling-policy: 사건 없는 경계');
    if (b.ran === null) {
      const lastEv = carry[carry.length - 1];
      if (!lastEv || lastEv.kind !== 'finish') throw new Error('scheduling-policy: 마지막 걸음이 끝이 아니다');
      steps.push({ phase: 'finish', from: b.tick, to: b.tick, events: carry, run: null, snap: lastSnap, waits: [], switches: 0 });
      break;
    }
    const lastEv = carry[carry.length - 1];
    if (!lastEv) throw new Error(`scheduling-policy: 틱 ${b.tick} — 제 걸음 사건으로 끝났는데 CPU 가 돈다`);
    const to = e + 1 < eventTicks.length ? eventTicks[e + 1] : ranAt.length;
    steps.push({
      phase: lastEv.kind,
      from: b.tick,
      to,
      events: carry,
      run: { proc: b.ran, from: b.tick, to },
      snap: lastSnap,
      waits: [],
      switches: 0,
    });
  }
  for (const st of steps) {
    st.waits = waitsUntil(st.to);
    st.switches = switchesUntil(st.to);
  }
  return {
    finish,
    start,
    wait,
    totalWait: wait.reduce((s, w) => s + w, 0),
    switches: switchesUntil(ranAt.length),
    ties,
    steps,
    ranAt,
  };
}

type Metrics = { totalWait: number; maxWait: number; switches: number };

function isSchedData(d: unknown): d is SchedulingPolicyData {
  if (typeof d !== 'object' || d === null) return false;
  const r = d as Record<string, unknown>;
  return (
    r.type === 'scheduling-policy' &&
    typeof r.stepMs === 'number' &&
    Array.isArray(r.policies) &&
    Array.isArray(r.workloads) &&
    Array.isArray(r.mlfqQuanta) &&
    typeof r.policy === 'number' &&
    typeof r.workload === 'number'
  );
}

export async function schedulingPolicyAlgorithm(ctx0: FacetContext<SchedulingPolicyData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<SchedulingPolicyData>;
  const data: unknown = ctx.data;
  if (!isSchedData(data)) throw new Error('scheduling-policy: initialData 의 모양이 다르다');
  const policyLadder = data.policies.map((_, i) => i);
  const workloadLadder = data.workloads.map((_, i) => i);
  for (const name of data.policies) policyCode(name);

  const shown: Metrics = { totalWait: 0, maxWait: 0, switches: 0 };
  const showMetrics = (next: Metrics): void => {
    ctx.metric('total-wait', next.totalWait - shown.totalWait);
    ctx.metric('max-wait', next.maxWait - shown.maxWait);
    ctx.metric('switches', next.switches - shown.switches);
    shown.totalWait = next.totalWait;
    shown.maxWait = next.maxWait;
    shown.switches = next.switches;
  };
  const phase = (name: SchedPhase) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let policy = data.policy;
  let workload = data.workload;

  const playRound = async (): Promise<boolean> => {
    if (!policyLadder.includes(policy)) throw new Error(`scheduling-policy: 사다리 밖의 정책 ${policy}`);
    if (!workloadLadder.includes(workload)) throw new Error(`scheduling-policy: 사다리 밖의 일감 ${workload}`);
    const code = policyCode(data.policies[policy]);
    const procs = data.workloads[workload].procs;
    const res = simulateSchedule(code, procs, data.mlfqQuanta);
    showMetrics({ totalWait: 0, maxWait: 0, switches: 0 });
    await ctx.emit({
      type: 'round',
      payload: {
        policy,
        workload,
        procs: procs.map((p) => ({ id: p.id, arrive: p.arrive, burst: p.burst })),
        quanta: data.mlfqQuanta.slice(),
        mlfq: code === 3,
      },
      silent: true,
    });
    for (let s = 0; s < res.steps.length; s += 1) {
      if (ctx.cancelled) return false;
      const st = res.steps[s];
      const last = s === res.steps.length - 1;
      switch (st.phase) {
        case 'arrive':
          await phase('arrive');
          break;
        case 'demote':
          await phase('demote');
          break;
        case 'dispatch':
          await phase('dispatch');
          break;
        case 'finish':
          await phase('finish');
          break;
        case 'preempt':
          await phase('preempt');
          break;
        default:
          throw new Error(`scheduling-policy: 모르는 phase`);
      }
      const totalWait = st.waits.reduce((a, w) => a + w, 0);
      await ctx.emit({
        type: 'step',
        payload: {
          index: s,
          last,
          from: st.from,
          to: st.to,
          events: st.events.map((ev) => ({ ...ev })),
          run: st.run ? { ...st.run } : null,
          queue: st.snap.queue.slice(),
          levels: st.snap.levels.slice(),
          running: st.snap.running,
          done: st.snap.done.slice(),
          waits: st.waits.slice(),
          totalWait,
        },
      });
      showMetrics({ totalWait, maxWait: Math.max(...st.waits), switches: st.switches });
      if (!(await ctx.sleep(data.stepMs))) return false;
    }
    return true;
  };

  try {
    while (!ctx.cancelled) {
      if (!(await playRound())) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'policy' && input.type !== 'workload') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) {
          throw new Error(`scheduling-policy: 손잡이 ${input.type} 의 입력에 payload 가 없다`);
        }
        const value = (payload as Record<string, unknown>).value;
        if (typeof value !== 'number') throw new Error(`scheduling-policy: 손잡이 ${input.type} 의 값이 수가 아니다`);
        if (input.type === 'policy') {
          if (!policyLadder.includes(value)) throw new Error(`scheduling-policy: 사다리 밖의 정책 ${value}`);
          policy = value;
        } else {
          if (!workloadLadder.includes(value)) throw new Error(`scheduling-policy: 사다리 밖의 일감 ${value}`);
          workload = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
