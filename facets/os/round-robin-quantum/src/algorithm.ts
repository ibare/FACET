/**
 * round-robin-quantum 알고리즘 — 라운드 로빈의 몫과 바꾸는 데 드는 틱.
 *
 * 프로세스 몇이 CPU 하나를 줄(FIFO)로 나눠 쓴다. 오른 것은 몫(quantum)만큼 돌고, 몫을 다 썼는데 남은 양이
 * 있으면 줄 끝으로 돌아간다. CPU 에 오른 것이 마지막으로 돈 것과 다르면 "바뀜" 이고, 바뀜마다 cost 틱 동안
 * CPU 는 바꾸는 일만 한다 (남은 양 · 쓴 몫이 줄지 않는다).
 *
 * ── 틱 경계 t 의 차례 (irs.ts 의 틱 반복 안 문 차례와 같다) ─────────────────────
 *   1 돌던 것의 남은 양이 0 이면 t 에 끝난다
 *   2 몫을 다 썼는데 남은 양이 있으면 CPU 에서 내려온다 (아직 줄에 서지 않는다)
 *   3 t 에 도착한 것들이 줄 끝에 선다 (같은 틱 도착끼리는 데이터 목록 차례)
 *   4 2 에서 내려온 것이 그 뒤에 선다
 *   6 CPU 가 비었으면 줄에서 seq 가 가장 작은 것을 고른다 (선점 없음)
 *   7 한 틱을 돈다 — 바꾸는 중이면 바꾸는 일만
 * 동률 규칙: 고름의 열쇠는 seq(줄에 선 차례 번호) 하나이고 seq 는 설 때마다 새로 받으므로 동률이 없다.
 *   같은 틱 도착의 차례는 데이터 목록 차례로 seq 를 받으며 정해진다 — 이 데이터에서는 t0 의 a · b 에서 걸린다.
 *
 * ── 걸음 (한 판) ────────────────────────────────────────────────────────────────
 * 사건이 있는 틱 경계만 걸음이 된다. 몫 다 씀(requeue)은 제 걸음을 갖고, 끝(finish) · 도착(arrive)은 같은
 * 경계의 다음 걸음에 접힌다. 경계의 마지막 걸음은 고름이 있으면 dispatch (바뀜이면 switch), 없으면 접힐 곳이
 * 없는 마지막 사건의 phase 이고, 다음 사건 경계까지 CPU 가 도는 것을 품는다. 모두 끝난 경계의 걸음이 판의
 * 마지막이다 (phase finish).
 *
 * ── 이벤트 ──────────────────────────────────────────────────────────────────────
 *   'phase'  silent  { phase: RrPhase }                       코드 패널 줄 — 걸음 경계마다 하나
 *   'round'          { quantum, cost, axisEnd, procs: { id, arrive, burst }[] }
 *                    판 시작. axisEnd = 사다리 모든 조합 가운데 가장 늦은 끝 틱 (시간축이 판마다 같다)
 *   'step'           { index, phase, from, to,
 *                      notes: { kind: 'finish' | 'arrive' | 'requeue' | 'dispatch' | 'switch', procs: number[], left? }[],
 *                      ticks: { tick, proc, kind: 'run' | 'switch', slice }[],
 *                      firstRuns: { proc, arrive, tick }[] }
 *                    걸음 하나. ticks 는 [from, to) 동안 CPU 가 한 일, slice 는 판 안의 오름 번호 (0 부터)
 *   'done'           { quantum, cost, endTick, switches, switchTicks, responseTotal, responseAvg100, n }
 *                    판 끝. responseAvg100 = 평균 첫 응답 × 100 을 반올림한 정수 — (합 × 200 + n) // (2n)
 *
 * ── phase 어휘 (irs.ts 와 정확히 같다) ─────────────────────────────────────────
 *   arrive · dispatch · finish · requeue · switch
 *
 * ── 계기 (판마다 0 에서 다시, 걸음 끝까지 지난 틱의 누적값) ─────────────────────
 *   switches        바뀜 — 오른 것이 마지막으로 돈 것과 다를 때 하나 (첫 오름은 세지 않는다)
 *   switch-ticks    바꾸는 데 쓴 틱
 *   response-total  처음 돈 것들의 (처음 돈 틱 − 도착) 합 — 처음 돈 틱이 걸음 끝보다 앞인 것만
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RrProc = { id: string; arrive: number; burst: number };

export type RoundRobinQuantumData = {
  type: 'round-robin-quantum';
  stepMs: number;
  procs: RrProc[];
  quantumLadder: number[];
  costLadder: number[];
  quantum: number;
  cost: number;
};

export type RrPhase = 'arrive' | 'dispatch' | 'finish' | 'requeue' | 'switch';

/** 틱 t → t+1 동안 CPU 가 한 일. */
export type RrAct = { proc: number; kind: 'run' | 'switch'; slice: number };

