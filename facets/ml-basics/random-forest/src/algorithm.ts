/**
 * 랜덤 포레스트 — 나무 하나로도 답은 나온다. 여럿을 기르면 무엇이 더 생기는가.
 *
 * 나무 하나는 평면 어디서나 100% 확신한다. 잎에 닿으면 이름표 하나가 나오고
 * 그것으로 끝이라, 경계는 선 하나이고 그 선의 양쪽은 똑같이 단호하다. 숲은
 * 표를 세므로 표가 갈리는 자리가 생기고, 그 자리에서 경계가 선이 아니라 띠가
 * 된다. **숲은 자기가 얼마나 확신하는지도 말한다** — 그것이 이 화면의 논증이고
 * 숲 크기 슬라이더가 그것을 짊어진다.
 *
 * ── 기르기 (여기서 한다. IR 에는 없다)
 *
 *   부트스트랩   열여덟 번 뽑되 뽑을 때마다 도로 넣는다. 뽑는 자리는
 *                `floor(rand() * 18)`.
 *   축 뽑기      분할마다 축 하나를 무작위로 고른다 (mtry=1). `rand() < 0.5`.
 *                이것이 부트스트랩과 함께 나무들을 서로 다르게 만드는 둘째 장치다.
 *   자름 후보    그 축에서 표본에 실제로 나타난 값들을 정렬해 이웃한 두 값의
 *                한가운데. 가중 지니가 가장 작은 것을 고른다 (동점이면 앞엣것).
 *   멈춤         깊이 제한 없음. 순수해지면 잎. 고른 축의 값이 하나뿐이라
 *                자를 데가 없으면 그 자리도 잎이며 다수결로 이름표를 붙인다.
 *
 * 난수는 **mulberry32, 씨앗 20260910** 으로 못박는다. 나무 열여섯을 차례로
 * 기르며 같은 흐름을 이어 쓰므로, 생성기나 호출 순서를 바꾸면 숲이 통째로
 * 달라진다.
 *
 * ── 두 막
 *
 *   1막  나무를 하나씩 기른다. 확신 밭은 그때까지 기른 나무 전부로 다시 셈하고,
 *        물음점은 새로 자란 나무마다 뿌리에서 잎까지 한 번 내려간다. 표가
 *        갈리는 칸이 0 에서 시작해 늘어나는 것이 여기서 보인다.
 *   2막  슬라이더가 논증을 진다. **보는 나무 수** `size` 를 1 · 2 · 4 · 8 · 16
 *        중에서 고르면 그 값으로 밭과 표를 처음부터 다시 셈한다. 재생을 처음부터
 *        돌리지 않는다 — 그래야 값끼리 견줄 수 있다.
 *
 * 1막 도중에 슬라이더가 움직이면 남은 나무를 조용히 다 기른 뒤 곧바로 2막의
 * 셈으로 넘어간다. 기르는 것을 끝내지 않으면 "앞에서부터 n 그루" 라는 말이
 * 성립하지 않기 때문이다.
 *
 * ── 이벤트 (facet 고유 — C2)
 *
 *   'phase'         { phase: string }                          silent: true
 *                   IR 의 phase 어휘 아홉과 글자까지 같다 (C3).
 *   'tree-grown'    { index, distinct, outOfBag, leaves, correct }
 *                   나무 하나를 다 길렀다. distinct = 뽑힌 서로 다른 자리 수,
 *                   outOfBag = 남은 것, leaves = 잎 수, correct = 이 나무
 *                   혼자서 훈련 점 열여덟 중 맞힌 수.
 *   'field-changed' { size, votesA: number[], splitCells, correct }
 *                   확신 밭을 다시 셌다. votesA 는 격자 칸마다 A 에 들어간 표
 *                   (칸 순서는 gy * gridSize + gx).
 *   'tally-reset'   { size }                                   표를 비웠다.
 *   'walk-begin'    { tree, x0, x1, y0, y1 }
 *                   물음점을 나무 `tree` 의 뿌리에 세웠다. 네 수는 아직
 *                   아무것도 자르지 않은 영역, 곧 평면 전체.
 *   'walk-narrow'   { tree, x0, x1, y0, y1, feature, threshold, goLeft }
 *                   갈래 하나를 골라 영역이 좁아졌다.
 *   'walk-leaf'     { tree, x0, x1, y0, y1, label, votesA, votesB }
 *                   잎에 닿아 표를 넣었다. 네 수는 그 잎이 차지한 영역.
 *   'vote-result'   { label, votesA, votesB, size }             다수결이 끝났다.
 *   'caption'       { textKey: string, vars?: Record<string, string | number> }
 *                   문안은 키로만 보낸다 — 화면 글자를 정하는 것은 표현
 *                   계층의 일이다 (C10).
 *
 * ── phase 어휘 (irs.ts 와 집합이 같아야 한다 — C3)
 *
 *   'reset-tally' | 'pick-tree' | 'enter-root' | 'walk-down' | 'ask-split' |
 *   'go-left' | 'go-right' | 'cast-vote' | 'majority'
 *
 * ── 메트릭 (facet.ts 의 선언과 이름이 같아야 한다 — C5)
 *
 *   'tree-count' · 'correct-count' · 'split-cell-count'
 *
 * ── 위젯 입력
 *
 *   { type: 'forest-size', payload: { value: number } }  숲 크기 슬라이더.
 *
 * 재생·멈춤·한 걸음은 메커니즘이 진다. 알고리즘은 걸음을 `ctx.sleep` 으로
 * 이어 가고 위젯 입력만 본다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ForestPoint = { x: number; y: number; label: number };

export type RandomForestData = {
  type: string;
  points: ForestPoint[];
  seed: number;
  treeCount: number;
  gridSize: number;
  planeMax: number;
  probe: { x: number; y: number };
  initialSize: number;
  timings: { walkStepMs: number; treeBeatMs: number; settleMs: number };
};

/**
 * 나무 하나를 평평한 배열 다섯으로 편 것. IR 이 받는 모양 그대로다 —
 * 내부 노드는 `left >= 0` 이고 `label` 이 -1, 잎은 `left === -1` 이고
 * `label` 이 0 또는 1 (irs.ts 의 잎 표시 규약).
 */
