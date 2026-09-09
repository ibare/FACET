/**
 * impurityDrops — 불순도 감소. "잘 갈랐다" 를 무엇으로 재는가.
 *
 * 섞임을 수 하나로 재고(지니), 가를 때마다 그 수가 떨어지는 것을 보인다.
 * 요점은 섞임이 **개수가 아니라 비율**이라는 것이다. 지니는 이렇게 고쳐 쓸 수
 * 있고 —
 *
 *   gini = 1 − p(A)² − p(B)² = 0.5 − 2·(p(A) − 0.5)²
 *
 * 그래서 통에 담긴 것이 열둘이든 백스물이든, 색 경계가 한가운데에서 얼마나
 * 벗어났는지만으로 값이 정해진다. 통이 커지면 달라지는 것은 섞임이 아니라
 * **층 전체를 셈할 때의 몫**이다 — 그래서 층의 섞임은 통 크기로 가중한 평균이다.
 *
 * ── 식별자
 *   bucket:<path>   통. path 는 뿌리에서의 갈림길. 'root' · 'root/L' · 'root/L/H' …
 *                   'L' 은 기준값 미만, 'H' 는 기준값 이상.
 *
 * ── 이벤트 (전부 facet 고유. silent 는 하나도 없다 — 걸음마다 화면이 바뀐다)
 *
 *   'sample-shown'   { buckets: BucketWire[] }
 *       뿌리 통 하나가 섞임 자의 꼭대기에 놓인다. buckets 는 길이 1.
 *
 *   'cut-drawn'      { depth: number; cuts: CutWire[] }
 *       그 층의 가름선을 산점도에 긋는다. 한 층에 여럿일 수 있다 (통마다 제 질문).
 *
 *   'buckets-split'  { depth: number; buckets: BucketWire[] }
 *       통이 갈라져 저마다 제 섞임 높이로 내려간다. buckets 는 그 층의 잎 전부이며
 *       왼쪽→오른쪽 순서다.
 *
 *   'level-measured' { depth: number; from: number; to: number; drop: number }
 *       층 전체의 섞임(통 크기로 가중한 평균)과 내려간 폭. from 은 직전 층의 값.
 *
 *   'settled'        { buckets: BucketWire[] }
 *       더 가를 것이 없다. 통마다 한 가지 이름표만 남았으면 pureClass 가 그 이름표.
 *
 *   'rewind'         {}
 *       처음으로 되감는다. 자동 재생이 끝난 뒤 처음 누르는 `advance` 가 이것을
 *       내보내고, 곧이어 첫 걸음까지 간다 (S-piece).
 *
 *   'done'           {}
 *       표준 이벤트. 발신이 끝났다는 표시이며 화면은 바꾸지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 이름표 붙은 점 하나. */
export type ImpurityPoint = { x: number; y: number; label: string };

/**
 * 가름선 선언. `path` 가 가리키는 통을 `axis` 의 `at` 에서 가른다.
 * path 는 뿌리에서의 갈림길이며 빈 문자열이 뿌리다.
 */
export type ImpurityCut = { path: string; axis: 'x' | 'y'; at: number };

export type ImpurityDropsData = {
  type: string;
  points: ImpurityPoint[];
  classes: string[];
  cuts: ImpurityCut[];
  stepMs: number;
};

/**
 * 통이 차지한 평면의 칸. `null` 은 열린 쪽 — 그림이 제 가장자리까지 늘린다.
 * 화면 좌표가 아니라 데이터 좌표다 (좌표는 stage 가 셈한다, S-piece).
 */
export type ImpurityBox = {
  xLo: number | null;
  xHi: number | null;
  yLo: number | null;
  yHi: number | null;
};

export type BucketWire = {
  id: string;
  box: ImpurityBox;
  /** classes 순서대로의 개수. */
  counts: number[];
  n: number;
  gini: number;
  /** 한 가지 이름표만 담겼으면 그 class 인덱스, 아니면 -1. */
  pureClass: number;
};

export type CutWire = {
  bucketId: string;
  axis: 'x' | 'y';
  at: number;
  /** 가름선을 가둘 칸 — 가르기 전 통의 칸이다. */
  box: ImpurityBox;
};

type Leaf = { path: string; box: ImpurityBox; points: number[] };

const OPEN_BOX: ImpurityBox = { xLo: null, xHi: null, yLo: null, yHi: null };

function idOf(path: string): string {
  return path === '' ? 'root' : `root/${path.split('').join('/')}`;
}

