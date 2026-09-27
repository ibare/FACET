/**
 * euclid-gcd — 빼기꼴 유클리드 호제법.
 *
 * 순서쌍 (왼쪽, 오른쪽) 에서 큰 쪽이 제 자리에서 (큰 − 작은) 으로 바뀐다. 두 수가
 * 같아지면 멈추고, 그 수가 최대공약수다. 걸음마다 두 수 각각의 약수 목록과 공약수
 * 목록을 셈해 싣는다 — 약수 목록은 바뀌고 공약수 목록은 남는다는 것을 화면이 보인다.
 *
 * 이벤트
 *
 * - `init` (silent: true) — 걸음 0 을 채운다
 *   payload: {
 *     left: number; right: number;          // 처음 두 수
 *     top: number;                          // 처음 두 수 중 큰 것 (막대 축척의 기준)
 *     columns: number[];                    // 재생 내내 나오는 약수 전부, 작은 것부터 (칸 차례)
 *     leftDivisors: number[]; rightDivisors: number[]; common: number[];
 *   }
 * - `subtract` — 뺄셈 한 번 = 걸음 하나
 *   payload: {
 *     side: 'left' | 'right';               // 줄어드는 쪽 (큰 쪽)
 *     from: number; by: number; to: number; // from − by = to
 *     fromDivisors: number[];               // 줄기 전 그 자리 수의 약수
 *     fromCommon: number[];                 // 뺄셈 전 공약수
 *     divisors: number[];                   // to 의 약수
 *     common: number[];                     // 뺄셈 뒤 공약수
 *   }
 *
 * 두 수가 같아진 걸음이 마지막이다. 멈춤은 따로 발신하지 않는다 — 장면이 두 수가
 * 같음을 보고 안다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EuclidGcdFacetData = {
  type: 'euclid-gcd';
  left: number;
  right: number;
  stepMs: number;
};

function isPositiveInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x > 0;
}

/** initialData 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다. */
export function readEuclidGcdData(raw: unknown): EuclidGcdFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('euclid-gcd: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'euclid-gcd') {
    throw new Error(`euclid-gcd: initialData.type 이 'euclid-gcd' 가 아니다 (${String(r.type)})`);
  }
  if (!isPositiveInt(r.left)) throw new Error('euclid-gcd: initialData.left 는 양의 정수여야 한다');
  if (!isPositiveInt(r.right)) throw new Error('euclid-gcd: initialData.right 는 양의 정수여야 한다');
  if (!isPositiveInt(r.stepMs)) throw new Error('euclid-gcd: initialData.stepMs 는 양의 정수여야 한다');
  return { type: 'euclid-gcd', left: r.left, right: r.right, stepMs: r.stepMs };
}

/** n 의 약수 — 1 과 n 을 넣어 작은 것부터. */
export function divisorsOf(n: number): number[] {
  if (!isPositiveInt(n)) throw new Error(`euclid-gcd: 약수를 셀 수 없는 수 (${String(n)})`);
  const out: number[] = [];
  for (let d = 1; d <= n; d += 1) {
    if (n % d === 0) out.push(d);
  }
  return out;
}

/** 두 약수 목록에 모두 있는 것, 작은 것부터. */
export function commonOf(a: readonly number[], b: readonly number[]): number[] {
  const inB = new Set(b);
  return a.filter((d) => inB.has(d));
}

type Pair = { left: number; right: number };

/** 뺄셈을 끝까지 셈한 쌍의 차례 (처음 쌍을 넣어). */
function runPairs(left: number, right: number): Pair[] {
  const pairs: Pair[] = [{ left, right }];
  let a = left;
  let b = right;
  while (a !== b) {
    if (a > b) a -= b;
    else b -= a;
    pairs.push({ left: a, right: b });
  }
  return pairs;
}

export async function euclidGcd(ctxIn: FacetContext<EuclidGcdFacetData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<EuclidGcdFacetData>;
  const data = readEuclidGcdData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const pairs = runPairs(data.left, data.right);
  const seen = new Set<number>();
  for (const p of pairs) {
    for (const d of divisorsOf(p.left)) seen.add(d);
    for (const d of divisorsOf(p.right)) seen.add(d);
  }
  const columns = [...seen].sort((x, y) => x - y);

  let left = data.left;
  let right = data.right;
  let leftDivisors = divisorsOf(left);
  let rightDivisors = divisorsOf(right);
  let common = commonOf(leftDivisors, rightDivisors);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      left,
      right,
      top: Math.max(left, right),
      columns,
      leftDivisors,
      rightDivisors,
      common,
    },
  });

  while (left !== right) {
    if (!(await pause())) return;
    const fromCommon = common;
    if (left > right) {
      const from = left;
      const fromDivisors = leftDivisors;
      left = from - right;
      leftDivisors = divisorsOf(left);
      common = commonOf(leftDivisors, rightDivisors);
      await ctx.emit({
        type: 'subtract',
        payload: {
          side: 'left',
          from,
          by: right,
          to: left,
          fromDivisors,
          fromCommon,
          divisors: leftDivisors,
          common,
        },
      });
    } else {
      const from = right;
      const fromDivisors = rightDivisors;
      right = from - left;
      rightDivisors = divisorsOf(right);
      common = commonOf(leftDivisors, rightDivisors);
      await ctx.emit({
        type: 'subtract',
        payload: {
          side: 'right',
          from,
          by: left,
          to: right,
          fromDivisors,
          fromCommon,
          divisors: rightDivisors,
          common,
        },
      });
    }
  }
}
