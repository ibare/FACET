/**
 * trapdoor-with-key — 열쇠가 있으면 되돌아온다.
 *
 * 숨긴 두 소수 p · q 에서 φ(n) = (p − 1)(q − 1) 을 셈하고, 확장 유클리드로
 * d = e⁻¹ mod φ(n) 을 셈한다. 평문을 차례로 c = m^e mod n 으로 잠근 뒤, 같은
 * 차례로 m = c^d mod n 으로 푼다. 거듭제곱은 곱할 때마다 mod n 으로 줄인다.
 *
 * 걸음 0 (처음 화면) 은 장면의 initial 이 initialData 에서 세운다 — 공개 n · e,
 * 숨긴 p · q, 평문 목록. 알고리즘이 셈하는 값은 아래 이벤트로만 온다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나):
 *   - 'phi'    payload { p: number; q: number; phi: number }
 *              φ(n) = (p − 1)(q − 1)
 *   - 'key'    payload { e: number; phi: number; d: number; product: number; quotient: number; remainder: number }
 *              d = e⁻¹ mod φ. 확인: e × d = product = quotient × φ + remainder (remainder 는 1)
 *   - 'lock'   payload { index: number; m: number; c: number }
 *              index 번째 평문 m 을 c = m^e mod n 으로 잠갔다
 *   - 'unlock' payload { index: number; c: number; m: number }
 *              index 번째 암호문 c 를 m = c^d mod n 으로 풀었다
 *
 * 차례: phi → key → lock × 평문 수 → unlock × 평문 수. 모든 발신 앞에 stepMs 를
 * 둔다 (걸음 0 이 이미 읽을 것이 있는 화면이다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TrapdoorWithKeyFacetData = {
  type: 'trapdoor-with-key';
  stepMs: number;
  /** 공개 모듈러스 */
  n: number;
  /** 공개 지수 */
  e: number;
  /** 숨긴 소수 */
  p: number;
  q: number;
  /** 잠글 평문 — 차례대로 */
  plains: number[];
};

function field(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`trapdoor-with-key: ${where}.${key} 가 정수가 아니다 (${String(v)})`);
  }
  return v;
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 쓴다. 모양이 어긋나면 던진다. */
export function narrowTrapdoorData(data: unknown): TrapdoorWithKeyFacetData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('trapdoor-with-key: initialData 가 객체가 아니다');
  }
  const o = data as Record<string, unknown>;
  if (o.type !== 'trapdoor-with-key') {
    throw new Error(`trapdoor-with-key: initialData.type 이 'trapdoor-with-key' 가 아니다 (${String(o.type)})`);
  }
  const stepMs = field(o, 'stepMs', 'initialData');
  const n = field(o, 'n', 'initialData');
  const e = field(o, 'e', 'initialData');
  const p = field(o, 'p', 'initialData');
  const q = field(o, 'q', 'initialData');
  if (!Array.isArray(o.plains) || o.plains.length === 0) {
    throw new Error('trapdoor-with-key: initialData.plains 가 비었거나 배열이 아니다');
  }
  const plains = o.plains.map((v, i) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= n) {
      throw new Error(`trapdoor-with-key: initialData.plains[${i}] 가 0 이상 n 미만의 정수가 아니다 (${String(v)})`);
    }
    return v;
  });
  if (p < 2 || q < 2) throw new Error(`trapdoor-with-key: p · q 는 2 이상이어야 한다 (p ${p} · q ${q})`);
  if (p * q !== n) {
    throw new Error(`trapdoor-with-key: n 이 p × q 가 아니다 (n ${n} · p × q ${p * q})`);
  }
  return { type: 'trapdoor-with-key', stepMs, n, e, p, q, plains };
}

/** base^exp mod m — 곱할 때마다 mod m 으로 줄인다. */
export function modPow(base: number, exp: number, m: number): number {
  if (m < 1 || exp < 0) throw new Error(`trapdoor-with-key: modPow 인자가 어긋났다 (exp ${exp} · m ${m})`);
  let result = 1 % m;
  let b = base % m;
  let k = exp;
  while (k > 0) {
    if (k % 2 === 1) result = (result * b) % m;
    b = (b * b) % m;
    k = Math.floor(k / 2);
  }
  return result;
}

/** a⁻¹ mod m — 확장 유클리드. 역원이 없으면 던진다. */
export function modInverse(a: number, m: number): number {
  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const quot = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - quot * r];
    [oldS, s] = [s, oldS - quot * s];
  }
  if (oldR !== 1) throw new Error(`trapdoor-with-key: ${a} 의 mod ${m} 역원이 없다 (최대공약수 ${oldR})`);
  return ((oldS % m) + m) % m;
}

export async function trapdoorWithKey(
  context: FacetContext<TrapdoorWithKeyFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<TrapdoorWithKeyFacetData>;
  const data = narrowTrapdoorData(ctx.data);
  const { stepMs, n, e, p, q, plains } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 1 — 숨긴 p · q 에서 φ
  if (!(await pause())) return;
  const phi = (p - 1) * (q - 1);
  await ctx.emit({ type: 'phi', payload: { p, q, phi } });

  // 걸음 2 — φ 에서 d
  if (!(await pause())) return;
  const d = modInverse(e, phi);
  const product = e * d;
  const quotient = Math.floor(product / phi);
  const remainder = product % phi;
  if (remainder !== 1) {
    throw new Error(`trapdoor-with-key: e × d mod φ 가 1 이 아니다 (${remainder})`);
  }
  await ctx.emit({ type: 'key', payload: { e, phi, d, product, quotient, remainder } });

  // 잠금 — 평문 차례대로
  const ciphers: number[] = [];
  for (let index = 0; index < plains.length; index += 1) {
    if (!(await pause())) return;
    const m = plains[index];
    if (m === undefined) throw new Error(`trapdoor-with-key: plains[${index}] 가 없다`);
    const c = modPow(m, e, n);
    ciphers.push(c);
    await ctx.emit({ type: 'lock', payload: { index, m, c } });
  }

  // 풀기 — 같은 차례로
  for (let index = 0; index < ciphers.length; index += 1) {
    if (!(await pause())) return;
    const c = ciphers[index];
    if (c === undefined) throw new Error(`trapdoor-with-key: ciphers[${index}] 가 없다`);
    const m = modPow(c, d, n);
    await ctx.emit({ type: 'unlock', payload: { index, c, m } });
  }
}
