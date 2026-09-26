/**
 * range-and-candidates — 범위 하나가 공개된 버전들을 거른다.
 *
 * 범위(`^1.2.0`)를 두 끝(아래 끝 포함 · 위 끝 제외)으로 풀고, 공개된 버전을 작은 것부터
 * 하나씩 그 두 끝에 대어 아래로 벗어남 · 안 · 위로 벗어남 셋으로 가른다. 끝에 안에 든 것
 * 가운데 가장 큰 버전을 뽑는다 (npm 의 기본 고르기).
 *
 * 걸음 0 은 장면의 `initial()` 이 `initialData` 에서 세운다 (범위와 공개된 버전들).
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음)
 * - `bounds`  payload `{ lo: string; hi: string }`
 *             범위를 두 끝으로 풀었다. lo 는 포함, hi 는 제외.
 * - `judge`   payload `{ index: number; version: string; verdict: 'below' | 'in' | 'above' }`
 *             공개된 버전 `index` 번째를 두 끝에 대어 본 판정.
 * - `pick`    payload `{ version: string; inside: number }`
 *             안에 든 것(`inside` 개) 가운데 가장 큰 버전을 뽑았다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RangeAndCandidatesFacetData = {
  type: 'range-and-candidates';
  /** 요구 하나. 캐럿 `^` · 틸드 `~` 만 안다 */
  range: string;
  /** 공개된 버전들 — 작은 것부터 */
  published: string[];
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

export type Version = readonly [number, number, number];
export type Verdict = 'below' | 'in' | 'above';

/** `major.minor.patch` 세 수. 다른 모양(앞붙이 · 프리릴리스 · 빌드 표식)은 던진다. */
export function parseVersion(text: string): Version {
  const parts = text.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
    throw new Error(`range-and-candidates: 모르는 버전 모양 "${text}" — major.minor.patch 세 수여야 한다`);
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export function formatVersion(v: Version): string {
  return `${v[0]}.${v[1]}.${v[2]}`;
}

/** 세 수를 차례로 수로 견준다 (글자 견줌이 아니다). */
export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** 범위 → [아래 끝 포함, 위 끝 제외). 캐럿은 0.x 특례까지 푼다. 다른 모양은 던진다. */
export function rangeBounds(range: string): { lo: Version; hi: Version } {
  const op = range.charAt(0);
  const base = parseVersion(range.slice(1));
  const [major, minor, patch] = base;
  if (op === '^') {
    if (major > 0) return { lo: base, hi: [major + 1, 0, 0] };
    if (minor > 0) return { lo: base, hi: [0, minor + 1, 0] };
    return { lo: base, hi: [0, 0, patch + 1] };
  }
  if (op === '~') return { lo: base, hi: [major, minor + 1, 0] };
  throw new Error(`range-and-candidates: 모르는 범위 모양 "${range}" — ^ · ~ 만 안다`);
}

export function judgeVersion(version: Version, lo: Version, hi: Version): Verdict {
  if (compareVersions(version, lo) < 0) return 'below';
  if (compareVersions(version, hi) >= 0) return 'above';
  return 'in';
}

export async function rangeAndCandidates(
  ctx0: FacetContext<RangeAndCandidatesFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<RangeAndCandidatesFacetData>;
  const { range, published, stepMs } = ctx.data;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('range-and-candidates: stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(published) || published.length === 0) {
    throw new Error('range-and-candidates: 공개된 버전이 없다');
  }
  const versions = published.map(parseVersion);
  for (let i = 1; i < versions.length; i += 1) {
    if (compareVersions(versions[i - 1]!, versions[i]!) >= 0) {
      throw new Error(`range-and-candidates: 공개된 버전이 작은 것부터가 아니다 — ${published[i - 1]} 다음 ${published[i]}`);
    }
  }
  const { lo, hi } = rangeBounds(range);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 범위와 후보가 이미 서 있는 화면이라 읽을 틈을 준다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'bounds', payload: { lo: formatVersion(lo), hi: formatVersion(hi) } });

  let best = -1;
  let inside = 0;
  for (let index = 0; index < versions.length; index += 1) {
    if (!(await pause())) return;
    const verdict = judgeVersion(versions[index]!, lo, hi);
    if (verdict === 'in') {
      inside += 1;
      if (best < 0 || compareVersions(versions[index]!, versions[best]!) > 0) best = index;
    }
    await ctx.emit({ type: 'judge', payload: { index, version: published[index]!, verdict } });
  }

  if (best < 0) throw new Error(`range-and-candidates: ${range} 안에 드는 버전이 없다 — 고를 수 없다`);
  if (!(await pause())) return;
  await ctx.emit({ type: 'pick', payload: { version: published[best]!, inside } });
}
