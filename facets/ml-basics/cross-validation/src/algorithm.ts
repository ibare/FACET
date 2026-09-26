/**
 * cross-validation — 한 번 떼어 두기와 k-폴드 교차 검증.
 *
 * 항목 스물(x, 부류)과 값으로 정한 섞은 차례 여덟을 두고, 손잡이 `split`(나누기 — 사다리의 자리 0 … 4)이
 * 정한 폴드 수 k 와 시험지로 쓰는 폴드 수 used 로 섞음마다 점수를 잰다. 한 번 떼기는 폴드 다섯의 첫 폴드
 * 하나만 시험지로 쓰는 것이다 (k 5 · used 1). 알고리즘은 섞지 않는다 — 섞은 차례는 자료다.
 *
 * 규약 (IR `scorePercent` 와 같은 차례):
 *   섞은 차례의 자리 p (0 … 19) 는 폴드 p // size (size = 20 // k).
 *   폴드 f = 0 … used − 1 마다 시험지 = 폴드 f, 나머지를 자리 p 차례로 부류마다 더해
 *   가름점 = (합0 / 수0 + 합1 / 수1) / 2.0. 시험지 항목마다 x > 가름점 이면 1 로 부르고 맞힌 수를 센다.
 *   점수 = (맞힌 수 · 100 + n // 2) // n (n = used · size) — 반올림 정수 %.
 * 동률: 항목이 가름점과 같으면 던진다 (IR 은 −1). 이 데이터에서는 걸리지 않는다 — 가장 좁은 여유 0.0071
 *   (폴드 2). 폭은 정수 점수의 가장 높음 − 가장 낮음이라 동률 규칙이 필요 없다.
 *
 * 한 판 = 12 걸음:
 *   걸음 0   cv-start (silent)  항목 스물 · 빈 자리 k 폴드
 *   걸음 1   deal               섞음 1 의 차례대로 자리에 앉는다                 phase split
 *   걸음 2   fit                시험지로 쓰는 폴드마다 나머지로 가름점              phase fit
 *   걸음 3   judge              시험지 항목마다 맞음 · 틀림, 점수가 띠에 떨어진다   phase judge
 *   걸음 4~10 shuffle           섞음 2 … 8 — 나눔 · 배움 · 잼을 한 걸음에         phase judge
 *   걸음 11  spread             가장 낮음 · 가장 높음 · 폭                        phase spread
 *
 * 이벤트와 payload:
 *   cv-start (silent) { split, k, used, size, items: { x, cls }[], seatFold: number[] (자리 p 의 폴드) }
 *   deal              { shuffle, order: number[] }
 *   fit               { shuffle, cuts: number[] (시험지 폴드 f 의 가름점) }
 *   judge             { shuffle, calls: { item, fold, right }[], ok, n, pct, stack }
 *   shuffle           { shuffle, order, cuts, calls, ok, n, pct, stack }
 *   spread            { lo, hi, width }
 *   phase  (silent)   { phase }
 *   shuffle 는 0 부터 센 섞음 번호, stack 은 이 판에서 앞서 같은 점수를 받은 섞음 수(띠 위에 쌓일 높이).
 *
 * phase 어휘: split · fit · judge · spread (irs.ts 와 같다)
 *
 * 계기:
 *   fits-per-shuffle  섞음마다 배운 횟수 = used (걸음 0 에서)
 *   lowest-score      지금까지 떨어진 점수의 가장 낮음 (첫 점수 전엔 0)
 *   highest-score     지금까지 떨어진 점수의 가장 높음 (첫 점수 전엔 0)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SplitRung = { k: number; used: number };

export type CrossValidationData = {
  type: 'cross-validation';
  stepMs: number;
  /** 항목의 x — 자리 0 … 19 */
  xs: number[];
  /** 항목의 부류 — 0 또는 1 */
  ys: number[];
  /** 섞은 차례 여덟 — 0 부터 센 항목 자리 */
  orders: number[][];
  /** 나누기 사다리 — 손잡이 값이 이 목록의 자리다 */
  splitLadder: SplitRung[];
  /** 손잡이의 처음 값 */
  split: number;
};

export type Call = { item: number; fold: number; right: boolean };

