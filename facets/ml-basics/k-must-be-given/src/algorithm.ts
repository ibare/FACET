/**
 * 군집 수 선택 — 같은 점 무리를 k 를 바꿔 가며 돌린다.
 *
 * 열두 점을 k=2 · 3 · 4 로 각각 돌리고, 그때마다 나온 답과 흩어짐 합을 발신한다.
 * 답은 매번 다르고 매번 그럴듯하다. 흩어짐 합은 k 가 커질수록 늘 줄어들어
 * 고르는 잣대가 되어 주지 못한다 — 이 자료에서는 줄어드는 폭조차 꺾이지 않는다.
 *
 * 시작 중심은 **가장 먼 점부터** 고른다. 첫 점에서 시작해, 이미 고른 중심들에서
 * 가장 멀리 떨어진 점을 차례로 더한다. 무작위가 아니므로 같은 k 는 늘 같은 답을 낸다.
 *
 * 무리 번호는 **중심의 자리**로 매긴다 (아래쪽 먼저, 같으면 왼쪽 먼저). Lloyd 의
 * 내부 번호는 시작 중심을 고른 차례에 따라 뒤바뀌는데, 그 번호가 화면의 색과 칸
 * 순서를 정하면 k 를 바꿀 때마다 뜻 없이 색이 뒤집힌다.
 *
 * ── 이벤트 (표준 어휘는 `done` 뿐이고 나머지는 이 facet 고유다, C2)
 *
 *   points-placed   { scatterMax: number }
 *                   점 열둘을 놓는다. scatterMax 는 앞으로 나올 흩어짐 합의
 *                   최대값 — 화면이 세로 눈금을 마운트 뒤 한 번만 정하도록 준다.
 *   k-chosen        { k: number; seeds: number[] }
 *                   k 를 정하고 시작 중심을 고른다. seeds 는 고른 차례대로의 점 번호.
 *   split-settled   { k: number; assign: number[]; sizes: number[];
 *                     centers: { x: number; y: number }[]; scatter: number }
 *                   무리가 갈려 자리를 잡았다. assign[i] 는 i 번 점이 든 무리 번호,
 *                   sizes[j] 는 j 번 무리의 크기, scatter 는 흩어짐 합.
 *   elbow-tested    { drops: number[] }
 *                   흩어짐 합이 걸음마다 줄어든 폭. 길이는 k 의 수보다 하나 적다.
 *   no-kink         (payload 없음) 줄어드는 폭이 꺾이지 않는다는 판정.
 *   all-alive       (payload 없음) 세 답을 한 화면에 겹쳐 남긴다.
 *   rewind          (payload 없음) 한 걸음씩 되짚기 위해 처음으로 돌린다.
 *   done            (payload 없음) 자동 재생이 끝났다.
 *
 * silent 는 쓰지 않는다 — 모든 걸음이 화면을 바꾼다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KMustBeGivenData = {
  type: string;
  /** 점 열둘. [x, y] 쌍. */
  points: Array<[number, number]>;
  /** 돌려 볼 군집 수. */
  ks: number[];
  /** 걸음 간격 (ms). */
  stepMs: number;
};

type Pt = { x: number; y: number };

/** 한 k 를 돌린 결과. */
export type KMeansRun = {
  k: number;
  /** 시작 중심으로 고른 점 번호 (고른 차례대로). */
  seeds: number[];
  /** assign[i] = i 번 점이 든 무리 번호. */
  assign: number[];
  /** sizes[j] = j 번 무리의 크기. */
  sizes: number[];
  centers: Pt[];
  /** 각 점에서 제 중심까지 거리의 제곱을 다 더한 값. */
  scatter: number;
};

/** Lloyd 반복의 상한. 열두 점이면 두세 바퀴에 멎는다. */
const MAX_ROUNDS = 40;

function sqDist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** 첫 점에서 시작해, 이미 고른 것들에서 가장 먼 점을 차례로 더한다. */
function seedFarthest(pts: Pt[], k: number): number[] {
  const chosen: number[] = [0];
  while (chosen.length < k && chosen.length < pts.length) {
    let pick = -1;
    let widest = -1;
    for (let i = 0; i < pts.length; i += 1) {
      if (chosen.includes(i)) continue;
      let nearest = Infinity;
      for (const j of chosen) nearest = Math.min(nearest, sqDist(pts[i], pts[j]));
      if (nearest > widest) {
        widest = nearest;
        pick = i;
      }
    }
    if (pick < 0) break;
    chosen.push(pick);
  }
  return chosen;
}

