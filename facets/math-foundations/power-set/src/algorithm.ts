/**
 * 멱집합 — 원소를 하나씩 들일 때마다 부분집합 모음이 갈라져 두 배가 된다.
 *
 * 걸음 k 에 k 번째 원소 x 를 들인다. 새 모음은 [옛 부분집합들 (옛 차례 그대로)] 뒤에
 * [옛 부분집합마다 x 를 얹은 사본 (같은 차례)] 이다. 옛 부분집합은 바뀌지 않는다.
 * 모음의 수는 2 의 거듭제곱 식이 아니라 모음의 길이를 세어 얻는다.
 *
 * 이벤트
 *   init  (silent: true)
 *     payload { subsets: string[][]; total: number }
 *       subsets — 원소를 하나도 들이지 않은 때의 모음 (공집합 하나)
 *       total   — 원소를 모두 들인 뒤 모음의 길이 (무대가 칸 수를 정하는 데 쓴다)
 *   take  (silent 아님 — 걸음 하나)
 *     payload { element: string; index: number; from: number; to: number; subsets: string[][] }
 *       element — 이번에 들이는 원소
 *       index   — 그 원소가 들이는 차례에서 몇 번째인가 (0 부터)
 *       from    — 들이기 전 모음의 길이
 *       to      — 들인 뒤 모음의 길이
 *       subsets — 들인 뒤 모음 전체 (앞 from 개는 옛 모음 그대로)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PowerSetFacetData = {
  type: 'power-set';
  /** 집합 이름 — 번역하지 않는 수식 기호 */
  name: string;
  /** 들이는 차례대로 적은 원소 — 부분집합 안의 원소도 이 차례로 적는다 */
  elements: string[];
  stepMs: number;
};

/** 모양을 검사하고 어긋나면 던지는 좁히개. 알고리즘과 장면이 함께 부른다. */
export function narrowPowerSetData(raw: unknown): PowerSetFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('power-set: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'power-set') {
    throw new Error(`power-set: initialData.type 이 'power-set' 이 아니다 (${String(r.type)})`);
  }
  if (typeof r.name !== 'string' || r.name.length === 0) {
    throw new Error('power-set: initialData.name 이 빈 문자열이거나 문자열이 아니다');
  }
  if (!Array.isArray(r.elements) || r.elements.length === 0) {
    throw new Error('power-set: initialData.elements 가 비었거나 배열이 아니다');
  }
  const elements: string[] = [];
  r.elements.forEach((e, i) => {
    if (typeof e !== 'string' || e.length === 0) {
      throw new Error(`power-set: initialData.elements[${i}] 가 빈 문자열이거나 문자열이 아니다`);
    }
    if (elements.includes(e)) {
      throw new Error(`power-set: initialData.elements[${i}] (${e}) 가 겹친다 — 집합은 중복이 없다`);
    }
    elements.push(e);
  });
  if (typeof r.stepMs !== 'number' || !Number.isFinite(r.stepMs) || r.stepMs <= 0) {
    throw new Error('power-set: initialData.stepMs 가 양수가 아니다');
  }
  return { type: 'power-set', name: r.name, elements, stepMs: r.stepMs };
}

/** 모음에 원소 x 를 들인다 — 옛 모음 뒤에 옛 부분집합마다 x 를 얹은 사본을 붙인다. */
export function takeElement(subsets: readonly (readonly string[])[], x: string): string[][] {
  const kept = subsets.map((s) => [...s]);
  const copies = subsets.map((s) => [...s, x]);
  return [...kept, ...copies];
}

export async function powerSet(ctx: FacetContext<PowerSetFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PowerSetFacetData>;
  const data = narrowPowerSetData(ctx.data);
  const { stepMs, elements } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 들이기 전 모음 — 공집합 하나. 모든 걸음을 먼저 셈해 끝의 길이를 무대에 알린다.
  const start: string[][] = [[]];
  const stages: string[][][] = [];
  let acc: string[][] = start;
  for (const x of elements) {
    if (ctx.cancelled) return;
    acc = takeElement(acc, x);
    stages.push(acc);
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { subsets: start, total: acc.length },
  });

  let before = start;
  for (let i = 0; i < elements.length; i += 1) {
    if (!(await pause())) return;
    const after = stages[i];
    const element = elements[i];
    if (after === undefined || element === undefined) {
      throw new Error(`power-set: 걸음 ${i} 의 모음이나 원소가 없다`);
    }
    await ctx.emit({
      type: 'take',
      payload: {
        element,
        index: i,
        from: before.length,
        to: after.length,
        subsets: after,
      },
    });
    before = after;
  }
}
