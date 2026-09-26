/**
 * 두 트리가 만난다 — 장면.
 *
 * 바탕: DOM 줄(앞 차례) · CSSOM 규칙. initial() 이 initialData 에서 세운다.
 * 자취: 요소마다 운명(아직 · 들어감 · 빠짐 · 밟지 않고 빠짐) · 붙은 규칙 · 렌더 트리 줄.
 * 이번 걸음: step — 무엇을 밟았고 어디로 갔나.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { flattenDom, readTwoTreesMeetData } from './algorithm';

export type DomRow = { name: string; depth: number; parent: number | null };
export type RuleRow = { selector: string; decl: string; origin: 'ua' | 'author' };
export type Fate = 'pending' | 'in' | 'out' | 'skipped';
export type RenderRow = { el: number; parent: number | null; depth: number };

export type TwoTreesMeetStep =
  | { kind: 'visit'; el: number; rules: number[]; parent: number | null }
  | { kind: 'drop'; el: number; rules: number[]; skipped: number[] };

export type TwoTreesMeetScene = {
  dom: DomRow[];
  rules: RuleRow[];
  fate: Fate[];
  /** 요소마다 붙은 규칙 번호 (밟지 않았으면 빈 배열) */
  attached: number[][];
  /** 렌더 트리 — 들어온 차례가 곧 렌더 트리의 앞 차례 */
  render: RenderRow[];
  step: TwoTreesMeetStep | null;
};

function readIndex(v: unknown, limit: number, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= limit) {
    throw new Error(`${what} 번호가 틀렸다: ${String(v)}`);
  }
  return v;
}

function readIndexList(v: unknown, limit: number, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`${what} 목록이 배열이 아니다`);
  return v.map((x: unknown) => readIndex(x, limit, what));
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`${event.type} 의 payload 가 없다`);
  return p as Record<string, unknown>;
}

export const twoTreesMeetScene: ScenePlan<TwoTreesMeetScene> = {
  initial(initialData: unknown): TwoTreesMeetScene {
    const data = readTwoTreesMeetData(initialData);
    const flat = flattenDom(data.dom);
    return {
      dom: flat.map((e) => ({ name: e.name, depth: e.depth, parent: e.parent })),
      rules: data.rules.map((r) => ({ selector: r.selector, decl: r.decl, origin: r.origin })),
      fate: flat.map((): Fate => 'pending'),
      attached: flat.map(() => []),
      render: [],
      step: null,
    };
  },

  reduce(scene: TwoTreesMeetScene, event: FacetRuntimeEvent): TwoTreesMeetScene {
    if (event.type !== 'visit' && event.type !== 'drop') return scene;
    const p = payloadOf(event);
    const n = scene.dom.length;
    const el = readIndex(p.el, n, '요소');
    const rules = readIndexList(p.rules, scene.rules.length, '규칙');
    const attached = scene.attached.map((a, i) => (i === el ? [...rules] : a));

    if (event.type === 'visit') {
      let parent: number | null;
      let depth: number;
      if (p.parent === null) {
        if (scene.render.length > 0) throw new Error('렌더 트리에 뿌리가 둘 생긴다');
        parent = null;
        depth = 0;
      } else {
        parent = readIndex(p.parent, n, '부모');
        const up = scene.render.find((r) => r.el === parent);
        if (!up) throw new Error(`부모 ${parent} 가 아직 렌더 트리에 없다`);
        depth = up.depth + 1;
      }
      return {
        ...scene,
        fate: scene.fate.map((f, i): Fate => (i === el ? 'in' : f)),
        attached,
        render: [...scene.render, { el, parent, depth }],
        step: { kind: 'visit', el, rules: [...rules], parent },
      };
    }

    const skipped = readIndexList(p.skipped, n, '자손');
    return {
      ...scene,
      fate: scene.fate.map((f, i): Fate => (i === el ? 'out' : skipped.includes(i) ? 'skipped' : f)),
      attached,
      step: { kind: 'drop', el, rules: [...rules], skipped: [...skipped] },
    };
  },
};
