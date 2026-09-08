/**
 * pivot-choice-matters — 같은 값들을 두 가지 기준으로 각각 한 번씩 가른다.
 *
 * 이미 줄이 선 배열을 놓고, 가운데 값을 기준으로 삼은 판과 맨 앞 값을 기준으로
 * 삼은 판을 나란히 굴린다. 한 판은 양쪽으로 고르게 나뉘고 다른 판은 전부 한쪽에
 * 쌓인다. 남는 일의 크기(양쪽 중 큰 쪽)는 데이터에서 셈해 발신한다.
 *
 * 진행: reactive. 자동으로 한 바퀴 돈 뒤 `advance` 를 받아 한 걸음씩 다시 짚는다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장, C2)
 *
 * `pivot-lift`      기준으로 삼을 칸이 줄에서 빠져 받침으로 내려간다.
 *                   payload: { lane: number; index: number; value: number; total: number }
 *                   silent: 아니다.
 * `partition-move`  기준과 견준 칸 하나가 왼팔 또는 오른팔로 건너간다.
 *                   payload: { lane: number; index: number; value: number;
 *                              side: 'left' | 'right'; slot: number }
 *                   slot 은 받침에서 바깥으로 센 자리 번호 (1부터).
 *                   silent: 아니다.
 * `beam-settle`     실린 개수 차이만큼 저울대가 기운다.
 *                   payload: { lane: number; pivot: number;
 *                              leftCount: number; rightCount: number }
 *                   silent: 아니다.
 * `trial-measure`   남는 일 — 양쪽 중 큰 쪽을 짚는다.
 *                   payload: { lane: number; leftCount: number; rightCount: number;
 *                              remaining: number; total: number }
 *                   silent: 아니다.
 * `rewind`          한 걸음씩 짚기로 되감는다. 화면을 처음 상태로 되돌린다.
 *                   payload: { lanes: number }
 *                   silent: 아니다.
 * `done`            두 판을 모두 굴렸다. 두 결과를 나란히 견주게 한다.
 *                   payload: { lanes: number }
 *                   silent: 아니다.
 *
 * target 은 쓰지 않는다 — 같은 인덱스가 판마다 하나씩 있어 `index:3` 이 두 칸을
 * 가리키게 된다. 어느 판의 어느 칸인지는 payload 의 lane + index 가 정본이다.
 *
 * 메트릭 없음 (조각은 셀 것이 없다, S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 판 — 어느 자리의 값을 기준으로 삼을지. */
export type PivotTrial = { pivotIndex: number };

export type PivotChoiceMattersData = {
  type: string;
  /** 가를 값들. 이미 줄이 서 있다. */
  values: number[];
  /** 같은 값들을 몇 가지 기준으로 가를지. */
  trials: PivotTrial[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 낱개 칸이 건너가는 사이의 간격은 한 걸음의 일부다 — 여섯 번이 한 장면이라. */
const MOVE_BEAT = 0.28;

type Placement = {
  index: number;
  value: number;
  side: 'left' | 'right';
  /** 받침에서 바깥으로 센 자리 (1부터). 원래 줄 순서를 그대로 지킨다. */
  slot: number;
};

type Split = {
  placements: Placement[];
  leftCount: number;
  rightCount: number;
};

/**
 * 기준 하나로 한 번 가른다.
 *
 * 자리 번호는 원래 줄 순서를 지키도록 매긴다 — 왼팔은 바깥이 앞쪽 값이고
 * 오른팔은 안쪽이 앞쪽 값이다. 그래야 갈린 뒤에도 줄이 왼쪽에서 오른쪽으로
 * 읽힌다.
 */
function splitBy(values: number[], pivotIndex: number): Split {
  const pivot = values[pivotIndex];
  const leftIdx: number[] = [];
  const rightIdx: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i === pivotIndex) continue;
    if (values[i] < pivot) leftIdx.push(i);
    else rightIdx.push(i);
  }
  const placements: Placement[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i === pivotIndex) continue;
    const inLeft = leftIdx.indexOf(i);
    if (inLeft >= 0) {
      placements.push({ index: i, value: values[i], side: 'left', slot: leftIdx.length - inLeft });
    } else {
      placements.push({ index: i, value: values[i], side: 'right', slot: rightIdx.indexOf(i) + 1 });
    }
  }
  return { placements, leftCount: leftIdx.length, rightCount: rightIdx.length };
}

/**
 * 걸음 사이의 문(gate).
 *
 * 자동 재생이면 `ctx.sleep`, 한 걸음씩 짚는 중이면 `advance` 를 기다린다.
 * 문이 emit 앞에 있으므로 되감기 직후의 첫 문만 그냥 통과시키면 첫 누름이
 * 되감기 + 첫 걸음이 된다 (S-piece).
 */
type Gate = (ms: number) => Promise<void>;

async function runPass(
  ctx: ReactiveContext<PivotChoiceMattersData>,
  data: PivotChoiceMattersData,
  gate: Gate,
): Promise<void> {
  const { values, trials, stepMs } = data;
  const moveMs = Math.round(stepMs * MOVE_BEAT);

  for (let lane = 0; lane < trials.length; lane++) {
    if (ctx.cancelled) return;
    const pivotIndex = trials[lane].pivotIndex;
    const pivot = values[pivotIndex];
    const { placements, leftCount, rightCount } = splitBy(values, pivotIndex);

    await gate(stepMs);
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'pivot-lift',
      payload: { lane, index: pivotIndex, value: pivot, total: values.length },
    });

    for (const p of placements) {
      if (ctx.cancelled) return;
      await gate(moveMs);
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'partition-move',
        payload: { lane, index: p.index, value: p.value, side: p.side, slot: p.slot },
      });
    }

    await gate(stepMs);
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'beam-settle',
      payload: { lane, pivot, leftCount, rightCount },
    });

    await gate(stepMs);
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'trial-measure',
      payload: {
        lane,
        leftCount,
        rightCount,
        remaining: Math.max(leftCount, rightCount),
        total: values.length,
      },
    });
  }

  await gate(stepMs);
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done', payload: { lanes: trials.length } });
}

export const pivotChoiceMatters = async (
  ctx: FacetContext<PivotChoiceMattersData>,
): Promise<void> => {
  const rx = ctx as ReactiveContext<PivotChoiceMattersData>;
  const data = rx.data;
  if (!Array.isArray(data.values) || data.values.length === 0) return;
  if (!Array.isArray(data.trials) || data.trials.length === 0) return;

  // 1) 자동 재생 — 누르지 않아도 화면은 할 말을 마친다.
  await runPass(rx, data, async (ms) => {
    await rx.sleep(ms);
  });

  // 2) 곱씹으며 읽고 싶은 사람을 위한 한 걸음씩 짚기.
  //    첫 누름은 되감고 첫 걸음까지 보인다.
  for (;;) {
    if (rx.cancelled) return;
    await rx.waitForInput();
    if (rx.cancelled) return;
    await rx.emit({ type: 'rewind', payload: { lanes: data.trials.length } });

    let firstGate = true;
    await runPass(rx, data, async () => {
      if (firstGate) {
        firstGate = false;
        return;
      }
      await rx.waitForInput();
    });
  }
};
