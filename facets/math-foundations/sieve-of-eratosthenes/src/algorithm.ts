/**
 * 에라토스테네스의 체 — 소수 p 가 새로 지우는 첫 수는 p × p 다.
 *
 * 판 2..N 에서 지워지지 않은 가장 작은 수 p 의 차례가 오면 p 의 배수 2p, 3p, … ≤ N 을
 * 작은 것부터 짚는다. 이미 지워진 수는 처음 지운 소수("지운 이")를 그대로 두고 지나가고,
 * 안 지워진 수는 p 가 지운다. p × p > N 인 첫 소수에서 멈추고, 한 번도 지워지지 않은 수가 남는다.
 *
 * 이벤트
 *   init   (silent) { sieving: number[] }
 *          — 차례가 오는 소수 전부 (p × p ≤ N). 지운 이의 색 수를 정한다
 *   sieve  { p: number; sq: number; hits: Array<{ n: number; k: number; by: number }> }
 *          — p 의 차례 한 번. hits 는 p 의 배수 n = p × k 를 작은 것부터.
 *            by === p 면 이 걸음에 새로 지운 수, 아니면 먼저 지운 소수
 *   stop   { p: number; sq: number; primes: number[] }
 *          — 다음 소수 p 는 p × p = sq > N 이라 멈춘다. primes 는 남은 수 전부
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SieveOfEratosthenesFacetData = {
  type: 'sieve-of-eratosthenes';
  /** 판 끝 N — 판은 2..N */
  n: number;
  stepMs: number;
};

export type SieveHit = { n: number; k: number; by: number };
export type SieveTurn = { p: number; sq: number; hits: SieveHit[] };
export type SieveStop = { p: number; sq: number; primes: number[] };
export type SievePlan = { sieving: number[]; turns: SieveTurn[]; stop: SieveStop };

/** 자료 좁히개 — 알고리즘 · 장면 · 무대가 함께 쓴다. */
export function narrowSieveData(raw: unknown): SieveOfEratosthenesFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('sieve-of-eratosthenes: data 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'sieve-of-eratosthenes') {
    throw new Error(`sieve-of-eratosthenes: data.type 이 어긋났다 (${String(d.type)})`);
  }
  const { n, stepMs } = d;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 4) {
    throw new Error(`sieve-of-eratosthenes: data.n 은 4 이상 정수여야 한다 (${String(n)})`);
  }
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error(`sieve-of-eratosthenes: data.stepMs 가 양수가 아니다 (${String(stepMs)})`);
  }
  return { type: 'sieve-of-eratosthenes', n, stepMs };
}

/** 판 — 2..n. 1 은 판에 없다. */
export function boardOf(n: number): number[] {
  const cells: number[] = [];
  for (let m = 2; m <= n; m += 1) cells.push(m);
  return cells;
}

/** 체를 끝까지 돌려 걸음 차례를 셈한다. 무작위 없음. */
export function planSieve(n: number): SievePlan {
  const board = boardOf(n);
  const struckBy = new Map<number, number>();
  const turns: SieveTurn[] = [];
  const nextAfter = (after: number): number | null => {
    for (const m of board) {
      if (m > after && !struckBy.has(m)) return m;
    }
    return null;
  };
  let p = nextAfter(1);
  while (p !== null && p * p <= n) {
    const hits: SieveHit[] = [];
    for (let m = 2 * p; m <= n; m += p) {
      const prior = struckBy.get(m);
      if (prior === undefined) {
        struckBy.set(m, p);
        hits.push({ n: m, k: m / p, by: p });
      } else {
        hits.push({ n: m, k: m / p, by: prior });
      }
    }
    turns.push({ p, sq: p * p, hits });
    p = nextAfter(p);
  }
  if (p === null) {
    throw new Error(`sieve-of-eratosthenes: 판 2..${n} 에 멈출 다음 소수가 없다`);
  }
  const primes = board.filter((m) => !struckBy.has(m));
  return {
    sieving: turns.map((turn) => turn.p),
    turns,
    stop: { p, sq: p * p, primes },
  };
}

export async function sieveOfEratosthenes(
  ctx: FacetContext<SieveOfEratosthenesFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<SieveOfEratosthenesFacetData>;
  const data = narrowSieveData(rctx.data);
  const { stepMs } = data;
  const plan = planSieve(data.n);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  await rctx.emit({ type: 'init', payload: { sieving: plan.sieving }, silent: true });

  // 걸음 0 은 판 전체다 — 읽을 틈을 두고 첫 차례로 간다
  for (const turn of plan.turns) {
    if (!(await pause())) return;
    await rctx.emit({
      type: 'sieve',
      payload: { p: turn.p, sq: turn.sq, hits: turn.hits.map((h) => ({ ...h })) },
    });
  }

  if (!(await pause())) return;
  await rctx.emit({
    type: 'stop',
    payload: { p: plan.stop.p, sq: plan.stop.sq, primes: [...plan.stop.primes] },
  });
}
