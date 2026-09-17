/**
 * probeAFewCells — 무리 몇 개만 연다 (조각).
 *
 * 질문 하나: 가까워 보이는 칸만 뒤진다는 것이 화면에서 무슨 일인가.
 *
 * 평면은 이미 여러 칸으로 갈라져 있다. 질의에서 각 칸의 대표까지 재고, 가까운
 * 칸부터 뚜껑을 연다. 연 칸의 점만 실제로 견주고 안 연 칸의 점은 손도 대지
 * 않는다. 칸을 어떻게 나누는지(학습)도, 덜 열면 무엇을 놓치는지(재현율)도 이
 * 조각의 몫이 아니다 — 여기서 세는 것은 견준 점의 수뿐이다.
 *
 * 파생값은 전부 여기서 셈한다. 점이 어느 칸에 드는지도, 대표까지의 거리도,
 * 여는 차례도 좌표에서 나온다. 선언에 있는 1차 데이터는 점의 좌표 · 대표의
 * 좌표 · 질의의 좌표 · 열 칸 수뿐이다.
 *
 * 이벤트 (전부 facet 고유 확장. silent 인 것은 없다).
 *   — 여기 실리는 `cell` 과 `order` 는 **배열 색인이라 0 부터** 센다. 화면과 글은
 *     1 부터 세므로 장면을 그리는 자리에서 하나를 더한다. 같은 네 칸을 다루는
 *     완제품(`invertedFileIndex`)이 그 규약을 쓰고, 두 화면이 한 글에 나란히 놓일 때
 *     "칸 2" 가 서로 다른 칸을 가리키지 않게 하려는 것이다.
 *   — **싣는 것은 걸음이 내리는 판정뿐이다.** 세면 나오는 수(점의 총수 · 칸의 수 ·
 *     지금까지 견준 점 · 손대지 않은 점)와 두 점을 알면 재지는 값(질의에서 대표까지의
 *     거리 · 띠의 안팎 반지름)은 장면이 셈한다 (`scene.ts`).
 *   query-placed      {}
 *   cells-split       { counts: number[] }
 *   centroid-measured { cell: number }
 *   order-ranked      { order: number[] }
 *   cell-opened       { cell: number; members: number[] }
 *   probe-stopped     {}
 *   rewind            {}
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ProbeAFewCellsData = {
  type: string;
  /** 평면에 놓인 점. `[x, y]` */
  points: number[][];
  /** 칸마다 하나씩인 대표. `[x, y]` */
  centroids: number[][];
  /** 질의. `[x, y]` */
  query: number[];
  /** 몇 칸을 열지. 이것만은 데이터가 아니라 저작 결정이다. */
  nprobe: number;
  /** 걸음 사이에 쉬는 시간 (S-piece). */
  stepMs: number;
};

function distance(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** 점이 어느 칸에 드는지는 대표까지의 거리가 정한다. */
function assign(points: number[][], centroids: number[][]): number[][] {
  const members: number[][] = centroids.map(() => []);
  for (let i = 0; i < points.length; i += 1) {
    let best = 0;
    for (let c = 1; c < centroids.length; c += 1) {
      if (distance(points[i], centroids[c]) < distance(points[i], centroids[best])) best = c;
    }
    members[best].push(i);
  }
  return members;
}

export async function probeAFewCellsAlgorithm(
  rawCtx: FacetContext<ProbeAFewCellsData>,
): Promise<void> {
  const ctx = rawCtx as ReactiveContext<ProbeAFewCellsData>;
  const { points, centroids, query, stepMs } = ctx.data;

  const members = assign(points, centroids);
  const counts = members.map((m) => m.length);
  const dists = centroids.map((c) => distance(query, c));
  // 여는 차례는 잰 거리가 정한다. 사람이 적은 걸음표가 아니다.
  // 거리가 같으면 **번호가 앞선 칸**을 먼저 연다. 지금 데이터에는 동점이 없지만
  // (4.95 · 5.45 · 5.47 · 5.87), 정해 두지 않으면 대표를 손대는 순간 실행마다
  // 다른 차례가 나온다.
  const order = centroids.map((_, i) => i).sort((a, b) => dists[a] - dists[b] || a - b);
  const nprobe = Math.max(1, Math.min(ctx.data.nprobe, centroids.length));

  /** 자동 재생을 마친 뒤부터는 걸음마다 단추를 기다린다. */
  let manual = false;
  /** 한 바퀴의 첫 걸음은 문을 지나지 않는다 — 앞걸음이 없으므로 (S-piece). */
  let first = true;

  /** 걸음 사이의 문. 자동이면 쉬는 시간, 수동이면 단추 하나. */
  const gate = async (): Promise<boolean> => {
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      try {
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return false;
        if (input.type !== 'advance') continue;
        return true;
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다 (C8 정본).
        if (!ctx.cancelled) throw err;
        return false;
      }
    }
  };

  const step = async (emit: () => Promise<void>): Promise<boolean> => {
    if (!first && !(await gate())) return false;
    first = false;
    if (ctx.cancelled) return false;
    await emit();
    return !ctx.cancelled;
  };

  for (;;) {
    first = true;

    // 질의가 평면에 내려앉는다. 점이 몇인지는 바탕을 세면 나온다.
    if (!(await step(() => ctx.emit({ type: 'query-placed' })))) return;

    // 평면은 이미 갈라져 있다 — 칸마다 대표가 하나씩.
    if (!(await step(() => ctx.emit({
      type: 'cells-split',
      payload: { counts },
    })))) return;

    // 대표까지 잰다. 칸을 도는 것이지 걸음을 적어 둔 것이 아니다. 잰 값은 싣지
    // 않는다 — 질의와 대표를 이미 알고 있으므로 자로 재는 일은 장면의 몫이다.
    for (let c = 0; c < centroids.length; c += 1) {
      const cell = c;
      if (!(await step(() => ctx.emit({
        type: 'centroid-measured',
        payload: { cell },
      })))) return;
    }

    // 잰 값이 엇비슷하다는 것 자체가 이 조각의 장치다. 띠의 안팎은 이 차례의 양
    // 끝을 재면 나오므로, 여기서 싣는 것은 **고른 차례**뿐이다.
    if (!(await step(() => ctx.emit({
      type: 'order-ranked',
      payload: { order },
    })))) return;

    // 가까운 칸부터 연다. 연 칸의 점만 실제로 견준다.
    for (let r = 0; r < nprobe; r += 1) {
      const cell = order[r];
      if (!(await step(() => ctx.emit({
        type: 'cell-opened',
        payload: { cell, members: members[cell] },
      })))) return;
    }

    // 멈춘다. 남은 칸은 닫힌 채이고 그 안의 점은 손도 대지 않았다. 연 칸 수도
    // 견준 점 수도 손대지 않은 점 수도 전부 자취를 세면 나온다.
    if (!(await step(() => ctx.emit({ type: 'probe-stopped' })))) return;

    // 한 바퀴가 끝났다. 다음 단추를 받으면 되감고 첫 걸음까지 간다 (S-piece).
    manual = true;
    if (!(await gate())) return;
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;
  }
}
