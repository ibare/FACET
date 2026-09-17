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
 *   2. 가로대 사이의 구간마다 한가운데를 대표 높이로 삼아 아래에서 위로 훑는다.
 *   3. 가로대 사이의 빈 구간(연속한 두 합침 높이 사이)을 재고, 너비가 **평균보다
 *      넓은** 구간을 고른다. 그 자리에서 자른 답이 튼튼하다.
 *
 *   무리 수는 여기서 세지 않는다. 자른 높이에 걸린 세로 가지를 세면 나오는 수라
 *   그림을 그리는 쪽이 같은 나무에서 센다.
 *
 * ── 걸음
 *   나무 → (구간마다 대표 높이에서 자르며 아래에서 위로 미끄러진다) →
 *   넓은 구간 표시 → 그 안에서 끊기 → 끝
 *
 * ── 이벤트 (전부 이 facet 고유. silent 는 하나도 없다)
 *   tree-ready   { merges: { id, left, right, height }[] }
 *                  나무가 다 자란 채로 나타난다. 합침 목록이 곧 나무이고,
 *                  높이 축의 위 끝도 거기서 나온다 (`topHeightOf`).
 *   cut-moved    { height: number }
 *                  가로선이 그 높이로 미끄러진다. 스쳐 지나가는 걸음.
 *   gaps-marked  {}
 *                  가로대 사이가 넓게 빈 구간들이 드러난다. 어느 구간이 넓은지는
 *                  나무에서 나오므로 싣지 않는다 (`wideBandsOf`).
 *   cut-settled  { height: number }
 *                  넓은 구간 안에 자리 잡고 실제로 끊는다.
 *   rewind       {}   되감아 처음 상태로.
 *   done         {}   끝.
 *
 * ── 싣는 것과 싣지 않는 것
 *
 * **자를 높이만 싣는다.** 그 자리를 고르는 것이 이 조각의 주장 자체라 걸음이
 * 내리는 판정이다. 반대로 **무리 수는 싣지 않는다** — 자른 높이 위에 걸린 세로
 * 가지를 세면 나오는 수이고, 띠도 이름표 밑 괄호도 같은 셈에서 나온다. 실어
 * 보내면 화면의 나무와 화면의 수가 다른 출처가 된다.
 *
 * 높이 축의 위 끝과 넓은 구간은 **합침 목록만 있으면 나오는 값**이라 함수를
 * 내주고 장면이 부른다 — 여기와 저기가 같은 함수를 지나므로 갈릴 자리가 없다.
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

/**
 * 높이 축의 위 끝. 데이터 단위이지 화면 좌표가 아니다.
 *
 * 뿌리 위는 열려 있어 어딘가에서 끊어야 하는데, 그 끝은 나무가 정한다. 자를
 * 자리를 훑는 이 파일과 축을 그리는 장면이 **같은 함수**를 지나야 눈금과 가로선이
 * 어긋나지 않는다.
 */
export function topHeightOf(merges: readonly DendrogramMerge[]): number {
  const root = merges[merges.length - 1];
  return root === undefined ? 1 : root.height * TOP_MARGIN_RATIO;
}

/**
 * 가로대 사이가 넓게 빈 구간들. 너비가 평균을 넘는 것을 넓다고 본다.
 *
 * 술어 하나라 내준다 — 이 함수를 떼어 내도 "어디서 자르느냐가 무리 수를 정한다"
 * 는 주장은 그대로 선다. 무리 수는 여기서 세지 않는다. 그것은 나무와 높이만
 * 있으면 장면이 세는 수다.
 */
export function wideBandsOf(
  merges: readonly DendrogramMerge[],
): { lo: number; hi: number }[] {
  const heights = merges.map((m) => m.height);
  const spans = heights.slice(0, -1).map((lo, i) => ({ lo, hi: heights[i + 1]! }));
  if (spans.length === 0) return [];
  const meanWidth = spans.reduce((sum, s) => sum + (s.hi - s.lo), 0) / spans.length;
  return spans.filter((s) => s.hi - s.lo > meanWidth);
}

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
  const topHeight = topHeightOf(merges);

  // 자를 자리 — 가로대 사이의 구간마다 한가운데를 대표로 삼는다. 구간의 수는
  // 나무가 정한다 (합침 하나가 구간 하나를 더한다). 사람이 적은 목록이 아니다.
  const stops: number[] = [];
  for (let i = 0; i <= heights.length; i += 1) {
    const lo = i === 0 ? 0 : heights[i - 1]!;
    const hi = i === heights.length ? topHeight : heights[i]!;
    stops.push((lo + hi) / 2);
  }

  // 넓게 빈 구간. 장면이 그리는 것과 같은 함수를 지난다.
  const bands = wideBandsOf(merges);

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
    await ctx.emit({ type: 'tree-ready', payload: { merges } });

    for (const height of stops) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'cut-moved', payload: { height } });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'gaps-marked', payload: {} });

    for (const band of bands) {
      if (!(await gate())) return false;
      const height = (band.lo + band.hi) / 2;
      await ctx.emit({ type: 'cut-settled', payload: { height } });
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
