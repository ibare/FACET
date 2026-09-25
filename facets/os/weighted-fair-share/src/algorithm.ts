/**
 * weighted-fair-share — CFS 의 무게. 틱마다 가상 시간이 가장 작은 것을 돌리면 무게만큼 나뉜다.
 *
 * 모형 (공통 안내문 1 절 · 사양 weighted-fair-share)
 * - 프로세스 셋 `procs` (목록 차례 = 동률의 마지막 기준). 첫째 · 셋째의 무게는 1, 둘째(B)의 무게는 손잡이.
 * - 셋째(C)는 틱 경계 `arriveAt` 에 온다. 나머지는 0 에 와 있다.
 * - 틱 경계마다 (3) 도착 → (6) 고름 → (7) 한 틱 돈다. 줄이 없다 — 와 있는 것 가운데
 *   가상 시간이 가장 작은 것을 고른다.
 * - 한 틱 돌면 가상 시간이 `unit ÷ 무게` 만큼 오른다 (`unit` 은 사다리의 모든 무게로 나누어떨어진다).
 * - 늦게 온 것의 처음 가상 시간: cStart 0 = 0 에서, 1 = 와 있는 것들의 가장 작은 가상 시간에서.
 *
 * 동률 규칙 — 가상 시간이 같으면 **마지막으로 돈 틱이 가장 이른 것** (안 돈 것은 −1 로 가장 이르다),
 * 그래도 같으면 목록 차례. 이 데이터에서 판마다 7 ~ 14 번 걸린다 (`tieCount`).
 *
 * 걸음 (이 완제품만의 규칙 — 줄이 없어 공통의 접는 규칙을 쓰지 않는다)
 * - 틱 하나 = 걸음 하나 `[tick]` · C 가 오는 틱에는 그 앞에 `[arrive]` 한 걸음 · 판 끝에 `[share]` 한 걸음.
 * - 판마다 ticks + 2 걸음 (24 틱이면 26).
 *
 * 이벤트 (algorithm → projector)
 * - `round`  (걸음 경계가 아니다 — 판의 시작. 첫 판의 걸음 0 은 projector 가 마운트 때 initialData 로 그리고,
 *             이 이벤트는 같은 빈 그래프를 다시 세운다. 다음 판에서는 앞 판을 점선으로 남기고 비운다)
 *     payload { procs: string[], weights: number[], cStart: number, ticks: number, arriveAt: number,
 *               late: number, unit: number, vTop: number }
 *     vTop = 사다리의 모든 조합에서 판 끝 가상 시간의 가장 큰 값 (세로 눈금을 판마다 흔들지 않으려고)
 * - `tick`   payload { tick: number, proc: number, before: number, after: number, weight: number,
 *               unit: number, vrs: number[], present: number[], ran: number[],
 *               tie: 'none' | 'recent' | 'order', tied: number[] }
 *     vrs · ran 은 이 틱을 돈 뒤의 값. tied 는 동률에 든 것들의 색인 (동률이 없으면 빈 배열).
 * - `arrive` payload { tick: number, proc: number, start: number, from: 'zero' | 'lowest',
 *               others: number[] }   others = 와 있던 것들의 [색인, 가상 시간, …] 쌍을 편 것
 * - `share`  payload { ran: number[], first: number, firstB: number, pct: number, lateTicks: number,
 *               lateRun: number }   first = arriveAt · firstB = 앞 first 틱에서 B 가 받은 틱
 *               pct = (firstB × 100 + first // 2) // first · lateRun = 뒤 lateTicks 틱에서 C 가 받은 틱
 * - `phase`  silent. payload { phase: 'arrive' | 'tick' | 'share' }
 *
 * phase 어휘 (irs.ts 와 정확히 같다): `arrive` · `share` · `tick`
 *
 * 계기 (판마다 0 에서 다시 — 지금 보이는 값을 들고 차이만 보낸다)
 * - `a-ticks` · `b-ticks` · `c-ticks` — 그 걸음 끝까지 각자 받은 틱. arrive 걸음은 그 틱을 돌기 전 값.
 *
 * 입력 (reactive) — `weight` (value ∈ weightLadder) · `cStart` (value ∈ startLadder).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WeightedFairShareData = {
  type: 'weighted-fair-share';
  stepMs: number;
  /** 식별자. 목록 차례가 동률의 마지막 기준이고 마지막이 늦게 오는 것이다. */
  procs: string[];
  /** B(둘째) 의 무게 사다리. 나머지의 무게는 1. */
  weightLadder: number[];
  /** C 의 출발 사다리 — 0 = 0 에서, 1 = 가장 작은 값에서. */
  startLadder: number[];
  /** 가상 시간 += unit ÷ 무게 */
  unit: number;
  ticks: number;
  arriveAt: number;
  weight: number;
  cStart: number;
};