export type FlatTree = {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  label: number[];
};

export type TreeStat = {
  index: number;
  distinct: number;
  outOfBag: number;
  leaves: number;
  correct: number;
};

export type FieldStat = {
  votesA: number[];
  splitCells: number;
  correct: number;
};

/** 사양이 못박은 난수 생성기. 다른 생성기를 쓰면 숲이 통째로 달라진다. */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function giniOf(countA: number, countB: number): number {
  const total = countA + countB;
  if (total === 0) return 0;
  const pa = countA / total;
  const pb = countB / total;
  return 1 - pa * pa - pb * pb;
}

/** 한 나무를 기른다. `rand` 를 이어 쓰므로 호출 순서가 곧 숲의 정체다. */
function growTree(rand: () => number, points: ForestPoint[], sample: number[]): FlatTree {
  const tree: FlatTree = { feature: [], threshold: [], left: [], right: [], label: [] };

  const build = (rows: number[]): number => {
    const id = tree.feature.length;
    tree.feature.push(-1);
    tree.threshold.push(0);
    tree.left.push(-1);
    tree.right.push(-1);
    tree.label.push(-1);

    const first = points[rows[0]]!.label;
    if (rows.every((i) => points[i]!.label === first)) {
      tree.label[id] = first;
      return id;
    }

    // mtry=1 — 분할마다 축 하나만 본다.
    const axis = rand() < 0.5 ? 0 : 1;
    const coord = (i: number): number => (axis === 0 ? points[i]!.x : points[i]!.y);
    const values = [...new Set(rows.map(coord))].sort((a, b) => a - b);
    if (values.length < 2) {
      let a = 0;
      for (const i of rows) if (points[i]!.label === 0) a += 1;
      tree.label[id] = a >= rows.length - a ? 0 : 1;
      return id;
    }

    let bestCut = (values[0]! + values[1]!) / 2;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let k = 0; k + 1 < values.length; k += 1) {
      const cut = (values[k]! + values[k + 1]!) / 2;
      let la = 0;
      let lb = 0;
      let ra = 0;
      let rb = 0;
      for (const i of rows) {
        const isA = points[i]!.label === 0;
        if (coord(i) < cut) {
          if (isA) la += 1;
          else lb += 1;
        } else if (isA) ra += 1;
        else rb += 1;
      }
      const nl = la + lb;
      const nr = ra + rb;
      const score = (nl * giniOf(la, lb) + nr * giniOf(ra, rb)) / rows.length;
      if (score < bestScore - 1e-12) {
        bestScore = score;
        bestCut = cut;
      }
    }

    const leftRows: number[] = [];
    const rightRows: number[] = [];
    for (const i of rows) (coord(i) < bestCut ? leftRows : rightRows).push(i);

    tree.feature[id] = axis;
    tree.threshold[id] = bestCut;
    tree.left[id] = build(leftRows);
    tree.right[id] = build(rightRows);
    return id;
  };

  build(sample);
  return tree;
}

