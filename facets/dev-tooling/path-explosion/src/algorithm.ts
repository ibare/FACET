/**
 * path-explosion — 서로 독립인 결정을 하나씩 지날 때마다 길의 수가 곱절이 된다.
 *
 * 결정 `decisions` 를 차례로 지나며, 앞까지의 길 하나하나를 참 · 거짓 둘로 실제로
 * 갈라 늘어놓고 그 수를 센다. 같은 걸음에 갈래 칸(결정마다 참 · 거짓)은 둘씩만
 * 늘고, 갈래를 모두 채우는 시험은 모두 참 한 길 · 모두 거짓 한 길 — 둘에 머문다.
 * 그 두 시험이 지금까지의 갈래 칸을 정말 다 채우는지 매 걸음 셈해 확인한다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   pass  { k: number; id: string; paths: number; branches: number;
 *           tests: boolean[][] }
 *         k 번째 결정(1 부터)을 지났다. paths = 늘어놓은 길의 수,
 *         branches = 지금까지의 갈래 칸 수, tests = 갈래를 채우는 시험들
 *         (각 시험은 지나온 결정마다의 참거짓, 길이 k)
 *   done  { paths: number; tests: number }
 *         끝 — 길을 다 가는 시험 수(= 길의 수)와 갈래를 채우는 시험 수
 *
 * 걸음 0 은 장면의 initial() 이 initialData 의 결정 목록으로 세운다 (길 1 · 갈래 0 · 시험 0).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PathExplosionFacetData = {
  type: 'path-explosion';
  stepMs: number;
  /** 차례로 이어진 결정의 식별자 */
  decisions: string[];
};

/** 결정을 하나도 지나기 전의 길들 — 빈 길 하나 */
export function startPaths(): boolean[][] {
  return [[]];
}

/** 길 하나 = 지나온 결정마다의 참거짓. 앞의 길 하나하나를 참 · 거짓 둘로 가른다. */
export function splitPaths(paths: readonly (readonly boolean[])[]): boolean[][] {
  const next: boolean[][] = [];
  for (const p of paths) {
    next.push([...p, true]);
    next.push([...p, false]);
  }
  return next;
}

/** 늘어놓은 길의 차례 안에서 한 길의 자리 — 참이 앞(0), 거짓이 뒤(1). splitPaths 의 차례와 같다. */
export function pathIndex(path: readonly boolean[]): number {
  let idx = 0;
  for (const b of path) idx = idx * 2 + (b ? 0 : 1);
  return idx;
}

/** 시험들이 채운 갈래 칸 — `결정자리:참거짓` 의 집합 */
function coveredBranches(tests: readonly (readonly boolean[])[]): Set<string> {
  const covered = new Set<string>();
  for (const test of tests) {
    test.forEach((b, i) => covered.add(`${i}:${b ? 'T' : 'F'}`));
  }
  return covered;
}

function readData(data: unknown): PathExplosionFacetData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('path-explosion: initialData 가 객체가 아니다');
  }
  const d = data as Record<string, unknown>;
  const { stepMs, decisions } = d;
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('path-explosion: stepMs 가 양수가 아니다');
  }
  if (!Array.isArray(decisions) || decisions.length === 0) {
    throw new Error('path-explosion: decisions 가 비었다');
  }
  const ids: string[] = [];
  decisions.forEach((id, i) => {
    if (typeof id !== 'string' || id === '') {
      throw new Error(`path-explosion: decisions[${i}] 가 식별자가 아니다`);
    }
    ids.push(id);
  });
  return { type: 'path-explosion', stepMs, decisions: ids };
}

export async function pathExplosion(
  context: FacetContext<PathExplosionFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PathExplosionFacetData>;
  const { stepMs, decisions } = readData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let paths = startPaths();
  let tests: boolean[][] = [];
  for (let k = 1; k <= decisions.length; k += 1) {
    // 첫 바퀴의 문은 걸음 0(결정 줄이 이미 서 있는 화면)을 읽을 틈이다
    if (!(await pause())) return;
    const id = decisions[k - 1];
    if (id === undefined) throw new Error(`path-explosion: 결정 ${k} 이 없다`);

    paths = splitPaths(paths);

    // 시험 하나는 결정마다 한 갈래만 지난다 — 둘보다 적으면 갈래를 못 채운다.
    // 모두 참 · 모두 거짓 두 길로 채워지는지 셈해 확인한다.
    tests = [Array.from({ length: k }, () => true), Array.from({ length: k }, () => false)];
    const branches = 2 * k;
    const covered = coveredBranches(tests);
    if (covered.size !== branches) {
      throw new Error(`path-explosion: ${id} 에서 두 시험이 갈래를 다 채우지 못했다`);
    }

    await ctx.emit({
      type: 'pass',
      payload: { k, id, paths: paths.length, branches: covered.size, tests },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { paths: paths.length, tests: tests.length } });
}
