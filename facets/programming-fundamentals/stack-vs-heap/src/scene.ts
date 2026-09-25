import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 스택과 힙의 장면.
 *
 * - 바탕: `lines` — 프로그램 글자 (initialData 에서 값으로 베낀다)
 * - 자취: `frames` · `heap` · `out` — 걸음이 끝난 뒤의 모습. 알고리즘이 셈해 보낸 것을 잇기만 한다
 * - 이번 걸음: `step` — 무슨 걸음인지와 그 인자. `fromLine` 은 앞 걸음의 줄(읽는 자리가 어디서 왔나)
 */

export type SceneVal = { k: 'num'; n: number } | { k: 'addr'; a: number } | { k: 'null' };
export type SceneSlot = { name: string; addr: number; value: SceneVal | null };
export type SceneFrame = { fn: string; slots: SceneSlot[] };
export type SceneCell = { addr: number; value: SceneVal | null };
export type SceneLine = { indent: number; text: string };

type StepBase = { line: number; fromLine: number | null };
export type StackVsHeapStep =
  | (StepBase & { kind: 'call'; fn: string; args: SceneVal[] })
  | (StepBase & { kind: 'assign'; name: string; value: SceneVal; alloc: number | null; stood: boolean })
  | (StepBase & { kind: 'store'; addr: number; value: SceneVal; from: string | null; stood: boolean })
  | (StepBase & { kind: 'return'; value: SceneVal; stood: boolean })
  | (StepBase & { kind: 'finish'; name: string; value: SceneVal; was: SceneFrame })
  | (StepBase & { kind: 'show'; value: SceneVal; hops: { addr: number; value: SceneVal }[]; stood: boolean });

export type StackVsHeapScene = {
  lines: SceneLine[];
  frames: SceneFrame[];
  heap: SceneCell[];
  out: SceneVal[];
  step: StackVsHeapStep | null;
};

function rec(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : null;
}

function num(x: unknown): number {
  return typeof x === 'number' ? x : 0;
}

function str(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function list(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function val(x: unknown): SceneVal | null {
  const r = rec(x);
  if (!r) return null;
  if (r.k === 'num' && typeof r.n === 'number') return { k: 'num', n: r.n };
  if (r.k === 'addr' && typeof r.a === 'number') return { k: 'addr', a: r.a };
  if (r.k === 'null') return { k: 'null' };
  return null;
}

function valOr(x: unknown): SceneVal {
  return val(x) ?? { k: 'null' };
}

function frame(x: unknown): SceneFrame {
  const r = rec(x);
  return {
    fn: str(r?.fn),
    slots: list(r?.slots).map((s) => {
      const o = rec(s);
      return { name: str(o?.name), addr: num(o?.addr), value: val(o?.value) };
    }),
  };
}

function cells(x: unknown): SceneCell[] {
  return list(x).map((c) => {
    const o = rec(c);
    return { addr: num(o?.addr), value: val(o?.value) };
  });
}

function readLines(data: unknown): SceneLine[] {
  return list(rec(data)?.lines).map((l) => {
    const o = rec(l);
    return { indent: num(o?.indent), text: str(o?.text) };
  });
}

export const stackVsHeapScene: ScenePlan<StackVsHeapScene> = {
  initial(initialData: unknown): StackVsHeapScene {
    return { lines: readLines(initialData), frames: [], heap: [], out: [], step: null };
  },

  reduce(scene: StackVsHeapScene, event: FacetRuntimeEvent): StackVsHeapScene {
    const p = rec(event.payload);
    if (!p) throw new Error(`${event.type}: payload 가 없다`);
    const base = {
      lines: scene.lines,
      frames: list(p.frames).map(frame),
      heap: cells(p.heap),
      out: list(p.out).map(valOr),
    };
    if (event.type === 'init') return { ...base, step: null };
    const at: StepBase = { line: num(p.line), fromLine: scene.step ? scene.step.line : null };
    const stood = p.stood === true;
    switch (event.type) {
      case 'call':
        return { ...base, step: { ...at, kind: 'call', fn: str(p.fn), args: list(p.args).map(valOr) } };
      case 'assign':
        return {
          ...base,
          step: {
            ...at,
            kind: 'assign',
            name: str(p.name),
            value: valOr(p.value),
            alloc: typeof p.alloc === 'number' ? p.alloc : null,
            stood,
          },
        };
      case 'store':
        return {
          ...base,
          step: {
            ...at,
            kind: 'store',
            addr: num(p.addr),
            value: valOr(p.value),
            from: typeof p.from === 'string' ? p.from : null,
            stood,
          },
        };
      case 'return':
        return { ...base, step: { ...at, kind: 'return', value: valOr(p.value), stood } };
      case 'finish':
        return { ...base, step: { ...at, kind: 'finish', name: str(p.name), value: valOr(p.value), was: frame(p.was) } };
      case 'show':
        return {
          ...base,
          step: {
            ...at,
            kind: 'show',
            value: valOr(p.value),
            hops: list(p.hops).map((h) => {
              const o = rec(h);
              return { addr: num(o?.addr), value: valOr(o?.value) };
            }),
            stood,
          },
        };
      default:
        throw new Error(`모르는 이벤트: ${event.type}`);
    }
  },
};
