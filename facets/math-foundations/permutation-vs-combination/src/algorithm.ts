/**
 * 순열과 조합 — 순서만 다른 줄 세우기는 하나의 묶음으로 모인다.
 *
 * 물건 넷(`K` `L` `M` `N`)에서 셋을 고른다. 순서를 따진 줄 세우기를 사전 차례로
 * 한꺼번에 내놓고, 조합을 사전 차례로 하나씩 짚어 그 셋으로 된 줄 세우기를 한 묶음으로
 * 모은다. 끝에 줄 세우기 수를 묶음 하나의 크기(고르는 수의 계승)로 나눈다.
 *
 * 걸음 0 은 장면의 `initial()` 이 물건과 고르는 수로 채운다 (발신 없음).
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   lay     { arrangements: string[][]; factors: number[]; total: number; slots: number }
 *           줄 세우기 전부(사전 차례) · 곱의 인수(n, n − 1, …, r 개) · 그 곱 ·
 *           묶음 자리 수(조합의 수 — 자리 배치에만 쓴다)
 *   gather  { members: string[]; picks: number[]; remaining: number; groups: number }
 *           조합의 구성원(사전 차례) · 그 셋으로 된 줄 세우기의 번호(lay 의 차례) ·
 *           모인 뒤 아직 안 모인 줄 세우기 수 · 모인 뒤 묶음 수
 *   divide  { total: number; size: number; count: number; n: number; r: number }
 *           total ÷ size = count · size = r!
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PermutationVsCombinationFacetData = {
  type: 'permutation-vs-combination';
  /** 물건 기호 — 사전 차례로 적는다 */
  objects: string[];
  /** 고르는 수 */
  choose: number;
  stepMs: number;
};

/** 자료 좁히개 — 알고리즘 · 장면 · 무대가 함께 쓴다. 어긋나면 던진다. */
export function narrowPermutationVsCombinationData(raw: unknown): PermutationVsCombinationFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('permutation-vs-combination: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'permutation-vs-combination') {
    throw new Error(`permutation-vs-combination: type 이 다르다 (${String(d.type)})`);
  }
  const objects = d.objects;
  if (!Array.isArray(objects) || objects.length === 0 || !objects.every((o) => typeof o === 'string' && o.length > 0)) {
    throw new Error('permutation-vs-combination: objects 는 빈 칸 없는 글자 배열이어야 한다');
  }
  const list = objects as string[];
  for (let i = 1; i < list.length; i += 1) {
    if (!(list[i - 1]! < list[i]!)) {
      throw new Error(`permutation-vs-combination: objects[${i}] 가 사전 차례가 아니거나 겹친다`);
    }
  }
  const choose = d.choose;
  if (typeof choose !== 'number' || !Number.isInteger(choose) || choose < 1 || choose > list.length) {
    throw new Error('permutation-vs-combination: choose 는 1..objects.length 의 정수여야 한다');
  }
  const stepMs = d.stepMs;
  if (typeof stepMs !== 'number' || !Number.isInteger(stepMs) || stepMs < 800) {
    throw new Error('permutation-vs-combination: stepMs 는 800 이상의 정수여야 한다');
  }
  return { type: 'permutation-vs-combination', objects: [...list], choose, stepMs };
}

/** 서로 다른 r 개를 차례 있게 늘어놓은 것 전부 — 사전 차례. */
export function arrangementsOf(objects: readonly string[], r: number): string[][] {
  const out: string[][] = [];
  const walk = (prefix: string[]): void => {
    if (prefix.length === r) {
      out.push([...prefix]);
      return;
    }
    for (const o of objects) {
      if (prefix.includes(o)) continue;
      prefix.push(o);
      walk(prefix);
      prefix.pop();
    }
  };
  walk([]);
  return out;
}

/** 서로 다른 r 개의 모임 전부 — 구성원은 사전 차례, 모임끼리도 사전 차례. */
export function combinationsOf(objects: readonly string[], r: number): string[][] {
  const out: string[][] = [];
  const walk = (start: number, prefix: string[]): void => {
    if (prefix.length === r) {
      out.push([...prefix]);
      return;
    }
    for (let i = start; i < objects.length; i += 1) {
      prefix.push(objects[i]!);
      walk(i + 1, prefix);
      prefix.pop();
    }
  };
  walk(0, []);
  return out;
}

function sameSet(a: readonly string[], members: readonly string[]): boolean {
  return a.length === members.length && members.every((m) => a.includes(m));
}

export async function permutationVsCombination(
  context: FacetContext<PermutationVsCombinationFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PermutationVsCombinationFacetData>;
  const data = narrowPermutationVsCombinationData(ctx.data);
  const { objects, choose, stepMs } = data;
  const n = objects.length;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const arrangements = arrangementsOf(objects, choose);
  const combos = combinationsOf(objects, choose);
  const factors: number[] = [];
  for (let k = 0; k < choose; k += 1) factors.push(n - k);
  const total = factors.reduce((acc, f) => acc * f, 1);
  if (total !== arrangements.length) {
    throw new Error(`permutation-vs-combination: 곱 ${total} 과 줄 세우기 수 ${arrangements.length} 가 다르다`);
  }

  // 걸음 0(물건 넷)을 읽을 틈
  if (!(await pause())) return;

  await ctx.emit({
    type: 'lay',
    payload: { arrangements, factors, total, slots: combos.length },
  });

  let remaining = arrangements.length;
  let groups = 0;
  let size = 0;
  for (const members of combos) {
    if (!(await pause())) return;
    const picks: number[] = [];
    arrangements.forEach((a, i) => {
      if (sameSet(a, members)) picks.push(i);
    });
    if (size === 0) size = picks.length;
    if (picks.length !== size) {
      throw new Error(`permutation-vs-combination: 묶음 ${members.join('')} 의 크기 ${picks.length} 가 앞 묶음 ${size} 와 다르다`);
    }
    remaining -= picks.length;
    groups += 1;
    await ctx.emit({ type: 'gather', payload: { members, picks, remaining, groups } });
  }

  if (!(await pause())) return;
  let factorial = 1;
  for (let k = 2; k <= choose; k += 1) factorial *= k;
  if (factorial !== size || total % size !== 0 || total / size !== groups) {
    throw new Error(`permutation-vs-combination: ${total} ÷ ${size} 가 묶음 수 ${groups} 와 맞지 않는다`);
  }
  await ctx.emit({ type: 'divide', payload: { total, size, count: groups, n, r: choose } });
}
