/**
 * k-최근접 이웃 (k-nearest neighbours) — 가까운 것에게 물어 답을 정한다.
 *
 * 진행 모델: 입력 반응형 (`ReactiveMechanism`). mount 직후 평면 전체의 판정을
 * 한 번 셈해 경계를 그린 뒤, 물음점 여섯 곳을 차례로 돌고 조작을 기다린다.
 *
 * ── 걸음의 문은 `ctx.sleep` 이다
 *
 * 재생 · 멈춤 · 한 걸음은 **메커니즘이 진다.** `ctx.sleep` 이 걸음의 경계라
 * 멈춤이 걸려 있으면 거기서 서고 이으면 다시 간다. 알고리즘은 그 셋을 알
 * 필요가 없고 알아서도 안 된다 — 여기서 하는 일은 걸음을 잇는 것뿐이다.
 * `sleep` 이 `false` 를 돌려주면 취소된 것이므로 곧바로 돌아간다.
 *
 * ── 받는 입력 (`mechanism.dispatch` → `ctx.waitForInput` / `ctx.pollInput`)
 *
 *   'k'   k 슬라이더. payload `{ value }`. **지금 자리를 잃지 않은 채** 경계와
 *         마지막 물음점의 답을 다시 셈한다 — 처음으로 되돌리면 두 k 를 견줄
 *         수 없다.
 *
 * 위젯은 이것 하나다. `play` / `pause` / `step` / `reset` / `speed` 는 전부
 * 메커니즘이 먼저 받으므로 여기 오지 않는다.
 *
 * ── 식별자 (C1)
 *
 *   `point:<i>`   자료의 i 번째 점 (0..17). 이름표는 0 = A, 1 = B.
 *
 * ── 이벤트 어휘 (C2) — 전부 이 facet 고유. payload 는 평탄한 객체.
 *
 *   'boundary-drawn'      { k, kIndex, cells, gridSize, aCells, cellTotal,
 *                           flipped, mislabeled, prevK }
 *                         평면 격자 전체를 다시 판정했다. `cells` 는 행 우선
 *                         `gridSize * gridSize` 개의 이름표. `flipped` 는 직전
 *                         k 와 판정이 갈린 칸의 자리 번호 (처음 그릴 때는 빈
 *                         배열). `mislabeled` 는 지금 k 에서 자기 이름표와
 *                         다르게 판정되는 점의 자리 번호. silent 아님.
 *
 *   'query-begin'         { index, total, x, y, ownLabel }
 *                         물음점 하나를 골라 자리를 옮겼다. `ownLabel` 은 그
 *                         자리가 자료의 점과 겹칠 때 그 점의 이름표, 아니면 -1.
 *                         silent 아님.
 *
 *   'distances-measured'  { dists }
 *                         물음점에서 자료 열여덟까지의 **제곱 거리** 전부.
 *                         학습이 없다는 것 — 물을 때마다 전부 다시 잰다 —
 *                         이 이벤트가 그것이다. silent 아님.
 *
 *   'neighbor-taken'      { index, rank, dist, label, radius }
 *                         아직 안 뽑힌 것 중 가장 가까운 것을 하나 집었다.
 *                         `rank` 는 0 부터. `radius` 는 제곱근을 씌운 실제
 *                         거리 (테두리를 그리는 쪽은 눈에 보이는 길이가
 *                         필요하다). target `point:<index>`. silent 아님.
 *
 *   'vote-cast'           { index, label, votesA, votesB }
 *                         집은 이웃이 표를 던졌다. target `point:<index>`.
 *                         silent 아님.
 *
 *   'verdict'             { label, votesA, votesB, ownLabel, agrees }
 *                         다수결이 끝났다. `agrees` 는 `ownLabel` 이 있을 때
 *                         그것과 판정이 같은지. silent 아님.
 *
 *   'done'                {}  표준 이벤트. 자동 시연 한 바퀴가 끝났다.
 *
 *   'phase'               { phase }  코드 패널 동기. 언제나 silent: true.
 *
 * ── phase 어휘 (C3) — `irs.ts` 의 phase 집합과 글자까지 같다
 *
 *   'measure' | 'tally-init' | 'pick-nearest' | 'take-neighbor' | 'vote' | 'decide'
 *
 * ── 메트릭 (C5)
 *
 *   'distance-count'   잰 거리의 횟수. 물음 한 번마다 자료 수만큼 는다.
 *                      k 를 옮기면 격자 576 칸을 통째로 다시 재므로 한 번에
 *                      10,692 (= (576 + 18) × 18) 씩 뛴다 — 학습이 없다는 것의
 *                      값이 이 수다.
 *   'mislabel-count'   지금 k 에서 자기 이름표와 다르게 판정되는 점의 수.
 *                      누적이 아니라 현재값이라 델타로 밀어 넣는다.
 *   'grid-a-count'     격자에서 A 로 판정된 칸 수. 마찬가지로 델타.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 이름표 — 자료에도, 판정 결과에도 이 둘만 쓴다. */
