/**
 * dendrogramCut — 나무를 다 세운 뒤, 어디서 자르느냐로 무리 수가 정해진다.
 *
 * 여기에는 무리를 만드는 셈이 없다. 나무를 한 번 세워 놓고 그 다음부터는
 * **높이 하나를 고르는 일**만 한다. 가로선이 위아래로 미끄러지면서 지나는
 * 세로 가지의 수가 곧 그 높이에서의 무리 수다.
 *
 * ── 셈하는 것
 *   1. 점 여덟에서 단일 연결(두 무리 사이 거리 = 가장 가까운 두 점 사이 거리)로
 *      합침 일곱을 만든다. 합침 높이는 오름차순이 된다 (단일 연결은 역전이 없다).
 *   2. 높이 h 에서의 무리 수 = 잎의 수 − (h 보다 낮은 합침의 수). 표를 적어 두지
 *      않고 매번 이 식으로 센다.
 *   3. 가로대 사이의 빈 구간(연속한 두 합침 높이 사이)을 재고, 너비가 **평균보다
 *      넓은** 구간을 고른다. 그 자리에서 자른 답이 튼튼하다.
 *
 * ── 걸음
 *   나무 → (구간마다 대표 높이에서 자르며 아래에서 위로 미끄러진다) →
 *   넓은 구간 표시 → 그 안에서 끊기 → 끝
 *
 * ── 이벤트 (전부 이 facet 고유. silent 는 하나도 없다)
 *   tree-ready   { merges: { id, left, right, height }[]; topHeight: number }
 *                  나무가 다 자란 채로 나타난다. topHeight 는 높이 축의 위 끝
 *                  (데이터 단위이지 화면 좌표가 아니다).
 *   cut-moved    { height: number; clusters: number }
 *                  가로선이 그 높이로 미끄러진다. 스쳐 지나가는 걸음.
 *   gaps-marked  { bands: { lo: number; hi: number; clusters: number }[] }
 *                  가로대 사이가 넓게 빈 구간들이 드러난다.
 *   cut-settled  { height: number; clusters: number }
 *                  넓은 구간 안에 자리 잡고 실제로 끊는다.
 *   rewind       {}   되감아 처음 상태로.
 *   done         {}   끝.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DendrogramCutPoint = { id: string; x: number; y: number };

export type DendrogramCutData = {
  type: 'dendrogram-cut';
  /** 잎이 될 점들. 이름표가 곧 잎 id 다. */
  points: DendrogramCutPoint[];
  /** 걸음 간격 (S-piece — 읽을 시간은 저작 결정). */
  stepMs: number;
};

/** 합침 하나. left/right 는 잎 id 또는 앞선 합침의 id. */
export type DendrogramMerge = {
  id: string;
  left: string;
  right: string;
  height: number;
};

/** 높이 축의 위 끝을 뿌리에서 얼마나 띄울지. 뿌리 위는 열려 있어 끝을 정해야 한다. */
const TOP_MARGIN_RATIO = 1.2;

const DEFAULT_STEP_MS = 800;

