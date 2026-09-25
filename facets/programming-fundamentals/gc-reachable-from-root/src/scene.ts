/**
 * gc-reachable-from-root 의 장면.
 *
 * 바탕(init 이 한 번 정한다) — 뿌리 · 힙에 놓인 차례 · 가리킴
 * 자취(걸음이 쌓는다)       — 표시가 붙은 차례 · 훑은 차례와 그 판정
 * 이번 걸음                  — 시작 · 표시 하나 · 훑음 하나
 *
 * 장면은 이벤트를 이을 뿐 표시를 다시 셈하지 않는다 — 셈은 알고리즘이 했다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type GcSceneRoot = { readonly name: string; readonly to: string };
export type GcSceneEdge = { readonly from: string; readonly to: string };
export type GcSwept = { readonly name: string; readonly kept: boolean };

export type GcStep =
  | { readonly kind: 'start' }
  | {
      readonly kind: 'mark';
      readonly name: string;
      readonly via: string;
      readonly viaRoot: boolean;
      readonly again: readonly GcSceneEdge[];
    }
  | { readonly kind: 'sweep'; readonly name: string; readonly kept: boolean };

export type GcScene = {
  readonly roots: readonly GcSceneRoot[];
  readonly heap: readonly string[];
  readonly edges: readonly GcSceneEdge[];
  /** 표시가 붙은 차례 */
  readonly marked: readonly string[];
  /** 훑은 차례와 판정 */
  readonly swept: readonly GcSwept[];
  readonly step: GcStep | null;
};

/** name 을 가리키는 것들 — 뿌리 이름 먼저, 그다음 객체. 바탕에서 정해진다 */
export function pointersInto(scene: GcScene, name: string): string[] {
  return [
    ...scene.roots.filter((r) => r.to === name).map((r) => r.name),
    ...scene.edges.filter((e) => e.to === name).map((e) => e.from),
  ];
}

/** 지금 표시가 붙어 있는가 — 표시되었고, 훑음이 아직 지우지 않았다 */
export function hasMark(scene: GcScene, name: string): boolean {
  return scene.marked.includes(name) && !scene.swept.some((s) => s.name === name);
}

/** 거둬졌는가 */
export function isReaped(scene: GcScene, name: string): boolean {
  return scene.swept.some((s) => s.name === name && !s.kept);
}

const EMPTY: GcScene = { roots: [], heap: [], edges: [], marked: [], swept: [], step: null };

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function pairs(v: unknown, a: 'name' | 'from'): { a: string; to: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { a: string; to: string }[] = [];
  for (const item of v) {
    const r = rec(item);
    const x = r ? str(r[a]) : null;
    const y = r ? str(r.to) : null;
    if (x !== null && y !== null) out.push({ a: x, to: y });
  }
  return out;
}

export const gcReachableFromRootScene: ScenePlan<GcScene> = {
  initial(): GcScene {
    return EMPTY;
  },
  reduce(scene: GcScene, event: FacetRuntimeEvent): GcScene {
    const p = rec(event.payload);
    if (!p) return scene;
    switch (event.type) {
      case 'init': {
        const heap = Array.isArray(p.heap) ? p.heap.filter((h): h is string => typeof h === 'string') : [];
        return {
          roots: pairs(p.roots, 'name').map((r) => ({ name: r.a, to: r.to })),
          heap,
          edges: pairs(p.edges, 'from').map((e) => ({ from: e.a, to: e.to })),
          marked: [],
          swept: [],
          step: { kind: 'start' },
        };
      }
      case 'mark': {
        const name = str(p.name);
        const via = str(p.via);
        if (name === null || via === null) return scene;
        return {
          ...scene,
          marked: [...scene.marked, name],
          step: {
            kind: 'mark',
            name,
            via,
            viaRoot: p.viaRoot === true,
            again: pairs(p.again, 'from').map((e) => ({ from: e.a, to: e.to })),
          },
        };
      }
      case 'sweep': {
        const name = str(p.name);
        if (name === null) return scene;
        const kept = p.kept === true;
        return {
          ...scene,
          swept: [...scene.swept, { name, kept }],
          step: { kind: 'sweep', name, kept },
        };
      }
      default:
        return scene;
    }
  },
};
