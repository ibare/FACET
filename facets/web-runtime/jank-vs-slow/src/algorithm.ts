/**
 * jankVsSlow 이벤트
 *
 * - `beat` { k: number; sides: Array<{ side: 'steady' | 'uneven'; pos: number;
 *     interval: number | null; moved: number | null; count: number }>;
 *     summary?: { steady: number; uneven: number } }
 *   박자 k(1..lastBeat) 마다 한 번. `sides` 는 이 박자에 **새 장이 나온 쪽만** 담는다
 *   (길이 0 · 1 · 2). `pos` 는 그 장이 담긴 자리(px), `interval` 은 그 쪽의 직전 장과의
 *   간격(ms, 그 쪽의 첫 장이면 null), `moved` 는 직전 장과의 자리 차(px, 첫 장이면 null),
 *   `count` 는 그 쪽에서 지금까지 나온 새 장 수(1부터). `summary` 는 마지막 박자에만
 *   실리며 두 쪽의 초당 장 수(전체 구간 기준). silent: false
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Side = 'steady' | 'uneven';

export interface JankVsSlowFacetData {
  type: 'jankVsSlow';
  /** 화면 갱신율 (Hz). 공통 모형은 60 을 가정한다. */
  hz: number;
  /** 마지막으로 보는 박자 번호. */
  lastBeat: number;
  /** 움직이는 것의 속도 (px/ms). 두 쪽 같다. */
  speed: number;
  /** 고른 쪽의 장마다 일 길이 (ms), 차례대로. */
  steadyWork: number[];
  /** 들쭉날쭉한 쪽의 장마다 일 길이 (ms), 차례대로. */
  unevenWork: number[];
  /** 걸음(=박자 하나) 뒤 머무는 ms. */
  stepMs: number;
}

export interface BeatSideUpdate {
  side: Side;
  pos: number;
  interval: number | null;
  moved: number | null;
  count: number;
}

export interface BeatPayload {
  k: number;
  sides: BeatSideUpdate[];
  summary?: { steady: number; uneven: number };
}

type ScheduledFrame = { index: number; startBeat: number; shownBeat: number; pos: number };

type EnrichedFrame = {
  shownBeat: number;
  pos: number;
  interval: number | null;
  moved: number | null;
  count: number;
};

/**
 * 유리수 numerator/denominator 를 소수 첫째 자리로 반올림한다(반은 올림).
 * 표시 직전에만 부른다 — 그 전까지 셈은 정수(thirds-of-ms) 로 끝까지 끌고 간다.
 */
function round1(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    throw new Error(`반올림 분모가 0 이하다: ${denominator}`);
  }
  const scaled = numerator * 10;
  const q = Math.floor(scaled / denominator);
  const r = scaled - q * denominator;
  const bumped = r * 2 >= denominator ? q + 1 : q;
  return bumped / 10;
}

/**
 * 한 쪽의 일 목록에서 장마다 [시작 박자, 나온 박자, 담긴 자리] 를 셈한다.
 * 일이 박자에 딱 맞게 끝나는 동률은 다루지 않는다 — 만나면 던진다.
 */
function scheduleSide(works: number[], beatThirds: number, speed: number): ScheduledFrame[] {
  if (works.length === 0) {
    throw new Error('일 목록이 비어 있다');
  }
  const frames: ScheduledFrame[] = [];
  let startBeat = 0;
  for (let i = 0; i < works.length; i += 1) {
    const w = works[i];
    if (!Number.isFinite(w) || w <= 0) {
      throw new Error(`장 ${i}: 일 길이가 올바르지 않다 (${w})`);
    }
    const start3 = startBeat * beatThirds;
    const end3 = start3 + w * 3;
    if (end3 % beatThirds === 0) {
      throw new Error(`장 ${i}: 일이 박자에 딱 맞게 끝났다 (동률은 다루지 않는다)`);
    }
    const shownBeat = Math.floor(end3 / beatThirds) + 1;
    const rawPos = speed * (start3 / 3);
    const pos = Math.round(rawPos);
    if (Math.abs(rawPos - pos) > 1e-6) {
      throw new Error(`장 ${i}: 자리 셈이 정수로 떨어지지 않는다 (${rawPos})`);
    }
    frames.push({ index: i, startBeat, shownBeat, pos });
    startBeat = shownBeat;
  }
  return frames;
}

