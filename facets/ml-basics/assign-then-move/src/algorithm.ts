/**
 * assignThenMove — 붙는 몸짓과 옮기는 몸짓이 번갈아 도는 한 걸음 (k-평균).
 *
 * 무리의 가운데가 어디인지 모른 채 시작한다. 점이 가장 가까운 중심에 붙고,
 * 중심은 저에게 붙은 것들의 가운데로 옮겨 간다. 옮겨 갔으니 붙는 자리가
 * 달라지고, 그러면 또 옮겨 간다. **번갈아 도는 것 자체가 이 알고리즘이다.**
 * 아무도 안 움직이면 멎고, 멎는 것이 곧 답을 찾았다는 신호다.
 *
 * ── 이벤트 (표준 어휘는 `done` 뿐이고 나머지 셋은 이 facet 고유다. C2)
 *
 * **싣는 것은 판정 둘뿐이다.** 구조에서 세지는 것(몇 회째인가 · 무리 크기 · 옮긴
 * 거리 · 멎었는가)은 장면이 센다 — 두 자리에서 세면 화면이 제 안에서 갈린다
 * (`scene.ts` 머리, 프로토콜 4 절).
 *
 *   points-attach   { assign: number[] }
 *                   붙는 몸짓. `assign[i]` 는 점 i 가 붙은 중심의 번호다. 가장
 *                   가까운 중심을 가리는 것이 거리 셈이라 걸음의 판정이다.
 *                   silent 아님.
 *
 *   centroids-move  { to: { x: number; y: number }[] }
 *                   옮기는 몸짓. `to[c]` 는 중심 c 가 옮겨 갈 자리, 곧 저에게 붙은
 *                   점들의 평균이다. 그 평균이 이 조각의 알고리즘 그 자체라 내주지
 *                   않고 자리를 싣는다. 옮긴 거리는 자취의 두 칸 사이라 싣지 않는다.
 *                   silent 아님.
 *
 *   rewind          {}
 *                   자동 재생이 끝난 뒤 `advance` 를 받아 처음으로 되감는다.
 *                   silent 아님 (화면이 첫 상태로 돌아간다).
 *
 *   done            {}
 *                   멎었다. 돈 횟수도 아무도 안 움직였는지도 자취에 이미 있으므로
 *                   (`ASSIGN_SETTLE_EPS` 를 내준다) 실을 것이 없다.
 *                   silent 아님.
 *
 * 메트릭은 없다 (조각이므로 `ctx.metric` 을 부르지 않는다 — S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type AssignThenMovePoint = { x: number; y: number };

export type AssignThenMoveData = {
  type: string;
  /** 흩어진 점들. 화면 좌표가 아니라 데이터 좌표다 (배치는 stage 가 셈한다). */
  points: AssignThenMovePoint[];
  /** 중심의 출발 자리. 일부러 어느 덩이에도 맞지 않는 곳에 놓는다. */
  seeds: AssignThenMovePoint[];
  /** 걸음 사이의 간격. 읽을 시간을 주는 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 옮긴 거리가 이보다 작으면 멎은 것으로 본다.
 *
 * **잣대를 한 군데로 모으려고 내준다** — 장면도 마지막 회의 거리를 이 값으로 재어
 * "멎었다" 를 판정한다. 두 군데에 적으면 화면과 결론이 갈린다 (프로토콜 4 절).
 */
export const ASSIGN_SETTLE_EPS = 1e-9;

/**
 * 돌 수 있는 횟수의 상한.
 *
 * k-평균은 유한 번에 멎지만 조각이 영영 도는 일은 없어야 하므로 문을 하나 둔다.
 * 이 데이터는 3회에 멎으므로 상한에 닿지 않는다.
 */
const MAX_ROUNDS = 4;

/** 점 p 에 가장 가까운 중심의 번호. 같은 거리면 앞 번호가 이긴다. */
function nearestIndex(p: AssignThenMovePoint, centers: AssignThenMovePoint[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < centers.length; i += 1) {
    const c = centers[i];
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 중심 c 에 붙은 점들의 가운데. 아무도 안 붙었으면 제자리에 머문다. */
function centerOfMembers(
  points: AssignThenMovePoint[],
  assign: number[],
  which: number,
  fallback: AssignThenMovePoint,
): AssignThenMovePoint {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < points.length; i += 1) {
    if (assign[i] !== which) continue;
    sx += points[i].x;
    sy += points[i].y;
    n += 1;
  }
  if (n === 0) return { x: fallback.x, y: fallback.y };
  return { x: sx / n, y: sy / n };
}

export async function assignThenMoveAlgorithm(
  base: FacetContext<AssignThenMoveData>,
): Promise<void> {
  const ctx = base as ReactiveContext<AssignThenMoveData>;
  const { points, seeds, stepMs } = ctx.data;

  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('assignThenMove: initialData.points 가 비어 있다');
  }
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new Error('assignThenMove: initialData.seeds 가 비어 있다');
  }
  if (!Number.isFinite(stepMs)) {
    throw new Error(`assignThenMove: initialData.stepMs 가 수가 아니다: ${String(stepMs)}`);
  }

  /** 자동 재생을 마쳤는가. 마친 뒤로는 한 걸음씩 눌러 짚는다. */
  let manual = false;
  /** 되감기 직후의 첫 문. 한 번은 그냥 통과시킨다 (S-piece). */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await ctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /** 붙기와 옮기기를 번갈아 돌린다. 끝까지 돌았으면 true, 취소됐으면 false. */
  async function sweep(): Promise<boolean> {
    const centers = seeds.map((s) => ({ x: s.x, y: s.y }));

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (!(await gate())) return false;
      const assign = points.map((p) => nearestIndex(p, centers));
      await ctx.emit({ type: 'points-attach', payload: { assign } });

      if (!(await gate())) return false;
      const to = centers.map((c, i) => centerOfMembers(points, assign, i, c));
      await ctx.emit({ type: 'centroids-move', payload: { to } });

      // 멎었는지는 옮기기 전과 뒤를 견주어 안다. 장면도 같은 잣대로 같은 두 자리를 잰다.
      const settled = to.every(
        (t, i) => Math.hypot(t.x - centers[i].x, t.y - centers[i].y) < ASSIGN_SETTLE_EPS,
      );
      for (let i = 0; i < centers.length; i += 1) centers[i] = to[i];
      if (settled) break;
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
    return true;
  }

  try {
    if (!(await sweep())) return;
    for (;;) {
      if (ctx.cancelled) return;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'advance') continue;
      manual = true;
      freeGate = true;
      await ctx.emit({ type: 'rewind' });
      if (!(await sweep())) return;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
