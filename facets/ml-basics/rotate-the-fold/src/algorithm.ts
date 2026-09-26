/**
 * rotate-the-fold — 교차 검증: 시험지 자리가 폴드에서 폴드로 돈다.
 *
 * 폴드 번호 차례대로 한 폴드가 시험지 자리에 앉고, 나머지 폴드의 항목으로
 * 부류 평균의 가운데(가름점)를 새로 배운 뒤 시험지의 항목을 가린다.
 * 모형은 `x > 가름점` 이면 부류 1. 점수는 폴드마다 맞힌 수다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 *
 *   fold     한 폴드가 시험지 자리에 앉았다
 *     payload {
 *       fold:    number                   // 시험지가 된 폴드 번호
 *       mean0:   number                   // 훈련 항목 중 부류 0 의 x 평균
 *       mean1:   number                   // 훈련 항목 중 부류 1 의 x 평균
 *       split:   number                   // (mean0 + mean1) / 2
 *       results: { id: string; predicted: 0 | 1; right: boolean }[]  // 시험지 항목마다
 *       correct: number                   // 시험지에서 맞힌 수
 *       total:   number                   // 시험지 항목 수
 *     }
 *
 *   summary  모든 폴드가 한 번씩 앉은 뒤의 합
 *     payload {
 *       correct:  number                  // 폴드별 맞힌 수의 합
 *       total:    number                  // 시험지에 앉은 항목 수의 합
 *       accuracy: number                  // 폴드별 정확도(맞힌 수 / 항목 수)의 평균
 *       seatMin:  number                  // 항목마다 시험지에 앉은 횟수의 가장 작은 값
 *       seatMax:  number                  // 같은 횟수의 가장 큰 값
 *     }
 *
 * 걸음 0 은 장면의 initial 이 initialData 에서 세운다 (항목과 폴드). 걸음 0 에도
 * 읽을 것이 있으므로 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FoldItem = {
  id: string;
  x: number;
  cls: 0 | 1;
  fold: number;
};

export type RotateTheFoldFacetData = {
  type: 'rotate-the-fold';
  stepMs: number;
  items: FoldItem[];
};

export type FoldResult = { id: string; predicted: 0 | 1; right: boolean };

export type FoldFit = { mean0: number; mean1: number; split: number };

function fail(path: string, why: string): never {
  throw new Error(`rotate-the-fold: ${path} — ${why}`);
}

/** initialData 의 좁히개. 알고리즘과 장면이 함께 부른다. */
export function narrowRotateTheFoldData(raw: unknown): RotateTheFoldFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'rotate-the-fold') fail('data.type', `'rotate-the-fold' 가 아니다`);
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) fail('data.stepMs', '양수가 아니다');
  if (!Array.isArray(r.items) || r.items.length === 0) fail('data.items', '빈 배열이거나 배열이 아니다');
  const seen = new Set<string>();
  const items: FoldItem[] = r.items.map((it: unknown, i: number) => {
    const at = `data.items[${i}]`;
    if (typeof it !== 'object' || it === null) fail(at, '객체가 아니다');
    const o = it as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id === '') fail(`${at}.id`, '빈 문자열이거나 문자열이 아니다');
    if (seen.has(o.id)) fail(`${at}.id`, `겹친다: ${o.id}`);
    seen.add(o.id);
    if (typeof o.x !== 'number' || !Number.isFinite(o.x)) fail(`${at}.x`, '유한한 수가 아니다');
    if (o.cls !== 0 && o.cls !== 1) fail(`${at}.cls`, '0 또는 1 이 아니다');
    if (typeof o.fold !== 'number' || !Number.isInteger(o.fold) || o.fold < 1) {
      fail(`${at}.fold`, '1 이상의 정수가 아니다');
    }
    return { id: o.id, x: o.x, cls: o.cls, fold: o.fold };
  });
  if (foldOrder(items).length < 2) fail('data.items', '폴드가 둘 이상이어야 돌 수 있다');
  return { type: 'rotate-the-fold', stepMs: r.stepMs, items };
}

/** 폴드 번호를 작은 것부터. 시험지 자리가 도는 차례다. */
export function foldOrder(items: readonly FoldItem[]): number[] {
  return [...new Set(items.map((it) => it.fold))].sort((a, b) => a - b);
}

/** 수직선의 범위 — 항목 x 의 바깥 정수. 바탕에서 정해지는 작은 셈. */
export function axisRange(items: readonly FoldItem[]): { lo: number; hi: number } {
  const xs = items.map((it) => it.x);
  const lo = Math.floor(Math.min(...xs));
  let hi = Math.ceil(Math.max(...xs));
  if (hi === lo) hi = lo + 1;
  return { lo, hi };
}

function mean(xs: readonly number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/** 부류 평균의 가운데. 훈련 항목에 두 부류가 모두 있어야 셈할 수 있다. */
export function fitSplit(train: readonly FoldItem[], fold: number): FoldFit {
  const x0 = train.filter((it) => it.cls === 0).map((it) => it.x);
  const x1 = train.filter((it) => it.cls === 1).map((it) => it.x);
  if (x0.length === 0 || x1.length === 0) {
    fail(`fold ${fold}`, '훈련 항목에 한 부류가 없어 가름점을 셈할 수 없다');
  }
  const mean0 = mean(x0);
  const mean1 = mean(x1);
  return { mean0, mean1, split: (mean0 + mean1) / 2 };
}

export async function rotateTheFold(
  context: FacetContext<RotateTheFoldFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<RotateTheFoldFacetData>;
  const data = narrowRotateTheFoldData(ctx.data);
  const { stepMs, items } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const seats = new Map<string, number>(items.map((it) => [it.id, 0]));
  const accuracies: number[] = [];
  let correctSum = 0;
  let totalSum = 0;

  for (const fold of foldOrder(items)) {
    if (!(await pause())) return;
    const test = items.filter((it) => it.fold === fold);
    const train = items.filter((it) => it.fold !== fold);
    const fit = fitSplit(train, fold);
    const results: FoldResult[] = test.map((it) => {
      if (it.x === fit.split) fail(`item ${it.id}`, `x 가 가름점 ${fit.split} 과 같아 가를 수 없다`);
      const predicted: 0 | 1 = it.x > fit.split ? 1 : 0;
      seats.set(it.id, (seats.get(it.id) as number) + 1);
      return { id: it.id, predicted, right: predicted === it.cls };
    });
    const correct = results.filter((r) => r.right).length;
    correctSum += correct;
    totalSum += test.length;
    accuracies.push(correct / test.length);
    await ctx.emit({
      type: 'fold',
      payload: {
        fold,
        mean0: fit.mean0,
        mean1: fit.mean1,
        split: fit.split,
        results,
        correct,
        total: test.length,
      },
    });
  }

  if (!(await pause())) return;
  const counts = [...seats.values()];
  await ctx.emit({
    type: 'summary',
    payload: {
      correct: correctSum,
      total: totalSum,
      accuracy: mean(accuracies),
      seatMin: Math.min(...counts),
      seatMax: Math.max(...counts),
    },
  });
}
