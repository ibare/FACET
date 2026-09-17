/**
 * pivot-choice-matters — 같은 값들을 두 가지 기준으로 각각 한 번씩 가른다.
 *
 * 이미 줄이 선 배열을 놓고, 가운데 값을 기준으로 삼은 판과 맨 앞 값을 기준으로
 * 삼은 판을 나란히 굴린다. 한 판은 양쪽으로 고르게 나뉘고 다른 판은 전부 한쪽에
 * 쌓인다.
 *
 * 진행: reactive. 자동으로 한 바퀴 돈 뒤 `advance` 를 받아 한 걸음씩 다시 짚는다.
 *
 * ── 셈은 함수로 내주고, 발신은 차례만 말한다
 *
 * 기준 자리가 정해지면 **가른 결과가 통째로 결정된다.** 어느 칸이 어느 팔로
 * 건너갈지도, 받침에서 몇 번째 자리에 앉을지도 값과 기준이 정한다. 걸음이 내리는
 * 판정이 하나도 없다는 뜻이므로 결과를 payload 로 실어 보내지 않고 **셈하는
 * 함수를 내주어 장면이 부르게 한다** (`splitBy`, 프로토콜 4 절의 B 갈래).
 *
 * 그래서 발신 여섯 모두 payload 가 비어 있다. 실어 보내면 출처가 갈리지는 않아도
 * **다음 사람이 집어 쓸 문**이 열린 채로 남는데, 이 조각은 화면에 수를 넷이나
 * 나란히 띄운다 — 판마다의 `총수 → 남는 일`, 저울대의 기움, 팔에 실린 칸의 길이,
 * 그리고 캡션의 수. 그것들이 갈리면 그림이 제 안에서 거짓이 된다.
 *
 * 몇 번째 판인가 · 몇 번째 칸인가는 **발신이 온 차례**가 말한다. 남는 일의 크기와
 * 양팔의 개수는 건너간 칸을 세면 나오므로 장면이 직접 센다 (`scene.ts` 의
 * `countOn` · `remainingOf`).
 *
 * ── 이벤트 (전부 이 facet 고유 확장, C2)
 *
 * `pivot-lift`      payload 없음. 기준으로 삼을 칸이 줄에서 빠져 받침으로 내려간다.
 *                   몇 번째 판인가는 이 발신이 온 차례가 말하고 (판이 하나씩
 *                   쌓이므로), 그 판의 기준 자리는 바탕의 `trials` 가 쥐고 있다.
 *                   silent: 아니다.
 * `partition-move`  payload 없음. 기준과 견준 칸 하나가 왼팔 또는 오른팔로 건너간다.
 *                   몇 번째 칸인가는 이 발신이 온 차례가 말하고, 그 칸이 어느 팔의
 *                   몇 번째 자리로 가는지는 `splitBy` 가 말한다.
 *                   silent: 아니다.
 * `beam-settle`     payload 없음. 실린 개수 차이만큼 저울대가 기운다.
 *                   silent: 아니다.
 * `trial-measure`   payload 없음. 남는 일 — 양쪽 중 큰 쪽을 짚는다.
 *                   silent: 아니다.
 * `rewind`          payload 없음. 한 걸음씩 짚기로 되감는다. 화면을 처음으로 돌린다.
 *                   silent: 아니다.
 * `done`            payload 없음. 두 판을 모두 굴렸다. 두 결과를 나란히 견주게 한다.
 *                   silent: 아니다.
 *
 * target 은 쓰지 않는다 — 같은 인덱스가 판마다 하나씩 있어 `index:3` 이 두 칸을
 * 가리키게 된다. 어느 판의 어느 칸인지는 장면이 셈으로 안다.
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

/** 저울의 두 팔. */
export type PivotArmSide = 'left' | 'right';

/** 기준과 견주어 한 팔에 실린 칸 하나. */
export type PivotPlacement = {
  /** 원래 줄에서의 자리. */
  index: number;
  value: number;
  side: PivotArmSide;
  /** 받침에서 바깥으로 센 자리 (1부터). 좌표가 아니라 차례다. */
  slot: number;
};

/**
 * 기준 하나로 한 번 가른다 — **이 조각의 셈 정본.**
 *
 * 돌려주는 목록의 차례가 곧 칸이 건너가는 차례이고, 그 길이가 곧 `partition-move`
 * 발신의 수다. **장면도 이 함수를 부른다** — 화면에 실리는 칸과 발신이 세는 칸이
 * 같은 자리라야 하므로 규칙을 두 벌로 두지 않는다 (프로토콜 4 절의 B 갈래).
 *
 * 양팔의 개수는 여기서 세지 않는다. 목록을 세면 나오는 것을 따로 돌려주면 그것이
 * 곧 두 번째 출처가 된다.
 *
 * 자리 번호는 원래 줄 순서를 지키도록 매긴다 — 왼팔은 바깥이 앞쪽 값이고
 * 오른팔은 안쪽이 앞쪽 값이다. 그래야 갈린 뒤에도 줄이 왼쪽에서 오른쪽으로
 * 읽힌다.
 */
export function splitBy(values: readonly number[], pivotIndex: number): PivotPlacement[] {
  const pivot = values[pivotIndex];
  if (typeof pivot !== 'number') return [];
  const leftIdx: number[] = [];
  const rightIdx: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i === pivotIndex) continue;
    if (values[i] < pivot) leftIdx.push(i);
    else rightIdx.push(i);
  }
  const placements: PivotPlacement[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i === pivotIndex) continue;
    const inLeft = leftIdx.indexOf(i);
    if (inLeft >= 0) {
      placements.push({
        index: i,
        value: values[i],
        side: 'left',
        slot: leftIdx.length - inLeft,
      });
    } else {
      placements.push({
        index: i,
        value: values[i],
        side: 'right',
        slot: rightIdx.indexOf(i) + 1,
      });
    }
  }
  return placements;
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

  for (const trial of trials) {
    if (ctx.cancelled) return;
    // 이 판에서 몇 칸이 건너가는가. 장면이 부르는 그 함수가 여기서도 정본이다.
    const placements = splitBy(values, trial.pivotIndex);

    await gate(stepMs);
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'pivot-lift' });

    for (let k = 0; k < placements.length; k++) {
      if (ctx.cancelled) return;
      await gate(moveMs);
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'partition-move' });
    }

    await gate(stepMs);
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'beam-settle' });

    await gate(stepMs);
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'trial-measure' });
  }

  await gate(stepMs);
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
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
    await rx.emit({ type: 'rewind' });

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
