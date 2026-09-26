/**
 * only-what-changed — 소스 하나를 고친 뒤 다시 빌드할 때 무엇을 다시 세우고 무엇을 그대로 쓰는가.
 *
 * 모형: 규칙은 "대상 ← 입력들". 지난번 빌드 결과가 대상 모두에 있다. 고친 소스는 데이터가 준다
 * (어떻게 알아냈는지는 이 조각이 말하지 않는다). 대상을 들여다보는 차례는 "입력이 모두 앞에 오는
 * 차례 가운데, 여럿이 가능하면 규칙의 데이터 차례가 앞선 것" 이다. 입력 가운데 바뀐 것이 하나라도
 * 있으면 다시 세우고 그 대상도 바뀐 것이 된다. 없으면 지난번 결과를 그대로 둔다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (규칙 · 소스 · 지난번 결과). 걸음 0 에 이미
 * 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 *
 * 이벤트 (silent 없음):
 *   edit     { sources: string[] }                 고친 소스를 표시한다. 한 걸음
 *   keep     { target: string }                    들여다본 대상의 입력이 모두 그대로 — 지난번 결과를 둔다
 *   rebuild  { target: string; hit: string[] }     바뀐 입력(hit, 데이터 차례)이 있어 다시 세운다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type OnlyWhatChangedRule = { target: string; inputs: string[] };

export type OnlyWhatChangedFacetData = {
  type: 'only-what-changed';
  stepMs: number;
  rules: OnlyWhatChangedRule[];
  sources: string[];
  edited: string[];
};

/** 규칙이 모형에 맞는지 본다. 모르는 입력 · 빈 입력 · 겹친 이름은 던진다 (C6). */
export function checkRules(rules: readonly OnlyWhatChangedRule[], sources: readonly string[]): void {
  const targets = new Set<string>();
  for (const r of rules) {
    if (targets.has(r.target)) throw new Error(`only-what-changed: 대상 ${r.target} 의 규칙이 둘이다`);
    if (sources.includes(r.target)) throw new Error(`only-what-changed: ${r.target} 은 소스이자 대상이다`);
    targets.add(r.target);
  }
  for (const r of rules) {
    if (r.inputs.length === 0) throw new Error(`only-what-changed: 대상 ${r.target} 에 입력이 없다`);
    for (const i of r.inputs) {
      if (!targets.has(i) && !sources.includes(i)) {
        throw new Error(`only-what-changed: 모르는 입력 ${i} (대상 ${r.target})`);
      }
    }
  }
}

/**
 * 들여다보는 차례 — 입력이 모두 앞에 놓인 대상 가운데 데이터 차례가 앞선 것을 하나씩 뽑는다.
 * 뽑을 것이 없는데 남은 대상이 있으면 고리다 — 던진다.
 */
export function inspectionOrder(rules: readonly OnlyWhatChangedRule[], sources: readonly string[]): string[] {
  checkRules(rules, sources);
  const placed = new Set<string>(sources);
  const remaining = rules.map((r) => r);
  const order: string[] = [];
  while (remaining.length > 0) {
    const at = remaining.findIndex((r) => r.inputs.every((i) => placed.has(i)));
    if (at < 0) throw new Error(`only-what-changed: 고리 — ${remaining.map((r) => r.target).join(', ')}`);
    const [picked] = remaining.splice(at, 1);
    if (picked === undefined) throw new Error('only-what-changed: 뽑은 대상이 비었다');
    order.push(picked.target);
    placed.add(picked.target);
  }
  return order;
}

/** 깊이 — 소스는 0, 대상은 입력 가운데 가장 깊은 것 + 1. 그림이 층을 정할 때 쓴다. */
export function depthOf(rules: readonly OnlyWhatChangedRule[], sources: readonly string[]): Map<string, number> {
  const order = inspectionOrder(rules, sources);
  const depth = new Map<string, number>();
  for (const s of sources) depth.set(s, 0);
  for (const name of order) {
    const rule = rules.find((r) => r.target === name);
    if (rule === undefined) throw new Error(`only-what-changed: 규칙 없는 대상 ${name}`);
    let deepest = -1;
    for (const i of rule.inputs) {
      const d = depth.get(i);
      if (d === undefined) throw new Error(`only-what-changed: 깊이를 모르는 입력 ${i}`);
      deepest = Math.max(deepest, d);
    }
    depth.set(name, deepest + 1);
  }
  return depth;
}

export async function onlyWhatChanged(context: FacetContext<OnlyWhatChangedFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<OnlyWhatChangedFacetData>;
  const { rules, sources, edited, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const order = inspectionOrder(rules, sources);
  for (const s of edited) {
    if (!sources.includes(s)) throw new Error(`only-what-changed: 고친 ${s} 는 소스가 아니다`);
  }

  // 걸음 0 을 읽을 틈을 두고 고침을 표시한다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'edit', payload: { sources: [...edited] } });

  const changed = new Set<string>(edited);
  for (const target of order) {
    if (!(await pause())) return;
    const rule = rules.find((r) => r.target === target);
    if (rule === undefined) throw new Error(`only-what-changed: 규칙 없는 대상 ${target}`);
    const hit = rule.inputs.filter((i) => changed.has(i));
    if (hit.length > 0) {
      changed.add(target);
      await ctx.emit({ type: 'rebuild', payload: { target, hit } });
    } else {
      await ctx.emit({ type: 'keep', payload: { target } });
    }
  }
}
