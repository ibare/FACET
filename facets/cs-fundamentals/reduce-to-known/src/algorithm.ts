/**
 * 환원 — 풀 줄 모르는 문제를 풀 줄 아는 문제로 바꿔 놓는다.
 *
 * 시험 시간표 문제가 그래프 색칠 문제로 옮겨 앉는다. 과목이 마디가 되고, 겹침이
 * 선이 되고, 교시가 색이 된다.
 *
 * **1차 데이터는 과목 다섯과 겹치는 쌍 여섯뿐이다.** 어느 과목이 몇 교시인지도,
 * 교시가 몇 개 필요한지도 여기서 셈한다 — 선언에 적어 두면 저작자의 오타가 그대로
 * 화면이 된다.
 *
 * ── 이벤트 (facet 고유 확장, C2). 전부 걸음의 경계이므로 silent 가 아니다.
 *
 *   board    {}
 *       판을 세운다. 과목 카드 다섯과 겹침 괄호 여섯이 왼쪽 판으로 들어선다.
 *   place    { subject: string; linkedTo: string[] }
 *       과목 하나가 마디 자리로 옮겨 앉는다. `linkedTo` 는 **이미 옮겨 앉은**
 *       이웃이며, 그 겹침들이 이 걸음에서 선이 된다. 겹침은 두 끝이 다 자리를
 *       잡아야 선이 될 수 있으므로 늦게 앉는 쪽의 걸음에서 한 번만 펴진다.
 *   color    { subjects: string[]; periods: number[]; total: number }
 *       이어진 마디를 서로 다른 색으로 칠한다. 두 배열은 자리가 맞물린다
 *       (`subjects[i]` 의 교시가 `periods[i]`). `total` 은 쓰인 색의 가짓수.
 *   schedule { total: number }
 *       색 하나를 교시 하나로 되읽어 원래의 시간표를 채운다.
 *   rewind   {}
 *       되감는다. 자동 재생이 끝난 뒤 한 걸음씩 짚기 시작할 때 한 번 나간다.
 *
 * 메트릭은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ReduceToKnownData = {
  type: 'reduce-to-known';
  /** 과목 식별자 다섯. 화면에 뜨는 이름은 facet.ts 의 `label.*` 가 준다 (C10). */
  subjects: string[];
  /** 시험이 겹치는 쌍 — 같은 교시에 둘 수 없는 두 과목. */
  overlaps: Array<[string, string]>;
  /** 걸음 사이의 정지 시간. 그 앞에 붙는 운동은 stage 가 정한다 (S-piece). */
  stepMs: number;
};

/** 한 겹침의 반대쪽. 이 쌍이 `subject` 를 물지 않으면 null. */
function partner(pair: readonly [string, string], subject: string): string | null {
  if (pair[0] === subject) return pair[1];
  if (pair[1] === subject) return pair[0];
  return null;
}

/**
 * 이어진 마디끼리 색이 겹치지 않게 칠한다 — 마디마다 이웃이 쓰지 않은 가장 작은
 * 번호를 준다.
 *
 * **어떻게 칠하는가는 이 조각의 주장이 아니다.** 바꿔 놓으면 이미 아는 문제가
 * 된다는 것까지가 주장이고, 그래서 칠하는 일은 걸음으로 쪼개지 않고 여기서 한 번에
 * 끝낸다.
 */
function assignPeriods(
  subjects: readonly string[],
  overlaps: ReadonlyArray<readonly [string, string]>,
): Map<string, number> {
  const period = new Map<string, number>();
  for (const subject of subjects) {
    const taken = new Set<number>();
    for (const pair of overlaps) {
      const other = partner(pair, subject);
      if (other === null) continue;
      const p = period.get(other);
      if (p !== undefined) taken.add(p);
    }
    let slot = 1;
    while (taken.has(slot)) slot += 1;
    period.set(subject, slot);
  }
  return period;
}

export async function reduceToKnownAlgorithm(
  base: FacetContext<ReduceToKnownData>,
): Promise<void> {
  const ctx = base as ReactiveContext<ReduceToKnownData>;
  const { subjects, overlaps, stepMs } = ctx.data;

  const period = assignPeriods(subjects, overlaps);
  const periods = subjects.map((s) => period.get(s) ?? 1);
  const total = new Set(periods).size;

  /** 한 걸음씩 짚는 중인가. 자동 재생을 마치면 참이 되고 다시 거짓이 되지 않는다. */
  let byHand = false;

  /**
   * 걸음 사이의 문. 자동이면 읽을 틈을 주고, 손으로 짚는 중이면 `advance` 를
   * 기다린다. 이어 가도 좋으면 true.
   */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!byHand) return ctx.sleep(stepMs);
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (input.type === 'advance') return !ctx.cancelled;
    }
  }

  /**
   * 한 판을 처음부터 끝까지 보인다.
   *
   * **첫 걸음은 문을 지나지 않는다** (S-piece) — 문은 걸음 *사이*의 것이라 첫
   * 걸음 앞에는 기다릴 앞걸음이 없다. 그래서 되감은 직후 처음 누르는 `advance`
   * 도 되감기와 첫 걸음을 함께 보인다.
   */
  async function play(): Promise<boolean> {
    await ctx.emit({ type: 'board', payload: {} });

    const placed = new Set<string>();
    for (const subject of subjects) {
      if (!(await gate())) return false;
      const linkedTo: string[] = [];
      for (const pair of overlaps) {
        const other = partner(pair, subject);
        if (other !== null && placed.has(other)) linkedTo.push(other);
      }
      placed.add(subject);
      await ctx.emit({ type: 'place', payload: { subject, linkedTo } });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'color', payload: { subjects, periods, total } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'schedule', payload: { total } });
    return true;
  }

  if (!(await play())) return;

  // 자동 재생이 끝났다. 이제부터는 누르는 만큼만 나아간다.
  byHand = true;
  for (;;) {
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
      if (!ctx.cancelled) throw err;
      return;
    }
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind', payload: {} });
    if (!(await play())) return;
  }
}
