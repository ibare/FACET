/**
 * cut-the-tail 의 장면.
 *
 * 바탕 — init 이 한 번 정한다: 문맥 · 후보 · 로짓 · 전체 확률 · 차례 · k · u
 * 자취 — 걸음이 쌓는다: 자르기(cut) · 다시 나누기(renorm) · 뽑기(draw)
 * 이번 걸음 — step: 방금 일어난 일의 종류
 *
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type CutTheTailBase = {
  context: string;
  tokens: readonly string[];
  logits: readonly number[];
  /** 전체 소프트맥스 확률 (표의 차례) */
  probs: readonly number[];
  /** 확률 큰 차례의 후보 번호 */
  order: readonly number[];
  k: number;
  u: number;
};

export type CutTheTailCut = {
  kept: readonly number[];
  dropped: readonly number[];
  droppedMass: number;
};

export type CutTheTailRenorm = {
  probs: readonly number[];
  gained: readonly number[];
};

export type CutTheTailDraw = {
  u: number;
  cumulative: readonly number[];
  picked: number;
};

export type CutTheTailStep = 'init' | 'cut' | 'renormalize' | 'draw' | null;

export type CutTheTailScene = {
  base: CutTheTailBase | null;
  cut: CutTheTailCut | null;
  renorm: CutTheTailRenorm | null;
  draw: CutTheTailDraw | null;
  step: CutTheTailStep;
};

/** 유한한 수만 받는다. 어긋나면 null */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 전부 유한한 수인 배열만 받는다. 어긋나면 null */
function nums(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    const n = num(x);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/** 전부 문자열인 배열만 받는다. 어긋나면 null */
function strs(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.every((x) => typeof x === 'string') ? (v as string[]).slice() : null;
}

function rec(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

export const cutTheTailScene: ScenePlan<CutTheTailScene> = {
  initial(): CutTheTailScene {
    return { base: null, cut: null, renorm: null, draw: null, step: null };
  },
  reduce(scene, event: FacetRuntimeEvent): CutTheTailScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init': {
        const tokens = strs(p.tokens);
        const logits = nums(p.logits);
        const probs = nums(p.probs);
        const order = nums(p.order);
        const k = num(p.k);
        const u = num(p.u);
        if (
          typeof p.context !== 'string' ||
          !tokens || !logits || !probs || !order || k === null || u === null
        ) {
          return scene;
        }
        return {
          base: { context: p.context, tokens, logits, probs, order, k, u },
          cut: null,
          renorm: null,
          draw: null,
          step: 'init',
        };
      }
      case 'cut': {
        const kept = nums(p.kept);
        const dropped = nums(p.dropped);
        const droppedMass = num(p.droppedMass);
        if (!kept || !dropped || droppedMass === null) return scene;
        return { ...scene, cut: { kept, dropped, droppedMass }, step: 'cut' };
      }
      case 'renormalize': {
        const probs = nums(p.probs);
        const gained = nums(p.gained);
        if (!probs || !gained) return scene;
        return { ...scene, renorm: { probs, gained }, step: 'renormalize' };
      }
      case 'draw': {
        const u = num(p.u);
        const cumulative = nums(p.cumulative);
        const picked = num(p.picked);
        if (u === null || !cumulative || picked === null) return scene;
        return { ...scene, draw: { u, cumulative, picked }, step: 'draw' };
      }
      default:
        return scene;
    }
  },
};
