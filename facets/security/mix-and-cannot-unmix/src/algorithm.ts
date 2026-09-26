/**
 * mix-and-cannot-unmix — 섞은 값 A 에서 지수를 거슬러 짐작할 실마리가 남는가.
 *
 * g 를 지수 k = 1..p − 1 까지 하나씩 올려 거듭제곱한다. 같은 걸음에서 두 쪽을 함께 셈한다.
 *   plain = g^k           (섞지 않은 값 — 늘 커진다)
 *   mixed = g^k mod p     (섞은 값 — 곱할 때마다 mod 로 줄인다)
 * 공개값 A = g^a mod p 는 데이터의 비밀 지수 a 에서 셈한다. mixed 가 A 와 같아지는 걸음을
 * 셈으로 찾고, 그 지수가 a 와 다르면 던진다. 만난 뒤에도 p − 1 까지 간다.
 *
 * 이벤트
 *   init   (silent) — 걸음 0 의 바탕을 갈아 끼운다
 *     payload: {
 *       A: number                 공개값 g^a mod p
 *       plainRungs: number[]      섞지 않은 값 g^1..g^(p−1) 을 작은 것부터
 *       mixedSlots: number[]      섞은 값이 놓일 수 있는 자리 1..p − 1
 *       ups: { plain: number; mixed: number }     오름 누계의 출발 (걸음 0 — 둘 다 0)
 *       downs: { plain: number; mixed: number }   내림 누계의 출발
 *     }
 *   visit  — 지수 하나를 올린 걸음
 *     payload: {
 *       k: number                 지수
 *       plain: number             g^k
 *       mixed: number             g^k mod p
 *       plainDir: 'none' | 'up' | 'down'   앞 걸음의 plain 과 견준 방향 (k 1 은 none)
 *       mixedDir: 'none' | 'up' | 'down'   앞 걸음의 mixed 와 견준 방향
 *       met: boolean              mixed === A
 *       ups: { plain: number; mixed: number }     이 걸음까지의 오름 누계
 *       downs: { plain: number; mixed: number }   이 걸음까지의 내림 누계
 *       summary?: {               마지막 걸음에만
 *         rankA: number           섞은 값 가운데 A 의 크기 순위 (작은 쪽부터 1)
 *         count: number           섞은 값의 수
 *         metK: number            A 를 만난 지수
 *         plainAtMet: number      g^metK
 *         plainRank: number       섞지 않은 값 가운데 g^metK 의 크기 순위
 *       }
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MixAndCannotUnmixFacetData = {
  type: 'mix-and-cannot-unmix';
  /** 법 — 작은 소수 */
  p: number;
  /** 밑 */
  g: number;
  /** 비밀 지수 — A 를 셈하는 재료. 화면에 옮겨 적지 않는다 */
  a: number;
  stepMs: number;
};

export type Direction = 'none' | 'up' | 'down';

/** 쪽마다의 누계 */
export type SideTally = { plain: number; mixed: number };

export type MixSummary = {
  rankA: number;
  count: number;
  metK: number;
  plainAtMet: number;
  plainRank: number;
};

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** 데이터 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowMixData(raw: unknown): MixAndCannotUnmixFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('mix-and-cannot-unmix: data 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'mix-and-cannot-unmix') {
    throw new Error(`mix-and-cannot-unmix: data.type 이 다르다 (${String(r.type)})`);
  }
  const { p, g, a, stepMs } = r;
  if (!isPositiveInt(p) || p < 3) throw new Error('mix-and-cannot-unmix: data.p 는 3 이상의 정수');
  for (let d = 2; d * d <= p; d += 1) {
    if (p % d === 0) throw new Error(`mix-and-cannot-unmix: data.p ${p} 가 소수가 아니다`);
  }
  if (!isPositiveInt(g) || g < 2 || g >= p) throw new Error('mix-and-cannot-unmix: data.g 는 2..p−1');
  if (!isPositiveInt(a) || a >= p) throw new Error('mix-and-cannot-unmix: data.a 는 1..p−1');
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('mix-and-cannot-unmix: data.stepMs 는 양수');
  }
  return { type: 'mix-and-cannot-unmix', p, g, a, stepMs };
}