export const LABEL_A = 0;
export const LABEL_B = 1;

export type KnnPoint = { x: number; y: number; label: number };

export type KnnData = {
  type: 'knn';
  /** 이름표 있는 자료. 순서가 곧 `point:<i>` 의 i. */
  points: KnnPoint[];
  /** 슬라이더가 고르는 k 후보. */
  kValues: number[];
  /** 처음 고를 후보의 자리. */
  initialKIndex: number;
  /** 평면을 훑는 격자의 한 변. 칸 수는 그 제곱. */
  gridSize: number;
  /** 평면 범위 (가로 세로 같다). */
  planeMin: number;
  planeMax: number;
  /** 자동 시연이 도는 물음점. */
  queries: Array<{ x: number; y: number }>;
  timings: { neighborMs: number; stopMs: number };
};

/** 한 물음점의 판정 전말. `irs.ts` 의 `classify` 와 같은 셈을 한다. */
type VoteOutcome = {
  /** 자료 순서 그대로의 제곱 거리. */
  dists: number[];
  /** 뽑힌 차례대로의 자리 번호. */
  picks: number[];
  votesA: number;
  votesB: number;
  label: number;
};

/**
 * 물음점 하나의 부류를 정한다.
 *
 * `irs.ts` 의 `classify(points, labels, query, k, dist, used)` 를 그대로 옮긴
 * 것이다 — 제곱근을 씌우지 않고 (씌워도 가까운 차례가 안 바뀐다), k 개를
 * 선택 정렬처럼 하나씩 고르고, 다수결도 세어서 편다. 코드 패널이 보이는 것과
 * 화면이 보이는 것이 같은 셈이어야 하므로 지름길을 쓰지 않는다.
 */
function voteAt(points: KnnPoint[], qx: number, qy: number, k: number): VoteOutcome {
  const n = points.length;
  const dists: number[] = [];
  const used: boolean[] = [];
  for (let i = 0; i < n; i += 1) {
    const gapX = points[i].x - qx;
    const gapY = points[i].y - qy;
    dists.push(gapX * gapX + gapY * gapY);
    used.push(false);
  }
  let votesA = 0;
  let votesB = 0;
  const picks: number[] = [];
  const rounds = Math.min(k, n);
  for (let t = 0; t < rounds; t += 1) {
    let best = -1;
    let bestDist = 0;
    for (let i = 0; i < n; i += 1) {
      if (!used[i] && (best === -1 || dists[i] < bestDist)) {
        best = i;
        bestDist = dists[i];
      }
    }
    used[best] = true;
    picks.push(best);
    if (points[best].label === LABEL_A) votesA += 1;
    else votesB += 1;
  }
  return { dists, picks, votesA, votesB, label: votesA > votesB ? LABEL_A : LABEL_B };
}

/** 격자 칸 하나의 가운데 좌표. 행 우선 자리 번호 → 평면 좌표. */
function cellCenter(data: KnnData, cell: number): { x: number; y: number } {
  const step = (data.planeMax - data.planeMin) / data.gridSize;
  const col = cell % data.gridSize;
  const row = Math.floor(cell / data.gridSize);
  return {
    x: data.planeMin + (col + 0.5) * step,
    y: data.planeMin + (row + 0.5) * step,
  };
}

/**
 * 자료 전체를 지금 k 로 다시 판정해, 자기 이름표와 어긋나는 점의 자리 번호를
 * 모은다. k = 1 이면 자기 자신이 자기의 가장 가까운 이웃이라 언제나 빈 배열이
 * 된다 — 그것이 "자료를 통째로 외운다" 는 말의 실측이다.
 */
function findMislabeled(points: KnnPoint[], k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (voteAt(points, points[i].x, points[i].y, k).label !== points[i].label) out.push(i);
  }
  return out;
}

/** 그 자리가 자료의 점과 겹치면 그 점의 이름표, 아니면 -1. */
function ownLabelAt(points: KnnPoint[], qx: number, qy: number): number {
  for (const p of points) {
    if (Math.abs(p.x - qx) < 1e-9 && Math.abs(p.y - qy) < 1e-9) return p.label;
  }
  return -1;
}

/**
 * `mechanism.dispatch` 로 들어오는 입력의 payload 에서 수 하나를 꺼낸다 (C9).
 *
 * control-bar 는 segmented-slider 의 지금 값을 `value` (수) 로도 보내고,
 * 다른 버튼의 payload 에 `inputState` 를 얹을 때는 **문자열** 로도 보낸다.
 * 둘 다 받는다.
 */