/** 장마다 직전 장과의 간격(ms)·옮긴 거리(px)·누적 장 수를 붙인다. */
function enrich(frames: ScheduledFrame[], beatThirds: number): EnrichedFrame[] {
  const out: EnrichedFrame[] = [];
  let prevShown: number | null = null;
  let prevPos: number | null = null;
  for (const f of frames) {
    const interval = prevShown === null ? null : round1((f.shownBeat - prevShown) * beatThirds, 3);
    const moved = prevPos === null ? null : f.pos - prevPos;
    out.push({ shownBeat: f.shownBeat, pos: f.pos, interval, moved, count: out.length + 1 });
    prevShown = f.shownBeat;
    prevPos = f.pos;
  }
  return out;
}

/** 나온 박자 → 그 장 으로 찾는 표. 같은 박자에 장이 둘이면 던진다(데이터 이상). */
function byBeat(frames: EnrichedFrame[]): Map<number, EnrichedFrame> {
  const map = new Map<number, EnrichedFrame>();
  for (const f of frames) {
    if (map.has(f.shownBeat)) {
      throw new Error(`같은 박자 ${f.shownBeat} 에 장이 둘 나온다`);
    }
    map.set(f.shownBeat, f);
  }
  return map;
}

const SIDES: readonly Side[] = ['steady', 'uneven'];

export async function jankVsSlow(ctx: FacetContext<JankVsSlowFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<JankVsSlowFacetData>;
  const { hz, lastBeat, speed, steadyWork, unevenWork, stepMs } = rc.data;

  if (!Number.isFinite(hz) || hz <= 0) {
    throw new Error(`hz 가 올바르지 않다: ${hz}`);
  }
  if (!Number.isInteger(lastBeat) || lastBeat <= 0) {
    throw new Error(`lastBeat 가 올바르지 않다: ${lastBeat}`);
  }

  // 박자 시각을 "ms 의 1/3" 정수 단위로 다뤄 부동소수 오차를 피한다.
  const beatThirds = (1000 * 3) / hz;
  if (!Number.isInteger(beatThirds)) {
    throw new Error(`hz ${hz} 로는 박자 시각이 정수 thirds 로 떨어지지 않는다`);
  }

  const schedules: Record<Side, ScheduledFrame[]> = {
    steady: scheduleSide(steadyWork, beatThirds, speed),
    uneven: scheduleSide(unevenWork, beatThirds, speed),
  };

  for (const side of SIDES) {
    const last = schedules[side][schedules[side].length - 1];
    if (last.shownBeat > lastBeat) {
      throw new Error(`${side}: 박자 ${lastBeat} 안에 나오지 않는 장이 있다`);
    }
  }

  const enriched: Record<Side, EnrichedFrame[]> = {
    steady: enrich(schedules.steady, beatThirds),
    uneven: enrich(schedules.uneven, beatThirds),
  };
  const bySide: Record<Side, Map<number, EnrichedFrame>> = {
    steady: byBeat(enriched.steady),
    uneven: byBeat(enriched.uneven),
  };

  const totalMs3 = lastBeat * beatThirds; // 전체 구간(ms) * 3

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  for (let k = 1; k <= lastBeat; k += 1) {
    if (rc.cancelled) return;

    const sides: BeatSideUpdate[] = [];
    for (const side of SIDES) {
      const f = bySide[side].get(k);
      if (f !== undefined) {
        sides.push({ side, pos: f.pos, interval: f.interval, moved: f.moved, count: f.count });
      }
    }

    const payload: BeatPayload = { k, sides };
    if (k === lastBeat) {
      payload.summary = {
        steady: round1(enriched.steady.length * 3000, totalMs3),
        uneven: round1(enriched.uneven.length * 3000, totalMs3),
      };
    }

    await rc.emit({ type: 'beat', payload });
    if (!(await pause())) return;
  }
}