export type RrNote = { kind: RrPhase; procs: number[]; left?: number };

/** 틱 경계 t 의 기록 — 그 경계의 사건(IR 문 차례)과 t → t+1 의 일 (모두 끝났으면 null). */
export type RrBoundary = { notes: RrNote[]; act: RrAct | null; swapped: boolean };

export type RrRun = {
  log: RrBoundary[];
  start: number[];
  finish: number[];
  switches: number;
  switchTicks: number;
  endTick: number;
};

export type RrStep = { phase: RrPhase; from: number; to: number; notes: RrNote[] };

/** 지평 — 이 틱까지 끝나지 않으면 셈할 수 없는 상태로 보고 던진다. */
const HORIZON = 200;

/** 틱 단위로 실제로 돌린다. irs.ts 의 roundRobin 과 같은 차례 · 같은 답. */
export function simulateRoundRobin(procs: readonly RrProc[], quantum: number, cost: number): RrRun {
  if (!Number.isInteger(quantum) || quantum < 1) throw new Error(`round-robin-quantum: 몫이 틀렸다 — ${quantum}`);
  if (!Number.isInteger(cost) || cost < 0) throw new Error(`round-robin-quantum: 비용이 틀렸다 — ${cost}`);
  const n = procs.length;
  if (n === 0) throw new Error('round-robin-quantum: 프로세스가 없다');
  for (const p of procs) {
    if (!Number.isInteger(p.arrive) || p.arrive < 0 || !Number.isInteger(p.burst) || p.burst < 1) {
      throw new Error(`round-robin-quantum: 프로세스 ${p.id} 의 도착 · 길이가 틀렸다`);
    }
  }
  const remain = procs.map((p) => p.burst);
  const queued = procs.map(() => 0);
  const seq = procs.map(() => 0);
  const start = procs.map(() => -1);
  const finish = procs.map(() => -1);
  const log: RrBoundary[] = [];
  let nextSeq = 0;
  let running = -1;
  let used = 0;
  let lastRan = -1;
  let switchLeft = 0;
  let switches = 0;
  let switchTicks = 0;
  let slice = -1;
  let done = 0;
  let tick = 0;
  while (done < n) {
    if (tick > HORIZON) throw new Error(`round-robin-quantum: 지평 ${HORIZON} 틱 안에 끝나지 않는다`);
    const notes: RrNote[] = [];
    let swapped = false;
    // 1 끝
    if (running >= 0 && remain[running] === 0) {
      finish[running] = tick;
      done += 1;
      notes.push({ kind: 'finish', procs: [running] });
      running = -1;
    }
    // 2 몫 다 씀 — 내려오되 아직 줄에 서지 않는다
    let down = -1;
    if (running >= 0 && used >= quantum) {
      down = running;
      running = -1;
    }
    // 3 도착
    const arrived: number[] = [];
    for (let i = 0; i < n; i += 1) {
      if (procs[i].arrive === tick) {
        queued[i] = 1;
        seq[i] = nextSeq;
        nextSeq += 1;
        arrived.push(i);
      }
    }
    if (arrived.length > 0) notes.push({ kind: 'arrive', procs: arrived });
    // 4 내려온 것이 줄 끝에
    if (down >= 0) {
      queued[down] = 1;
      seq[down] = nextSeq;
      nextSeq += 1;
      notes.push({ kind: 'requeue', procs: [down], left: remain[down] });
    }
    // 6 고름 — 줄에서 seq 가 가장 작은 것
    if (running < 0 && done < n) {
      let best = -1;
      for (let i = 0; i < n; i += 1) {
        if (queued[i] === 1 && (best < 0 || seq[i] < seq[best])) best = i;
      }
      if (best >= 0) {
        queued[best] = 0;
        running = best;
        used = 0;
        slice += 1;
        swapped = lastRan >= 0 && lastRan !== best;
        if (swapped) {
          switches += 1;
          switchLeft = cost;
        }
        lastRan = best;
        notes.push({ kind: swapped ? 'switch' : 'dispatch', procs: [best] });
      }
    }
    if (done === n) {
      log.push({ notes, act: null, swapped });
      break;
    }
    // 7 한 틱 — 바꾸는 중이면 그 일만
    if (running < 0) throw new Error(`round-robin-quantum: t${tick} 에 CPU 가 논다 — 이 모형은 빈 틱을 셈하지 않는다`);
    let act: RrAct;
    if (switchLeft > 0) {
      switchLeft -= 1;
      switchTicks += 1;
      act = { proc: running, kind: 'switch', slice };
    } else {
      if (start[running] < 0) start[running] = tick;
      remain[running] -= 1;
      used += 1;
      act = { proc: running, kind: 'run', slice };
    }
    log.push({ notes, act, swapped });
    tick += 1;
  }
  return { log, start, finish, switches, switchTicks, endTick: Math.max(...finish) };
}

