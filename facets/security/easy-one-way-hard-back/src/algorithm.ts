/**
 * easy-one-way-hard-back — 가기는 곱셈 한 번, 돌아오기는 쌓이는 나눗셈.
 *
 * 가는 쪽은 두 소수 p · q 를 쥐고 n = p × q 를 한 번 셈한다. 돌아오는 쪽은 n 만 쥐고
 * p · q 를 쓰지 않는다 — 2 부터 ⌊√n⌋ 이하의 소수를 작은 것부터 차례로 나눠 보고,
 * 처음으로 나머지 0 이 나온 후보에서 멈춘다. 그 후보와 n ÷ 후보 가 되찾은 두 소수다.
 * 걸음 하나 = 곱셈 하나 / 나눗셈 하나.
 *
 * 이벤트
 *   init      silent. { p: number; q: number; candidates: number[];
 *                       multiplications: 0; divisions: 0 }
 *             candidates 는 돌아오는 쪽이 차례로 나눠 볼 소수 목록(알고리즘이 셈한다).
 *   multiply  { p: number; q: number; n: number; multiplications: number }
 *             가는 길의 곱셈 한 번.
 *   divide    { n: number; d: number; r: number; divisions: number }
 *             돌아오는 길의 나눗셈 하나. r 은 n mod d, 0 이 아니다.
 *   found     { n: number; d: number; e: number; r: number; divisions: number }
 *             나머지 0 이 나온 나눗셈. r 은 0, e = n ÷ d. 이 걸음에서 멈춘다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EasyOneWayHardBackFacetData = {
  type: 'easy-one-way-hard-back';
  /** 가는 쪽이 쥔 두 소수. 예로 정한 값이다. */
  p: number;
  q: number;
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
};

function isPrime(k: number): boolean {
  if (k < 2) return false;
  for (let d = 2; d * d <= k; d += 1) {
    if (k % d === 0) return false;
  }
  return true;
}

/** 모양을 검사하고 어긋나면 던진다. 알고리즘과 장면이 함께 부른다. */
export function narrowEasyOneWayHardBackData(raw: unknown): EasyOneWayHardBackFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('easy-one-way-hard-back: 자료가 객체가 아니다');
  }
  const o = raw as Record<string, unknown>;
  if (o.type !== 'easy-one-way-hard-back') {
    throw new Error(`easy-one-way-hard-back: type 이 어긋났다 (${String(o.type)})`);
  }
  for (const key of ['p', 'q'] as const) {
    const v = o[key];
    if (typeof v !== 'number' || !Number.isInteger(v) || !isPrime(v)) {
      throw new Error(`easy-one-way-hard-back: ${key} 가 소수가 아니다 (${String(v)})`);
    }
  }
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) {
    throw new Error(`easy-one-way-hard-back: stepMs 가 양수가 아니다 (${String(o.stepMs)})`);
  }
  const p = o.p as number;
  const q = o.q as number;
  if (!Number.isSafeInteger(p * q)) {
    throw new Error('easy-one-way-hard-back: p × q 가 안전한 정수 범위를 넘는다');
  }
  return { type: 'easy-one-way-hard-back', p, q, stepMs: o.stepMs };
}

/** ⌊√n⌋ — 부동소수 끝자리에 기대지 않고 정수로 맞춘다. */
export function integerSqrt(n: number): number {
  let s = Math.floor(Math.sqrt(n));
  while (s * s > n) s -= 1;
  while ((s + 1) * (s + 1) <= n) s += 1;
  return s;
}

/** 돌아오는 쪽의 후보 — 2 부터 ⌊√n⌋ 이하의 소수, 작은 것부터. n 만 보고 셈한다. */
export function trialCandidates(n: number): number[] {
  const limit = integerSqrt(n);
  const out: number[] = [];
  for (let k = 2; k <= limit; k += 1) {
    if (isPrime(k)) out.push(k);
  }
  return out;
}

export async function easyOneWayHardBack(
  context: FacetContext<EasyOneWayHardBackFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<EasyOneWayHardBackFacetData>;
  const { p, q, stepMs } = narrowEasyOneWayHardBackData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 후보 목록은 n 에서만 나온다. n 은 곱셈 뒤에야 건네지지만, 무대가 쌓을 자리를
  // 미리 알아야 하므로 목록은 바탕으로 싣는다 — 돌아오는 셈은 아래 루프가 한다.
  const n = p * q;
  const candidates = trialCandidates(n);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { p, q, candidates, multiplications: 0, divisions: 0 },
  });

  // 걸음 0 에 두 소수가 이미 서 있다 — 읽을 틈을 준다.
  if (!(await pause())) return;

  // 가는 길 — 곱셈 한 번.
  const multiplications = 1;
  await ctx.emit({ type: 'multiply', payload: { p, q, n, multiplications } });

  // 돌아오는 길 — n 만 쥐고 차례로 나눈다.
  let divisions = 0;
  for (const d of candidates) {
    if (!(await pause())) return;
    divisions += 1;
    const r = n % d;
    if (r === 0) {
      const e = n / d;
      const back = [d, e].sort((a, b) => a - b);
      const went = [p, q].sort((a, b) => a - b);
      if (back[0] !== went[0] || back[1] !== went[1]) {
        throw new Error(`easy-one-way-hard-back: 되찾은 ${d} × ${e} 가 ${p} × ${q} 와 다르다`);
      }
      await ctx.emit({ type: 'found', payload: { n, d, e, r, divisions } });
      return;
    }
    await ctx.emit({ type: 'divide', payload: { n, d, r, divisions } });
  }
  throw new Error(`easy-one-way-hard-back: ${n} 의 소인수를 후보 안에서 찾지 못했다`);
}
