/**
 * 시간 지역성 — 방금 쓴 것을 곧 또 쓴다.
 *
 * 칸 둘짜리 캐시로 접근열 둘을 견준다. 읽는 횟수는 여섯으로 같고 다른 것은
 * 어디를 찾느냐뿐이다. 가까이 머무는 열은 한 번만 아래층까지 내려가고, 멀리
 * 흩어지는 열은 여섯 번 다 내려간다.
 *
 * 히트·미스 판정과 밀어낼 칸 고르기는 여기서 한다 (`computeTemporalLocalityTrace`).
 * 그것이 이 조각의 알고리즘 그 자체라 내주지 않고 **판정만 싣는다.** 반대로
 * 색인이 앉는 라인은 바탕에 순수 함수를 먹이면 나오는 값이라 함수를 내주고
 * (`temporalLocalityLineOf`) 장면이 부른다. 선언에 있는 것은 구조뿐이다 —
 * 칸 수 · 라인 크기 · 원소 크기 · 두 접근열의 색인.
 *
 * ── 이벤트 (전부 facet 고유, C2)
 *
 *   stream-begin  {}   접근열 하나를 깨우고 캐시를 비운다.
 *                      몇 번째 열인지는 장면이 센다 — 깨운 열의 수가 그 번호다.
 *   access        { hit: boolean; slot: number }
 *                 한 번의 접근. `hit` 면 `slot` 은 맞은 칸, 아니면 라인이 올라온
 *                 칸이다. 둘 다 이 걸음이 내리는 판정이라 싣는다.
 *                 **몇 번째 접근인가 · 어느 색인인가 · 그 색인이 앉는 라인 ·
 *                 밀려난 라인은 싣지 않는다** — 앞의 셋은 바탕과
 *                 `temporalLocalityLineOf` 가 정하고, 밀려난 것은 그 칸에 무엇이
 *                 있었나로 장면이 안다.
 *   stream-end    {}   접근열 하나가 끝났다. 적중·실패의 수는 장면이 센다.
 *   verdict       {}   두 열의 실패 수를 견준다. 그 수도 장면이 센다 —
 *                      조각의 결론이 화면의 자취와 같은 자료에서 나와야 한다.
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

/**
 * 한 번의 접근에서 **걸음이 내리는 판정**.
 *
 * 화면이 구조에서 셀 수 있는 것(몇 번째 접근인가 · 어느 색인인가 · 어느 라인인가)
 * 은 들지 않는다. 같은 수를 두 자리에서 세면 언젠가 갈린다.
 */
export type TemporalLocalityAccess = {
  /** 이미 위층에 있었나. */
  hit: boolean;
  /** 맞은 칸, 또는 라인이 새로 올라온 칸. */
  slot: number;
};

/**
 * 색인이 앉는 라인 번호. 원소 크기와 라인 크기가 정한다.
 *
 * 바탕 자료에 순수 함수를 먹이면 나오는 값이라 발신에 실어 보내지 않고 장면이
 * 이 함수를 부른다. 그 함수만 떼어 내도 "같은 자리를 다시 읽으면 위층에 있다"
 * 는 주장은 남으므로 내주어도 된다.
 */
export function temporalLocalityLineOf(
  index: number,
  elemBytes: number,
  lineBytes: number,
): number {
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

  for (const stream of data.streams) {
    if (!stream) continue;
    const resident: Array<{ line: number; used: number } | null> = Array.from(
      { length: slotCount },
      () => null,
    );
    const steps: TemporalLocalityAccess[] = [];
    let clock = 0;

    for (const raw of stream.indices) {
      const index = raw ?? 0;
      const line = temporalLocalityLineOf(index, data.elemBytes, data.lineBytes);
      clock += 1;

      const hitSlot = resident.findIndex((r) => r !== null && r.line === line);
      if (hitSlot >= 0) {
        resident[hitSlot] = { line, used: clock };
        steps.push({ hit: true, slot: hitSlot });
        continue;
      }

      let target = resident.findIndex((r) => r === null);
      if (target < 0) {
        target = 0;
        for (let k = 1; k < resident.length; k += 1) {
          if ((resident[k]?.used ?? 0) < (resident[target]?.used ?? 0)) target = k;
        }
      }
      resident[target] = { line, used: clock };
      steps.push({ hit: false, slot: target });
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
    for (const steps of trace) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'stream-begin', payload: {} });

      for (const step of steps) {
        if (!(await gate())) return;
        await ctx.emit({ type: 'access', payload: { hit: step.hit, slot: step.slot } });
      }

      if (!(await gate())) return;
      await ctx.emit({ type: 'stream-end', payload: {} });
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'verdict', payload: {} });

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