/** 틱 기록 → 걸음. 몫 다 씀은 제 걸음, 끝 · 도착은 다음 걸음에 접힌다. */
export function toSteps(run: RrRun): RrStep[] {
  const steps: RrStep[] = [];
  const log = run.log;
  let tick = 0;
  while (tick < log.length) {
    const b = log[tick];
    if (b.notes.length === 0) throw new Error(`round-robin-quantum: t${tick} — 사건 없는 경계에서 걸음이 시작됐다`);
    let carry: RrNote[] = [];
    for (const note of b.notes) {
      carry.push(note);
      if (note.kind === 'requeue') {
        steps.push({ phase: 'requeue', from: tick, to: tick, notes: carry });
        carry = [];
      }
    }
    let upto = tick + 1;
    while (upto < log.length && log[upto].notes.length === 0) upto += 1;
    const last = carry.length > 0 ? carry[carry.length - 1].kind : null;
    if (b.act === null) {
      if (last !== 'finish') throw new Error('round-robin-quantum: 판의 마지막 걸음이 끝이 아니다');
      steps.push({ phase: 'finish', from: tick, to: tick, notes: carry });
      break;
    }
    if (last === null) throw new Error(`round-robin-quantum: t${tick} — 고름 없이 CPU 가 돈다`);
    steps.push({ phase: last, from: tick, to: upto, notes: carry });
    tick = upto;
  }
  return steps;
}

/** 걸음 끝(틱 end)까지 지난 틱의 누적 계기. */
export function metricsUntil(run: RrRun, procs: readonly RrProc[], end: number) {
  let switches = 0;
  let switchTicks = 0;
  for (let tick = 0; tick < end; tick += 1) {
    const b = run.log[tick];
    if (b.swapped) switches += 1;
    if (b.act !== null && b.act.kind === 'switch') switchTicks += 1;
  }
  let responseTotal = 0;
  for (let i = 0; i < procs.length; i += 1) {
    if (run.start[i] >= 0 && run.start[i] < end) responseTotal += run.start[i] - procs[i].arrive;
  }
  return { switches, switchTicks, responseTotal };
}

/** 평균 × 100 을 반올림한 정수 — (합 × 200 + n) // (2n). 합 · n 은 음수가 아니다. */
export function avg100(sum: number, n: number): number {
  return Math.floor((sum * 200 + n) / (2 * n));
}

function checkData(d: RoundRobinQuantumData): void {
  if (d.type !== 'round-robin-quantum') throw new Error(`round-robin-quantum: 모르는 데이터 모양 — ${String(d.type)}`);
  if (!Array.isArray(d.procs) || d.procs.length === 0) throw new Error('round-robin-quantum: procs 가 없다');
  if (!d.quantumLadder.includes(d.quantum)) throw new Error(`round-robin-quantum: 몫 ${d.quantum} 이 사다리 밖이다`);
  if (!d.costLadder.includes(d.cost)) throw new Error(`round-robin-quantum: 비용 ${d.cost} 이 사다리 밖이다`);
}