function readNumber(payload: unknown, field: string): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>)[field];
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function knn(ctx: FacetContext<KnnData>): Promise<void> {
  const rc = ctx as ReactiveContext<KnnData>;
  const data = ctx.data;
  const n = data.points.length;
  const cellTotal = data.gridSize * data.gridSize;

  let kIndex = Math.min(Math.max(data.initialKIndex, 0), data.kValues.length - 1);
  let k = data.kValues[kIndex];
  let prevK = k;

  let prevCells: number[] | null = null;
  let reportedA = 0;
  let reportedMislabel = 0;
  /** 아직 메트릭으로 보고하지 않은 거리 셈. 격자 한 판은 한 번에 민다. */
  let measured = 0;

  /** 마지막으로 답을 낸 물음점. k 가 바뀌면 이 자리를 다시 판정한다. */
  let lastVisited = -1;
  /** 걸음 도중에 들어온 위젯 입력. 걸음의 경계에서 꺼내 처리한다. */
  const queued: ReactiveInputEvent[] = [];

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const ask = (qx: number, qy: number): VoteOutcome => {
    measured += n;
    return voteAt(data.points, qx, qy, k);
  };

  const flushDistances = (): void => {
    if (measured === 0) return;
    ctx.metric('distance-count', measured);
    measured = 0;
  };

  const drain = (): void => {
    for (;;) {
      // 문이 없는 루프다 — 큐를 비우는 동기 셈이라 걸음 사이가 없다 (C8).
      if (ctx.cancelled) return;
      const ev = rc.pollInput();
      if (!ev) return;
      queued.push(ev);
    }
  };

  /** 평면 전체를 지금 k 로 다시 판정해 경계를 그린다. */
  async function paintBoundary(): Promise<void> {
    await phase('measure');
    const cells: number[] = [];
    let aCells = 0;
    for (let cell = 0; cell < cellTotal; cell += 1) {
      // 문이 없는 루프다 — 격자 576 칸은 한 걸음 안에서 한꺼번에 판정되는 것이
      // 곧 "경계" 라는 뜻이라, 칸마다 멈출 자리가 없다 (C8).
      if (ctx.cancelled) return;
      const c = cellCenter(data, cell);
      const label = ask(c.x, c.y).label;
      cells.push(label);
      if (label === LABEL_A) aCells += 1;
    }
    const flipped: number[] = [];
    if (prevCells) {
      for (let cell = 0; cell < cellTotal; cell += 1) {
        // 위와 같다 — 앞 격자와의 대조도 한 걸음 안의 동기 셈이다 (C8).
        if (ctx.cancelled) return;
        if (prevCells[cell] !== cells[cell]) flipped.push(cell);
      }
    }
    measured += n * n; // findMislabeled 가 자료 열여덟을 저마다 다시 묻는다.
    const mislabeled = findMislabeled(data.points, k);
    flushDistances();
    ctx.metric('grid-a-count', aCells - reportedA);
    reportedA = aCells;
    ctx.metric('mislabel-count', mislabeled.length - reportedMislabel);
    reportedMislabel = mislabeled.length;
    const changedFrom = prevCells ? prevK : -1;
    prevCells = cells;
    prevK = k;
    await ctx.emit({
      type: 'boundary-drawn',
      payload: {
        k,
        kIndex,
        cells,
        gridSize: data.gridSize,
        aCells,
        cellTotal,
        flipped,
        mislabeled,
        prevK: changedFrom,
      },
    });
  }

  /**
   * 물음점 하나를 끝까지 판정한다 — 재고, 고르고, 세고, 정한다.
   *
   * 셋을 갈라 돌려준다 (C8 — 갈림과 취소를 boolean 하나로 겹치지 않는다).
   *   'done'         끝까지 갔다
   *   'interrupted'  도중에 k 가 바뀌었다. 이 자리는 새 k 로 다시 물어야 한다
   *   'cancelled'    취소됐다
   */
  async function visit(at: number): Promise<'done' | 'interrupted' | 'cancelled'> {
    if (ctx.cancelled) return 'cancelled';
    const q = data.queries[at];
    if (!q) return 'done';
    const own = ownLabelAt(data.points, q.x, q.y);
    await ctx.emit({
      type: 'query-begin',
      payload: { index: at, total: data.queries.length, x: q.x, y: q.y, ownLabel: own },
    });

    await phase('measure');
    const outcome = ask(q.x, q.y);
    flushDistances();
    await ctx.emit({ type: 'distances-measured', payload: { dists: outcome.dists } });
    if (!(await rc.sleep(data.timings.neighborMs))) return 'cancelled';

    await phase('tally-init');
    let votesA = 0;
    let votesB = 0;
    for (let rank = 0; rank < outcome.picks.length; rank += 1) {
      // 문이 없는 루프다 — 이웃 하나를 집고 그 표를 세는 것이 두 걸음이라
      // 걸음 경계가 루프 안쪽 `rc.sleep` 에 있다 (C8).
      if (ctx.cancelled) return 'cancelled';
      await phase('pick-nearest');
      const index = outcome.picks[rank];
      const label = data.points[index].label;
      await phase('take-neighbor');
      await ctx.emit({
        type: 'neighbor-taken',
        target: `point:${index}`,
        payload: {
          index,
          rank,
          dist: outcome.dists[index],
          label,
          radius: Math.sqrt(outcome.dists[index]),
        },
      });
      if (!(await rc.sleep(data.timings.neighborMs))) return 'cancelled';
      if (label === LABEL_A) votesA += 1;
      else votesB += 1;
      await phase('vote');
      await ctx.emit({
        type: 'vote-cast',
        target: `point:${index}`,
        payload: { index, label, votesA, votesB },
      });
      if (!(await rc.sleep(data.timings.neighborMs))) return 'cancelled';
      // k 가 바뀌었으면 세다 말고 나간다 — 새 k 로 이 자리를 다시 물어야 한다.
      drain();
      if (queued.some((pending) => pending.type === 'k')) return 'interrupted';
    }

    await phase('decide');
    await ctx.emit({
      type: 'verdict',
      payload: {
        label: outcome.label,
        votesA,
        votesB,
        ownLabel: own,
        agrees: own === -1 ? true : own === outcome.label,
      },
    });
    lastVisited = at;
    return 'done';
  }

  /**
   * k 를 그 값으로 맞추고 경계를 다시 그린다. 바뀐 것이 있으면 true.
   *
   * 물음점을 다시 물을지는 **부르는 쪽이 정한다.** 돌던 중이면 지금 자리를 새
   * k 로 다시 묻고, 다 돌았으면 마지막 자리를 다시 묻는다 — 어느 쪽이든
   * **처음으로 돌아가지 않는다.** 그래야 두 k 를 견줄 수 있다.
   */
  async function syncK(value: number | null): Promise<boolean> {
    if (value === null) return false;
    const found = data.kValues.indexOf(value);
    if (found < 0 || found === kIndex) return false;
    kIndex = found;
    k = data.kValues[kIndex];
    await paintBoundary();
    return true;
  }

  /** 위젯 입력 하나를 처리한다. k 가 바뀌었으면 true. */
  async function handleWidget(ev: ReactiveInputEvent): Promise<boolean> {
    // 이 facet 이 정의한 위젯은 k 하나다. 그 밖의 어휘는 조용히 흘린다 (C2).
    if (ev.type !== 'k') return false;
    return syncK(readNumber(ev.payload, 'value'));
  }

  /** 걸음의 경계에서 밀린 위젯 입력을 모두 처리한다. */
  async function flushWidgets(): Promise<boolean> {
    drain();
    let changed = false;
    for (;;) {
      // 문이 없는 루프다 — 큐를 비우는 일이라 걸음 사이가 없다 (C8).
      if (ctx.cancelled) return changed;
      const ev = queued.shift();
      if (!ev) return changed;
      if (await handleWidget(ev)) changed = true;
    }
  }

  await paintBoundary();

  // 물음점을 차례로 돈다. 걸음의 문은 `rc.sleep` 이 지고, 재생·멈춤·한 걸음은
  // 메커니즘이 그 문에서 진다 (C8).
  let at = 0;
  while (at < data.queries.length) {
    if (ctx.cancelled) return;
    // 걸음 사이에 k 가 바뀌었으면 **화면에 떠 있는 자리**를 새 k 로 다시 묻는다.
    // 다음 자리로 그냥 넘어가면 두 k 를 견줄 자리가 사라진다.
    if ((await flushWidgets()) && lastVisited >= 0) {
      const again = await visit(lastVisited);
      if (again === 'cancelled') return;
      if (again === 'interrupted') continue;
    }
    const outcome = await visit(at);
    if (outcome === 'cancelled') return;
    // k 가 바뀌어 세다 말고 나왔으면 같은 자리를 새 k 로 다시 묻는다.
    if (outcome === 'interrupted') continue;
    at += 1;
    if (!(await rc.sleep(data.timings.stopMs))) return;
  }
  await ctx.emit({ type: 'done' });

  // 한 바퀴가 끝났다. 남은 것은 조작뿐이라 여기서 기다린다 — 메커니즘이 이
  // 상태를 control-bar 의 "끝남" 으로 내므로 되돌리기와 위젯만 눌린다.
  for (;;) {
    // 문이 없는 루프다 — 기다리는 것 자체가 문이다 (C8).
    if (ctx.cancelled) return;
    const changed = await handleWidget(await rc.waitForInput());
    if (changed && lastVisited >= 0 && (await visit(lastVisited)) === 'cancelled') return;
  }
}