export type FoldScore = {
  ok: number;
  n: number;
  pct: number;
  /** 시험지 폴드 f 의 가름점 */
  cuts: number[];
  /** 시험지에 앉은 항목마다 판정 — 폴드 차례, 폴드 안에서는 자리 차례 */
  calls: Call[];
};

/** 반올림 정수 백분율 — IR 과 같은 식. */
export function roundPercent(x: number, n: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(n) || n <= 0 || x < 0) {
    throw new Error(`백분율을 셀 수 없다: ${x} / ${n}`);
  }
  return Math.floor((x * 100 + Math.floor(n / 2)) / n);
}

/** 자리 p 의 폴드 — p // size. */
export function seatFolds(count: number, k: number): number[] {
  if (!Number.isInteger(k) || k <= 0 || count % k !== 0) {
    throw new Error(`항목 ${count} 을 폴드 ${k} 로 고르게 나눌 수 없다`);
  }
  const size = count / k;
  const folds: number[] = [];
  for (let p = 0; p < count; p++) folds.push(Math.floor(p / size));
  return folds;
}

/** 섞은 차례 하나 · 나누기 하나의 점수. IR `scorePercent` 와 같은 차례로 셈한다. */
export function foldScore(xs: number[], ys: number[], order: number[], k: number, used: number): FoldScore {
  const n = xs.length;
  if (ys.length !== n || order.length !== n) throw new Error('항목 · 부류 · 섞은 차례의 길이가 다르다');
  if (!Number.isInteger(used) || used < 1 || used > k) throw new Error(`시험지 폴드 수가 틀렸다: ${used} / ${k}`);
  const folds = seatFolds(n, k);
  const size = n / k;
  let ok = 0;
  const cuts: number[] = [];
  const calls: Call[] = [];
  for (let f = 0; f < used; f++) {
    let s0 = 0.0;
    let s1 = 0.0;
    let n0 = 0;
    let n1 = 0;
    for (let p = 0; p < n; p++) {
      if (folds[p] !== f) {
        const i = order[p];
        if (i === undefined || xs[i] === undefined) throw new Error(`섞은 차례의 자리 ${p} 가 항목을 가리키지 않는다`);
        if (ys[i] === 0) {
          s0 = s0 + xs[i];
          n0 += 1;
        } else if (ys[i] === 1) {
          s1 = s1 + xs[i];
          n1 += 1;
        } else {
          throw new Error(`항목 ${i} 의 부류가 0 · 1 이 아니다: ${ys[i]}`);
        }
      }
    }
    if (n0 === 0 || n1 === 0) throw new Error(`폴드 ${f} 를 뺀 나머지에 한 부류가 없다`);
    const cut = (s0 / n0 + s1 / n1) / 2.0;
    cuts.push(cut);
    for (let p = 0; p < n; p++) {
      if (folds[p] === f) {
        const i = order[p];
        if (i === undefined || xs[i] === undefined) throw new Error(`섞은 차례의 자리 ${p} 가 항목을 가리키지 않는다`);
        if (xs[i] === cut) throw new Error(`항목 ${i} 가 가름점과 같다 — 동률은 던진다`);
        const call = xs[i] > cut ? 1 : 0;
        const right = call === ys[i];
        if (right) ok += 1;
        calls.push({ item: i, fold: f, right });
      }
    }
  }
  const tested = used * size;
  return { ok, n: tested, pct: roundPercent(ok, tested), cuts, calls };
}

