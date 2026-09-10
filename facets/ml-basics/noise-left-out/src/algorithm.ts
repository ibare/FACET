/**
 * 잡음점 — 어디에도 안 붙는 것은 남긴다.
 *
 * 질문: 어느 무리에도 속하지 않는 점은 어떻게 하는가.
 *
 * 같은 열여섯 점에 두 방법을 건다. 밀도로 묶으면 번짐이 멎은 자리에 닿지 않은
 * 것들이 그대로 남고, 가운데를 정하고 가까운 쪽에 붙이면 아무리 멀어도 전부
 * 어딘가에 든다. "이 점은 어느 무리도 아니다" 가 하나의 대답이라는 말은,
 * 그 대답을 못 하는 방법과 나란히 놓아야 선다.
 *
 * 화면에 뜨는 수 — 이웃 수 · 무리 크기 · 뻗은 거리 · eps 의 몇 배 — 는 전부
 * 여기서 좌표로부터 셈한다. 선언에는 점과 두 손잡이(eps · minPts · 시작 중심)만
 * 있다.
 *
 * ── 이벤트 어휘 (facet 고유. 표준 어휘는 `done` 하나뿐) ──────────────────
 *
 *  points-placed      { count: number }
 *      점을 놓는다. 마운트 직후의 첫 걸음이라 문(gate)을 지나지 않는다.
 *  radius-shown       { eps: number; minPts: number; counts: number[] }
 *      점마다 이웃 반지름을 편다. counts[i] 는 그 안에 든 점의 수 (자기 포함).
 *  cores-marked       { core: number[]; sparse: number[]; minPts: number }
 *      문턱을 넘은 점(속)과 못 넘은 점을 가른다.
 *  spread-advanced    { cluster: number; edges: [number, number][] }
 *      번짐 한 물결. edges 는 이번 물결에서 새로 이어진 [속, 새 점] 쌍이다.
 *      물결의 수와 순서는 이웃 그래프가 정한다 — 사람이 적은 걸음표가 아니다.
 *  spread-halted      { sizes: number[]; border: { index: number; cluster: number }[] }
 *      번짐이 멎었다. sizes 는 무리별 크기, border 는 속이 아닌 채 무리에 든
 *      가장자리 점과 그 무리 번호.
 *  left-out-listed    { items: { index: number; x: number; y: number; neighbors: number }[] }
 *      어느 번짐도 닿지 않은 점들. 이 조각의 주인공이다.
 *  nearest-begun      { k: number; seeds: { x: number; y: number }[] }
 *      두 번째 방법을 건다. 시작 중심을 놓는다.
 *  centroids-settled  { centroids: { x: number; y: number }[]; rounds: number }
 *      중심이 자리를 잡는다. rounds 는 배정을 다시 매긴 횟수.
 *  stray-claimed      { index: number; cluster: number; dist: number; ratio: number;
 *                       anchor: number; rank: number; total: number; remaining: number }
 *      남았던 점 하나가 무리에 든다. dist 는 그 무리의 덩이 점 가운데 가장
 *      가까운 것까지의 거리, ratio 는 그것이 eps 의 몇 배인지, anchor 는 그
 *      가장 가까운 점의 인덱스, remaining 은 아직 남은 수. 거리 오름차순으로
 *      온다 — 가장 먼 것이 마지막에 와서 논증을 맺는다.
 *  done               { densityLeft: number; nearestLeft: number }
 *      두 방법이 각각 남긴 수.
 *  rewind             {}
 *      자동 재생이 끝난 뒤 `advance` 로 처음으로 돌아간다 (S-piece).
 *
 * silent 이벤트는 없다. 전부 화면을 바꾼다.
 * `ctx.metric` 은 부르지 않는다 (S-piece — 조각은 셀 것이 없다).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NoisePoint = { x: number; y: number };

export type NoiseLeftOutData = {
  type: 'noise-left-out';
  /** 점 열여섯. 그림에서의 자리는 stage 가 이 좌표에서 역산한다. */
  points: NoisePoint[];
  /** 이웃이라 부를 거리. */
  eps: number;
  /** 속이 되는 문턱 — 자기 자신을 셈에 넣는다. */
  minPts: number;
  /** 가까운 쪽에 붙이기의 시작 중심. */
  seeds: NoisePoint[];
  /** 걸음 간격 (S-piece — 읽을 시간은 저작 결정). */
  stepMs: number;
};

