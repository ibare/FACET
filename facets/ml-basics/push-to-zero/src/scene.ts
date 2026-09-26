import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { axisSpan, countZeros, pullWidth, readPushToZeroData } from './algorithm';

/** 이번 걸음 — 처음 모습이거나 갱신 한 번. */
export type PushToZeroStep =
  | { kind: 'start' }
  | {
      kind: 'update';
      t: number;
      /** 계기값 — 갱신 앞 무게 */
      from: number[];
      /** 데이터 걸음 뒤 */
      half: number[];
      /** L1 끌기 뒤 */
      to: number[];
      /** 무게마다 L1 끌기 몫 */
      l1: number[];
      /** 살아 있는 무게가 끌린 폭 */
      livePull: number;
      /** 이번에 처음 0 에 닿은 무게의 자리 */
      newlyZero: number[];
      /** 갱신 앞부터 0 에 붙어 있던 무게의 자리 */
      held: number[];
    };

export type PushToZeroScene = {
  // 바탕
  ids: string[];
  fitted: number[];
  pull: number;
  span: { lo: number; hi: number };
  // 자취
  t: number;
  w: number[];
  zeroCount: number;
  // 이번 걸음
  step: PushToZeroStep;
};

function numberArray(v: unknown, len: number, path: string): number[] {
  if (!Array.isArray(v) || v.length !== len) {
    throw new Error(`push-to-zero 장면: ${path} 는 길이 ${len} 인 배열이어야 한다`);
  }
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`push-to-zero 장면: ${path}[${i}] 가 유한한 수가 아니다`);
    }
    return x;
  });
}

function reduceUpdate(scene: PushToZeroScene, payload: unknown): PushToZeroScene {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('push-to-zero 장면: update.payload 가 객체가 아니다');
  }
  const p = payload as Record<string, unknown>;
  const n = scene.ids.length;
  if (typeof p.t !== 'number' || p.t !== scene.t + 1) {
    throw new Error(`push-to-zero 장면: update.payload.t 가 ${scene.t + 1} 이 아니다 (${String(p.t)})`);
  }
  const from = numberArray(p.from, n, 'update.payload.from');
  for (let i = 0; i < n; i += 1) {
    if (from[i] !== scene.w[i]) {
      throw new Error(`push-to-zero 장면: update.payload.from[${i}] 가 지금 무게와 다르다`);
    }
  }
  const half = numberArray(p.half, n, 'update.payload.half');
  const to = numberArray(p.to, n, 'update.payload.to');
  const l1 = numberArray(p.l1, n, 'update.payload.l1');
  if (typeof p.livePull !== 'number' || !Number.isFinite(p.livePull)) {
    throw new Error('push-to-zero 장면: update.payload.livePull 이 수가 아니다');
  }
  if (!Array.isArray(p.newlyZero)) {
    throw new Error('push-to-zero 장면: update.payload.newlyZero 가 배열이 아니다');
  }
  const newlyZero = p.newlyZero.map((k, j) => {
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k >= n) {
      throw new Error(`push-to-zero 장면: update.payload.newlyZero[${j}] 가 무게 자리가 아니다`);
    }
    return k;
  });
  if (!Array.isArray(p.held)) {
    throw new Error('push-to-zero 장면: update.payload.held 가 배열이 아니다');
  }
  const held = p.held.map((k, j) => {
    if (typeof k !== 'number' || !Number.isInteger(k) || k < 0 || k >= n) {
      throw new Error(`push-to-zero 장면: update.payload.held[${j}] 가 무게 자리가 아니다`);
    }
    if (scene.w[k] !== 0) {
      throw new Error(`push-to-zero 장면: update.payload.held[${j}] 의 무게가 지금 0 이 아니다`);
    }
    return k;
  });
  if (typeof p.zeroCount !== 'number' || !Number.isInteger(p.zeroCount) || p.zeroCount < scene.zeroCount) {
    throw new Error('push-to-zero 장면: update.payload.zeroCount 가 없거나 줄었다');
  }
  return {
    ids: scene.ids,
    fitted: scene.fitted,
    pull: scene.pull,
    span: scene.span,
    t: p.t,
    w: to.slice(),
    zeroCount: p.zeroCount,
    step: { kind: 'update', t: p.t, from, half, to, l1, livePull: p.livePull, newlyZero, held },
  };
}

export const pushToZeroScene: ScenePlan<PushToZeroScene> = {
  initial(initialData: unknown): PushToZeroScene {
    const data = readPushToZeroData(initialData);
    return {
      ids: data.ids.slice(),
      fitted: data.fitted.slice(),
      pull: pullWidth(data.eta, data.lambda),
      span: axisSpan(data.fitted),
      t: 0,
      w: data.fitted.slice(),
      zeroCount: countZeros(data.fitted),
      step: { kind: 'start' },
    };
  },
  reduce(scene: PushToZeroScene, event: FacetRuntimeEvent): PushToZeroScene {
    switch (event.type) {
      case 'update':
        return reduceUpdate(scene, event.payload);
      default:
        throw new Error(`push-to-zero 장면: 모르는 이벤트 '${event.type}'`);
    }
  },
};