/** 각 점을 가장 가까운 중심에 붙인다. 같은 거리면 앞 번호가 이긴다. */
function assignToNearest(pts: Pt[], centers: Pt[]): number[] {
  return pts.map((p) => {
    let pick = 0;
    let best = Infinity;
    for (let j = 0; j < centers.length; j += 1) {
      const d = sqDist(p, centers[j]);
      if (d < best) {
        best = d;
        pick = j;
      }
    }
    return pick;
  });
}

/** 무리마다 무게중심을 다시 잡는다. 빈 무리는 옛 중심을 지킨다. */
function recentre(pts: Pt[], assign: number[], previous: Pt[]): Pt[] {
  return previous.map((old, j) => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let i = 0; i < pts.length; i += 1) {
      if (assign[i] !== j) continue;
      sx += pts[i].x;
      sy += pts[i].y;
      n += 1;
    }
    return n === 0 ? old : { x: sx / n, y: sy / n };
  });
}

/** 무리 번호를 중심의 자리 순으로 다시 매긴다 (아래 먼저, 같으면 왼쪽 먼저). */
function reorderByPlace(assign: number[], centers: Pt[]): { assign: number[]; centers: Pt[] } {
  const order = centers
    .map((_, j) => j)
    .sort((a, b) => (centers[a].y !== centers[b].y ? centers[a].y - centers[b].y : centers[a].x - centers[b].x));
  const rank = new Array<number>(centers.length).fill(0);
  order.forEach((j, r) => {
    rank[j] = r;
  });
  return {
    assign: assign.map((j) => rank[j]),
    centers: order.map((j) => centers[j]),
  };
}

/** 한 k 를 끝까지 돌린다. 시작 중심이 정해져 있으므로 같은 k 는 늘 같은 답이다. */
export function runKMeans(pts: Pt[], k: number): KMeansRun {
  const seeds = seedFarthest(pts, k);
  let centers: Pt[] = seeds.map((i) => ({ x: pts[i].x, y: pts[i].y }));
  let assign = assignToNearest(pts, centers);
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const moved = recentre(pts, assign, centers);
    const next = assignToNearest(pts, moved);
    const settled = next.every((v, i) => v === assign[i]);
    centers = moved;
    assign = next;
    if (settled) break;
  }
  const placed = reorderByPlace(assign, centers);
  const sizes = new Array<number>(centers.length).fill(0);
  for (const j of placed.assign) sizes[j] += 1;
  let scatter = 0;
  for (let i = 0; i < pts.length; i += 1) scatter += sqDist(pts[i], placed.centers[placed.assign[i]]);
  return { k, seeds, assign: placed.assign, sizes, centers: placed.centers, scatter };
}

/** 이웃한 k 사이에서 흩어짐 합이 줄어든 폭. */
function dropsBetween(runs: KMeansRun[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < runs.length; i += 1) out.push(runs[i - 1].scatter - runs[i].scatter);
  return out;
}

export const kMustBeGivenAlgorithm = async (base: FacetContext<KMustBeGivenData>): Promise<void> => {
  const ctx = base as ReactiveContext<KMustBeGivenData>;
  const points: Pt[] = ctx.data.points.map(([x, y]) => ({ x, y }));
  const runs = ctx.data.ks.map((k) => runKMeans(points, k));
  const drops = dropsBetween(runs);
  const scatterMax = runs.reduce((m, r) => Math.max(m, r.scatter), 0);
  const stepMs = ctx.data.stepMs;

  /** 자동 재생이 끝나고 한 걸음씩 되짚는 중인가. */
  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await ctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /**
   * 처음부터 끝까지 한 회. 끝까지 갔으면 true, 도중에 취소됐으면 false.
   *
   * 문은 발신 **뒤**에 둔다. 그래야 마운트 직후와 되감기 직후에 첫 걸음이
   * 곧바로 나가고, 한 걸음 단추의 첫 누름이 되감기만 하고 멎지 않는다 (S-piece).
   */
  async function play(): Promise<boolean> {
    await ctx.emit({ type: 'points-placed', payload: { scatterMax } });
    for (const run of runs) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'k-chosen', payload: { k: run.k, seeds: run.seeds } });
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'split-settled',
        payload: {
          k: run.k,
          assign: run.assign,
          sizes: run.sizes,
          centers: run.centers,
          scatter: run.scatter,
        },
      });
    }
    if (!(await gate())) return false;
    await ctx.emit({ type: 'elbow-tested', payload: { drops } });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'no-kink' });
    if (!(await gate())) return false;
    await ctx.emit({ type: 'all-alive' });
    return true;
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await play())) return;
      await ctx.emit({ type: 'done' });
      manual = true;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (input.type !== 'advance') continue;
        break;
      }
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
