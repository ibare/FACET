/**
 * k-평균 — 가운데를 모르는 채로 무리를 찾는다.
 *
 * 이 완제품이 말하는 것은 둘이다.
 *   1. **시작에 따라 다른 답에 멎는다.** 같은 k 인데 시작 중심만 바꾸면 다른
 *      자리에서 멎는다. 멎은 자리는 모두 "더 옮길 데가 없는" 답이다.
 *   2. **흩어짐이 가장 작은 답이 사람이 보는 무리가 아니다.** 이 자료를 사람이
 *      보면 긴 띠 하나와 떨어진 두 덩이인데, 흩어짐만 보면 띠를 쪼개고 두 덩이를
 *      합치는 쪽이 두 배 넘게 낫다.
 *
 * 진행 모델: reactive. mount 직후 한 판을 자동으로 굴려 멎는 자리까지 보이고,
 * 그 뒤 `waitForInput` 으로 조작을 기다린다. 재생 · 멈춤 · 한 걸음은 메커니즘이
 * 지므로 알고리즘은 걸음을 `ctx.sleep` 으로 잇기만 한다.
 *
 * ── 조작 어휘 (control-bar → mechanism.dispatch)
 *
 *   { type: 'k',      payload: { value: number } }   k 슬라이더 (2 · 3 · 4 · 5)
 *   { type: 'reseed', payload: unknown }             시작 다시 뽑기 (다음 시작으로)
 *
 * 그 밖의 type 은 흘린다. 조작이 들어오면 굴러가던 판을 그 자리에서 접고 새 판을
 * 처음부터 굴린다 — k 나 시작이 바뀌면 이어 갈 상태가 없기 때문이다. 앞서 멎은
 * 답들은 지우지 않고 장부에 쌓여 견줌이 된다.
 *
 * ── 발신 이벤트 (facet 고유 확장, C2)
 *
 *   phase           { phase: string }                                    silent
 *   run-begin       { runIndex, k, seedIndex, seedIndices: number[],
 *                     centers: number[][] }
 *   round-begin     { round: number }
 *   measured        { round, distances: number[][] }   n×k 제곱 거리
 *   nearest-picked  { round, best: number[] }          점마다 고른 중심 색인
 *   assigned        { round, assign: number[], sizes: number[], spread: number }
 *   gathered        { round, counts: number[], sums: number[][] }
 *   centers-moved   { round, from: number[][], centers: number[][],
 *                     moved: number, spread: number }
 *   settle-checked  { round, moved: number, settled: boolean }
 *   run-settled     { runIndex, k, seedIndex, rounds, sizes, spread,
 *                     assignKey, centers, isReader,
 *                     triedAtK, distinctAtK,
 *                     tightest: { seedIndex, sizes, spread },
 *                     reader: { seedIndex, sizes, spread } | null }
 *
 * 화면 문안은 하나도 싣지 않는다 — 무엇이라 말할지는 표현 계층이 정한다 (C10).
 *
 * ── phase 어휘 (irs.ts 와 글자까지 같다, C3)
 *
 *   'begin-round' | 'measure' | 'pick-nearest' | 'assign' |
 *   'gather' | 'move-center' | 'settle-check'
 *
 * ── 메트릭 (C5)
 *
 *   round-count     돈 바퀴 수 (누적)
 *   spread-sum      지금 흩어짐 (반올림한 정수)
 *   distance-count  거리를 잰 횟수 (누적)
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 사람이 보기에 옳은 무리 — 저작자가 선언한 주장이다. */
export type KmeansReaderAnswer = { k: number; assign: string };

export type KmeansData = {
  type: 'kmeans';
  /** 점 열둘. `[x, y]`. */
  points: number[][];
  /** k 슬라이더가 고를 수 있는 값들. */
  kOptions: number[];
  /** `seedSets[kIndex][seedIndex]` = 시작 중심으로 쓸 점 색인들. */
  seedSets: number[][][];
  /** 시작마다의 표식 (A · B · C · D). 번역하지 않는다. */
  seedLabels: string[];
  initialKIndex: number;
  initialSeedIndex: number;
  readerAnswer: KmeansReaderAnswer;
  /** 멎지 않아도 여기서 멈춘다 — 안전장치. */
  maxRounds: number;
  timings: { beatMs: number; restMs: number };
};

/** 멎은 답 하나. 장부의 한 줄이 된다. */
type Settled = {
  k: number;
  seedIndex: number;
  rounds: number;
  sizes: number[];
  spread: number;
  assignKey: string;
};

/** 판 하나가 어떻게 끝났는가. */
type RunOutcome = 'settled' | 'interrupted' | 'cancelled';

function copyGrid(grid: number[][]): number[][] {
  return grid.map((row) => [...row]);
}

