import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowEnergyData, type EnergySplit } from './algorithm.js';

/** 바탕 — initialData 에서 한 번 정해진다 */
export type EnergyBase = {
  incoming: number;
  f0: number;
  rho: number;
  angles: number[];
};

/** 이번 걸음 — fromDeg 는 앞 걸음의 들어오는 각 (첫 가름이면 null) */
export type EnergyStep = { kind: 'split'; index: number; fromDeg: number | null };

export type EnergyScene = {
  base: EnergyBase;
  /** 자취 — 지금까지 가른 각마다의 몫. 마지막이 지금 화면이다 */
  trail: EnergySplit[];
  step: EnergyStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`energy-conserving scene: ${path} — ${why}`);
}

function amount(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(`payload.${key}`, `0 이상의 유한한 수가 아니다 (${String(v)})`);
  return v;
}

export const energyConservingScene: ScenePlan<EnergyScene> = {
  initial(initialData: unknown): EnergyScene {
    const d = narrowEnergyData(initialData);
    return {
      base: { incoming: d.incoming, f0: d.f0, rho: d.rho, angles: [...d.angles] },
      trail: [],
      step: null,
    };
  },

  reduce(scene: EnergyScene, event: FacetRuntimeEvent): EnergyScene {
    switch (event.type) {
      case 'split': {
        const raw = event.payload;
        if (typeof raw !== 'object' || raw === null) fail('payload', '객체가 아니다');
        const p = raw as Record<string, unknown>;
        const index = p.index;
        if (typeof index !== 'number' || !Number.isInteger(index)) fail('payload.index', '정수가 아니다');
        if (index !== scene.trail.length) fail('payload.index', `차례가 어긋났다 (기대 ${scene.trail.length}, 받음 ${index})`);
        const expected = scene.base.angles[index];
        if (expected === undefined) fail('payload.index', `바탕의 각 목록 밖이다 (${index})`);
        const deg = p.deg;
        if (typeof deg !== 'number' || deg !== expected) fail('payload.deg', `바탕의 각과 다르다 (기대 ${expected}, 받음 ${String(deg)})`);
        const split: EnergySplit = {
          index,
          deg,
          specular: amount(p, 'specular'),
          inward: amount(p, 'inward'),
          diffuse: amount(p, 'diffuse'),
          absorbed: amount(p, 'absorbed'),
          out: amount(p, 'out'),
        };
        const last = scene.trail[scene.trail.length - 1];
        return {
          base: scene.base,
          trail: [...scene.trail, split],
          step: { kind: 'split', index, fromDeg: last === undefined ? null : last.deg },
        };
      }
      default:
        throw new Error(`energy-conserving scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
