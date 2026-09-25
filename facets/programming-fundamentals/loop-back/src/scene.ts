/**
 * loop-back 장면.
 *
 * - 바탕: `lines` — 화면 글자와 들여쓰기, 조건 줄인지. initial 이 initialData 에서 값을 베낀다
 * - 자취: `trail` — 밟은 줄의 차례. 줄별 밟은 횟수 · 되돌아간 걸음은 여기서 파생된다.
 *         `vars` — 처음 대입된 차례대로의 변수와 지금 값. `output` — 출력된 줄들
 * - 이번 걸음: `step` — 무엇을 했는지와, 흐름이 어디서 왔는지(`from`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** assigns — 이 줄이 값을 넣는 변수 이름. 변수 칸을 몇 개 둘지 바탕에서 셈하려고 둔다. */
export type LoopBackSceneLine = { indent: number; text: string; cond: boolean; assigns: string | null };

export type LoopBackStep =
  | { act: 'assign'; line: number; from: number | null; name: string; value: number }
  | { act: 'cond'; line: number; from: number | null; cond: boolean }
  | { act: 'show'; line: number; from: number | null; out: string };

export type LoopBackScene = {
  lines: LoopBackSceneLine[];
  trail: number[];
  vars: Array<{ name: string; value: number }>;
  output: string[];
  step: LoopBackStep | null;
};

function narrowLines(data: unknown): LoopBackSceneLine[] {
  if (typeof data !== 'object' || data === null) return [];
  const raw = (data as { lines?: unknown }).lines;
  if (!Array.isArray(raw)) return [];
  const out: LoopBackSceneLine[] = [];
  for (const l of raw) {
    if (typeof l !== 'object' || l === null) continue;
    const { indent, text, stmt } = l as { indent?: unknown; text?: unknown; stmt?: unknown };
    if (typeof indent !== 'number' || typeof text !== 'string') continue;
    const st = typeof stmt === 'object' && stmt !== null ? (stmt as { k?: unknown; to?: unknown }) : {};
    const assigns = st.k === 'assign' && typeof st.to === 'string' ? st.to : null;
    out.push({ indent, text, cond: st.k === 'while', assigns });
  }
  return out;
}

/** 앞 걸음보다 줄 차례가 작은 줄로 간 걸음인가 — 흐름이 거슬러 올라간 걸음. */
export function isBack(trail: readonly number[], at: number): boolean {
  return at > 0 && trail[at]! < trail[at - 1]!;
}

/** trail 의 at 번째 걸음 앞에 거슬러 올라간 걸음이 몇 번 있었나. */
export function backsBefore(trail: readonly number[], at: number): number {
  let n = 0;
  for (let k = 1; k < at; k += 1) if (isBack(trail, k)) n += 1;
  return n;
}

/** trail 의 처음 at+1 걸음에서 줄 line 이 밟힌 횟수. */
export function hitsUpTo(trail: readonly number[], at: number, line: number): number {
  let n = 0;
  for (let k = 0; k <= at && k < trail.length; k += 1) if (trail[k] === line) n += 1;
  return n;
}

export const loopBackScene: ScenePlan<LoopBackScene> = {
  initial(initialData: unknown): LoopBackScene {
    return { lines: narrowLines(initialData), trail: [], vars: [], output: [], step: null };
  },
  reduce(scene: LoopBackScene, event: FacetRuntimeEvent): LoopBackScene {
    if (event.type !== 'step') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) return scene;
    const { line, act } = p as { line?: unknown; act?: unknown };
    if (typeof line !== 'number') return scene;
    const from = scene.trail.length > 0 ? scene.trail[scene.trail.length - 1]! : null;
    const trail = [...scene.trail, line];

    if (act === 'assign') {
      const { name, value } = p as { name?: unknown; value?: unknown };
      if (typeof name !== 'string' || typeof value !== 'number') return scene;
      const has = scene.vars.some((v) => v.name === name);
      const vars = has
        ? scene.vars.map((v) => (v.name === name ? { name, value } : { ...v }))
        : [...scene.vars.map((v) => ({ ...v })), { name, value }];
      return { ...scene, trail, vars, output: [...scene.output], step: { act, line, from, name, value } };
    }
    if (act === 'cond') {
      const { cond } = p as { cond?: unknown };
      if (typeof cond !== 'boolean') return scene;
      return {
        ...scene,
        trail,
        vars: scene.vars.map((v) => ({ ...v })),
        output: [...scene.output],
        step: { act, line, from, cond },
      };
    }
    if (act === 'show') {
      const { out } = p as { out?: unknown };
      if (typeof out !== 'string') return scene;
      return {
        ...scene,
        trail,
        vars: scene.vars.map((v) => ({ ...v })),
        output: [...scene.output, out],
        step: { act, line, from, out },
      };
    }
    return scene;
  },
};
