/**
 * dropped-frame — 늦은 장은 기다려 주지 않는다.
 *
 * 화면 박자(vsync) k 의 시각은 k × 1000 / hz ms. 한 장의 일은 박자에서 시작하고,
 * 끝난 시각보다 뒤의 첫 박자에 화면에 나온다. 다음 장은 앞 장이 나온 그 박자에서
 * 시작한다. 새 장이 없는 박자에는 앞 박자의 화면이 되풀이된다. 장이 담는 자리는
 * 속도 × 그 장이 시작한 박자의 시각이다.
 *
 * 시각은 `시각 × hz` 의 정수로 끝까지 셈한다 (박자 k = 1000k). 일이 박자에 딱 맞게
 * 끝나면 어느 박자에 실을지 정할 수 없어 던진다.
 *
 * 이벤트 (전부 사용자 정의)
 * - `init` (silent: true) — 걸음 0 의 바탕을 세운다
 *   payload: {
 *     beats: { k: number; ms: number }[]      // 박자 0..lastBeat 의 시각
 *     intended: number[]                      // 박자 0..lastBeat-1 시각의 자리 (px)
 *     started: FrameStart                     // 박자 0 에 일을 시작한 장
 *   }
 * - `beat` — 박자 하나가 지나갔다 (걸음 1..lastBeat)
 *   payload: {
 *     k: number; ms: number                   // 박자 번호와 시각
 *     frame: number | null                    // 이 박자에 새로 나온 장 번호 (없으면 되풀이)
 *     from: number | null                     // 앞 박자의 화면 자리 (px). 박자 1 에서는 null
 *     pos: number                             // 이 박자의 화면 자리 (px)
 *     working: number | null                  // 되풀이 박자에 아직 일하는 장
 *     started: FrameStart | null              // 이 박자에 일을 시작한 장
 *     skipped: number[]                       // 이 박자에 건너뛰어져 영영 그려지지 않을 자리
 *     jump: number | null                     // 새 장이 앞 화면에서 옮긴 거리 (px). 되풀이 · 박자 1 은 null
 *     summary: Summary | null                 // 마지막 박자에만
 *   }
 *
 * FrameStart = { frame: number; beat: number; startMs: number; endMs: number }
 * Summary    = { beats: number; newFrames: number; repeats: number; never: number[]; maxJump: number }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DroppedFrameFacetData = {
  type: 'dropped-frame';
  stepMs: number;
  /** 화면 주사율 (Hz) */
  hz: number;
  /** 박자 1..lastBeat 까지 본다 */
  lastBeat: number;
  /** 장마다 일 길이 (ms, 차례대로) */
  works: number[];
  /** 움직이는 것의 속도 = px / ms (분수로) */
  speed: { px: number; ms: number };
};

type FramePlan = {
  frame: number;
  startK: number;
  /** 시각 × hz */
  startT: number;
  endT: number;
  shownK: number;
  /** 자리의 분자 — 분모는 speed.ms × hz */
  posNum: number;
};

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function checkData(d: DroppedFrameFacetData): void {
  if (!isPositiveInt(d.hz)) throw new Error(`dropped-frame: hz 는 양의 정수여야 한다 (${String(d.hz)})`);
  if (!isPositiveInt(d.lastBeat)) {
    throw new Error(`dropped-frame: lastBeat 는 양의 정수여야 한다 (${String(d.lastBeat)})`);
  }
  if (!Array.isArray(d.works) || d.works.length === 0) throw new Error('dropped-frame: works 가 비었다');
  d.works.forEach((w, i) => {
    if (!isPositiveInt(w)) throw new Error(`dropped-frame: 장 ${i + 1} 의 일 길이가 양의 정수가 아니다 (${String(w)})`);
  });
  if (!isPositiveInt(d.speed.px) || !isPositiveInt(d.speed.ms)) {
    throw new Error('dropped-frame: speed 는 양의 정수 px / ms 여야 한다');
  }
  if (!isPositiveInt(d.stepMs)) throw new Error(`dropped-frame: stepMs 가 양의 정수가 아니다 (${String(d.stepMs)})`);
}

/** 박자 번호 → 시각 × hz */
function beatT(k: number): number {
  return k * 1000;
}

