/**
 * bayes-update 장면.
 *
 * 바탕  — 가설 둘(공 수) · 뽑을 공의 차례. initial 이 initialData 에서 한 번 베낀다.
 * 자취  — 지금 믿음(합 1) · 곱한 뒤의 무게(곱하는 박자에만) · 드러난 뽑기 수 ·
 *         첫 가설 쪽 믿음이 지나온 값들.
 * 이번 걸음 — step. 운동의 출발값(before)을 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowBayesData, type BallColor, type Frac } from './algorithm.js';

export type Pair = [Frac, Frac];

export type BayesStep =
  | { kind: 'prior' }
  | { kind: 'multiply'; draw: number; before: Pair }
  | { kind: 'normalize'; draw: number; before: Pair; total: Frac };

export type BayesScene = {
  hyps: { id: string; white: number; black: number }[];
  draws: BallColor[];
  /** 마지막으로 합 1 에 맞춘 믿음 */
  belief: Pair;
  /** 곱하는 박자에만 있다 — 믿음 × 가능도 */
  weights: Pair | null;
  likelihood: Pair | null;
  total: Frac | null;
  /** 드러난 뽑기 수 */
  drawn: number;
  /** 첫 가설 쪽 믿음 — 사전과 고칠 때마다의 사후 */
  trace: Frac[];
  step: BayesStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function readFrac(x: unknown, path: string): Frac {
  if (!isRecord(x) || typeof x.n !== 'number' || typeof x.d !== 'number' || x.d <= 0) {
    throw new Error(`bayes-update 장면: ${path} 는 분수여야 한다`);
  }
  return { n: x.n, d: x.d };
}

function readPair(x: unknown, path: string): Pair {
  if (!Array.isArray(x) || x.length !== 2) {
    throw new Error(`bayes-update 장면: ${path} 는 분수 둘이어야 한다`);
  }
  return [readFrac(x[0], `${path}[0]`), readFrac(x[1], `${path}[1]`)];
}

function readDraw(p: Record<string, unknown>, scene: BayesScene, type: string): number {
  if (typeof p.draw !== 'number' || !Number.isInteger(p.draw)) {
    throw new Error(`bayes-update 장면: ${type}.payload.draw 가 정수가 아니다`);
  }
  if (p.draw < 0 || p.draw >= scene.draws.length) {
    throw new Error(`bayes-update 장면: ${type}.payload.draw ${p.draw} 는 뽑기 차례 밖이다`);
  }
  return p.draw;
}

function copyPair(p: Pair): Pair {
  return [{ ...p[0] }, { ...p[1] }];
}

export const bayesUpdateScene: ScenePlan<BayesScene> = {
  initial(initialData: unknown): BayesScene {
    const data = narrowBayesData(initialData);
    const [a, b] = data.hypotheses;
    return {
      hyps: data.hypotheses.map((h) => ({ id: h.id, white: h.white, black: h.black })),
      draws: [...data.draws],
      belief: [{ ...a.prior }, { ...b.prior }],
      weights: null,
      likelihood: null,
      total: null,
      drawn: 0,
      trace: [{ ...a.prior }],
      step: { kind: 'prior' },
    };
  },

  reduce(scene: BayesScene, event: FacetRuntimeEvent): BayesScene {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`bayes-update 장면: ${event.type}.payload 가 없다`);

    if (event.type === 'multiply') {
      const draw = readDraw(p, scene, 'multiply');
      if (scene.weights !== null) {
        throw new Error('bayes-update 장면: 나누기 전에 다시 곱하려 한다');
      }
      if (draw !== scene.drawn) {
        throw new Error(`bayes-update 장면: multiply.payload.draw ${draw} 는 다음 차례 ${scene.drawn} 가 아니다`);
      }
      if (p.color !== scene.draws[draw]) {
        throw new Error(`bayes-update 장면: multiply.payload.color 가 draws[${draw}] 와 다르다`);
      }
      return {
        ...scene,
        weights: readPair(p.weights, 'multiply.payload.weights'),
        likelihood: readPair(p.likelihood, 'multiply.payload.likelihood'),
        total: readFrac(p.total, 'multiply.payload.total'),
        drawn: draw + 1,
        trace: scene.trace.map((f) => ({ ...f })),
        belief: copyPair(scene.belief),
        step: { kind: 'multiply', draw, before: copyPair(scene.belief) },
      };
    }

    if (event.type === 'normalize') {
      const draw = readDraw(p, scene, 'normalize');
      if (scene.weights === null) {
        throw new Error('bayes-update 장면: 곱하지 않은 믿음을 나누려 한다');
      }
      if (draw !== scene.drawn - 1) {
        throw new Error(`bayes-update 장면: normalize.payload.draw ${draw} 는 방금 곱한 차례가 아니다`);
      }
      const total = readFrac(p.total, 'normalize.payload.total');
      if (scene.total === null || total.n !== scene.total.n || total.d !== scene.total.d) {
        throw new Error('bayes-update 장면: normalize.payload.total 이 곱한 무게의 합과 다르다');
      }
      const posterior = readPair(p.posterior, 'normalize.payload.posterior');
      return {
        ...scene,
        belief: posterior,
        weights: null,
        likelihood: null,
        total: null,
        trace: [...scene.trace.map((f) => ({ ...f })), { ...posterior[0] }],
        step: { kind: 'normalize', draw, before: copyPair(scene.weights), total },
      };
    }

    throw new Error(`bayes-update 장면: 모르는 이벤트 ${event.type}`);
  },
};
