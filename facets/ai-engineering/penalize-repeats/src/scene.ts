/**
 * 되풀이 벌점의 장면.
 *
 * 바탕 — init 이 한 번 정한다: 앞 문맥 · 후보 · 처음 로짓 · θ, 그리고 같은 식으로 셈한
 *        깎인 값(`cutTo`)과 거꾸로 나눴을 때의 값(`wrongTo`). 그림이 축척을 걸음 내내
 *        고정하려면 끝값을 처음부터 알아야 한다.
 * 자취 — 깎인 후보(`cut`), 지금 1등(`top`), 확률을 보일 때인지(`probs`).
 * 이번 걸음 — `step`.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { dividedAlways, penalized, softmax } from './algorithm.js';

export type PenalizeRepeatsBase = {
  context: string[];
  tokens: string[];
  logits: number[];
  theta: number;
  /** 벌점을 받으면 갈 값 */
  cutTo: number[];
  /** 부호를 안 가르고 나눴다면 갈 값 — 로짓이 음수일 때만 뜻이 있다 */
  wrongTo: number[];
};

export type PenalizeRepeatsStep =
  | { kind: 'start' }
  | { kind: 'cut'; i: number }
  | { kind: 'pick'; i: number; was: number };

export type PenalizeRepeatsScene = {
  base: PenalizeRepeatsBase | null;
  cut: boolean[];
  top: number;
  /** 'fresh' — 지금 로짓에서 셈한 확률, 'stale' — 로짓이 바뀌어 아직 다시 셈하지 않았다 */
  probs: 'fresh' | 'stale';
  step: PenalizeRepeatsStep | null;
};

/** 지금 로짓 — 깎인 후보는 깎인 값. */
export function currentLogits(s: PenalizeRepeatsScene): number[] {
  if (!s.base) return [];
  const b = s.base;
  return b.logits.map((z, i) => (s.cut[i] ? b.cutTo[i]! : z));
}

/** 지금 확률. */
export function currentProbs(s: PenalizeRepeatsScene): number[] {
  return softmax(currentLogits(s));
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function index(payload: unknown): number | null {
  const p = payload as { i?: unknown } | undefined;
  return typeof p?.i === 'number' ? p.i : null;
}

export const penalizeRepeatsScene: ScenePlan<PenalizeRepeatsScene> = {
  initial(): PenalizeRepeatsScene {
    return { base: null, cut: [], top: 0, probs: 'fresh', step: null };
  },
  reduce(scene, event: FacetRuntimeEvent): PenalizeRepeatsScene {
    if (event.type === 'init') {
      const p = event.payload as
        | { context?: unknown; tokens?: unknown; logits?: unknown; theta?: unknown; top?: unknown }
        | undefined;
      const tokens = strings(p?.tokens);
      const logits = numbers(p?.logits);
      const theta = typeof p?.theta === 'number' ? p.theta : 1;
      if (tokens.length === 0 || tokens.length !== logits.length) return scene;
      const base: PenalizeRepeatsBase = {
        context: strings(p?.context),
        tokens,
        logits,
        theta,
        cutTo: logits.map((z) => penalized(z, theta)),
        wrongTo: logits.map((z) => dividedAlways(z, theta)),
      };
      return {
        base,
        cut: tokens.map(() => false),
        top: typeof p?.top === 'number' ? p.top : 0,
        probs: 'fresh',
        step: { kind: 'start' },
      };
    }
    if (!scene.base) return scene;
    if (event.type === 'penalize') {
      const i = index(event.payload);
      if (i === null) return scene;
      const cut = [...scene.cut];
      cut[i] = true;
      return { ...scene, cut, probs: 'stale', step: { kind: 'cut', i } };
    }
    if (event.type === 'pick') {
      const i = index(event.payload);
      if (i === null) return scene;
      return {
        ...scene,
        cut: [...scene.cut],
        top: i,
        probs: 'fresh',
        step: { kind: 'pick', i, was: scene.top },
      };
    }
    return scene;
  },
};
