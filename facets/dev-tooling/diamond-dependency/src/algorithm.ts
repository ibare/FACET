/**
 * diamond-dependency — 두 갈래로 벌어진 부름이 한 이름으로 모인다.
 *
 * 뿌리(`root`)에서 너비 우선으로 부름(간선)을 하나씩 푼다. 한 꾸러미의 부름은 선언 차례(이름 사전순).
 * 부른 이름이 아직 없으면 범위 안 가장 큰 버전을 새로 고르고, 이미 있으면 그 버전이 이 부름의 범위 안인지
 * 대 본 뒤 다시 쓴다. 이 조각의 모형은 다시 쓰는 갈래까지만 말한다 — 범위 밖(두 벌)이면 던진다.
 *
 * 이벤트 (모두 silent 아님, 한 걸음씩):
 *   pick  — 새 이름을 새로 골랐다.
 *           payload { from: string; name: string; range: string; version: string }
 *   reuse — 이미 고른 버전이 범위 안이라 다시 쓴다.
 *           payload { from: string; name: string; range: string; version: string }
 *   done  — 끝. 한 층 아래에서 두 번 넘게 불린 이름 하나의 셈.
 *           payload { name: string; version: string; callers: number; copies: number; installed: number }
 *
 * 걸음 0 은 initialData 의 뿌리와 그 부름으로 이미 읽을 것이 있어, 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DiamondCall = { name: string; range: string };

export type DiamondDependencyFacetData = {
  type: 'diamond-dependency';
  stepMs: number;
  root: string;
  /** 꾸러미마다 선언한 부름. 이름 사전순. */
  calls: Record<string, DiamondCall[]>;
  /** 공개된 버전. 뿌리는 없다. */
  published: Record<string, string[]>;
};

type Triple = readonly [number, number, number];

/** `M.m.p` 세 수. 다른 모양은 던진다. */
export function parseVersion(v: string): Triple {
  const parts = v.split('.');
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
    throw new Error(`diamond-dependency: 모르는 버전 모양 "${v}"`);
  }
  return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

function compare(a: Triple, b: Triple): number {
  for (let i = 0; i < 3; i += 1) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return 0;
}

/** 범위 → [아래 끝 포함, 위 끝 제외). 캐럿 · 틸드만 안다 (0.x 특례 포함). */
export function rangeBounds(range: string): { low: Triple; high: Triple } {
  const op = range.charAt(0);
  const [M, m, p] = parseVersion(range.slice(1));
  if (op === '^') {
    if (M > 0) return { low: [M, m, p], high: [M + 1, 0, 0] };
    if (m > 0) return { low: [0, m, p], high: [0, m + 1, 0] };
    return { low: [0, 0, p], high: [0, 0, p + 1] };
  }
  if (op === '~') return { low: [M, m, p], high: [M, m + 1, 0] };
  throw new Error(`diamond-dependency: 모르는 범위 모양 "${range}"`);
}

export type Verdict = 'in' | 'below' | 'above';

export function judge(version: string, range: string): Verdict {
  const { low, high } = rangeBounds(range);
  const t = parseVersion(version);
  if (compare(t, low) < 0) return 'below';
  if (compare(t, high) >= 0) return 'above';
  return 'in';
}

/** 범위 안 가장 큰 버전. 비면 던진다. */
export function maxSatisfying(versions: readonly string[], range: string): string {
  let best: string | null = null;
  for (const v of versions) {
    if (judge(v, range) !== 'in') continue;
    if (best === null || compare(parseVersion(v), parseVersion(best)) > 0) best = v;
  }
  if (best === null) throw new Error(`diamond-dependency: ${range} 를 채우는 버전이 없다`);
  return best;
}

/** 꾸러미의 부름 목록. 선언이 사전순이 아니면 던진다. 없으면 부름이 없는 꾸러미. */
export function callsOf(data: DiamondDependencyFacetData, pkg: string): DiamondCall[] {
  const list = data.calls[pkg] ?? [];
  for (let i = 1; i < list.length; i += 1) {
    if ((list[i - 1] as DiamondCall).name > (list[i] as DiamondCall).name) {
      throw new Error(`diamond-dependency: ${pkg} 의 부름이 이름 사전순이 아니다`);
    }
  }
  return list;
}

/**
 * 이름마다 층(뿌리에서 너비 우선으로 처음 닿는 깊이)과 그 층 안의 차례.
 * 부름의 모양(구조)에서 정해진다 — 버전 고르기와 무관하다. 장면과 그림이 같이 쓴다.
 */
export function nameLevels(data: DiamondDependencyFacetData): { name: string; level: number }[] {
  const out: { name: string; level: number }[] = [{ name: data.root, level: 0 }];
  const seen = new Set<string>([data.root]);
  for (let i = 0; i < out.length; i += 1) {
    const cur = out[i] as { name: string; level: number };
    for (const c of callsOf(data, cur.name)) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      out.push({ name: c.name, level: cur.level + 1 });
    }
  }
  return out;
}

function publishedOf(data: DiamondDependencyFacetData, name: string): string[] {
  const list = data.published[name];
  if (!list) throw new Error(`diamond-dependency: ${name} 의 공개 목록이 없다`);
  return list;
}

export async function diamondDependency(
  context: FacetContext<DiamondDependencyFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DiamondDependencyFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const chosen = new Map<string, string>();
  /** 깔린 벌. 이름 하나가 여러 번 나올 수 있는 목록이라 벌 수를 여기서 센다. */
  const installs: { name: string; version: string }[] = [];
  const callers = new Map<string, string[]>();
  const queue: string[] = [data.root];

  while (queue.length > 0) {
    if (ctx.cancelled) return;
    const pkg = queue.shift() as string;
    for (const call of callsOf(data, pkg)) {
      if (!(await pause())) return;
      const was = callers.get(call.name) ?? [];
      callers.set(call.name, [...was, pkg]);
      const have = chosen.get(call.name);
      if (have === undefined) {
        const version = maxSatisfying(publishedOf(data, call.name), call.range);
        chosen.set(call.name, version);
        installs.push({ name: call.name, version });
        queue.push(call.name);
        await ctx.emit({
          type: 'pick',
          payload: { from: pkg, name: call.name, range: call.range, version },
        });
      } else if (judge(have, call.range) === 'in') {
        await ctx.emit({
          type: 'reuse',
          payload: { from: pkg, name: call.name, range: call.range, version: have },
        });
      } else {
        throw new Error(
          `diamond-dependency: ${call.name} ${have} 가 ${call.range} 밖이다 — 두 벌은 이 조각의 모형에 없다`,
        );
      }
    }
  }

  // 모인 이름 — 두 쪽 넘게 부른 이름. 다이아몬드라면 하나다.
  const joined = [...callers.entries()].filter(([, who]) => who.length > 1);
  if (joined.length !== 1) {
    throw new Error(`diamond-dependency: 모인 이름이 하나가 아니다 (${joined.length})`);
  }
  const [name, who] = joined[0] as [string, string[]];
  const version = chosen.get(name) as string;
  if (!(await pause())) return;
  await ctx.emit({
    type: 'done',
    payload: { name, version, callers: who.length,
      copies: installs.filter((x) => x.name === name).length,
      installed: installs.length,
     },
  });
}