function distance(a: DendrogramCutPoint, b: DendrogramCutPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

type WorkCluster = {
  id: string;
  members: DendrogramCutPoint[];
  /** 입력 차례의 가장 앞 자리. 두 자식 중 어느 쪽을 왼쪽에 둘지 정한다. */
  minIndex: number;
};

/**
 * 단일 연결 계층 군집화. 두 무리 사이의 거리는 가장 가까운 두 점 사이의 거리다.
 * 점이 여덟뿐이라 매번 다시 재는 O(n^3) 로 둔다.
 */
export function buildLinkage(points: DendrogramCutPoint[]): DendrogramMerge[] {
  let work: WorkCluster[] = points.map((p, i) => ({ id: p.id, members: [p], minIndex: i }));
  const merges: DendrogramMerge[] = [];

  while (work.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let best = Infinity;
    for (let i = 0; i < work.length; i += 1) {
      for (let j = i + 1; j < work.length; j += 1) {
        let d = Infinity;
        for (const p of work[i]!.members) {
          for (const q of work[j]!.members) d = Math.min(d, distance(p, q));
        }
        if (d < best) {
          best = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const a = work[bestI]!;
    const b = work[bestJ]!;
    const [left, right] = a.minIndex <= b.minIndex ? [a, b] : [b, a];
    const id = `m${merges.length + 1}`;
    merges.push({ id, left: left.id, right: right.id, height: best });
    const joined: WorkCluster = {
      id,
      members: [...a.members, ...b.members],
      minIndex: Math.min(a.minIndex, b.minIndex),
    };
    work = work.filter((_, k) => k !== bestI && k !== bestJ);
    work.push(joined);
  }

  return merges;
}

/** 높이 h 에서 자르면 무리가 몇인가 — h 보다 낮은 합침만큼 잎이 묶인다. */
function countClusters(leafCount: number, heights: number[], h: number): number {
  let merged = 0;
  for (const m of heights) if (m < h) merged += 1;
  return leafCount - merged;
}

function readData(data: DendrogramCutData): {
  points: DendrogramCutPoint[];
  stepMs: number;
} {
  const points = Array.isArray(data?.points) ? data.points : [];
  const stepMs = typeof data?.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : DEFAULT_STEP_MS;
  return { points, stepMs };
}

export const dendrogramCutAlgorithm = async (
  base: FacetContext<DendrogramCutData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<DendrogramCutData>;
  const { points, stepMs } = readData(ctx.data);
  if (points.length < 2) {
    throw new Error(`덴드로그램 절단: 잎이 모자란다 (점 ${points.length}개)`);
  }

  const merges = buildLinkage(points);
  const heights = merges.map((m) => m.height);
  const rootHeight = heights[heights.length - 1]!;
  const topHeight = rootHeight * TOP_MARGIN_RATIO;
  const leafCount = points.length;

  // 자를 자리 — 가로대 사이의 구간마다 한가운데를 대표로 삼는다. 구간의 수는
  // 나무가 정한다 (합침 하나가 구간 하나를 더한다). 사람이 적은 목록이 아니다.
  const stops: number[] = [];
  for (let i = 0; i <= heights.length; i += 1) {
    const lo = i === 0 ? 0 : heights[i - 1]!;
    const hi = i === heights.length ? topHeight : heights[i]!;
    stops.push((lo + hi) / 2);
  }

  // 가로대 사이의 빈 구간. 너비가 평균보다 넓은 것이 튼튼한 자리다.
  const spans = heights.slice(0, -1).map((lo, i) => ({ lo, hi: heights[i + 1]! }));
  const meanWidth = spans.reduce((sum, s) => sum + (s.hi - s.lo), 0) / Math.max(1, spans.length);
  const bands = spans
    .filter((s) => s.hi - s.lo > meanWidth)
    .map((s) => ({
      lo: s.lo,
      hi: s.hi,
      clusters: countClusters(leafCount, heights, (s.lo + s.hi) / 2),
    }));

  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
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

  /** 한 바퀴. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function play(): Promise<boolean> {
    // 첫 걸음은 문 없이 나간다 — 자동 재생이 빈 화면으로 시작하지 않게 하고,
    // 되감은 직후의 첫 `advance` 가 되감기만 하고 멎는 일도 없게 한다 (S-piece).
    await ctx.emit({ type: 'tree-ready', payload: { merges, topHeight } });

    for (const height of stops) {
      if (!(await gate())) return false;
      await ctx.emit({
        type: 'cut-moved',
        payload: { height, clusters: countClusters(leafCount, heights, height) },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'gaps-marked', payload: { bands } });

    for (const band of bands) {
      if (!(await gate())) return false;
      const height = (band.lo + band.hi) / 2;
      await ctx.emit({
        type: 'cut-settled',
        payload: { height, clusters: countClusters(leafCount, heights, height) },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: {} });
    return true;
  }

  try {
    if (!(await play())) return;
    manual = true;
    for (;;) {
      if (ctx.cancelled) return;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'advance') continue;
      await ctx.emit({ type: 'rewind', payload: {} });
      if (!(await play())) return;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
