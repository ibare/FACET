/**
 * 시간 지역성 — 방금 쓴 것을 곧 또 쓴다.
 *
 * 칸 둘짜리 캐시로 접근열 둘을 견준다. 읽는 횟수는 여섯으로 같고 다른 것은
 * 어디를 찾느냐뿐이다. 가까이 머무는 열은 한 번만 아래층까지 내려가고, 멀리
 * 흩어지는 열은 여섯 번 다 내려간다.
 *
 * 히트·미스 판정과 셈은 여기서 한다 (`computeTemporalLocalityTrace`). 선언에
 * 있는 것은 구조뿐이다 — 칸 수 · 라인 크기 · 원소 크기 · 두 접근열의 색인.
 *
 * ── 이벤트 (전부 facet 고유, C2)
 *
 *   stream-begin  { stream: number; slots: number }
 *                 접근열 하나를 깨우고 캐시를 비운다. stream 은 행 번호.
 *   access        { stream: number; step: number; index: number; line: number;
 *                   hit: boolean; slot: number; evicted: number | null }
 *                 한 번의 접근. hit 면 slot 은 맞은 칸, 아니면 올라온 칸이고
 *                 evicted 는 그 칸에서 밀려난 라인 번호 (빈 칸이었으면 null).
 *   stream-end    { stream: number; hits: number; misses: number; total: number }
 *                 접근열 하나가 끝났다.
 *   verdict       { near: number; far: number; total: number }
 *                 두 열의 미스 수를 견준다.
 *   rewind        {}   처음으로 되감는다 (한 걸음씩 다시 보기).
 *
 * silent 이벤트는 없다. 메트릭도 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TemporalLocalityStream = {
  /** 이 열을 부르는 이름. 화면 라벨은 messages 가 정한다 (C10). */
  name: string;
  /** 배열 색인. 한 걸음이 한 색인이다. */
  indices: number[];
};

export type TemporalLocalityData = {
  type: 'temporal-locality';
  /** 걸음 사이의 정지 시간. 읽을 틈을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
  /** 캐시의 칸 수. */
  slots: number;
  /** 라인 한 줄의 바이트 수. */
  lineBytes: number;
  /** 원소 하나의 바이트 수. */
  elemBytes: number;
  streams: TemporalLocalityStream[];
};

export type TemporalLocalityAccess = {
  stream: number;
  step: number;
  index: number;
  line: number;
  hit: boolean;
  slot: number;
  evicted: number | null;
};

/** 색인이 앉는 라인 번호. 원소 크기와 라인 크기가 정한다. */
function lineOf(index: number, elemBytes: number, lineBytes: number): number {
  if (lineBytes <= 0) return index;
  return Math.floor((index * elemBytes) / lineBytes);
}

/**
 * 두 접근열을 칸 둘짜리 캐시에 태워 히트·미스를 가린다.
 *
 * 밀어낼 것을 고르는 규칙은 가장 오래 안 쓰인 칸(LRU)이다. 시간 지역성이
 * 말하는 것이 곧 "최근에 쓴 것이 다시 쓰인다" 이므로, 그것을 재는 자가
 * 최근성이어야 앞뒤가 맞는다.
 */
export function computeTemporalLocalityTrace(
  data: TemporalLocalityData,
): TemporalLocalityAccess[][] {
  const slotCount = Math.max(1, data.slots);
  const out: TemporalLocalityAccess[][] = [];

  for (let s = 0; s < data.streams.length; s += 1) {
    const stream = data.streams[s];
    if (!stream) continue;
    const resident: Array<{ line: number; used: number } | null> = Array.from(
      { length: slotCount },
      () => null,
    );
    const steps: TemporalLocalityAccess[] = [];
    let clock = 0;

    for (let i = 0; i < stream.indices.length; i += 1) {
      const index = stream.indices[i] ?? 0;
      const line = lineOf(index, data.elemBytes, data.lineBytes);
      clock += 1;

      const hitSlot = resident.findIndex((r) => r !== null && r.line === line);
      if (hitSlot >= 0) {
        resident[hitSlot] = { line, used: clock };
        steps.push({ stream: s, step: i, index, line, hit: true, slot: hitSlot, evicted: null });
        continue;
      }

      let target = resident.findIndex((r) => r === null);
      let evicted: number | null = null;
      if (target < 0) {
        target = 0;
        for (let k = 1; k < resident.length; k += 1) {
          if ((resident[k]?.used ?? 0) < (resident[target]?.used ?? 0)) target = k;
        }
        evicted = resident[target]?.line ?? null;
      }
      resident[target] = { line, used: clock };
      steps.push({ stream: s, step: i, index, line, hit: false, slot: target, evicted });
    }

    out.push(steps);
  }

  return out;
}

export async function temporalLocalityAlgorithm(
  ctxBase: FacetContext<TemporalLocalityData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<TemporalLocalityData>;
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 700;
  const trace = computeTemporalLocalityTrace(data);

  /**
   * 마운트 직후의 첫 걸음은 문을 지나지 않는다 — 문은 걸음 *사이*의 것이라
   * 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). 되감기 직후에도 마찬가지다.
   */
  let firstGate = true;
  /** 자동 재생이 한 바퀴 끝난 뒤로는 `advance` 한 번이 한 걸음이다. */
  let manual = false;

  const gate = async (): Promise<boolean> => {
    if (firstGate) {
      firstGate = false;
      return true;
    }
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 걸음으로 세지 않도록.
      if ((await ctx.waitForInput()).type === 'advance') return true;
    }
  };

  for (;;) {
    const missesPerStream: number[] = [];

    for (let s = 0; s < trace.length; s += 1) {
      const steps = trace[s] ?? [];

      if (!(await gate())) return;
      await ctx.emit({ type: 'stream-begin', payload: { stream: s, slots: data.slots } });

      let hits = 0;
      let misses = 0;
      for (const step of steps) {
        if (!(await gate())) return;
        if (step.hit) hits += 1;
        else misses += 1;
        await ctx.emit({
          type: 'access',
          payload: {
            stream: step.stream,
            step: step.step,
            index: step.index,
            line: step.line,
            hit: step.hit,
            slot: step.slot,
            evicted: step.evicted,
          },
        });
      }
      missesPerStream.push(misses);

      if (!(await gate())) return;
      await ctx.emit({
        type: 'stream-end',
        payload: { stream: s, hits, misses, total: steps.length },
      });
    }

    if (!(await gate())) return;
    await ctx.emit({
      type: 'verdict',
      payload: {
        near: missesPerStream[0] ?? 0,
        far: missesPerStream[1] ?? 0,
        total: trace[0]?.length ?? 0,
      },
    });

    // 자동 재생이 끝났다. 여기서부터는 누르는 사람의 걸음이다.
    for (;;) {
      if (ctx.cancelled) return;
      if ((await ctx.waitForInput()).type === 'advance') break;
    }
    manual = true;
    firstGate = true;
    await ctx.emit({ type: 'rewind' });
  }
}
