import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readXorData } from './algorithm.js';

/** 이번 걸음 — 한 바이트에 키스트림 한 바이트가 겹쳤다. */
export type XorStep = {
  kind: 'lock' | 'unlock';
  index: number;
  /** 겹치기 전 바이트 (운동의 출발값) */
  before: number;
  key: number;
  after: number;
  flipped: number;
  same: number;
};

/** 한 바퀴(잠금 · 풀기)의 뒤집힌 비트 합. */
export type PassTotal = { flipped: number; bits: number };

export type XorWithKeystreamScene = {
  // 바탕
  plain: readonly number[];
  key: readonly number[];
  // 자취
  /** 메시지 바이트의 지금 값 — 자리에서 바뀐다 */
  current: readonly number[];
  /** 지금 암호문인 바이트인가 */
  locked: readonly boolean[];
  lockFlips: readonly (number | null)[];
  unlockFlips: readonly (number | null)[];
  lockTotal: PassTotal | null;
  unlockTotal: PassTotal | null;
  // 이번 걸음
  step: XorStep | null;
};

function num(p: Record<string, unknown>, field: string, type: string): number {
  const v = p[field];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`xorWithKeystreamScene: ${type}.payload.${field} 가 정수가 아니다`);
  }
  return v;
}

function readStep(scene: XorWithKeystreamScene, event: FacetRuntimeEvent, kind: 'lock' | 'unlock') {
  const raw = event.payload;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`xorWithKeystreamScene: ${kind}.payload 가 객체가 아니다`);
  }
  const p = raw as Record<string, unknown>;
  const index = num(p, 'index', kind);
  if (index < 0 || index >= scene.plain.length) {
    throw new Error(`xorWithKeystreamScene: ${kind}.payload.index ${index} 가 메시지 밖이다`);
  }
  const before = num(p, 'before', kind);
  if (before !== scene.current[index]) {
    throw new Error(`xorWithKeystreamScene: ${kind}.payload.before 가 지금 바이트와 다르다 (자리 ${index})`);
  }
  const key = num(p, 'key', kind);
  if (key !== scene.key[index]) {
    throw new Error(`xorWithKeystreamScene: ${kind}.payload.key 가 키스트림 바이트와 다르다 (자리 ${index})`);
  }
  const wasLocked = scene.locked[index];
  if (wasLocked === undefined || wasLocked !== (kind === 'unlock')) {
    throw new Error(`xorWithKeystreamScene: ${kind} 가 자리 ${index} 의 지금 상태와 맞지 않는다`);
  }
  const step: XorStep = {
    kind,
    index,
    before,
    key,
    after: num(p, 'after', kind),
    flipped: num(p, 'flipped', kind),
    same: num(p, 'same', kind),
  };
  const total: PassTotal = { flipped: num(p, 'passFlipped', kind), bits: num(p, 'bits', kind) };
  return { step, total };
}

function replaced<T>(list: readonly T[], i: number, v: T): T[] {
  const out = [...list];
  out[i] = v;
  return out;
}

export const xorWithKeystreamScene: ScenePlan<XorWithKeystreamScene> = {
  initial(initialData: unknown): XorWithKeystreamScene {
    const { plain, key } = readXorData(initialData);
    return {
      plain: [...plain],
      key: [...key],
      current: [...plain],
      locked: plain.map(() => false),
      lockFlips: plain.map(() => null),
      unlockFlips: plain.map(() => null),
      lockTotal: null,
      unlockTotal: null,
      step: null,
    };
  },

  reduce(scene: XorWithKeystreamScene, event: FacetRuntimeEvent): XorWithKeystreamScene {
    switch (event.type) {
      case 'lock': {
        const { step, total } = readStep(scene, event, 'lock');
        return {
          ...scene,
          current: replaced(scene.current, step.index, step.after),
          locked: replaced(scene.locked, step.index, true),
          lockFlips: replaced(scene.lockFlips, step.index, step.flipped),
          lockTotal: total,
          step,
        };
      }
      case 'unlock': {
        const { step, total } = readStep(scene, event, 'unlock');
        return {
          ...scene,
          current: replaced(scene.current, step.index, step.after),
          locked: replaced(scene.locked, step.index, false),
          unlockFlips: replaced(scene.unlockFlips, step.index, step.flipped),
          unlockTotal: total,
          step,
        };
      }
      default:
        throw new Error(`xorWithKeystreamScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
