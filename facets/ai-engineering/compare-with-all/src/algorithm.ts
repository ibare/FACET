/**
 * 전부 견주기 — 후보를 하나도 빠뜨리지 않고 다 보는 값.
 *
 * 비교 횟수는 후보 수와 같아 그것만으로는 이야기가 되지 않는다. 비용은 비교가
 * 아니라 **곱셈**에 있다 — 벡터 하나를 견주려면 차원마다 곱셈이 한 번씩 든다.
 * 그래서 이 조각이 세는 것은 `후보 수 n × 차원 d` 다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장, silent 없음 — 모두 걸음 경계다)
 *
 * **payload 가 하나도 없다.** 이 조각에는 걸음이 내리는 판정이 없기 때문이다 —
 * 무엇을 몇 번째로 훑을지는 후보 수가 정하고, 키운 줄은 선언의 `scales` 에 차례로
 * 적혀 있으며, 곱셈 수는 `n × dims` 라 바탕에서 곧바로 나온다. 장면이 그것을 전부
 * 셈하므로 (`scene.ts`) 걸음은 어휘만 나른다. `target` 도 싣지 않는다 — 몇 번째
 * 후보인가는 훑음이 하나씩 쌓이는 것으로 장면이 센다.
 *
 *   sweep        후보 하나를 견준다.
 *   fuse         작은 판 하나를 다 훑었다. 낱낱의 곱셈이 한 더미로 굳는다.
 *   grow         후보 수와 차원을 한 줄 키운다.
 *   real-scale   실제 크기에 가까운 줄. 더미가 화면 밖으로 자란다.
 *   rewind       한 걸음씩 짚어 보려고 처음으로 되감는다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 *
 * ── 선언에 없는 것
 *   곱셈 횟수는 선언에 박지 않는다. 1차 데이터는 후보 수와 차원의 짝이고,
 *   `n * dims` 는 장면이 셈한다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 후보 수와 차원의 짝. 곱셈 횟수는 여기서 나온다. */
export type CompareWithAllPair = {
  n: number;
  dims: number;
};

export type CompareWithAllData = {
  type: 'compare-with-all';
  /** 실제로 하나씩 훑어 보는 작은 판. */
  board: CompareWithAllPair;
  /** 수를 키운 줄들. 화면의 자는 이만큼씩 물러선다. */
  scales: CompareWithAllPair[];
  /** 실제 크기에 가까운 줄 — 문서 천 개, 임베딩 차원 768. */
  real: CompareWithAllPair;
  /** 걸음 사이의 정지 시간 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 걸음 사이의 문. 자동 재생에서는 쉬는 시간이고, 짚어 볼 때는 누름이다. */
type Gate = () => Promise<boolean>;

/**
 * 한 바퀴. 자동 재생과 한 걸음씩 짚기가 같은 함수를 쓰므로 둘이 어긋날 수 없다.
 *
 * @returns 끝까지 갔으면 true, 중간에 취소됐으면 false.
 */
async function runPass(ctx: ReactiveContext<CompareWithAllData>, gate: Gate): Promise<boolean> {
  const { board, scales } = ctx.data;

  // 걸음 수는 사람이 적은 것이 아니라 후보 수가 정한다 — 전수 탐색이란 그것이다.
  // 몇 번째 후보인지는 싣지 않는다 — 훑음이 하나씩 쌓이므로 장면이 센다.
  for (let i = 0; i < board.n; i += 1) {
    // 첫 걸음 앞에는 기다릴 앞걸음이 없다. 문을 먼저 두면 빈 화면부터 보인다 (S-piece).
    if (i > 0 && !(await gate())) return false;
    await ctx.emit({ type: 'sweep' });
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'fuse' });

  // 어느 줄로 키우는지는 선언의 `scales` 가 차례로 말한다. 걸음은 한 칸 나아갔다는
  // 것만 옮기므로 무엇을 꺼내 쓸 것이 없어 셈 루프로 돈다.
  for (let i = 0; i < scales.length; i += 1) {
    if (!(await gate())) return false;
    await ctx.emit({ type: 'grow' });
  }

  if (!(await gate())) return false;
  await ctx.emit({ type: 'real-scale' });
  return true;
}

export const compareWithAllAlgorithm = async (
  ctx: FacetContext<CompareWithAllData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<CompareWithAllData>;
  const { stepMs } = rc.data;

  try {
    // 자동 재생 — 걸음 사이를 stepMs 만큼 쉰다.
    if (!(await runPass(rc, () => rc.sleep(stepMs)))) return;

    // 누름을 기다리는 문. 받은 것의 종류를 본다 — 위젯 입력이 걸음으로 세이지
    // 않도록 (S-runtime 의 dispatch 단일 경로).
    const gate: Gate = async () => {
      for (;;) {
        if (rc.cancelled) return false;
        const input = await rc.waitForInput();
        if (rc.cancelled) return false;
        if (input.type === 'advance') return true;
      }
    };

    // 자동 재생이 끝나면 처음부터 한 걸음씩 짚어 볼 수 있다. 첫 누름은 되감고
    // 첫 걸음까지 간다 — runPass 의 첫 걸음이 문을 지나지 않기 때문이다.
    for (;;) {
      if (rc.cancelled) return;
      if (!(await gate())) return;
      await rc.emit({ type: 'rewind' });
      if (!(await runPass(rc, gate))) return;
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다 (C8 정본).
    if (!rc.cancelled) throw err;
  }
};
