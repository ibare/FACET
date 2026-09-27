/**
 * 큰 수의 법칙의 장면.
 *
 * 바탕 — 참값(앞면 확률)과 보는 던진 수 수열. `initial()` 이 initialData 에서 세운다.
 * 자취 — 지금까지의 던지기 · 던진 수마다의 비율 · 끝난 구간마다의 흔들림의 폭.
 * 이번 걸음 — 방금 던진 구간의 번호.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readLawOfLargeNumbersData, type Fraction } from './algorithm.js';

export type LawOfLargeNumbersInterval = {
  from: number;
  to: number;
  /** 이 구간 안에서 |비율 − 참값| 의 가장 큰 값 */
  width: number;
  /** to 까지의 앞면 수 */
  heads: number;
  ratio: number;
  diff: number;
};

export type LawOfLargeNumbersScene = {
  p: Fraction;
  checkpoints: number[];
  intervals: LawOfLargeNumbersInterval[];
  /** faces[n − 1] = n 번째 던지기 (1 앞면 · 0 뒷면) */
  faces: number[];
  /** ratios[n − 1] = n 번 던졌을 때의 앞면 비율 */
  ratios: number[];
  step: { kind: 'toss'; index: number } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`lawOfLargeNumbersScene: toss.payload.${key} 가 수가 아니다`);
  }
  return v;
}

function nums(payload: Record<string, unknown>, key: string, length: number): number[] {
  const v = payload[key];
  if (!Array.isArray(v) || v.length !== length) {
    throw new Error(`lawOfLargeNumbersScene: toss.payload.${key} 는 길이 ${length} 의 배열이어야 한다`);
  }
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`lawOfLargeNumbersScene: toss.payload.${key}[${i}] 가 수가 아니다`);
    }
    return x;
  });
}

function reduceToss(scene: LawOfLargeNumbersScene, raw: unknown): LawOfLargeNumbersScene {
  if (!isRecord(raw)) {
    throw new Error('lawOfLargeNumbersScene: toss.payload 가 객체가 아니다');
  }
  const payload = raw;
  const index = num(payload, 'index');
  const from = num(payload, 'from');
  const to = num(payload, 'to');
  const expectIndex = scene.intervals.length + 1;
  if (index !== expectIndex) {
    throw new Error(`lawOfLargeNumbersScene: toss.payload.index ${index} — 다음 걸음은 ${expectIndex}`);
  }
  const expectTo = scene.checkpoints[index];
  if (expectTo === undefined) {
    throw new Error(`lawOfLargeNumbersScene: toss.payload.index ${index} 가 던진 수 수열 밖이다`);
  }
  if (from !== scene.ratios.length + 1 || to !== expectTo) {
    throw new Error(
      `lawOfLargeNumbersScene: toss.payload.from · to (${from} · ${to}) 가 장면(${scene.ratios.length + 1} · ${expectTo})과 맞지 않다`,
    );
  }
  const length = to - from + 1;
  const faces = nums(payload, 'faces', length);
  const ratios = nums(payload, 'ratios', length);
  faces.forEach((f, i) => {
    if (f !== 0 && f !== 1) throw new Error(`lawOfLargeNumbersScene: toss.payload.faces[${i}] 가 0 · 1 이 아니다`);
  });
  const interval: LawOfLargeNumbersInterval = {
    from,
    to,
    width: num(payload, 'width'),
    heads: num(payload, 'heads'),
    ratio: num(payload, 'ratio'),
    diff: num(payload, 'diff'),
  };
  return {
    p: { ...scene.p },
    checkpoints: scene.checkpoints.slice(),
    intervals: [...scene.intervals.map((v) => ({ ...v })), interval],
    faces: [...scene.faces, ...faces],
    ratios: [...scene.ratios, ...ratios],
    step: { kind: 'toss', index },
  };
}

export const lawOfLargeNumbersScene: ScenePlan<LawOfLargeNumbersScene> = {
  initial(initialData: unknown): LawOfLargeNumbersScene {
    const data = readLawOfLargeNumbersData(initialData);
    return {
      p: { ...data.headsProbability },
      checkpoints: data.checkpoints.slice(),
      intervals: [],
      faces: [],
      ratios: [],
      step: null,
    };
  },
  reduce(scene: LawOfLargeNumbersScene, event: FacetRuntimeEvent): LawOfLargeNumbersScene {
    switch (event.type) {
      case 'toss':
        return reduceToss(scene, event.payload);
      default:
        throw new Error(`lawOfLargeNumbersScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