/** 한 나무에 물음점을 태워 내려간 끝의 잎 번호. */
export function leafOfTree(tree: FlatTree, qx: number, qy: number): number {
  let node = 0;
  while (tree.left[node]! >= 0) {
    const value = tree.feature[node] === 0 ? qx : qy;
    node = value < tree.threshold[node]! ? tree.left[node]! : tree.right[node]!;
  }
  return node;
}

/** 앞에서부터 `n` 그루의 표. IR 의 `forestPredict` 와 같은 것을 셈한다. */
export function forestVote(
  trees: FlatTree[],
  n: number,
  qx: number,
  qy: number,
): { votesA: number; votesB: number; label: number } {
  let votesA = 0;
  for (let t = 0; t < n; t += 1) {
    const tree = trees[t]!;
    if (tree.label[leafOfTree(tree, qx, qy)] === 0) votesA += 1;
  }
  const votesB = n - votesA;
  return { votesA, votesB, label: votesB > votesA ? 1 : 0 };
}

/** 격자 칸의 한가운데 좌표. 칸의 모서리가 아니라 한가운데를 묻는다. */
export function cellCenter(index: number, gridSize: number, planeMax: number): number {
  return ((index + 0.5) * planeMax) / gridSize;
}

/** 확신 밭을 셈한다 — 칸마다 A 표 수, 표가 갈리는 칸 수, 훈련 점 적중 수. */
export function fieldOf(
  trees: FlatTree[],
  n: number,
  points: ForestPoint[],
  gridSize: number,
  planeMax: number,
): FieldStat {
  const votesA = new Array<number>(gridSize * gridSize).fill(0);
  let splitCells = 0;
  for (let gy = 0; gy < gridSize; gy += 1) {
    for (let gx = 0; gx < gridSize; gx += 1) {
      const v = forestVote(
        trees,
        n,
        cellCenter(gx, gridSize, planeMax),
        cellCenter(gy, gridSize, planeMax),
      );
      votesA[gy * gridSize + gx] = v.votesA;
      if (v.votesA > 0 && v.votesB > 0) splitCells += 1;
    }
  }
  let correct = 0;
  for (const p of points) {
    if (forestVote(trees, n, p.x, p.y).label === p.label) correct += 1;
  }
  return { votesA, splitCells, correct };
}

/** 씨앗에서 숲 전체를 기른다. 검사가 IR 인자를 만들 때도 이것을 쓴다. */
export function growRandomForest(
  points: ForestPoint[],
  seed: number,
  treeCount: number,
): { trees: FlatTree[]; stats: TreeStat[] } {
  const rand = mulberry32(seed);
  const trees: FlatTree[] = [];
  const stats: TreeStat[] = [];
  for (let t = 0; t < treeCount; t += 1) {
    const sample: number[] = [];
    for (let k = 0; k < points.length; k += 1) {
      sample.push(Math.floor(rand() * points.length));
    }
    const tree = growTree(rand, points, sample);
    trees.push(tree);
    const distinct = new Set(sample).size;
    let leaves = 0;
    for (const l of tree.left) if (l < 0) leaves += 1;
    let correct = 0;
    for (const p of points) {
      if (tree.label[leafOfTree(tree, p.x, p.y)] === p.label) correct += 1;
    }
    stats.push({
      index: t,
      distinct,
      outOfBag: points.length - distinct,
      leaves,
      correct,
    });
  }
  return { trees, stats };
}

type SizeInput = { type: string; payload?: unknown };