export async function roundRobinQuantumAlgorithm(base: FacetContext<RoundRobinQuantumData>): Promise<void> {
  const ctx = base as ReactiveContext<RoundRobinQuantumData>;
  const data = ctx.data;
  checkData(data);
  const procs = data.procs;
  const stepMs = data.stepMs;

  // 시간축 — 사다리 모든 조합 가운데 가장 늦은 끝. 판마다 같아서 토막이 같은 눈금 위에서 옮겨 간다.
  let axisEnd = 0;
  for (const q of data.quantumLadder) {
    for (const c of data.costLadder) axisEnd = Math.max(axisEnd, simulateRoundRobin(procs, q, c).endTick);
  }

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };
  const phase = (name: RrPhase) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let quantum = data.quantum;
  let cost = data.cost;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = simulateRoundRobin(procs, quantum, cost);
      const steps = toSteps(run);

      setMetric('switches', 0);
      setMetric('switch-ticks', 0);
      setMetric('response-total', 0);
      await ctx.emit({
        type: 'round',
        payload: { quantum, cost, axisEnd, procs: procs.map((p) => ({ id: p.id, arrive: p.arrive, burst: p.burst })) },
      });

      for (let k = 0; k < steps.length; k += 1) {
        if (ctx.cancelled) return;
        const st = steps[k];
        switch (st.phase) {
          case 'arrive': await phase('arrive'); break;
          case 'dispatch': await phase('dispatch'); break;
          case 'finish': await phase('finish'); break;
          case 'requeue': await phase('requeue'); break;
          case 'switch': await phase('switch'); break;
        }
        const ticks: { tick: number; proc: number; kind: 'run' | 'switch'; slice: number }[] = [];
        const firstRuns: { proc: number; arrive: number; tick: number }[] = [];
        for (let tick = st.from; tick < st.to; tick += 1) {
          const act = run.log[tick].act;
          if (act === null) throw new Error(`round-robin-quantum: t${tick} 의 일이 없다`);
          ticks.push({ tick, proc: act.proc, kind: act.kind, slice: act.slice });
          if (act.kind === 'run' && run.start[act.proc] === tick) {
            firstRuns.push({ proc: act.proc, arrive: procs[act.proc].arrive, tick });
          }
        }
        await ctx.emit({
          type: 'step',
          payload: { index: k + 1, phase: st.phase, from: st.from, to: st.to, notes: st.notes, ticks, firstRuns },
        });
        const m = metricsUntil(run, procs, st.to);
        setMetric('switches', m.switches);
        setMetric('switch-ticks', m.switchTicks);
        setMetric('response-total', m.responseTotal);
        if (!(await ctx.sleep(stepMs))) return;
      }

      const responseTotal = run.start.reduce((s, v, i) => s + (v - procs[i].arrive), 0);
      await ctx.emit({
        type: 'done',
        payload: {
          quantum,
          cost,
          endTick: run.endTick,
          switches: run.switches,
          switchTicks: run.switchTicks,
          responseTotal,
          responseAvg100: avg100(responseTotal, procs.length),
          n: procs.length,
        },
      });

      // 손잡이 입력을 기다린다 — 받은 값으로 다시 돈다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'quantum' && input.type !== 'cost') continue;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null && 'value' in payload
            ? (payload as { value: unknown }).value
            : undefined;
        if (typeof value !== 'number') throw new Error(`round-robin-quantum: ${input.type} 입력에 수가 없다`);
        // 돌린 손잡이는 value 로, 다른 손잡이의 지금 값은 payload 의 이름 칸(글)으로 온다
        const other = (name: 'quantum' | 'cost'): number | null => {
          const raw = (payload as Record<string, unknown>)[name];
          if (raw === undefined) return null;
          if (typeof raw !== 'string' || raw.trim() === '' || !Number.isFinite(Number(raw))) {
            throw new Error(`round-robin-quantum: ${name} 의 지금 값이 수가 아니다 — ${String(raw)}`);
          }
          return Number(raw);
        };
        const nextQuantum = input.type === 'quantum' ? value : (other('quantum') ?? quantum);
        const nextCost = input.type === 'cost' ? value : (other('cost') ?? cost);
        if (!data.quantumLadder.includes(nextQuantum)) throw new Error(`round-robin-quantum: 몫 ${nextQuantum} 이 사다리 밖이다`);
        if (!data.costLadder.includes(nextCost)) throw new Error(`round-robin-quantum: 비용 ${nextCost} 이 사다리 밖이다`);
        quantum = nextQuantum;
        cost = nextCost;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
