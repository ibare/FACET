/**
 * keepNeighborsClose — 고리 위의 점들을 한 줄로 편다 (조각, S-piece).
 *
 * 묻는 것 하나: 멀고 가까움을 다 지킬 수 없다면 무엇을 지켜야 하는가.
 * 이웃 간격만 지키기로 하면 아홉 쌍은 온전히 지켜지고, 고리가 닫혀 있으므로
 * 마지막 한 쌍이 찢어진다. 어디를 끊을지는 고를 수 있어도 끊지 않을 수는 없다.
 *
 * 거리는 전부 `data.points` 의 좌표에서 직접 잰다 — 선언에는 구조만 있고
 * 파생값은 여기서 셈한다.
 *
 * ── 이벤트 (facet 고유. 표준 어휘는 `done` 뿐이다. silent 는 쓰지 않는다)
 *
 *   ring    { gaps: number[] }
 *       고리와 점들을 세운다. `gaps[k]` 는 점 k 와 점 (k+1)%n 의 거리다.
 *   cut     { a: number; b: number }
 *       끊을 이웃 쌍. `a` 가 앞 첨자이고 `b` 는 (a+1)%n 이다.
 *   unroll  { positions: number[] }
 *       편 뒤 각 점이 놓이는 한 줄 위의 자리 (데이터 단위). `positions[i]` 가 점 i.
 *   kept    { pairs: number[]; dists: number[] }
 *       간격이 지켜진 이웃 쌍의 앞 첨자와 편 뒤의 거리. 두 배열은 길이가 같다.
 *   torn    { before: number; after: number; ratio: number }
 *       끊긴 쌍의 거리 — 고리에서, 줄에서, 그리고 그 배수.
 *   far     { a: number; b: number; before: number; after: number }
 *       마주 보는 쌍 하나. 멀었던 것의 거리도 정확하지 않다는 곁들임.
 *   done    {}
 *       할 말을 마쳤다.
 *   rewind  {}
 *       한 걸음씩 되짚기 위해 처음으로 되감는다.
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

function distance(a: KeepNeighborsClosePoint, b: KeepNeighborsClosePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
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
  const gaps: number[] = [];
  for (let k = 0; k < n; k += 1) gaps.push(distance(points[k], points[(k + 1) % n]));

  // 한 줄로 편 자리. 끊은 자리 다음 점을 왼쪽 끝에 두고 이웃 간격을 그대로 쌓는다.
  const positions: number[] = new Array<number>(n).fill(0);
  let at = 0;
  for (let i = 0; i < n; i += 1) {
    const idx = (cutAt + 1 + i) % n;
    positions[idx] = at;
    at += gaps[idx];
  }

  // 지켜진 쌍과 그 거리 — 편 자리에서 다시 재어 확인한다.
  const keptPairs: number[] = [];
  const keptDists: number[] = [];
  for (let k = 0; k < n; k += 1) {
    if (k === cutAt) continue;
    keptPairs.push(k);
    keptDists.push(Math.abs(positions[(k + 1) % n] - positions[k]));
  }

  const tornBefore = gaps[cutAt];
  const tornAfter = Math.abs(positions[(cutAt + 1) % n] - positions[cutAt]);
  const farBefore = distance(points[farA], points[farB]);
  const farAfter = Math.abs(positions[farA] - positions[farB]);

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
    await rctx.emit({ type: 'ring', payload: { gaps } });
    if (!(await gate())) return;

    await rctx.emit({ type: 'cut', payload: { a: cutAt, b: (cutAt + 1) % n } });
    if (!(await gate())) return;

    await rctx.emit({ type: 'unroll', payload: { positions } });
    if (!(await gate())) return;

    await rctx.emit({ type: 'kept', payload: { pairs: keptPairs, dists: keptDists } });
    if (!(await gate())) return;

    await rctx.emit({
      type: 'torn',
      payload: { before: tornBefore, after: tornAfter, ratio: tornAfter / tornBefore },
    });
    if (!(await gate())) return;

    await rctx.emit({
      type: 'far',
      payload: { a: farA, b: farB, before: farBefore, after: farAfter },
    });
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