export type TieKind = 'none' | 'recent' | 'order';

export type TickStep = {
  kind: 'tick';
  tick: number;
  proc: number;
  before: number;
  after: number;
  vrs: number[];
  present: number[];
  ran: number[];
  tie: TieKind;
  tied: number[];
};

export type ArriveStep = {
  kind: 'arrive';
  tick: number;
  proc: number;
  start: number;
  from: 'zero' | 'lowest';
  others: number[];
  ran: number[];
};

export type Board = {
  weights: number[];
  steps: (TickStep | ArriveStep)[];
  ran: number[];
  vrs: number[];
  firstB: number;
  lateRun: number;
  tieCount: number;
};

/** B 의 무게 사다리와 C 의 출발 사다리에서 판 하나를 셈한다 (화면과 IR 이 대조하는 값의 원본). */
export function simulateBoard(data: WeightedFairShareData, weight: number, cStart: number): Board {
  const n = data.procs.length;
  if (n < 2) throw new Error(`weighted-fair-share: 프로세스가 둘 이상이어야 한다 (${n})`);
  if (!data.weightLadder.includes(weight)) throw new Error(`weighted-fair-share: 사다리 밖의 무게 ${weight}`);
  if (!data.startLadder.includes(cStart)) throw new Error(`weighted-fair-share: 사다리 밖의 출발 ${cStart}`);
  for (const w of [1, ...data.weightLadder]) {
    if (!Number.isInteger(w) || w <= 0 || data.unit % w !== 0) {
      throw new Error(`weighted-fair-share: unit ${data.unit} 이 무게 ${w} 로 나누어떨어지지 않는다`);
    }
  }
  if (!(data.arriveAt >= 0 && data.arriveAt < data.ticks)) {
    throw new Error(`weighted-fair-share: 도착 틱 ${data.arriveAt} 이 판 밖이다`);
  }
  const late = n - 1;
  const weights = data.procs.map((_, i) => (i === 1 ? weight : 1));
  const vr = data.procs.map(() => 0);
  const lastRan = data.procs.map(() => -1);
  const present = data.procs.map((_, i) => (i === late ? 0 : 1));
  const ran = data.procs.map(() => 0);
  const steps: (TickStep | ArriveStep)[] = [];
  let tieCount = 0;
  let firstB = 0;
  let lateRun = 0;

  for (let tick = 0; tick < data.ticks; tick += 1) {
    if (tick === data.arriveAt) {
      let start = 0;
      const others: number[] = [];
      for (let i = 0; i < n; i += 1) if (present[i] === 1) others.push(i, vr[i]);
      if (cStart === 1) {
        let low = -1;
        for (let i = 0; i < n; i += 1) {
          if (present[i] === 1 && (low < 0 || vr[i] < low)) low = vr[i];
        }
        if (low < 0) throw new Error('weighted-fair-share: 와 있는 것이 없어 가장 작은 값을 셈할 수 없다');
        start = low;
      }
      vr[late] = start;
      present[late] = 1;
      steps.push({ kind: 'arrive', tick, proc: late, start, from: cStart === 1 ? 'lowest' : 'zero', others, ran: [...ran] });
    }
    let best = -1;
    for (let i = 0; i < n; i += 1) {
      if (present[i] !== 1) continue;
      if (best < 0) best = i;
      else if (vr[i] < vr[best] || (vr[i] === vr[best] && lastRan[i] < lastRan[best])) best = i;
    }
    if (best < 0) throw new Error(`weighted-fair-share: 틱 ${tick} 에 CPU 가 논다 — 이 모형은 빈 틱을 셈하지 않는다`);
    const tied: number[] = [];
    for (let i = 0; i < n; i += 1) if (present[i] === 1 && vr[i] === vr[best]) tied.push(i);
    let tie: TieKind = 'none';
    if (tied.length > 1) {
      tieCount += 1;
      tie = tied.some((i) => i !== best && lastRan[i] === lastRan[best]) ? 'order' : 'recent';
    }
    const before = vr[best];
    vr[best] = before + data.unit / weights[best];
    lastRan[best] = tick;
    ran[best] += 1;
    if (tick < data.arriveAt && best === 1) firstB += 1;
    if (tick >= data.arriveAt && best === late) lateRun += 1;
    steps.push({ kind: 'tick', tick, proc: best, before, after: vr[best], vrs: [...vr], present: [...present], ran: [...ran], tie, tied });
  }
  return { weights, steps, ran, vrs: vr, firstB, lateRun, tieCount };
}

