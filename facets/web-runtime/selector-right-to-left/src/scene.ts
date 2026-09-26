/**
 * selector-right-to-left 의 장면.
 *
 * 바탕 — 문서(initialData 에서 베낀다) · 단순 선택자 · 후보 (silent init 이 채운다)
 * 자취 — 지금까지의 견줌 · 후보마다의 판정
 * 지금 — 두 자리: 선택자 안의 읽는 자리와 문서 안의 보는 자리 (node -1 = 뿌리 너머)
 * 이번 걸음 — 두 자리가 어디서 왔는지(from) 를 함께 싣는다. 그림이 그 거리만큼 흘린다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneNode = { tag: string; cls: string[]; id: string | null; parent: number | null };

export type Verdict = 'match' | 'none';

export type Compared = { cand: number; part: number; node: number; hit: boolean };

/** 두 자리. node 가 -1 이면 뿌리 위로 벗어난 자리다. */
export type Cursor = { cand: number; part: number; node: number };

export type SelectorStep =
  | { kind: 'compare'; hit: boolean; verdict: Verdict | null; from: Cursor | null }
  | { kind: 'pastRoot'; from: Cursor | null };

export type SelectorScene = {
  nodes: SceneNode[];
  parts: string[];
  candidates: number[];
  trail: Compared[];
  verdicts: { cand: number; verdict: Verdict }[];
  cursor: Cursor | null;
  step: SelectorStep | null;
};

function readNodes(raw: unknown): SceneNode[] {
  if (!Array.isArray(raw)) return [];
  const out: SceneNode[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.tag !== 'string') continue;
    out.push({
      tag: o.tag,
      cls: Array.isArray(o.cls) ? o.cls.filter((c): c is string => typeof c === 'string') : [],
      id: typeof o.id === 'string' ? o.id : null,
      parent: typeof o.parent === 'number' ? o.parent : null,
    });
  }
  return out;
}

function numbers(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === 'number') : [];
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

export const selectorRightToLeftScene: ScenePlan<SelectorScene> = {
  initial(initialData: unknown): SelectorScene {
    const d = typeof initialData === 'object' && initialData !== null
      ? (initialData as Record<string, unknown>)
      : {};
    return {
      nodes: readNodes(d.dom),
      parts: [],
      candidates: [],
      trail: [],
      verdicts: [],
      cursor: null,
      step: null,
    };
  },

  reduce(scene: SelectorScene, event: FacetRuntimeEvent): SelectorScene {
    const p = typeof event.payload === 'object' && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : {};

    if (event.type === 'init') {
      return {
        ...scene,
        parts: strings(p.parts),
        candidates: numbers(p.candidates),
        trail: [],
        verdicts: [],
        cursor: null,
        step: null,
      };
    }

    if (event.type === 'compare') {
      if (typeof p.cand !== 'number' || typeof p.part !== 'number'
        || typeof p.node !== 'number' || typeof p.hit !== 'boolean') return scene;
      const verdict: Verdict | null = p.verdict === 'match' || p.verdict === 'none' ? p.verdict : null;
      const cursor: Cursor = { cand: p.cand, part: p.part, node: p.node };
      return {
        ...scene,
        trail: [...scene.trail, { cand: p.cand, part: p.part, node: p.node, hit: p.hit }],
        verdicts: verdict === null ? scene.verdicts : [...scene.verdicts, { cand: p.cand, verdict }],
        cursor,
        step: { kind: 'compare', hit: p.hit, verdict, from: scene.cursor },
      };
    }

    if (event.type === 'pastRoot') {
      if (typeof p.cand !== 'number' || typeof p.part !== 'number') return scene;
      return {
        ...scene,
        verdicts: [...scene.verdicts, { cand: p.cand, verdict: 'none' }],
        cursor: { cand: p.cand, part: p.part, node: -1 },
        step: { kind: 'pastRoot', from: scene.cursor },
      };
    }

    return scene;
  },
};