function readSize(event: SizeInput | null, steps: number[]): number | null {
  if (event === null || event.type !== 'forest-size') return null;
  const p = event.payload;
  if (typeof p !== 'object' || p === null) return null;
  const value = (p as { value?: unknown }).value;
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  // 슬라이더가 보낸 값이 선언한 눈금 중 하나인지 확인하고 나서 쓴다.
  return steps.includes(value) ? value : null;
}

export async function randomForest(ctx: FacetContext<RandomForestData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RandomForestData>;
  const data = ctx.data;
  const points = data.points;
  const grid = data.gridSize;
  const planeMax = data.planeMax;
  const probe = data.probe;
  const total = data.treeCount;
  const beat = data.timings;
  const cells = grid * grid;
  const steps: number[] = [];
  for (let s = 1; s <= total; s *= 2) steps.push(s);

  const trees: FlatTree[] = [];

  // 메트릭은 누적 갱신이라 지금 화면에 뜬 값과의 차를 보낸다.
  const shown = { 'correct-count': 0, 'split-cell-count': 0 };
  const setMetric = (name: 'correct-count' | 'split-cell-count', value: number): void => {
    const delta = value - shown[name];
    shown[name] = value;
    if (delta !== 0) ctx.metric(name, delta);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const caption = (textKey: string, vars?: Record<string, string | number>): Promise<void> =>
    ctx.emit({ type: 'caption', payload: { textKey, vars } });

  /** 앞에서부터 `n` 그루로 확신 밭을 다시 셈해 화면과 메트릭을 갱신한다. */
  const refreshField = async (n: number): Promise<FieldStat> => {
    const stat = fieldOf(trees, n, points, grid, planeMax);
    await ctx.emit({
      type: 'field-changed',
      payload: { size: n, votesA: stat.votesA, splitCells: stat.splitCells, correct: stat.correct },
    });
    setMetric('correct-count', stat.correct);
    setMetric('split-cell-count', stat.splitCells);
    return stat;
  };

  /**
   * 물음점을 나무 하나에 태워 내려간다. IR 의 while 루프 그대로이며, 갈래를
   * 고를 때마다 물음점을 담고 있는 영역이 한 축씩 좁아진다.
   *
   * @returns 표를 넣은 이름표. 도중에 취소되면 null.
   */
  const walkTree = async (t: number, tally: { a: number; b: number }): Promise<number | null> => {
    if (ctx.cancelled) return null;
    const tree = trees[t]!;
    let x0 = 0;
    let x1 = planeMax;
    let y0 = 0;
    let y1 = planeMax;
    await phase('pick-tree');
    await phase('enter-root');
    await ctx.emit({ type: 'walk-begin', payload: { tree: t, x0, x1, y0, y1 } });
    if (!(await rctx.sleep(beat.walkStepMs))) return null;

    let node = 0;
    for (;;) {
      // 문(sleep)은 이 바디의 끝에 있다 — 한 걸음의 뜻이 "갈래 하나를 고른다"
      // 여서 고르기 전에 멈출 자리가 없기 때문이다. 그래서 진입 검사를 직접 둔다.
      if (ctx.cancelled) return null;
      await phase('walk-down');
      if (tree.left[node]! < 0) break;
      await phase('ask-split');
      const feature = tree.feature[node]!;
      const threshold = tree.threshold[node]!;
      const goLeft = (feature === 0 ? probe.x : probe.y) < threshold;
      if (goLeft) {
        await phase('go-left');
        if (feature === 0) x1 = Math.min(x1, threshold);
        else y1 = Math.min(y1, threshold);
        node = tree.left[node]!;
      } else {
        await phase('go-right');
        if (feature === 0) x0 = Math.max(x0, threshold);
        else y0 = Math.max(y0, threshold);
        node = tree.right[node]!;
      }
      await ctx.emit({
        type: 'walk-narrow',
        payload: { tree: t, x0, x1, y0, y1, feature, threshold, goLeft },
      });
      if (!(await rctx.sleep(beat.walkStepMs))) return null;
    }

    await phase('cast-vote');
    const leafLabel = tree.label[node]!;
    if (leafLabel === 0) tally.a += 1;
    else tally.b += 1;
    await ctx.emit({
      type: 'walk-leaf',
      payload: { tree: t, x0, x1, y0, y1, label: leafLabel, votesA: tally.a, votesB: tally.b },
    });
    if (!(await rctx.sleep(beat.walkStepMs))) return null;
    return leafLabel;
  };

  const announce = (tally: { a: number; b: number }, n: number): Promise<void> =>
    ctx.emit({
      type: 'vote-result',
      payload: { label: tally.b > tally.a ? 1 : 0, votesA: tally.a, votesB: tally.b, size: n },
    });

  /** 앞에서부터 `n` 그루를 차례로 태워 다수결까지 간다. */
  const runVote = async (n: number): Promise<boolean> => {
    await phase('reset-tally');
    await ctx.emit({ type: 'tally-reset', payload: { size: n } });
    const tally = { a: 0, b: 0 };
    for (let t = 0; t < n; t += 1) {
      if ((await walkTree(t, tally)) === null) return false;
    }
    await phase('majority');
    await announce(tally, n);
    return true;
  };

  // ── 1막. 나무를 하나씩 기른다. 밭은 그때까지 기른 것 전부로 센다.
  await caption('caption.start', { total });
  if (!(await rctx.sleep(beat.settleMs))) return;

  // 숲은 한 번에 기르고 한 그루씩 내보인다. 난수가 하나의 흐름이라 나무를
  // 걸음마다 나눠 기르려면 생성기를 걸음 사이로 들고 다녀야 하는데, 결과는
  // 글자 하나 다르지 않다. 화면에 나타나는 차례가 곧 기른 차례다.
  const forest = growRandomForest(points, data.seed, total);
  const tally = { a: 0, b: 0 };
  let pending: number | null = null;
  let t = 0;

  await phase('reset-tally');
  await ctx.emit({ type: 'tally-reset', payload: { size: total } });

  for (; t < total; t += 1) {
    if (ctx.cancelled) return;
    trees.push(forest.trees[t]!);
    const stat = forest.stats[t]!;
    ctx.metric('tree-count', 'inc');
    await ctx.emit({ type: 'tree-grown', payload: { ...stat } });
    await caption('caption.grown', {
      t: t + 1,
      total,
      leaves: stat.leaves,
      correct: stat.correct,
      points: points.length,
    });
    if ((await walkTree(t, tally)) === null) return;
    await refreshField(trees.length);
    if (!(await rctx.sleep(beat.treeBeatMs))) return;
    pending = readSize(rctx.pollInput(), steps);
    if (pending !== null) {
      t += 1;
      break;
    }
  }

  // 슬라이더가 1막을 끊었으면 남은 나무는 조용히 채운다. "앞에서부터 n 그루" 는
  // 숲이 다 자란 뒤에야 뜻이 있는 말이다.
  for (; t < total; t += 1) {
    // 문을 둘 수 없다 — 남은 나무를 **한 걸음 안에** 다 채우는 것이 이 루프의
    // 뜻이라 중간에 쉴 자리가 없다. 그래서 검사를 직접 진다.
    if (ctx.cancelled) return;
    trees.push(forest.trees[t]!);
    ctx.metric('tree-count', 'inc');
    await ctx.emit({ type: 'tree-grown', payload: { ...forest.stats[t]! } });
  }

  let size = pending ?? data.initialSize;
  if (pending === null) {
    await phase('majority');
    await announce(tally, total);
  }

  // ── 2막. 슬라이더가 논증을 진다.
  //
  // `pending` 이 있을 때에만 다시 셈한다. 슬라이더가 아닌 입력이 흘러 들어와도
  // 이미 보이는 것을 처음부터 다시 재생하지 않는다.
  if (pending === null && size !== trees.length) pending = size;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (pending !== null) {
        const stat = await refreshField(size);
        await caption(size === 1 ? 'caption.oneTree' : 'caption.size', {
          n: size,
          split: stat.splitCells,
          cells,
          correct: stat.correct,
          points: points.length,
        });
        if (!(await runVote(size))) return;
        pending = null;
      } else {
        await caption('caption.slide');
      }
      const next = readSize(await rctx.waitForInput<SizeInput>(), steps);
      if (next === null) continue;
      size = next;
      pending = next;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
