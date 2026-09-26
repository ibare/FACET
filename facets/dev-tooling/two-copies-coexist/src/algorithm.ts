/**
 * two-copies-coexist — 두 꾸러미가 같은 꾸러미의 서로 맞지 않는 범위를 부르면, npm 꼴 해결기는
 * 한 벌을 꼭대기에, 다른 한 벌을 부른 쪽의 폴더 안쪽에 놓는다. 그다음 두 꾸러미가 그것을 찾는다 —
 * 찾기는 제 폴더 안쪽에서 시작해 없으면 한 칸 위(꼭대기)로 올라간다.
 *
 * 모형 (줄인 것):
 *  - 버전은 세 수 `major.minor.patch`. 범위는 캐럿 `^` · 틸드 `~` 만 안다 (0.x 특례 포함). 다른 모양은 던진다
 *  - 해결 차례: 뿌리에서 너비 우선. 한 꾸러미의 부름은 선언 차례 (이름 사전순이어야 한다 — 아니면 던진다)
 *  - 놓기: 꼭대기에 그 이름이 없으면 범위 안 가장 큰 버전을 꼭대기에. 꼭대기 것이 범위 안이면 다시 쓴다.
 *    범위 밖이면 부른 쪽 안쪽에 범위 안 가장 큰 버전을 따로 놓는다
 *  - 찾기: `node_modules/<찾는 쪽>/node_modules/<이름>` 을 먼저, 없으면 `node_modules/<이름>`. 한 번 보기 = 걸음 하나.
 *    찾는 쪽은 `lookFor` 를 부르는 꾸러미들, 놓인 차례
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *  - `place`  payload { from: string; name: string; range: string; version: string;
 *                      parent: string | null;  // null 이면 꼭대기, 아니면 그 꾸러미 안쪽
 *                      was: string | null }    // 안쪽에 놓을 때 꼭대기에 있던 (범위 밖) 버전. 꼭대기에 놓으면 null
 *  - `reuse`  payload { from: string; name: string; range: string; version: string }  // 꼭대기 것을 다시 씀
 *  - `look`   payload { seeker: string; name: string;
 *                      parent: string | null;   // 본 자리 — 찾는 쪽 안쪽이면 그 이름, 꼭대기면 null
 *                      version: string | null } // 그 자리에 있던 버전. 없으면 null (한 칸 위로)
 *
 * 걸음 0 은 장면의 `initial()` 이 데이터에서 채운다 (뿌리의 부름 · 빈 node_modules).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Call = { name: string; range: string };

export type TwoCopiesCoexistFacetData = {
  type: 'two-copies-coexist';
  stepMs: number;
  /** 뿌리 꾸러미 이름. 그 폴더의 node_modules 가 꼭대기다 */
  root: string;
  /** 꾸러미마다 부름 — 선언 차례 (이름 사전순) */
  calls: Record<string, Call[]>;
  /** 꾸러미마다 공개된 버전 */
  published: Record<string, string[]>;
  /** 찾기를 보일 꾸러미 이름 */
  lookFor: string;
};

export type Version = readonly [number, number, number];

