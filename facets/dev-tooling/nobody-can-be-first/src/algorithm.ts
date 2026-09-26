/**
 * nobody-can-be-first — 고리가 있으면 시작할 자리가 없다.
 *
 * ninja · Bazel 꼴. 무엇이든 세우기 전에 요청한 대상에서 깊이 먼저 그래프를 끝까지 읽는다.
 * 입력은 규칙에 적힌 차례로 내려간다. 들어간 대상은 "기다리는 중" 으로 쌓이고, 그 아래 확인이
 * 끝나면 쌓인 데서 빠져 "확인됨" 이 된다. 소스는 걸음을 쓰지 않는다. "기다리는 중" 인 대상에
 * 다시 닿으면 쌓인 것 가운데 그 대상부터 끝까지 + 그 대상이 고리다 — 보고하고 멈춘다.
 * 그래프를 끝까지 읽기 전에는 아무것도 세우지 않으므로 세운 수는 0 으로 남는다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 하나씩):
 *   enter     { name: string; from: string | null }   대상에 들어가 "기다리는 중" 에 쌓는다.
 *                                                      from 은 그 대상을 입력으로 적은 대상 (요청한 대상이면 null)
 *   checked   { name: string }                        그 아래 확인이 끝나 쌓인 데서 빠진다
 *   confirmed { name: string; from: string }          이미 "확인됨" 인 대상에 닿았다 (이 데이터에는 없다)
 *   revisit   { name: string; from: string }          "기다리는 중" 인 대상에 다시 닿았다
 *   report    { cycle: string[]; at: number; built: number }
 *                                                      고리 보고. cycle 은 그 대상부터 끝까지 + 그 대상,
 *                                                      at 은 쌓인 것에서 고리가 시작하는 자리, built 는 세운 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NobodyCanBeFirstRule = { target: string; inputs: string[] };

export type NobodyCanBeFirstFacetData = {
  type: 'nobody-can-be-first';
  stepMs: number;
  /** 규칙 — 대상과 그 입력, 적힌 차례 그대로 */
  rules: NobodyCanBeFirstRule[];
  /** 규칙이 없는 입력 (이미 있는 파일) */
  sources: string[];
  /** 요청한 대상 */
  goal: string;
};

/** 규칙 표를 읽고 모르는 이름을 던진다. */
export function readGraph(data: NobodyCanBeFirstFacetData): {
  rules: Map<string, string[]>;
  sources: Set<string>;
} {
  const rules = new Map<string, string[]>();
  for (const r of data.rules) {
    if (rules.has(r.target)) throw new Error(`nobody-can-be-first: 규칙이 둘인 대상 ${r.target}`);
    rules.set(r.target, [...r.inputs]);
  }
  const sources = new Set(data.sources);
  for (const [target, inputs] of rules) {
    if (sources.has(target)) throw new Error(`nobody-can-be-first: 규칙이 있는 소스 ${target}`);
    for (const i of inputs) {
      if (!rules.has(i) && !sources.has(i)) {
        throw new Error(`nobody-can-be-first: 모르는 입력 ${i} (${target})`);
      }
    }
  }
  if (!rules.has(data.goal)) throw new Error(`nobody-can-be-first: 규칙이 없는 요청 ${data.goal}`);
  return { rules, sources };
}

export async function nobodyCanBeFirst(
  context: FacetContext<NobodyCanBeFirstFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<NobodyCanBeFirstFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const { rules, sources } = readGraph(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const stack: string[] = [];
  const checked = new Set<string>();
  // 그래프를 끝까지 읽기 전에는 세우지 않는다 — 고리를 찾으면 이 수 그대로 보고한다
  const built = 0;

  /** 'stop' 이면 고리를 보고했거나 취소됐다. */
  async function visit(name: string, from: string | null): Promise<'go' | 'stop'> {
    if (sources.has(name)) return 'go';
    if (checked.has(name)) {
      if (from === null) throw new Error(`nobody-can-be-first: 요청한 대상이 이미 확인됨 ${name}`);
      if (!(await pause())) return 'stop';
      await ctx.emit({ type: 'confirmed', payload: { name, from } });
      return 'go';
    }
    const at = stack.indexOf(name);
    if (at >= 0) {
      if (from === null) throw new Error(`nobody-can-be-first: 요청한 대상이 이미 쌓여 있다 ${name}`);
      if (!(await pause())) return 'stop';
      await ctx.emit({ type: 'revisit', payload: { name, from } });
      const cycle = [...stack.slice(at), name];
      if (!(await pause())) return 'stop';
      await ctx.emit({ type: 'report', payload: { cycle, at, built } });
      return 'stop';
    }
    const inputs = rules.get(name);
    if (inputs === undefined) throw new Error(`nobody-can-be-first: 규칙이 없는 대상 ${name}`);
    if (!(await pause())) return 'stop';
    stack.push(name);
    await ctx.emit({ type: 'enter', payload: { name, from } });
    for (const input of inputs) {
      if (ctx.cancelled) return 'stop';
      if ((await visit(input, name)) === 'stop') return 'stop';
    }
    if (!(await pause())) return 'stop';
    stack.pop();
    checked.add(name);
    await ctx.emit({ type: 'checked', payload: { name } });
    return 'go';
  }

  await visit(data.goal, null);
}
