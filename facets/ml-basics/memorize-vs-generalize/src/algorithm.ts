/**
 * memorize-vs-generalize — 같은 여섯 예를 받은 두 답안자가 본 문제와 새 문제에 답한다.
 *
 * 외운 쪽은 본 것을 표로 쥐고 가장 가까운 x 의 답을 낸다. 배운 쪽은 문턱 하나
 * (`x > threshold` 면 1) 를 본 것에서 고른다. 묻는 차례는 본 것 적힌 차례, 이어 새 것 적힌 차례.
 *
 * 이벤트
 *   init (silent)
 *     payload: { threshold: number; axis: { min: number; max: number } }
 *       threshold — 본 것에서 틀린 수가 가장 적은 문턱 후보 (유일하지 않으면 던진다)
 *       axis      — 수직선의 범위 (본 것 · 새 것 x 의 내림 · 올림)
 *   ask
 *     payload: {
 *       phase: 'seen' | 'fresh';   // 본 문제인가 새 문제인가
 *       index: number;             // 그 쪽 안에서 몇 번째 (0 부터)
 *       x: number; answer: 0 | 1;  // 문제와 정답
 *       memo: { guess: 0 | 1; near: number; right: boolean };  // 외운 쪽 — 찾은 가까운 예의 x
 *       rule: { guess: 0 | 1; right: boolean };                // 배운 쪽
 *       score: { memo: number; rule: number };  // 이 문제까지 그 쪽(phase)에서 맞힌 누적 수
 *     }
 *
 * ctx.metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Label = 0 | 1;
export type Example = { x: number; y: Label };
export type Phase = 'seen' | 'fresh';
export type Answerer = 'memo' | 'rule';

export type MemorizeVsGeneralizeFacetData = {
  type: 'memorize-vs-generalize';
  stepMs: number;
  seen: Example[];
  fresh: Example[];
};

function narrowExamples(v: unknown, path: string): Example[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${path}: 예의 배열이어야 한다`);
  return v.map((e: unknown, i) => {
    if (typeof e !== 'object' || e === null) throw new Error(`${path}[${i}]: 객체가 아니다`);
    const x = (e as { x?: unknown }).x;
    const y = (e as { y?: unknown }).y;
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${path}[${i}].x: 수가 아니다`);
    if (y !== 0 && y !== 1) throw new Error(`${path}[${i}].y: 0 이나 1 이어야 한다`);
    return { x, y };
  });
}

/** 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 던진다. */
export function narrowMemorizeData(v: unknown): MemorizeVsGeneralizeFacetData {
  if (typeof v !== 'object' || v === null) throw new Error('initialData: 객체가 아니다');
  const o = v as Record<string, unknown>;
  if (o.type !== 'memorize-vs-generalize') throw new Error('initialData.type: memorize-vs-generalize 가 아니다');
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) throw new Error('initialData.stepMs: 양수가 아니다');
  const seen = narrowExamples(o.seen, 'initialData.seen');
  if (seen.length < 2) throw new Error('initialData.seen: 문턱 후보를 만들려면 둘 이상이어야 한다');
  return { type: 'memorize-vs-generalize', stepMs: o.stepMs, seen, fresh: narrowExamples(o.fresh, 'initialData.fresh') };
}

/** 외운 쪽 — 같은 x 면 거리 0, 아니면 가장 가까운 본 것. 거리 동률이면 던진다. */
export function nearestSeen(seen: readonly Example[], x: number): Example {
  let best: Example | null = null;
  let bestD = Infinity;
  let tie = false;
  for (const e of seen) {
    const d = Math.abs(x - e.x);
    if (d < bestD) {
      best = e;
      bestD = d;
      tie = false;
    } else if (d === bestD) {
      tie = true;
    }
  }
  if (best === null) throw new Error('nearestSeen: 본 것이 없다');
  if (tie) throw new Error(`nearestSeen: x = ${x} 에서 가장 가까운 예가 둘이다`);
  return best;
}

/** 배운 쪽 — 정렬한 본 것 x 의 이웃한 둘의 가운데 중 본 것에서 틀린 수가 가장 적은 것. 동률이면 던진다. */
export function learnThreshold(seen: readonly Example[]): number {
  const xs = seen.map((e) => e.x).sort((a, b) => a - b);
  let best: number | null = null;
  let bestErr = Infinity;
  let tie = false;
  for (let i = 0; i + 1 < xs.length; i += 1) {
    const lo = xs[i];
    const hi = xs[i + 1];
    if (lo === undefined || hi === undefined) throw new Error(`learnThreshold: 후보 ${i} 의 이웃이 없다`);
    if (lo === hi) throw new Error(`learnThreshold: 같은 x ${lo} 가 둘이다`);
    const c = (lo + hi) / 2;
    const err = seen.filter((e) => ruleGuess(c, e.x) !== e.y).length;
    if (err < bestErr) {
      best = c;
      bestErr = err;
      tie = false;
    } else if (err === bestErr) {
      tie = true;
    }
  }
  if (best === null) throw new Error('learnThreshold: 후보가 없다');
  if (tie) throw new Error('learnThreshold: 틀린 수가 가장 적은 후보가 둘 이상이다');
  return best;
}

/** 배운 쪽의 답 — x 가 문턱과 같으면 던진다. */
export function ruleGuess(threshold: number, x: number): Label {
  if (x === threshold) throw new Error(`ruleGuess: x = ${x} 가 문턱 위에 있다`);
  return x > threshold ? 1 : 0;
}

export async function memorizeVsGeneralize(
  ctx: FacetContext<MemorizeVsGeneralizeFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<MemorizeVsGeneralizeFacetData>;
  const data = narrowMemorizeData(ctx.data);
  const { seen, fresh, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const threshold = learnThreshold(seen);
  const all = [...seen, ...fresh].map((e) => e.x);
  const axis = { min: Math.floor(Math.min(...all)), max: Math.ceil(Math.max(...all)) };
  await ctx.emit({ type: 'init', payload: { threshold, axis }, silent: true });

  const phases: { phase: Phase; items: Example[] }[] = [
    { phase: 'seen', items: seen },
    { phase: 'fresh', items: fresh },
  ];
  for (const { phase, items } of phases) {
    if (ctx.cancelled) return;
    const score = { memo: 0, rule: 0 };
    for (let index = 0; index < items.length; index += 1) {
      // 걸음 0 (두 쪽 준비) 에도 읽을 틈을 둔다 — 문이 첫 문장이다
      if (!(await pause())) return;
      const q = items[index];
      if (q === undefined) throw new Error(`${phase}[${index}]: 문제가 없다`);
      const near = nearestSeen(seen, q.x);
      const rg = ruleGuess(threshold, q.x);
      if (near.y === q.y) score.memo += 1;
      if (rg === q.y) score.rule += 1;
      await ctx.emit({
        type: 'ask',
        payload: {
          phase,
          index,
          x: q.x,
          answer: q.y,
          memo: { guess: near.y, near: near.x, right: near.y === q.y },
          rule: { guess: rg, right: rg === q.y },
          score: { memo: score.memo, rule: score.rule },
        },
      });
    }
  }
}