/** 배정이 흔들리지 않아도 도는 것을 막는 상한. 이 자료는 셋에서 멎는다. */
const MAX_ROUNDS = 32;

function dist(a: NoisePoint, b: NoisePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 점마다 eps 안에 든 점의 인덱스 (자기 자신 포함). */
function neighborhoods(points: NoisePoint[], eps: number): number[][] {
  return points.map((p) =>
    points.reduce<number[]>((acc, q, j) => {
      if (dist(p, q) <= eps) acc.push(j);
      return acc;
    }, []),
  );
}

type Wave = { cluster: number; edges: [number, number][] };

type DensityResult = {
  counts: number[];
  core: number[];
  sparse: number[];
  waves: Wave[];
  members: number[][];
  border: { index: number; cluster: number }[];
  leftOut: number[];
};

/**
 * 밀도로 묶기. 속에서 속으로만 번지고, 속이 아닌 점은 닿으면 들어오되 더
 * 번지지는 않는다. 끝내 아무 번짐도 닿지 않은 점이 남는 것 — 그것이 이 방법의
 * 대답이다.
 */
function densityGroups(points: NoisePoint[], eps: number, minPts: number): DensityResult {
  const nb = neighborhoods(points, eps);
  const counts = nb.map((n) => n.length);
  const isCore = counts.map((n) => n >= minPts);

  const UNSEEN = -1;
  const label = points.map(() => UNSEEN);
  const waves: Wave[] = [];
  const members: number[][] = [];

  for (let seed = 0; seed < points.length; seed += 1) {
    if (label[seed] !== UNSEEN || !isCore[seed]) continue;
    const cluster = members.length;
    label[seed] = cluster;
    const mine = [seed];
    let front = [seed];
    while (front.length > 0) {
      const edges: [number, number][] = [];
      const next: number[] = [];
      for (const a of front) {
        if (!isCore[a]) continue; // 속이 아닌 점은 번짐을 잇지 않는다
        for (const b of nb[a]) {
          if (label[b] !== UNSEEN) continue;
          label[b] = cluster;
          mine.push(b);
          edges.push([a, b]);
          next.push(b);
        }
      }
      if (edges.length > 0) waves.push({ cluster, edges });
      front = next;
    }
    members.push(mine);
  }

  const core: number[] = [];
  const sparse: number[] = [];
  const border: { index: number; cluster: number }[] = [];
  const leftOut: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (isCore[i]) core.push(i);
    else sparse.push(i);
    if (label[i] === UNSEEN) leftOut.push(i);
    else if (!isCore[i]) border.push({ index: i, cluster: label[i] });
  }

  return { counts, core, sparse, waves, members, border, leftOut };
}

function nearestCentroid(centroids: NoisePoint[], p: NoisePoint): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < centroids.length; k += 1) {
    const d = dist(centroids[k], p);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

type NearestResult = { centroids: NoisePoint[]; assign: number[]; rounds: number };

/** 가까운 쪽에 붙이기. 아무리 멀어도 어딘가에는 든다 — 남기는 길이 없다. */
function nearestGroups(points: NoisePoint[], seeds: NoisePoint[]): NearestResult {
  let centroids = seeds.map((s) => ({ x: s.x, y: s.y }));
  let assign = points.map(() => -1);
  let rounds = 0;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const next = points.map((p) => nearestCentroid(centroids, p));
    const moved = next.some((v, i) => v !== assign[i]);
    assign = next;
    rounds = round + 1;
    centroids = centroids.map((cur, k) => {
      const mine = points.filter((_, i) => assign[i] === k);
      if (mine.length === 0) return cur;
      const sx = mine.reduce((s, p) => s + p.x, 0);
      const sy = mine.reduce((s, p) => s + p.y, 0);
      return { x: sx / mine.length, y: sy / mine.length };
    });
    if (!moved) break;
  }

  return { centroids, assign, rounds };
}

type Claim = {
  index: number;
  cluster: number;
  dist: number;
  ratio: number;
  anchor: number;
  rank: number;
  total: number;
  remaining: number;
};

