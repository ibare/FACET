/**
 * 단계 겹치기 — 박자마다 모두가 한 단계씩 밀려 나가고, 비워진 IF 에 다음 명령어가 들어온다.
 *
 * 모형: 다섯 단계(IF · ID · EX · MEM · WB), 단계마다 한 사이클, 순서대로 한 사이클에
 * 하나씩 가져온다. 해저드가 없으므로 아무도 멈추지 않는다. 사이클 표는 이 규약을
 * 그대로 돌려서 셈한다 — 손으로 적은 표가 아니다.
 *
 * 이벤트 (전부 silent 아님 — 하나하나가 걸음이다)
 *
 *   init   { instructions: string[]; stages: StageKey[] }
 *          명령어 줄과 단계 이름표를 바탕으로 놓는다. 파이프라인은 비어 있다.
 *
 *   cycle  { cycle: number; occupancy: (number | null)[]; entered: number | null;
 *            left: number | null }
 *          한 박자. occupancy[s] 는 이번 사이클에 단계 s 에 있는 명령어 번호(0 부터).
 *          entered 는 이번에 IF 로 들어온 명령어, left 는 지난 사이클에 WB 를 마치고
 *          빠져나간 명령어 (없으면 null).
 *
 *   drain  { cycle: number; left: number; serial: number }
 *          마지막 명령어가 WB 를 마치고 빠져나간다. cycle 은 그것이 WB 에 있던 사이클
 *          (= 모두가 끝난 사이클), serial 은 한 번에 하나씩 처리했다면 걸렸을 사이클 수.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type StageKey = 'if' | 'id' | 'ex' | 'mem' | 'wb';

/** 다섯 단계 — 공통 모형. */
export const STAGE_KEYS: readonly StageKey[] = ['if', 'id', 'ex', 'mem', 'wb'];

export type StageOverlapFacetData = {
  type: 'stage-overlap';
  /** 어셈블리 표기 그대로 — 자료이지 문안이 아니다. */
  instructions: string[];
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
};

export async function stageOverlap(ctx: FacetContext<StageOverlapFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<StageOverlapFacetData>;
  const instructions = [...rctx.data.instructions];
  const stepMs = rctx.data.stepMs;
  const n = instructions.length;
  const depth = STAGE_KEYS.length;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 첫 걸음은 문 밖에 둔다 — 마운트 직후 빈 화면으로 머물지 않게.
  await rctx.emit({ type: 'init', payload: { instructions, stages: [...STAGE_KEYS] } });

  const occupancy: (number | null)[] = STAGE_KEYS.map(() => null);
  let nextFetch = 0;
  let cycle = 0;

  for (;;) {
    if (!(await pause())) return;

    // 한 박자: 모두가 한 단계씩 밀려 나간다. WB 에 있던 것은 빠져나간다.
    const left = occupancy[depth - 1] ?? null;
    for (let s = depth - 1; s > 0; s -= 1) {
      if (rctx.cancelled) return;
      occupancy[s] = occupancy[s - 1] ?? null;
    }
    // 비워진 IF 에 다음 명령어가 들어온다.
    const entered = nextFetch < n ? nextFetch : null;
    occupancy[0] = entered;
    if (entered !== null) nextFetch += 1;

    if (occupancy.every((k) => k === null)) {
      // 파이프라인이 다 비었다 — 마지막 명령어가 빠져나가는 박자.
      if (left === null) return;
      await rctx.emit({
        type: 'drain',
        payload: { cycle, left, serial: n * depth },
      });
      return;
    }

    cycle += 1;
    await rctx.emit({
      type: 'cycle',
      payload: { cycle, occupancy: [...occupancy], entered, left },
    });
  }
}
