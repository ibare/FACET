/**
 * fill-to-a-share 장면.
 *
 * 바탕 — init 이 한 번 정한다: p · k · 문맥마다 확률 차례로 선 후보
 * 자취 — 걸음이 쌓는다: 내놓은 문맥 수 · 문맥마다 담은 뒤의 누적들 · 멈췄는가 · top-k 견줌
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type FillCandidate = { token: string; logit: number; prob: number };
export type FillContext = { id: string; sentence: string; ranked: FillCandidate[] };

export type FillStep =
  | { kind: 'show'; c: number }
  | { kind: 'pour'; c: number; i: number; before: number; cum: number; reached: boolean }
  | { kind: 'compare' };

export type FillToAShareScene = {
  p: number;
  k: number;
  contexts: FillContext[];
  /** 내놓은 문맥 수 */
  shown: number;
  /** 문맥마다 — 후보 하나를 담을 때마다 그 뒤의 누적 */
  cums: number[][];
  /** 문맥마다 — p 에 닿아 담기를 멈췄는가 */
  stopped: boolean[];
  /** top-k 였다면 문맥마다 찼을 누적. 견주기 전에는 null */
  topK: number[] | null;
  step: FillStep | null;
};

function empty(): FillToAShareScene {
  return { p: 0, k: 0, contexts: [], shown: 0, cums: [], stopped: [], topK: null, step: null };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** init payload 의 문맥 하나를 거른다. 어긋나면 null. */
function readContext(v: unknown): FillContext | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.id) || !isStr(o.sentence) || !Array.isArray(o.ranked)) return null;
  const ranked: FillCandidate[] = [];
  for (const r of o.ranked as unknown[]) {
    if (typeof r !== 'object' || r === null) return null;
    const rr = r as Record<string, unknown>;
    if (!isStr(rr.token) || !isNum(rr.logit) || !isNum(rr.prob)) return null;
    ranked.push({ token: rr.token, logit: rr.logit, prob: rr.prob });
  }
  return { id: o.id, sentence: o.sentence, ranked };
}

export const fillToAShareScene: ScenePlan<FillToAShareScene> = {
  initial(): FillToAShareScene {
    return empty();
  },
  reduce(scene, event: FacetRuntimeEvent): FillToAShareScene {
    const raw = event.payload;
    if (typeof raw !== 'object' || raw === null) return scene;
    const pl = raw as Record<string, unknown>;
    switch (event.type) {
      case 'init': {
        if (!isNum(pl.p) || !isNum(pl.k) || !Array.isArray(pl.contexts)) return scene;
        const contexts: FillContext[] = [];
        for (const c of pl.contexts as unknown[]) {
          const read = readContext(c);
          if (!read) return scene;
          contexts.push(read);
        }
        return {
          ...empty(),
          p: pl.p,
          k: pl.k,
          contexts,
          cums: contexts.map(() => []),
          stopped: contexts.map(() => false),
        };
      }
      case 'show': {
        const c = pl.c;
        if (!isNum(c)) return scene;
        return { ...scene, shown: Math.max(scene.shown, c + 1), step: { kind: 'show', c } };
      }
      case 'pour': {
        const { c, i, cum, reached } = pl;
        if (!isNum(c) || !isNum(i) || !isNum(cum) || typeof reached !== 'boolean') return scene;
        const prevCums = scene.cums[c] ?? [];
        const before = prevCums.length > 0 ? prevCums[prevCums.length - 1]! : 0;
        const cums = scene.cums.map((list, idx) => (idx === c ? [...list, cum] : [...list]));
        const stopped = scene.stopped.map((s, idx) => (idx === c ? reached : s));
        return { ...scene, cums, stopped, step: { kind: 'pour', c, i, before, cum, reached } };
      }
      case 'compare': {
        const { k, fills } = pl;
        if (!isNum(k) || !Array.isArray(fills) || !(fills as unknown[]).every(isNum)) return scene;
        return { ...scene, k, topK: (fills as number[]).slice(), step: { kind: 'compare' } };
      }
      default:
        return scene;
    }
  },
};
