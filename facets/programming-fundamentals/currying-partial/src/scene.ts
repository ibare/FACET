/**
 * 커링 조각의 장면.
 *
 * 바탕 — 줄 글자 · 담는 이름들 · 칸 수 (init 이 한 번 정한다)
 * 자취 — 담긴 것들(행) · 보인 값들
 * 이번 걸음 — `step`. 흐를 운동의 계기값(어느 행에서 왔는가 · 닫힌 칸 · 인자 글자 자리)을 싣는다
 *
 * 셈은 알고리즘이 했다. 장면은 이벤트를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type CurryLine = { indent: number; text: string };
export type CurrySlot = { param: string; value: string | null };
export type CurryRow = {
  name: string;
  slots: CurrySlot[];
  left: number;
  /** 담긴 것이 함수면 남은 함수의 글자 */
  text: string | null;
  /** 담긴 것이 값이면 그 값 */
  value: string | null;
};

export type CurryStep =
  | { kind: 'start' }
  | { kind: 'bind'; row: number }
  | { kind: 'apply'; row: number; from: number; slot: number; param: string; arg: string; argCol: number; argLen: number }
  | { kind: 'show'; from: number; value: string };

export type CurryingPartialScene = {
  lines: CurryLine[];
  /** 값을 담는 이름들 — 행 자리를 처음부터 정한다 */
  names: string[];
  slotCount: number;
  rows: CurryRow[];
  outputs: string[];
  /** 이번 걸음이 밟은 줄 (0 부터). 시작이면 null */
  line: number | null;
  step: CurryStep;
};

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return typeof v === 'object' && v !== null ? (v as Obj) : null;
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}
function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d;
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function readSlots(v: unknown): CurrySlot[] {
  if (!Array.isArray(v)) return [];
  const out: CurrySlot[] = [];
  for (const x of v) {
    const o = obj(x);
    if (o) out.push({ param: str(o.param), value: strOrNull(o.value) });
  }
  return out;
}

function readLines(v: unknown): CurryLine[] {
  if (!Array.isArray(v)) return [];
  const out: CurryLine[] = [];
  for (const x of v) {
    const o = obj(x);
    if (o) out.push({ indent: num(o.indent), text: str(o.text) });
  }
  return out;
}

function empty(): CurryingPartialScene {
  return { lines: [], names: [], slotCount: 0, rows: [], outputs: [], line: null, step: { kind: 'start' } };
}

export const curryingPartialScene: ScenePlan<CurryingPartialScene> = {
  initial(): CurryingPartialScene {
    return empty();
  },

  reduce(scene: CurryingPartialScene, event: FacetRuntimeEvent): CurryingPartialScene {
    const p = obj(event.payload);
    if (!p) return scene;
    if (event.type === 'init') {
      return {
        ...empty(),
        lines: readLines(p.lines),
        names: Array.isArray(p.names) ? p.names.filter((x): x is string => typeof x === 'string') : [],
        slotCount: num(p.slotCount),
      };
    }
    if (event.type === 'bind' || event.type === 'apply') {
      const row: CurryRow = {
        name: str(p.name),
        slots: readSlots(p.slots),
        left: num(p.left),
        text: strOrNull(p.text),
        value: strOrNull(p.value),
      };
      const rows = [...scene.rows, row];
      const at = rows.length - 1;
      const step: CurryStep =
        event.type === 'bind'
          ? { kind: 'bind', row: at }
          : {
              kind: 'apply',
              row: at,
              from: scene.rows.findIndex((r) => r.name === str(p.from)),
              slot: num(p.slot),
              param: str(p.param),
              arg: str(p.arg),
              argCol: num(p.argCol),
              argLen: num(p.argLen),
            };
      return { ...scene, rows, line: num(p.line), step };
    }
    if (event.type === 'show') {
      const value = str(p.value);
      return {
        ...scene,
        outputs: [...scene.outputs, value],
        line: num(p.line),
        step: { kind: 'show', from: scene.rows.findIndex((r) => r.name === str(p.from)), value },
      };
    }
    return scene;
  },
};