/** control-bar 가 보낸 payload 에서 수 하나를 꺼낸다. 검사 없이 믿지 않는다 (C9). */
function readValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const kmeans = async (base: FacetContext<KmeansData>): Promise<void> => {
  const ctx = base as ReactiveContext<KmeansData>;
  const d = ctx.data;
  const points = d.points;
  const n = points.length;

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /**
   * 지금 흩어짐을 계기에 건다.
   *
   * `ctx.metric` 은 값을 더하는 물건이라 절대값을 걸려면 차이를 넘겨야 한다.
   * 정수로 반올림해 거는 것은 부동소수 차이를 거듭 더하면 계기에 `10.3000000004`
   * 같은 것이 뜨기 때문이다. 소수점까지 보이는 자리는 장부이고, 거기서 견줌이
   * 일어난다.
   */
  let shownSpread = 0;
  const showSpread = (value: number): void => {
    const rounded = Math.round(value);
    if (rounded === shownSpread) return;
    ctx.metric('spread-sum', rounded - shownSpread);
    shownSpread = rounded;
  };

  let kIndex = d.initialKIndex;
  let seedIndex = d.initialSeedIndex;
  let runIndex = 0;
  const ledger: Settled[] = [];
  /** 판을 굴리는 중에 들어온 조작. 다음 판이 그것으로 시작한다. */
  let pending: ReactiveInputEvent | null = null;

  /** 조작 어휘인가. 아니면 흘린다 (재생 셋은 메커니즘이 이미 가로챈다). */
  const isKnob = (event: ReactiveInputEvent): boolean =>
    event.type === 'k' || event.type === 'reseed';

  /**
   * 한 걸음의 경계. 재우고, 그 사이에 들어온 조작을 줍는다.
   * @returns 이어 가도 되면 true.
   */
  const beat = async (ms: number): Promise<boolean> => {
    if (!(await ctx.sleep(ms))) return false;
    const input = ctx.pollInput();
    if (input === null) return true;
    if (!isKnob(input)) return true;
    pending = input;
    return false;
  };

  /** 흩어짐 — 각 점에서 제 중심까지 거리의 제곱을 다 더한 값. */
  const spreadOf = (assign: number[], centers: number[][]): number => {
    let total = 0;
    for (let i = 0; i < n; i += 1) {
      const j = assign[i];
      if (j < 0 || j >= centers.length) continue;
      const dx = points[i][0] - centers[j][0];
      const dy = points[i][1] - centers[j][1];
      total += dx * dx + dy * dy;
    }
    return total;
  };

  /** 한 판 — 멎을 때까지 굴린다. */
  const runOnce = async (): Promise<RunOutcome> => {
    const k = d.kOptions[kIndex];
    const seeds = d.seedSets[kIndex][seedIndex];
    const centers = seeds.map((i) => [points[i][0], points[i][1]]);
    const assign = new Array<number>(n).fill(-1);
    const counts = new Array<number>(k).fill(0);
    const sums: number[][] = Array.from({ length: k }, () => [0, 0]);

    runIndex += 1;
    showSpread(0);
    await ctx.emit({
      type: 'run-begin',
      payload: {
        runIndex,
        k,
        seedIndex,
        seedIndices: [...seeds],
        centers: copyGrid(centers),
      },
    });
    if (!(await beat(d.timings.restMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';

    let round = 0;
    let settled = false;

    while (round < d.maxRounds) {
      if (ctx.cancelled) return 'cancelled';
      round += 1;
      await phase('begin-round');
      await ctx.emit({ type: 'round-begin', payload: { round } });
      if (!(await beat(d.timings.beatMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';

      // ── 잰다. 제곱 그대로 견준다 — 제곱근은 단조라 가장 가까운 것이 안 바뀐다.
      await phase('measure');
      const distances: number[][] = [];
      for (let i = 0; i < n; i += 1) {
        const row: number[] = [];
        for (let j = 0; j < k; j += 1) {
          const dx = points[i][0] - centers[j][0];
          const dy = points[i][1] - centers[j][1];
          row.push(dx * dx + dy * dy);
        }
        distances.push(row);
        ctx.metric('distance-count', k);
      }
      await ctx.emit({ type: 'measured', payload: { round, distances: copyGrid(distances) } });
      if (!(await beat(d.timings.beatMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';

      // ── 고른다. 값이 아니라 색인이 필요해 루프로 편다.
      await phase('pick-nearest');
      const best: number[] = [];
      for (let i = 0; i < n; i += 1) {
        let pick = 0;
        for (let j = 1; j < k; j += 1) {
          if (distances[i][j] < distances[i][pick]) pick = j;
        }
        best.push(pick);
      }
      await ctx.emit({ type: 'nearest-picked', payload: { round, best: [...best] } });
      if (!(await beat(d.timings.beatMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';

      // ── 붙인다 (한 판의 첫 몸짓).
      await phase('assign');
      for (let i = 0; i < n; i += 1) assign[i] = best[i];
      const sizesNow = new Array<number>(k).fill(0);
      for (const g of assign) sizesNow[g] += 1;
      const spreadAfterAssign = spreadOf(assign, centers);
      showSpread(spreadAfterAssign);
      await ctx.emit({
        type: 'assigned',
        payload: { round, assign: [...assign], sizes: [...sizesNow], spread: spreadAfterAssign },
      });
      if (!(await beat(d.timings.beatMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';

      // ── 모은다. 무리마다 개수와 좌표 합.
      await phase('gather');
      for (let j = 0; j < k; j += 1) {
        counts[j] = 0;
        sums[j][0] = 0;
        sums[j][1] = 0;
      }
      for (let i = 0; i < n; i += 1) {
        const g = assign[i];
        counts[g] += 1;
        sums[g][0] += points[i][0];
        sums[g][1] += points[i][1];
      }
      await ctx.emit({
        type: 'gathered',
        payload: { round, counts: [...counts], sums: copyGrid(sums) },
      });
      if (!(await beat(d.timings.beatMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';

      // ── 옮긴다 (한 판의 둘째 몸짓). 빈 무리는 그대로 둔다.
      await phase('move-center');
      const from = copyGrid(centers);
      let moved = 0;
      for (let j = 0; j < k; j += 1) {
        if (counts[j] === 0) continue;
        const nx = sums[j][0] / counts[j];
        const ny = sums[j][1] / counts[j];
        moved += Math.sqrt((nx - centers[j][0]) ** 2 + (ny - centers[j][1]) ** 2);
        centers[j][0] = nx;
        centers[j][1] = ny;
      }
      const spreadAfterMove = spreadOf(assign, centers);
      showSpread(spreadAfterMove);
      ctx.metric('round-count', 'inc');
      await ctx.emit({
        type: 'centers-moved',
        payload: {
          round,
          from,
          centers: copyGrid(centers),
          moved,
          spread: spreadAfterMove,
        },
      });
      if (!(await beat(d.timings.beatMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';

      // ── 멎었는가. 아무도 안 움직였으면 다음 판도 똑같다.
      await phase('settle-check');
      settled = moved === 0;
      await ctx.emit({ type: 'settle-checked', payload: { round, moved, settled } });
      if (!(await beat(d.timings.restMs))) return ctx.cancelled ? 'cancelled' : 'interrupted';
      if (settled) break;
    }

    const sizes = new Array<number>(k).fill(0);
    for (const g of assign) sizes[g] += 1;
    const spread = spreadOf(assign, centers);
    const assignKey = assign.join('');
    const entry: Settled = { k, seedIndex, rounds: round, sizes, spread, assignKey };
    const already = ledger.findIndex((e) => e.k === k && e.seedIndex === seedIndex);
    if (already >= 0) ledger[already] = entry;
    else ledger.push(entry);

    const atK = ledger.filter((e) => e.k === k);
    let tightest = atK[0];
    for (const e of atK) if (e.spread < tightest.spread) tightest = e;
    const isReader = k === d.readerAnswer.k && assignKey === d.readerAnswer.assign;
    const readerRow =
      k === d.readerAnswer.k
        ? (atK.find((e) => e.assignKey === d.readerAnswer.assign) ?? null)
        : null;

    await ctx.emit({
      type: 'run-settled',
      payload: {
        runIndex,
        k,
        seedIndex,
        rounds: round,
        sizes: [...sizes],
        spread,
        assignKey,
        centers: copyGrid(centers),
        isReader,
        triedAtK: atK.length,
        distinctAtK: new Set(atK.map((e) => e.assignKey)).size,
        tightest: {
          seedIndex: tightest.seedIndex,
          sizes: [...tightest.sizes],
          spread: tightest.spread,
        },
        reader:
          readerRow === null
            ? null
            : {
                seedIndex: readerRow.seedIndex,
                sizes: [...readerRow.sizes],
                spread: readerRow.spread,
              },
      },
    });
    return 'settled';
  };

  try {
    let outcome = await runOnce();
    for (;;) {
      if (ctx.cancelled) return;
      const event = pending ?? (outcome === 'cancelled' ? null : await ctx.waitForInput());
      pending = null;
      if (event === null) return;
      if (event.type === 'k') {
        const value = readValue(event.payload);
        if (value === null) continue;
        const next = d.kOptions.indexOf(value);
        if (next < 0) continue;
        kIndex = next;
        seedIndex = Math.min(seedIndex, d.seedSets[kIndex].length - 1);
      } else if (event.type === 'reseed') {
        seedIndex = (seedIndex + 1) % d.seedSets[kIndex].length;
      } else {
        continue;
      }
      outcome = await runOnce();
    }
  } catch (err) {
    // `waitForInput` 은 취소될 때 reject 한다. 취소가 아닌 오류를 여기서 삼키면
    // 화면이 까닭 없이 멎으므로 그대로 올린다 (C8 gate 절).
    if (!ctx.cancelled) throw err;
  }
};