/** `major.minor.patch` 를 세 수로. 다른 모양은 던진다. */
export function parseVersion(v: string): Version {
  const parts = v.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
    throw new Error(`two-copies-coexist: 모르는 버전 모양 ${JSON.stringify(v)}`);
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

export function compareVersions(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

/** 범위를 두 끝으로 — 아래 끝 포함, 위 끝 제외. 캐럿 · 틸드만 안다. */
export function rangeBounds(range: string): { low: Version; high: Version } {
  const op = range.charAt(0);
  const [M, m, p] = parseVersion(range.slice(1));
  if (op === '^') {
    if (M > 0) return { low: [M, m, p], high: [M + 1, 0, 0] };
    if (m > 0) return { low: [0, m, p], high: [0, m + 1, 0] };
    return { low: [0, 0, p], high: [0, 0, p + 1] };
  }
  if (op === '~') return { low: [M, m, p], high: [M, m + 1, 0] };
  throw new Error(`two-copies-coexist: 모르는 범위 모양 ${JSON.stringify(range)}`);
}

export type Verdict = 'in' | 'below' | 'above';

export function judge(version: string, range: string): Verdict {
  const { low, high } = rangeBounds(range);
  const v = parseVersion(version);
  if (compareVersions(v, low) < 0) return 'below';
  if (compareVersions(v, high) >= 0) return 'above';
  return 'in';
}

/** 범위 안 가장 큰 버전. 안이 비면 던진다. */
export function newestInRange(versions: readonly string[], range: string): string {
  let best: string | null = null;
  for (const v of versions) {
    if (judge(v, range) !== 'in') continue;
    if (best === null || compareVersions(parseVersion(v), parseVersion(best)) > 0) best = v;
  }
  if (best === null) throw new Error(`two-copies-coexist: ${range} 를 채우는 공개 버전이 없다`);
  return best;
}

/** 놓인 자리의 폴더 경로. parent 가 null 이면 꼭대기. */
export function placePath(parent: string | null, name: string): string {
  return parent === null ? `node_modules/${name}` : `node_modules/${parent}/node_modules/${name}`;
}

export type Placement =
  | { kind: 'place'; from: string; name: string; range: string; version: string; parent: string | null; was: string | null }
  | { kind: 'reuse'; from: string; name: string; range: string; version: string };

export type Look = { seeker: string; name: string; parent: string | null; version: string | null };

function callsOf(data: TwoCopiesCoexistFacetData, pkg: string): Call[] {
  const list = data.calls[pkg] ?? [];
  for (let i = 1; i < list.length; i += 1) {
    if ((list[i - 1] as Call).name >= (list[i] as Call).name) {
      throw new Error(`two-copies-coexist: ${pkg} 의 부름이 이름 사전순이 아니다`);
    }
  }
  return list;
}

function publishedOf(data: TwoCopiesCoexistFacetData, name: string): string[] {
  const list = data.published[name];
  if (list === undefined) throw new Error(`two-copies-coexist: ${name} 의 공개 목록이 없다`);
  return list;
}

/** 뿌리에서 너비 우선으로 부름을 하나씩 푼다. 한 부름 = 한 놓기(또는 다시 씀). */
export function resolvePlacements(data: TwoCopiesCoexistFacetData): Placement[] {
  const top = new Map<string, string>();
  const out: Placement[] = [];
  const queue: { pkg: string; parent: string | null }[] = [{ pkg: data.root, parent: null }];
  let head = 0;
  while (head < queue.length) {
    const item = queue[head] as { pkg: string; parent: string | null };
    head += 1;
    const deps = callsOf(data, item.pkg);
    if (deps.length > 0 && item.parent !== null) {
      throw new Error(`two-copies-coexist: 안쪽에 놓인 ${item.pkg} 의 부름은 이 모형이 풀지 않는다`);
    }
    for (const call of deps) {
      const at = top.get(call.name);
      if (at === undefined) {
        const version = newestInRange(publishedOf(data, call.name), call.range);
        top.set(call.name, version);
        out.push({ kind: 'place', from: item.pkg, name: call.name, range: call.range, version, parent: null, was: null });
        queue.push({ pkg: call.name, parent: null });
      } else if (judge(at, call.range) === 'in') {
        out.push({ kind: 'reuse', from: item.pkg, name: call.name, range: call.range, version: at });
      } else {
        if (item.pkg === data.root) {
          throw new Error(`two-copies-coexist: 뿌리의 부름 ${call.name} 가 꼭대기와 부딪힌다 — 이 모형에 없는 일`);
        }
        const version = newestInRange(publishedOf(data, call.name), call.range);
        out.push({ kind: 'place', from: item.pkg, name: call.name, range: call.range, version, parent: item.pkg, was: at });
        queue.push({ pkg: call.name, parent: item.pkg });
      }
    }
  }
  return out;
}

/**
 * `lookFor` 를 부르는 꾸러미마다(놓인 차례) 찾기를 한다 — 제 안쪽을 먼저, 없으면 꼭대기.
 * 두 자리 모두 없으면 던진다.
 */
export function resolveLookups(data: TwoCopiesCoexistFacetData, placements: readonly Placement[]): Look[] {
  const name = data.lookFor;
  const top = new Map<string, string>();
  const inner = new Map<string, string>();
  const seekers: string[] = [];
  for (const p of placements) {
    if (p.kind !== 'place') continue;
    if (p.parent === null) top.set(p.name, p.version);
    else inner.set(`${p.parent}/${p.name}`, p.version);
    if (p.parent === null && callsOf(data, p.name).some((c) => c.name === name)) seekers.push(p.name);
  }
  if (seekers.length === 0) throw new Error(`two-copies-coexist: ${name} 를 부르는 꾸러미가 없다`);
  const out: Look[] = [];
  for (const seeker of seekers) {
    const near = inner.get(`${seeker}/${name}`);
    if (near !== undefined) {
      out.push({ seeker, name, parent: seeker, version: near });
      continue;
    }
    out.push({ seeker, name, parent: seeker, version: null });
    const far = top.get(name);
    if (far === undefined) throw new Error(`two-copies-coexist: ${seeker} 가 ${name} 를 찾지 못한다`);
    out.push({ seeker, name, parent: null, version: far });
  }
  return out;
}

/** 그림의 뼈대 — 꼭대기에 놓일 이름들(차례대로), 안쪽 자리들(찾기가 보는 빈자리 포함), 찾는 꾸러미의 벌 수. */
export type Layout = {
  tops: string[];
  inner: { parent: string; name: string }[];
  copies: number;
};

export function layoutOf(data: TwoCopiesCoexistFacetData): Layout {
  const placements = resolvePlacements(data);
  const looks = resolveLookups(data, placements);
  const tops: string[] = [];
  const inner: { parent: string; name: string }[] = [];
  const seen = new Set<string>();
  const addInner = (parent: string, name: string): void => {
    const key = `${parent}/${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    inner.push({ parent, name });
  };
  let copies = 0;
  for (const p of placements) {
    if (p.kind !== 'place') continue;
    if (p.name === data.lookFor) copies += 1;
    if (p.parent === null) tops.push(p.name);
    else addInner(p.parent, p.name);
  }
  for (const l of looks) if (l.parent !== null) addInner(l.parent, l.name);
  return { tops, inner, copies };
}

export async function twoCopiesCoexist(ctx0: FacetContext<TwoCopiesCoexistFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<TwoCopiesCoexistFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const placements = resolvePlacements(data);
  const looks = resolveLookups(data, placements);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 은 뿌리의 부름이 이미 보이는 화면이라 첫 발신 앞에도 머문다.
  for (const p of placements) {
    if (!(await pause())) return;
    if (p.kind === 'reuse') {
      await ctx.emit({
        type: 'reuse',
        payload: { from: p.from, name: p.name, range: p.range, version: p.version },
      });
    } else {
      await ctx.emit({
        type: 'place',
        payload: { from: p.from, name: p.name, range: p.range, version: p.version, parent: p.parent, was: p.was },
      });
    }
  }
  for (const l of looks) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'look',
      payload: { seeker: l.seeker, name: l.name, parent: l.parent, version: l.version },
    });
  }
}
