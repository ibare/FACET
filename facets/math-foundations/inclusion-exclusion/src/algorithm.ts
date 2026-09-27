/**
 * 포함배제 — 두 모음의 원소 수를 더하면 겹친 원소가 두 번 세어지고, 그만큼 빼면 맞는다.
 *
 * 원소는 제자리에 있다. 원소마다 "표"(지금까지 세어진 횟수)가 붙었다 떨어진다.
 * 결과 모음을 새로 만들지 않는다 — 주인공은 센 수와 표다.
 *
 * 이벤트 (발신 차례대로):
 *   init      silent: true
 *             payload { a: { name: string; members: string[] },
 *                       b: { name: string; members: string[] },
 *                       elements: string[]   — A ∪ B 를 정해진 차례(글자 차례)로
 *                       inA: boolean[]       — elements 와 같은 길이
 *                       inB: boolean[] }
 *             걸음 0 을 세운다. 모든 표 0 · 센 수 0.
 *   addSet    payload { which: 'a' | 'b'; size: number; indices: number[]; total: number }
 *             그 모음을 통째로 센다 — indices 의 원소마다 표가 하나 붙고 센 수가 size 만큼 는다.
 *             total 은 더한 뒤의 센 수.
 *   subtract  payload { size: number; indices: number[]; total: number }
 *             |A ∩ B| 를 뺀다 — indices 는 교집합 원소(표가 둘인 원소). 각자 표 하나를 잃는다.
 *   direct    payload { direct: number; total: number }
 *             A ∪ B 의 원소를 하나씩 직접 센 수와 식의 값.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NamedSet = { name: string; members: string[] };

export type InclusionExclusionFacetData = {
  type: 'inclusion-exclusion';
  stepMs: number;
  a: NamedSet;
  b: NamedSet;
};

function narrowSet(raw: unknown, path: string): NamedSet {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${path} 가 객체가 아니다`);
  const rec = raw as Record<string, unknown>;
  if (typeof rec.name !== 'string' || rec.name.length === 0) {
    throw new Error(`${path}.name 이 빈 글자이거나 글자가 아니다`);
  }
  if (!Array.isArray(rec.members)) throw new Error(`${path}.members 가 배열이 아니다`);
  const members: string[] = [];
  rec.members.forEach((m, i) => {
    if (typeof m !== 'string' || m.length === 0) {
      throw new Error(`${path}.members[${i}] 가 빈 글자이거나 글자가 아니다`);
    }
    if (members.includes(m)) throw new Error(`${path}.members[${i}] ${m} 가 겹친다`);
    members.push(m);
  });
  if (members.length === 0) throw new Error(`${path}.members 가 비었다`);
  return { name: rec.name, members };
}

/** initialData 좁히개. 모양이 어긋나면 필드 경로를 담아 던진다. 값을 베껴 돌려준다. */
export function narrowInclusionExclusionData(raw: unknown): InclusionExclusionFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData 가 객체가 아니다');
  const rec = raw as Record<string, unknown>;
  if (rec.type !== 'inclusion-exclusion') throw new Error('initialData.type 이 inclusion-exclusion 이 아니다');
  if (typeof rec.stepMs !== 'number' || !Number.isFinite(rec.stepMs) || rec.stepMs < 0) {
    throw new Error('initialData.stepMs 가 0 이상의 수가 아니다');
  }
  const a = narrowSet(rec.a, 'initialData.a');
  const b = narrowSet(rec.b, 'initialData.b');
  if (a.name === b.name) throw new Error('initialData.a.name 과 b.name 이 같다');
  return { type: 'inclusion-exclusion', stepMs: rec.stepMs, a, b };
}

/** 원소의 정해진 차례 — 글자 차례. */
function byOrder(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

/** A ∪ B 를 정해진 차례로. */
export function unionOf(a: NamedSet, b: NamedSet): string[] {
  const out = [...a.members];
  for (const m of b.members) if (!out.includes(m)) out.push(m);
  return out.sort(byOrder);
}

export async function inclusionExclusion(
  ctx: FacetContext<InclusionExclusionFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<InclusionExclusionFacetData>;
  const data = narrowInclusionExclusionData(rctx.data);
  const { stepMs, a, b } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const elements = unionOf(a, b);
  const inA = elements.map((e) => a.members.includes(e));
  const inB = elements.map((e) => b.members.includes(e));

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      a: { name: a.name, members: [...a.members] },
      b: { name: b.name, members: [...b.members] },
      elements,
      inA,
      inB,
    },
  });

  // 걸음 0 은 원소 아홉이 이미 보이는 화면이라 읽을 틈을 둔다.
  if (!(await pause())) return;

  let total = 0;

  const indicesA = elements.flatMap((_, i) => (inA[i] ? [i] : []));
  total += a.members.length;
  await rctx.emit({
    type: 'addSet',
    payload: { which: 'a', size: a.members.length, indices: indicesA, total },
  });
  if (!(await pause())) return;

  const indicesB = elements.flatMap((_, i) => (inB[i] ? [i] : []));
  total += b.members.length;
  await rctx.emit({
    type: 'addSet',
    payload: { which: 'b', size: b.members.length, indices: indicesB, total },
  });
  if (!(await pause())) return;

  const overlap = elements.flatMap((_, i) => (inA[i] && inB[i] ? [i] : []));
  total -= overlap.length;
  await rctx.emit({
    type: 'subtract',
    payload: { size: overlap.length, indices: overlap, total },
  });
  if (!(await pause())) return;

  let direct = 0;
  for (const _element of elements) {
    if (rctx.cancelled) return;
    direct += 1;
  }
  await rctx.emit({ type: 'direct', payload: { direct, total } });
}