/** base^exp mod m — 곱할 때마다 mod 로 줄인다. */
export function modPow(base: number, exp: number, m: number): number {
  let acc = 1 % m;
  for (let i = 0; i < exp; i += 1) acc = (acc * base) % m;
  return acc;
}

function direction(before: number | null, now: number): Direction {
  if (before === null) return 'none';
  if (now > before) return 'up';
  if (now < before) return 'down';
  throw new Error(`mix-and-cannot-unmix: 앞 걸음과 같은 값 ${now} — 방향이 없다`);
}

type Row = {
  k: number;
  plain: number;
  mixed: number;
  plainDir: Direction;
  mixedDir: Direction;
  met: boolean;
  ups: SideTally;
  downs: SideTally;
};

export async function mixAndCannotUnmix(
  context: FacetContext<MixAndCannotUnmixFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<MixAndCannotUnmixFacetData>;
  const { p, g, a, stepMs } = narrowMixData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const A = modPow(g, a, p);

  // 두 쪽을 지수 1..p − 1 까지 함께 셈한다
  const rows: Row[] = [];
  let plain = 1;
  let mixed = 1;
  const startUps: SideTally = { plain: 0, mixed: 0 };
  const startDowns: SideTally = { plain: 0, mixed: 0 };
  let ups: SideTally = { ...startUps };
  let downs: SideTally = { ...startDowns };
  for (let k = 1; k <= p - 1; k += 1) {
    plain *= g;
    mixed = (mixed * g) % p;
    if (!Number.isSafeInteger(plain)) {
      throw new Error(`mix-and-cannot-unmix: ${g}^${k} 가 정수로 셈할 수 있는 크기를 넘는다`);
    }
    const prev = rows.length > 0 ? rows[rows.length - 1] : undefined;
    const plainDir = direction(prev ? prev.plain : null, plain);
    const mixedDir = direction(prev ? prev.mixed : null, mixed);
    ups = {
      plain: ups.plain + (plainDir === 'up' ? 1 : 0),
      mixed: ups.mixed + (mixedDir === 'up' ? 1 : 0),
    };
    downs = {
      plain: downs.plain + (plainDir === 'down' ? 1 : 0),
      mixed: downs.mixed + (mixedDir === 'down' ? 1 : 0),
    };
    rows.push({ k, plain, mixed, plainDir, mixedDir, met: mixed === A, ups, downs });
  }

  const seen = new Set(rows.map((r) => r.mixed));
  if (seen.size !== p - 1) {
    throw new Error(`mix-and-cannot-unmix: g ${g} 가 mod ${p} 의 원시근이 아니다 — 섞은 값이 겹친다`);
  }
  const metRows = rows.filter((r) => r.met);
  if (metRows.length !== 1) {
    throw new Error(`mix-and-cannot-unmix: A 를 만난 걸음이 ${metRows.length} 개다`);
  }
  const metRow = metRows[0]!;
  if (metRow.k !== a) {
    throw new Error(`mix-and-cannot-unmix: 만난 지수 ${metRow.k} 가 a ${a} 와 다르다`);
  }

  const mixedSorted = rows.map((r) => r.mixed).sort((x, y) => x - y);
  const plainRungs = rows.map((r) => r.plain).sort((x, y) => x - y);
  const mixedSlots: number[] = [];
  for (let v = 1; v <= p - 1; v += 1) mixedSlots.push(v);

  const summary: MixSummary = {
    rankA: mixedSorted.indexOf(A) + 1,
    count: mixedSorted.length,
    metK: metRow.k,
    plainAtMet: metRow.plain,
    plainRank: plainRungs.indexOf(metRow.plain) + 1,
  };

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { A, plainRungs, mixedSlots, ups: startUps, downs: startDowns },
  });

  for (const row of rows) {
    // 걸음 0 은 이미 읽을 것(p · g · A)이 있다 — 첫 발신 앞에도 문을 둔다
    if (!(await pause())) return;
    const last = row.k === p - 1;
    await ctx.emit({
      type: 'visit',
      payload: last ? { ...row, summary } : { ...row },
    });
  }
}