/** 시각 × hz 가 t 인 순간보다 뒤의 첫 박자. 박자와 같으면 던진다. */
function firstBeatAfter(t: number): number {
  const k = Math.floor(t / 1000);
  if (beatT(k) === t) throw new Error(`dropped-frame: 일이 박자 ${k} 에 딱 맞게 끝났다 — 실을 박자를 정할 수 없다`);
  return k + 1;
}

function planFrames(d: DroppedFrameFacetData): FramePlan[] {
  const frames: FramePlan[] = [];
  let startK = 0;
  d.works.forEach((w, i) => {
    const startT = beatT(startK);
    const endT = startT + w * d.hz;
    const shownK = firstBeatAfter(endT);
    frames.push({ frame: i + 1, startK, startT, endT, shownK, posNum: d.speed.px * startT });
    startK = shownK;
  });
  return frames;
}

export async function droppedFrame(context: FacetContext<DroppedFrameFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DroppedFrameFacetData>;
  const d = ctx.data;
  checkData(d);
  const stepMs = d.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const posDen = d.speed.ms * d.hz;
  const toMs = (t: number): number => t / d.hz;
  const toPx = (num: number): number => num / posDen;

  const frames = planFrames(d);
  const late = frames.find((f) => f.shownK > d.lastBeat);
  if (late) throw new Error(`dropped-frame: 장 ${late.frame} 이 박자 ${d.lastBeat} 안에 나오지 않는다`);

  const shownAt = new Map<number, FramePlan>();
  for (const f of frames) shownAt.set(f.shownK, f);

  const drawnNums = new Set(frames.map((f) => f.posNum));
  const intendedNums: number[] = [];
  for (let k = 0; k < d.lastBeat; k += 1) {
    if (ctx.cancelled) return;
    intendedNums.push(d.speed.px * beatT(k));
  }
  const neverNums = intendedNums.filter((n) => !drawnNums.has(n));

  const startOf = (f: FramePlan) => ({
    frame: f.frame,
    beat: f.startK,
    startMs: toMs(f.startT),
    endMs: toMs(f.endT),
  });
  const startedAt = (k: number) => {
    const f = frames.find((x) => x.startK === k);
    return f ? startOf(f) : null;
  };
  const first = startedAt(0);
  if (!first) throw new Error('dropped-frame: 박자 0 에 시작하는 장이 없다');

  const beats: { k: number; ms: number }[] = [];
  for (let k = 0; k <= d.lastBeat; k += 1) {
    if (ctx.cancelled) return;
    beats.push({ k, ms: toMs(beatT(k)) });
  }

  // 걸음 0 은 이미 읽을 것(박자 줄 · 장 1 의 일)이 있는 화면이라 바탕을 세운 뒤 읽을 틈을 준다
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { beats, intended: intendedNums.map(toPx), started: first },
  });

  let shownNum: number | null = null;
  let repeats = 0;
  let maxJumpNum = 0;
  for (let k = 1; k <= d.lastBeat; k += 1) {
    if (!(await pause())) return;
    const f = shownAt.get(k);
    const fromNum = shownNum;
    let working: number | null = null;
    let skippedNums: number[] = [];
    if (f) {
      if (fromNum !== null) {
        const lo = fromNum;
        skippedNums = neverNums.filter((n) => n > lo && n < f.posNum);
        maxJumpNum = Math.max(maxJumpNum, f.posNum - fromNum);
      }
      shownNum = f.posNum;
    } else {
      if (shownNum === null) throw new Error(`dropped-frame: 박자 ${k} 에 보일 장이 아직 하나도 없다`);
      repeats += 1;
      const busy = frames.find((x) => x.startK < k && x.shownK > k);
      if (!busy) throw new Error(`dropped-frame: 박자 ${k} 가 되풀이인데 일하는 장이 없다`);
      working = busy.frame;
    }
    const nowNum: number = shownNum;
    const summary =
      k === d.lastBeat
        ? {
            beats: d.lastBeat,
            newFrames: d.lastBeat - repeats,
            repeats,
            never: neverNums.map(toPx),
            maxJump: toPx(maxJumpNum),
          }
        : null;
    await ctx.emit({
      type: 'beat',
      payload: {
        k,
        ms: toMs(beatT(k)),
        frame: f ? f.frame : null,
        from: fromNum === null ? null : toPx(fromNum),
        pos: toPx(nowNum),
        working,
        started: startedAt(k),
        skipped: skippedNums.map(toPx),
        jump: f && fromNum !== null ? toPx(f.posNum - fromNum) : null,
        summary,
      },
    });
  }
}
