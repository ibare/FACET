/**
 * who-goes-first — make 꼴 빌드 도구가 요청한 대상에서 깊이 먼저 내려가 세우는 차례.
 *
 * 규칙은 "대상 ← 입력들" 이고 입력은 적힌 차례 그대로 하나씩 끝까지 내려갔다 온다.
 * 규칙이 없는 입력은 소스(이미 있는 파일)라 걸음을 쓰지 않는다. 한 대상의 입력이 모두
 * 서면 그 자리에서 그 대상을 세운다. 이미 선 대상에 다시 닿으면 세우지 않는다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 걸음 하나다)
 *   descend  { target: string; depth: number }
 *            대상 하나가 제 입력을 요구한다 (요구가 한 칸 내려간다)
 *   build    { target: string; order: number }
 *            대상 하나를 세운다. order 는 1 부터 세는 세운 차례
 *   already  { target: string; depth: number }
 *            이미 선 대상에 다시 닿았다 — 세우지 않고 지나간다
 *
 * 규칙에도 소스 목록에도 없는 이름, 내려가는 중인 대상에 다시 닿는 고리는 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type WhoGoesFirstRule = { target: string; inputs: string[] };

export type WhoGoesFirstFacetData = {
  type: 'who-goes-first';
  rules: WhoGoesFirstRule[];
  sources: string[];
  goal: string;
  stepMs: number;
};

/** 규칙 표를 대상 → 입력 목록으로. 모르는 입력 이름 · 겹친 대상은 던진다. */
export function ruleMap(rules: readonly WhoGoesFirstRule[], sources: readonly string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const rule of rules) {
    if (map.has(rule.target)) throw new Error(`who-goes-first: 대상 ${rule.target} 의 규칙이 둘이다`);
    if (sources.includes(rule.target)) throw new Error(`who-goes-first: ${rule.target} 가 대상이면서 소스다`);
    map.set(rule.target, [...rule.inputs]);
  }
  for (const rule of rules) {
    for (const input of rule.inputs) {
      if (!map.has(input) && !sources.includes(input)) {
        throw new Error(`who-goes-first: 모르는 입력 ${input} (${rule.target})`);
      }
    }
  }
  return map;
}

/**
 * 요청한 대상에서 닿는 이름들을 층으로 나눈다. 층은 요청한 대상에서 가장 긴 거리,
 * 한 층 안의 차례는 깊이 먼저 처음 만난 차례(입력은 적힌 차례). 소스도 포함한다.
 * 그림이 자리를 셈하는 바탕이다 — 고리는 던진다.
 */
export function graphLayers(
  rules: readonly WhoGoesFirstRule[],
  sources: readonly string[],
  goal: string,
): string[][] {
  const map = ruleMap(rules, sources);
  if (!map.has(goal)) throw new Error(`who-goes-first: 요청한 대상 ${goal} 의 규칙이 없다`);
  const seen: string[] = [];
  const level = new Map<string, number>();
  const onPath = new Set<string>();
  const walk = (name: string, depth: number): void => {
    if (onPath.has(name)) throw new Error(`who-goes-first: 고리 ${name}`);
    if (!seen.includes(name)) seen.push(name);
    const was = level.get(name);
    if (was === undefined || depth > was) level.set(name, depth);
    const inputs = map.get(name);
    if (inputs === undefined) return;
    onPath.add(name);
    for (const input of inputs) walk(input, depth + 1);
    onPath.delete(name);
  };
  walk(goal, 0);
  const layers: string[][] = [];
  for (const name of seen) {
    const lv = level.get(name);
    if (lv === undefined) throw new Error(`who-goes-first: ${name} 의 층을 셈하지 못했다`);
    while (layers.length <= lv) layers.push([]);
    const row = layers[lv];
    if (row === undefined) throw new Error(`who-goes-first: 층 ${lv} 가 없다`);
    row.push(name);
  }
  return layers;
}

export async function whoGoesFirst(ctx: FacetContext<WhoGoesFirstFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<WhoGoesFirstFacetData>;
  const { rules, sources, goal, stepMs } = rctx.data;
  const map = ruleMap(rules, sources);
  if (!map.has(goal)) throw new Error(`who-goes-first: 요청한 대상 ${goal} 의 규칙이 없다`);

  const state = new Map<string, 'visiting' | 'built'>();
  let builtCount = 0;

  // 걸음 0 이 이미 규칙 그래프를 보이므로 첫 발신 앞에도 stepMs 를 둔다.
  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  async function visit(name: string, depth: number): Promise<boolean> {
    if (sources.includes(name)) return true; // 소스는 이미 있다 — 걸음을 쓰지 않는다
    const inputs = map.get(name);
    if (inputs === undefined) throw new Error(`who-goes-first: 모르는 이름 ${name}`);
    const st = state.get(name);
    if (st === 'built') {
      if (!(await pause())) return false;
      await rctx.emit({ type: 'already', payload: { target: name, depth } });
      return true;
    }
    if (st === 'visiting') throw new Error(`who-goes-first: 고리 ${name}`);
    state.set(name, 'visiting');
    if (!(await pause())) return false;
    await rctx.emit({ type: 'descend', payload: { target: name, depth } });
    for (const input of inputs) {
      if (rctx.cancelled) return false;
      if (!(await visit(input, depth + 1))) return false;
    }
    state.set(name, 'built');
    builtCount += 1;
    if (!(await pause())) return false;
    await rctx.emit({ type: 'build', payload: { target: name, order: builtCount } });
    return true;
  }

  await visit(goal, 0);
}
