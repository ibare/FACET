/**
 * 배압(backpressure) — 감당보다 많이 올 때 받는 쪽이 할 수 있는 세 가지.
 *
 * 한 서버가 틱마다 24 조각의 힘을 든 요청들에게 고르게 나눠 쓴다 (요청 하나의 일 = 12 조각).
 * 보내는 쪽은 틱마다 `rate` 개를 만든다. 넘칠 때의 방식은 셋이다.
 *   0 다 받음 — 모두 들인다. 든 수가 늘수록 하나의 몫이 준다.
 *   1 버림   — 든 수가 한도면 문 앞에서 503 으로 돌려보낸다.
 *   2 배압   — 받는 쪽이 한도까지만 받고, 나머지는 보내는 쪽 곁의 줄에 머문다. 보내는 쪽은 기한을
 *              헤아려, 지금 보내도 가득 찬 받는 쪽에서 `limit × workUnits // capacity` 틱이 걸려
 *              기한을 넘길 줄 머리를 제 곁에서 버린다.
 *
 * 한 틱 안의 차례: ① 일(몫을 나눠 더하고 끝난 것이 떠난다) → ② 판정(끝난 것의 제때 · 헛일,
 * 배압의 보내는 쪽 버림) → ③ 도착 → ④ 받는 쪽에 들임.
 * 몫: 든 수 n 에게 `capacity // n` 조각씩, 나머지 `capacity % n` 조각은 **먼저 든 것부터** 하나씩 더
 * (동률을 가르는 규칙이 이것 하나다 — 다 받음에서 든 수가 24 를 나누지 못할 때만 걸린다).
 * 받은 몫은 남은 일까지만 쓴다. 누적이 workUnits 가 된 틱이 끝난 틱이며, `끝난 틱 − 태어난 틱 ≤ deadline`
 * 이면 제때, 아니면 헛일. 받는 쪽은 손님이 떠난 줄 모르고 끝까지 일한다 (취소 없음).
 *
 * ── 이벤트 (payload 스키마 · silent 여부)
 *   init   silent  { overflow, rate, ticks, workUnits, capacity, deadline, limit, rejectCode,
 *                    peakHeld, peakQueue, motionMs }
 *                  peakHeld · peakQueue 는 사다리 전체(방식 × 빠르기)에서 셈한 가장 큰 든 수 · 가장 긴 보내는 쪽 줄
 *   phase  silent  { phase }
 *   work           { tick, heldBefore, share, extra,
 *                    jobs: { id, born, done, gain, overdue }[]   — 일 뒤에도 남은 것, 든 차례
 *                    finished: { id, born, onTime }[]           — 이 틱에 끝나 떠난 것, 든 차례
 *                    onTime, late, made, onTimePct }            — 그 걸음까지의 누계
 *   arrive         { tick, created: { id, born }[],
 *                    admitted: { id, born, overdue }[]         — 이 틱에 받는 쪽에 든 것, 든 차례
 *                    rejected: number[]  (id)                   — 문 앞에서 503
 *                    dropped: number[]   (id)                   — 보내는 쪽 곁에서 버림
 *                    queue: number[]     (id, 머리부터)          — 걸음 뒤의 보내는 쪽 줄
 *                    held, rejectedTotal, droppedTotal, made, onTimePct }
 *   overdue = 아직 끝나지 않았고 다음 틱에 끝나도 기한을 넘기는가 (`tick + 1 − born > deadline`).
 *   onTimePct = 반올림 (onTime·100 + made//2) // made, made = 그 걸음까지 만든 수 (0 이면 0).
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   share-work  일 걸음 — 든 것이 있을 때만. 든 수 0 인 일 걸음(틱 0)은 IR 의 `if (held > 0)` 이 건너뛰므로
 *               phase 를 보내지 않고 projector 가 코드 줄 강조를 끈다
 *   accept      도착 걸음 — 다 받음 · 503 없는 버림 · 줄이 비는 배압
 *   reject      도착 걸음 — 버림에서 이 틱에 503 이 있을 때
 *   hold-back   도착 걸음 — 배압에서 보낸 뒤 줄이 남았을 때
 *   drop-stale  도착 걸음 — 배압에서 이 틱에 보내는 쪽 버림이 있을 때
 *
 * ── 계기 (차이만 보내는 누적 채널 · 판 머리 0)
 *   on-time · late-done · rejected · sender-dropped
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BackpressureData = {
  type: 'backpressure';
  stepMs: number;
  motionMs: number;
  ticks: number;
  workUnits: number;
  capacity: number;
  deadline: number;
  limit: number;
  overflows: number[];
  rates: number[];
  overflowDefault: number;
  rateDefault: number;
  rejectCode: string;
};

export type JobView = { id: number; born: number; done: number; gain: number; overdue: boolean };
export type FinishedView = { id: number; born: number; onTime: boolean };
export type AdmittedView = { id: number; born: number; overdue: boolean };

export type WorkStep = {
  kind: 'work';
  phase: 'share-work';
  tick: number;
  heldBefore: number;
  share: number;
  extra: number;
  jobs: JobView[];
  finished: FinishedView[];
  onTime: number;
  late: number;
  made: number;
  onTimePct: number;
};

export type ArriveStep = {
  kind: 'arrive';
  phase: 'accept' | 'reject' | 'hold-back' | 'drop-stale';
  tick: number;
  created: { id: number; born: number }[];
  admitted: AdmittedView[];
  rejected: number[];
  dropped: number[];
  queue: number[];
  held: number;
  onTime: number;
  late: number;
  rejectedTotal: number;
  droppedTotal: number;
  made: number;
  onTimePct: number;
};

export type BackpressureRun = {
  steps: (WorkStep | ArriveStep)[];
  onTime: number;
  late: number;
  rejected: number;
  dropped: number;
  made: number;
  peakHeld: number;
  peakQueue: number;
  endHeld: number;
  endQueue: number;
};

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** `ctx.data` 좁히개 — 모양이 어긋나면 무엇이 없는지 담아 던진다. */
export function readBackpressureData(raw: unknown): BackpressureData {
  if (typeof raw !== 'object' || raw === null) throw new Error('backpressure: data 가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'backpressure') throw new Error(`backpressure: data.type 이 'backpressure' 가 아니다 (${String(r.type)})`);
  const ints = ['stepMs', 'motionMs', 'ticks', 'workUnits', 'capacity', 'deadline', 'limit', 'overflowDefault', 'rateDefault'] as const;
  for (const k of ints) {
    const v = r[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`backpressure: data.${k} 가 음이 아닌 정수가 아니다`);
  }
  if ((r.workUnits as number) <= 0 || (r.capacity as number) <= 0 || (r.ticks as number) <= 0 || (r.limit as number) <= 0) {
    throw new Error('backpressure: workUnits · capacity · ticks · limit 는 0 보다 커야 한다');
  }
  if (!isIntArray(r.overflows) || r.overflows.length === 0) throw new Error('backpressure: data.overflows 가 정수 배열이 아니다');
  if (!isIntArray(r.rates) || r.rates.length === 0 || r.rates.some((x) => x <= 0)) {
    throw new Error('backpressure: data.rates 가 양의 정수 배열이 아니다');
  }
  for (const m of r.overflows) {
    if (m !== 0 && m !== 1 && m !== 2) throw new Error(`backpressure: 모르는 넘칠 때 방식 ${m}`);
  }
  if (!r.overflows.includes(r.overflowDefault as number)) throw new Error('backpressure: overflowDefault 가 사다리에 없다');
  if (!r.rates.includes(r.rateDefault as number)) throw new Error('backpressure: rateDefault 가 사다리에 없다');
  if (typeof r.rejectCode !== 'string' || r.rejectCode === '') throw new Error('backpressure: data.rejectCode 가 없다');
  return {
    type: 'backpressure',
    stepMs: r.stepMs as number,
    motionMs: r.motionMs as number,
    ticks: r.ticks as number,
    workUnits: r.workUnits as number,
    capacity: r.capacity as number,
    deadline: r.deadline as number,
    limit: r.limit as number,
    overflows: [...r.overflows],
    rates: [...r.rates],
    overflowDefault: r.overflowDefault as number,
    rateDefault: r.rateDefault as number,
    rejectCode: r.rejectCode,
  };
}

/** 반올림 백분율 — 알고리즘과 IR 이 같은 식을 쓴다. */
export function roundPct(x: number, n: number): number {
  if (n === 0) return 0;
  return Math.floor((x * 100 + Math.floor(n / 2)) / n);
}

type Held = { id: number; born: number; done: number };

/** 한 판을 끝까지 셈한다 (순수 함수). 모르는 방식은 던진다. */
export function simulateBackpressure(data: BackpressureData, overflow: number, rate: number): BackpressureRun {
  if (overflow !== 0 && overflow !== 1 && overflow !== 2) throw new Error(`backpressure: 모르는 넘칠 때 방식 ${overflow}`);
  if (!Number.isInteger(rate) || rate <= 0) throw new Error(`backpressure: 보내는 빠르기 ${rate} 가 양의 정수가 아니다`);
  const { ticks, workUnits, capacity, deadline, limit } = data;
  const ahead = Math.floor((limit * workUnits) / capacity);
  let held: Held[] = [];
  let queue: { id: number; born: number }[] = [];
  let onTime = 0;
  let late = 0;
  let rejected = 0;
  let dropped = 0;
  let made = 0;
  let peakHeld = 0;
  let peakQueue = 0;
  const steps: (WorkStep | ArriveStep)[] = [];

  for (let tick = 0; tick < ticks; tick += 1) {
    // ① 일 · ② 끝난 것의 판정
    const n = held.length;
    const share = n > 0 ? Math.floor(capacity / n) : 0;
    const extra = n > 0 ? capacity % n : 0;
    const jobs: JobView[] = [];
    const finished: FinishedView[] = [];
    const kept: Held[] = [];
    held.forEach((job, k) => {
      const give = share + (k < extra ? 1 : 0);
      const before = job.done;
      job.done = Math.min(workUnits, job.done + give);
      if (job.done > workUnits) throw new Error('backpressure: 누적이 일을 넘었다');
      if (job.done >= workUnits) {
        const ok = tick - job.born <= deadline;
        if (ok) onTime += 1;
        else late += 1;
        finished.push({ id: job.id, born: job.born, onTime: ok });
      } else {
        kept.push(job);
        jobs.push({ id: job.id, born: job.born, done: job.done, gain: job.done - before, overdue: tick + 1 - job.born > deadline });
      }
    });
    held = kept;
    steps.push({
      kind: 'work', phase: 'share-work', tick, heldBefore: n, share, extra, jobs, finished,
      onTime, late, made, onTimePct: roundPct(onTime, made),
    });

    // ③ 도착 · ④ 들임
    const created: { id: number; born: number }[] = [];
    for (let j = 0; j < rate; j += 1) {
      made += 1;
      created.push({ id: made, born: tick });
    }
    const admitted: AdmittedView[] = [];
    const rejectedNow: number[] = [];
    const droppedNow: number[] = [];
    const admit = (req: { id: number; born: number }): void => {
      held.push({ id: req.id, born: req.born, done: 0 });
      admitted.push({ id: req.id, born: req.born, overdue: tick + 1 - req.born > deadline });
    };
    let phase: ArriveStep['phase'];
    if (overflow === 2) {
      queue = [...queue, ...created];
      while (queue.length > 0) {
        const head = queue[0];
        if (head === undefined) throw new Error('backpressure: 줄 머리가 없다');
        if (tick - head.born + ahead <= deadline) break;
        queue = queue.slice(1);
        dropped += 1;
        droppedNow.push(head.id);
      }
      while (queue.length > 0 && held.length < limit) {
        const head = queue[0];
        if (head === undefined) throw new Error('backpressure: 줄 머리가 없다');
        queue = queue.slice(1);
        admit(head);
      }
      phase = droppedNow.length > 0 ? 'drop-stale' : queue.length > 0 ? 'hold-back' : 'accept';
    } else {
      for (const req of created) {
        if (overflow === 1 && held.length >= limit) {
          rejected += 1;
          rejectedNow.push(req.id);
        } else {
          admit(req);
        }
      }
      phase = rejectedNow.length > 0 ? 'reject' : 'accept';
    }
    if (overflow !== 0 && held.length > limit) throw new Error(`backpressure: 든 수 ${held.length} 가 한도 ${limit} 를 넘었다`);
    peakHeld = Math.max(peakHeld, held.length);
    peakQueue = Math.max(peakQueue, queue.length);
    steps.push({
      kind: 'arrive', phase, tick, created, admitted, rejected: rejectedNow, dropped: droppedNow,
      queue: queue.map((q) => q.id), held: held.length, onTime, late,
      rejectedTotal: rejected, droppedTotal: dropped, made, onTimePct: roundPct(onTime, made),
    });
  }
  return {
    steps, onTime, late, rejected, dropped, made, peakHeld, peakQueue,
    endHeld: held.length, endQueue: queue.length,
  };
}

/** 사다리 전체(방식 × 빠르기)에서 가장 큰 든 수 · 가장 긴 보내는 쪽 줄 — 무대가 처음부터 자리를 잡는다. */
export function ladderPeaks(data: BackpressureData): { peakHeld: number; peakQueue: number } {
  let peakHeld = 0;
  let peakQueue = 0;
  for (const m of data.overflows) {
    for (const r of data.rates) {
      const run = simulateBackpressure(data, m, r);
      peakHeld = Math.max(peakHeld, run.peakHeld);
      peakQueue = Math.max(peakQueue, run.peakQueue);
    }
  }
  return { peakHeld, peakQueue };
}

type MetricName = 'on-time' | 'late-done' | 'rejected' | 'sender-dropped';

export async function backpressureAlgorithm(ctx: FacetContext<BackpressureData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BackpressureData>;
  const data = readBackpressureData(ctx.data);
  const peaks = ladderPeaks(data);
  let overflow = data.overflowDefault;
  let rate = data.rateDefault;

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<MetricName, number>();
  const setMetric = (name: MetricName, value: number): void => {
    const prev = shown.get(name);
    const delta = prev === undefined ? value : value - prev;
    if (prev === undefined || delta !== 0) {
      ctx.metric(name, delta);
      shown.set(name, value);
    }
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRun = async (): Promise<boolean> => {
    const run = simulateBackpressure(data, overflow, rate);
    setMetric('on-time', 0);
    setMetric('late-done', 0);
    setMetric('rejected', 0);
    setMetric('sender-dropped', 0);
    await ctx.emit({
      type: 'init',
      payload: {
        overflow, rate, ticks: data.ticks, workUnits: data.workUnits, capacity: data.capacity,
        deadline: data.deadline, limit: data.limit, rejectCode: data.rejectCode,
        peakHeld: peaks.peakHeld, peakQueue: peaks.peakQueue, motionMs: data.motionMs,
      },
      silent: true,
    });
    // 판 머리 화면(방식 · 빠르기 캡션)이 보이도록 첫 걸음 전에 걸음 경계를 둔다
    if (!(await rctx.sleep(data.stepMs + data.motionMs))) return false;
    for (const step of run.steps) {
      if (ctx.cancelled) return false;
      if (step.kind === 'work') {
        if (step.heldBefore > 0) await phase('share-work');
        await ctx.emit({
          type: 'work',
          payload: {
            tick: step.tick, heldBefore: step.heldBefore, share: step.share, extra: step.extra,
            jobs: step.jobs, finished: step.finished, onTime: step.onTime, late: step.late,
            made: step.made, onTimePct: step.onTimePct,
          },
        });
        setMetric('on-time', step.onTime);
        setMetric('late-done', step.late);
      } else {
        switch (step.phase) {
          case 'accept': await phase('accept'); break;
          case 'reject': await phase('reject'); break;
          case 'hold-back': await phase('hold-back'); break;
          case 'drop-stale': await phase('drop-stale'); break;
        }
        await ctx.emit({
          type: 'arrive',
          payload: {
            tick: step.tick, created: step.created, admitted: step.admitted, rejected: step.rejected,
            dropped: step.dropped, queue: step.queue, held: step.held, rejectedTotal: step.rejectedTotal,
            droppedTotal: step.droppedTotal, made: step.made, onTimePct: step.onTimePct,
          },
        });
        setMetric('rejected', step.rejectedTotal);
        setMetric('sender-dropped', step.droppedTotal);
      }
      // 걸음 경계는 운동이 끝난 뒤 — stepMs 는 운동 뒤에 쉬는 몫이다
      if (!(await rctx.sleep(data.stepMs + data.motionMs))) return false;
    }
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun())) return;
      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘리고, 사다리에 없는 값은 받지 않는다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') continue;
        if (input.type === 'overflow') {
          if (!data.overflows.includes(value)) continue;
          overflow = value;
          break;
        }
        if (input.type === 'rate') {
          if (!data.rates.includes(value)) continue;
          rate = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
