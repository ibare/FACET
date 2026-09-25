/**
 * map-one-by-one 장면.
 *
 * - 바탕: `lines` — init 이 한 번 정한다
 * - 자취: `lists`(넣기 줄이 세운 목록) · `map`(map 이 채워 가는 새 목록) · `output`
 * - 이번 걸음: `step`
 *
 * 장면은 이벤트만 잇는다. 값의 셈은 알고리즘이 했다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type MapValue = number | number[];

export type MapRun = {
  source: string | null;
  into: string;
  fn: string;
  line: number;
  /** 나온 목록 — 같은 자리에 선다. 아직 안 온 자리는 null */
  outs: (number | null)[];
};

export type MapStep =
  | { kind: 'start' }
  | { kind: 'assign'; line: number; name: string }
  | { kind: 'item'; line: number; index: number; input: number; output: number }
  | { kind: 'show'; line: number };

export type MapOneByOneScene = {
  lines: { indent: number; text: string }[];
  lists: { name: string; values: number[] }[];
  map: MapRun | null;
  output: MapValue | null;
  step: MapStep;
};

function rec(p: unknown): Record<string, unknown> {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function value(v: unknown): MapValue {
  if (Array.isArray(v)) return v.map((x) => num(x));
  return num(v);
}

export const mapOneByOneScene: ScenePlan<MapOneByOneScene> = {
  initial(): MapOneByOneScene {
    return { lines: [], lists: [], map: null, output: null, step: { kind: 'start' } };
  },

  reduce(scene: MapOneByOneScene, event: FacetRuntimeEvent): MapOneByOneScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init': {
        const raw = Array.isArray(p.lines) ? p.lines : [];
        const lines = raw.map((l) => {
          const r = rec(l);
          return { indent: num(r.indent), text: str(r.text) };
        });
        return { lines, lists: [], map: null, output: null, step: { kind: 'start' } };
      }
      case 'assign': {
        const name = str(p.name);
        const v = value(p.value);
        const lists = scene.lists.filter((l) => l.name !== name);
        if (Array.isArray(v)) lists.push({ name, values: v });
        return { ...scene, lists, step: { kind: 'assign', line: num(p.line), name } };
      }
      case 'mapItem': {
        const index = num(p.index);
        const length = num(p.length);
        const into = str(p.into);
        const source = typeof p.source === 'string' ? p.source : null;
        const same = scene.map !== null && scene.map.into === into && scene.map.outs.length === length;
        const base: MapRun = same && scene.map
          ? scene.map
          : {
              source,
              into,
              fn: str(p.fn),
              line: num(p.line),
              outs: Array.from({ length }, () => null),
            };
        const outs = base.outs.slice();
        outs[index] = num(p.output);
        return {
          ...scene,
          map: { ...base, outs },
          step: { kind: 'item', line: num(p.line), index, input: num(p.input), output: num(p.output) },
        };
      }
      case 'show':
        return { ...scene, output: value(p.value), step: { kind: 'show', line: num(p.line) } };
      default:
        return scene;
    }
  },
};
