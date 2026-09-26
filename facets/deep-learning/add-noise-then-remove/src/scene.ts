/**
 * add-noise-then-remove 의 장면.
 *
 * 바탕 — 원본 자리 x₀ 와 잡음 자리 ε (initialData 에서 베낀다).
 *   t 0 의 몫과 칸은 알고리즘이 silent `init` 으로 보내 걸음 0 을 갈아 끼운다.
 * 자취 — 지나온 t 마다 두 몫 (원본의 몫 · 잡음의 몫) 의 점.
 * 지금 — 섞인 모습(mix) 또는 되돌린 모습(revert).
 * 이번 걸음 — 운동의 출발점을 계기값으로 싣는다 (`from`).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowAddNoiseThenRemoveData } from './algorithm.js';

export type MixState = {
  tIndex: number;
  alphaBar: number;
  signal: number;
  noise: number;
  sumSquares: number;
  signalParts: number[];
  noiseParts: number[];
  values: number[];
};

export type RevertState = {
  from: MixState;
  removed: number;
  divisor: number;
  afterRemove: number[];
  recovered: number[];
  maxGap: number;
  /** 되돌린 칸의 몫 */
  after: { signal: number; noise: number };
};

export type SharePoint = { tIndex: number; signal: number; noise: number };

export type AddNoiseThenRemoveScene = {
  origin: number[];
  noise: number[];
  trail: SharePoint[];
  now: null | { kind: 'mix'; mix: MixState } | { kind: 'revert'; revert: RevertState };
  step: null | { kind: 'mix'; from: MixState } | { kind: 'revert' };
};

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`add-noise-then-remove 장면: ${key} 가 유한한 수가 아니다`);
  }
  return v;
}

function list(p: Record<string, unknown>, key: string, length: number): number[] {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== length) {
    throw new Error(`add-noise-then-remove 장면: ${key} 가 칸 ${length} 개의 배열이 아니다`);
  }
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`add-noise-then-remove 장면: ${key}[${i}] 가 유한한 수가 아니다`);
    }
    return x;
  });
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p: unknown = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`add-noise-then-remove 장면: ${event.type} 의 payload 가 객체가 아니다`);
  }
  return p as Record<string, unknown>;
}

function mixOf(p: Record<string, unknown>, n: number): MixState {
  return {
    tIndex: num(p, 'tIndex'),
    alphaBar: num(p, 'alphaBar'),
    signal: num(p, 'signal'),
    noise: num(p, 'noise'),
    sumSquares: num(p, 'sumSquares'),
    signalParts: list(p, 'signalParts', n),
    noiseParts: list(p, 'noiseParts', n),
    values: list(p, 'values', n),
  };
}

function shareOf(p: Record<string, unknown>, key: string): { signal: number; noise: number } {
  const v = p[key];
  if (typeof v !== 'object' || v === null) {
    throw new Error(`add-noise-then-remove 장면: ${key} 가 객체가 아니다`);
  }
  const o = v as Record<string, unknown>;
  return { signal: num(o, 'signal'), noise: num(o, 'noise') };
}

export const addNoiseThenRemoveScene: ScenePlan<AddNoiseThenRemoveScene> = {
  initial(initialData: unknown): AddNoiseThenRemoveScene {
    const data = narrowAddNoiseThenRemoveData(initialData);
    return {
      origin: data.origin.slice(),
      noise: data.noise.slice(),
      trail: [],
      now: null,
      step: null,
    };
  },

  reduce(scene: AddNoiseThenRemoveScene, event: FacetRuntimeEvent): AddNoiseThenRemoveScene {
    const n = scene.origin.length;
    if (event.type === 'init') {
      const mix = mixOf(payloadOf(event), n);
      return {
        origin: scene.origin,
        noise: scene.noise,
        trail: [{ tIndex: mix.tIndex, signal: mix.signal, noise: mix.noise }],
        now: { kind: 'mix', mix },
        step: null,
      };
    }
    if (event.type === 'mix') {
      if (scene.now === null || scene.now.kind !== 'mix') {
        throw new Error('add-noise-then-remove 장면: 걸음 0 이 없거나 되돌린 뒤에 섞으려 한다');
      }
      const mix = mixOf(payloadOf(event), n);
      return {
        origin: scene.origin,
        noise: scene.noise,
        trail: [...scene.trail, { tIndex: mix.tIndex, signal: mix.signal, noise: mix.noise }],
        now: { kind: 'mix', mix },
        step: { kind: 'mix', from: scene.now.mix },
      };
    }
    if (event.type === 'revert') {
      if (scene.now === null || scene.now.kind !== 'mix') {
        throw new Error('add-noise-then-remove 장면: 섞인 것이 없거나 이미 되돌렸다');
      }
      const p = payloadOf(event);
      const revert: RevertState = {
        from: scene.now.mix,
        removed: num(p, 'removed'),
        divisor: num(p, 'divisor'),
        afterRemove: list(p, 'afterRemove', n),
        recovered: list(p, 'recovered', n),
        maxGap: num(p, 'maxGap'),
        after: shareOf(p, 'after'),
      };
      return {
        origin: scene.origin,
        noise: scene.noise,
        trail: scene.trail,
        now: { kind: 'revert', revert },
        step: { kind: 'revert' },
      };
    }
    throw new Error(`add-noise-then-remove 장면: 모르는 이벤트 ${event.type}`);
  },
};
