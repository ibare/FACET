/**
 * 몇 개만 다시 보기 — 장면.
 *
 * 바탕   base      init 이 한 번 정한다 (질의 · 1차 차례의 후보 · N)
 * 자취   lifted    문턱을 넘은 후보 (1차 차례)
 *        scores    맞대어 본 차례대로 쌓인 [식별자, 재순위 점수]
 *        order     지금 왼쪽부터 선 차례 (가로 자리 = 등수)
 *        facing    지금 질의와 맞대어 있는 후보
 * 이번   step      이번 걸음이 무엇이었는지와 운동의 계기값
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LookCloselyAtFewCard = { id: string; text: string; first: number };

export type LookCloselyAtFewBase = {
  query: string;
  /** 1차 등수 차례. */
  cards: LookCloselyAtFewCard[];
  n: number;
};

export type LookCloselyAtFewStep =
  | { kind: 'init' }
  | { kind: 'cut'; picked: string[] }
  /** was = 앞 걸음에서 질의와 맞대어 있던 후보 (제자리로 돌아간다). */
  | { kind: 'score'; id: string; score: number; was: string | null }
  /** from = 다시 서기 전의 차례. */
  | { kind: 'reorder'; from: string[]; was: string | null };

export type LookCloselyAtFewScene = {
  base: LookCloselyAtFewBase | null;
  lifted: string[];
  scores: Array<[string, number]>;
  order: string[];
  facing: string | null;
  step: LookCloselyAtFewStep | null;
};

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function finite(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** init payload 의 후보 — 모양이 맞는 원소만 남긴다. */
function cardsOf(v: unknown): LookCloselyAtFewCard[] {
  if (!Array.isArray(v)) return [];
  const out: LookCloselyAtFewCard[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const r = x as Record<string, unknown>;
    const first = finite(r.first);
    if (typeof r.id !== 'string' || typeof r.text !== 'string' || first === null) continue;
    out.push({ id: r.id, text: r.text, first });
  }
  return out;
}

export const lookCloselyAtFewScene: ScenePlan<LookCloselyAtFewScene> = {
  initial(): LookCloselyAtFewScene {
    return { base: null, lifted: [], scores: [], order: [], facing: null, step: null };
  },

  reduce(scene, event: FacetRuntimeEvent): LookCloselyAtFewScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'init': {
        const byId = new Map(cardsOf(p.candidates).map((c) => [c.id, c]));
        const cards: LookCloselyAtFewCard[] = [];
        for (const id of strings(p.order)) {
          const c = byId.get(id);
          if (c) cards.push({ id: c.id, text: c.text, first: c.first });
        }
        const query = typeof p.query === 'string' ? p.query : '';
        const n = finite(p.n) ?? 0;
        return {
          base: { query, cards, n },
          lifted: [],
          scores: [],
          order: cards.map((c) => c.id),
          facing: null,
          step: { kind: 'init' },
        };
      }
      case 'cut': {
        const picked = strings(p.picked);
        return { ...scene, lifted: picked, step: { kind: 'cut', picked } };
      }
      case 'score': {
        const score = finite(p.score);
        if (typeof p.id !== 'string' || score === null) return scene;
        const id = p.id;
        return {
          ...scene,
          scores: [...scene.scores, [id, score]],
          facing: id,
          step: { kind: 'score', id, score, was: scene.facing },
        };
      }
      case 'reorder': {
        const top = strings(p.order);
        const rest = scene.order.filter((id) => !top.includes(id));
        return {
          ...scene,
          order: [...top, ...rest],
          facing: null,
          step: { kind: 'reorder', from: [...scene.order], was: scene.facing },
        };
      }
      default:
        return scene;
    }
  },
};
