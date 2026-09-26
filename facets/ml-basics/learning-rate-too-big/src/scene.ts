import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowLearningRateTooBigData } from './algorithm.js';

/** 떨어진 자리 하나 — 무게 · 그 자리의 손실 · 바닥에서 떨어진 거리. */
export type Landing = { w: number; loss: number; dist: number };

/** 바탕 — init 이 한 번 정한다. */
export type LearningRateTooBigBase = {
  wLim: number;
  lLim: number;
  /** [w, L] 표본 쌍 */
  curve: ReadonlyArray<readonly [number, number]>;
};

/** 이번 걸음 — 갱신 한 번. 운동의 출발은 from 이 말한다. */
export type LearningRateTooBigStep = {
  kind: 'update';
  k: number;
  g: number;
  move: number;
  from: number;
  to: number;
  lossFrom: number;
  lossTo: number;
  distFrom: number;
  distTo: number;
};

export type LearningRateTooBigScene = {
  eta: number;
  updates: number;
  /** init 전에는 null */
  base: LearningRateTooBigBase | null;
  /** 자취 — 처음 자리부터 떨어진 자리들 */
  landings: readonly Landing[];
  step: LearningRateTooBigStep | null;
};

function field(payload: unknown, key: string, type: string): number {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error(`learningRateTooBigScene: ${type}.payload 가 객체가 아니다`);
  }
  const v = (payload as Record<string, unknown>)[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`learningRateTooBigScene: ${type}.payload.${key} 가 유한한 수가 아니다 (${String(v)})`);
  }
  return v;
}

function curveOf(payload: unknown): Array<readonly [number, number]> {
  const raw = (payload as Record<string, unknown>).curve;
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error('learningRateTooBigScene: init.payload.curve 가 표본 둘 이상의 배열이 아니다');
  }
  return raw.map((pair: unknown, i) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new Error(`learningRateTooBigScene: init.payload.curve[${i}] 가 [w, L] 쌍이 아니다`);
    }
    const [w, l] = pair as unknown[];
    if (typeof w !== 'number' || typeof l !== 'number' || !Number.isFinite(w) || !Number.isFinite(l)) {
      throw new Error(`learningRateTooBigScene: init.payload.curve[${i}] 에 유한하지 않은 수가 있다`);
    }
    return [w, l] as const;
  });
}

export const learningRateTooBigScene: ScenePlan<LearningRateTooBigScene> = {
  initial(initialData: unknown): LearningRateTooBigScene {
    const data = narrowLearningRateTooBigData(initialData);
    return { eta: data.eta, updates: data.updates, base: null, landings: [], step: null };
  },

  reduce(scene: LearningRateTooBigScene, event: FacetRuntimeEvent): LearningRateTooBigScene {
    switch (event.type) {
      case 'init': {
        if (scene.base !== null) throw new Error('learningRateTooBigScene: init 이 두 번 왔다');
        const p = event.payload;
        const wLim = field(p, 'wLim', 'init');
        const lLim = field(p, 'lLim', 'init');
        if (wLim <= 0 || lLim <= 0) {
          throw new Error(`learningRateTooBigScene: init 의 축 범위가 양수가 아니다 (wLim ${wLim}, lLim ${lLim})`);
        }
        const start: Landing = {
          w: field(p, 'w0', 'init'),
          loss: field(p, 'loss0', 'init'),
          dist: field(p, 'dist0', 'init'),
        };
        return {
          ...scene,
          base: { wLim, lLim, curve: curveOf(p) },
          landings: [start],
          step: null,
        };
      }
      case 'update': {
        if (scene.base === null) throw new Error('learningRateTooBigScene: init 전에 update 가 왔다');
        const p = event.payload;
        const step: LearningRateTooBigStep = {
          kind: 'update',
          k: field(p, 'k', 'update'),
          g: field(p, 'g', 'update'),
          move: field(p, 'move', 'update'),
          from: field(p, 'from', 'update'),
          to: field(p, 'to', 'update'),
          lossFrom: field(p, 'lossFrom', 'update'),
          lossTo: field(p, 'lossTo', 'update'),
          distFrom: field(p, 'distFrom', 'update'),
          distTo: field(p, 'distTo', 'update'),
        };
        if (step.k !== scene.landings.length || step.k > scene.updates) {
          throw new Error(
            `learningRateTooBigScene: update.payload.k 가 어긋났다 (${step.k}, 떨어진 자리 ${scene.landings.length}, 갱신 ${scene.updates})`,
          );
        }
        const last = scene.landings[scene.landings.length - 1];
        if (last === undefined || last.w !== step.from) {
          throw new Error(
            `learningRateTooBigScene: update.payload.from 이 지금 자리와 다르다 (${step.from}, 지금 ${String(last?.w)})`,
          );
        }
        if (Math.abs(step.to) > scene.base.wLim) {
          throw new Error(`learningRateTooBigScene: update.payload.to 가 축 밖이다 (${step.to}, 반폭 ${scene.base.wLim})`);
        }
        return {
          ...scene,
          landings: [...scene.landings, { w: step.to, loss: step.lossTo, dist: step.distTo }],
          step,
        };
      }
      default:
        throw new Error(`learningRateTooBigScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
