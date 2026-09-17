/**
 * keepNeighborsClose — 고리 위의 점들을 한 줄로 편다 (조각, S-piece).
 *
 * 묻는 것 하나: 멀고 가까움을 다 지킬 수 없다면 무엇을 지켜야 하는가.
 * 이웃 간격만 지키기로 하면 아홉 쌍은 온전히 지켜지고, 고리가 닫혀 있으므로
 * 마지막 한 쌍이 찢어진다. 어디를 끊을지는 고를 수 있어도 끊지 않을 수는 없다.
 *
 * ── 이벤트 (facet 고유. 표준 어휘는 `done` 뿐이다. silent 는 쓰지 않는다)
 *
 *   ring    {}
 *       고리와 점들을 세운다.
 *   cut     {}
 *       이웃 한 쌍의 이음을 끊는다. 어디를 끊을지는 선언의 `cutAt` 이다.
 *   unroll  { positions: number[] }
 *       편 뒤 각 점이 놓이는 한 줄 위의 자리 (데이터 단위). `positions[i]` 가 점 i.
 *   kept    {}
 *       거리가 지켜진 이웃 쌍을 짚는다.
 *   torn    {}
 *       끊긴 쌍이 그 값을 치른 것을 짚는다.
 *   far     {}
 *       마주 보는 쌍을 견준다. 멀었던 것의 거리도 정확하지 않다는 곁들임.
 *   done    {}
 *       할 말을 마쳤다.
 *   rewind  {}
 *       한 걸음씩 되짚기 위해 처음으로 되감는다.
 *
 * **값을 싣는 발신은 `unroll` 하나뿐이다.** 이웃 간격을 그대로 쌓아 줄 위의 자리를
 * 내는 셈이 이 조각의 알고리즘 그 자체라 장면에 내주지 않는다. 나머지 — 고리에서의
 * 거리, 끊을 자리, 지켜진 쌍과 그 거리, 찢어진 쌍의 배수, 마주 보는 쌍의 두 거리 —
 * 는 전부 바탕의 좌표와 `positions` 에서 곧바로 나오므로 장면이 센다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KeepNeighborsClosePoint = {
  /** 점 번호. 차례가 곧 고리 위의 이웃 관계다. */
  id: number;
  x: number;
  y: number;
};

export type KeepNeighborsCloseData = {
  type: 'keep-neighbors-close';
  /** 고리 위의 점들. 마지막 점의 다음 이웃은 첫 점이다. */
  points: KeepNeighborsClosePoint[];
  /** 끊을 자리. 이 첨자의 점과 그 다음 점 사이를 끊는다. */
  cutAt: number;
  /** 곁들여 견줄 마주 보는 쌍. */
  farPair: [number, number];
  /** 걸음 간격 (S-piece). */
  stepMs: number;
};

/**
 * 고리 위 이웃 쌍의 거리. `gaps[k]` 는 점 k 와 점 (k+1)%n 사이다.
 *
 * 걸음이 실어 나르지 않고 여기서 내준다 — 줄을 셈하는 것도 화면에 숫자를 매다는
 * 것도 같은 잣대를 써야 하고, 두 군데에 적으면 갈린다. 좌표 둘 사이의 거리는
 * 조각이 보이려는 셈이 아니라 바탕에서 곧바로 나오는 사실이다.
 */
export function keepNeighborsCloseGaps(
  points: readonly { x: number; y: number }[],
): number[] {
  const n = points.length;
  const gaps: number[] = [];
  for (let k = 0; k < n; k += 1) {
    const a = points[k];
    const b = points[(k + 1) % n];
    gaps.push(Math.hypot(a.x - b.x, a.y - b.y));
  }
  return gaps;
}

export const keepNeighborsCloseAlgorithm = async (
  ctx: FacetContext<KeepNeighborsCloseData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<KeepNeighborsCloseData>;
  const { points, cutAt, farPair, stepMs } = ctx.data;
  const n = points.length;

  if (n < 3) throw new Error(`고리를 이루려면 점이 셋은 있어야 한다: ${n}`);
  if (!Number.isInteger(cutAt) || cutAt < 0 || cutAt >= n) {
    throw new Error(`끊을 자리가 고리 밖이다: cutAt=${cutAt}, 점 ${n}개`);
  }
  const [farA, farB] = farPair;
  if (farA < 0 || farA >= n || farB < 0 || farB >= n || farA === farB) {
    throw new Error(`마주 보는 쌍이 고리 밖이거나 같은 점이다: ${farA}, ${farB}`);
  }

  // 이웃한 n 쌍의 거리. 고리이므로 마지막 점도 첫 점과 이웃이다.
  const gaps = keepNeighborsCloseGaps(points);

  // 한 줄로 편 자리. 끊은 자리 다음 점을 왼쪽 끝에 두고 이웃 간격을 그대로 쌓는다.
  const positions: number[] = new Array<number>(n).fill(0);
  let at = 0;
  for (let i = 0; i < n; i += 1) {
    const idx = (cutAt + 1 + i) % n;
    positions[idx] = at;
    at += gaps[idx];
  }

  /** 되짚기로 넘어갔는가. 그때부터 걸음은 사람이 민다. */
  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  const gate = async (): Promise<boolean> => {
    if (rctx.cancelled) return false;
    if (!manual) return rctx.sleep(stepMs);
    for (;;) {
      if (rctx.cancelled) return false;
      const input = await rctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !rctx.cancelled;
    }
  };

  const run = async (): Promise<void> => {
    // 첫 걸음은 문을 지나지 않는다 (S-piece) — 앞걸음이 없으니 기다릴 것도 없다.
    // 아래 일곱은 본문이 같아 보여도 한 줄씩 편다. `type` 은 언제나 리터럴이어야
    // 어휘를 grep 으로 찾을 수 있다 (C2).
    await rctx.emit({ type: 'ring', payload: {} });
    if (!(await gate())) return;

    await rctx.emit({ type: 'cut', payload: {} });
    if (!(await gate())) return;

    await rctx.emit({ type: 'unroll', payload: { positions } });
    if (!(await gate())) return;

    await rctx.emit({ type: 'kept', payload: {} });
    if (!(await gate())) return;

    await rctx.emit({ type: 'torn', payload: {} });
    if (!(await gate())) return;

    await rctx.emit({ type: 'far', payload: {} });
    if (!(await gate())) return;

    await rctx.emit({ type: 'done', payload: {} });
  };

  try {
    await run();

    // 자동 재생이 끝났다. 이제부터는 한 걸음씩 곱씹는 사람의 차례다.
    for (;;) {
      if (rctx.cancelled) return;
      const input = await rctx.waitForInput();
      if (input.type !== 'advance') continue;
      if (rctx.cancelled) return;
      manual = true;
      await rctx.emit({ type: 'rewind', payload: {} });
      await run();
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!rctx.cancelled) throw err;
  }
};
