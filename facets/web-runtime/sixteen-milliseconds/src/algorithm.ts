/**
 * sixteen-milliseconds — 한 장의 예산이 단계마다 깎이고, 박자가 페인트 도중에 온다.
 *
 * 모형: 화면 박자 k 의 시각 = k × 1000 / hz (박자 0 = 시각 0). 한 장의 일은 박자 0 에서
 * 시작해 단계를 차례로 잇는다. 예산 = 박자 1 의 시각(1000 / hz). 남은 시간 = 예산 − 지금까지의 합.
 * 끝난 시각 f 의 장은 f 보다 뒤의 첫 박자에 나온다.
 *
 * 이벤트 (전부 `await ctx.emit`):
 *   init   silent  { budget: number; beats: number[]; stages: { id: string; ms: number }[] }
 *                  예산과 그릴 박자의 시각(박자 0 부터 이 장이 나오는 박자까지). 걸음 0 을 갈아 끼운다.
 *   stage          { index: number; start: number; end: number; left: number }
 *                  박자 전에 끝난 단계 하나. left = 예산 − end (0 보다 크다)
 *   beat           { index: number; start: number; at: number; done: number; ms: number; beat: number; newFrames: number }
 *                  단계 도중에 박자 `beat`(시각 at)가 온다. done = at − start. newFrames = 이 박자까지 끝난 장 수
 *   late           { index: number; end: number; late: number; shownBeat: number; shownAt: number }
 *                  박자를 넘긴 단계가 끝난다. late = end − at. 이 장은 박자 shownBeat(시각 shownAt)에 나온다
 *
 * 던지는 자리 (C6): 단계가 박자 시각에 딱 끝날 때 · 일이 박자 전에 모두 끝날 때 · 박자를 넘긴 뒤에도
 * 단계가 남을 때 · hz 나 단계 몫이 양수가 아닐 때. 모형 밖이라 어느 쪽으로 기울일지 지어내지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SixteenMillisecondsStage = { id: string; ms: number };

export type SixteenMillisecondsFacetData = {
  type: 'sixteen-milliseconds';
  stepMs: number;
  hz: number;
  stages: SixteenMillisecondsStage[];
};

/** 박자 k 의 시각(ms). 잘라 쌓지 않고 매번 셈한다. */
function vsyncAt(k: number, hz: number): number {
  return (k * 1000) / hz;
}

/** t 보다 뒤의 첫 박자 번호. t 가 박자 시각과 같으면 던진다. */
function firstVsyncAfter(t: number, hz: number): number {
  const scaled = t * hz;
  const k = Math.floor(scaled / 1000);
  if (k * 1000 === scaled) throw new Error(`sixteen-milliseconds: 시각 ${t} ms 가 박자 ${k} 와 같다`);
  return k + 1;
}

type Plan =
  | { kind: 'stage'; index: number; start: number; end: number; left: number }
  | { kind: 'beat'; index: number; start: number; at: number; done: number; ms: number; beat: number; newFrames: number }
  | { kind: 'late'; index: number; end: number; late: number; shownBeat: number; shownAt: number };

/** 데이터에서 걸음을 모두 셈한다. 발신 전에 셈을 끝내 모형 밖이면 첫 걸음 전에 던진다. */
function planFrame(hz: number, stages: SixteenMillisecondsStage[]): { budget: number; plan: Plan[]; shownBeat: number } {
  if (!(hz > 0)) throw new Error(`sixteen-milliseconds: hz 가 양수가 아니다 (${hz})`);
  const budget = vsyncAt(1, hz);
  const plan: Plan[] = [];
  let t = 0;
  let crossed = false;
  let shownBeat = -1;
  for (const [index, s] of stages.entries()) {
    if (!(s.ms > 0)) throw new Error(`sixteen-milliseconds: 단계 ${s.id} 의 몫이 양수가 아니다 (${s.ms})`);
    if (crossed) throw new Error(`sixteen-milliseconds: 박자를 넘긴 뒤에 단계 ${s.id} 가 남았다 — 모형 밖`);
    const start = t;
    const end = t + s.ms;
    const k = firstVsyncAfter(end, hz);
    if (k === 1) {
      plan.push({ kind: 'stage', index, start, end, left: budget - end });
    } else {
      // 이 단계 도중에 박자 1 이 온다 — 걸음을 둘로 가른다
      const at = budget;
      // 이 박자까지 끝난 장 — 한 장뿐이고, 그 장의 일이 박자 뒤에 끝나면 0
      const newFrames = end < at ? 1 : 0;
      plan.push({ kind: 'beat', index, start, at, done: at - start, ms: s.ms, beat: 1, newFrames });
      plan.push({ kind: 'late', index, end, late: end - at, shownBeat: k, shownAt: vsyncAt(k, hz) });
      crossed = true;
      shownBeat = k;
    }
    t = end;
  }
  if (!crossed) throw new Error('sixteen-milliseconds: 일이 박자 1 전에 모두 끝났다 — 이 조각의 모형 밖');
  return { budget, plan, shownBeat };
}

export async function sixteenMilliseconds(context: FacetContext<SixteenMillisecondsFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<SixteenMillisecondsFacetData>;
  const { stepMs, hz, stages } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const { budget, plan, shownBeat } = planFrame(hz, stages);
  const beats: number[] = [];
  for (let k = 0; k <= shownBeat; k += 1) beats.push(vsyncAt(k, hz));

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { budget, beats, stages: stages.map((s) => ({ id: s.id, ms: s.ms })) },
  });

  // 걸음 0 은 이미 읽을 것(예산 전체 · 박자)이 있는 화면이라 첫 발신 앞에도 문을 둔다
  for (const p of plan) {
    if (!(await pause())) return;
    if (p.kind === 'stage') {
      await ctx.emit({
        type: 'stage',
        payload: { index: p.index, start: p.start, end: p.end, left: p.left },
      });
    } else if (p.kind === 'beat') {
      await ctx.emit({
        type: 'beat',
        payload: {
          index: p.index,
          start: p.start,
          at: p.at,
          done: p.done,
          ms: p.ms,
          beat: p.beat,
          newFrames: p.newFrames,
        },
      });
    } else {
      await ctx.emit({
        type: 'late',
        payload: { index: p.index, end: p.end, late: p.late, shownBeat: p.shownBeat, shownAt: p.shownAt },
      });
    }
  }
}
