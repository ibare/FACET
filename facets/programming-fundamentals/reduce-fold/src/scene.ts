/**
 * reduce-fold 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 끝냈다.
 *
 * - 바탕 (init 이 한 번 정한다) : 코드 줄 · 누적값 이름 · 축척
 * - 자취 (걸음이 쌓는다)        : 만든 목록 · 받아들인 원소 수 · 지금 누적값 · 지나온 누적값 · 담긴 이름 · 출력
 * - 이번 걸음 (`step`)          : 무엇이 막 일어났는가 (운동을 고르는 데만 쓴다)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ReduceFoldValue = number | number[];

export type ReduceFoldStep =
  | { kind: 'assign'; line: number; name: string }
  | { kind: 'absorb'; line: number; index: number; x: number; before: number; after: number }
  | { kind: 'show'; line: number; value: ReduceFoldValue };

export type ReduceFoldScene = {
  lines: { indent: number; text: string }[];
  accName: string;
  peak: number;
  /** 만든 목록. 줄 자리는 운동이 어디서 나올지 고르는 데 쓴다 */
  list: { name: string; items: number[]; line: number } | null;
  /** 받아들인 원소 수 (앞에서부터) */
  taken: number;
  /** 지금 누적값. reduce 가 시작되기 전엔 null */
  acc: number | null;
  /** 지금 누적값에 이르기까지 지나온 누적값 (시작값부터) */
  trail: number[];
  /** 누적값을 대입받은 이름 */
  boundTo: string | null;
  outputs: ReduceFoldValue[];
  step: ReduceFoldStep | null;
};

function emptyScene(): ReduceFoldScene {
  return { lines: [], accName: 'total', peak: 1, list: null, taken: 0, acc: null, trail: [], boundTo: null, outputs: [], step: null };
}

function rec(p: unknown): Record<string, unknown> {
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function value(v: unknown): ReduceFoldValue {
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.filter((x): x is number => typeof x === 'number');
  return 0;
}

export const reduceFoldScene: ScenePlan<ReduceFoldScene> = {
  initial: () => emptyScene(),

  reduce(scene: ReduceFoldScene, event: FacetRuntimeEvent): ReduceFoldScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init': {
        const raw = Array.isArray(p.lines) ? p.lines : [];
        const lines = raw.map((l) => {
          const r = rec(l);
          return { indent: num(r.indent), text: str(r.text, '') };
        });
        return { ...emptyScene(), lines, accName: str(p.accName, 'total'), peak: Math.max(1, num(p.peak, 1)) };
      }
      case 'assign': {
        const line = num(p.line);
        const name = str(p.name, '');
        const v = value(p.value);
        const list = Array.isArray(v) ? { name, items: [...v], line } : scene.list;
        return { ...scene, list, step: { kind: 'assign', line, name } };
      }
      case 'absorb': {
        const before = num(p.before);
        const after = num(p.after);
        const index = num(p.index);
        const into = typeof p.into === 'string' ? p.into : null;
        return {
          ...scene,
          taken: index + 1,
          acc: after,
          trail: [...scene.trail, before],
          boundTo: into ?? scene.boundTo,
          step: { kind: 'absorb', line: num(p.line), index, x: num(p.x), before, after },
        };
      }
      case 'show': {
        const v = value(p.value);
        return {
          ...scene,
          outputs: [...scene.outputs, Array.isArray(v) ? [...v] : v],
          step: { kind: 'show', line: num(p.line), value: Array.isArray(v) ? [...v] : v },
        };
      }
      default:
        return scene;
    }
  },
};