function tallyOf(points: ImpurityPoint[], idx: number[], classes: string[]): number[] {
  const counts = classes.map(() => 0);
  for (const i of idx) {
    const p = points[i];
    if (p === undefined) continue;
    const k = classes.indexOf(p.label);
    if (k >= 0) counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/** 지니 불순도. 1 − Σ 비율². 빈 통은 0. */
function giniOf(counts: number[], n: number): number {
  if (n <= 0) return 0;
  let sum = 0;
  for (const c of counts) sum += (c / n) * (c / n);
  return 1 - sum;
}

function pureClassOf(counts: number[], n: number): number {
  if (n <= 0) return -1;
  let found = -1;
  for (let k = 0; k < counts.length; k += 1) {
    if ((counts[k] ?? 0) === 0) continue;
    if (found >= 0) return -1;
    found = k;
  }
  return found;
}

function wireOf(leaf: Leaf, points: ImpurityPoint[], classes: string[]): BucketWire {
  const counts = tallyOf(points, leaf.points, classes);
  const n = leaf.points.length;
  return {
    id: idOf(leaf.path),
    box: leaf.box,
    counts,
    n,
    gini: giniOf(counts, n),
    pureClass: pureClassOf(counts, n),
  };
}

/** 통 크기로 가중한 층의 섞임. 그냥 평균이 아니다. */
function levelOf(wires: BucketWire[], total: number): number {
  if (total <= 0) return 0;
  let sum = 0;
  for (const w of wires) sum += w.n * w.gini;
  return sum / total;
}

function splitLeaf(leaf: Leaf, cut: ImpurityCut, points: ImpurityPoint[]): [Leaf, Leaf] {
  const lo: number[] = [];
  const hi: number[] = [];
  for (const i of leaf.points) {
    const p = points[i];
    if (p === undefined) continue;
    const v = cut.axis === 'x' ? p.x : p.y;
    if (v < cut.at) lo.push(i);
    else hi.push(i);
  }
  const boxLo: ImpurityBox = { ...leaf.box };
  const boxHi: ImpurityBox = { ...leaf.box };
  if (cut.axis === 'x') {
    boxLo.xHi = cut.at;
    boxHi.xLo = cut.at;
  } else {
    boxLo.yHi = cut.at;
    boxHi.yLo = cut.at;
  }
  return [
    { path: `${leaf.path}L`, box: boxLo, points: lo },
    { path: `${leaf.path}H`, box: boxHi, points: hi },
  ];
}

export const impurityDropsAlgorithm = async (
  ctx: FacetContext<ImpurityDropsData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<ImpurityDropsData>;
  const data = rc.data;
  const points = Array.isArray(data.points) ? data.points : [];
  const classes = Array.isArray(data.classes) ? data.classes : [];
  const cuts = Array.isArray(data.cuts) ? data.cuts : [];
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 800;

  /** 자동 재생이 끝나면 켜진다 — 그 뒤로는 걸음마다 `advance` 를 기다린다. */
  let manual = false;
  /** 되감기 직후의 첫 문 하나만 그냥 통과시킨다 (S-piece). */
  let freeGate = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    if (freeGate) {
      freeGate = false;
      return true;
    }
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  }

  /** 한 바퀴 굴린다. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function run(): Promise<boolean> {
    const total = points.length;
    let leaves: Leaf[] = [
      { path: '', box: { ...OPEN_BOX }, points: points.map((_, i) => i) },
    ];
    let level = levelOf(
      leaves.map((l) => wireOf(l, points, classes)),
      total,
    );

    if (!(await gate())) return false;
    await rc.emit({
      type: 'sample-shown',
      target: leaves.map((l) => `bucket:${idOf(l.path)}`),
      payload: { buckets: leaves.map((l) => wireOf(l, points, classes)) },
    });

    // 층은 선언된 가름선이 마르면 끝난다 — 걸음표를 손으로 적지 않는다.
    for (let depth = 0; ; depth += 1) {
      const layerCuts: CutWire[] = [];
      const next: Leaf[] = [];
      for (const leaf of leaves) {
        const cut = cuts.find((c) => c.path === leaf.path);
        if (cut === undefined) {
          next.push(leaf);
          continue;
        }
        layerCuts.push({ bucketId: idOf(leaf.path), axis: cut.axis, at: cut.at, box: leaf.box });
        const [lo, hi] = splitLeaf(leaf, cut, points);
        next.push(lo, hi);
      }
      if (layerCuts.length === 0) break;

      if (!(await gate())) return false;
      await rc.emit({
        type: 'cut-drawn',
        target: layerCuts.map((c) => `bucket:${c.bucketId}`),
        payload: { depth, cuts: layerCuts },
      });

      const wires = next.map((l) => wireOf(l, points, classes));

      if (!(await gate())) return false;
      await rc.emit({
        type: 'buckets-split',
        target: wires.map((w) => `bucket:${w.id}`),
        payload: { depth, buckets: wires },
      });

      const to = levelOf(wires, total);
      if (!(await gate())) return false;
      await rc.emit({
        type: 'level-measured',
        payload: { depth, from: level, to, drop: level - to },
      });

      level = to;
      leaves = next;
    }

    const finalWires = leaves.map((l) => wireOf(l, points, classes));
    if (!(await gate())) return false;
    await rc.emit({
      type: 'settled',
      target: finalWires.map((w) => `bucket:${w.id}`),
      payload: { buckets: finalWires },
    });
    await rc.emit({ type: 'done' });
    return true;
  }

  if (!(await run())) return;

  // 자동 재생이 끝났다. 이제부터는 한 걸음씩 짚어 볼 수 있다 —
  // 처음 누르는 `advance` 는 되감고 첫 걸음까지 간다 (S-piece).
  manual = true;
  for (;;) {
    if (rc.cancelled) return;
    const input = await rc.waitForInput();
    if (rc.cancelled) return;
    if (input.type !== 'advance') continue;
    await rc.emit({ type: 'rewind' });
    freeGate = true;
    if (!(await run())) return;
  }
};