/** 사다리의 모든 조합에서 판 끝 가상 시간의 가장 큰 값 — 세로 눈금의 윗끝. */
export function ceilingOf(data: WeightedFairShareData): number {
  let top = 0;
  for (const w of data.weightLadder) {
    for (const s of data.startLadder) {
      for (const v of simulateBoard(data, w, s).vrs) top = Math.max(top, v);
    }
  }
  return top;
}

/** 앞 first 틱의 B 몫 — 반올림 백분율. */
export function sharePct(firstB: number, first: number): number {
  if (first <= 0) throw new Error(`weighted-fair-share: 몫을 잴 틱이 없다 (${first})`);
  return Math.floor((firstB * 100 + Math.floor(first / 2)) / first);
}

function readKnob(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) throw new Error('weighted-fair-share: 손잡이 입력에 payload 가 없다');
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number') throw new Error('weighted-fair-share: 손잡이 값이 수가 아니다');
  return value;
}

export async function weightedFairShareAlgorithm(ctx0: FacetContext<WeightedFairShareData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<WeightedFairShareData>;
  const data = ctx.data;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음에도 차이 0 을 보낸다.
  const shown = { 'a-ticks': 0, 'b-ticks': 0, 'c-ticks': 0 };
  const show = (name: 'a-ticks' | 'b-ticks' | 'c-ticks', value: number) => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const showAll = (ran: number[]) => {
    if (ran.length !== 3) throw new Error(`weighted-fair-share: 계기는 셋을 센다 (${ran.length})`);
    show('a-ticks', ran[0]);
    show('b-ticks', ran[1]);
    show('c-ticks', ran[2]);
  };

  let weight = data.weight;
  let cStart = data.cStart;
  const vTop = ceilingOf(data);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const board = simulateBoard(data, weight, cStart);
      showAll(data.procs.map(() => 0));
      await ctx.emit({
        type: 'round',
        payload: {
          procs: [...data.procs],
          weights: board.weights,
          cStart,
          ticks: data.ticks,
          arriveAt: data.arriveAt,
          late: data.procs.length - 1,
          unit: data.unit,
          vTop,
        },
      });

      for (const step of board.steps) {
        if (ctx.cancelled) return;
        if (step.kind === 'arrive') {
          await phase('arrive');
          await ctx.emit({
            type: 'arrive',
            payload: { tick: step.tick, proc: step.proc, start: step.start, from: step.from, others: step.others },
          });
          showAll(step.ran);
        } else {
          await phase('tick');
          await ctx.emit({
            type: 'tick',
            payload: {
              tick: step.tick,
              proc: step.proc,
              before: step.before,
              after: step.after,
              weight: board.weights[step.proc],
              unit: data.unit,
              vrs: step.vrs,
              present: step.present,
              ran: step.ran,
              tie: step.tie,
              tied: step.tied,
            },
          });
          showAll(step.ran);
        }
        if (!(await ctx.sleep(data.stepMs))) return;
      }

      if (ctx.cancelled) return;
      await phase('share');
      await ctx.emit({
        type: 'share',
        payload: {
          ran: board.ran,
          first: data.arriveAt,
          firstB: board.firstB,
          pct: sharePct(board.firstB, data.arriveAt),
          lateTicks: data.ticks - data.arriveAt,
          lateRun: board.lateRun,
        },
      });
      showAll(board.ran);

      // 한 판을 끝까지 돌았다 — 손잡이를 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'weight') {
          const value = readKnob(input.payload);
          if (!data.weightLadder.includes(value)) throw new Error(`weighted-fair-share: 사다리 밖의 무게 ${value}`);
          weight = value;
          break;
        }
        if (input.type === 'cStart') {
          const value = readKnob(input.payload);
          if (!data.startLadder.includes(value)) throw new Error(`weighted-fair-share: 사다리 밖의 출발 ${value}`);
          cStart = value;
          break;
        }
        // 우리 것이 아닌 입력은 흘린다.
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