/** 점수 목록의 가장 낮음 · 가장 높음 · 폭. IR `scoreSpread` 와 같다. */
export function scoreSpread(pcts: number[]): { lo: number; hi: number; width: number } {
  const first = pcts[0];
  if (first === undefined) throw new Error('점수가 하나도 없다');
  let lo = first;
  let hi = first;
  for (let i = 1; i < pcts.length; i++) {
    const v = pcts[i] as number;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return { lo, hi, width: hi - lo };
}

/** 한 나누기의 섞음 여덟 점수 — 검사와 설명의 대조용. */
export function splitScores(data: CrossValidationData, split: number): number[] {
  const rung = data.splitLadder[split];
  if (rung === undefined) throw new Error(`나누기 사다리에 자리 ${split} 가 없다`);
  return data.orders.map((o) => foldScore(data.xs, data.ys, o, rung.k, rung.used).pct);
}

function checkData(data: CrossValidationData): void {
  const n = data.xs.length;
  if (n === 0 || data.ys.length !== n) throw new Error('항목과 부류의 길이가 다르다');
  if (data.orders.length === 0) throw new Error('섞은 차례가 없다');
  for (const o of data.orders) {
    const seen = [...o].sort((a, b) => a - b);
    for (let q = 0; q < n; q++) {
      if (seen[q] !== q) throw new Error('섞은 차례가 항목 자리를 한 번씩 담지 않는다');
    }
  }
  if (data.splitLadder.length === 0) throw new Error('나누기 사다리가 비었다');
  if (data.splitLadder[data.split] === undefined) throw new Error(`처음 나누기 ${data.split} 가 사다리에 없다`);
}

export async function crossValidationAlgorithm(baseCtx: FacetContext<CrossValidationData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<CrossValidationData>;
  const data = ctx.data;
  checkData(data);

  const shown = new Map<string, number>();
  /** 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다. */
  const setMetric = (name: string, value: number): void => {
    const before = shown.get(name);
    ctx.metric(name, before === undefined ? value : value - before);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const items = data.xs.map((x, i) => ({ x, cls: data.ys[i] as number }));

  /** 한 판을 끝까지 — 취소되면 false. */
  const playRound = async (split: number): Promise<boolean> => {
    const rung = data.splitLadder[split];
    if (rung === undefined) throw new Error(`나누기 사다리에 자리 ${split} 가 없다`);
    const folds = seatFolds(data.xs.length, rung.k);
    const size = data.xs.length / rung.k;

    setMetric('fits-per-shuffle', rung.used);
    setMetric('lowest-score', 0);
    setMetric('highest-score', 0);
    await ctx.emit({
      type: 'cv-start',
      payload: { split, k: rung.k, used: rung.used, size, items, seatFold: folds },
      silent: true,
    });
    if (!(await ctx.sleep(data.stepMs))) return false;

    const pcts: number[] = [];
    for (let s = 0; s < data.orders.length; s++) {
      if (ctx.cancelled) return false;
      const order = data.orders[s] as number[];
      const score = foldScore(data.xs, data.ys, order, rung.k, rung.used);
      const stack = pcts.filter((v) => v === score.pct).length;
      pcts.push(score.pct);
      const seen = scoreSpread(pcts);
      if (s === 0) {
        await phase('split');
        await ctx.emit({ type: 'deal', payload: { shuffle: s, order } });
        if (!(await ctx.sleep(data.stepMs))) return false;
        await phase('fit');
        await ctx.emit({ type: 'fit', payload: { shuffle: s, cuts: score.cuts } });
        if (!(await ctx.sleep(data.stepMs))) return false;
        await phase('judge');
        setMetric('lowest-score', seen.lo);
        setMetric('highest-score', seen.hi);
        await ctx.emit({
          type: 'judge',
          payload: { shuffle: s, calls: score.calls, ok: score.ok, n: score.n, pct: score.pct, stack },
        });
      } else {
        await phase('judge');
        setMetric('lowest-score', seen.lo);
        setMetric('highest-score', seen.hi);
        await ctx.emit({
          type: 'shuffle',
          payload: {
            shuffle: s,
            order,
            cuts: score.cuts,
            calls: score.calls,
            ok: score.ok,
            n: score.n,
            pct: score.pct,
            stack,
          },
        });
      }
      if (!(await ctx.sleep(data.stepMs))) return false;
    }

    if (ctx.cancelled) return false;
    const spread = scoreSpread(pcts);
    await phase('spread');
    await ctx.emit({ type: 'spread', payload: { lo: spread.lo, hi: spread.hi, width: spread.width } });
    return true;
  };

  try {
    let split = data.split;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(split))) return;
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'split') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) throw new Error('split 입력의 payload 가 객체가 아니다');
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number' || data.splitLadder[value] === undefined) {
          throw new Error(`split 입력의 값이 나누기 사다리에 없다: ${String(value)}`);
        }
        next = value;
      }
      split = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
