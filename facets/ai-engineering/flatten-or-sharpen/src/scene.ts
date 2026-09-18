/**
 * flatten-or-sharpen 의 장면.
 *
 * 바탕 — 문맥 · 후보 토큰 · 로짓 (init 이 한 번 정한다)
 * 자취 — 거쳐 온 온도마다 한 줄: 온도 · 확률 · 차례 (temper 가 하나씩 쌓는다)
 * 이번 걸음 — 방금 더해진 줄의 번호
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type FlattenOrSharpenBand = {
  t: number;
  /** 표 차례의 확률 */
  probs: number[];
  /** 확률이 큰 차례로 늘어놓은 후보 번호 */
  rank: number[];
};

export type FlattenOrSharpenStep = { kind: 'band'; index: number } | null;

export type FlattenOrSharpenScene = {
  context: string;
  tokens: string[];
  logits: number[];
  bands: FlattenOrSharpenBand[];
  step: FlattenOrSharpenStep;
};

function empty(): FlattenOrSharpenScene {
  return { context: '', tokens: [], logits: [], bands: [], step: null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function numbers(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

function strings(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return null;
    out.push(x);
  }
  return out;
}

export const flattenOrSharpenScene: ScenePlan<FlattenOrSharpenScene> = {
  initial(): FlattenOrSharpenScene {
    return empty();
  },

  reduce(scene: FlattenOrSharpenScene, event: FacetRuntimeEvent): FlattenOrSharpenScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;

    if (event.type === 'init') {
      const tokens = strings(p.tokens);
      const logits = numbers(p.logits);
      if (typeof p.context !== 'string' || !tokens || !logits) return scene;
      return { context: p.context, tokens, logits, bands: [], step: null };
    }

    if (event.type === 'temper') {
      const probs = numbers(p.probs);
      const rank = numbers(p.rank);
      if (typeof p.t !== 'number' || typeof p.index !== 'number' || !probs || !rank) return scene;
      const bands = [...scene.bands, { t: p.t, probs, rank }];
      return { ...scene, bands, step: { kind: 'band', index: bands.length - 1 } };
    }

    return scene;
  },
};