/**
 * 남았던 점마다 "들어간 무리의 덩이 점 가운데 가장 가까운 것" 까지의 거리를 잰다.
 * 중심까지의 거리가 아니라 이것을 재는 까닭은, 그 수가 eps 와 같은 자로 견줄 수
 * 있는 유일한 수이기 때문이다 — 이웃이라 부르는 거리와 실제로 뻗은 거리.
 */
function claimsOf(
  points: NoisePoint[],
  leftOut: number[],
  assign: number[],
  eps: number,
): Claim[] {
  const settled = points.map((_, i) => i).filter((i) => !leftOut.includes(i));
  const rows = leftOut.map((index) => {
    const cluster = assign[index];
    const pool = settled.filter((i) => assign[i] === cluster);
    const from = pool.length > 0 ? pool : settled;
    let anchor = from[0];
    let best = Infinity;
    for (const i of from) {
      const d = dist(points[index], points[i]);
      if (d < best) {
        best = d;
        anchor = i;
      }
    }
    return { index, cluster, dist: best, ratio: best / eps, anchor };
  });

  rows.sort((a, b) => a.dist - b.dist);
  return rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    total: rows.length,
    remaining: rows.length - (i + 1),
  }));
}

export async function noiseLeftOutAlgorithm(
  ctx: FacetContext<NoiseLeftOutData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<NoiseLeftOutData>;
  const { points, eps, minPts, seeds, stepMs } = rc.data;

  const density = densityGroups(points, eps, minPts);
  const nearest = nearestGroups(points, seeds);
  const claims = claimsOf(points, density.leftOut, nearest.assign, eps);

  /** 자동 재생을 마치면 참이 된다. 그 뒤로는 `advance` 가 걸음을 민다. */
  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  }

  /** 한 바퀴. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function play(): Promise<boolean> {
    // 첫 걸음은 문을 지나지 않는다 — 앞에 기다릴 걸음이 없다 (S-piece).
    await rc.emit({ type: 'points-placed', payload: { count: points.length } });

    if (!(await gate())) return false;
    await rc.emit({ type: 'radius-shown', payload: { eps, minPts, counts: density.counts } });

    if (!(await gate())) return false;
    await rc.emit({
      type: 'cores-marked',
      payload: { core: density.core, sparse: density.sparse, minPts },
    });

    for (const wave of density.waves) {
      if (!(await gate())) return false;
      await rc.emit({
        type: 'spread-advanced',
        payload: { cluster: wave.cluster, edges: wave.edges },
      });
    }

    if (!(await gate())) return false;
    await rc.emit({
      type: 'spread-halted',
      payload: { sizes: density.members.map((m) => m.length), border: density.border },
    });

    if (!(await gate())) return false;
    await rc.emit({
      type: 'left-out-listed',
      payload: {
        items: density.leftOut.map((index) => ({
          index,
          x: points[index].x,
          y: points[index].y,
          neighbors: density.counts[index],
        })),
      },
    });

    if (!(await gate())) return false;
    await rc.emit({ type: 'nearest-begun', payload: { k: seeds.length, seeds } });

    if (!(await gate())) return false;
    await rc.emit({
      type: 'centroids-settled',
      payload: { centroids: nearest.centroids, rounds: nearest.rounds },
    });

    for (const claim of claims) {
      if (!(await gate())) return false;
      await rc.emit({ type: 'stray-claimed', payload: { ...claim } });
    }

    if (!(await gate())) return false;
    await rc.emit({
      type: 'done',
      payload: {
        densityLeft: density.leftOut.length,
        // 배정을 못 받은 점의 수. 이 방법에는 그런 자리가 없어 언제나 0 이지만,
        // 화면에 뜨는 수라 지어 넣지 않고 결과에서 센다.
        nearestLeft: nearest.assign.filter((a) => a < 0).length,
      },
    });
    return !rc.cancelled;
  }

  try {
    if (!(await play())) return;
    manual = true;
    for (;;) {
      if (rc.cancelled) return;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      if (rc.cancelled) return;
      await rc.emit({ type: 'rewind', payload: {} });
      if (!(await play())) return;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!rc.cancelled) throw err;
  }
}
