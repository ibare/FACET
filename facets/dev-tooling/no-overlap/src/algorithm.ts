/**
 * no-overlap — 한 벌만 둘 수 있는 꾸러미를 두 요구가 부를 때, 함께 쓸 구간이 비는가.
 *
 * 요구마다 범위 문자열(`^M.m.p` · `~M.m.p`)을 두 끝 [아래 포함, 위 제외) 으로 푼다.
 * 함께 쓸 구간 = [아래 끝들 가운데 큰 것, 위 끝들 가운데 작은 것). 아래 ≥ 위 면 비었다.
 * 공개된 버전 목록은 보지 않는다 — 구간의 두 끝만으로 비었음을 판정한다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   unfold   { index: number; low: string; high: string }
 *            요구 index 의 범위를 두 끝으로 풀었다. low 포함 · high 제외
 *   lower    { version: string; from: number }
 *            함께 쓸 아래 끝 = 두 아래 끝 가운데 큰 것. from 은 그 끝을 준 요구의 index
 *   upper    { version: string; from: number }
 *            함께 쓸 위 끝 = 두 위 끝 가운데 작은 것. from 은 그 끝을 준 요구의 index
 *   verdict  { empty: boolean; low: string; high: string; clash: number[] }
 *            아래 ≥ 위 이면 empty. clash 는 부딪힌 요구의 index 둘 (아래 끝을 준 쪽, 위 끝을 준 쪽).
 *            비지 않았으면 clash 는 빈 배열
 *
 * 걸음 0 (처음 화면) 은 장면의 initial() 이 initialData 의 요구 목록으로 채운다.
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NoOverlapRequest = { from: string; range: string };

export type NoOverlapFacetData = {
  type: 'no-overlap';
  stepMs: number;
  /** 두 쪽이 함께 부르는 꾸러미 이름 (자료) */
  dep: string;
  /** 요구 목록 — 부르는 쪽과 범위 문자열 */
  requests: NoOverlapRequest[];
};

export type Version = readonly [number, number, number];

/** `M.m.p` 세 수만 안다. 앞붙이 · 프리릴리스 · 빌드 표식은 던진다. */
export function parseVersion(v: string): Version {
  const parts = v.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
    throw new Error(`no-overlap: 모르는 버전 모양 "${v}" (세 수 M.m.p 만 안다)`);
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export function formatVersion(v: Version): string {
  return `${v[0]}.${v[1]}.${v[2]}`;
}

/** major, minor, patch 차례로 수로 견준다. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    const d = (x[i] as number) - (y[i] as number);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * 범위 문자열 → [low 포함, high 제외). 캐럿 · 틸드만 안다 (0.x 특례 포함).
 * 다른 모양(`>=` · `<` · `||` · `x`)은 던진다.
 */
export function rangeBounds(range: string): { low: string; high: string } {
  const op = range.charAt(0);
  const base = parseVersion(range.slice(1));
  const [M, m, p] = base;
  if (op === '^') {
    if (M > 0) return { low: formatVersion(base), high: formatVersion([M + 1, 0, 0]) };
    if (m > 0) return { low: formatVersion(base), high: formatVersion([0, m + 1, 0]) };
    return { low: formatVersion(base), high: formatVersion([0, 0, p + 1]) };
  }
  if (op === '~') {
    return { low: formatVersion(base), high: formatVersion([M, m + 1, 0]) };
  }
  throw new Error(`no-overlap: 모르는 범위 모양 "${range}" (^ · ~ 만 안다)`);
}

export async function noOverlap(ctxBase: FacetContext<NoOverlapFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<NoOverlapFacetData>;
  const { stepMs, requests } = ctx.data;
  if (requests.length < 2) {
    throw new Error(`no-overlap: 요구가 둘 이상이어야 한다 (받은 수 ${requests.length})`);
  }

  /** 끝들 가운데 sign 쪽(1 = 큰 것, -1 = 작은 것)으로 가장 먼 것. 취소되면 null */
  function pickEnd(
    list: Array<{ low: string; high: string }>,
    key: 'low' | 'high',
    sign: 1 | -1,
  ): { version: string; from: number } | null {
    let best: { version: string; from: number } | null = null;
    for (const [i, b] of list.entries()) {
      if (ctx.cancelled) return null;
      if (best === null || compareVersions(b[key], best.version) * sign > 0) {
        best = { version: b[key], from: i };
      }
    }
    if (best === null) throw new Error('no-overlap: 풀린 요구가 없다');
    return best;
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 요구마다 두 끝으로 푼다
  const bounds: Array<{ low: string; high: string }> = [];
  for (let i = 0; i < requests.length; i += 1) {
    if (!(await pause())) return;
    const req = requests[i];
    if (req === undefined) throw new Error(`no-overlap: 요구 ${i} 가 없다`);
    const b = rangeBounds(req.range);
    bounds.push(b);
    await ctx.emit({ type: 'unfold', payload: { index: i, low: b.low, high: b.high } });
  }

  // 함께 쓸 아래 끝 — 아래 끝들 가운데 큰 것
  const lower = pickEnd(bounds, 'low', 1);
  if (!lower) return;
  if (!(await pause())) return;
  await ctx.emit({ type: 'lower', payload: { version: lower.version, from: lower.from } });

  // 함께 쓸 위 끝 — 위 끝들 가운데 작은 것
  const upper = pickEnd(bounds, 'high', -1);
  if (!upper) return;
  if (!(await pause())) return;
  await ctx.emit({ type: 'upper', payload: { version: upper.version, from: upper.from } });

  const low = lower.version;
  const high = upper.version;
  const lowFrom = lower.from;
  const highFrom = upper.from;

  // 아래 ≥ 위 이면 비었다 — 버전을 고르지 못하고 부딪힌 두 요구를 알린다
  const empty = compareVersions(low, high) >= 0;
  if (!(await pause())) return;
  await ctx.emit({
    type: 'verdict',
    payload: { empty, low, high, clash: empty ? [lowFrom, highFrom] : [] },
  });
}
